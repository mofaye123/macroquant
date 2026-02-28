#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"
NPM_BIN="${NPM_BIN:-npm}"

if [[ ! -f "$ROOT_DIR/generate_static_macro_json.py" ]]; then
  echo "Missing generator script: $ROOT_DIR/generate_static_macro_json.py" >&2
  exit 1
fi

if [[ ! -f "$WEB_DIR/package.json" ]]; then
  echo "Missing web package.json: $WEB_DIR/package.json" >&2
  exit 1
fi

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  echo "Missing $WEB_DIR/node_modules. Run: cd $WEB_DIR && npm install" >&2
  exit 1
fi

cd "$WEB_DIR"
"$NPM_BIN" run cf:deploy:fresh
