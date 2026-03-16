#!/usr/bin/env python3
"""Refresh the local MSTR treasury override used by the five-asset strategy."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from strategies.five_asset_macro_cta.src.data import (
    MSTR_TREASURY_OVERRIDE_PATH,
    _normalize_treasury_schedule,
    refresh_mstr_treasury_override_from_url,
    write_mstr_treasury_override,
)


def _load_input_file(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        frame = pd.read_csv(path)
        return _normalize_treasury_schedule(frame.to_dict(orient="records"))
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("schedule"), list):
        return _normalize_treasury_schedule(payload["schedule"])
    if isinstance(payload, list):
        return _normalize_treasury_schedule(payload)
    raise RuntimeError("input file must be a JSON schedule array/object or CSV table")


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh the local MSTR treasury override.")
    parser.add_argument("--url", default=None, help="Remote JSON URL for the treasury schedule")
    parser.add_argument("--input-file", default=None, help="Local JSON/CSV file to import into the override")
    parser.add_argument(
        "--output",
        default=str(MSTR_TREASURY_OVERRIDE_PATH),
        help="Path to write the normalized override JSON",
    )
    args = parser.parse_args()

    output_path = Path(args.output).resolve()
    if args.url:
        payload = refresh_mstr_treasury_override_from_url(args.url, path=output_path)
    elif args.input_file:
        schedule = _load_input_file(Path(args.input_file).resolve())
        if schedule.empty:
            raise RuntimeError("input treasury schedule is empty")
        payload = write_mstr_treasury_override(
            schedule,
            source="manual_import",
            label=str(Path(args.input_file).resolve()),
            path=output_path,
        )
    else:
        raise RuntimeError("either --url or --input-file is required")

    print(f"MSTR treasury override written to: {output_path}")
    print(
        f"source: {payload.get('source')} | label: {payload.get('label')} | "
        f"rows: {payload.get('rowCount')} | fetchedAt: {payload.get('fetchedAt')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
