from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from strategies.five_asset_macro_cta.src.engine import build_five_asset_backtest_payload


def _make_price_frame(periods: int = 220) -> pd.DataFrame:
    index = pd.bdate_range("2024-01-01", periods=periods)
    base = np.linspace(0, 1, periods)
    return pd.DataFrame(
        {
            "BTC": 40000 * (1 + 0.90 * base),
            "ETH": 2200 * (1 + 0.80 * base),
            "XAU": 180 * (1 + 0.12 * base),
            "MSTR": 500 * (1 - 0.40 * base),
            "SPY": 450 * (1 + 0.18 * base),
        },
        index=index,
    )


def _make_score_frame(periods: int = 220) -> pd.DataFrame:
    index = pd.bdate_range("2024-01-01", periods=periods)
    first = np.full(70, 25.0)
    second = np.full(80, 50.0)
    third = np.full(periods - 150, 75.0)
    scores = np.concatenate([first, second, third])
    return pd.DataFrame({"Total_Score": scores}, index=index)


class FiveAssetEngineTests(unittest.TestCase):
    def test_payload_shape_and_identity(self) -> None:
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=_make_price_frame(),
            score_frame=_make_score_frame(),
        )
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["strategyId"], "five_asset_macro_cta")
        self.assertEqual(payload["benchmarkName"], "Five-Asset Equal Weight")
        self.assertIn("strategy", payload["kpis"])
        self.assertIn("benchmark", payload["kpis"])
        self.assertIn("terminalBoards", payload)
        self.assertIn("alpha", payload["series"])
        self.assertIn("volFactor", payload["series"])
        self.assertIn("hedges", payload["series"])
        self.assertIn("dataSources", payload)
        self.assertIn("treasury", payload["dataSources"])

    def test_last_snapshot_contains_all_assets(self) -> None:
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=_make_price_frame(),
            score_frame=_make_score_frame(),
        )
        last = payload["lastSnapshot"]
        for asset in ("BTC", "ETH", "XAU", "MSTR", "SPY"):
            self.assertIn(asset, last["weights"])
            self.assertIn(asset, last["net_weights"])
            self.assertIn(asset, last["attribution"])
            self.assertIn(asset, last["prices"])
        self.assertIn("mstr_premium_pct", last)
        self.assertIn("mstr_btc_holdings", last)

    def test_long_weights_respect_strategy_gross_budget(self) -> None:
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=_make_price_frame(),
            score_frame=_make_score_frame(),
        )
        portfolio_rows = payload["series"]["portfolio"]
        weights = payload["series"]["weights"]
        max_gross = payload["configSummary"]["maxGrossExposure"]
        for idx, row in enumerate(portfolio_rows):
            gross_long = 0.0
            for asset in ("BTC", "ETH", "XAU", "MSTR", "SPY"):
                gross_long += weights[asset][idx]["value"] / 100.0
            self.assertLessEqual(gross_long, max_gross + 0.0001)
            self.assertGreaterEqual(row["risk_signals"], 0)

    def test_regime_transitions_follow_score_buckets(self) -> None:
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=_make_price_frame(),
            score_frame=_make_score_frame(),
        )
        regimes = [row["regime"] for row in payload["series"]["portfolio"]]
        self.assertIn("RISK_OFF", regimes)
        self.assertIn("NEUTRAL", regimes)
        self.assertIn("RISK_ON", regimes)

    def test_mstr_short_overlay_can_activate(self) -> None:
        prices = _make_price_frame()
        prices["BTC"] = np.linspace(52000, 28000, len(prices))
        prices["MSTR"] = np.linspace(500, 180, len(prices))
        scores = _make_score_frame()
        scores["Total_Score"] = np.concatenate(
            [np.full(140, 22.0), np.full(len(scores) - 140, 18.0)]
        )
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=prices,
            score_frame=scores,
        )
        short_series = payload["series"]["mstrShort"]
        self.assertTrue(any(point["value"] > 0 for point in short_series))

    def test_weekly_execution_differs_from_daily_targets(self) -> None:
        prices = _make_price_frame()
        scores = _make_score_frame()
        scores["Total_Score"] = np.linspace(30.0, 80.0, len(scores))
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=prices,
            score_frame=scores,
            config={
                "execution": {
                    "rebalance_mode": "W",
                    "min_hold_days": 5,
                    "weight_step": 0.02,
                    "turnover_buffer": 0.03,
                    "force_rebalance_on_regime_change": False,
                    "force_rebalance_on_risk_jump": False,
                    "risk_signal_force_level": 3,
                    "risk_signal_delta_force": 2,
                }
            },
        )
        exec_weights = payload["series"]["weights"]["BTC"]
        desired_weights = payload["series"]["desiredWeights"]["BTC"]
        self.assertTrue(
            any(exec_weights[i]["value"] != desired_weights[i]["value"] for i in range(len(exec_weights)))
        )

    def test_emergency_score_drop_can_force_rebalance(self) -> None:
        prices = _make_price_frame()
        scores = _make_score_frame()
        scores["Total_Score"] = np.concatenate(
            [np.full(120, 72.0), np.linspace(72.0, 16.0, 5), np.full(len(scores) - 125, 18.0)]
        )
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=prices,
            score_frame=scores,
            config={
                "execution": {
                    "rebalance_mode": "M",
                    "min_hold_days": 20,
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
                }
            },
        )
        reasons = [row["rebalance_reason"] for row in payload["series"]["portfolio"]]
        self.assertIn("force", reasons)

    def test_terminal_boards_include_options_and_reference_benchmark(self) -> None:
        payload = build_five_asset_backtest_payload(
            df_all=None,
            price_frame=_make_price_frame(),
            score_frame=_make_score_frame(),
        )
        boards = payload["terminalBoards"]
        self.assertEqual(len(boards["tickerTape"]), 5)
        self.assertTrue(len(boards["optionsBoard"]["chain"]) >= 5)
        self.assertGreater(boards["optionsBoard"]["atmIv"], 0)
        self.assertEqual(boards["referenceBenchmark"]["weights"]["BTC"], 20.0)
        self.assertIn("BTC", boards["operationsBoard"]["leverageCaps"])


if __name__ == "__main__":
    unittest.main()
