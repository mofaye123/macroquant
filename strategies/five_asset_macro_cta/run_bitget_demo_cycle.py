#!/usr/bin/env python3
"""Build the latest five-asset terminal payload and optionally send executable intents to Bitget demo."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from strategies.five_asset_macro_cta.src.bitget_api import BitgetApiError, client_from_env
from strategies.five_asset_macro_cta.src.config import DEFAULT_ENGINE_CONFIG
from strategies.five_asset_macro_cta.src.live_cycle import build_terminal_payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the five-asset live cycle and prepare Bitget demo execution.")
    parser.add_argument("--start-date", default=None, help="Optional view start date. Empty uses default 2023 view while preserving 2020 baseline coverage.")
    parser.add_argument("--end-date", default=None, help="Optional backtest end date")
    parser.add_argument(
        "--mode",
        choices=("auto", "live", "demo"),
        default="auto",
        help="Data mode: live uses project macro + Yahoo data, demo uses deterministic fixture, auto prefers live and falls back.",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent / "outputs" / "live" / "latest_bitget_execution.json"),
        help="Output JSON path for execution plan payload.",
    )
    parser.add_argument(
        "--send-demo-orders",
        action="store_true",
        help="Actually send executable intents to Bitget demo trading. Requires API credentials in env.",
    )
    parser.add_argument(
        "--set-position-mode",
        action="store_true",
        help="Before placing orders, set the contract account to the configured position mode.",
    )
    args = parser.parse_args()

    terminal_payload = build_terminal_payload(
        mode=args.mode,
        start_date=args.start_date,
        end_date=args.end_date,
    )
    routing = terminal_payload["paperTrading"].get("routing", {})
    macro_guard = terminal_payload["paperTrading"].get("macroGuard", {})
    execution_cfg = DEFAULT_ENGINE_CONFIG["bitget_execution"]
    plan = {
        "generatedAt": terminal_payload["generatedAt"],
        "sourceMode": terminal_payload["sourceMode"],
        "paperStatus": terminal_payload["paperTrading"]["status"],
        "routing": routing,
        "macroGuard": macro_guard,
        "bitget": {
            "demoTrading": bool(execution_cfg["demo_trading"]),
            "productType": str(execution_cfg["default_product_type"]),
            "marginCoin": str(execution_cfg["margin_coin"]),
            "marginMode": str(execution_cfg["margin_mode"]),
            "positionMode": str(execution_cfg["position_mode"]),
            "submitted": False,
            "responses": [],
        },
    }

    if args.send_demo_orders:
        if not bool(macro_guard.get("executionAllowed", False)):
            plan["bitget"]["error"] = "宏观信号未通过执行闸门，已拒绝发送 Bitget demo 订单。"
            output_path = Path(args.output).resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"bitget execution plan written to: {output_path}")
            print(plan["bitget"]["error"])
            return 1
        client = client_from_env(demo_trading=True)
        try:
            if args.set_position_mode:
                plan["bitget"]["responses"].append(
                    {
                        "type": "set_position_mode",
                        "response": client.set_position_mode(
                            product_type=str(execution_cfg["default_product_type"]),
                            pos_mode=str(execution_cfg["position_mode"]),
                        ),
                    }
                )

            for intent in routing.get("executableIntents", []):
                if intent.get("action") != "place_order":
                    continue
                response = client.place_contract_order(
                    symbol=str(intent["symbol"]),
                    product_type=str(intent.get("productType") or execution_cfg["default_product_type"]),
                    margin_coin=str(intent.get("marginCoin") or execution_cfg["margin_coin"]),
                    side=str(intent["side"]),
                    size=float(intent["quantity"]),
                    client_oid=str(intent["id"]),
                    order_type=str(execution_cfg["default_order_type"]),
                    margin_mode=str(execution_cfg["margin_mode"]),
                    time_in_force=str(execution_cfg["default_time_in_force"]),
                    reduce_only=str(intent.get("reduceOnly", "NO")),
                )
                plan["bitget"]["responses"].append(
                    {
                        "type": "place_order",
                        "intentId": intent["id"],
                        "symbol": intent["symbol"],
                        "response": response,
                    }
                )
            plan["bitget"]["submitted"] = True
        except BitgetApiError as exc:
            plan["bitget"]["error"] = str(exc)
            output_path = Path(args.output).resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"bitget execution plan written to: {output_path}")
            print(f"Bitget demo execution failed: {exc}")
            return 1

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"bitget execution plan written to: {output_path}")
    print(
        f"source: {plan['sourceMode']} | ready_executable_orders: {routing.get('readyExecutableOrders', 0)} | "
        f"shadow_sync_orders: {routing.get('shadowSyncOrders', 0)} | submitted: {plan['bitget']['submitted']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
