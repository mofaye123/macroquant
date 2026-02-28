#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
FORCE_MODE="${1:-}"
STATUS_FILE="${STATUS_FILE:-$ROOT_DIR/.cache/ci_snapshot_status.json}"

cd "$ROOT_DIR"
"$PYTHON_BIN" generate_static_macro_json.py --status-file "$STATUS_FILE"

if [[ "$FORCE_MODE" == "--force" ]]; then
  echo "Forced snapshot refresh completed."
else
  echo "Scheduled snapshot refresh completed."
fi
