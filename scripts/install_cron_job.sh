#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SAFE_BASE="$HOME/.macroquant"
SAFE_ROOT="$SAFE_BASE/current"
SAFE_RUNNER="$SAFE_BASE/run_market_daily_generate.sh"
LOG_DIR="$SAFE_BASE/logs"
mkdir -p "$LOG_DIR"
ln -sfn "$ROOT_DIR" "$SAFE_ROOT"

cat > "$SAFE_RUNNER" <<EOF
#!/bin/zsh
set -euo pipefail

SAFE_ROOT="$SAFE_ROOT"
CACHE_DIR="\$SAFE_ROOT/.cache"
STATE_FILE="\$CACHE_DIR/last_market_daily_run_et.txt"
PUBLISH_ET="\${MARKET_DAILY_PUBLISH_ET:-17:00}"
FORCE_MODE="\${1:-}"
PYTHON_BIN="\${PYTHON_BIN:-python3}"

ET_DATE="\$(TZ=America/New_York date +%F)"
ET_TIME="\$(TZ=America/New_York date +%H:%M)"
ET_WEEKDAY="\$(TZ=America/New_York date +%u)"

if [[ "\$FORCE_MODE" != "--force" ]]; then
  if [[ "\$ET_WEEKDAY" -gt 5 ]]; then
    exit 0
  fi

  if [[ "\$ET_TIME" != "\$PUBLISH_ET" ]]; then
    exit 0
  fi

  if [[ -f "\$STATE_FILE" ]] && [[ "\$(cat "\$STATE_FILE")" == "\$ET_DATE" ]]; then
    exit 0
  fi
fi

mkdir -p "\$CACHE_DIR"
cd "\$SAFE_ROOT"
"\$PYTHON_BIN" "\$SAFE_ROOT/generate_static_macro_json.py"
print -r -- "\$ET_DATE" > "\$STATE_FILE"

echo "Generated macro-data.json for market daily publish window at \$ET_DATE \$ET_TIME ET"
EOF

chmod +x "$SAFE_RUNNER"

CRON_MARKER="macroquant scheduled_generate_static"
CRON_ENTRY="* * * * 1-5 \"$SAFE_RUNNER\" >> \"$LOG_DIR/cron-static-generate.log\" 2>&1 # $CRON_MARKER"

EXISTING_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "$EXISTING_CRONTAB" | grep -v "$CRON_MARKER" || true)"

{
  printf '%s\n' "$FILTERED_CRONTAB"
  printf '%s\n' "$CRON_ENTRY"
} | sed '/^[[:space:]]*$/N;/^\n$/D' | crontab -

echo "Installed cron job:"
echo "$CRON_ENTRY"
echo "It checks every minute and only generates once at \${MARKET_DAILY_PUBLISH_ET:-17:00} America/New_York on weekdays."
