#!/usr/bin/env python3
"""Run the isolated five-asset macro CTA backtest and write a JSON payload."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from strategies.five_asset_macro_cta.src.live_cycle import resolve_strategy_payload


WEB_OUTPUT_PATH = ROOT / "web" / "public" / "data" / "five-asset-backtest.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the five-asset macro CTA backtest.")
    parser.add_argument("--start-date", default="2020-01-01", help="Backtest start date, e.g. 2020-01-01")
    parser.add_argument("--end-date", default=None, help="Optional backtest end date")
    parser.add_argument(
        "--mode",
        choices=("auto", "live", "demo"),
        default="auto",
        help="Data mode: live uses project macro + Yahoo data, demo uses deterministic fixture, auto prefers live and falls back to cache/demo.",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent / "outputs" / "latest_backtest.json"),
        help="Output JSON path",
    )
    parser.add_argument(
        "--web-output",
        action="store_true",
        help="Also write the payload to web/public/data/five-asset-backtest.json for the Next.js page.",
    )
    args = parser.parse_args()

    payload = resolve_strategy_payload(
        mode=args.mode,
        start_date=args.start_date,
        end_date=args.end_date,
    )

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.web_output:
        WEB_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        WEB_OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    last = payload["lastSnapshot"]
    print(f"five_asset_macro_cta backtest written to: {output_path}")
    if args.web_output:
        print(f"five_asset_macro_cta web payload written to: {WEB_OUTPUT_PATH}")
    print(
        f'period: {payload["startDate"]} -> {payload["endDate"]} | '
        f'source: {payload["sourceMode"]} | '
        f'regime: {last["regime"]} | '
        f'strategy_nav: {last["strategy_nav"]:.4f} | '
        f'benchmark_nav: {last["benchmark_nav"]:.4f}'
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
