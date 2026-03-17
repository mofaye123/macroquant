"""Independent five-asset macro CTA backtest engine."""

from __future__ import annotations

from copy import deepcopy
import math
from typing import Any, Optional

import numpy as np
import pandas as pd

from modules.backtest import (
    DEFAULT_BACKTEST_INITIAL_CAPITAL,
    _calculate_score_internal,
    _series_to_points,
    compute_perf_metrics,
)

from .config import (
    ASSETS,
    DEFAULT_ENGINE_CONFIG,
    HEDGE_ASSETS,
    REGIMES,
)
from .bitget_paper import get_bitget_paper_meta
from .data import (
    build_macro_signal_context,
    download_price_frame,
    load_project_macro_frame,
    load_mstr_treasury_source,
    macro_payload_to_score_frame,
    normalize_price_frame,
)


def _deep_merge(base: dict[str, Any], override: Optional[dict[str, Any]]) -> dict[str, Any]:
    out = deepcopy(base)
    if not override:
        return out
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _resolve_config(config: Optional[dict[str, Any]]) -> dict[str, Any]:
    return _deep_merge(DEFAULT_ENGINE_CONFIG, config)


def _map_regime(score: float, thresholds: dict[str, float]) -> str:
    if score < float(thresholds["risk_off_max"]):
        return "RISK_OFF"
    if score >= float(thresholds["risk_on_min"]):
        return "RISK_ON"
    return "NEUTRAL"


def _rolling_ma(price: pd.Series, window: int) -> pd.Series:
    return price.rolling(window=window, min_periods=window).mean()


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(out):
        return fallback
    return out


def _norm_cdf(value: float) -> float:
    return 0.5 * (1.0 + math.erf(value / math.sqrt(2.0)))


def _norm_pdf(value: float) -> float:
    return math.exp(-0.5 * value * value) / math.sqrt(2.0 * math.pi)


def _calc_asset_features(price_frame: pd.DataFrame, vol_lookback: int) -> dict[str, pd.DataFrame]:
    features: dict[str, pd.DataFrame] = {}
    for asset in ASSETS:
        price = price_frame[asset].astype(float)
        ret = price.pct_change().fillna(0.0)
        ma20 = _rolling_ma(price, 20)
        ma60 = _rolling_ma(price, 60)
        ma120 = _rolling_ma(price, 120)
        vol60 = ret.rolling(vol_lookback, min_periods=max(20, vol_lookback // 2)).std(ddof=0) * np.sqrt(252.0)
        strong = (price > ma60) & (ma20 > ma60) & (ma60 > ma120)
        up = (price > ma60) & (ma20 > ma60)
        breakdown = (price < ma60) & (ma20 < ma60) & (ma60 < ma120)
        weak = (price < ma60) & (ma20 < ma60)
        trend_state = np.select(
            [strong, up, breakdown, weak],
            ["STRONG", "UP", "BREAK", "WEAK"],
            default="FLAT",
        )
        features[asset] = pd.DataFrame(
            {
                "price": price,
                "ret": ret,
                "ma20": ma20,
                "ma60": ma60,
                "ma120": ma120,
                "vol60": vol60,
                "trend_state": pd.Series(trend_state, index=price.index, dtype=object),
            },
            index=price.index,
        )
    return features


def _prepare_macro_frame(
    df_all: Optional[pd.DataFrame],
    index: pd.Index,
    config: dict[str, Any],
    score_frame: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    if score_frame is None:
        if df_all is None or df_all.empty:
            raise ValueError("df_all is required when score_frame is not provided")
        score_frame = _calculate_score_internal(df_all)

    if score_frame is None or score_frame.empty or "Total_Score" not in score_frame.columns:
        raise ValueError("macro score frame is empty or missing Total_Score")

    lag_days = int(config["macro_lag_days"])
    span = int(config["macro_smooth_span"])
    macro = pd.DataFrame(index=index)
    raw = score_frame["Total_Score"].astype(float).reindex(index, method="ffill")
    if lag_days > 0:
        raw = raw.shift(lag_days)
    raw = raw.ffill().bfill().clip(lower=0.0, upper=100.0)
    smooth = raw.ewm(span=span, adjust=False).mean().clip(lower=0.0, upper=100.0)
    macro["raw_score"] = raw
    macro["smooth_score"] = smooth
    macro["alpha"] = (smooth / 100.0).clip(lower=0.0, upper=1.0)
    macro["score_change_5d"] = smooth.diff(5).fillna(0.0)
    macro["score_change_20d"] = smooth.diff(20).fillna(0.0)
    macro["regime"] = smooth.apply(lambda value: _map_regime(float(value), config["regime_thresholds"]))
    return macro


def _compute_risk_signals(
    df_all: Optional[pd.DataFrame],
    macro: pd.DataFrame,
    features: dict[str, pd.DataFrame],
    config: dict[str, Any],
) -> pd.DataFrame:
    thresholds = config["signal_thresholds"]
    out = pd.DataFrame(index=macro.index)
    out["macro_low"] = macro["smooth_score"] < float(config["regime_thresholds"]["risk_off_max"])
    out["macro_drop"] = macro["score_change_5d"] <= -abs(float(config["execution"]["emergency_drop"]))
    out["btc_break"] = (
        features["BTC"]["price"] < features["BTC"]["ma60"]
    ) & (features["BTC"]["ma20"] < features["BTC"]["ma60"])
    out["eth_break"] = features["ETH"]["price"] < features["ETH"]["ma60"]

    if df_all is not None and not df_all.empty and {"VIXCLS", "VXVCLS"}.issubset(df_all.columns):
        vix = df_all["VIXCLS"].reindex(out.index, method="ffill")
        vxv = df_all["VXVCLS"].reindex(out.index, method="ffill").replace(0, np.nan)
        out["vix_invert"] = (vix / vxv).fillna(0.0) > float(thresholds["vix_vxv_invert"])
    else:
        out["vix_invert"] = False

    if df_all is not None and not df_all.empty and "BAMLH0A0HYM2" in df_all.columns:
        hy = df_all["BAMLH0A0HYM2"].reindex(out.index, method="ffill")
        out["hy_spike"] = hy.diff(10).fillna(0.0) > float(thresholds["hy_spread_10d"])
    else:
        out["hy_spike"] = False

    signal_cols = ["macro_low", "macro_drop", "btc_break", "eth_break", "vix_invert", "hy_spike"]
    out["risk_signals"] = out[signal_cols].astype(int).sum(axis=1)
    out["signal_list"] = out[signal_cols].apply(
        lambda row: [name for name, active in row.items() if bool(active)],
        axis=1,
    )
    return out


def _interpolate_anchor_weights(alpha: float, config: dict[str, Any]) -> dict[str, float]:
    anchors = config["anchor_weights"]
    defensive = anchors["defensive"]
    aggressive = anchors["aggressive"]
    clipped_alpha = min(max(float(alpha), 0.0), 1.0)
    return {
        key: (1.0 - clipped_alpha) * float(defensive[key]) + clipped_alpha * float(aggressive[key])
        for key in defensive.keys()
    }


def _compute_base_target_weights(
    macro: pd.DataFrame,
    features: dict[str, pd.DataFrame],
    config: dict[str, Any],
) -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.Series, pd.DataFrame, pd.Series]:
    index = macro.index
    long_weights = pd.DataFrame(index=index, columns=list(ASSETS), dtype=float)
    cash_weight = pd.Series(index=index, dtype=float)
    nominal_cash = pd.Series(index=index, dtype=float)
    vol_factor = pd.Series(index=index, dtype=float)
    port_vol_60d = pd.Series(index=index, dtype=float)
    nominal_weights = pd.DataFrame(index=index, columns=list(ASSETS) + ["CASH"], dtype=float)
    max_notional = config["max_notional"]

    for dt in index:
        anchor = _interpolate_anchor_weights(float(macro.at[dt, "alpha"]), config)
        nominal_weights.loc[dt] = anchor
        risky_budget = pd.Series({asset: float(anchor[asset]) for asset in ASSETS}, dtype=float)
        risky_total = float(risky_budget.sum())
        cash_nominal = float(anchor["CASH"])

        vols = pd.Series({asset: _safe_float(features[asset].at[dt, "vol60"], np.nan) for asset in ASSETS}, dtype=float)
        if vols.isna().all():
            vols = pd.Series({asset: 0.45 for asset in ASSETS}, dtype=float)
        else:
            fallback = float(vols.dropna().median()) if not vols.dropna().empty else 0.45
            vols = vols.fillna(fallback).clip(lower=0.05)

        inv_vol = risky_budget / vols
        inv_vol_sum = float(inv_vol.sum())
        if inv_vol_sum <= 1e-12 or risky_total <= 1e-12:
            risky_scaled = risky_budget.copy()
        else:
            risky_scaled = inv_vol / inv_vol_sum
            risky_scaled = risky_scaled * risky_total

        port_vol_est = float((risky_scaled * vols).sum())
        lev = float(config["lev_max"])
        if port_vol_est > 1e-12:
            lev = float(np.clip(float(config["vol_target"]) / port_vol_est, float(config["lev_min"]), float(config["lev_max"])))
        final_weights = risky_scaled * lev
        for asset in ASSETS:
            final_weights[asset] = min(float(final_weights[asset]), float(max_notional[asset]))

        gross = float(final_weights.sum())
        if gross > float(config["max_gross_exposure"]) and gross > 1e-12:
            final_weights = final_weights * (float(config["max_gross_exposure"]) / gross)
            gross = float(final_weights.sum())

        long_weights.loc[dt] = final_weights.reindex(list(ASSETS)).fillna(0.0)
        cash_weight.at[dt] = max(0.0, 1.0 - gross)
        nominal_cash.at[dt] = cash_nominal
        vol_factor.at[dt] = lev
        port_vol_60d.at[dt] = port_vol_est

    return (
        long_weights.fillna(0.0),
        cash_weight.fillna(0.0),
        nominal_cash.fillna(0.0),
        vol_factor.fillna(1.0),
        nominal_weights.fillna(0.0),
        port_vol_60d.fillna(0.0),
    )


def _above_ma_for_days(series_price: pd.Series, series_ma: pd.Series, end_idx: int, days: int) -> bool:
    if end_idx - days + 1 < 0:
        return False
    price_window = series_price.iloc[end_idx - days + 1 : end_idx + 1]
    ma_window = series_ma.iloc[end_idx - days + 1 : end_idx + 1]
    if price_window.isna().any() or ma_window.isna().any():
        return False
    return bool((price_window > ma_window).all())


def _below_ma_stack_for_days(
    series_fast: pd.Series,
    series_mid: pd.Series,
    series_slow: pd.Series,
    end_idx: int,
    days: int,
) -> bool:
    if end_idx - days + 1 < 0:
        return False
    fast_window = series_fast.iloc[end_idx - days + 1 : end_idx + 1]
    mid_window = series_mid.iloc[end_idx - days + 1 : end_idx + 1]
    slow_window = series_slow.iloc[end_idx - days + 1 : end_idx + 1]
    if fast_window.isna().any() or mid_window.isna().any() or slow_window.isna().any():
        return False
    return bool(((fast_window < mid_window) & (mid_window < slow_window)).all())


def _compute_mstr_premium_frame(price_frame: pd.DataFrame, treasury_schedule: pd.DataFrame) -> pd.DataFrame:
    target_index = pd.to_datetime(price_frame.index)
    expanded_index = treasury_schedule.index.union(target_index)
    treasury = treasury_schedule.reindex(expanded_index).sort_index().ffill().bfill().reindex(target_index)
    if treasury.empty:
        treasury = pd.DataFrame(index=price_frame.index)
        treasury["btc_holdings"] = 499_096.0
        treasury["basic_shares_outstanding"] = 266_178_000.0
    treasury.index = target_index
    treasury = treasury.ffill().bfill()

    btc_nav = treasury["btc_holdings"].astype(float) * price_frame["BTC"].astype(float)
    market_cap_proxy = treasury["basic_shares_outstanding"].astype(float) * price_frame["MSTR"].astype(float)
    premium = market_cap_proxy.div(btc_nav.replace(0.0, np.nan)).sub(1.0)
    out = treasury.copy()
    out["btc_nav_proxy"] = btc_nav
    out["market_cap_proxy"] = market_cap_proxy
    out["premium_ratio"] = premium.replace([np.inf, -np.inf], np.nan).ffill().fillna(0.0)
    return out


def _compute_hedge_targets(
    macro: pd.DataFrame,
    features: dict[str, pd.DataFrame],
    treasury: pd.DataFrame,
    config: dict[str, Any],
    long_weights: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    index = macro.index
    hedges = pd.DataFrame(0.0, index=index, columns=list(HEDGE_ASSETS), dtype=float)

    btc_cfg = config["hedges"]["BTC"]
    eth_cfg = config["hedges"]["ETH"]
    mstr_cfg = config["hedges"]["MSTR"]

    btc_active = 0.0
    eth_macro_active = 0.0
    eth_shock_active = 0.0
    eth_shock_start: int | None = None
    eth_shock_entry_price = 0.0
    mstr_active = 0.0

    btc_price = features["BTC"]["price"]
    btc_ma20 = features["BTC"]["ma20"]
    btc_ma60 = features["BTC"]["ma60"]
    eth_price = features["ETH"]["price"]
    eth_ma60 = features["ETH"]["ma60"]
    eth_ret = features["ETH"]["ret"]
    mstr_price = features["MSTR"]["price"]
    mstr_ma20 = features["MSTR"]["ma20"]
    mstr_ma60 = features["MSTR"]["ma60"]
    mstr_ma120 = features["MSTR"]["ma120"]
    premium = treasury["premium_ratio"] if "premium_ratio" in treasury.columns else pd.Series(0.0, index=index)
    btc_ret_5d = btc_price.pct_change(5).fillna(0.0)
    mstr_ratio = mstr_price.div(btc_price.replace(0.0, np.nan)).replace([np.inf, -np.inf], np.nan).ffill().bfill()

    mstr_mode = str(mstr_cfg.get("mode", "legacy_premium")).lower()
    mstr_ratio_window = max(int(mstr_cfg.get("ratio_ma", 20)), 2)
    mstr_ratio_ma = _rolling_ma(mstr_ratio, mstr_ratio_window)
    mstr_premium_z_window = max(int(mstr_cfg.get("premium_filter_z_window", 120)), 20)
    premium_mean = premium.rolling(mstr_premium_z_window, min_periods=max(30, mstr_premium_z_window // 2)).mean()
    premium_std = premium.rolling(mstr_premium_z_window, min_periods=max(30, mstr_premium_z_window // 2)).std(ddof=0)
    premium_z = premium.sub(premium_mean).div(premium_std.replace(0.0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    mstr_days_active = 0
    operations_cfg = config.get("terminal_boards", {}).get("operations", {})
    hedge_budget_pct = float(config.get("hedge_budget_pct", operations_cfg.get("hedge_max_size_pct", 25.0)))
    hedge_budget_cap = max(0.0, hedge_budget_pct / 100.0)

    for i, dt in enumerate(index):
        smooth_score = float(macro.at[dt, "smooth_score"])
        btc_trigger = (
            smooth_score < float(btc_cfg["score_th"])
            and _safe_float(btc_price.iat[i], np.nan) < _safe_float(btc_ma60.iat[i], np.inf)
            and _safe_float(btc_ma20.iat[i], np.nan) < _safe_float(btc_ma60.iat[i], np.inf)
        )
        btc_exit = (
            smooth_score >= float(btc_cfg["score_exit"])
            or _above_ma_for_days(btc_price, btc_ma60, i, int(btc_cfg["recover_days"]))
        )
        if btc_active > 0 and btc_exit:
            btc_active = 0.0
        elif btc_trigger:
            btc_active = float(btc_cfg["nav_pct"]) * (float(btc_cfg["leverage"]) if smooth_score < float(btc_cfg["score_full"]) else 1.0)
        elif btc_active > 0 and smooth_score < float(btc_cfg["score_full"]):
            btc_active = float(btc_cfg["nav_pct"]) * float(btc_cfg["leverage"])

        eth_macro_trigger = (
            smooth_score < float(eth_cfg["score_th"])
            and _safe_float(eth_price.iat[i], np.nan) < _safe_float(eth_ma60.iat[i], np.inf)
        )
        eth_macro_exit = (
            smooth_score >= float(eth_cfg["score_exit"])
            or _above_ma_for_days(eth_price, eth_ma60, i, int(eth_cfg["recover_days"]))
        )
        if eth_macro_active > 0 and eth_macro_exit:
            eth_macro_active = 0.0
        elif eth_macro_trigger:
            eth_macro_active = float(eth_cfg["nav_pct"]) * (float(eth_cfg["leverage"]) if smooth_score < float(eth_cfg["score_full"]) else 1.0)
        elif eth_macro_active > 0 and smooth_score < float(eth_cfg["score_full"]):
            eth_macro_active = float(eth_cfg["nav_pct"]) * float(eth_cfg["leverage"])

        if float(eth_ret.iat[i]) <= -abs(float(eth_cfg["shock_drop"])):
            eth_shock_active = float(eth_cfg["nav_pct"]) * float(eth_cfg["leverage"])
            eth_shock_start = i
            eth_shock_entry_price = float(eth_price.iat[i])

        if eth_shock_active > 0 and eth_shock_start is not None:
            shock_age = i - eth_shock_start
            if shock_age >= int(eth_cfg["shock_exit_days"]):
                eth_shock_active = 0.0
                eth_shock_start = None
            elif shock_age >= int(eth_cfg["shock_review_start"]):
                if float(eth_price.iat[i]) >= eth_shock_entry_price * (1.0 + float(eth_cfg["shock_profit_pct"])):
                    eth_shock_active = 0.0
                    eth_shock_start = None

        eth_desired = min(
            float(eth_cfg["nav_pct"]) * float(eth_cfg["leverage"]),
            eth_macro_active + eth_shock_active,
        )

        if mstr_mode == "trend_relative_v1":
            full_size = float(mstr_cfg["nav_pct"]) * float(mstr_cfg["leverage"])
            entry_days = max(int(mstr_cfg.get("trend_entry_days", 5)), 1)
            add_days = max(int(mstr_cfg.get("trend_add_days", 10)), entry_days)
            exit_days = max(int(mstr_cfg.get("exit_days", 3)), 1)
            exit_ma20_days = max(int(mstr_cfg.get("exit_ma20_days", 1)), 1)
            max_hold_days = max(int(mstr_cfg.get("max_hold_days", 20)), 0)
            initial_size_ratio = float(np.clip(float(mstr_cfg.get("initial_size_ratio", 0.50)), 0.10, 1.0))
            shock_size_ratio = float(np.clip(float(mstr_cfg.get("shock_size_ratio", 1.00)), initial_size_ratio, 1.0))
            btc_shock_drop_5d = abs(float(mstr_cfg.get("btc_shock_drop_5d", 0.08)))
            require_btc_bear = bool(mstr_cfg.get("require_btc_bear", True))
            allow_btc_shock = bool(mstr_cfg.get("allow_btc_shock_entry", True))

            trend_ready = _below_ma_stack_for_days(mstr_ma20, mstr_ma60, mstr_ma120, i, entry_days)
            trend_add_ready = _below_ma_stack_for_days(mstr_ma20, mstr_ma60, mstr_ma120, i, add_days)
            btc_bear = (
                _safe_float(btc_price.iat[i], np.nan) < _safe_float(btc_ma60.iat[i], np.inf)
                and _safe_float(btc_ma20.iat[i], np.nan) < _safe_float(btc_ma60.iat[i], np.inf)
            )
            ratio_weak = _safe_float(mstr_ratio.iat[i], np.nan) < _safe_float(mstr_ratio_ma.iat[i], np.inf)
            btc_shock = _safe_float(btc_ret_5d.iat[i], 0.0) <= -btc_shock_drop_5d

            primary_gate = trend_ready and (btc_bear or not require_btc_bear)
            signal_gate = ratio_weak or (allow_btc_shock and btc_shock)
            mstr_trigger = primary_gate and signal_gate

            target_size = 0.0
            if mstr_trigger:
                target_size = full_size * initial_size_ratio
                if trend_add_ready and ratio_weak:
                    target_size = full_size
                if allow_btc_shock and btc_shock:
                    target_size = max(target_size, full_size * shock_size_ratio)

                if bool(mstr_cfg.get("use_premium_filter", False)):
                    premium_z_th = float(mstr_cfg.get("premium_filter_z_th", 1.0))
                    if _safe_float(premium_z.iat[i], 0.0) < premium_z_th:
                        target_size = min(target_size, full_size * initial_size_ratio)

                if bool(mstr_cfg.get("cap_by_btc_weight", True)) and long_weights is not None and "BTC" in long_weights.columns:
                    btc_long_weight = max(_safe_float(long_weights.at[dt, "BTC"], 0.0), 0.0)
                    btc_cap_multiplier = max(float(mstr_cfg.get("btc_weight_cap_multiplier", 1.0)), 0.0)
                    target_size = min(target_size, btc_long_weight * btc_cap_multiplier)

            mstr_exit = (
                _above_ma_for_days(mstr_price, mstr_ma20, i, exit_ma20_days)
                or
                _above_ma_for_days(mstr_price, mstr_ma60, i, exit_days)
                or _above_ma_for_days(mstr_ratio, mstr_ratio_ma, i, exit_days)
                or (
                    bool(mstr_cfg.get("respect_macro_exit", False))
                    and smooth_score >= float(mstr_cfg["score_exit"])
                )
                or (max_hold_days > 0 and mstr_days_active >= max_hold_days)
            )

            if mstr_active > 0:
                mstr_days_active += 1
                if mstr_exit:
                    mstr_active = 0.0
                    mstr_days_active = 0
                elif target_size > mstr_active:
                    mstr_active = target_size
            elif target_size > 0:
                mstr_active = target_size
                mstr_days_active = 1
            else:
                mstr_days_active = 0
        else:
            mstr_trigger = (
                smooth_score < float(mstr_cfg["score_th"])
                and _safe_float(btc_price.iat[i], np.nan) < _safe_float(btc_ma60.iat[i], np.inf)
                and float(premium.iat[i]) > float(mstr_cfg["premium_th"])
            )
            mstr_exit = (
                smooth_score >= float(mstr_cfg["score_exit"])
                or _above_ma_for_days(mstr_price, mstr_ma60, i, int(mstr_cfg["recover_days"]))
                or float(premium.iat[i]) < float(mstr_cfg["premium_exit"])
            )
            if mstr_active > 0 and mstr_exit:
                mstr_active = 0.0
            elif mstr_trigger:
                full_size = float(mstr_cfg["nav_pct"]) * float(mstr_cfg["leverage"])
                half_size = full_size / 2.0
                if smooth_score < float(mstr_cfg["score_full"]) or float(premium.iat[i]) > float(mstr_cfg["premium_full"]):
                    mstr_active = full_size
                else:
                    mstr_active = half_size

        desired_mstr = max(0.0, float(mstr_active))
        desired_btc = max(0.0, float(btc_active))
        desired_eth = max(0.0, float(eth_desired))

        mstr_alloc = min(desired_mstr, hedge_budget_cap)
        remaining_budget = max(0.0, hedge_budget_cap - mstr_alloc)
        crypto_total_desired = desired_btc + desired_eth
        if crypto_total_desired > 1e-12 and remaining_budget > 0:
            crypto_scale = min(1.0, remaining_budget / crypto_total_desired)
            btc_alloc = desired_btc * crypto_scale
            eth_alloc = desired_eth * crypto_scale
        else:
            btc_alloc = 0.0
            eth_alloc = 0.0

        hedges.at[dt, "MSTR"] = -mstr_alloc
        hedges.at[dt, "BTC"] = -btc_alloc
        hedges.at[dt, "ETH"] = -eth_alloc

    return hedges


def _build_rebalance_mask(index: pd.Index, mode: str) -> pd.Series:
    mode = str(mode).upper()
    if mode == "D":
        return pd.Series(True, index=index, dtype=bool)
    if mode == "W":
        periods = pd.Series(index.to_period("W-FRI"), index=index)
        return periods.ne(periods.shift(-1)).fillna(True)
    periods = pd.Series(index.to_period("M"), index=index)
    return periods.ne(periods.shift(-1)).fillna(True)


def _relative_drift(target: pd.Series, current: pd.Series) -> float:
    drifts: list[float] = []
    for asset in target.index:
        tgt = abs(float(target[asset]))
        cur = abs(float(current[asset]))
        denom = max(tgt, 1e-6)
        drifts.append(abs(tgt - cur) / denom)
    return max(drifts) if drifts else 0.0


def _execute_base_allocations(
    desired_long: pd.DataFrame,
    macro: pd.DataFrame,
    risk: pd.DataFrame,
    config: dict[str, Any],
) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    exec_cfg = config["execution"]
    rebalance_mask = _build_rebalance_mask(desired_long.index, str(exec_cfg["rebalance_mode"]))
    executed = pd.DataFrame(index=desired_long.index, columns=desired_long.columns, dtype=float)
    cash_weight = pd.Series(index=desired_long.index, dtype=float)
    rebalance_reason = pd.Series(index=desired_long.index, dtype=object)

    last_weights = pd.Series(0.0, index=desired_long.columns, dtype=float)
    last_trade_i = -10**9

    for i, dt in enumerate(desired_long.index):
        desired_row = desired_long.loc[dt].astype(float)
        score_drop = -float(macro.at[dt, "score_change_5d"])
        emergency = (
            score_drop >= float(exec_cfg["emergency_drop"])
            or float(macro.at[dt, "smooth_score"]) <= float(exec_cfg["emergency_score"])
            or int(risk.at[dt, "risk_signals"]) >= int(exec_cfg["emergency_risk_count"])
        )
        drift = _relative_drift(desired_row, last_weights)
        delta_ok = drift >= float(exec_cfg.get("trade_buffer", exec_cfg.get("turnover_buffer", 0.20)))
        hold_ok = (i - last_trade_i) >= int(exec_cfg["min_hold_days"])
        scheduled = bool(rebalance_mask.iat[i])

        if i == 0:
            last_weights = desired_row.copy()
            last_trade_i = i
            rebalance_reason.at[dt] = "init"
        elif emergency and delta_ok:
            last_weights = desired_row.copy()
            last_trade_i = i
            rebalance_reason.at[dt] = "force"
        elif scheduled and hold_ok and delta_ok:
            last_weights = desired_row.copy()
            last_trade_i = i
            rebalance_reason.at[dt] = "scheduled"
        else:
            rebalance_reason.at[dt] = "hold"

        executed.loc[dt] = last_weights
        cash_weight.at[dt] = max(0.0, 1.0 - float(last_weights.sum()))

    return executed.fillna(0.0), cash_weight.fillna(0.0), rebalance_reason.fillna("hold")


def _combine_net_weights(long_weights: pd.DataFrame, hedge_weights: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    net = long_weights.copy()
    for asset in HEDGE_ASSETS:
        net[asset] = net[asset] + hedge_weights[asset]
    gross_net = long_weights.sum(axis=1) + hedge_weights.abs().sum(axis=1)
    cash = (1.0 - gross_net).clip(lower=0.0)
    return net, cash


def _compute_turnover_and_costs(
    long_weights: pd.DataFrame,
    hedge_weights: pd.DataFrame,
    config: dict[str, Any],
) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    cost_cfg = config["costs"]
    tx_bps = float(cost_cfg["fee_one_way_bps"]) + float(cost_cfg["slippage_one_way_bps"])
    tx_rate = tx_bps / 10000.0

    long_turnover = long_weights.diff().abs().fillna(long_weights.abs()).sum(axis=1)
    hedge_turnover = hedge_weights.diff().abs().fillna(hedge_weights.abs()).sum(axis=1)
    tx_cost = (long_turnover + hedge_turnover) * tx_rate

    prev_long = long_weights.shift(1).fillna(0.0)
    prev_hedge = hedge_weights.shift(1).fillna(0.0)
    funding_long = pd.Series(0.0, index=long_weights.index, dtype=float)
    for asset in ASSETS:
        bps_daily = float(cost_cfg["funding_long_bps_daily"].get(asset, 0.0)) / 10000.0
        funding_long = funding_long + prev_long[asset] * bps_daily
    funding_short = prev_hedge.abs().sum(axis=1) * (float(cost_cfg["funding_short_bps_daily"]) / 10000.0)

    return long_turnover, hedge_turnover, tx_cost, funding_long + funding_short


def _simulate_reference_benchmark(price_frame: pd.DataFrame, config: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
    ref_cfg = config["terminal_boards"]["reference_benchmark"]
    weights = pd.Series(ref_cfg["weights"], dtype=float).reindex(list(ASSETS)).fillna(0.0)
    weights = weights / weights.sum()
    returns = price_frame[list(ASSETS)].pct_change().fillna(0.0)
    current_weights = weights.copy()
    current_bucket = None
    ref_ret: list[float] = []

    for dt, row in returns.iterrows():
        bucket = dt.to_period("M")
        if current_bucket is None or bucket != current_bucket:
            current_weights = weights.copy()
            current_bucket = bucket
        port_ret = float((current_weights * row).sum())
        ref_ret.append(port_ret)
        drifted = current_weights * (1.0 + row)
        total = float(drifted.sum())
        if total > 1e-12:
            current_weights = drifted / total

    nav = (1.0 + pd.Series(ref_ret, index=returns.index)).cumprod()
    frame = pd.DataFrame(index=returns.index)
    frame["Strategy_Ret"] = ref_ret
    frame["Pct_Change"] = ref_ret
    frame["Strategy_Nav"] = nav
    frame["Turnover"] = 0.0
    frame["Tx_Cost"] = 0.0
    frame["Funding_Cost"] = 0.0
    frame["Total_Cost"] = 0.0
    frame["Drawdown"] = frame["Strategy_Nav"] / frame["Strategy_Nav"].cummax() - 1.0
    perf = compute_perf_metrics(frame, risk_free_rate=float(config["risk_free_rate"]))
    return frame, perf


def _simulate_portfolio(
    price_frame: pd.DataFrame,
    features: dict[str, pd.DataFrame],
    macro: pd.DataFrame,
    risk: pd.DataFrame,
    nominal_weights: pd.DataFrame,
    desired_long_weights: pd.DataFrame,
    executed_long_weights: pd.DataFrame,
    desired_hedges: pd.DataFrame,
    net_weights: pd.DataFrame,
    cash_weight: pd.Series,
    desired_cash_weight: pd.Series,
    nominal_cash_weight: pd.Series,
    rebalance_reason: pd.Series,
    vol_factor: pd.Series,
    port_vol_60d: pd.Series,
    treasury: pd.DataFrame,
    config: dict[str, Any],
    initial_capital: float,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    returns = pd.DataFrame({asset: features[asset]["ret"] for asset in ASSETS}, index=price_frame.index).fillna(0.0)
    prev_long = executed_long_weights.shift(1).fillna(0.0)
    prev_hedges = desired_hedges.shift(1).fillna(0.0)
    prev_cash = cash_weight.shift(1).fillna(1.0)

    contrib = prev_long.mul(returns, axis=0)
    hedge_contrib = prev_hedges.mul(returns[list(HEDGE_ASSETS)], axis=0)
    for asset in HEDGE_ASSETS:
        contrib[asset] = contrib[asset] + hedge_contrib[asset]

    benchmark_frame, _ = _simulate_reference_benchmark(price_frame[list(ASSETS)], config)
    long_turnover, hedge_turnover, tx_cost, funding_cost = _compute_turnover_and_costs(executed_long_weights, desired_hedges, config)
    cash_ret = prev_cash * (float(config["risk_free_rate"]) / 252.0)
    strategy_ret = contrib.sum(axis=1) + cash_ret - tx_cost - funding_cost

    portfolio = pd.DataFrame(index=price_frame.index)
    portfolio["Strategy_Ret"] = strategy_ret.fillna(0.0)
    portfolio["Pct_Change"] = benchmark_frame["Strategy_Ret"].fillna(0.0)
    portfolio["Benchmark_Ret"] = benchmark_frame["Strategy_Ret"].fillna(0.0)
    portfolio["Strategy_Nav"] = (1.0 + portfolio["Strategy_Ret"]).cumprod()
    portfolio["Benchmark_Nav"] = benchmark_frame["Strategy_Nav"].reindex(portfolio.index).ffill().fillna(1.0)
    portfolio["Strategy_Capital"] = portfolio["Strategy_Nav"] * float(initial_capital)
    portfolio["Benchmark_Capital"] = portfolio["Benchmark_Nav"] * float(initial_capital)
    portfolio["Drawdown"] = portfolio["Strategy_Nav"] / portfolio["Strategy_Nav"].cummax() - 1.0
    portfolio["Benchmark_Drawdown"] = portfolio["Benchmark_Nav"] / portfolio["Benchmark_Nav"].cummax() - 1.0
    portfolio["Turnover"] = long_turnover + hedge_turnover
    portfolio["Long_Turnover"] = long_turnover
    portfolio["Hedge_Turnover"] = hedge_turnover
    portfolio["Tx_Cost"] = tx_cost
    portfolio["Funding_Cost"] = funding_cost
    portfolio["Total_Cost"] = tx_cost + funding_cost
    portfolio["Cash_Weight"] = cash_weight
    portfolio["Desired_Cash_Weight"] = desired_cash_weight
    portfolio["Nominal_Cash_Weight"] = nominal_cash_weight
    portfolio["Gross_Long"] = executed_long_weights.sum(axis=1)
    portfolio["Gross_Hedge"] = desired_hedges.abs().sum(axis=1)
    portfolio["Gross_Net"] = net_weights.abs().sum(axis=1)
    portfolio["Vol_Factor"] = vol_factor
    portfolio["Port_Vol_60d"] = port_vol_60d
    portfolio["Macro_Score"] = macro["smooth_score"]
    portfolio["Macro_Raw_Score"] = macro["raw_score"]
    portfolio["Alpha"] = macro["alpha"]
    portfolio["Macro_Score_5D_Change"] = macro["score_change_5d"]
    portfolio["Macro_Score_20D_Change"] = macro["score_change_20d"]
    portfolio["Regime"] = macro["regime"]
    portfolio["Risk_Signals"] = risk["risk_signals"]
    portfolio["Signal_List"] = risk["signal_list"]
    portfolio["MSTR_Premium_Ratio"] = treasury["premium_ratio"].reindex(portfolio.index).fillna(0.0)
    portfolio["MSTR_BTC_Holdings"] = treasury["btc_holdings"].reindex(portfolio.index).ffill().fillna(0.0)
    portfolio["MSTR_Basic_Shares"] = treasury["basic_shares_outstanding"].reindex(portfolio.index).ffill().fillna(0.0)
    portfolio["Rebalance_Reason"] = rebalance_reason

    for asset in ASSETS:
        portfolio[f"{asset}_NominalWeight"] = nominal_weights[asset]
        portfolio[f"{asset}_DesiredWeight"] = desired_long_weights[asset]
        portfolio[f"{asset}_Weight"] = executed_long_weights[asset]
        portfolio[f"{asset}_NetWeight"] = net_weights[asset]
        portfolio[f"{asset}_Ret"] = returns[asset]
        portfolio[f"{asset}_Contrib"] = contrib[asset]
        portfolio[f"{asset}_Price"] = price_frame[asset]
        portfolio[f"{asset}_Trend"] = features[asset]["trend_state"]
        portfolio[f"{asset}_Vol60"] = features[asset]["vol60"]

    for asset in HEDGE_ASSETS:
        portfolio[f"{asset}_Hedge"] = desired_hedges[asset]

    return portfolio, contrib, benchmark_frame


def _build_monthly_map(series: pd.Series) -> dict[str, dict[str, float]]:
    monthly = (1.0 + series.fillna(0.0)).resample("ME").prod() - 1.0
    out: dict[str, dict[str, float]] = {}
    for idx, value in monthly.items():
        year = str(idx.year)
        out.setdefault(year, {})
        out[year][str(idx.month)] = round(float(value) * 100.0, 2)
    return out


def _build_regime_summary(regime_series: pd.Series) -> dict[str, Any]:
    counts = regime_series.value_counts(dropna=False).to_dict()
    segments = []
    start = None
    prev = None
    prev_dt = None
    for dt, regime in regime_series.items():
        if prev is None:
            start = dt
            prev = regime
            prev_dt = dt
            continue
        if regime != prev:
            segments.append(
                {
                    "regime": str(prev),
                    "start": start.strftime("%Y-%m-%d"),
                    "end": prev_dt.strftime("%Y-%m-%d"),
                }
            )
            start = dt
            prev = regime
        prev_dt = dt
    if prev is not None and start is not None:
        segments.append(
            {
                "regime": str(prev),
                "start": start.strftime("%Y-%m-%d"),
                "end": regime_series.index[-1].strftime("%Y-%m-%d"),
            }
        )
    return {
        "counts": {str(key): int(value) for key, value in counts.items()},
        "segments": segments,
    }


def _build_asset_summary(portfolio: pd.DataFrame, contrib: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    for asset in ASSETS:
        price = portfolio[f"{asset}_Price"].dropna()
        if price.empty:
            continue
        asset_ret = price.pct_change().fillna(0.0)
        nav = (1.0 + asset_ret).cumprod()
        dd = nav / nav.cummax() - 1.0
        ann_vol = float(asset_ret.std(ddof=0) * np.sqrt(252)) if len(asset_ret) > 1 else 0.0
        rows.append(
            {
                "ticker": asset,
                "totalReturnPct": round((float(nav.iloc[-1]) - 1.0) * 100.0, 2),
                "maxDrawdownPct": round(float(dd.min()) * 100.0, 2),
                "annualizedVolPct": round(ann_vol * 100.0, 2),
                "avgLongWeightPct": round(float(portfolio[f"{asset}_Weight"].mean()) * 100.0, 2),
                "netContributionPct": round(float(contrib[asset].sum()) * 100.0, 2),
                "latestTrend": str(portfolio[f"{asset}_Trend"].iloc[-1]),
            }
        )
    return rows


def _compute_win_rate(ret: pd.Series) -> float:
    clean = ret.dropna()
    if clean.empty:
        return 0.0
    return float((clean > 0).mean())


def _compute_profit_factor(ret: pd.Series) -> Optional[float]:
    clean = ret.dropna()
    if clean.empty:
        return None
    gains = float(clean[clean > 0].sum())
    losses = float(-clean[clean < 0].sum())
    if losses <= 1e-12:
        return None if gains <= 1e-12 else 999.0
    return gains / losses


def _round_optional(value: Optional[float], digits: int = 4) -> Optional[float]:
    if value is None or (isinstance(value, float) and not math.isfinite(value)):
        return None
    return round(float(value), digits)


def _build_ticker_tape(portfolio: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for asset in ASSETS:
        price_series = portfolio[f"{asset}_Price"].astype(float)
        last_price = float(price_series.iloc[-1])
        prev_price = float(price_series.shift(1).iloc[-1]) if len(price_series) > 1 else last_price
        day_change_pct = ((last_price / prev_price) - 1.0) * 100.0 if abs(prev_price) > 1e-12 else 0.0
        rows.append(
            {
                "asset": asset,
                "price": round(last_price, 4),
                "dayChangePct": round(day_change_pct, 2),
                "contributionPct": round(float(portfolio[f"{asset}_Contrib"].iloc[-1]) * 100.0, 4),
                "targetWeightPct": round(float(portfolio[f"{asset}_NetWeight"].iloc[-1]) * 100.0, 2),
            }
        )
    return rows


def _black_scholes_metrics(*, spot: float, strike: float, time_to_expiry: float, sigma: float, risk_free_rate: float) -> dict[str, float]:
    if spot <= 0 or strike <= 0 or sigma <= 0 or time_to_expiry <= 0:
        intrinsic_call = max(spot - strike, 0.0)
        intrinsic_put = max(strike - spot, 0.0)
        return {
            "call": intrinsic_call,
            "put": intrinsic_put,
            "call_delta": 1.0 if spot > strike else 0.0,
            "put_delta": -1.0 if strike > spot else 0.0,
            "gamma": 0.0,
        }

    root_t = math.sqrt(time_to_expiry)
    d1 = (math.log(spot / strike) + (risk_free_rate + 0.5 * sigma * sigma) * time_to_expiry) / (sigma * root_t)
    d2 = d1 - sigma * root_t
    call = spot * _norm_cdf(d1) - strike * math.exp(-risk_free_rate * time_to_expiry) * _norm_cdf(d2)
    put = strike * math.exp(-risk_free_rate * time_to_expiry) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)
    gamma = _norm_pdf(d1) / (spot * sigma * root_t)
    return {
        "call": max(call, 0.0),
        "put": max(put, 0.0),
        "call_delta": _norm_cdf(d1),
        "put_delta": _norm_cdf(d1) - 1.0,
        "gamma": gamma,
    }


def _build_options_board(portfolio: pd.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    opt_cfg = config["terminal_boards"]["options"]
    btc_price = portfolio["BTC_Price"].astype(float)
    btc_ret = btc_price.pct_change().fillna(0.0)
    rv20 = float(btc_ret.tail(20).std(ddof=0) * math.sqrt(365.0) * 100.0) if len(btc_ret) >= 20 else 0.0
    rv60 = float(btc_ret.tail(60).std(ddof=0) * math.sqrt(365.0) * 100.0) if len(btc_ret) >= 60 else rv20
    atm_iv_pct = max(float(opt_cfg["min_iv_pct"]), min(float(opt_cfg["max_iv_pct"]), 0.65 * rv20 + 0.35 * rv60))
    spot = float(btc_price.iloc[-1])
    prev_spot = float(btc_price.shift(1).iloc[-1]) if len(btc_price) > 1 else spot
    price_change_1d_pct = ((spot / prev_spot) - 1.0) * 100.0 if abs(prev_spot) > 1e-12 else 0.0
    time_to_expiry = float(opt_cfg["expiry_days"]) / 365.0

    strike_increment = 250.0 if spot < 100000 else 500.0
    chain: list[dict[str, Any]] = []
    for offset in opt_cfg["moneyness_offsets"]:
        raw_strike = spot * (1.0 + float(offset))
        strike = max(strike_increment, round(raw_strike / strike_increment) * strike_increment)
        metrics = _black_scholes_metrics(
            spot=spot,
            strike=strike,
            time_to_expiry=time_to_expiry,
            sigma=atm_iv_pct / 100.0,
            risk_free_rate=float(config["risk_free_rate"]),
        )
        spread = 0.03 if abs(float(offset)) <= 0.04 else 0.06
        call_mid = metrics["call"]
        put_mid = metrics["put"]
        chain.append(
            {
                "strike": round(strike, 0),
                "callBid": round(max(call_mid * (1.0 - spread), 0.0), 2),
                "callAsk": round(call_mid * (1.0 + spread), 2),
                "callDelta": round(metrics["call_delta"], 3),
                "putBid": round(max(put_mid * (1.0 - spread), 0.0), 2),
                "putAsk": round(put_mid * (1.0 + spread), 2),
                "putDelta": round(metrics["put_delta"], 3),
                "gammaPer1k": round(metrics["gamma"] * 1000.0, 4),
                "iv": round(atm_iv_pct, 1),
                "atm": abs(float(offset)) < 1e-9,
            }
        )

    monthly_iv = btc_ret.rolling(20, min_periods=10).std(ddof=0) * math.sqrt(365.0) * 100.0
    iv_history = []
    for dt, value in monthly_iv.resample("ME").last().tail(24).items():
        if pd.isna(value):
            continue
        iv_history.append(
            {
                "date": dt.strftime("%Y-%m-%d"),
                "value": round(float(max(float(opt_cfg["min_iv_pct"]), min(float(opt_cfg["max_iv_pct"]), value))), 2),
            }
        )

    return {
        "source": "BTC现货价格 + 20/60日实现波动率 + BSM观察链",
        "spot": round(spot, 2),
        "priceChange1dPct": round(price_change_1d_pct, 2),
        "atmIv": round(atm_iv_pct, 2),
        "realizedVol20d": round(rv20, 2),
        "realizedVol60d": round(rv60, 2),
        "expiryDays": int(opt_cfg["expiry_days"]),
        "chain": chain,
        "ivHistory": iv_history,
    }


def _build_operations_presets(config: dict[str, Any], latest_vols: dict[str, float]) -> dict[str, dict[str, float]]:
    presets: dict[str, dict[str, float]] = {}
    alpha_map = {"RISK_OFF": 0.0, "NEUTRAL": 0.5, "RISK_ON": 1.0}
    for label, alpha in alpha_map.items():
        anchor = _interpolate_anchor_weights(alpha, config)
        risky_budget = pd.Series({asset: float(anchor[asset]) for asset in ASSETS}, dtype=float)
        vols = pd.Series({asset: max(float(latest_vols.get(asset, 0.45)), 0.05) for asset in ASSETS}, dtype=float)
        inv_vol = risky_budget / vols
        if float(inv_vol.sum()) > 1e-12:
            risky_weights = inv_vol / float(inv_vol.sum()) * float(risky_budget.sum())
        else:
            risky_weights = risky_budget
        presets[label] = {asset: round(float(risky_weights[asset]) * 100.0, 2) for asset in ASSETS}
    return presets


def _build_terminal_boards(
    portfolio: pd.DataFrame,
    benchmark_frame: pd.DataFrame,
    strategy_perf: dict[str, Any],
    config: dict[str, Any],
    initial_capital: float,
) -> dict[str, Any]:
    ref_frame, ref_perf = benchmark_frame, compute_perf_metrics(benchmark_frame, risk_free_rate=float(config["risk_free_rate"]))
    ref_cfg = config["terminal_boards"]["reference_benchmark"]
    operations_cfg = config["terminal_boards"]["operations"]
    strategy_win_rate = _compute_win_rate(portfolio["Strategy_Ret"])
    benchmark_win_rate = _compute_win_rate(portfolio["Benchmark_Ret"])
    strategy_pf = _compute_profit_factor(portfolio["Strategy_Ret"])
    benchmark_pf = _compute_profit_factor(portfolio["Benchmark_Ret"])
    latest_vols = {asset: _safe_float(portfolio[f"{asset}_Vol60"].iloc[-1], 0.45) for asset in ASSETS}

    return {
        "tickerTape": _build_ticker_tape(portfolio),
        "referenceBenchmark": {
            "name": str(ref_cfg["name"]),
            "methodology": "五资产等权 / 月末再平衡 / 无杠杆 / 无保护层",
            "weights": {asset: round(float(weight) * 100.0, 2) for asset, weight in ref_cfg["weights"].items()},
            "rebalanceMode": str(ref_cfg["rebalance_mode"]),
            "leverage": str(ref_cfg["leverage"]),
            "hedge": str(ref_cfg["hedge"]),
            "kpis": {
                "cagr": round(float(ref_perf.get("cagr", 0.0)), 6),
                "mdd": round(float(ref_perf.get("mdd", 0.0)), 6),
                "sharpe": round(float(ref_perf.get("sharpe_m", 0.0)), 4),
                "winRate": round(benchmark_win_rate, 6),
                "profitFactor": _round_optional(benchmark_pf, 4),
                "totalNav": round(float(ref_frame["Strategy_Nav"].iloc[-1]), 6),
            },
            "alphaVsStrategy": {
                "sharpe": round(float(strategy_perf.get("sharpe_m", 0.0)) - float(ref_perf.get("sharpe_m", 0.0)), 4),
                "cagr": round(float(strategy_perf.get("cagr", 0.0)) - float(ref_perf.get("cagr", 0.0)), 6),
                "drawdownImprovementPct": round((abs(float(ref_perf.get("mdd", 0.0))) - abs(float(strategy_perf.get("mdd", 0.0)))) * 100.0, 2),
            },
        },
        "optionsBoard": _build_options_board(portfolio, config),
        "operationsBoard": {
            "capitalBase": float(initial_capital),
            "feePerSidePct": float(operations_cfg["fee_per_side_pct"]),
            "leverageCaps": {asset: float(value) for asset, value in operations_cfg["leverage_caps"].items()},
            "fundingDailyPct": {asset: float(value) for asset, value in operations_cfg["funding_daily_pct"].items()},
            "hedgeLeverage": float(operations_cfg["hedge_leverage"]),
            "hedgeMaxSizePct": float(operations_cfg["hedge_max_size_pct"]),
            "regimePresetWeights": _build_operations_presets(config, latest_vols),
        },
        "kpiStrip": {
            "strategy": {
                "winRate": round(strategy_win_rate, 6),
                "profitFactor": _round_optional(strategy_pf, 4),
            },
            "benchmark": {
                "winRate": round(benchmark_win_rate, 6),
                "profitFactor": _round_optional(benchmark_pf, 4),
            },
        },
    }


def _slice_view_window(
    portfolio: pd.DataFrame,
    contrib: pd.DataFrame,
    benchmark_frame: pd.DataFrame,
    *,
    view_start_date: Optional[str],
    view_end_date: Optional[str],
    initial_capital: float,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if not view_start_date and not view_end_date:
        return portfolio, contrib, benchmark_frame

    mask = pd.Series(True, index=portfolio.index)
    if view_start_date:
        mask &= portfolio.index >= pd.Timestamp(view_start_date)
    if view_end_date:
        mask &= portfolio.index <= pd.Timestamp(view_end_date)

    view_portfolio = portfolio.loc[mask].copy()
    view_contrib = contrib.loc[mask].copy()
    view_benchmark = benchmark_frame.loc[mask].copy()
    if view_portfolio.empty:
        raise ValueError("selected view window has no observations")

    strategy_nav = (1.0 + view_portfolio["Strategy_Ret"].fillna(0.0)).cumprod()
    benchmark_nav = (1.0 + view_portfolio["Benchmark_Ret"].fillna(0.0)).cumprod()
    view_portfolio["Strategy_Nav"] = strategy_nav
    view_portfolio["Benchmark_Nav"] = benchmark_nav
    view_portfolio["Strategy_Capital"] = strategy_nav * float(initial_capital)
    view_portfolio["Benchmark_Capital"] = benchmark_nav * float(initial_capital)
    view_portfolio["Drawdown"] = strategy_nav / strategy_nav.cummax() - 1.0
    view_portfolio["Benchmark_Drawdown"] = benchmark_nav / benchmark_nav.cummax() - 1.0

    view_benchmark["Strategy_Ret"] = view_portfolio["Benchmark_Ret"]
    view_benchmark["Pct_Change"] = view_portfolio["Benchmark_Ret"]
    view_benchmark["Strategy_Nav"] = benchmark_nav
    view_benchmark["Drawdown"] = benchmark_nav / benchmark_nav.cummax() - 1.0
    return view_portfolio, view_contrib, view_benchmark


def _build_execution_history(portfolio: pd.DataFrame) -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = []
    if portfolio.empty:
        return history

    previous_row: Optional[pd.Series] = None
    for dt, row in portfolio.iterrows():
        reason = str(row["Rebalance_Reason"])
        for asset in ASSETS:
            current_weight = float(row[f"{asset}_NetWeight"]) * 100.0
            previous_weight = float(previous_row[f"{asset}_NetWeight"]) * 100.0 if previous_row is not None else 0.0
            delta_weight = current_weight - previous_weight
            if previous_row is not None and abs(delta_weight) < 0.01:
                continue
            if previous_row is None and abs(current_weight) < 0.01:
                continue

            capital = float(row["Strategy_Capital"])
            cash_before = float(previous_row["Cash_Weight"]) * capital if previous_row is not None else capital
            cash_after = float(row["Cash_Weight"]) * capital
            position_value_before = (previous_weight / 100.0) * capital
            position_value_after = (current_weight / 100.0) * capital
            price = float(row[f"{asset}_Price"])
            meta = get_bitget_paper_meta(asset)
            history.append(
                {
                    "id": f"{dt.strftime('%Y-%m-%d')}-{asset}",
                    "timestamp": f"{dt.strftime('%Y-%m-%d')}T00:00:00Z",
                    "asset": asset,
                    "venue": meta["venue"],
                    "symbol": meta["symbol"],
                    "productType": meta["productType"],
                    "side": "BUY" if delta_weight > 0 else "SELL",
                    "status": "snapshot",
                    "executable": bool(meta["executable"]),
                    "previousWeightPct": round(previous_weight, 2),
                    "targetWeightPct": round(current_weight, 2),
                    "deltaWeightPct": round(delta_weight, 2),
                    "quantity": round(abs(position_value_after - position_value_before) / price, 8) if abs(price) > 1e-12 else 0.0,
                    "notional": round(abs(position_value_after - position_value_before), 2),
                    "price": round(price, 4),
                    "reason": reason,
                    "action": "snapshot",
                    "equityBefore": round(capital, 2),
                    "equityAfter": round(capital, 2),
                    "equityDelta": 0.0,
                    "cashBefore": round(cash_before, 2),
                    "cashAfter": round(cash_after, 2),
                    "cashDelta": round(cash_after - cash_before, 2),
                    "positionValueBefore": round(position_value_before, 2),
                    "positionValueAfter": round(position_value_after, 2),
                    "positionValueDelta": round(position_value_after - position_value_before, 2),
                }
            )
        previous_row = row

    history.sort(key=lambda item: (str(item["timestamp"]), str(item["asset"])), reverse=True)
    return history


def _build_payload(
    portfolio: pd.DataFrame,
    contrib: pd.DataFrame,
    benchmark_frame: pd.DataFrame,
    config: dict[str, Any],
    initial_capital: float,
    treasury_source_context: Optional[dict[str, Any]] = None,
    macro_signal_context: Optional[dict[str, Any]] = None,
    execution_history_source: Optional[pd.DataFrame] = None,
    execution_history_view_start: Optional[str] = None,
) -> dict[str, Any]:
    strategy_perf = compute_perf_metrics(portfolio, risk_free_rate=float(config["risk_free_rate"]))
    benchmark_perf = compute_perf_metrics(benchmark_frame, risk_free_rate=float(config["risk_free_rate"]))
    strategy_win_rate = _compute_win_rate(portfolio["Strategy_Ret"])
    benchmark_win_rate = _compute_win_rate(portfolio["Benchmark_Ret"])
    strategy_profit_factor = _compute_profit_factor(portfolio["Strategy_Ret"])
    benchmark_profit_factor = _compute_profit_factor(portfolio["Benchmark_Ret"])
    terminal_boards = _build_terminal_boards(
        portfolio,
        benchmark_frame,
        strategy_perf,
        config,
        initial_capital,
    )

    last_idx = portfolio.index[-1]
    last_snapshot = {
        "date": last_idx.strftime("%Y-%m-%d"),
        "regime": str(portfolio.at[last_idx, "Regime"]),
        "macro_score": round(float(portfolio.at[last_idx, "Macro_Score"]), 2),
        "raw_macro_score": round(float(portfolio.at[last_idx, "Macro_Raw_Score"]), 2),
        "alpha": round(float(portfolio.at[last_idx, "Alpha"]), 4),
        "vol_factor": round(float(portfolio.at[last_idx, "Vol_Factor"]), 4),
        "port_vol_60d": round(float(portfolio.at[last_idx, "Port_Vol_60d"]), 4),
        "risk_signals": int(portfolio.at[last_idx, "Risk_Signals"]),
        "signal_list": list(portfolio.at[last_idx, "Signal_List"]),
        "strategy_nav": round(float(portfolio.at[last_idx, "Strategy_Nav"]), 4),
        "benchmark_nav": round(float(portfolio.at[last_idx, "Benchmark_Nav"]), 4),
        "strategy_dd": round(float(portfolio.at[last_idx, "Drawdown"]) * 100.0, 2),
        "benchmark_dd": round(float(portfolio.at[last_idx, "Benchmark_Drawdown"]) * 100.0, 2),
        "cash_weight_pct": round(float(portfolio.at[last_idx, "Cash_Weight"]) * 100.0, 2),
        "desired_cash_weight_pct": round(float(portfolio.at[last_idx, "Desired_Cash_Weight"]) * 100.0, 2),
        "nominal_cash_weight_pct": round(float(portfolio.at[last_idx, "Nominal_Cash_Weight"]) * 100.0, 2),
        "mstr_short_pct": round(abs(float(portfolio.at[last_idx, "MSTR_Hedge"])) * 100.0, 2),
        "hedges": {
            "BTC_hedge": round(float(portfolio.at[last_idx, "BTC_Hedge"]) * 100.0, 2),
            "ETH_hedge": round(float(portfolio.at[last_idx, "ETH_Hedge"]) * 100.0, 2),
            "MSTR_hedge": round(float(portfolio.at[last_idx, "MSTR_Hedge"]) * 100.0, 2),
        },
        "mstr_premium_pct": round(float(portfolio.at[last_idx, "MSTR_Premium_Ratio"]) * 100.0, 2),
        "mstr_btc_holdings": round(float(portfolio.at[last_idx, "MSTR_BTC_Holdings"]), 2),
        "rebalance_reason": str(portfolio.at[last_idx, "Rebalance_Reason"]),
        "weights": {
            asset: round(float(portfolio.at[last_idx, f"{asset}_Weight"]) * 100.0, 2)
            for asset in ASSETS
        },
        "nominal_weights": {
            asset: round(float(portfolio.at[last_idx, f"{asset}_NominalWeight"]) * 100.0, 2)
            for asset in ASSETS
        },
        "desired_weights": {
            asset: round(float(portfolio.at[last_idx, f"{asset}_DesiredWeight"]) * 100.0, 2)
            for asset in ASSETS
        },
        "net_weights": {
            asset: round(float(portfolio.at[last_idx, f"{asset}_NetWeight"]) * 100.0, 2)
            for asset in ASSETS
        },
        "net_exposure": {
            asset: round(float(portfolio.at[last_idx, f"{asset}_NetWeight"]) * 100.0, 2)
            for asset in ASSETS
        },
        "attribution": {
            asset: round(float(portfolio.at[last_idx, f"{asset}_Contrib"]) * 100.0, 4)
            for asset in ASSETS
        },
        "prices": {
            asset: round(float(portfolio.at[last_idx, f"{asset}_Price"]), 4)
            for asset in ASSETS
        },
    }

    chart_rows = []
    for dt, row in portfolio.iterrows():
        chart_rows.append(
            {
                "date": dt.strftime("%Y-%m-%d"),
                "nav": round(float(row["Strategy_Nav"]), 6),
                "benchmark_nav": round(float(row["Benchmark_Nav"]), 6),
                "drawdown": round(float(row["Drawdown"]) * 100.0, 4),
                "benchmark_drawdown": round(float(row["Benchmark_Drawdown"]) * 100.0, 4),
                "regime": str(row["Regime"]),
                "macro_score": round(float(row["Macro_Score"]), 2),
                "alpha": round(float(row["Alpha"]), 4),
                "vol_factor": round(float(row["Vol_Factor"]), 4),
                "port_vol_60d": round(float(row["Port_Vol_60d"]), 4),
                "risk_signals": int(row["Risk_Signals"]),
                "rebalance_reason": str(row["Rebalance_Reason"]),
            }
        )

    history_source = execution_history_source if execution_history_source is not None else portfolio
    replay_history = _build_execution_history(history_source)
    display_history = [
        item
        for item in replay_history
        if not execution_history_view_start or str(item["timestamp"])[:10] >= execution_history_view_start
    ]

    payload = {
        "status": "ok",
        "strategyId": "five_asset_macro_cta",
        "title": "Five-Asset Macro CTA",
        "startDate": portfolio.index[0].strftime("%Y-%m-%d"),
        "endDate": portfolio.index[-1].strftime("%Y-%m-%d"),
        "windowStartPrices": {
            asset: round(float(portfolio.iloc[0][f"{asset}_Price"]), 4)
            for asset in ASSETS
        },
        "startingCapital": float(initial_capital),
        "benchmarkName": "Five-Asset Equal Weight",
        "kpis": {
            "strategy": {
                "cagr": round(float(strategy_perf.get("cagr", 0.0)), 6),
                "mdd": round(float(strategy_perf.get("mdd", 0.0)), 6),
                "sharpe": round(float(strategy_perf.get("sharpe_m", 0.0)), 4),
                "calmar": round(float(strategy_perf.get("calmar", 0.0)), 4),
                "winRate": round(strategy_win_rate, 6),
                "profitFactor": _round_optional(strategy_profit_factor, 4),
                "total_nav": round(float(portfolio["Strategy_Nav"].iloc[-1]), 6),
                "total_cost": round(float(portfolio["Total_Cost"].sum()), 6),
                "avg_turnover": round(float(strategy_perf.get("avg_turnover", 0.0)), 6),
            },
            "benchmark": {
                "cagr": round(float(benchmark_perf.get("cagr", 0.0)), 6),
                "mdd": round(float(benchmark_perf.get("mdd", 0.0)), 6),
                "sharpe": round(float(benchmark_perf.get("sharpe_m", 0.0)), 4),
                "calmar": round(float(benchmark_perf.get("calmar", 0.0)), 4),
                "winRate": round(benchmark_win_rate, 6),
                "profitFactor": _round_optional(benchmark_profit_factor, 4),
                "total_nav": round(float(portfolio["Benchmark_Nav"].iloc[-1]), 6),
            },
        },
        "lastSnapshot": last_snapshot,
        "series": {
            "portfolio": chart_rows,
            "prices": {
                asset: _series_to_points(portfolio[f"{asset}_Price"], digits=4, limit=None)
                for asset in ASSETS
            },
            "contributions": {
                asset: _series_to_points(portfolio[f"{asset}_Contrib"] * 100.0, digits=4, limit=None)
                for asset in ASSETS
            },
            "weights": {
                asset: _series_to_points(portfolio[f"{asset}_Weight"] * 100.0, digits=2, limit=None)
                for asset in ASSETS
            },
            "nominalWeights": {
                asset: _series_to_points(portfolio[f"{asset}_NominalWeight"] * 100.0, digits=2, limit=None)
                for asset in ASSETS
            },
            "desiredWeights": {
                asset: _series_to_points(portfolio[f"{asset}_DesiredWeight"] * 100.0, digits=2, limit=None)
                for asset in ASSETS
            },
            "netWeights": {
                asset: _series_to_points(portfolio[f"{asset}_NetWeight"] * 100.0, digits=2, limit=None)
                for asset in ASSETS
            },
            "desiredNetWeights": {
                asset: _series_to_points(portfolio[f"{asset}_NetWeight"] * 100.0, digits=2, limit=None)
                for asset in ASSETS
            },
            "hedges": {
                asset: _series_to_points(portfolio[f"{asset}_Hedge"] * 100.0, digits=2, limit=None)
                for asset in HEDGE_ASSETS
            },
            "mstrShort": _series_to_points(portfolio["MSTR_Hedge"].abs() * 100.0, digits=2, limit=None),
            "macroScore": _series_to_points(portfolio["Macro_Score"], digits=2, limit=None),
            "alpha": _series_to_points(portfolio["Alpha"], digits=4, limit=None),
            "volFactor": _series_to_points(portfolio["Vol_Factor"], digits=4, limit=None),
            "portVol60d": _series_to_points(portfolio["Port_Vol_60d"], digits=4, limit=None),
            "riskSignals": _series_to_points(portfolio["Risk_Signals"], digits=0, limit=None),
        },
        "monthly": _build_monthly_map(portfolio["Strategy_Ret"]),
        "regimeSummary": _build_regime_summary(portfolio["Regime"]),
        "assetSummary": _build_asset_summary(portfolio, contrib),
        "executionHistory": display_history,
        "positionReplayHistory": replay_history,
        "terminalBoards": terminal_boards,
        "configSummary": {
            "regimes": list(REGIMES),
            "assets": list(ASSETS),
            "benchmarkAsset": config["benchmark_asset"],
            "maxGrossExposure": float(config["max_gross_exposure"]),
            "execution": {
                "rebalanceMode": str(config["execution"]["rebalance_mode"]).upper(),
                "minHoldDays": int(config["execution"]["min_hold_days"]),
                "weightStep": float(config["execution"].get("weight_step", 0.0)),
                "turnoverBuffer": float(config["execution"].get("trade_buffer", config["execution"].get("turnover_buffer", 0.20))),
            },
            "signal": {
                "macroSmoothSpan": int(config["macro_smooth_span"]),
                "macroLagDays": int(config["macro_lag_days"]),
                "volTarget": float(config["vol_target"]),
                "volLookback": int(config["vol_lookback"]),
                "levMin": float(config["lev_min"]),
                "levMax": float(config["lev_max"]),
            },
            "operations": {
                "feePerSidePct": float(config["terminal_boards"]["operations"]["fee_per_side_pct"]),
                "hedgeLeverage": float(config["terminal_boards"]["operations"]["hedge_leverage"]),
                "hedgeMaxSizePct": float(config["terminal_boards"]["operations"]["hedge_max_size_pct"]),
            },
        },
    }
    if treasury_source_context is not None:
        payload["dataSources"] = {
            "treasury": treasury_source_context,
        }
    if macro_signal_context is not None:
        payload["macroSignal"] = macro_signal_context
    return payload


def build_five_asset_backtest_payload(
    df_all: Optional[pd.DataFrame] = None,
    price_frame: Optional[pd.DataFrame] = None,
    score_frame: Optional[pd.DataFrame] = None,
    macro_payload: Optional[dict[str, Any]] = None,
    macro_signal_context: Optional[dict[str, Any]] = None,
    config: Optional[dict[str, Any]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    view_start_date: Optional[str] = None,
    initial_capital: float = DEFAULT_BACKTEST_INITIAL_CAPITAL,
) -> dict[str, Any]:
    """Build an independent five-asset portfolio backtest payload."""
    cfg = _resolve_config(config)
    start = start_date or cfg["start_date"]

    resolved_score_frame = score_frame
    if resolved_score_frame is None and macro_payload is not None:
        resolved_score_frame = macro_payload_to_score_frame(macro_payload)
    resolved_macro_context = macro_signal_context
    if resolved_macro_context is None and macro_payload is not None:
        resolved_macro_context = build_macro_signal_context(macro_payload, source_type="embedded")
    treasury_schedule, treasury_meta, treasury_warnings = load_mstr_treasury_source(prefer_remote=bool(config and config.get("prefer_remote_treasury")))

    if price_frame is None:
        price_frame = download_price_frame(start_date=start, end_date=end_date)
    prices = normalize_price_frame(price_frame)
    if prices.empty:
        raise ValueError("price frame is empty")

    prices.index = pd.to_datetime(prices.index)
    if start:
        prices = prices.loc[prices.index >= pd.Timestamp(start)]
    if end_date:
        prices = prices.loc[prices.index <= pd.Timestamp(end_date)]
    prices = prices.dropna(subset=list(ASSETS))
    if len(prices) < 120:
        raise ValueError("price frame needs at least 120 common observations for CTA logic")

    macro = _prepare_macro_frame(df_all=df_all, index=prices.index, config=cfg, score_frame=resolved_score_frame)
    features = _calc_asset_features(prices, int(cfg["vol_lookback"]))
    risk = _compute_risk_signals(df_all=df_all, macro=macro, features=features, config=cfg)
    desired_long_weights, _, nominal_cash_weight, vol_factor, nominal_weights, port_vol_60d = _compute_base_target_weights(
        macro=macro,
        features=features,
        config=cfg,
    )
    executed_long_weights, _, rebalance_reason = _execute_base_allocations(
        desired_long=desired_long_weights,
        macro=macro,
        risk=risk,
        config=cfg,
    )
    treasury = _compute_mstr_premium_frame(prices, treasury_schedule)
    desired_hedges = _compute_hedge_targets(
        macro=macro,
        features=features,
        treasury=treasury,
        config=cfg,
        long_weights=executed_long_weights,
    )
    net_weights, cash_weight = _combine_net_weights(executed_long_weights, desired_hedges)
    desired_cash_weight = (1.0 - desired_long_weights.sum(axis=1) - desired_hedges.abs().sum(axis=1)).clip(lower=0.0)
    portfolio, contrib, benchmark_frame = _simulate_portfolio(
        price_frame=prices,
        features=features,
        macro=macro,
        risk=risk,
        nominal_weights=nominal_weights,
        desired_long_weights=desired_long_weights,
        executed_long_weights=executed_long_weights,
        desired_hedges=desired_hedges,
        net_weights=net_weights,
        cash_weight=cash_weight,
        desired_cash_weight=desired_cash_weight,
        nominal_cash_weight=nominal_cash_weight,
        rebalance_reason=rebalance_reason,
        vol_factor=vol_factor,
        port_vol_60d=port_vol_60d,
        treasury=treasury,
        config=cfg,
        initial_capital=float(initial_capital),
    )
    history_portfolio = portfolio.copy()
    portfolio, contrib, benchmark_frame = _slice_view_window(
        portfolio,
        contrib,
        benchmark_frame,
        view_start_date=view_start_date,
        view_end_date=end_date,
        initial_capital=float(initial_capital),
    )
    return _build_payload(
        portfolio,
        contrib,
        benchmark_frame,
        cfg,
        float(initial_capital),
        treasury_source_context={
            **treasury_meta,
            "warnings": treasury_warnings,
            "latestPremiumPct": round(float(treasury["premium_ratio"].iloc[-1]) * 100.0, 2) if not treasury.empty else None,
        },
        macro_signal_context=resolved_macro_context,
        execution_history_source=history_portfolio if view_start_date else None,
        execution_history_view_start=view_start_date,
    )


def build_live_five_asset_backtest_payload(
    config: Optional[dict[str, Any]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    initial_capital: float = DEFAULT_BACKTEST_INITIAL_CAPITAL,
) -> dict[str, Any]:
    """Convenience wrapper that loads project macro data and Yahoo prices."""
    cfg = _resolve_config(config)
    start = start_date or cfg["start_date"]
    df_all = load_project_macro_frame(start_date="2010-01-01")
    return build_five_asset_backtest_payload(
        df_all=df_all,
        price_frame=None,
        score_frame=None,
        config=cfg,
        start_date=start,
        end_date=end_date,
        initial_capital=initial_capital,
    )
