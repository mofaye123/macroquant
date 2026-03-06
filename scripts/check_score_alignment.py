#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List
from urllib.error import URLError
from urllib.request import urlopen


DEFAULT_WEIGHTS: Dict[str, float] = {
    "A": 0.20,
    "B": 0.20,
    "C": 0.15,
    "D": 0.15,
    "E": 0.15,
    "F": 0.075,
    "G": 0.075,
}


def _parse_weight(weight_field: object, module_id: str) -> float:
    if isinstance(weight_field, (int, float)):
        v = float(weight_field)
        if 0.0 <= v <= 1.0:
            return v
        if 1.0 < v <= 100.0:
            return v / 100.0
    if isinstance(weight_field, str):
        m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*%", weight_field)
        if m:
            return float(m.group(1)) / 100.0
    return DEFAULT_WEIGHTS.get(module_id, 0.0)


def _fetch_payload(url: str) -> dict:
    with urlopen(url, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _calc_weighted_from_modules(modules: List[dict]) -> float:
    weighted = 0.0
    for m in modules:
        module_id = str(m.get("id", "")).strip().upper()
        score = float(m.get("score", 50.0))
        weight = _parse_weight(m.get("weight"), module_id)
        weighted += score * weight
    return weighted


def _run_once(url: str, tolerance: float) -> int:
    payload = _fetch_payload(url)
    dashboard = payload.get("dashboard", {})
    overall_field = dashboard.get("overallScore", {})
    overall = float(overall_field.get("value", 50.0))
    modules = dashboard.get("modules", [])
    weighted_raw = _calc_weighted_from_modules(modules)
    weighted_display = round(weighted_raw, 1)
    diff = overall - weighted_display
    ok = abs(diff) <= tolerance

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    status = "OK" if ok else "MISMATCH"
    print(
        f"[{now}] page_overall={overall:.1f} | weighted_modules={weighted_display:.1f} "
        f"(raw={weighted_raw:.4f}) | diff={diff:+.4f} | status={status}"
    )
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Check dashboard overall score alignment with weighted module scores.")
    parser.add_argument("--url", default="http://127.0.0.1:8000/api/v1/macro-data", help="Macro payload API URL.")
    parser.add_argument("--tolerance", type=float, default=0.05, help="Allowed absolute diff after 1-decimal display.")
    parser.add_argument("--watch", action="store_true", help="Continuously poll and print alignment status.")
    parser.add_argument("--interval", type=float, default=5.0, help="Polling interval seconds in watch mode.")
    args = parser.parse_args()

    if not args.watch:
        try:
            return _run_once(args.url, args.tolerance)
        except (ValueError, KeyError, TypeError, URLError, TimeoutError) as exc:
            print(f"ERROR: failed to check score alignment: {exc}", file=sys.stderr)
            return 2

    while True:
        try:
            _run_once(args.url, args.tolerance)
        except (ValueError, KeyError, TypeError, URLError, TimeoutError) as exc:
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            print(f"[{now}] ERROR: {exc}", file=sys.stderr)
        time.sleep(max(0.5, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
