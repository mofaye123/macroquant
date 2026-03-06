#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REQUIRED_AI_HEADINGS = (
    "## 一、热点要闻",
    "## 二、市场复盘",
    "## 三、深度个股解读",
    "## 四、加密货币项目动态",
    "## 五、今日市场日历",
    "## 免责声明",
)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    return value


def _is_ai_markdown_qualified(markdown: str, min_chars: int) -> Tuple[bool, str]:
    text = (markdown or "").strip()
    if len(text) < min_chars:
        return False, f"char_count<{min_chars}"
    for heading in REQUIRED_AI_HEADINGS:
        if heading not in text:
            return False, f"missing_heading:{heading}"
    return True, "ok"


def _try_render_ai_markdown(
    daily: Dict[str, Any],
    *,
    min_chars: int,
    max_output_tokens: int,
    continuation_rounds: int,
) -> Tuple[Optional[str], Dict[str, Any]]:
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        return None, {"enabled": False, "reason": "GEMINI_API_KEY missing"}

    try:
        from api_server import _call_gemini_daily_preview  # type: ignore
    except Exception as exc:
        return None, {"enabled": True, "reason": f"import_error:{exc}"}

    model = (os.getenv("MARKET_DAILY_AI_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-2.5-pro").strip()
    reasoning_mode = (os.getenv("MARKET_DAILY_AI_REASONING_MODE") or "deep_think").strip()

    preview = _call_gemini_daily_preview(
        daily_payload=daily,
        gemini_api_key=key,
        gemini_model=model,
        reasoning_mode=reasoning_mode,
        min_chars_target=min_chars,
        max_output_tokens=max_output_tokens,
        continuation_rounds=continuation_rounds,
    )
    text = str(preview.get("previewText", "") or "").strip()
    status = str(preview.get("status", "degraded"))
    used_fallback = bool(preview.get("usedFallback", True))
    qualified, reason = _is_ai_markdown_qualified(text, min_chars=min_chars)
    meta = {
        "enabled": True,
        "status": status,
        "usedFallback": used_fallback,
        "charCount": int(preview.get("charCount", len(text)) or len(text)),
        "minCharTarget": int(preview.get("minCharTarget", min_chars) or min_chars),
        "finishReason": str(preview.get("finishReason", "")),
        "detail": str(preview.get("detail", "")),
        "model": str(preview.get("model", model)),
        "reasoningMode": str(preview.get("reasoningMode", reasoning_mode)),
        "qualified": qualified,
        "qualifiedReason": reason,
    }

    if status == "ok" and not used_fallback and qualified and text:
        return text, meta
    return None, meta


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


def _build_publish_payload(daily: Dict[str, Any], markdown: str, markdown_source: str, ai_meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    report_generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "reportStatus": "generated",
        "reportGeneratedAt": report_generated_at,
        "asOfDate": daily.get("asOfDate"),
        "headline": daily.get("headline"),
        "markdownSource": markdown_source,
        "markdownCharCount": len(markdown or ""),
        "aiRender": _json_safe(ai_meta or {}),
        "markdown": markdown,
        "daily": _json_safe(daily),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate market daily report digest markdown/json.")
    parser.add_argument("--input", default="web/public/data/macro-data.json")
    parser.add_argument("--json-output", default=".cache/daily-report/market-daily.json")
    parser.add_argument("--md-output", default=".cache/daily-report/market-daily.md")
    parser.add_argument("--publish-output", default="")
    parser.add_argument("--prefer-ai-markdown", action="store_true", help="Prefer Gemini long-form markdown when GEMINI_API_KEY is configured.")
    parser.add_argument("--min-chars", type=int, default=1500, help="Minimum markdown chars for AI output qualification.")
    parser.add_argument("--max-output-tokens", type=int, default=12288, help="Gemini max output tokens when generating AI markdown.")
    parser.add_argument("--continuation-rounds", type=int, default=10, help="Continuation rounds for Gemini long output.")
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

    min_chars = max(800, min(6000, int(args.min_chars)))
    max_tokens = max(1024, min(12288, int(args.max_output_tokens)))
    continuation_rounds = max(0, min(12, int(args.continuation_rounds)))

    rendered_markdown = ""
    markdown_source = "template"
    ai_meta: Optional[Dict[str, Any]] = None

    if args.prefer_ai_markdown:
        ai_text, ai_meta = _try_render_ai_markdown(
            daily,
            min_chars=min_chars,
            max_output_tokens=max_tokens,
            continuation_rounds=continuation_rounds,
        )
        if ai_text:
            rendered_markdown = ai_text.rstrip() + "\n"
            markdown_source = "gemini"
            ai_decision = daily.get("aiDecision")
            if not isinstance(ai_decision, dict):
                ai_decision = {}
            ai_decision["status"] = "generated"
            if ai_meta and ai_meta.get("model"):
                ai_decision["model"] = ai_meta.get("model")
            if ai_meta and ai_meta.get("reasoningMode"):
                ai_decision["reasoningMode"] = ai_meta.get("reasoningMode")
            daily["aiDecision"] = ai_decision
            daily["claudeDecision"] = dict(ai_decision)

    if not rendered_markdown:
        rendered_markdown = _render_markdown(daily)

    json_output.write_text(json.dumps(_json_safe(daily), ensure_ascii=False, indent=2), encoding="utf-8")
    md_output.write_text(rendered_markdown, encoding="utf-8")

    publish_output_raw = (args.publish_output or "").strip()
    if publish_output_raw:
        publish_output = Path(publish_output_raw).expanduser().resolve()
        publish_output.parent.mkdir(parents=True, exist_ok=True)
        publish_payload = _build_publish_payload(daily, rendered_markdown, markdown_source, ai_meta)
        publish_output.write_text(json.dumps(publish_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote publish cache JSON: {publish_output}")

    print(f"Wrote daily report JSON: {json_output}")
    print(f"Wrote daily report Markdown: {md_output}")
    print(f"Markdown source: {markdown_source}")
    if ai_meta is not None:
        print(f"AI render meta: {json.dumps(_json_safe(ai_meta), ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
