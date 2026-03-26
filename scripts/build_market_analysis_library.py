#!/usr/bin/env python3
"""
Build a static market-analysis document library JSON for the Next.js pages.

This script extracts structured text from three DOCX files and merges local USeco files
into the same payload so the frontend can render preview cards + full content.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
ROOT = Path(__file__).resolve().parents[1]


def extract_docx_body_items(path: Path) -> list[dict[str, object]]:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)
    body = root.find(".//w:body", NS)
    if body is None:
        return []

    items: list[dict[str, object]] = []

    for child in body:
        if child.tag == f'{{{NS["w"]}}}p':
            text = "".join(node.text or "" for node in child.findall(".//w:t", NS)).strip()
            text = re.sub(r"\s+", " ", text)
            if not text:
                continue
            p_style = None
            p_pr = child.find("w:pPr", NS)
            if p_pr is not None:
                p_style_node = p_pr.find("w:pStyle", NS)
                if p_style_node is not None:
                    p_style = p_style_node.attrib.get(f'{{{NS["w"]}}}val')
            items.append({"type": "paragraph", "style": p_style, "text": text})
            continue

        if child.tag == f'{{{NS["w"]}}}tbl':
            rows: list[list[str]] = []
            for tr in child.findall("./w:tr", NS):
                row: list[str] = []
                for tc in tr.findall("./w:tc", NS):
                    cell_lines: list[str] = []
                    for paragraph in tc.findall("./w:p", NS):
                        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
                        text = re.sub(r"\s+", " ", text)
                        if text:
                            cell_lines.append(text)
                    row.append(" ".join(cell_lines).strip())
                rows.append(row)

            if rows and any(any(cell for cell in row) for row in rows):
                max_cols = max((len(row) for row in rows), default=0)
                if max_cols <= 1:
                    for row in rows:
                        text = " ".join(cell for cell in row if cell).strip()
                        if text:
                            items.append({"type": "paragraph", "style": None, "text": text})
                    continue
                items.append({"type": "table", "rows": rows})

    dedup: list[dict[str, object]] = []
    last_paragraph_text: str | None = None
    for item in items:
        if item.get("type") == "paragraph":
            text = str(item.get("text", ""))
            if text == last_paragraph_text:
                continue
            last_paragraph_text = text
        dedup.append(item)

    return dedup


def extract_docx_lines(path: Path) -> list[str]:
    return [text for _, text in extract_docx_paragraphs(path)]


def extract_docx_paragraphs(path: Path) -> list[tuple[str | None, str]]:
    paragraphs: list[tuple[str | None, str]] = []
    for item in extract_docx_body_items(path):
        if item.get("type") != "paragraph":
            continue
        paragraphs.append((item.get("style") if isinstance(item.get("style"), str) else None, str(item.get("text", ""))))
    return paragraphs


def is_preview_candidate(line: str) -> bool:
    if len(line) < 20:
        return False
    if line in {"目录", "目 录", "执行摘要"}:
        return False
    if re.match(r"^(?:[一二三四五六七八九十百]+、|[0-9]+(?:\.[0-9]+)*\.?)\s*", line):
        return False
    if re.fullmatch(r"\d{4}(?:[.\-/年])\d{1,2}(?:[.\-/月]\d{1,2}(?:日)?)?", line):
        return False
    if re.fullmatch(r"[A-Z0-9 &\-/()（）·]+", line):
        return False
    if re.fullmatch(r"[0-9.\-（）()\s]+", line):
        return False
    return bool(re.search(r"[\u4e00-\u9fff]", line) and re.search(r"[。！？：；,，]", line))


def pick_preview(lines: list[str]) -> str:
    for line in lines:
        if is_preview_candidate(line):
            return line[:180]
    for line in lines:
        if len(line) >= 28 and re.search(r"[\u4e00-\u9fff]", line) and not re.fullmatch(r"[A-Z0-9 &\-/()（）·]+", line):
            return line[:180]
    return lines[0][:180] if lines else ""


def clean_toc_label(line: str) -> str:
    label = re.sub(r"\d+$", "", line).strip()
    label = re.sub(r"\s+", " ", label)
    return label


def normalize_heading_key(line: str) -> str:
    key = clean_toc_label(line)
    key = re.sub(r"^(?:[一二三四五六七八九十百]+、|[0-9]+(?:\.[0-9]+)*\.?)\s*", "", key)
    key = re.sub(r"[：:]\s*$", "", key)
    key = re.sub(r"\s+", "", key)
    return key


def build_toc(paragraphs: list[tuple[str | None, str]]) -> list[str]:
    toc: list[str] = []
    for style, line in paragraphs:
        cleaned = clean_toc_label(line)
        if cleaned in {"目录", "目 录", "执行摘要", "总结", "结论", "报告日期", "研究周期", "报告性质", "核心观点"}:
            continue
        if re.fullmatch(r"\d{4}(?:[.\-/年])\d{1,2}(?:[.\-/月]\d{1,2}(?:日)?)?", cleaned):
            continue
        if re.fullmatch(r"\d{4}\.\d{2}(?:\.\d{2})?\.?$", cleaned):
            continue
        if re.match(r"^\d{4}年\d{1,2}月.*$", cleaned):
            continue
        if "研报" in cleaned and not re.match(r"^(?:[一二三四五六七八九十]+、|[0-9]+(?:\.[0-9]+)*\.?)", cleaned):
            continue
        numbered = bool(re.match(r"^(?:[一二三四五六七八九十]+、|[0-9]+(?:\.[0-9]+)*\.?)", cleaned))
        if style is None and not numbered:
            continue
        if len(cleaned) > 48:
            continue
        if cleaned not in toc:
            toc.append(cleaned)
    return toc[:14]


def build_content_lines(paragraphs: list[tuple[str | None, str]]) -> list[str]:
    lines: list[str] = []
    inside_toc = False
    for style, line in paragraphs:
        cleaned = line.strip()
        if not cleaned:
            continue
        if cleaned in {"目录", "目 录"}:
            inside_toc = True
            continue
        if inside_toc and style is None:
            continue
        if inside_toc and style is not None:
            inside_toc = False
        lines.append(cleaned)
    return lines


def escape_table_cell(text: str) -> str:
    return text.replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ").strip()


def serialize_table(rows: list[list[str]]) -> str:
    cleaned_rows = [[escape_table_cell(cell or "—") for cell in row] for row in rows if any((cell or "").strip() for cell in row)]
    if not cleaned_rows:
        return ""

    width = max(len(row) for row in cleaned_rows)

    def pad(row: list[str]) -> list[str]:
        return row + ["—"] * (width - len(row))

    padded_rows = [pad(row) for row in cleaned_rows]
    header = padded_rows[0]
    separator = ["---"] * width

    def render_row(row: list[str]) -> str:
        return "| " + " | ".join(row) + " |"

    return "\n".join([render_row(header), render_row(separator), *[render_row(row) for row in padded_rows[1:]]])


def build_content_blocks(items: list[dict[str, object]]) -> list[str]:
    blocks: list[str] = []
    inside_toc = False

    for item in items:
        item_type = item.get("type")
        if item_type == "paragraph":
            style = item.get("style") if isinstance(item.get("style"), str) else None
            line = str(item.get("text", "")).strip()
            if not line:
                continue
            if line in {"目录", "目 录"}:
                inside_toc = True
                continue
            if inside_toc and style is None:
                continue
            if inside_toc and style is not None:
                inside_toc = False
            blocks.append(line)
            continue

        if item_type == "table":
            if inside_toc:
                continue
            rows = item.get("rows")
            if isinstance(rows, list):
                table_text = serialize_table(rows)  # type: ignore[arg-type]
                if table_text:
                    blocks.append(table_text)

    return blocks


def build_payload(
    macro_doc_c: Path,
    macro_doc_a: Path,
    macro_doc_b: Path,
    useco_script: Path,
    useco_requirements: Path,
) -> dict:
    def safe_source_label(path: Path) -> str:
        name = path.name
        if name == "us_economics.py":
            return "USeco/us_economics.py"
        if name == "requirements.txt":
            return "USeco/requirements.txt"
        return name

    macro_inputs = [
        {
            "id": "macro-quant-2026-03",
            "title": "宏观量化研报（2026.03 月中）",
            "date": "2026-03-13",
            "tags": ["宏观量化", "流动性", "利率", "信用", "情景推演"],
            "path": macro_doc_c,
        },
        {
            "id": "macro-quant-2026-02",
            "title": "宏观量化研报（2026.02 月中）",
            "date": "2026-02-13",
            "tags": ["宏观量化", "流动性", "利率", "信用", "情景推演"],
            "path": macro_doc_a,
        },
        {
            "id": "market-depth-2026-01",
            "title": "市场深度研报（2026.01）",
            "date": "2026-01-30",
            "tags": ["贵金属", "地缘风险", "政策博弈", "市场复盘"],
            "path": macro_doc_b,
        },
    ]

    macro_reports = []
    for item in macro_inputs:
        body_items = extract_docx_body_items(item["path"])
        paragraphs = [
            (str(block.get("style")) if isinstance(block.get("style"), str) else None, str(block.get("text", "")))
            for block in body_items
            if block.get("type") == "paragraph"
        ]
        lines = build_content_lines(paragraphs)
        macro_reports.append(
            {
                "id": item["id"],
                "title": item["title"],
                "date": item["date"],
                "tags": item["tags"],
                "sourceFiles": [safe_source_label(item["path"])],
                "preview": pick_preview(lines),
                "toc": build_toc(paragraphs),
                "content": "\n\n".join(build_content_blocks(body_items)),
                "lineCount": len(lines),
            }
        )

    req_lines = [
        line.strip()
        for line in useco_requirements.read_text(encoding="utf-8").splitlines()
        if line.strip() and line.strip().lower() != "streamlit"
    ]
    script_text = useco_script.read_text(encoding="utf-8")
    indicator_matches = re.findall(r"\"([^\"]+)\":\s*\"([A-Z0-9]+)\"", script_text)
    indicator_items: list[str] = []
    for name, code in indicator_matches:
        if any(
            key in name
            for key in (
                "Non-Farm",
                "Unemployment",
                "Initial Claims",
                "Retail Sales",
                "PCE",
                "GDP",
                "CPI",
                "Core PCE",
                "PPI",
                "Industrial Production",
            )
        ):
            indicator_items.append(f"- {name} ({code})")
    indicator_items = indicator_items[:18]

    useco_docs = [
        {
            "id": "useco-merged",
            "title": "USeco 美国经济数据方案（Next.js 部署版）",
            "date": datetime.now(timezone.utc).date().isoformat(),
            "tags": ["USeco", "合并版", "requirements", "FRED API", "Next.js"],
            "sourceFiles": [safe_source_label(useco_script), safe_source_label(useco_requirements)],
            "preview": "已合并 requirements 与指标映射，仅保留可部署到当前 Next.js 体系的口径说明。",
            "toc": [
                "一、部署口径说明",
                "二、依赖与运行环境",
                "三、核心指标映射（FRED）",
                "四、数据处理逻辑（后端）",
                "五、前端展示模块（美国经济数据页）",
            ],
            "content": "\n\n".join(
                [
                    "一、部署口径说明",
                    "当前项目统一以 Next.js 前端 + Python API 的形态部署，USeco 仅作为指标定义与数据口径来源。",
                    "二、依赖与运行环境",
                    "requirements.txt：\n" + "\n".join(f"- {line}" for line in req_lines),
                    "三、核心指标映射（FRED）",
                    "\n".join(indicator_items) if indicator_items else "未解析出指标映射。",
                    "四、数据处理逻辑（后端）",
                    "- 批量抓取：按类别从 FRED 拉取时间序列并统一时间轴。\n"
                    "- 指标加工：计算同比、动量、ZScore 三类视角。\n"
                    "- 事件输出：生成可供日报与专题页消费的结构化字段。",
                    "五、前端展示模块（美国经济数据页）",
                    "1) 概览卡：就业/消费/增长/通胀四象限。\n"
                    "2) 指标面板：非农、CPI、PCE、零售销售、失业率等。\n"
                    "3) 研判区：结合宏观总分输出风险提示与交易观察点。",
                ]
            ),
            "lineCount": len(req_lines) + len(indicator_items) + 16,
        }
    ]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "macroReports": macro_reports,
        "usEconomicDocs": useco_docs,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build market-analysis-library.json from local docs.")
    parser.add_argument(
        "--macro-doc-c",
        default="/Users/momo/Desktop/研报/宏观量化研报（2026.03.月中).docx",
        help="Path to 2026.03 macro quant report DOCX",
    )
    parser.add_argument(
        "--macro-doc-a",
        default="/Users/momo/Desktop/研报/宏观量化研报（2026.02 月中）.docx",
        help="Path to 宏观量化研报 DOCX",
    )
    parser.add_argument(
        "--macro-doc-b",
        default="/Users/momo/Desktop/研报/市场深度研报（2026.01）.docx",
        help="Path to 市场深度研报 DOCX",
    )
    parser.add_argument(
        "--useco-script",
        default=str(ROOT / "USeco" / "us_economics.py"),
        help="Path to USeco main script",
    )
    parser.add_argument(
        "--useco-requirements",
        default=str(ROOT / "USeco" / "requirements.txt"),
        help="Path to USeco requirements.txt",
    )
    parser.add_argument(
        "--output",
        default="web/public/data/market-analysis-library.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    payload = build_payload(
        macro_doc_c=Path(args.macro_doc_c),
        macro_doc_a=Path(args.macro_doc_a),
        macro_doc_b=Path(args.macro_doc_b),
        useco_script=Path(args.useco_script),
        useco_requirements=Path(args.useco_requirements),
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {output_path} (macroReports={len(payload['macroReports'])}, usEconomicDocs={len(payload['usEconomicDocs'])})")


if __name__ == "__main__":
    main()
