#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def one_line(value):
    if value is None:
        return ""
    return str(value).replace("\r", " ").replace("\n", " ")


def main():
    if len(sys.argv) != 3:
        print("Usage: export_snapshot_status_outputs.py <status_json> <output_file>", file=sys.stderr)
        return 1

    status_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    status = json.loads(status_path.read_text(encoding="utf-8"))

    lines = [
        f"result={one_line(status.get('result', 'error'))}",
        f"message={one_line(status.get('message', ''))}",
        f"mode={one_line(status.get('mode', ''))}",
        f"ready_modules={one_line(status.get('readyModules', 0))}",
        f"reason={one_line(status.get('reason', ''))}",
    ]
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
