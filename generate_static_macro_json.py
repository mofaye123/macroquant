#!/usr/bin/env python3
import argparse
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from api_server import build_macro_payload


DEFAULT_OUTPUT = Path(__file__).resolve().parent / "web" / "public" / "data" / "macro-data.json"


def _json_safe(value):
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, (np.floating, float)):
        numeric = float(value)
        return numeric if math.isfinite(numeric) else None
    if isinstance(value, (np.integer, int)):
        return int(value)
    return value


def has_ready_modules(payload):
    data_quality = payload.get("dataQuality", {})
    ready_modules = data_quality.get("readyModules", [])
    return isinstance(ready_modules, list) and len(ready_modules) > 0


def load_existing_payload(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_payload(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_json_safe(payload), ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def write_status(path, status):
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_json_safe(status), ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Generate static MacroQuant payload JSON for Next.js.")
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Output JSON path (default: web/public/data/macro-data.json)",
    )
    parser.add_argument(
        "--allow-degraded",
        action="store_true",
        help="Overwrite existing file even when the newly generated payload is degraded.",
    )
    parser.add_argument(
        "--status-file",
        help="Optional JSON file to write generation status metadata to.",
    )
    parser.add_argument(
        "--as-of-days-ago",
        type=int,
        default=0,
        help="Optional cutoff in days ago for backfill/testing (e.g. 1 means generate payload as of yesterday UTC).",
    )
    args = parser.parse_args()

    output_path = Path(args.output).expanduser().resolve()
    status_path = Path(args.status_file).expanduser().resolve() if args.status_file else None
    existing_payload = load_existing_payload(output_path)
    as_of_days_ago = max(0, int(args.as_of_days_ago))
    as_of_date = None
    if as_of_days_ago > 0:
        as_of_date = (datetime.now(timezone.utc).date() - timedelta(days=as_of_days_ago)).isoformat()

    try:
        payload = build_macro_payload(as_of_date=as_of_date)
    except Exception as exc:
        status = {
            "result": "error",
            "outputPath": str(output_path),
            "mode": None,
            "readyModules": 0,
            "reason": f"as_of_days_ago={as_of_days_ago}" if as_of_days_ago else None,
            "message": f"Snapshot generation failed: {exc}",
        }
        write_status(status_path, status)
        print(status["message"], file=sys.stderr)
        return 1
    payload.setdefault("dataQuality", {})
    payload["dataQuality"]["deliveryMode"] = "static-json"

    ready_count = len(payload["dataQuality"].get("readyModules", []))
    degraded = payload["dataQuality"].get("mode") == "degraded"
    status = {
        "result": "updated",
        "outputPath": str(output_path),
        "mode": payload["dataQuality"].get("mode"),
        "readyModules": ready_count,
        "reason": payload["dataQuality"].get("reason"),
        "message": "",
    }

    if degraded and existing_payload is not None and not args.allow_degraded and has_ready_modules(existing_payload):
        message = "Live payload is degraded; keeping existing static JSON because it contains a healthier snapshot."
        status["result"] = "kept_existing"
        status["message"] = message
        write_status(status_path, status)
        print(message, file=sys.stderr)
        print(str(output_path))
        return 0

    if degraded and existing_payload is None and not args.allow_degraded:
        message = (
            "Refusing to write a fully degraded static JSON because no healthy snapshot exists yet. "
            "Fix the upstream data source first, or rerun with --allow-degraded if you intentionally want this."
        )
        status["result"] = "refused_degraded"
        status["message"] = message
        write_status(status_path, status)
        print(message, file=sys.stderr)
        return 1

    write_payload(output_path, payload)
    status["message"] = (
        f"Wrote static payload to {output_path} "
        f"(mode={payload['dataQuality'].get('mode')}, readyModules={ready_count})"
    )
    write_status(status_path, status)
    print(status["message"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
