#!/usr/bin/env python3
"""Run the five-asset live cycle and emit a terminal payload."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from strategies.five_asset_macro_cta.src.live_cycle import (
    WEB_STRATEGY_PATH,
    WEB_TERMINAL_PATH,
    build_terminal_payload,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the five-asset live cycle terminal pipeline.")
    parser.add_argument("--start-date", default="2020-01-02", help="Backtest start date, e.g. 2020-01-02")
    parser.add_argument("--end-date", default=None, help="Optional backtest end date")
    parser.add_argument(
        "--mode",
        choices=("auto", "live", "demo"),
        default="auto",
        help="Data mode: live uses project macro + Yahoo data, demo uses deterministic fixture, auto prefers live and falls back.",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent / "outputs" / "live" / "latest_terminal.json"),
        help="Output JSON path for the combined terminal payload",
    )
    parser.add_argument(
        "--web-output",
        action="store_true",
        help="Also write web/public/data/five-asset-terminal.json and five-asset-backtest.json.",
    )
    args = parser.parse_args()

    terminal_payload = build_terminal_payload(
        mode=args.mode,
        start_date=args.start_date,
        end_date=args.end_date,
    )

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(terminal_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.web_output:
        WEB_TERMINAL_PATH.parent.mkdir(parents=True, exist_ok=True)
        WEB_TERMINAL_PATH.write_text(json.dumps(terminal_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        WEB_STRATEGY_PATH.write_text(json.dumps(terminal_payload["strategy"], ensure_ascii=False, indent=2), encoding="utf-8")

    strategy = terminal_payload["strategy"]
    paper = terminal_payload["paperTrading"]
    last = strategy["lastSnapshot"]
    print(f"five_asset_macro_cta terminal written to: {output_path}")
    if args.web_output:
        print(f"five_asset_macro_cta terminal web payload written to: {WEB_TERMINAL_PATH}")
        print(f"five_asset_macro_cta strategy web payload written to: {WEB_STRATEGY_PATH}")
    print(
        f"source: {terminal_payload['sourceMode']} | "
        f"regime: {last['regime']} | "
        f"equity: {paper['ledger']['equity']:.2f} | "
        f"cash: {paper['ledger']['cash']:.2f} | "
        f"alerts: {len(paper['alerts'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
