#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
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

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


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
        "requestedModel": str(preview.get("requestedModel", model)),
        "usedModelFallback": bool(preview.get("usedModelFallback", False)),
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
    snapshots = daily.get("marketSnapshots", []) if isinstance(daily.get("marketSnapshots"), list) else []
    deep_dives = daily.get("deepStockDives", []) if isinstance(daily.get("deepStockDives"), list) else []
    crypto_updates = daily.get("cryptoProjectUpdates", []) if isinstance(daily.get("cryptoProjectUpdates"), list) else []
    calendar = daily.get("marketCalendar", []) if isinstance(daily.get("marketCalendar"), list) else []
    desk_views = daily.get("deskViews", []) if isinstance(daily.get("deskViews"), list) else []
    ai = daily.get("aiDecision", {}) if isinstance(daily.get("aiDecision"), dict) else {}
    if not ai and isinstance(daily.get("claudeDecision"), dict):
        ai = daily.get("claudeDecision", {})

    crypto_snapshots = [row for row in snapshots if str(row.get("bucket", "")) == "crypto"]
    commod_fx_snapshots = [row for row in snapshots if str(row.get("bucket", "")) in {"commodity", "fx", "rate"}]
    equity_snapshots = [row for row in snapshots if str(row.get("bucket", "")) in {"equity_index", "equity"}]
    sector_snapshots = [row for row in snapshots if str(row.get("bucket", "")) == "equity_sector"]

    def _group_news(rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        groups: Dict[str, List[Dict[str, Any]]] = {
            "macro_policy": [],
            "commodities": [],
            "geopolitics": [],
            "equity": [],
            "crypto": [],
            "general": [],
        }
        for item in rows:
            if not isinstance(item, dict):
                continue
            bucket = str(item.get("bucket", "general") or "general")
            groups.setdefault(bucket, []).append(item)
        return groups

    news_groups = _group_news(news)
    macro_news = news_groups["macro_policy"][:2]
    commodity_news = news_groups["commodities"][:2]
    policy_news = (news_groups["geopolitics"] + news_groups["general"])[:2]

    lines: List[str] = []
    lines.append(f"# 市场研究日报（{as_of}）")
    lines.append("")
    lines.append(f"**Headline**: {headline}")
    lines.append("")
    lines.append("## 一、热点要闻")
    lines.append("### 美联储动态")
    if macro_news:
        for item in macro_news:
            title = item.get("title", "-")
            source = item.get("source", "-")
            lines.append(f"**{title}**")
            lines.append(f"事件概述：来自 {source} 的最新线索。")
            lines.append("要点：当前为模板稿，建议接入 AI 正式生成以获得更完整的背景与市场影响。")
            lines.append(f"市场影响：结合宏观总分 {quick.get('overallScore', '-')} 与新闻上下文谨慎解读。")
            lines.append("")
    else:
        lines.append("数据不足：暂无美联储动态新闻。")
    lines.append("")
    lines.append("### 国际大宗商品")
    if commodity_news:
        for item in commodity_news:
            lines.append(f"**{item.get('title', '-')}**")
            lines.append(f"事件概述：来自 {item.get('source', '-')} 的大宗商品/地缘事件线索。")
            lines.append("要点：请以正式 AI 稿为准，这里仅保留模板结构。")
            lines.append("市场影响：通常会先影响能源、美元与风险偏好。")
            lines.append("")
    else:
        lines.append("数据不足：暂无国际大宗商品相关新闻。")
    lines.append("")
    lines.append("### 宏观经济政策")
    if policy_news:
        for item in policy_news:
            lines.append(f"**{item.get('title', '-')}**")
            lines.append(f"事件概述：来自 {item.get('source', '-')} 的政策事件线索。")
            lines.append("要点：关注政策路径、通胀传导和风险资产定价。")
            lines.append("市场影响：对股债汇和加密均可能形成二阶影响。")
            lines.append("")
    else:
        lines.append("数据不足：暂无宏观经济政策相关新闻。")
    lines.append("")
    lines.append("## 二、市场复盘")
    lines.append("### 大宗商品&外汇表现")
    if commod_fx_snapshots:
        for row in commod_fx_snapshots[:6]:
            lines.append(
                f"- {row.get('ticker', '-')}: 现价 {row.get('spot', '-') }，24H {row.get('change24hPct', '-') }%，7D {row.get('change7dPct', '-') }%，14D 年化波动 {row.get('realizedVol14dPct', '-') }%。"
            )
    else:
        lines.append("数据不足：当前输入未提供黄金/白银/WTI/Brent/DXY/VIX/10Y 全量实时报价。")
    lines.append("")
    lines.append("### 加密货币表现")
    if crypto_snapshots:
        for row in crypto_snapshots[:3]:
            lines.append(
                f"- {row.get('ticker', '-')}: 24H {row.get('change24hPct', '-') }%，7D {row.get('change7dPct', '-') }%，现价 {row.get('spot', '-') }。"
            )
    else:
        lines.append("数据不足：暂无加密货币快照。")
    lines.append("")
    lines.append("### 美股指数表现")
    if equity_snapshots:
        for row in equity_snapshots[:6]:
            lines.append(
                f"- {row.get('ticker', '-')}: 24H {row.get('change24hPct', '-') }%，7D {row.get('change7dPct', '-') }%，现价 {row.get('spot', '-') }。"
            )
    else:
        lines.append("数据不足：暂无美股指数快照。")
    lines.append("")
    lines.append("### 科技巨头动态")
    if deep_dives:
        for item in deep_dives[:5]:
            lines.append(
                f"- {item.get('name', '-')} ({item.get('ticker', '-')}): 1D {item.get('change1dPct', '-') }%，7D {item.get('change7dPct', '-') }%，20D {item.get('ret20dPct', '-') }%，信号 {item.get('signal', '-') }。"
            )
    else:
        lines.append("数据不足：请优先使用 AI 正式稿补全个股新闻与财报动态。")
    lines.append("")
    lines.append("### 板块异动观察")
    if sector_snapshots:
        for row in sector_snapshots[:5]:
            lines.append(
                f"- {row.get('ticker', '-')}: 24H {row.get('change24hPct', '-') }%，7D {row.get('change7dPct', '-') }%，现价 {row.get('spot', '-') }。"
            )
    elif replay:
        for item in replay[:4]:
            lines.append(f"- {item}")
    else:
        lines.append("数据不足：暂无板块复盘线索。")
    lines.append("")
    lines.append("## 三、深度个股解读")
    if deep_dives:
        for item in deep_dives[:3]:
            lines.append(f"### {item.get('name', '-')} - {item.get('signal', '-')}")
            lines.append(f"事件概述：{item.get('summary', '-')}")
            lines.append("市场解读：当前为模板稿，建议使用 AI 正式生成版补全催化与估值逻辑。")
            lines.append("投资启示：结合趋势与风险预算，不宜单凭模板稿做交易决策。")
            lines.append("")
    else:
        lines.append("数据不足：暂无深度个股输入。")
        lines.append("")
    lines.append("## 四、加密货币项目动态")
    if crypto_updates:
        for item in crypto_updates[:8]:
            lines.append(f"- {item.get('project', '-')}: {item.get('headline', '-')}")
    else:
        lines.append("数据不足：暂无加密项目动态。")
    lines.append("")
    lines.append("## 五、今日市场日历")
    lines.append("### 数据发布时刻表")
    if calendar:
        for event in calendar[:6]:
            lines.append(
                f"- {event.get('date', '-') } {event.get('timeEt', '--:--') } ET "
                f"({event.get('timeUtc', '-') } UTC) | {event.get('country', event.get('category', '-')) } | "
                f"{event.get('event', '-') } | {event.get('importance', '-') }"
            )
    else:
        lines.append("数据不足：暂无市场日历。")
    lines.append("")
    lines.append("### 重要事件预告")
    lines.append(f"- 风险等级：{quick.get('riskLevel', '-')}")
    lines.append(f"- AI 结论：{ai.get('summary', '-')}")
    lines.append("")
    lines.append("### 机构观点")
    if desk_views:
        for item in desk_views[:4]:
            lines.append(f"- {item}")
    else:
        actions = ai.get("recommendedActions", [])
        if isinstance(actions, list) and actions:
            for action in actions[:3]:
                lines.append(f"- {action}")
        else:
            lines.append("- 数据不足：暂无市场观察。")
    lines.append("")
    lines.append("## 免责声明")
    lines.append("以上内容由 AI 搜索与研究整理，不构成任何投资建议。")
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
