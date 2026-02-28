import streamlit as st
import pandas as pd
import plotly.graph_objects as go

# ==========================================
# 模块 F: 信用压力 (Credit Stress)
# ==========================================
def render_module_f(df_all):
    df = df_all.copy()
    required_cols = ['BAMLH0A0HYM2', 'BAA10Y']
    if df.dropna(subset=required_cols).empty:
        st.warning("F模块数据不足（HY/BAA利差），请稍后刷新。")
        return
    df = df.dropna(subset=required_cols)

    def prev_week_row(frame, days=7):
        target = frame.index[-1] - pd.Timedelta(days=days)
        idx = frame.index.get_indexer([target], method='nearest')[0]
        return frame.iloc[idx]

    def rolling_percentile(series, window=756, min_periods=30):
        return series.rolling(window, min_periods=min_periods).apply(
            lambda s: s.rank(pct=True).iloc[-1],
            raw=False
        ) * 100

    def bounded_score(series):
        return series.clip(lower=0, upper=100)

    # 高收益利差 (高=坏) + BAA10Y(企业利差，作为稳态参考)
    df['HY_Spread'] = df['BAMLH0A0HYM2']
    df['BAA10Y'] = df['BAA10Y']

    df['Score_HY_Level'] = 100 - rolling_percentile(df['HY_Spread'])
    df['Score_HY_Trend'] = rolling_percentile(-df['HY_Spread'].diff(13))
    df['Score_BAA_Level'] = 100 - rolling_percentile(df['BAA10Y'])

    df['Total_Score'] = bounded_score(
        df['Score_HY_Level'] * 0.5 +
        df['Score_HY_Trend'] * 0.3 +
        df['Score_BAA_Level'] * 0.2
    )

    df_view = df[df.index >= '2020-01-01'].copy()
    latest = df.iloc[-1]
    prev_week = prev_week_row(df)

    c1, c2, c3 = st.columns(3)
    score_color = "#09ab3b" if latest['Total_Score'] > 50 else "#ff2b2b"
    c1.markdown(f"""
        <div class="metric-card">
            <div class="metric-label">F模块综合得分（日频）</div>
            <div class="metric-value" style="color: {score_color}">{latest['Total_Score']:.1f}</div>
            <div class="metric-label">vs上周: {latest['Total_Score'] - prev_week['Total_Score']:.1f}</div>
        </div>
    """, unsafe_allow_html=True)

    c2.metric(
        "高收益利差 (HY Spread)",
        f"{latest['HY_Spread']:.2f}%",
        f"{(latest['HY_Spread'] - prev_week['HY_Spread']):.2f}% (vs上周)",
        delta_color="inverse"
    )
    c3.metric(
        "BAA-10Y 利差",
        f"{latest['BAA10Y']:.2f}%",
        f"{(latest['BAA10Y'] - prev_week['BAA10Y']):.2f}% (vs上周)",
        delta_color="inverse"
    )

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("##### 🧩 因子细分得分")
    s1, s2, s3 = st.columns(3)
    def sub_card(label, val):
        col = "#09ab3b" if val > 50 else "#ff2b2b"
        return f"""<div class="sub-card"><div class="sub-label">{label}</div><div class="sub-value" style="color:{col}">{val:.1f}</div></div>"""
    s1.markdown(sub_card("利差水平 (50%)", latest['Score_HY_Level']), unsafe_allow_html=True)
    s2.markdown(sub_card("利差趋势 (30%)", latest['Score_HY_Trend']), unsafe_allow_html=True)
    s3.markdown(sub_card("BAA稳态 (20%)", latest['Score_BAA_Level']), unsafe_allow_html=True)

    st.divider()
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df_view.index, y=df_view['HY_Spread'], name='HY Spread', line=dict(color='#dc2626', width=2)))
    fig.add_hline(y=4, line_dash="dash", line_color="#16a34a", annotation_text="低压上沿(4%)")
    fig.add_hline(y=6, line_dash="dash", line_color="#f59e0b", annotation_text="警戒上沿(6%)")
    fig.update_layout(
        height=380,
        title="信用压力：高收益利差",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode="x unified"
    )
    st.plotly_chart(fig, use_container_width=True)

    fig_trend = go.Figure()
    fig_trend.add_trace(go.Bar(
        x=df_view.index,
        y=df_view['HY_Spread'].diff(13),
        name='HY 利差趋势(13周)',
        marker_color='rgba(220,38,38,0.35)'
    ))
    fig_trend.add_hline(y=0, line_dash="dash", line_color="#9ca3af", annotation_text="拐点(0)")
    fig_trend.add_hline(y=0.5, line_dash="dash", line_color="#dc2626", annotation_text="恶化线(+0.5)")
    fig_trend.add_hline(y=-0.5, line_dash="dash", line_color="#16a34a", annotation_text="缓解线(-0.5)")
    fig_trend.update_layout(
        height=320,
        title="信用压力：利差趋势 (13周变化)",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode="x unified"
    )
    st.plotly_chart(fig_trend, use_container_width=True)

    fig_baa = go.Figure()
    fig_baa.add_trace(go.Scatter(x=df_view.index, y=df_view['BAA10Y'], name='BAA-10Y', line=dict(color='#2563eb', width=2)))
    fig_baa.add_hline(y=2.5, line_dash="dash", line_color="#16a34a", annotation_text="低压上沿(2.5%)")
    fig_baa.add_hline(y=3.5, line_dash="dash", line_color="#f59e0b", annotation_text="警戒上沿(3.5%)")
    fig_baa.update_layout(
        height=380,
        title="信用压力：BAA-10Y 稳态参考",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode="x unified"
    )
    st.plotly_chart(fig_baa, use_container_width=True)

    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📚 F模块：因子专业定义与量化逻辑 (点击展开)", expanded=False):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
            <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
            <div class="glossary-content">
                <b>F模块回答的问题：</b> “企业融资的压力有没有在明显变大？”<br><br>
                <b>为什么只用这两个因子？</b> 因为它们分别代表两个层级的信用压力：<br>
                &nbsp;&nbsp;• <b>HY Spread</b>：高风险企业融资成本（最敏感、最先动）。<br>
                &nbsp;&nbsp;• <b>BAA-10Y</b>：投资级企业融资成本（更稳态、覆盖更广）。<br>
                这对组合可以在不引入多重重复因子的情况下，覆盖“信用市场的快与慢”两条主线。<br><br>
                <b>打分方式：</b> 所有因子通过历史百分位映射到 <b>0-100</b>，并裁剪到有效区间。利差越高代表风险越大，因此 <b>Score = 100 - Percentile(Spread)</b>。<br>
                <b>权重：</b> HY水平 50% + HY趋势 30% + BAA稳态 20%。
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">1. 高收益利差 (HY Spread) - 权重 50%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 垃圾债相对安全资产的风险溢价。<br>
                <span class="glossary-label">通俗解释：</span> 市场越害怕违约，垃圾债利差就越大。<br>
                <span class="glossary-label">专业解读：</span> 信用周期最敏感的温度计，通常在衰退前先行上行。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下行 = 🟢 利好 (信用压力缓解)</span>
                <span class="bearish">⬆️ 上行 = 🔴 利空 (违约风险上升)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">2. HY 利差趋势 (13周变化) - 权重 30%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 近 13 周利差的加速方向。<br>
                <span class="glossary-label">通俗解释：</span> 利差突然走阔，说明“信用压力在加速恶化”。<br>
                <span class="glossary-label">专业解读：</span> 捕捉信用风险的拐点和爆发阶段。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 收敛 = 🟢 利好 (压力减速)</span>
                <span class="bearish">⬆️ 扩大 = 🔴 利空 (风险加速)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">3. BAA-10Y 利差 (Investment Grade Stress) - 权重 20%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 投资级信用利差相对国债。<br>
                <span class="glossary-label">通俗解释：</span> 就算是“好公司”，融资成本也在变贵。<br>
                <span class="glossary-label">专业解读：</span> 反映更广义、稳态的融资成本压力，避免 HY 单一波动过度主导。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下行 = 🟢 利好 (稳态融资改善)</span>
                <span class="bearish">⬆️ 上行 = 🔴 利空 (融资环境收紧)</span>
            </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📄 查看 原始数据明细"):
        st.dataframe(
            df[['HY_Spread', 'BAA10Y', 'Score_HY_Level', 'Score_HY_Trend', 'Score_BAA_Level', 'Total_Score']]
            .sort_index(ascending=False)
        )
