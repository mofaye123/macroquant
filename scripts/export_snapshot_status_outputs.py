#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def one_line(value):
    if value is None:
        return ""
    return str(value).replace("\r", " ").replace("\n", " ")


def json_line(value):
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


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
        f"missing_modules={one_line(','.join(str(item) for item in status.get('missingModules', []) or []))}",
        f"module_input_gaps={one_line(json_line(status.get('moduleInputGaps', {})))}",
        f"warning_count={one_line(status.get('warningCount', 0))}",
        f"warnings={one_line(json_line(status.get('warnings', [])))}",
        f"fetch_summary={one_line(json_line(status.get('fetchSummary', {})))}",
    ]
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
