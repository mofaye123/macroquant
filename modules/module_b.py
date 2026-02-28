import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from datetime import timedelta

# ==========================================
# 4. 模块 B: 资金价格与走廊摩擦
# ==========================================
def render_module_b(df_raw):
    """
    B模块: 资金价格与走廊摩擦 
    
    核心逻辑:
    1. 政策制度 (40%): 利率趋势 + 绝对水平判别
    2. 摩擦压力 (60%): 天花板/地板/分裂 + SRF预警
    """
    df = df_raw.copy()
    required_cols = ['SOFR', 'IORB', 'RRPONTSYAWARD', 'TGCRRATE', 'RPONTSYD']
    if df.dropna(subset=required_cols).empty:
        st.warning("B模块数据不足（SOFR/IORB/RRP/TGCR/SRF），请稍后刷新。")
        return
    df = df.dropna(subset=required_cols)

    def prev_week_row(frame, days=7):
        target = frame.index[-1] - pd.Timedelta(days=days)
        idx = frame.index.get_indexer([target], method='nearest')[0]
        return frame.iloc[idx]
    
    # ========================================
    # Part 1: 政策利率制度评分
    # ========================================
    
    # 1.1 计算13周移动平均 (政策趋势)
    df['SOFR_MA13'] = df['SOFR'].rolling(65, min_periods=1).mean()  # 13周*5天
    df['SOFR_Trend'] = df['SOFR_MA13'].diff(21)  # 1个月变化率
    
    # 1.2 趋势评分 (下降=宽松=高分)
    df['Score_Trend'] = df['SOFR_Trend'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
    
    # 1.3 绝对水平制度调整
    def get_regime_bonus(sofr):
        """根据利率绝对水平给予奖惩"""
        if sofr < 1.0:    return 20   # 极度宽松 (零利率时代)
        elif sofr < 2.5:  return 10   # 宽松
        elif sofr > 5.0:  return -20  # 极度紧缩
        elif sofr > 4.0:  return -10  # 紧缩
        else:             return 0    # 中性 (2.5-4.0%)
    
    df['Regime_Bonus'] = df['SOFR'].apply(get_regime_bonus)
    
    # 1.4 政策得分 (0-100)
    df['Score_Policy'] = (df['Score_Trend'] + df['Regime_Bonus']).clip(0, 100)
    
    # ========================================
    # Part 2: 走廊摩擦压力评分
    # ========================================
    
    # 2.1 走廊宽度 (用于相对归一)
    df['Corridor_Width'] = (df['IORB'] - df['RRPONTSYAWARD']).abs().clip(lower=0.05)

    # 2.2 摩擦因子1: SOFR-IORB (天花板穿透)
    df['F1_Spread'] = df['SOFR'] - df['IORB']
    df['F1_Ratio'] = df['F1_Spread'].clip(lower=0) / df['Corridor_Width']

    # 2.3 摩擦因子2: SOFR-RRP (地板偏离)
    df['F2_Spread'] = df['SOFR'] - df['RRPONTSYAWARD']
    df['F2_Ratio'] = df['F2_Spread'].abs() / df['Corridor_Width']

    # 2.4 摩擦因子3: TGCR-SOFR (回购市场分裂)
    df['F3_Spread'] = df['TGCRRATE'] - df['SOFR']
    df['F3_Ratio'] = df['F3_Spread'].abs() / df['Corridor_Width']

    def ratio_to_score(series, max_ratio_series):
        denom = max_ratio_series.replace(0, np.nan).ffill().fillna(0.5)
        scaled = (series / denom).clip(lower=0, upper=1)
        return (1 - scaled**1.6) * 100

    # 高敏：滚动 180 天 85% 分位作为动态上限
    df['F1_Max'] = df['F1_Ratio'].rolling(180, min_periods=60).quantile(0.85)
    df['F2_Max'] = df['F2_Ratio'].rolling(180, min_periods=60).quantile(0.85)
    df['F3_Max'] = df['F3_Ratio'].rolling(180, min_periods=60).quantile(0.85)

    df['Score_F1'] = ratio_to_score(df['F1_Ratio'], df['F1_Max'])
    df['Score_F2'] = ratio_to_score(df['F2_Ratio'], df['F2_Max'])
    df['Score_F3'] = ratio_to_score(df['F3_Ratio'], df['F3_Max'])

    # 2.5 SRF 连续惩罚 (平滑，不跳变，中心点 5B)
    df['SRF_Penalty_Base'] = 100 / (1 + np.exp(-0.6 * (df['RPONTSYD'] - 5)))
    df['SRF_Accel'] = df['RPONTSYD'].diff(3).clip(lower=0)
    df['SRF_Penalty'] = (df['SRF_Penalty_Base'] + (df['SRF_Accel'] / 20).clip(0, 1) * 35).clip(0, 100)
    df['Score_SRF'] = 100 - df['SRF_Penalty']

    # 2.6 动态权重（SRF 不主宰）
    df['SRF_Weight'] = 0.10 + 0.15 * (df['SRF_Penalty'] / 100)
    residual = 1 - df['SRF_Weight']
    df['Score_Friction'] = (
        df['Score_F1'] * residual * 0.4 +
        df['Score_F2'] * residual * 0.3 +
        df['Score_F3'] * residual * 0.3 +
        df['Score_SRF'] * df['SRF_Weight']
    )
    
    # ========================================
    # Part 3: B模块综合得分
    # ========================================
    df['Total_Score'] = (
        df['Score_Policy'] * 0.40 +    # 政策趋势 40%
        df['Score_Friction'] * 0.60    # 摩擦压力 60%
    )
    
    # ========================================
    # Part 4: 可视化展示
    # ========================================
    df_view = df[df.index >= '2021-01-01'].copy()
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    prev_week = prev_week_row(df)
    
    # --- KPI 卡片 ---
    c1, c2, c3, c4 = st.columns(4)
    
    score_color = "#09ab3b" if latest['Total_Score'] > 50 else "#ff2b2b"
    c1.markdown(f"""
        <div class="metric-card">
            <div class="metric-label">B模块综合得分(日频)</div>
            <div class="metric-value" style="color: {score_color}">{latest['Total_Score']:.1f}</div>
            <div class="metric-label">vs上周: {latest['Total_Score'] - prev_week['Total_Score']:.1f}</div>
        </div>
    """, unsafe_allow_html=True)
    
    c2.metric(
        "担保隔夜融资利率(SOFR)", 
        f"{latest['SOFR']:.2f}%", 
        f"{(latest['SOFR'] - prev_week['SOFR']):.2f}%(vs上周)", 
        delta_color="inverse"
    )
    
    spread_val_bps = latest['F1_Spread'] * 100
    prev_week_spread_bps = prev_week['F1_Spread'] * 100
    c3.metric(
        "走廊摩擦 (SOFR - IORB)", 
        f"{spread_val_bps:.1f} bps", 
        f"{(spread_val_bps - prev_week_spread_bps):.1f} bps(vs上周)", 
        delta_color="inverse"
    )
    
    # SRF显示优化
    srf_val = latest['RPONTSYD']
    if srf_val == 0:
        srf_str, srf_color = "$0 B", "off"
    elif srf_val > 10:
        srf_str, srf_color = f"${srf_val:.1f} B", "inverse"
    else:
        srf_str, srf_color = f"${srf_val:.0f} B", "inverse"
    
    c4.metric("急救室用量 (SRF)", srf_str, 
              f"{(latest['RPONTSYD'] - prev_week['RPONTSYD']):.0f}", 
              delta_color=srf_color)
    
    # --- 细分得分 ---
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("##### 🧩 因子细分得分 (贡献度分析)")
    sub1, sub2, sub3, sub4, sub5 = st.columns(5)
    
    def sub_score_card(label, value):
        color = "#09ab3b" if value > 50 else "#ff2b2b"
        return f"""<div class="sub-card"><div class="sub-label">{label}</div>
                   <div class="sub-value" style="color: {color}">{value:.1f}</div></div>"""
    
    sub1.markdown(sub_score_card("政策制度 (40%)", latest['Score_Policy']), unsafe_allow_html=True)
    sub2.markdown(sub_score_card("摩擦压力 (60%)", latest['Score_Friction']), unsafe_allow_html=True)
    sub3.markdown(sub_score_card("SRF预警", latest['Score_SRF']), unsafe_allow_html=True)
    
    st.divider()
    
    # --- 图表1: 综合得分趋势 ---
    fig_score = go.Figure()
    fig_score.add_trace(go.Scatter(
        x=df_view.index, y=df_view['Total_Score'], 
        name='B模块综合得分', 
        line=dict(color='#09ab3b', width=2), 
        fill='tozeroy', fillcolor='rgba(9, 171, 59, 0.1)'
    ))
    fig_score.add_hline(y=50, line_dash="dash", line_color="#888", 
                        annotation_text="中性线 (50)", annotation_position="right")
    fig_score.update_layout(
        height=300, 
        paper_bgcolor='rgba(0,0,0,0)', 
        plot_bgcolor='rgba(0,0,0,0)',
        title="B模块综合得分: 得分越高 = 环境越宽松 | 得分越低 = 环境越紧缩",
        hovermode="x unified",
        yaxis=dict(range=[0, 100], title='Score', showgrid=True)
    )
    st.plotly_chart(fig_score, use_container_width=True)

    st.markdown("<br>", unsafe_allow_html=True)
    # --- 图表2: 走廊宽度 ---
    fig_corridor = go.Figure()
    fig_corridor.add_trace(go.Scatter(
        x=df_view.index, y=df_view['Corridor_Width'],
        name='IORB - RRP 走廊宽度',
        line=dict(color='#64748b', width=2)
    ))
    fig_corridor.update_layout(
        height=260,
        title="走廊宽度 (IORB - RRP)",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode="x unified",
        yaxis=dict(showgrid=True, gridcolor='#f3f4f6')
    )
    st.plotly_chart(fig_corridor, use_container_width=True)

    st.markdown("<br>", unsafe_allow_html=True)
    # --- 图表3: SRF 权重 ---
    fig_srf_w = go.Figure()
    fig_srf_w.add_trace(go.Scatter(
        x=df_view.index, y=df_view['SRF_Weight'],
        name='SRF 权重',
        line=dict(color='#ef4444', width=2)
    ))
    fig_srf_w.add_hline(y=0.20, line_dash="dash", line_color="#dc2626",
                        annotation_text="警戒线 20%", annotation_position="right")
    fig_srf_w.update_layout(
        height=260,
        title="SRF 权重 (10% ~ 25%)",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode="x unified",
        yaxis=dict(range=[0, 0.3], tickformat=".0%", showgrid=True, gridcolor='#f3f4f6')
    )
    st.plotly_chart(fig_srf_w, use_container_width=True)
    
    # --- 图表2: 利率走廊 ---
    fig_corridor = go.Figure()
    fig_corridor.add_trace(go.Scatter(x=df_view.index, y=df_view['IORB'], 
                                      name='天花板 (IORB)', 
                                      line=dict(color='#ff2b2b', width=2, dash='dash')))
    fig_corridor.add_trace(go.Scatter(x=df_view.index, y=df_view['RRPONTSYAWARD'], 
                                      name='地板 (RRP)', 
                                      line=dict(color='#09ab3b', width=2, dash='dash')))
    fig_corridor.add_trace(go.Scatter(x=df_view.index, y=df_view['SOFR'], 
                                      name='市场利率 (SOFR)', 
                                      line=dict(color='#0068c9', width=3)))
    fig_corridor.add_trace(go.Scatter(x=df_view.index, y=df_view['SOFR_MA13'], 
                                      name='SOFR 趋势 (13周MA)', 
                                      line=dict(color='#a855f7', width=1.5, dash='dot')))
    
    y_min = min(df_view['IORB'].min(), df_view['SOFR'].min(), df_view['RRPONTSYAWARD'].min()) - 0.5
    y_max = max(df_view['IORB'].max(), df_view['SOFR'].max(), df_view['RRPONTSYAWARD'].max()) + 0.5
    
    fig_corridor.update_layout(
        height=400, 
        paper_bgcolor='rgba(0,0,0,0)', 
        plot_bgcolor='rgba(0,0,0,0)',
        title="利率走廊监控: 观察 SOFR 是否突破天花板或远离地板",
        hovermode="x unified",
        yaxis=dict(range=[y_min, y_max], title='Rate (%)', showgrid=True),
        legend=dict(orientation="h", y=1.1, x=0)
    )
    st.plotly_chart(fig_corridor, use_container_width=True)
    
    # --- 图表3: 天花板摩擦  ---
    pos_spread = (df_view['F1_Spread'] * 100).clip(lower=0)
    neg_spread = (df_view['F1_Spread'] * 100).clip(upper=0)
    
    fig_spread = go.Figure()
    fig_spread.add_trace(go.Scatter(
        x=df_view.index, y=pos_spread, 
        name='危险区 (SOFR > IORB)', 
        line=dict(color='#ff2b2b', width=2), 
        fill='tozeroy', fillcolor='rgba(255, 43, 43, 0.5)'
    ))
    fig_spread.add_trace(go.Scatter(
        x=df_view.index, y=neg_spread, 
        name='安全区 (SOFR < IORB)', 
        line=dict(color='#09ab3b', width=2), 
        fill='tozeroy', fillcolor='rgba(9, 171, 59, 0.2)'
    ))
    
    fig_spread.update_layout(
        height=350,
        paper_bgcolor='rgba(0,0,0,0)', 
        plot_bgcolor='rgba(0,0,0,0)',
        title="走廊摩擦(SOFR - IORB): 红灯 = 缺钱 (SOFR突破天花板) | 绿灯 = 正常",
        hovermode="x unified",
        yaxis=dict(title='Spread (bps)', showgrid=True, zeroline=True)
    )
    st.plotly_chart(fig_spread, use_container_width=True)
    
    # --- 图表4: SRF 预警仪表盘 ---
    fig_srf = go.Figure()
    fig_srf.add_trace(go.Scatter(
        x=df_view.index, y=df_view['RPONTSYD'], 
        name='SRF 用量', 
        line=dict(color='#ff6b6b', width=2),
        fill='tozeroy', fillcolor='rgba(255, 107, 107, 0.2)'
    ))
    
    # 阈值线
    fig_srf.add_hline(y=10, line_dash="dash", line_color="#ffa500", 
                      annotation_text="警戒线 (100亿)", annotation_position="right")
    fig_srf.add_hline(y=50, line_dash="dash", line_color="#ff2b2b", 
                      annotation_text="危机线 (500亿)", annotation_position="right")
    
    fig_srf.update_layout(
        height=350,
        paper_bgcolor='rgba(0,0,0,0)', 
        plot_bgcolor='rgba(0,0,0,0)',
        title="SRF 急救室用量: 用量越高 = 压力越大 | 暴涨后骤降 = 救助成功",
        hovermode="x unified",
        yaxis=dict(title='Billions ($)', showgrid=True)
    )
    st.plotly_chart(fig_srf, use_container_width=True)
    
    # 百科
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📚 B模块：因子专业定义与市场逻辑 (点击展开)", expanded=False):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
            <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
            <div class="glossary-content">
                本模块得分旨在量化资金成本与传导顺畅度，采用两层加权模型：<br>
                <b>总分 = 政策制度得分 (40%) + 摩擦压力得分 (60%)</b><br><br>
                <b>1. 政策制度 (Policy Regime)：</b> 
                <br>&nbsp;&nbsp; 结合利率绝对水平（低利率加分）与 13周变化趋势（降息趋势加分）。<br>
                <b>2. 摩擦压力 (Market Friction)：</b> 
                <br>&nbsp;&nbsp; <b>基准偏离度 (Z-Score思路)</b>：计算三组走廊摩擦相对其 60天移动中枢的偏离程度。
                <br>&nbsp;&nbsp; <b>非对称惩罚</b>：仅当 SOFR 突破天花板 (IORB) 时给予重罚，正常波动不扣分。
                <br>&nbsp;&nbsp; <b>动态权重 </b>：一旦监测到 SRF 用量激增，模型自动进入“非正常模式”，将 SRF 在摩擦压力权重从 0% 提至 60%，迅速拉低总分以发出警报。
            </div>
        </div>
        """, unsafe_allow_html=True)

        st.markdown("""
        <div class="glossary-box">
            <div class="glossary-title">1. EFFR (联邦基金利率)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 无抵押隔夜资金价格 (政策锚)。<br>
                <span class="glossary-label">专业解读：</span> 这是美联储政策利率的“靶心”，代表了无风险的基准融资成本。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下降 = 🟢 更松 (降息周期)</span>
                <span class="bearish">⬆️ 上升 = 🔴 更紧 (加息周期)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">2. SOFR (担保隔夜融资利率)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 有抵押隔夜回购资金价格 (市场真实价格)。<br>
                <span class="glossary-label">专业解读：</span> 用国债做抵押借钱的成本。它是回购市场的核心定价基准。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下降 = 🟢 更松 (资金成本下降)</span>
                <span class="bearish">⬆️ 上升 = 🔴 更紧 (资金成本上升)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">3. IORB (准备金利息率)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 准备金利率 (政策天花板)。<br>
                <span class="glossary-label">专业解读：</span> 银行把钱存在美联储能拿到的无风险利息。理论上，银行不应以低于此利率把钱借给别人。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下降 = 🟢 更松 (政策放松)</span>
                <span class="bearish">⬆️ 上升 = 🔴 更紧 (政策收紧)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">4. RRP Award Rate (逆回购利率)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 逆回购利率 (政策地板)。<br>
                <span class="glossary-label">专业解读：</span> 机构把钱借给美联储能拿到的利息。这是市场利率的下限。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下降 = 🟢 更松 (政策放松)</span>
                <span class="bearish">⬆️ 上升 = 🔴 更紧 (政策收紧)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">5. SRF (常备回购便利)（正常时不计权）</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 银行向美联储申请紧急贷款的金额 (Standing Repo Facility)。<br>
                <span class="glossary-label">专业解读：</span> 这是回购市场压力的<b>最重要实时信号</b>。监测银行是否启用了紧急贷款。<br>
                <span class="glossary-label">实战阈值：</span><br>
                &nbsp;&nbsp;• <b>&lt; 100亿美元：</b> 🟢 正常 (中性策略)<br>
                &nbsp;&nbsp;• <b>100 - 500亿美元：</b> 🟡 压力酝酿 (开始配置黄金/BTC)<br>
                &nbsp;&nbsp;• <b>&gt; 500亿美元：</b> 🔴 财政部失能 (准备迎接大放水救助/Risk On)
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 用量低/零 = 🟢 更松 (资金充裕)</span>
                <span class="bearish">⬆️ 暴涨后崩盘 = 🟢 注入成功 (做多风险资产)</span>
            </div>
        </div>
        
        <div class="glossary-box">
            <div class="glossary-title">6. TGCR (第三方一般担保回购利率)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 三方回购一般抵押品利率。<br>
                <span class="glossary-label">专业解读：</span> 代表最标准、最优质的抵押品融资成本。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下降 = 🟢 更松</span>
                <span class="bearish">⬆️ 上升 = 🔴 更紧</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">7. 走廊摩擦 1 (SOFR - IORB)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> SOFR 相对于 IORB 的异常偏离 (穿顶监测)。<br>
                <span class="glossary-label">专业解读：</span> 只要 SOFR 冲破 IORB (正值)，就说明市场上的钱比央行的钱还贵，流动性告急。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 偏离度低 (负值) = 🟢 更松 (越负越好)</span>
                <span class="bearish">⬆️ 偏离度高 (正值) = 🔴 更紧 (极度紧缺)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">8. 走廊摩擦 2 (SOFR - RRP)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> SOFR 相对于地板的平均分布偏离 (离地监测)。<br>
                <span class="glossary-label">专业解读：</span> 监测资金是否开始脱离“地板区”。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 偏离度低 = 🟢 更松 (越贴近地板越好)</span>
                <span class="bearish">⬆️ 偏离度高 = 🔴 更紧 (开始收紧)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">9. 抵押品/回购摩擦 (TGCR - SOFR)</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 两条回购利率的分层/传导偏离。<br>
                <span class="glossary-label">专业解读：</span> 反映回购市场内部是否存在“血管堵塞”，资金传导是否顺畅。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 偏离度低 = 🟢 更松 (越接近0越好)</span>
                <span class="bearish">⬆️ 偏离度高 = 🔴 更紧 (传导不畅)</span>
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📄 查看 原始数据明细"):
        st.dataframe(df.sort_index(ascending=False))
