import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import timedelta

# ==========================================
# 6. 模块 C: 国债曲线与期限结构
# ==========================================
def render_module_c(df_raw):
    """
    C模块: 国债曲线与期限结构
    逻辑:
    1. 绝对利率 (Level): 低 = 松 (Risk-On) | 高 = 紧
    2. 期限利差 (Slope): MID_BEST 逻辑 (适度正斜率最好，倒挂或过陡都扣分)
    """
    df = df_raw.copy()
    required_cols = ['DGS10', 'DGS2', 'DGS30', 'T10Y2Y', 'T10Y3M']
    if df.dropna(subset=required_cols).empty:
        st.warning("C模块数据不足（国债利率/期限结构），请稍后刷新。")
        return
    df = df.dropna(subset=required_cols)

    def prev_week_row(frame, days=7):
        target = frame.index[-1] - pd.Timedelta(days=days)
        idx = frame.index.get_indexer([target], method='nearest')[0]
        return frame.iloc[idx]

    # --- 1. 因子计算 ---
    # 1.1 绝对利率得分 (越低越好 -> 宽松)
    # 使用过去5年(1260天)的分位数排名反转
    def get_level_score(series):
        return series.rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100

    df['Score_10Y'] = get_level_score(df['DGS10'])
    df['Score_2Y'] = get_level_score(df['DGS2'])
    df['Score_30Y'] = get_level_score(df['DGS30'])

    # 1.2 曲线斜率得分 (MID_BEST 逻辑)
    # 目标: 50bps (0.5%), 容忍带: +/- 150bps
    def get_slope_score(series, target=0.5, tolerance=1.5):
        # 计算距离目标的绝对偏差
        deviation = (series - target).abs()
        # 归一化: 偏差越大，分数越低。
        # 简单线性衰减模型: Score = 100 - (deviation / tolerance * 80)
        score = 100 - (deviation / tolerance * 80) 
        return score.clip(0, 100)

    df['Score_Curve_2s10s'] = get_slope_score(df['T10Y2Y'], target=0.5, tolerance=1.5) # 10Y-2Y
    df['Score_Curve_3m10s'] = get_slope_score(df['T10Y3M'], target=0.75, tolerance=2.0) # 10Y-3M

    # --- 2. 综合得分 ---
    # 权重: 曲线形态(利差)通常比绝对水平更能预测衰退/复苏
    df['Total_Score1'] = (
        df['Score_Curve_2s10s'] * 0.30 + 
        df['Score_Curve_3m10s'] * 0.30 +
        df['Score_10Y'] * 0.20 +
        df['Score_2Y'] * 0.10 +
        df['Score_30Y'] * 0.10
    )

    # 10Y/30Y 双重动量惩罚
    
    slope_10 = df['DGS10'].diff(60)
    slope_30 = df['DGS30'].diff(60)
    
    df['Max_Slope'] = pd.concat([slope_10, slope_30], axis=1).max(axis=1)
    
    def get_slope_penalty(s):
        # s = 60天内利率上涨了多少bp
        if s > 0.50: return 0.2
        elif s > 0.30: return 0.6 
        elif s > 0.15: return 0.8
        else: return 1.0

    df['Penalty_Factor'] = df['Max_Slope'].apply(get_slope_penalty)

    # 最终分 = 基础分(Part 1) * 斜率惩罚系数
    df['Total_Score'] = df['Total_Score1'] * df['Penalty_Factor']

    # --- 3. 页面展示 ---
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    prev_week = prev_week_row(df)
    pf = latest['Penalty_Factor']
    ms = latest['Max_Slope']

    if pf < 1.0:
        if pf == 0.2:
            lvl, col = "🔴 红色极危 (CRITICAL)", "error"
        elif pf == 0.6:
            lvl, col = "🟠 橙色警戒 (WARNING)", "warning"
        else:
            lvl, col = "🟡 黄色提示 (NOTICE)", "info"

        st.error(f"""
        **{lvl}** | **触发动量惩罚机制**
        * **原因**: 10Y/30Y 美债收益率在60天内快速拉升 **+{ms*100:.1f} bps**。
        * **后果**: 基础得分被打 **{pf*10:.0f} 折**。
        * **建议**: 利率急涨杀估值，请注意回避高久期资产。
        """)
    else:
        st.success(f"🟢 **动量监测正常**: 长端利率走势平稳 (60天最大变动: {ms*100:.1f} bps)")

    # KPI 卡片
    c1, c2, c3, c4 = st.columns(4)
    score_color = "#09ab3b" if latest['Total_Score'] > 50 else "#ff2b2b"
    
    c1.markdown(f"""
        <div class="metric-card">
        <div class="metric-label">C模块综合得分 (日频)</div>
        <div class="metric-value" style="color: {score_color}">{latest['Total_Score']:.1f}</div>
        <div class="metric-label">vs上周: {latest['Total_Score'] - prev_week['Total_Score']:.1f}</div>
        </div>
    """, unsafe_allow_html=True)

    c2.metric("10Y 基准利率", f"{latest['DGS10']:.2f}%", f"{(latest['DGS10']-prev_week['DGS10'])*100:.0f} bps(vs上周)", delta_color="inverse")
    
    # 利差颜色逻辑: 倒挂(负数)为红
    spread_2s10s = latest['T10Y2Y']
    s_color = "normal" if spread_2s10s > 0 else "inverse"
    c3.metric("10Y-2Y 关键利差", f"{spread_2s10s:.2f}%", f"{(spread_2s10s-prev_week['T10Y2Y'])*100:.0f} bps(vs上周)", delta_color=s_color)
    
    c4.metric("30Y 长端利率", f"{latest['DGS30']:.2f}%", f"{(latest['DGS30']-prev_week['DGS30'])*100:.0f} bps(vs上周)", delta_color="inverse")

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("##### 🧩 因子细分得分")
    
    s1, s2, s3, s4, s5 = st.columns(5)
    def sub_card(label, val):
        col = "#09ab3b" if val > 50 else "#ff2b2b"
        return f"""<div class="sub-card"><div class="sub-label">{label}</div><div class="sub-value" style="color:{col}">{val:.1f}</div></div>"""
    
    s1.markdown(sub_card("10Y-2Y 形态 (30%)", latest['Score_Curve_2s10s']), unsafe_allow_html=True)
    s2.markdown(sub_card("10Y-3M 形态 (30%)", latest['Score_Curve_3m10s']), unsafe_allow_html=True)
    s3.markdown(sub_card("10Y 水平 (20%)", latest['Score_10Y']), unsafe_allow_html=True)
    s4.markdown(sub_card("2Y 水平 (10%)", latest['Score_2Y']), unsafe_allow_html=True)
    s5.markdown(sub_card("30Y 水平 (10%)", latest['Score_30Y']), unsafe_allow_html=True)

    st.divider()

    # --- 图表区 ---
    # 布局改为：上面两个小图，下面一个大长图
    col_chart1, col_chart2 = st.columns(2)

    # 图1: 全期限曲线 (Snapshot)
    with col_chart1:
        fig_curve = go.Figure()
        
        # 1. 定义全期限列表 (X轴)
        terms_label = ['1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y']
        # 2. 对应的列名
        terms_col = ['DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS3', 'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30']
        
        # 3. 提取当前数据
        current_rates = [latest.get(col, None) for col in terms_col]
        
        # 4. 绘制当前曲线
        fig_curve.add_trace(go.Scatter(
            x=terms_label, 
            y=current_rates, 
            mode='lines+markers', 
            name='当前曲线 (Now)', 
            line=dict(color='#0068c9', width=3, shape='spline'), 
            marker=dict(size=8)
        ))
        
        # 5. 绘制对比曲线 (1个月前)
        try:
            ago_idx = df.index.get_loc(latest.name - timedelta(days=30), method='nearest')
            ago_row = df.iloc[ago_idx]
            ago_rates = [ago_row.get(col, None) for col in terms_col]
            
            fig_curve.add_trace(go.Scatter(
                x=terms_label, 
                y=ago_rates, 
                mode='lines+markers', 
                name='1个月前 (Last Month)', 
                line=dict(color='#a0a0a0', width=2, dash='dot', shape='spline'),
                opacity=0.6
            ))
        except:
            pass

        fig_curve.update_layout(
            title="🇺🇸 美债全期限收益率曲线 (Full Yield Curve)", 
            height=350,
            yaxis_title="Yield (%)", 
            hovermode="x unified",
            paper_bgcolor='rgba(0,0,0,0)', 
            plot_bgcolor='rgba(0,0,0,0)',
            xaxis=dict(title="Maturity")
        )
        st.plotly_chart(fig_curve, use_container_width=True)

    # 图2: 10Y-2Y 历史走势 (倒挂监测)
    with col_chart2:
        df_view = df[df.index >= '2020-01-01']
        fig_spread = go.Figure()
        
        # 绘制 0轴
        fig_spread.add_hline(y=0, line_color="black", line_width=1)
        
        # 倒挂区域填红
        fig_spread.add_trace(go.Scatter(x=df_view.index, y=df_view['T10Y2Y'], name='10Y-2Y Spread',
                                      line=dict(color='#333'), fill='tozeroy', 
                                      fillcolor='rgba(9, 171, 59, 0.2)')) # 默认为绿
        
        # 添加红色倒挂部分
        fig_spread.add_hrect(y0=-2, y1=0, fillcolor="red", opacity=0.1, line_width=0, annotation_text="倒挂警示区 (衰退)")
        
        fig_spread.update_layout(title="10Y-2Y 关键利差趋势", height=350,
                               yaxis_title="Spread (%)", hovermode="x unified",
                               paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
        st.plotly_chart(fig_spread, use_container_width=True)

    # [新增] 图3: US Rates 历史走势 (仿 MacroMicro)
    st.markdown("### US Rates: 全期限 利率历史走势")
    
    # 准备绘图数据 (只取最近3年，避免图太密)
    df_trend = df[df.index >= '2021-01-01'].copy()
    
    # 使用 Plotly Express 快速画多线图
    fig_trend = px.line(df_trend, x=df_trend.index, 
                        y=['DGS30', 'DGS10', 'DGS5', 'DGS2', 'DGS3MO'],
                        color_discrete_map={
                            "DGS30": "#1f77b4",  # 深蓝
                            "DGS10": "#00CC96",  # 青绿
                            "DGS5":  "#AB63FA",  # 紫色
                            "DGS2":  "#FFA15A",  # 橙色
                            "DGS3MO":"#EF553B"   # 红色
                        })
    
    fig_trend.update_layout(
        title="",
        height=400,
        xaxis_title="",
        yaxis_title="Yield (%)",
        hovermode="x unified",
        legend=dict(orientation="h", y=1.1, x=0.5, xanchor="center"),
        paper_bgcolor='rgba(0,0,0,0)', 
        plot_bgcolor='rgba(0,0,0,0)'
    )
    st.plotly_chart(fig_trend, use_container_width=True)

    # 百科
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📚 C模块：因子专业定义与量化逻辑 (点击展开)", expanded=False):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
            <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
            <div class="glossary-content">
                C模块关注资金的时间价值与经济预期。算法包含三种逻辑：<br>
                <b>1. 绝对水平 (Level)：</b> 采用 <b>Percentile Rank</b>。名义利率越高，融资成本越贵，得分越低。<br>
                <b>2. 曲线形态 (Slope) - MID_BEST模型：</b> 曲线并非越陡越好。
                <br>&nbsp;&nbsp; <b>目标 (Target)</b>：利差 +50bps (0.5%) 视为最健康的“复苏/温和增长”形态。
                <br>&nbsp;&nbsp; <b>倒挂 (Inverted)</b>：利差 < 0，预示衰退，严重扣分。
                <br>&nbsp;&nbsp; <b>过陡 (Steep)</b>：利差 > 150bps，预示通胀失控或期限溢价过高，同样扣分。<br>
                <b>3. 动态惩罚 (Momentum Penalty) ：</b>
                <br>&nbsp;&nbsp; <b>逻辑</b>：利率的变化速度往往比绝对位置更致命。若长端利率在短期（60天）内暴涨，即便绝对水平尚可，也会引发资产定价的“休克”（杀估值）。
                <br>&nbsp;&nbsp; <b>机制</b>：监测 10Y/30Y 的 60天动量。若快速上行 (>30-50bps)，模型会自动触发 <b>0.2~0.8x 的折扣惩罚</b>，以反映市场的脆弱性。
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">1. 10Y-2Y 利差 (The Yield Curve) - 权重 30%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 10年期利率减去2年期利率。<br>
                <span class="glossary-label">专业解读：</span> 全球第一的<b>“衰退预警指标”</b>。它反映了短端政策利率与长端增长预期的博弈。
            </div>
            <div class="logic-row">
                <span class="bullish">适度正斜率 (0-150bps) = 🟢 利好 (经济健康复苏)</span>
                <span class="bearish">负值倒挂 (<0bps) = 🔴 衰退预警 (央行紧缩过头)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">2. 10Y-3M 利差 (Near-Term Forward Spread) - 权重 30%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 10年期利率减去3个月利率。<br>
                <span class="glossary-label">专业解读：</span> 相比10Y-2Y，美联储更看重这个指标。它直接对比了“当下现金成本”与“长期投资回报”。如果3个月利息比10年还高，银行放贷动力枯竭，信贷周期终结。
            </div>
            <div class="logic-row">
                <span class="bullish">曲线变陡 = 🟢 利好 (降息预期/复苏)</span>
                <span class="bearish">深度倒挂 = 🔴 衰退确认 (硬着陆风险极高)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">3. 10Y 名义利率 (10Y Nominal Rate) - 权重 20%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 10年期国债收益率，全球资产定价之锚。<br>
                <span class="glossary-label">专业解读：</span> 它是DCF模型的分母。10Y利率上升，意味着未来的现金流折现到现在价值变低，直接杀估值（尤其是纳斯达克/成长股）。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 利率下行 = 🟢 利好 (估值扩张/分母变小)</span>
                <span class="bearish">⬆️ 利率上行 = 🔴 利空 (估值收缩/分母变大)</span>
            </div>
        </div>
        
        <div class="glossary-box">
            <div class="glossary-title">4. 2Y 名义利率 (2Y Nominal Rate) - 权重 10%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 对美联储未来政策路径最敏感的利率。<br>
                <span class="glossary-label">专业解读：</span> 2Y利率是美联储政策的“影子”。如果2Y利率暴涨，说明市场预期美联储将加息或维持高利率更久 (Higher for Longer)。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 利率下行 = 🟢 利好 (预期降息/Pivot)</span>
                <span class="bearish">⬆️ 利率上行 = 🔴 利空 (预期加息/紧缩)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">5. 30Y 名义利率 (30Y Nominal Rate) - 权重 10%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 超长期限融资成本。<br>
                <span class="glossary-label">专业解读：</span> 反映了<b>“期限溢价”</b>和对美国财政赤字的担忧。如果30Y飙升，往往意味着市场担心美国发债太多或长期通胀失控。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 利率下行 = 🟢 利好 (通胀预期稳定)</span>
                <span class="bearish">⬆️ 利率上行 = 🔴 利空 (财政担忧/久期杀伤)</span>
            </div>
        </div>
        """, unsafe_allow_html=True)

        st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📄 查看 原始数据明细"):
        st.dataframe(df.sort_index(ascending=False))
