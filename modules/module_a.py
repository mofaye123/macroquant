import streamlit as st
import pandas as pd
import plotly.graph_objects as go

# ==========================================
# 3. 模块 A: 系统流动性 (周频)
# ==========================================
def render_module_a(df_all):
  

    df_raw = df_all[df_all.index >= '2020-01-01'].copy()

    df = pd.DataFrame()
    df['WALCL'] = df_raw['WALCL'].resample('W-WED').last() 
    df['WTREGEN'] = df_raw['WTREGEN'].resample('W-WED').last()
    df['RRPONTSYD'] = df_raw['RRPONTSYD'].resample('W-WED').last()
    df['WRESBAL'] = df_raw['WRESBAL'].resample('W-WED').last()
    df = df.fillna(method='ffill').dropna()

    def get_tga_penalty(tga_val):
        tga_b = tga_val / 1000 if tga_val > 10000 else tga_val
        
        if tga_b < 800:
            return 1.0  
        elif 800 <= tga_b < 850:
            return 0.8  
        elif 850 <= tga_b < 900:
            return 0.6
        else:
            return 0.5
    
    # 统一到“十亿美元”尺度
    tga_b = df['WTREGEN'].where(df['WTREGEN'] <= 10000, df['WTREGEN'] / 1000)
    df['TGA_Penalty_Level'] = tga_b.apply(get_tga_penalty)

    def get_tga_trend_penalty(delta_b):
        if delta_b <= 0: return 1.0
        elif delta_b <= 50: return 0.95
        elif delta_b <= 100: return 0.9
        elif delta_b <= 150: return 0.8
        else: return 0.7

    df['TGA_Change_4W'] = tga_b.diff(4).fillna(0)
    df['TGA_Penalty_Trend'] = df['TGA_Change_4W'].apply(get_tga_trend_penalty)
    df['TGA_Penalty_Total'] = df['TGA_Penalty_Level'] * df['TGA_Penalty_Trend']
    
    # 应用：趋势分 * 平滑惩罚系数

    if df['RRPONTSYD'].mean() < 10000:
        df['RRP_Clean'] = df['RRPONTSYD'] * 1000
    else:
        df['RRP_Clean'] = df['RRPONTSYD']

    df['Net_Liquidity'] = df['WALCL'] - df['WTREGEN'] - df['RRP_Clean']

    # 流动性吸收（TGA + RRP）
    df['Liquidity_Sink'] = df['WTREGEN'] + df['RRP_Clean']
    df['Liquidity_Sink_Ratio'] = (df['Liquidity_Sink'] / df['WALCL']).clip(lower=0)

    # 流动性吸收惩罚（高吸收 = 低分）
    def sink_penalty_ratio(r):
        if r < 0.10: return 1.0
        elif r < 0.15: return 0.9
        elif r < 0.20: return 0.8
        elif r < 0.25: return 0.7
        else: return 0.6
    df['Sink_Penalty'] = df['Liquidity_Sink_Ratio'].apply(sink_penalty_ratio)
    
    def rolling_percentile(series, window=156, min_periods=20):
        return series.rolling(window, min_periods=min_periods).apply(
            lambda s: s.rank(pct=True).iloc[-1],
            raw=False
        ) * 100

    def get_score(series):
        return rolling_percentile(series.diff(13))
    
    df['Score_Reserves'] = get_score(df['WRESBAL'])
    df['Score_NetLiq'] = get_score(df['Net_Liquidity'])
    df['Score_TGA'] = get_score(-df['WTREGEN'])
    df['Score_RRP'] = get_score(-df['RRP_Clean']) 
    
    base_total = (
        df['Score_NetLiq'] * 0.45 + df['Score_TGA'] * 0.2 + 
        df['Score_RRP'] * 0.25 + df['Score_Reserves'] * 0.1
    )
    df['Score_NetLiq_Adj'] = df['Score_NetLiq'] * df['Sink_Penalty']
    df['Total_Score'] = (
        df['Score_NetLiq_Adj'] * 0.45 +
        df['Score_TGA'] * 0.2 +
        df['Score_RRP'] * 0.25 +
        df['Score_Reserves'] * 0.1
    ) * df['TGA_Penalty_Total']

    latest = df.iloc[-1]
    prev = df.iloc[-2]
    
    # 核心指标
    c1, c2, c3, c4 = st.columns(4)
    score_color = "#09ab3b" if latest['Total_Score'] > 50 else "#ff2b2b"
    c1.markdown(f"""
        <div class="metric-card">
        <div class="metric-label">A模块综合得分（周频）</div>
        <div class="metric-value" style="color: {score_color}">{latest['Total_Score']:.1f}</div>
        <div class="metric-label">vs上周: {latest['Total_Score'] - prev['Total_Score']:.1f}</div>
        </div>
    """, unsafe_allow_html=True)
    
    c2.metric("净流动性 (Net Liq)", f"${latest['Net_Liquidity']/1000000:.2f} T", 
              f"{(latest['Net_Liquidity'] - prev['Net_Liquidity'])/1000:.0f} B (vs上周)", delta_color="normal")
    c3.metric("Fed 总资产", f"${latest['WALCL']/1000000:.2f} T", 
              f"{(latest['WALCL'] - prev['WALCL'])/1000:.0f} B (vs上周)", delta_color="normal")
    c4.metric("逆回购 (RRP)", f"${latest['RRP_Clean']/1000:.0f} B", 
              f"{(latest['RRP_Clean'] - prev['RRP_Clean'])/1000:.0f} B (vs上周)", delta_color="normal")

    # 细分得分
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("##### 🧩 因子细分得分 (贡献度分析)")
    sub1, sub2, sub3, sub4, sub5 = st.columns(5)
    def sub_score_card(label, value):
        color = "#09ab3b" if value > 50 else "#ff2b2b"
        return f"""<div class="sub-card"><div class="sub-label">{label}</div><div class="sub-value" style="color: {color}">{value:.1f}</div></div>"""

    sub1.markdown(sub_score_card("Net Liq 得分 (45%)", latest['Score_NetLiq_Adj']), unsafe_allow_html=True)
    sub2.markdown(sub_score_card("TGA 得分 (20%)", latest['Score_TGA']), unsafe_allow_html=True)
    sub3.markdown(sub_score_card("RRP 得分 (25%)", latest['Score_RRP']), unsafe_allow_html=True)
    sub4.markdown(sub_score_card("准备金得分 (10%)", latest['Score_Reserves']), unsafe_allow_html=True)

    tga_penalty_now = latest['TGA_Penalty_Total']
    tga_penalty_color = "#dc2626" if tga_penalty_now < 0.8 else "#10b981"
    sub5.markdown(
        f"""<div class="sub-card">
                <div class="sub-label">TGA 总惩罚</div>
                <div class="sub-value" style="color:{tga_penalty_color}">{tga_penalty_now:.2f}x</div>
            </div>""",
        unsafe_allow_html=True
    )

    # 图表
    st.divider()
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df.index, y=df['Total_Score'], name='A模块体系流动性分数', line=dict(color='#09ab3b', width=2), yaxis='y2'))
    fig.add_trace(go.Scatter(
        x=df.index, y=df['Liquidity_Sink'] / 1000,
        name='流动性吸收 (TGA + RRP, $B)',
        line=dict(color='#6366f1', width=2),
        fill='tozeroy', fillcolor='rgba(99, 102, 241, 0.12)'
    ))
    
    y_min, y_max = (df['Liquidity_Sink'] / 1000).min() * 0.95, (df['Liquidity_Sink'] / 1000).max() * 1.02
    fig.update_layout(
        title="A模块得分 vs 流动性吸收 (TGA + RRP)",
        height=500, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', font=dict(color='black'),
        yaxis=dict(title='Amount ($B)', showgrid=False, range=[y_min, y_max]),
        yaxis2=dict(title='Score (0-100)', overlaying='y', side='right', range=[0, 100], showgrid=True, gridcolor='#e0e0e0'),
        hovermode="x unified", legend=dict(orientation="h", y=1.1, x=0)
    )
    st.plotly_chart(fig, use_container_width=True)

    
    # TGA + RRP 曲线
    col_tga, col_rrp = st.columns(2)
    with col_tga:
        # 1. 计算当前 TGA 余额（Billion）及 匹配惩罚系数
        tga_latest_val = df['WTREGEN'].iloc[-1]
        tga_b = tga_latest_val / 1000 if tga_latest_val > 10000 else tga_latest_val
        
        # 匹配显示逻辑
        if tga_b < 800:
            p_text, p_color = "1.0x (无惩罚)", "#09ab3b"
        elif 800 <= tga_b < 850:
            p_text, p_color = "0.8x (一级惩罚)", "#f59e0b"
        elif 850 <= tga_b < 900:
            p_text, p_color = "0.6x (二级惩罚)", "#ea580c"
        else:
            p_text, p_color = "0.5x (极端惩罚)", "#ff2b2b"

        # 2. 绘图逻辑
        fig_tga = go.Figure()
        fig_tga.add_trace(go.Scatter(
            x=df.index, y=df['WTREGEN']/1000, name='TGA 余额 ($B)', 
            line=dict(color='#d97706', width=2), 
            fill='tozeroy', fillcolor='rgba(217, 119, 6, 0.1)'
        ))
        fig_tga.add_hline(y=400, line_dash="dash", line_color="#09ab3b", 
                          annotation_text="利好区 (<400B)", annotation_position="bottom right")
        fig_tga.add_hline(y=800, line_dash="dash", line_color="#f59e0b", 
                          annotation_text="警戒区 (800B+ : 0.8x)", annotation_position="top right")
        fig_tga.add_hline(y=850, line_dash="dot", line_color="#ea580c", 
                          annotation_text="高压区 (850B+ : 0.6x)", annotation_position="top right")
        fig_tga.add_hline(y=900, line_dash="solid", line_color="#ff2b2b", 
                          annotation_text="枯竭区 (900B+ : 0.5x)", annotation_position="top right")

        fig_tga.update_layout(
            height=400, 
            paper_bgcolor='rgba(0,0,0,0)', 
            plot_bgcolor='rgba(0,0,0,0)', 
            font=dict(color='black'),
            title=f"TGA 余额趋势: 当前 {tga_b:.1f}B | <span style='color:{p_color};'>惩罚系数: {p_text}</span> | 总惩罚: {latest['TGA_Penalty_Total']:.2f}x", 
            hovermode="x unified", 
            yaxis_title="Billions ($)"
        )
        st.plotly_chart(fig_tga, use_container_width=True)

    with col_rrp:
        rrp_series_b = df['RRP_Clean'] / 1000
        fig_rrp = go.Figure()
        fig_rrp.add_trace(go.Scatter(
            x=df.index, y=rrp_series_b, name='RRP 用量 ($B)',
            line=dict(color='#2563eb', width=2),
            fill='tozeroy', fillcolor='rgba(37, 99, 235, 0.12)'
        ))
        fig_rrp.add_hline(y=300, line_dash="dash", line_color="#10b981", annotation_text="低位 <300B", annotation_position="bottom right")
        fig_rrp.add_hline(y=1000, line_dash="dash", line_color="#f59e0b", annotation_text="中位 <1000B", annotation_position="top right")
        fig_rrp.add_hline(y=2000, line_dash="dash", line_color="#ef4444", annotation_text="高位 <2000B", annotation_position="top right")

        rrp_b = rrp_series_b.iloc[-1]
        if rrp_b < 300:
            rrp_level = "低位"
        elif rrp_b < 1000:
            rrp_level = "中位"
        elif rrp_b < 2000:
            rrp_level = "高位"
        else:
            rrp_level = "极高"

        fig_rrp.update_layout(
            height=400,
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font=dict(color='black'),
            title=f"RRP 用量趋势: 当前 {rrp_b:.0f}B · {rrp_level}",
            hovermode="x unified",
            yaxis_title="Billions ($)"
        )
        st.plotly_chart(fig_rrp, use_container_width=True)

    # 百科
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📚 A模块：因子专业定义与市场逻辑 (点击展开)", expanded=False):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
            <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
            <div class="glossary-content">
                本模块得分基于动量趋势 + 历史分位双重校验，满分 100 分（50分=中性）：<br>
                <b>1. 数据清洗：</b> 所有数据统一重采样为周频（Week-Ending Wednesday），剔除日间噪音。<br>
                <b>2. 趋势因子：</b> 采用 13周（即一个季度）的滚动变化量，捕捉中期流动性拐点。<br>
                <b>3. 历史打分：</b> 将当前趋势置于历史数据中进行百分位排名 (Percentile Rank)。例如得分 90 表示当前流动性环境优于历史上 90% 的时期。<br>
                <b>4. 处罚机制（总体逻辑）：</b><br>
                &nbsp;&nbsp;• <b>TGA 水位惩罚：</b> 当 TGA > 800B 开始惩罚，区间 0.8x / 0.6x / 0.5x；<br>
                &nbsp;&nbsp;• <b>TGA 趋势惩罚：</b> 观察 4 周变化，抽水加速则进一步下调；<br>
                &nbsp;&nbsp;• <b>流动性吸收惩罚：</b> 使用 (TGA+RRP) / WALCL 比例，比例越高则对 <b>Net Liquidity</b> 分数直接打折。<br>
                <b>5. TGA 打分口径：</b> <span class="glossary-label">Score_TGA = PercentileRank( -Δ13W(TGA) )</span>，即 TGA 13 周上行越快，得分越低；再叠加 TGA 水位惩罚系数。<br>
                <b>6. 权重模型：</b>
                <br>&nbsp;&nbsp;• <b>Fed净流动性 </b>：45% - 核心权重，代表真实购买力（且受吸收惩罚影响）。
                <br>&nbsp;&nbsp;• <b>TGA </b>：20% - 辅助权重，代表财政抽水压力。
                <br>&nbsp;&nbsp;• <b>RRP </b>：25% - 辅助权重，代表资金回流强弱。
                <br>&nbsp;&nbsp;• <b>银行准备金 </b>：10% - 基础权重，代表银行体系安全垫。
            </div>
        </div>
        <div class="glossary-box">
            <div class="glossary-title">图表解读：A模块得分 vs 流动性吸收 (TGA + RRP)</div>
            <div class="glossary-content">
                <span class="glossary-label">蓝线（吸收）上行：</span> 表示 TGA+RRP 吸收资金增加，市场可用流动性被抽走。<br>
                <span class="glossary-label">绿线（得分）下行：</span> 表示流动性环境走弱，风险上升。<br>
                <span class="glossary-label">关键信号：</span> 若蓝线持续走高而绿线仍高位，通常意味着<strong>惩罚尚未完全反映</strong>，需重点关注 TGA 惩罚与吸收惩罚是否继续加深。
            </div>
        </div>
        """, unsafe_allow_html=True)

        st.markdown("""
        <div class="glossary-box">
            <div class="glossary-title">1. 银行准备金 (Bank Reserves / WRESBAL)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 商业银行存放在美联储的现金储备。<br>
                <span class="glossary-label">专业解读：</span> 这是金融体系的<b>“基础血液”</b>。它代表了银行体系内部可用的即时流动性。准备金越充裕，银行应对挤兑的能力越强，同时也具备更强的信贷扩张（放贷）潜力。
            </div>
            <div class="logic-row">
                <span class="bullish">⬆️ 上升 = 🟢 利好 (信贷扩张潜力增加)</span>
                <span class="bearish">⬇️ 下降 = 🔴 利空 (流动性缓冲变薄)</span>
            </div>
        </div>
        <div class="glossary-box">
            <div class="glossary-title">2. Fed 净流动性 (Net Liquidity)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 美联储资产负债表总规模 - (TGA账户余额 + ON RRP余额)。<br>
                <span class="glossary-label">专业解读：</span> 这是目前市场最关注的<b>“真实流动性”</b>指标。虽然美联储的总资产可能很高，但如果钱被锁在TGA（财政部）或ON RRP（逆回购）里，市场是拿不到这笔钱的。<br>
            </div>
            <div class="logic-row">
                <span class="bullish">⬆️ 上升 = 🟢 利好 (真实流动性增加)</span>
                <span class="bearish">⬇️ 下降 = 🔴 利空 (真实流动性收缩)</span>
            </div>
        </div>
        <div class="glossary-box">
            <div class="glossary-title">3. TGA (Treasury General Account)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 美国财政部在美联储的“存款账户”（政府的钱包）。<br>
                <span class="glossary-label">专业解读：</span> 这是一个<b>“流动性抽水机”</b>。当政府发债存钱或收税时，资金从市场流向 TGA（抽水）；当政府花钱时，资金回流市场（注水）。<br>
                <span class="glossary-label">实战阈值：</span><br>
                &nbsp;&nbsp;• <b>&lt; 4000亿美元：</b> 🟢 资金回流市场 (利好)<br>
                &nbsp;&nbsp;• <b>4000 - 8000亿：</b> ⚪ 中性震荡<br>
                &nbsp;&nbsp;• <b>&gt; 8000亿美元：</b> 🔴 流动性枯竭/回购紧缩风险 (利空)<br>
                <span class="glossary-label">关键规则：</span> 若 <b>TGA↑ 且 SOFR↑</b>，市场即入<b>危险区</b> (政府抽水+银行抢钱 = 崩盘前兆)。
            </div>
            <div class="logic-row">
                <span class="bearish">⬆️ 上升 = 🔴 利空 (资金被抽走)</span>
                <span class="bullish">⬇️ 下降 = 🟢 利好 (资金回流市场)</span>
            </div>
        </div>
        <div class="glossary-box">
            <div class="glossary-title">4. ON RRP 用量 (Overnight Reverse Repurchase Agreements)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 隔夜逆回购协议，即货币市场基金等机构把多余的现金借给美联储，换取利息。<br>
                <span class="glossary-label">专业解读：</span> 这是一个<b>“资金蓄水池”或“闲置资金停车场”</b>。当ON RRP用量很高时，说明市场上资金过剩但缺乏好的投资标的。
            </div>
            <div class="logic-row">
                <span class="bearish">⬆️ 上升 = 🔴 利空 (资金闲置/空转)</span>
                <span class="bullish">⬇️ 下降 = 🟢 利好 (资金重新激活)</span>
            </div>
        </div>
        <div class="glossary-box" style="border-left: 4px solid #888;">
            <div class="glossary-title">5. Fed 总资产 (Fed Total Assets) [仅展示]</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 美联储资产负债表的总规模 (WALCL)。<br>
                <span class="glossary-label">专业解读：</span> 代表了央行资产负债表的扩张(QE)与收缩(QT)周期。它是大周期的水位，但短期对市场的影响常被 TGA/RRP 对冲。
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📄 查看 原始数据明细"):
        st.dataframe(df.sort_index(ascending=False))
