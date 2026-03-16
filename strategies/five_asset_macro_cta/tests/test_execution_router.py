from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from strategies.five_asset_macro_cta.src.bitget_api import BitgetCredentials, BitgetRestClient
from strategies.five_asset_macro_cta.src.config import ASSETS
from strategies.five_asset_macro_cta.src.execution_router import build_execution_intents
from strategies.five_asset_macro_cta.src.live_cycle import build_terminal_payload


class FiveAssetExecutionRouterTests(unittest.TestCase):
    def test_execution_intents_split_executable_and_shadow_assets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            terminal = build_terminal_payload(mode="demo", state_path=Path(tmp_dir) / "paper_book.json")

        intents = build_execution_intents(
            terminal["strategy"],
            {},
            equity=terminal["strategy"]["startingCapital"],
        )
        executable_assets = [row["asset"] for row in intents if row["executable"] and row["action"] == "place_order"]
        shadow_assets = [row["asset"] for row in intents if not row["executable"] and row["action"] == "shadow_sync"]
        self.assertEqual(executable_assets, ["BTC", "ETH"])
        self.assertEqual(shadow_assets, ["XAU", "MSTR", "SPY"])

    def test_second_cycle_routes_to_hold_when_weights_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            state_path = Path(tmp_dir) / "paper_book.json"
            terminal = build_terminal_payload(mode="demo", state_path=state_path)

        strategy = terminal["strategy"]
        equity = float(strategy["startingCapital"])
        last = strategy["lastSnapshot"]
        existing_positions = {}
        for asset in ASSETS:
            target_weight_pct = float(last["net_weights"].get(asset, last["weights"].get(asset, 0.0)))
            price = float(last["prices"][asset])
            existing_positions[asset] = {
                "quantity": equity * target_weight_pct / 100.0 / price,
            }

        intents = build_execution_intents(
            strategy,
            existing_positions,
            equity=equity,
            allow_execution=True,
        )
        self.assertTrue(all(intent["action"] == "hold" for intent in intents))
        self.assertEqual(len(intents), len(ASSETS))


class BitgetRestClientTests(unittest.TestCase):
    def test_demo_headers_include_paptrading_and_signature(self) -> None:
        client = BitgetRestClient(
            credentials=BitgetCredentials(api_key="key", api_secret="secret", passphrase="pass"),
            base_url="https://api.bitget.com",
            demo_trading=True,
        )
        signature = client._sign("1700000000000", "POST", "/api/v2/mix/order/place-order", "", '{"symbol":"BTCUSDT"}')
        headers = client._headers(timestamp="1700000000000", signature=signature)

        self.assertIn("ACCESS-SIGN", headers)
        self.assertEqual(headers["paptrading"], "1")
        self.assertEqual(headers["ACCESS-KEY"], "key")

    def test_place_contract_order_serializes_expected_body(self) -> None:
        client = BitgetRestClient(
            credentials=BitgetCredentials(api_key="key", api_secret="secret", passphrase="pass"),
            base_url="https://api.bitget.com",
            demo_trading=True,
        )

        captured: dict[str, object] = {}

        def fake_request(method: str, request_path: str, *, params=None, body=None):
            captured["method"] = method
            captured["request_path"] = request_path
            captured["params"] = params
            captured["body"] = body
            return {"code": "00000", "msg": "success", "data": {}}

        client.request = fake_request  # type: ignore[method-assign]
        client.place_contract_order(
            symbol="BTCUSDT",
            product_type="USDT-FUTURES",
            margin_coin="USDT",
            side="BUY",
            size=0.015,
            client_oid="demo-1",
            order_type="market",
            margin_mode="crossed",
            reduce_only="NO",
        )

        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["request_path"], "/api/v2/mix/order/place-order")
        body = captured["body"]
        self.assertIsInstance(body, dict)
        assert isinstance(body, dict)
        self.assertEqual(body["symbol"], "BTCUSDT")
        self.assertEqual(body["productType"], "USDT-FUTURES")
        self.assertEqual(body["size"], "0.015")
        self.assertEqual(body["side"], "buy")
        self.assertEqual(body["reduceOnly"], "NO")


if __name__ == "__main__":
    unittest.main()
