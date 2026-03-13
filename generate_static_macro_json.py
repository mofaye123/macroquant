#!/usr/bin/env python3
import argparse
import importlib
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np


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
    path.write_text(
        json.dumps(_json_safe(payload), ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )


def write_status(path, status):
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_json_safe(status), ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def load_build_macro_payload():
    module = importlib.import_module("api_server")
    builder = getattr(module, "build_macro_payload", None)
    if builder is None:
        raise RuntimeError("api_server.build_macro_payload not found")
    return builder


def derive_status_reason(payload):
    data_quality = payload.get("dataQuality", {})
    reason = data_quality.get("reason")
    if reason:
        return reason

    missing_modules = data_quality.get("missingModules", []) or []
    module_input_gaps = data_quality.get("moduleInputGaps", {}) or {}
    warnings = data_quality.get("warnings", []) or []
    fetch_meta = data_quality.get("fetchMeta", {}) or {}

    parts = []
    if missing_modules:
        parts.append(f"missing_modules={','.join(str(item) for item in missing_modules[:6])}")
    if module_input_gaps:
        gap_parts = []
        for module, columns in list(module_input_gaps.items())[:4]:
            if not columns:
                continue
            gap_parts.append(f"{module}[{','.join(str(col) for col in columns[:4])}]")
        if gap_parts:
            parts.append(f"module_input_gaps={'; '.join(gap_parts)}")
    if warnings:
        parts.append(f"warnings={' | '.join(str(item) for item in warnings[:2])}")

    fred_failed_series = fetch_meta.get("fred_failed_series", []) or []
    if fred_failed_series:
        parts.append(f"fred_failed_series={','.join(str(item) for item in fred_failed_series[:4])}")

    yahoo_columns = fetch_meta.get("yahoo_columns", []) or []
    if not yahoo_columns:
        parts.append("yahoo_columns=none")

    return "; ".join(parts) if parts else None


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
        build_macro_payload = load_build_macro_payload()
    except Exception as exc:
        status = {
            "result": "error",
            "outputPath": str(output_path),
            "mode": None,
            "readyModules": 0,
            "reason": f"as_of_days_ago={as_of_days_ago}" if as_of_days_ago else None,
            "message": f"Failed to import payload builder: {exc}",
        }
        write_status(status_path, status)
        print(status["message"], file=sys.stderr)
        return 1

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
    data_quality = payload.get("dataQuality", {})
    status = {
        "result": "updated",
        "outputPath": str(output_path),
        "mode": data_quality.get("mode"),
        "readyModules": ready_count,
        "reason": derive_status_reason(payload),
        "message": "",
        "missingModules": data_quality.get("missingModules", []),
        "moduleInputGaps": data_quality.get("moduleInputGaps", {}),
        "warningCount": len(data_quality.get("warnings", []) or []),
        "warnings": data_quality.get("warnings", []),
        "fetchSummary": {
            "fred_success_count": (data_quality.get("fetchMeta", {}) or {}).get("fred_success_count"),
            "fred_failed_series": (data_quality.get("fetchMeta", {}) or {}).get("fred_failed_series", []),
            "fred_failure_details": (data_quality.get("fetchMeta", {}) or {}).get("fred_failure_details", []),
            "yahoo_columns": (data_quality.get("fetchMeta", {}) or {}).get("yahoo_columns", []),
            "fred_csv_skip_reason": (data_quality.get("fetchMeta", {}) or {}).get("fred_csv_skip_reason"),
        },
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
