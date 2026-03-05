#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_DIR="$ROOT_DIR/.cache"
STATE_FILE="$CACHE_DIR/last_market_daily_run_et.txt"
PUBLISH_ET="${MARKET_DAILY_PUBLISH_ET:-17:00}"

FORCE_MODE="${1:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

ET_DATE="$(TZ=America/New_York date +%F)"
ET_TIME="$(TZ=America/New_York date +%H:%M)"
ET_WEEKDAY="$(TZ=America/New_York date +%u)"

if [[ "$FORCE_MODE" != "--force" ]]; then
  if [[ "$ET_WEEKDAY" -gt 5 ]]; then
    exit 0
  fi

  if [[ "$ET_TIME" != "$PUBLISH_ET" ]]; then
    exit 0
  fi

  if [[ -f "$STATE_FILE" ]] && [[ "$(cat "$STATE_FILE")" == "$ET_DATE" ]]; then
    exit 0
  fi
fi

mkdir -p "$CACHE_DIR"

cd "$ROOT_DIR"
"$PYTHON_BIN" generate_static_macro_json.py
print -r -- "$ET_DATE" > "$STATE_FILE"

echo "Generated macro-data.json for market daily publish window at $ET_DATE $ET_TIME ET"
