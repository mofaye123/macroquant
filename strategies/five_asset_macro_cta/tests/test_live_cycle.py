from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from strategies.five_asset_macro_cta.src.demo_data import build_demo_five_asset_backtest_payload
from strategies.five_asset_macro_cta.src.live_cycle import build_terminal_payload, resolve_strategy_payload


class FiveAssetLiveCycleTests(unittest.TestCase):
    def test_terminal_payload_contains_strategy_and_paper_sections(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_terminal_payload(mode="demo", state_path=Path(tmp_dir) / "paper_book.json")

        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["sourceMode"], "demo")
        self.assertIn("strategy", payload)
        self.assertIn("paperTrading", payload)
        self.assertGreater(len(payload["strategy"]["series"]["portfolio"]), 0)
        self.assertIn("dataSources", payload["strategy"])
        self.assertIn("treasury", payload["strategy"]["dataSources"])

    def test_paper_book_splits_executable_and_shadow_assets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_terminal_payload(mode="demo", state_path=Path(tmp_dir) / "paper_book.json")

        paper = payload["paperTrading"]
        self.assertEqual(paper["venue"], "BITGET_PAPER")
        self.assertEqual(paper["executableAssets"], ["BTC", "ETH"])
        self.assertEqual(paper["shadowAssets"], ["XAU", "MSTR", "SPY"])
        self.assertTrue(any(order["venue"] == "BITGET_PAPER" for order in paper["orders"]))
        self.assertTrue(any(order["venue"] == "SHADOW_BOOK" for order in paper["orders"]))

    def test_second_cycle_reuses_state_without_creating_duplicate_orders(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            state_path = Path(tmp_dir) / "paper_book.json"
            first = build_terminal_payload(mode="demo", state_path=state_path)
            second = build_terminal_payload(mode="demo", state_path=state_path)

        self.assertEqual(second["paperTrading"]["cycleCount"], first["paperTrading"]["cycleCount"])
        self.assertEqual(len(second["paperTrading"]["orders"]), len(first["paperTrading"]["orders"]))
        self.assertEqual(second["paperTrading"]["status"], "blocked")
        self.assertFalse(second["paperTrading"]["macroGuard"]["executionAllowed"])
        self.assertTrue(all(float(position["quantity"]) == 0.0 for position in second["paperTrading"]["positions"]))

    def test_alerts_surface_fallback_and_shadow_assets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_terminal_payload(mode="demo", state_path=Path(tmp_dir) / "paper_book.json")

        alerts = payload["paperTrading"]["alerts"]
        codes = {alert["code"] for alert in alerts}
        self.assertIn("DATA_FALLBACK", codes)
        self.assertIn("SHADOW_ONLY_ASSET", codes)

    def test_terminal_payload_contains_routing_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_terminal_payload(mode="demo", state_path=Path(tmp_dir) / "paper_book.json")

        routing = payload["paperTrading"]["routing"]
        self.assertIn("readyExecutableOrders", routing)
        self.assertIn("shadowSyncOrders", routing)
        self.assertIn("intents", routing)

    def test_blocked_only_ledger_resets_ghost_positions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            state_path = Path(tmp_dir) / "paper_book.json"
            state_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "updatedAt": "2026-03-12T10:00:00Z",
                        "cycleCount": 1,
                        "baseCurrency": "USD",
                        "cash": 100000.0,
                        "equity": 183000.0,
                        "positions": {
                            "BTC": {
                                "quantity": 0.15067961,
                                "avgPrice": 103000.0,
                            }
                        },
                        "orders": [
                            {
                                "id": "blocked-btc-1",
                                "timestamp": "2026-03-12T10:00:00Z",
                                "asset": "BTC",
                                "status": "blocked",
                                "targetWeightPct": 8.0,
                                "deltaWeightPct": 8.0,
                                "reason": "signal::force",
                                "blockReasons": [{"code": "MACRO_SIGNAL_NOT_LIVE", "message": "not live"}],
                            }
                        ],
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            payload = build_terminal_payload(mode="demo", state_path=state_path)

        self.assertEqual(payload["paperTrading"]["status"], "blocked")
        self.assertTrue(all(float(position["quantity"]) == 0.0 for position in payload["paperTrading"]["positions"]))
        self.assertEqual(payload["paperTrading"]["routing"]["blockedOrders"], 5)

    def test_auto_mode_can_rebuild_from_cached_market_inputs(self) -> None:
        cached_payload = build_demo_five_asset_backtest_payload(start_date="2024-01-01")
        with patch(
            "strategies.five_asset_macro_cta.src.live_cycle._can_attempt_live",
            return_value=(False, ["dns blocked"]),
        ), patch(
            "strategies.five_asset_macro_cta.src.live_cycle._build_cached_market_payload",
            return_value=(cached_payload, {"cachedAt": "2026-03-12T12:00:00Z"}, []),
        ):
            payload = resolve_strategy_payload(mode="auto", start_date="2024-01-01")

        self.assertEqual(payload["sourceMode"], "cached_live_inputs")
        self.assertIn("实时市场缓存", payload["sourceLabel"])
        self.assertTrue(any("网络预检失败" in warning for warning in payload.get("warnings", [])))

    def test_legacy_stale_live_snapshot_falls_back_to_demo_payload(self) -> None:
        legacy_payload = {
            "status": "ok",
            "strategyId": "five_asset_macro_cta",
            "title": "legacy",
            "startDate": "2024-01-01",
            "endDate": "2024-12-31",
            "lastSnapshot": {
                "date": "2024-12-31",
                "regime": "NEUTRAL",
                "macro_score": 50,
                "risk_signals": 1,
                "signal_list": [],
                "strategy_nav": 1.1,
                "benchmark_nav": 1.2,
                "strategy_dd": -5.0,
                "benchmark_dd": -10.0,
                "cash_weight_pct": 20.0,
                "desired_cash_weight_pct": 20.0,
                "mstr_short_pct": 0.0,
                "rebalance_reason": "hold",
                "weights": {"BTC": 20, "ETH": 20, "XAU": 20, "MSTR": 20, "SPY": 20},
                "desired_weights": {"BTC": 20, "ETH": 20, "XAU": 20, "MSTR": 20, "SPY": 20},
                "net_weights": {"BTC": 20, "ETH": 20, "XAU": 20, "MSTR": 20, "SPY": 20},
                "attribution": {"BTC": 0, "ETH": 0, "XAU": 0, "MSTR": 0, "SPY": 0},
                "prices": {"BTC": 100000, "ETH": 5000, "XAU": 250, "MSTR": 400, "SPY": 600},
            },
            "series": {
                "portfolio": [],
                "weights": {},
                "desiredWeights": {},
                "netWeights": {},
                "desiredNetWeights": {},
                "mstrShort": [],
                "macroScore": [],
                "riskSignals": [],
            },
            "monthly": {},
            "regimeSummary": {"counts": {}, "segments": []},
            "assetSummary": [],
            "configSummary": {
                "regimes": [],
                "assets": [],
                "benchmarkAsset": "BTC",
                "maxGrossExposure": 1.0,
                "execution": {
                    "rebalanceMode": "W",
                    "minHoldDays": 5,
                    "weightStep": 0.02,
                    "turnoverBuffer": 0.05,
                },
            },
        }
        with patch(
            "strategies.five_asset_macro_cta.src.live_cycle._can_attempt_live",
            return_value=(False, ["dns blocked"]),
        ), patch(
            "strategies.five_asset_macro_cta.src.live_cycle._build_cached_market_payload",
            return_value=(None, None, []),
        ), patch(
            "strategies.five_asset_macro_cta.src.live_cycle._load_json",
            return_value=legacy_payload,
        ):
            payload = resolve_strategy_payload(mode="auto", start_date="2024-01-01")

        self.assertEqual(payload["sourceMode"], "demo")
        self.assertIn("terminalBoards", payload)


if __name__ == "__main__":
    unittest.main()
