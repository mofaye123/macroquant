"""Base config for the isolated five-asset macro CTA strategy."""

ASSETS = ("BTC", "ETH", "XAU", "MSTR", "SPY")
HEDGE_ASSETS = ("BTC", "ETH", "MSTR")
REGIMES = ("RISK_OFF", "NEUTRAL", "RISK_ON")

YFINANCE_SYMBOLS = {
    "BTC": "BTC-USD",
    "ETH": "ETH-USD",
    "XAU": "GC=F",
    "MSTR": "MSTR",
    "SPY": "SPY",
}

ASSET_GROUPS = {
    "BTC": "crypto",
    "ETH": "crypto",
    "XAU": "defensive",
    "MSTR": "satellite",
    "SPY": "equity",
}

ASSET_ROLES = {
    "BTC": "core crypto beta",
    "ETH": "high beta crypto beta",
    "XAU": "defensive macro hedge",
    "MSTR": "equity-linked bitcoin beta",
    "SPY": "macro beta equity sleeve",
}

DEFAULT_REGIME_THRESHOLDS = {
    "risk_off_max": 35.0,
    "risk_on_min": 65.0,
}

DEFAULT_ANCHOR_WEIGHTS = {
    "defensive": {
        "BTC": 0.04,
        "ETH": 0.02,
        "MSTR": 0.01,
        "SPY": 0.18,
        "XAU": 0.40,
        "CASH": 0.35,
    },
    "aggressive": {
        "BTC": 0.38,
        "ETH": 0.27,
        "MSTR": 0.13,
        "SPY": 0.15,
        "XAU": 0.07,
        "CASH": 0.00,
    },
}

DEFAULT_MAX_NOTIONAL = {
    "BTC": 0.60,
    "ETH": 0.45,
    "MSTR": 0.20,
    "SPY": 0.40,
    "XAU": 0.50,
}

DEFAULT_HEDGE_CONFIG = {
    "BTC": {
        "nav_pct": 0.05,
        "leverage": 2.0,
        "score_th": 35.0,
        "score_full": 20.0,
        "score_exit": 45.0,
        "ma": 60,
        "confirm_ma": 20,
        "recover_days": 3,
    },
    "ETH": {
        "nav_pct": 0.05,
        "leverage": 2.0,
        "score_th": 35.0,
        "score_full": 20.0,
        "score_exit": 45.0,
        "ma": 60,
        "recover_days": 3,
        "shock_drop": 0.12,
        "shock_exit_days": 5,
        "shock_profit_pct": 0.08,
        "shock_review_start": 3,
    },
    "MSTR": {
        "nav_pct": 0.05,
        "leverage": 5.0,
        "mode": "trend_relative_v1",
        "score_th": 35.0,
        "score_full": 20.0,
        "score_exit": 45.0,
        "ma": 60,
        "recover_days": 3,
        "trend_entry_days": 5,
        "trend_add_days": 10,
        "exit_days": 2,
        "exit_ma20_days": 1,
        "max_hold_days": 20,
        "ratio_ma": 20,
        "require_btc_bear": True,
        "allow_btc_shock_entry": True,
        "btc_shock_drop_5d": 0.08,
        "initial_size_ratio": 0.50,
        "shock_size_ratio": 1.00,
        "cap_by_btc_weight": True,
        "btc_weight_cap_multiplier": 1.0,
        "respect_macro_exit": False,
        "use_premium_filter": False,
        "premium_filter_z_window": 120,
        "premium_filter_z_th": 1.0,
        "premium_th": 0.40,
        "premium_full": 0.80,
        "premium_exit": 0.20,
    },
}

DEFAULT_REFERENCE_BENCHMARK = {
    "name": "五资产等权参考篮子",
    "weights": {
        "BTC": 0.20,
        "ETH": 0.20,
        "XAU": 0.20,
        "MSTR": 0.20,
        "SPY": 0.20,
    },
    "rebalance_mode": "ME",
    "leverage": "none",
    "hedge": "none",
}

DEFAULT_OPERATIONS_BOARD = {
    "leverage_caps": {
        "BTC": 2.0,
        "ETH": 2.0,
        "XAU": 1.0,
        "MSTR": 1.5,
        "SPY": 1.0,
    },
    "funding_daily_pct": {
        "BTC": 0.03,
        "ETH": 0.03,
        "XAU": 0.0,
        "MSTR": 0.01,
        "SPY": 0.0,
    },
    "fee_per_side_pct": 0.35,
    "hedge_leverage": 5.0,
    "hedge_max_size_pct": 25.0,
}

DEFAULT_OPTIONS_BOARD = {
    "expiry_days": 30,
    "min_iv_pct": 35.0,
    "max_iv_pct": 120.0,
    "moneyness_offsets": [-0.18, -0.12, -0.08, -0.04, 0.0, 0.04, 0.08, 0.12, 0.18],
}

# Based on official Strategy / MicroStrategy investor materials and SEC 8-K updates.
# Values are kept as forward-filled schedule anchors so the premium model can run even
# when a live treasury API is not available.
DEFAULT_MSTR_TREASURY_SCHEDULE = [
    {"date": "2020-12-31", "btc_holdings": 70470, "basic_shares_outstanding": 95_870_000},
    {"date": "2021-12-31", "btc_holdings": 124391, "basic_shares_outstanding": 112_860_000},
    {"date": "2022-12-31", "btc_holdings": 132500, "basic_shares_outstanding": 115_490_000},
    {"date": "2023-12-31", "btc_holdings": 189150, "basic_shares_outstanding": 168_681_000},
    {"date": "2024-12-31", "btc_holdings": 447470, "basic_shares_outstanding": 245_778_000},
    {"date": "2025-03-09", "btc_holdings": 499096, "basic_shares_outstanding": 266_178_000},
    {"date": "2025-06-01", "btc_holdings": 580955, "basic_shares_outstanding": 279_342_000},
]

DEFAULT_ENGINE_CONFIG = {
    "start_date": "2021-01-04",
    "risk_free_rate": 0.04,
    "macro_smooth_span": 10,
    "macro_lag_days": 1,
    "vol_target": 0.15,
    "vol_lookback": 60,
    "lev_min": 0.5,
    "lev_max": 2.0,
    "prefer_remote_treasury": False,
    "max_gross_exposure": 2.0,
    "benchmark_asset": "FIVE_ASSET_EQUAL_WEIGHT",
    "regime_thresholds": DEFAULT_REGIME_THRESHOLDS,
    "anchor_weights": DEFAULT_ANCHOR_WEIGHTS,
    "max_notional": DEFAULT_MAX_NOTIONAL,
    "hedges": DEFAULT_HEDGE_CONFIG,
    "mstr_treasury_schedule": DEFAULT_MSTR_TREASURY_SCHEDULE,
    "execution": {
        "rebalance_mode": "M",
        "min_hold_days": 10,
        "weight_step": 0.0,
        "turnover_buffer": 0.20,
        "trade_buffer": 0.20,
        "force_rebalance_on_regime_change": False,
        "force_rebalance_on_risk_jump": True,
        "risk_signal_force_level": 3,
        "risk_signal_delta_force": 2,
        "emergency_drop": 20.0,
        "emergency_score": 20.0,
        "emergency_risk_count": 3,
    },
    "signal_thresholds": {
        "macro_drop_20d": -6.0,
        "vix_vxv_invert": 1.0,
        "hy_spread_10d": 0.60,
        "eth_shock_drop": 0.12,
    },
    "costs": {
        "fee_one_way_bps": 5.0,
        "slippage_one_way_bps": 30.0,
        "funding_long_bps_daily": {
            "BTC": 3.0,
            "ETH": 3.0,
            "MSTR": 1.0,
            "SPY": 0.0,
            "XAU": 0.0,
        },
        "funding_short_bps_daily": 0.0,
    },
    "paper_execution": {
        "base_currency": "USD",
        "executable_assets": ["BTC", "ETH"],
        "shadow_assets": ["XAU", "MSTR", "SPY"],
        "min_order_weight_pct": 0.5,
        "drift_alert_pct": 2.0,
        "max_order_history": 120,
    },
    "bitget_execution": {
        "base_url": "https://api.bitget.com",
        "locale": "zh-CN",
        "default_product_type": "USDT-FUTURES",
        "margin_coin": "USDT",
        "margin_mode": "crossed",
        "position_mode": "one_way_mode",
        "default_order_type": "market",
        "default_time_in_force": "gtc",
        "demo_trading": True,
    },
    "macro_signal_guard": {
        "require_live_builder_for_execution": True,
        "max_generated_age_hours": 120.0,
        "max_score_age_days": 4.0,
        "min_ready_modules": 7,
        "allowed_data_quality_modes": ["ok"],
        "allowed_source_types": ["live_builder", "direct_fred_graph", "static_json"],
    },
    "terminal_boards": {
        "reference_benchmark": DEFAULT_REFERENCE_BENCHMARK,
        "operations": DEFAULT_OPERATIONS_BOARD,
        "options": DEFAULT_OPTIONS_BOARD,
    },
    "risk_alerts": {
        "critical_risk_signals": 3,
        "warning_risk_signals": 2,
        "drawdown_critical_pct": -20.0,
        "drawdown_warning_pct": -12.0,
        "cash_floor_pct": 5.0,
    },
}
