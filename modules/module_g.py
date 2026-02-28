import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import numpy as np

# ==========================================
# 模块 G: 风险偏好 (Risk Appetite)
# ==========================================
def render_module_g(df_all):
    df = df_all.copy()
    # 组合 Yahoo + FRED（优先 Yahoo，缺失处用 FRED 补）
    vix_yh = df['VIX_YH'] if 'VIX_YH' in df.columns else None
    vix_fd = df['VIXCLS'] if 'VIXCLS' in df.columns else None
    vxv_yh = df['VXV_YH'] if 'VXV_YH' in df.columns else None
    vxv_fd = df['VXVCLS'] if 'VXVCLS' in df.columns else None
    df['VIX'] = vix_yh.combine_first(vix_fd) if vix_yh is not None else vix_fd
    df['VXV'] = vxv_yh.combine_first(vxv_fd) if vxv_yh is not None else vxv_fd

    required_cols = ['SP500', 'VIX', 'VXV']
    if df.dropna(subset=required_cols).empty:
        st.warning("G模块数据不足（VIX/VXV/SPX），Yahoo 可能未返回数据，已尝试回退 FRED。请稍后刷新。")
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
        score = series.clip(lower=0, upper=100)
        return score

    # 已合并 VIX/VXV
    df['VIX_VXV'] = df['VIX'] / df['VXV']
    df['SPX'] = df['SP500']

    df['Score_VIX'] = bounded_score(100 - rolling_percentile(df['VIX']))
    df['Score_Term'] = bounded_score(100 - rolling_percentile(df['VIX_VXV']))
    df['Score_Mom'] = bounded_score(rolling_percentile(df['SPX'].diff(65)))

    df['Total_Score'] = bounded_score(
        df['Score_Term'] * 0.4 +
        df['Score_VIX'] * 0.3 +
        df['Score_Mom'] * 0.3
    )
    df[['Score_VIX','Score_Term','Score_Mom','Total_Score']] = df[['Score_VIX','Score_Term','Score_Mom','Total_Score']].fillna(50.0)

    df_view = df[df.index >= '2020-01-01'].copy()
    latest = df.iloc[-1]
    prev_week = prev_week_row(df)

    c1, c2, c3 = st.columns(3)
    score_color = "#09ab3b" if latest['Total_Score'] > 50 else "#ff2b2b"
    c1.markdown(f"""
        <div class="metric-card">
            <div class="metric-label">G模块综合得分（日频）</div>
            <div class="metric-value" style="color: {score_color}">{latest['Total_Score']:.1f}</div>
            <div class="metric-label">vs上周: {latest['Total_Score'] - prev_week['Total_Score']:.1f}</div>
        </div>
    """, unsafe_allow_html=True)

    c2.metric("VIX", f"{latest['VIX']:.1f}", f"{(latest['VIX'] - prev_week['VIX']):.1f} (vs上周)", delta_color="inverse")
    c3.metric("VIX/VXV", f"{latest['VIX_VXV']:.2f}", f"{(latest['VIX_VXV'] - prev_week['VIX_VXV']):.2f} (vs上周)", delta_color="inverse")

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("##### 🧩 因子细分得分")
    s1, s2, s3 = st.columns(3)
    def sub_card(label, val):
        col = "#09ab3b" if val > 50 else "#ff2b2b"
        return f"""<div class="sub-card"><div class="sub-label">{label}</div><div class="sub-value" style="color:{col}">{val:.1f}</div></div>"""
    s1.markdown(sub_card("期限结构 (40%)", latest['Score_Term']), unsafe_allow_html=True)
    s2.markdown(sub_card("VIX水平 (30%)", latest['Score_VIX']), unsafe_allow_html=True)
    s3.markdown(sub_card("SPX动量 (30%)", latest['Score_Mom']), unsafe_allow_html=True)

    st.divider()
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df_view.index, y=df_view['VIX'], name='VIX', line=dict(color='#ef4444', width=2)))
    fig.add_trace(go.Scatter(x=df_view.index, y=df_view['VIX_VXV'], name='VIX/VXV', yaxis='y2', line=dict(color='#2563eb', width=2)))
    fig.add_hline(y=15, line_dash="dash", line_color="#16a34a", annotation_text="低恐慌上沿(15)")
    fig.add_hline(y=25, line_dash="dash", line_color="#f59e0b", annotation_text="警戒上沿(25)")
    fig.update_layout(
        height=380,
        title="风险偏好：VIX 与期限结构",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode="x unified",
        yaxis=dict(title='VIX'),
        yaxis2=dict(title='VIX/VXV', overlaying='y', side='right')
    )
    st.plotly_chart(fig, use_container_width=True)

    fig_mom = go.Figure()
    fig_mom.add_trace(go.Scatter(x=df_view.index, y=df_view['SPX'], name='SPX', line=dict(color='#10b981', width=2)))
    fig_mom.add_trace(go.Bar(x=df_view.index, y=df_view['SPX'].diff(65), name='SPX 动量', marker_color='rgba(16,185,129,0.25)', yaxis='y2'))
    fig_mom.add_hline(y=0, line_dash="dash", line_color="#9ca3af", yref="y2", annotation_text="拐点(0)")
    fig_mom.add_hline(y=200, line_dash="dash", line_color="#16a34a", yref="y2", annotation_text="强势线(200)")
    fig_mom.add_hline(y=-200, line_dash="dash", line_color="#dc2626", yref="y2", annotation_text="弱势线(-200)")
    fig_mom.update_layout(
        height=380,
        title="风险偏好：SPX 价格与动量",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode="x unified",
        yaxis=dict(title='SPX'),
        yaxis2=dict(title='动量', overlaying='y', side='right', showgrid=False)
    )
    st.plotly_chart(fig_mom, use_container_width=True)

    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📚 G模块：因子专业定义与量化逻辑 (点击展开)", expanded=False):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
            <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
            <div class="glossary-content">
                <b>G模块回答的问题：</b> “市场更倾向冒险还是避险？”<br><br>
                <b>为什么选择这三个因子？</b> 因为它们分别代表风险偏好的三个层面：<br>
                &nbsp;&nbsp;• <b>VIX</b>：恐慌程度（情绪）<br>
                &nbsp;&nbsp;• <b>VIX/VXV</b>：短期恐慌是否突然升温（期限结构）<br>
                &nbsp;&nbsp;• <b>SPX动量</b>：风险偏好的价格验证（行为）<br><br>
                <b>打分方式：</b> 因子通过历史百分位映射到 <b>0-100</b> 并裁剪。数值越高代表风险越大，因此 <b>Score = 100 - Percentile</b>。<br>
                <b>权重：</b> 期限结构 40% + VIX 水平 30% + SPX 动量 30%。
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">1. VIX (隐含波动率) - 权重 30%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 标普500期权隐含波动率。<br>
                <span class="glossary-label">通俗解释：</span> VIX 就像“市场恐惧指数”。越高越害怕。<br>
                <span class="glossary-label">专业解读：</span> 风险偏好下降最直观的信号。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下行 = 🟢 利好 (恐慌缓解)</span>
                <span class="bearish">⬆️ 上行 = 🔴 利空 (避险情绪升温)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">2. VIX/VXV (期限结构) - 权重 40%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 1个月波动率 / 3个月波动率。<br>
                <span class="glossary-label">通俗解释：</span> 比值 > 1 说明“短期恐慌”比“中期恐慌”更强。<br>
                <span class="glossary-label">专业解读：</span> 风险偏好恶化的核心信号，常伴随快速下跌。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 低于 1 = 🟢 利好 (结构稳定)</span>
                <span class="bearish">⬆️ 高于 1 = 🔴 利空 (短端恐慌)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">3. SPX 动量 (风险资产趋势) - 权重 30%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 标普500近季度动量。<br>
                <span class="glossary-label">通俗解释：</span> 股市在涨，代表资金愿意冒险；下跌代表避险。<br>
                <span class="glossary-label">专业解读：</span> 价格层面的风险偏好验证。
            </div>
            <div class="logic-row">
                <span class="bullish">⬆️ 上行 = 🟢 利好 (风险偏好回升)</span>
                <span class="bearish">⬇️ 下行 = 🔴 利空 (风险偏好收缩)</span>
            </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📄 查看 原始数据明细"):
        st.dataframe(
            df[['VIX', 'VXV', 'VIX_VXV', 'SPX', 'Score_Term', 'Score_VIX', 'Score_Mom', 'Total_Score']]
            .sort_index(ascending=False)
        )
