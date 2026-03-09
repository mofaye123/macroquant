#!/usr/bin/env python3
"""
Generate backtest diagnostic charts from the published static macro snapshot.

Outputs:
  - 2024_drawdown_diagnosis.html
  - nav_overlay_diagnostics.html
  - hedge_signal_breakdown.html
  - diagnostic_metrics.csv
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from modules.backtest import DEFAULT_BACKTEST_PRESET, _calculate_score_internal, run_strategy_logic


SNAPSHOT_PATH = ROOT / "web" / "public" / "data" / "macro-data.json"
OUTPUT_DIR = ROOT / "outputs" / "backtest_diagnostics"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

INITIAL_CAPITAL = 100_000.0
OVERLAY_CFG = {
    "cta_capital_weight": 0.95,
    "hedge_capital_weight": 0.05,
    "hedge_leverage": 5.0,
    "hedge_funding_annual": 0.10,
    "hedge_oneway_bps": 8.0,
    "vix_vxv_threshold": 1.02,
    "macro_drop_threshold": 8.0,
    "hy_spike_threshold": 0.40,
    "btc_dd_threshold": 0.12,
}
HEDGE_NOTIONAL_MAX = OVERLAY_CFG["hedge_capital_weight"] * OVERLAY_CFG["hedge_leverage"]


def _load_snapshot() -> tuple[pd.DataFrame, pd.DataFrame]:
    payload = json.loads(SNAPSHOT_PATH.read_text())
    raw = payload["modules"]["e"]["rawTable"]
    df_all = pd.DataFrame(raw["rows"], columns=raw["columns"])
    df_all["Date"] = pd.to_datetime(df_all["Date"])
    df_all = df_all.sort_values("Date").set_index("Date")
    for col in df_all.columns:
        df_all[col] = pd.to_numeric(df_all[col], errors="coerce")

    score_series = pd.DataFrame(payload["dashboard"]["scoreSeries"])
    score_series["date"] = pd.to_datetime(score_series["date"])
    score_series = score_series.sort_values("date").set_index("date")
    score_series["value"] = pd.to_numeric(score_series["value"], errors="coerce")
    return df_all, score_series


def _compute_cta(df_all: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    score_frame = _calculate_score_internal(df_all)
    if score_frame.empty:
        raise RuntimeError("Macro score frame is empty.")

    price = df_all[["CBBTCUSD"]].rename(columns={"CBBTCUSD": "Price"}).dropna()
    if price.empty:
        raise RuntimeError("BTC price series is empty.")

    df = price.join(score_frame[["Total_Score"]], how="inner").dropna()
    cta = run_strategy_logic(
        df,
        "Price",
        "Bitcoin",
        macro_lag_days=int(DEFAULT_BACKTEST_PRESET["macro_lag_days"]),
        one_way_cost_bps=5.0,
        risk_free_rate=float(DEFAULT_BACKTEST_PRESET["risk_free_rate"]),
        max_leverage=float(DEFAULT_BACKTEST_PRESET["max_leverage"]),
        strategy_cfg=DEFAULT_BACKTEST_PRESET["cfg"],
        allow_short=bool(DEFAULT_BACKTEST_PRESET["allow_short"]),
        short_leverage=float(DEFAULT_BACKTEST_PRESET["short_leverage"]),
        short_min_risk_count=int(DEFAULT_BACKTEST_PRESET["short_min_risk_count"]),
    )
    return cta, score_frame


def _compute_overlay_signals(cta: pd.DataFrame, df_all: pd.DataFrame) -> pd.DataFrame:
    df = pd.DataFrame(index=cta.index)
    df["Price"] = cta["Price"]
    df["EMA20"] = cta["EMA20"]
    df["EMA60"] = cta["EMA60"]
    df["EMA120"] = cta["EMA120"]
    df["Total_Score"] = cta["Score_Regime"]
    df["VIX"] = df_all["VIXCLS"].reindex(df.index).ffill()
    df["VXV"] = df_all["VXVCLS"].reindex(df.index).ffill()
    df["HY_Spread"] = df_all["BAMLH0A0HYM2"].reindex(df.index).ffill()

    sig1 = (
        (df["Price"] < df["EMA120"])
        & (df["EMA20"] < df["EMA60"])
        & (df["EMA60"] < df["EMA120"])
        & (df["EMA120"].diff(3) < 0)
    ).fillna(False).astype(int)

    vix_vxv_ratio = (df["VIX"] / df["VXV"].replace(0, np.nan)).fillna(1.0)
    sig2 = (vix_vxv_ratio > OVERLAY_CFG["vix_vxv_threshold"]).astype(int)

    macro_drop_10d = df["Total_Score"] - df["Total_Score"].shift(10)
    sig3 = (macro_drop_10d < -OVERLAY_CFG["macro_drop_threshold"]).fillna(False).astype(int)

    hy_change_10d = df["HY_Spread"].diff(10)
    sig4 = (hy_change_10d > OVERLAY_CFG["hy_spike_threshold"]).fillna(False).astype(int)

    rolling_high_20 = df["Price"].rolling(20, min_periods=10).max()
    dd_20d = df["Price"] / rolling_high_20 - 1.0
    sig5 = (dd_20d < -OVERLAY_CFG["btc_dd_threshold"]).fillna(False).astype(int)

    composite = sig1 + sig2 + sig3 + sig4 + sig5
    hedge_target = np.select(
        [composite >= 4, composite == 3, composite == 2, composite == 1],
        [
            HEDGE_NOTIONAL_MAX * 1.00,
            HEDGE_NOTIONAL_MAX * 0.75,
            HEDGE_NOTIONAL_MAX * 0.50,
            HEDGE_NOTIONAL_MAX * 0.25,
        ],
        default=0.0,
    )

    hedge_exec = pd.Series(0.0, index=df.index)
    last_hedge = 0.0
    last_change_i = -999
    for i, target in enumerate(hedge_target):
        hold_ok = (i - last_change_i) >= 5
        if abs(float(target) - float(last_hedge)) >= 0.05 and hold_ok:
            last_hedge = float(target)
            last_change_i = i
        hedge_exec.iat[i] = last_hedge

    df["Sig_Tech_Break"] = sig1
    df["Sig_VIX_Invert"] = sig2
    df["Sig_Macro_Drop"] = sig3
    df["Sig_HY_Spike"] = sig4
    df["Sig_BTC_Momentum"] = sig5
    df["Risk_Score"] = composite
    df["VIX_VXV_Ratio"] = vix_vxv_ratio
    df["Macro_Drop_10d"] = macro_drop_10d
    df["HY_Change_10d"] = hy_change_10d
    df["DD_20d"] = dd_20d
    df["Hedge_Notional_Target"] = hedge_target
    df["Hedge_Position"] = hedge_exec.shift(1).fillna(0.0)

    hedge_tx_rate = OVERLAY_CFG["hedge_oneway_bps"] / 10000.0
    hedge_turnover = df["Hedge_Position"].diff().abs().fillna(df["Hedge_Position"].abs())
    df["Hedge_Tx_Cost"] = hedge_turnover * hedge_tx_rate
    df["Hedge_Fund_Cost"] = df["Hedge_Position"] * (OVERLAY_CFG["hedge_funding_annual"] / 252.0)
    df["Hedge_Total_Cost"] = df["Hedge_Tx_Cost"] + df["Hedge_Fund_Cost"]
    return df


def _build_combined_portfolio(cta: pd.DataFrame, hedge: pd.DataFrame) -> pd.DataFrame:
    rf_daily = float(DEFAULT_BACKTEST_PRESET["risk_free_rate"]) / 252.0
    cta_only_ret = cta["Strategy_Ret"].fillna(0.0)
    price_ret = cta["Pct_Change"].fillna(0.0)
    hedge_pos = hedge["Hedge_Position"].reindex(cta.index).fillna(0.0)
    hedge_cost = hedge["Hedge_Total_Cost"].reindex(cta.index).fillna(0.0)
    hedge_active_frac = (hedge_pos / HEDGE_NOTIONAL_MAX).clip(0.0, 1.0)

    hedge_short_pnl = -hedge_pos * price_ret
    hedge_idle_rf = OVERLAY_CFG["hedge_capital_weight"] * (1.0 - hedge_active_frac) * rf_daily
    hedge_net_ret = hedge_short_pnl + hedge_idle_rf - hedge_cost

    combined_ret = OVERLAY_CFG["cta_capital_weight"] * cta_only_ret + hedge_net_ret

    out = pd.DataFrame(index=cta.index)
    out["Price"] = cta["Price"]
    out["Pct_Change"] = price_ret
    out["CTA_Only_Ret"] = cta_only_ret
    out["Combined_Ret"] = combined_ret
    out["Hedge_Contrib"] = hedge_net_ret
    out["Hedge_Position"] = hedge_pos
    out["Risk_Score"] = hedge["Risk_Score"].reindex(cta.index).fillna(0.0)
    out["CTA_Position"] = cta["Position"]
    out["CTA_Target_Position"] = cta["Target_Position"]
    out["Total_Score"] = cta["Score_Regime"]
    out["Score_10D_Change"] = cta["Score_Regime"].diff(10)

    out["BH_Nav"] = (1.0 + out["Pct_Change"]).cumprod()
    out["CTA_Nav"] = (1.0 + out["CTA_Only_Ret"]).cumprod()
    out["Combined_Nav"] = (1.0 + out["Combined_Ret"]).cumprod()
    out["BH_Capital"] = out["BH_Nav"] * INITIAL_CAPITAL
    out["CTA_Capital"] = out["CTA_Nav"] * INITIAL_CAPITAL
    out["Combined_Capital"] = out["Combined_Nav"] * INITIAL_CAPITAL

    for nav_col, dd_col in [
        ("BH_Nav", "BH_DD"),
        ("CTA_Nav", "CTA_DD"),
        ("Combined_Nav", "Combined_DD"),
    ]:
        out[dd_col] = out[nav_col] / out[nav_col].cummax() - 1.0
    return out


def _pick_drawdown_dates(df: pd.DataFrame, n: int = 5, min_gap_days: int = 14) -> list[pd.Timestamp]:
    view = df.loc["2024-01-01":"2024-12-31"].copy()
    if view.empty:
        return []
    view = view.assign(dd20=view["Price"] / view["Price"].rolling(20, min_periods=10).max() - 1.0)
    candidates = view.nsmallest(20, "dd20")
    picked: list[pd.Timestamp] = []
    for ts in candidates.index:
        if all(abs((ts - prev).days) >= min_gap_days for prev in picked):
            picked.append(ts)
        if len(picked) >= n:
            break
    return sorted(picked)


def _apply_dark_layout(fig: go.Figure, title: str, height: int) -> go.Figure:
    fig.update_layout(
        title=title,
        template="plotly_dark",
        paper_bgcolor="#071226",
        plot_bgcolor="#16243b",
        font=dict(color="#e5eefc", family="Arial"),
        hovermode="x unified",
        height=height,
        margin=dict(l=50, r=30, t=70, b=40),
        legend=dict(orientation="h", yanchor="bottom", y=1.01, xanchor="right", x=1.0),
    )
    fig.update_xaxes(showgrid=True, gridcolor="rgba(148,163,184,0.15)")
    fig.update_yaxes(showgrid=True, gridcolor="rgba(148,163,184,0.15)")
    return fig


def _add_vertical_markers(fig: go.Figure, dates: list[pd.Timestamp], rows: int) -> None:
    for dt in dates:
        for row in range(1, rows + 1):
            fig.add_vline(
                x=dt,
                line_width=1.5,
                line_dash="dash",
                line_color="#ff3b30",
                row=row,
                col=1,
            )


def plot_2024_drawdown_diagnosis(df_port: pd.DataFrame, hedge: pd.DataFrame) -> Path:
    view = df_port.loc["2024-01-01":"2024-12-31"].copy()
    hedge_view = hedge.reindex(view.index)
    markers = _pick_drawdown_dates(view)

    fig = make_subplots(
        rows=5,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.035,
        row_heights=[0.28, 0.18, 0.20, 0.17, 0.17],
        subplot_titles=[
            "BTC价格 & EMA均线",
            "CTA仓位 & 多头确认",
            "宏观评分 & 10日变化",
            "VIX/VXV比率",
            "HY信用利差10日变化",
        ],
    )

    fig.add_trace(go.Scatter(x=view.index, y=view["Price"], name="BTC", line=dict(color="#f59e0b", width=2)), row=1, col=1)
    fig.add_trace(go.Scatter(x=view.index, y=view["Price"].ewm(span=20, adjust=False).mean(), name="EMA20", line=dict(color="#34d399", width=1.5, dash="dot")), row=1, col=1)
    fig.add_trace(go.Scatter(x=view.index, y=view["Price"].ewm(span=60, adjust=False).mean(), name="EMA60", line=dict(color="#60a5fa", width=1.5, dash="dot")), row=1, col=1)
    fig.add_trace(go.Scatter(x=view.index, y=view["Price"].ewm(span=120, adjust=False).mean(), name="EMA120", line=dict(color="#c084fc", width=2)), row=1, col=1)

    bull_confirm = (
        (view["Price"] > view["Price"].ewm(span=20, adjust=False).mean())
        & (view["Price"].ewm(span=20, adjust=False).mean() > view["Price"].ewm(span=60, adjust=False).mean())
        & (view["Price"].ewm(span=60, adjust=False).mean() > view["Price"].ewm(span=120, adjust=False).mean())
    )
    fig.add_trace(go.Scatter(x=view.index, y=view["CTA_Target_Position"], name="CTA仓位", line=dict(color="#60a5fa", width=2), fill="tozeroy", fillcolor="rgba(96,165,250,0.18)"), row=2, col=1)
    fig.add_trace(go.Scatter(x=view.index[bull_confirm], y=np.full(int(bull_confirm.sum()), 1.85), name="多头确认", mode="markers", marker=dict(color="#34d399", size=7, symbol="triangle-up")), row=2, col=1)

    score_change = view["Total_Score"].diff(10)
    pos_mask = score_change >= 0
    neg_mask = score_change < 0
    fig.add_trace(go.Scatter(x=view.index, y=view["Total_Score"], name="宏观评分", line=dict(color="#a78bfa", width=2)), row=3, col=1)
    fig.add_trace(go.Bar(x=view.index[pos_mask], y=score_change[pos_mask], name="10日变化(+)", marker_color="#5eead4", opacity=0.8), row=3, col=1)
    fig.add_trace(go.Bar(x=view.index[neg_mask], y=score_change[neg_mask], name="10日变化(-)", marker_color="#fbbf24", opacity=0.8), row=3, col=1)
    fig.add_hline(y=-8.0, line_color="#ff3b30", line_dash="dash", annotation_text="触发阈值 -8.0", row=3, col=1)

    fig.add_trace(go.Scatter(x=hedge_view.index, y=hedge_view["VIX_VXV_Ratio"], name="VIX/VXV", line=dict(color="#fb923c", width=2)), row=4, col=1)
    fig.add_hline(y=1.02, line_color="#ff3b30", line_dash="dash", annotation_text="倒挂阈值 1.02", row=4, col=1)
    fig.add_hline(y=1.0, line_color="rgba(255,255,255,0.35)", line_dash="dot", row=4, col=1)

    hy_change = hedge_view["HY_Change_10d"]
    fig.add_trace(go.Bar(x=hedge_view.index[hy_change >= 0], y=hy_change[hy_change >= 0], name="HY变化(+)", marker_color="#fcd34d", opacity=0.9), row=5, col=1)
    fig.add_trace(go.Bar(x=hedge_view.index[hy_change < 0], y=hy_change[hy_change < 0], name="HY变化(-)", marker_color="#5eead4", opacity=0.9), row=5, col=1)
    fig.add_hline(y=0.4, line_color="#ff3b30", line_dash="dash", annotation_text="跳扩阈值 +0.4", row=5, col=1)

    _add_vertical_markers(fig, markers, rows=5)
    fig.update_yaxes(title_text="美元", row=1, col=1)
    fig.update_yaxes(title_text="仓位", row=2, col=1, range=[0, 2.1])
    fig.update_yaxes(title_text="分数", row=3, col=1)
    fig.update_yaxes(title_text="比率", row=4, col=1)
    fig.update_yaxes(title_text="变化(%)", row=5, col=1)
    _apply_dark_layout(fig, "2024年回撤诊断：BTC / 宏观 / 风险信号", 1400)

    path = OUTPUT_DIR / "2024_drawdown_diagnosis.html"
    fig.write_html(path)
    return path


def plot_nav_overlay_diagnostics(df_port: pd.DataFrame) -> Path:
    fig = make_subplots(
        rows=4,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.035,
        row_heights=[0.33, 0.23, 0.22, 0.22],
        subplot_titles=["NAV 对比曲线", "回撤", "对冲仓位 & 综合风险信号", "宏观评分"],
    )
    fig.add_trace(go.Scatter(x=df_port.index, y=df_port["BH_Capital"], name="买入持有", line=dict(color="#cbd5e1", width=2)), row=1, col=1)
    fig.add_trace(go.Scatter(x=df_port.index, y=df_port["CTA_Capital"], name="纯CTA策略", line=dict(color="#3b82f6", width=2)), row=1, col=1)
    fig.add_trace(go.Scatter(x=df_port.index, y=df_port["Combined_Capital"], name="CTA+对冲组合", line=dict(color="#10b981", width=2)), row=1, col=1)

    for dd_col, label, color in [
        ("BH_DD", "买入持有回撤", "#94a3b8"),
        ("CTA_DD", "纯CTA策略回撤", "#3b82f6"),
        ("Combined_DD", "CTA+对冲回撤", "#10b981"),
    ]:
        fig.add_trace(go.Scatter(x=df_port.index, y=df_port[dd_col] * 100, name=label, line=dict(color=color, width=1.5), fill="tozeroy", fillcolor=f"rgba({int(color[1:3],16)},{int(color[3:5],16)},{int(color[5:7],16)},0.10)"), row=2, col=1)

    fig.add_trace(go.Bar(x=df_port.index, y=df_port["Hedge_Position"] * 100, name="对冲空头名义(%)", marker_color="rgba(239,68,68,0.65)"), row=3, col=1)
    fig.add_trace(go.Scatter(x=df_port.index, y=df_port["Risk_Score"], name="综合风险信号(0-5)", line=dict(color="#f59e0b", width=2)), row=3, col=1)
    fig.add_trace(go.Scatter(x=df_port.index, y=df_port["Total_Score"], name="宏观评分", line=dict(color="#8b5cf6", width=2)), row=4, col=1)
    fig.add_hrect(y0=0, y1=35, fillcolor="rgba(239,68,68,0.07)", line_width=0, row=4, col=1)
    fig.add_hrect(y0=65, y1=100, fillcolor="rgba(16,185,129,0.07)", line_width=0, row=4, col=1)

    fig.update_yaxes(title_text="NAV", row=1, col=1)
    fig.update_yaxes(title_text="回撤%", row=2, col=1)
    fig.update_yaxes(title_text="名义%", row=3, col=1)
    fig.update_yaxes(title_text="分数", row=4, col=1, range=[0, 100])
    _apply_dark_layout(fig, "BTC 宏观CTA + 尾部对冲：NAV / 回撤 / 风险信号", 1300)

    path = OUTPUT_DIR / "nav_overlay_diagnostics.html"
    fig.write_html(path)
    return path


def plot_signal_breakdown(cta: pd.DataFrame, hedge: pd.DataFrame) -> Path:
    fig = make_subplots(
        rows=5,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.03,
        row_heights=[0.22, 0.17, 0.18, 0.16, 0.27],
        subplot_titles=[
            "BTC价格 & EMA均线",
            "信号1 技术破位",
            "信号2-4 VIX / 宏观 / HY",
            "信号5 BTC动量回撤",
            "综合风险评分 & 对冲名义",
        ],
    )

    fig.add_trace(go.Scatter(x=cta.index, y=cta["Price"], name="BTC", line=dict(color="#f8fafc", width=2)), row=1, col=1)
    fig.add_trace(go.Scatter(x=cta.index, y=cta["EMA20"], name="EMA20", line=dict(color="#60a5fa", width=1.5)), row=1, col=1)
    fig.add_trace(go.Scatter(x=cta.index, y=cta["EMA60"], name="EMA60", line=dict(color="#f59e0b", width=1.5)), row=1, col=1)
    fig.add_trace(go.Scatter(x=cta.index, y=cta["EMA120"], name="EMA120", line=dict(color="#fb7185", width=1.7)), row=1, col=1)

    fig.add_trace(go.Bar(x=hedge.index, y=hedge["Sig_Tech_Break"], name="信号1 技术破位", marker_color="rgba(127,29,29,0.8)"), row=2, col=1)
    fig.add_trace(go.Scatter(x=hedge.index, y=hedge["VIX_VXV_Ratio"], name="VIX/VXV", line=dict(color="#f97316", width=1.6)), row=3, col=1)
    fig.add_trace(go.Scatter(x=hedge.index, y=hedge["Macro_Drop_10d"], name="宏观10日变化", line=dict(color="#c084fc", width=1.6)), row=3, col=1)
    fig.add_trace(go.Scatter(x=hedge.index, y=hedge["HY_Change_10d"], name="HY 10日变化", line=dict(color="#fbbf24", width=1.6)), row=3, col=1)
    fig.add_hline(y=1.02, line_color="#f97316", line_dash="dot", row=3, col=1)
    fig.add_hline(y=-8.0, line_color="#c084fc", line_dash="dash", row=3, col=1)
    fig.add_hline(y=0.4, line_color="#fbbf24", line_dash="dash", row=3, col=1)

    fig.add_trace(go.Bar(x=hedge.index, y=hedge["Sig_BTC_Momentum"], name="信号5 BTC动量回撤", marker_color="rgba(56,189,248,0.75)"), row=4, col=1)
    fig.add_trace(go.Bar(x=hedge.index, y=hedge["Hedge_Position"] * 100, name="对冲空头名义(%)", marker_color="rgba(127,29,29,0.65)"), row=5, col=1)
    fig.add_trace(go.Scatter(x=hedge.index, y=hedge["Risk_Score"], name="综合风险评分", line=dict(color="#facc15", width=2.2)), row=5, col=1)
    fig.add_hline(y=1.0, line_color="#facc15", line_dash="dash", annotation_text="≥1信号激活", row=5, col=1)

    fig.update_yaxes(title_text="美元", row=1, col=1)
    fig.update_yaxes(title_text="开关", row=2, col=1, range=[0, 1.1])
    fig.update_yaxes(title_text="信号值", row=3, col=1)
    fig.update_yaxes(title_text="开关", row=4, col=1, range=[0, 1.1])
    fig.update_yaxes(title_text="名义% / 分值", row=5, col=1)
    _apply_dark_layout(fig, "对冲信号分解图：技术 / 波动率 / 宏观 / 信用 / 动量", 1450)

    path = OUTPUT_DIR / "hedge_signal_breakdown.html"
    fig.write_html(path)
    return path


def _perf_row(name: str, nav: pd.Series, ret: pd.Series) -> dict[str, object]:
    nav = nav.dropna()
    ret = ret.dropna()
    years = max((nav.index[-1] - nav.index[0]).days / 365.25, 0.1)
    cagr = nav.iloc[-1] ** (1.0 / years) - 1.0
    dd = nav / nav.cummax() - 1.0
    monthly = (1.0 + ret).resample("ME").prod() - 1.0
    rf_m = (1.0 + float(DEFAULT_BACKTEST_PRESET["risk_free_rate"])) ** (1 / 12) - 1
    excess = monthly - rf_m
    sharpe = np.nan if excess.std(ddof=1) == 0 else excess.mean() / excess.std(ddof=1) * np.sqrt(12)
    return {
        "strategy": name,
        "cagr": cagr,
        "mdd": dd.min(),
        "sharpe_monthly": sharpe,
        "ending_nav": nav.iloc[-1],
    }


def main() -> None:
    df_all, _ = _load_snapshot()
    cta, _score_frame = _compute_cta(df_all)
    hedge = _compute_overlay_signals(cta, df_all)
    portfolio = _build_combined_portfolio(cta, hedge)

    p1 = plot_2024_drawdown_diagnosis(portfolio, hedge)
    p2 = plot_nav_overlay_diagnostics(portfolio)
    p3 = plot_signal_breakdown(cta, hedge)

    metrics = pd.DataFrame(
        [
            _perf_row("BuyHold", portfolio["BH_Nav"], portfolio["Pct_Change"]),
            _perf_row("CTAOnly", portfolio["CTA_Nav"], portfolio["CTA_Only_Ret"]),
            _perf_row("CTAPlusHedge", portfolio["Combined_Nav"], portfolio["Combined_Ret"]),
        ]
    )
    metrics_path = OUTPUT_DIR / "diagnostic_metrics.csv"
    metrics.to_csv(metrics_path, index=False)

    print(f"Wrote {p1}")
    print(f"Wrote {p2}")
    print(f"Wrote {p3}")
    print(f"Wrote {metrics_path}")
    print(metrics.to_string(index=False))


if __name__ == "__main__":
    main()
