#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    return value


def _render_markdown(daily: Dict[str, Any]) -> str:
    as_of = daily.get("asOfDate", "-")
    headline = daily.get("headline", "-")
    quick = daily.get("quickView", {}) if isinstance(daily.get("quickView"), dict) else {}
    news = daily.get("hotNews", []) if isinstance(daily.get("hotNews"), list) else []
    replay = daily.get("marketReplay", []) if isinstance(daily.get("marketReplay"), list) else []
    ai = daily.get("aiDecision", {}) if isinstance(daily.get("aiDecision"), dict) else {}
    if not ai and isinstance(daily.get("claudeDecision"), dict):
        ai = daily.get("claudeDecision", {})

    lines: List[str] = []
    lines.append(f"# MacroQuant 市场研究日报（{as_of}）")
    lines.append("")
    lines.append(f"**Headline**: {headline}")
    lines.append("")
    lines.append("## 快速视图")
    lines.append(f"- 宏观总分: {quick.get('overallScore', '-')}")
    lines.append(f"- 风险等级: {quick.get('riskLevel', '-')}")
    lines.append(f"- 行情源: {quick.get('quoteSourceMode', '-')}")
    lines.append(f"- 新闻源: {quick.get('newsSourceMode', '-')}")
    lines.append("")
    lines.append("## 热点要闻")
    if news:
        for item in news[:8]:
            title = item.get("title", "-")
            source = item.get("source", "-")
            url = item.get("url", "")
            if url:
                lines.append(f"- [{title}]({url}) ({source})")
            else:
                lines.append(f"- {title} ({source})")
    else:
        lines.append("- 无可用新闻数据")
    lines.append("")
    lines.append("## 市场复盘")
    if replay:
        for item in replay[:6]:
            lines.append(f"- {item}")
    else:
        lines.append("- 无复盘内容")
    lines.append("")
    lines.append("## AI 决策摘要")
    lines.append(f"- 提供方: {ai.get('provider', '-')}")
    lines.append(f"- 状态: {ai.get('status', '-')}")
    lines.append(f"- 模型: {ai.get('model', '-')}")
    lines.append(f"- 结论: {ai.get('summary', '-')}")
    actions = ai.get("recommendedActions", [])
    if isinstance(actions, list) and actions:
        lines.append("- 建议动作:")
        for action in actions[:4]:
            lines.append(f"  - {action}")
    else:
        lines.append("- 建议动作: -")
    lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate market daily report digest markdown/json.")
    parser.add_argument("--input", default="web/public/data/macro-data.json")
    parser.add_argument("--json-output", default=".cache/daily-report/market-daily.json")
    parser.add_argument("--md-output", default=".cache/daily-report/market-daily.md")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        raise RuntimeError(f"Input payload not found: {input_path}")

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    daily = payload.get("marketDaily", {})
    if not isinstance(daily, dict) or not daily:
        raise RuntimeError("marketDaily payload is missing or empty.")
    if not isinstance(daily.get("quickView"), dict):
        raise RuntimeError("marketDaily.quickView is missing; input snapshot is not ready for daily report.")

    json_output = Path(args.json_output).expanduser().resolve()
    md_output = Path(args.md_output).expanduser().resolve()
    json_output.parent.mkdir(parents=True, exist_ok=True)
    md_output.parent.mkdir(parents=True, exist_ok=True)

    json_output.write_text(json.dumps(_json_safe(daily), ensure_ascii=False, indent=2), encoding="utf-8")
    md_output.write_text(_render_markdown(daily), encoding="utf-8")
    print(f"Wrote daily report JSON: {json_output}")
    print(f"Wrote daily report Markdown: {md_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
