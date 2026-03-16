"""Deterministic demo data for the isolated five-asset strategy."""

from __future__ import annotations

from datetime import timezone
from typing import Any, Optional

import numpy as np
import pandas as pd


DEMO_START_DATE = "2020-01-02"
MIN_DEMO_PERIODS = 520


def _build_demo_index(*, end_date: Optional[str] = None, min_periods: int = MIN_DEMO_PERIODS) -> pd.DatetimeIndex:
    if end_date:
        end_ts = pd.Timestamp(end_date).normalize()
    else:
        end_ts = pd.Timestamp.now(tz=timezone.utc).normalize().tz_localize(None)

    if end_ts < pd.Timestamp(DEMO_START_DATE):
        end_ts = pd.Timestamp(DEMO_START_DATE)

    index = pd.bdate_range(DEMO_START_DATE, end=end_ts)
    if len(index) < min_periods:
        index = pd.bdate_range(DEMO_START_DATE, periods=min_periods)
    return index


def make_demo_price_frame(*, end_date: Optional[str] = None) -> pd.DataFrame:
    index = _build_demo_index(end_date=end_date)
    periods = len(index)
    base = np.linspace(0.0, 1.0, periods)
    knots = np.array([0.0, 0.16, 0.38, 0.62, 0.82, 1.0])

    def build_curve(levels: list[float], wave_amp: float, wave_freq: float) -> np.ndarray:
        trend = np.interp(base, knots, levels)
        wave = 1.0 + wave_amp * np.sin(2.0 * np.pi * wave_freq * base)
        return trend * wave

    prices = pd.DataFrame(
        {
            "BTC": build_curve([38000, 32500, 58500, 91000, 84500, 103000], 0.045, 3.5),
            "ETH": build_curve([2200, 1780, 3050, 4980, 4560, 5480], 0.055, 3.9),
            "XAU": build_curve([182, 188, 202, 226, 238, 252], 0.018, 2.8),
            "MSTR": build_curve([520, 315, 405, 765, 690, 445], 0.095, 4.4),
            "SPY": build_curve([462, 432, 505, 582, 556, 614], 0.022, 3.0),
        },
        index=index,
    )
    return prices.clip(lower=1e-6)


def make_demo_score_frame(*, end_date: Optional[str] = None) -> pd.DataFrame:
    index = _build_demo_index(end_date=end_date)
    periods = len(index)
    base = np.linspace(0.0, 1.0, periods)
    knots = np.array([0.0, 0.15, 0.38, 0.62, 0.82, 1.0])
    levels = np.array([28.0, 22.0, 49.0, 76.0, 56.0, 31.0])
    curve = np.interp(base, knots, levels) + 3.0 * np.sin(2.0 * np.pi * 2.2 * base)
    scores = np.clip(curve, 10.0, 90.0)
    return pd.DataFrame({"Total_Score": scores}, index=index)


def build_demo_five_asset_backtest_payload(
    *,
    config: Optional[dict[str, Any]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    view_start_date: Optional[str] = None,
    initial_capital: float = 100000.0,
) -> dict[str, Any]:
    from .engine import build_five_asset_backtest_payload

    return build_five_asset_backtest_payload(
        df_all=None,
        price_frame=make_demo_price_frame(end_date=end_date),
        score_frame=make_demo_score_frame(end_date=end_date),
        config=config,
        start_date=start_date,
        end_date=end_date,
        view_start_date=view_start_date,
        initial_capital=initial_capital,
    )
