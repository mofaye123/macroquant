import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from datetime import timedelta
import numpy as np
import yfinance as yf


@st.cache_data(ttl=300)
def _get_realtime_cross_asset():
    """
    获取实时跨资产快照（Yahoo，可能有15min~20min延迟）
    返回:
        close_df: 日频收盘价表（列为ticker）
    """
    ticker_map = {
        "ZN": "ZN=F",          # 10Y UST Futures
        "ZB": "ZB=F",          # 30Y UST Futures
        "Y5": "^FVX",          # 5Y yield *10
        "Y10": "^TNX",         # 10Y yield *10
        "Y30": "^TYX",         # 30Y yield *10
        "IXIC": "^IXIC",
        "SPX": "^GSPC",
        "GLD": "GLD",
        "DXY": "DX-Y.NYB",
        "USDJPY": "JPY=X",
        "LQD": "LQD",
        "HYG": "HYG",
        "JNK": "JNK",
    }

    tickers = sorted(set(ticker_map.values()))
    raw = yf.download(
        tickers=tickers,
        period="40d",
        interval="1d",
        progress=False,
        auto_adjust=False,
        threads=False
    )

    if raw is None or raw.empty:
        return pd.DataFrame()

    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" not in raw.columns.levels[0]:
            return pd.DataFrame()
        close_df = raw["Close"].copy()
    else:
        if "Close" not in raw.columns:
            return pd.DataFrame()
        if len(tickers) == 1:
            close_df = raw[["Close"]].copy()
            close_df.columns = [tickers[0]]
        else:
            close_df = pd.DataFrame()

    # 统一为无时区index
    if hasattr(close_df.index, "tz") and close_df.index.tz is not None:
        close_df.index = close_df.index.tz_localize(None)

    return close_df.sort_index()


def _latest_and_change(series):
    s = series.dropna()
    if len(s) < 2:
        return np.nan, np.nan
    last = float(s.iloc[-1])
    prev = float(s.iloc[-2])
    chg = np.nan if prev == 0 else (last / prev - 1.0) * 100.0
    return last, chg


def _latest_and_diff(series, scale=1.0):
    s = series.dropna()
    if len(s) < 2:
        return np.nan, np.nan
    last = float(s.iloc[-1]) * scale
    prev = float(s.iloc[-2]) * scale
    return last, last - prev


def _fmt_num(x, suffix="", digits=2):
    if pd.isna(x):
        return "-"
    return f"{x:.{digits}f}{suffix}"


def _fmt_signed(x, suffix="", digits=2):
    if pd.isna(x):
        return "-"
    sign = "+" if x >= 0 else ""
    return f"{sign}{x:.{digits}f}{suffix}"


def _render_realtime_panel():
    close_df = _get_realtime_cross_asset()
    if close_df.empty:
        st.info("实时跨资产看板暂不可用（Yahoo数据拉取失败），请稍后刷新。")
        return

    # 读取关键资产
    zn = close_df["ZN=F"] if "ZN=F" in close_df.columns else pd.Series(dtype=float)
    zb = close_df["ZB=F"] if "ZB=F" in close_df.columns else pd.Series(dtype=float)
    y5 = close_df["^FVX"] if "^FVX" in close_df.columns else pd.Series(dtype=float)
    y10 = close_df["^TNX"] if "^TNX" in close_df.columns else pd.Series(dtype=float)
    y30 = close_df["^TYX"] if "^TYX" in close_df.columns else pd.Series(dtype=float)
    ixic = close_df["^IXIC"] if "^IXIC" in close_df.columns else pd.Series(dtype=float)
    spx = close_df["^GSPC"] if "^GSPC" in close_df.columns else pd.Series(dtype=float)
    gld = close_df["GLD"] if "GLD" in close_df.columns else pd.Series(dtype=float)
    dxy = close_df["DX-Y.NYB"] if "DX-Y.NYB" in close_df.columns else pd.Series(dtype=float)
    usdjpy = close_df["JPY=X"] if "JPY=X" in close_df.columns else pd.Series(dtype=float)
    lqd = close_df["LQD"] if "LQD" in close_df.columns else pd.Series(dtype=float)
    hyg = close_df["HYG"] if "HYG" in close_df.columns else pd.Series(dtype=float)
    jnk = close_df["JNK"] if "JNK" in close_df.columns else pd.Series(dtype=float)

    # 价格与涨跌
    zn_last, zn_chg = _latest_and_change(zn)
    zb_last, zb_chg = _latest_and_change(zb)
    ixic_last, ixic_chg = _latest_and_change(ixic)
    spx_last, spx_chg = _latest_and_change(spx)
    gld_last, gld_chg = _latest_and_change(gld)
    dxy_last, dxy_chg = _latest_and_change(dxy)
    usdjpy_last, usdjpy_chg = _latest_and_change(usdjpy)
    lqd_last, lqd_chg = _latest_and_change(lqd)
    hyg_last, hyg_chg = _latest_and_change(hyg)
    jnk_last, jnk_chg = _latest_and_change(jnk)

    # 收益率：Yahoo ^TNX/^FVX/^TYX 是收益率*10，转成%
    y5_last, y5_diff = _latest_and_diff(y5, scale=0.1)
    y10_last, y10_diff = _latest_and_diff(y10, scale=0.1)
    y30_last, y30_diff = _latest_and_diff(y30, scale=0.1)
    y5_bps = y5_diff * 100.0 if pd.notna(y5_diff) else np.nan
    y10_bps = y10_diff * 100.0 if pd.notna(y10_diff) else np.nan
    y30_bps = y30_diff * 100.0 if pd.notna(y30_diff) else np.nan

    # 结构判断
    bull_flattener = (
        pd.notna(y30_bps) and pd.notna(y5_bps) and
        (y30_bps < 0) and (y5_bps < 0) and (abs(y30_bps) > abs(y5_bps))
    )
    growth_scare_like = (
        bull_flattener and
        pd.notna(ixic_chg) and pd.notna(spx_chg) and
        (ixic_chg < 0) and (spx_chg < 0)
    )
    credit_stable = (
        pd.notna(lqd_chg) and pd.notna(hyg_chg) and pd.notna(jnk_chg) and
        (lqd_chg >= 0) and (hyg_chg > -0.6) and (jnk_chg > -0.6)
    )
    no_usd_squeeze = (
        pd.notna(dxy_chg) and pd.notna(usdjpy_chg) and
        (abs(dxy_chg) < 0.5) and (usdjpy_chg <= 0)
    )

    st.markdown("##### ⚡ 实时跨资产验证看板")
    st.caption("数据源: Yahoo Finance（近实时，可能有延迟）。该面板用于盘面验证，不直接写入D模块得分。")

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(
            f"""
            <div class="sub-card">
                <div class="sub-label">债市先行动量</div>
                <div class="sub-value">{_fmt_signed(zn_chg, '%')} / {_fmt_signed(zb_chg, '%')}</div>
                <div class="sub-label">ZN={_fmt_num(zn_last)} | ZB={_fmt_num(zb_last)}</div>
            </div>
            """,
            unsafe_allow_html=True
        )
    with c2:
        curve_tag = "Bull Flattener" if bull_flattener else "非Bull Flattener"
        st.markdown(
            f"""
            <div class="sub-card">
                <div class="sub-label">收益率结构</div>
                <div class="sub-value">30Y {_fmt_signed(y30_bps, 'bp', 1)} / 5Y {_fmt_signed(y5_bps, 'bp', 1)}</div>
                <div class="sub-label">{curve_tag}</div>
            </div>
            """,
            unsafe_allow_html=True
        )
    with c3:
        st.markdown(
            f"""
            <div class="sub-card">
                <div class="sub-label">权益补跌验证</div>
                <div class="sub-value">IXIC {_fmt_signed(ixic_chg, '%')} / SPX {_fmt_signed(spx_chg, '%')}</div>
                <div class="sub-label">成长链条敏感度优先观察</div>
            </div>
            """,
            unsafe_allow_html=True
        )
    with c4:
        st.markdown(
            f"""
            <div class="sub-card">
                <div class="sub-label">信用与美元状态</div>
                <div class="sub-value">LQD {_fmt_signed(lqd_chg, '%')} | HYG {_fmt_signed(hyg_chg, '%')}</div>
                <div class="sub-label">DXY {_fmt_signed(dxy_chg, '%')} | USDJPY {_fmt_signed(usdjpy_chg, '%')}</div>
            </div>
            """,
            unsafe_allow_html=True
        )

    verdict_lines = []
    if growth_scare_like:
        verdict_lines.append("债市先定价增长放缓、股市补跌：更接近估值压缩/风险溢价重估。")
    if credit_stable:
        verdict_lines.append("信用未明显走扩（LQD稳、HY小幅波动）：暂不支持系统性信用压力。")
    if no_usd_squeeze:
        verdict_lines.append("DXY稳定且USDJPY偏弱：暂不支持美元荒/全球美元挤兑。")
    if pd.notna(gld_chg) and pd.notna(y10_bps) and gld_chg < 0 and y10_bps < 0:
        verdict_lines.append("黄金与长端同跌：更像仓位去杠杆与流动性再分配，而非单一实际利率冲击。")
    if not verdict_lines:
        verdict_lines.append("当前盘面信号混合，未形成单一高置信宏观叙事，建议继续观察下一个交易日确认。")

    st.markdown("##### 盘面结构结论（自动解读）")
    for line in verdict_lines:
        st.markdown(f"- {line}")

    snapshot = pd.DataFrame(
        [
            {"资产": "ZN=F", "最新": _fmt_num(zn_last), "日变动": _fmt_signed(zn_chg, "%")},
            {"资产": "ZB=F", "最新": _fmt_num(zb_last), "日变动": _fmt_signed(zb_chg, "%")},
            {"资产": "5Y收益率", "最新": _fmt_num(y5_last, "%"), "日变动": _fmt_signed(y5_bps, "bp", 1)},
            {"资产": "10Y收益率", "最新": _fmt_num(y10_last, "%"), "日变动": _fmt_signed(y10_bps, "bp", 1)},
            {"资产": "30Y收益率", "最新": _fmt_num(y30_last, "%"), "日变动": _fmt_signed(y30_bps, "bp", 1)},
            {"资产": "IXIC", "最新": _fmt_num(ixic_last), "日变动": _fmt_signed(ixic_chg, "%")},
            {"资产": "SPX", "最新": _fmt_num(spx_last), "日变动": _fmt_signed(spx_chg, "%")},
            {"资产": "LQD", "最新": _fmt_num(lqd_last), "日变动": _fmt_signed(lqd_chg, "%")},
            {"资产": "HYG", "最新": _fmt_num(hyg_last), "日变动": _fmt_signed(hyg_chg, "%")},
            {"资产": "JNK", "最新": _fmt_num(jnk_last), "日变动": _fmt_signed(jnk_chg, "%")},
            {"资产": "GLD", "最新": _fmt_num(gld_last), "日变动": _fmt_signed(gld_chg, "%")},
            {"资产": "DXY", "最新": _fmt_num(dxy_last), "日变动": _fmt_signed(dxy_chg, "%")},
            {"资产": "USDJPY", "最新": _fmt_num(usdjpy_last), "日变动": _fmt_signed(usdjpy_chg, "%")},
        ]
    )
    with st.expander("查看实时原始快照"):
        st.dataframe(snapshot, use_container_width=True, hide_index=True)

# ==========================================
# 7. 模块 D: 实际利率与通胀预期
# ==========================================
def render_module_d(df_raw):
    """
    D模块: 实际利率与通胀预期
    逻辑:
    1. 实际利率 (Real Rates): 名义 - 通胀预期。它是“真实”的资金成本。越低越好。
    2. 通胀预期 (Breakeven): MID_BEST 逻辑 (太高=通胀失控，太低=通缩衰退)
    """
    df = df_raw.copy()
    required_cols = ['DFII10', 'DFII5', 'T10YIE']
    if df.dropna(subset=required_cols).empty:
        st.warning("D模块数据不足（实际利率/通胀预期），请稍后刷新。")
        return
    df = df.dropna(subset=required_cols)

    def prev_week_row(frame, days=7):
        target = frame.index[-1] - pd.Timedelta(days=days)
        idx = frame.index.get_indexer([target], method='nearest')[0]
        return frame.iloc[idx]
    
    # --- 1. 因子计算 ---
    # 1.1 实际利率得分 (越低越好)
    # 逻辑: 实际利率飙升是风险资产最大的杀手 (参考2022年)
    def get_real_rate_score(series):
        # 同样使用反向排名：值越高，排名越低，分数越低
        return series.rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
    
    df['Score_Real_10Y'] = get_real_rate_score(df['DFII10'])
    df['Score_Real_5Y'] = get_real_rate_score(df['DFII5'])

    # 1.2 通胀预期得分 (MID_BEST 逻辑)
    # 美联储目标是 2%，市场通常允许在 2.0% - 2.5% 之间
    # Target: 2.1%, 舒适区间: [1.5%, 2.7%]
    def get_inflation_score(series, target=2.1, tolerance=0.6):
        deviation = (series - target).abs()
        score = 100 - (deviation / tolerance * 80)
        return score.clip(0, 100)
    
    df['Score_Breakeven'] = get_inflation_score(df['T10YIE'], target=2.1, tolerance=0.6)

    # --- 2. 综合得分 ---
    df['Total_Score'] = (
        df['Score_Real_10Y'] * 0.40 + 
        df['Score_Real_5Y'] * 0.30 +
        df['Score_Breakeven'] * 0.30
    )

    # --- 3. 页面展示 ---
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    prev_week = prev_week_row(df)

    # KPI
    c1, c2, c3, c4 = st.columns(4)
    score_color = "#09ab3b" if latest['Total_Score'] > 50 else "#ff2b2b"
    
    c1.markdown(f"""
        <div class="metric-card">
        <div class="metric-label">D模块综合得分 (日频)</div>
        <div class="metric-value" style="color: {score_color}">{latest['Total_Score']:.1f}</div>
        <div class="metric-label">vs上周: {latest['Total_Score'] - prev_week['Total_Score']:.1f}</div>
        </div>
    """, unsafe_allow_html=True)

    # 实际利率
    c2.metric("10Y 实际利率 (TIPS)", f"{latest['DFII10']:.2f}%", f"{(latest['DFII10']-prev_week['DFII10'])*100:.0f} bps(vs上周)", delta_color="inverse")
    
    # 通胀预期 (Breakeven)
    be_val = latest['T10YIE']
    # 离2.1%越远越危险
    be_color = "normal" if 1.8 < be_val < 2.5 else "off"
    c3.metric("10Y 通胀预期 (Breakeven)", f"{be_val:.2f}%", f"{(be_val-prev_week['T10YIE'])*100:.0f} bps(vs上周)", delta_color=be_color)
    
    c4.metric("5Y 实际利率", f"{latest['DFII5']:.2f}%", f"{(latest['DFII5']-prev_week['DFII5'])*100:.0f} bps(vs上周)", delta_color="inverse")

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("##### 🧩 因子细分得分")
    
    s1, s2, s3 = st.columns(3)
    s1.markdown(f"""<div class="sub-card"><div class="sub-label">10Y 真实资金成本 (40%)</div><div class="sub-value" style="color:{'#09ab3b' if latest['Score_Real_10Y']>50 else '#ff2b2b'}">{latest['Score_Real_10Y']:.1f}</div></div>""", unsafe_allow_html=True)
    s2.markdown(f"""<div class="sub-card"><div class="sub-label">5Y 真实资金成本 (30%)</div><div class="sub-value" style="color:{'#09ab3b' if latest['Score_Real_5Y']>50 else '#ff2b2b'}">{latest['Score_Real_5Y']:.1f}</div></div>""", unsafe_allow_html=True)
    s3.markdown(f"""<div class="sub-card"><div class="sub-label">通胀预期锚定度 (30%)</div><div class="sub-value" style="color:{'#09ab3b' if latest['Score_Breakeven']>50 else '#ff2b2b'}">{latest['Score_Breakeven']:.1f}</div></div>""", unsafe_allow_html=True)

    st.divider()

    # --- 图表 ---
    col1, col2 = st.columns(2)

    # 图1: 实际利率趋势
    with col1:
        fig_real = go.Figure()
        df_view = df[df.index >= '2020-01-01']
        fig_real.add_trace(go.Scatter(x=df_view.index, y=df_view['DFII10'], name='10Y Real Rate',
                                    line=dict(color='#d97706', width=2), fill='tozeroy', fillcolor='rgba(217, 119, 6, 0.1)'))
        fig_real.add_hline(y=2.0, line_dash="dash", line_color="red", annotation_text="高压线 (>2%)")
        fig_real.add_hline(y=0.0, line_dash="dash", line_color="green", annotation_text="宽松区 (<0%)")
        
        fig_real.update_layout(title="10Y 实际利率 (资金的真实价格)", height=350,
                             yaxis_title="Real Rate (%)", hovermode="x unified",
                               paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
        st.plotly_chart(fig_real, use_container_width=True)

    # 图2: 通胀预期锚定区间 
    with col2:
        fig_be = go.Figure()
        fig_be.add_trace(go.Scatter(x=df_view.index, y=df_view['T10YIE'], name='通胀预期',
                                  line=dict(color='#8884d8', width=2)))
        
        # 舒适带 (1.8 - 2.5)
        fig_be.add_hrect(y0=1.8, y1=2.5, fillcolor="green", opacity=0.1, line_width=0, annotation_text="舒适区 (Goldilocks)")
        fig_be.add_hline(y=2.1, line_dash="dot", line_color="green")
        
        fig_be.update_layout(title="10Y 通胀预期 (Breakeven)", height=350,
                             yaxis_title="Inflation Exp (%)", hovermode="x unified",
                               paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
        st.plotly_chart(fig_be, use_container_width=True)

    st.divider()
    _render_realtime_panel()

    # 百科
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📚 D模块：因子专业定义与量化逻辑 (点击展开)", expanded=False):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #6c5ce7; background-color: #f8f6ff;">
            <div class="glossary-title" style="color: #6c5ce7;">📊 核心量化模型逻辑 (Methodology)</div>
            <div class="glossary-content">
                D模块剥离了名义利率中的“水分”，直击资金最硬核的成本。<br>
                <b>1. 实际利率 (Real Rate)：</b> 公式为 <code>名义利率 - 通胀预期</code>。这是企业和个人经过通胀调整后的真实还款压力。该因子权重最高，且越低得分越高。<br>
                <b>2. 通胀预期 (Breakeven)：</b> 采用 <b>MID_BEST</b> 模型。
                <br>&nbsp;&nbsp; <b>目标 (Target)</b>：2.1% (美联储的长期目标)。
                <br>&nbsp;&nbsp; <b>失锚 (De-anchoring)</b>：如果预期跌破 1.5% (通缩/萧条) 或 突破 2.7% (通胀失控)，模型都会给予低分惩罚。
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">1. 10Y 实际利率 (10Y Real Yield) - 权重 40%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> TIPS (通胀保值债券) 的收益率。<br>
                <span class="glossary-label">专业解读：</span> 金融条件的标尺。因为名义利率高不可怕，如果通胀也高，实际还款压力其实不大。但如果“名义高、通胀低”（高实际利率），那就是对企业的最大绞杀。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下行 (<0.5%) = 🟢 利好 (资金成本极低/刺激)</span>
                <span class="bearish">⬆️ 飙升 (>2.0%) = 🔴 利空 (强力紧缩/杀估值)</span>
            </div>
        </div>
        
        <div class="glossary-box">
            <div class="glossary-title">2. 5Y 实际利率 (5Y Real Yield) - 权重 30%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 中期真实融资成本。<br>
                <span class="glossary-label">专业解读：</span> 相比10Y，5Y实际利率对实体经济（如车贷、商业贷款）的敏感度更高。它是观察中期紧缩压力的窗口。
            </div>
            <div class="logic-row">
                <span class="bullish">⬇️ 下行 = 🟢 利好 (信贷需求恢复)</span>
                <span class="bearish">⬆️ 上行 = 🔴 利空 (实体经济承压)</span>
            </div>
        </div>

        <div class="glossary-box">
            <div class="glossary-title">3. 10Y Breakeven (盈亏平衡通胀率) - 权重 30%</div>
            <div class="glossary-content">
                <span class="glossary-label">含义：</span> 市场交易出来的未来10年平均通胀预期。<br>
                <span class="glossary-label">专业解读：</span> 美联储信誉的温度计。它不在于越低越好，而在于锚定。只要它稳定在 2.0%-2.5% 之间，美联储就敢降息（利好）；如果它失控飙升，美联储就必须加息杀通胀（利空）。
            </div>
            <div class="logic-row">
                <span class="bullish">锚定区间 (2.0-2.5%) = 🟢 中性利好 (央行掌控局面)</span>
                <span class="bearish">向上/向下失锚 = 🔴 双向利空 (通胀失控 or 通缩衰退)</span>
            </div>
        </div>
        """, unsafe_allow_html=True)
        

        st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📄 查看 原始数据明细"):
        st.dataframe(df.sort_index(ascending=False))
        
