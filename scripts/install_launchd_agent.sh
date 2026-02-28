#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_PATH="$ROOT_DIR/deploy/launchd/com.macroquant.generate-static-json.plist.template"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PATH="$TARGET_DIR/com.macroquant.generate-static-json.plist"
SAFE_BASE="$HOME/.macroquant"
SAFE_ROOT="$SAFE_BASE/current"
SAFE_RUNNER="$SAFE_BASE/run_market_open_generate.sh"
LOG_DIR="$SAFE_BASE/logs"

mkdir -p "$TARGET_DIR" "$LOG_DIR"
ln -sfn "$ROOT_DIR" "$SAFE_ROOT"

cat > "$SAFE_RUNNER" <<EOF
#!/bin/zsh
set -euo pipefail

SAFE_ROOT="$SAFE_ROOT"
CACHE_DIR="\$SAFE_ROOT/.cache"
STATE_FILE="\$CACHE_DIR/last_market_open_run_et.txt"
FORCE_MODE="\${1:-}"
PYTHON_BIN="\${PYTHON_BIN:-python3}"

ET_DATE="\$(TZ=America/New_York date +%F)"
ET_TIME="\$(TZ=America/New_York date +%H:%M)"
ET_WEEKDAY="\$(TZ=America/New_York date +%u)"

if [[ "\$FORCE_MODE" != "--force" ]]; then
  if [[ "\$ET_WEEKDAY" -gt 5 ]]; then
    exit 0
  fi

  if [[ "\$ET_TIME" != "09:30" ]]; then
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

echo "Generated macro-data.json for US market open at \$ET_DATE \$ET_TIME ET"
EOF

chmod +x "$SAFE_RUNNER"

if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo "Missing template: $TEMPLATE_PATH" >&2
  exit 1
fi

sed \
  -e "s|__SAFE_ROOT__|$SAFE_ROOT|g" \
  -e "s|__SAFE_RUNNER__|$SAFE_RUNNER|g" \
  -e "s|__SAFE_LOG_DIR__|$LOG_DIR|g" \
  "$TEMPLATE_PATH" > "$TARGET_PATH"

launchctl bootout "gui/$(id -u)" "$TARGET_PATH" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET_PATH"
launchctl enable "gui/$(id -u)/com.macroquant.generate-static-json"

echo "Installed launchd agent at $TARGET_PATH"
echo "Safe launch root symlink: $SAFE_ROOT"
echo "Safe runner script: $SAFE_RUNNER"
echo "It checks every minute and only generates once at 09:30 America/New_York on weekdays."
