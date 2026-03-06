#!/usr/bin/env python3
"""
Build a static market-analysis document library JSON for the Next.js pages.

This script extracts plain text from two DOCX files and merges local USeco files
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


def extract_docx_lines(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    for paragraph in root.findall(".//w:p", NS):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
        text = re.sub(r"\s+", " ", text)
        if text:
            lines.append(text)
    dedup: list[str] = []
    for line in lines:
        if dedup and dedup[-1] == line:
            continue
        dedup.append(line)
    return dedup


def pick_preview(lines: list[str]) -> str:
    for line in lines:
        if len(line) < 12:
            continue
        if line.startswith("目录"):
            continue
        if re.fullmatch(r"[0-9.\-（）()\s]+", line):
            continue
        return line[:180]
    return lines[0][:180] if lines else ""


def build_toc(lines: list[str]) -> list[str]:
    pattern = re.compile(r"^(?:[一二三四五六七八九十]+、|[0-9]+(?:\.[0-9]+)*\.?|附录|总结)")
    toc: list[str] = []
    for line in lines:
        if pattern.match(line) and len(line) <= 48 and line not in toc:
            toc.append(line)
    return toc[:14]


def build_payload(
    macro_doc_a: Path,
    macro_doc_b: Path,
    useco_script: Path,
    useco_requirements: Path,
) -> dict:
    macro_inputs = [
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
        lines = extract_docx_lines(item["path"])
        macro_reports.append(
            {
                "id": item["id"],
                "title": item["title"],
                "date": item["date"],
                "tags": item["tags"],
                "sourceFiles": [str(item["path"])],
                "preview": pick_preview(lines),
                "toc": build_toc(lines),
                "content": "\n\n".join(lines),
                "lineCount": len(lines),
            }
        )

    macro_reports.insert(
        0,
        {
            "id": "macro-merged-2026-01-02",
            "title": "宏观+市场深度合并解读（2026-01 ~ 2026-02）",
            "date": "2026-02-13",
            "tags": ["合并版", "执行框架", "资产配置"],
            "sourceFiles": [str(macro_doc_a), str(macro_doc_b)],
            "preview": "把 2026 年 1 月市场深度与 2 月宏观量化框架合并，形成统一的监控触发器与仓位执行模板。",
            "toc": [
                "一、共同主线：伪稳态与高敏感系统",
                "二、关键分歧：价格平稳 vs 数量收缩",
                "三、资产映射：美股/美债/加密/贵金属",
                "四、触发器与动作模板",
                "五、每周复核清单",
            ],
            "content": "\n\n".join(
                [
                    "一、共同主线：伪稳态与高敏感系统",
                    "两份研报都指向同一个核心结论：当前市场不是“稳定”，而是“被政策工具暂时托住的伪稳态”。表面上资金价格与曲线可控，底层数量变量（TGA、准备金、信用阶梯尾部）却在持续收紧。",
                    "二、关键分歧：价格平稳 vs 数量收缩",
                    "2 月宏观量化报告强调“价格不等于安全”，1 月市场深度报告强调“事件触发后波动会非线性放大”。执行上必须把数量变量（TGA、ON RRP、信用尾部利差）作为一票否决项。",
                    "三、资产映射：美股 / 美债 / 加密 / 贵金属",
                    "1) 美股：顺周期高估值资产对流动性最敏感，应在触发阈值前先降杠杆。",
                    "2) 美债：在压力情景下是核心对冲；在再通胀情景下需严控长久期风险。",
                    "3) 加密：高 beta 资产，受美元流动性与风险偏好双重驱动，需和宏观阈值绑定仓位。",
                    "4) 贵金属：中期受益于制度不确定性，但短期会被流动性挤兑拖累，仓位应分层。",
                    "四、触发器与动作模板",
                    "触发器A（流动性恶化）：TGA上行+准备金下滑+ON RRP 低位 -> 降风险敞口并提高对冲权重。",
                    "触发器B（信用尾部抬升）：CCC OAS 扩大且持续 -> 避开底层信用与高杠杆资产。",
                    "触发器C（政策再定价）：关键政策人事/议息信号突变 -> 降低方向赌注，转向事件驱动框架。",
                    "五、每周复核清单",
                    "每周固定复核：模块 A/B/C/D/E/F/G、跨资产波动同步性、信用尾部变化、事件窗口仓位上限。",
                    "执行原则：先保生存，再做进攻；先控制回撤，再追求超额收益。",
                ]
            ),
            "lineCount": 16,
        },
    )

    req_lines = [line.strip() for line in useco_requirements.read_text(encoding="utf-8").splitlines() if line.strip()]
    script_text = useco_script.read_text(encoding="utf-8")
    script_lines = script_text.splitlines()

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
            "title": "USeco 美国经济数据项目（合并版）",
            "date": datetime.now(timezone.utc).date().isoformat(),
            "tags": ["USeco", "合并版", "requirements", "FRED API"],
            "sourceFiles": [str(useco_script), str(useco_requirements)],
            "preview": "已合并 requirements 与主脚本结构，便于在「美国经济数据」页面直接阅读项目说明和数据口径。",
            "toc": [
                "一、依赖与运行环境",
                "二、核心指标映射（FRED）",
                "三、数据处理与量化函数",
                "四、Streamlit 页面结构",
                "五、可迁移到 Next.js 的模块建议",
            ],
            "content": "\n\n".join(
                [
                    "一、依赖与运行环境",
                    "requirements.txt：\n" + "\n".join(f"- {line}" for line in req_lines),
                    "二、核心指标映射（FRED）",
                    "\n".join(indicator_items) if indicator_items else "未解析出指标映射。",
                    "三、数据处理与量化函数",
                    "- fetch_and_process_data：按类别批量从 FRED 拉取数据并月频重采样。\n"
                    "- calculate_quant_metrics：统一生成 Market/Momentum/ZScore 三个视角。\n"
                    "- generate_smart_report：基于最新数据生成板块解读文本。",
                    "四、Streamlit 页面结构",
                    "- 侧边栏：lookback 年限、z-score 窗口与数据发布日历。\n"
                    "- 主体：就业/消费/增长/通胀四大板块图表与解释。\n"
                    "- 缓存：st.cache_data(ttl=3600)。",
                    "五、可迁移到 Next.js 的模块建议",
                    "1) 拆分为 API 层（数据抓取）+ 计算层（指标）+ 展示层（图表和解读）。\n"
                    "2) 把指标字典和解释文案独立成 JSON，前端按模块渲染。\n"
                    "3) 把 requirements 依赖映射为后端服务依赖清单，前端只做可视化。",
                ]
            ),
            "lineCount": len(req_lines) + len(indicator_items) + 18,
        },
        {
            "id": "useco-script-excerpt",
            "title": "USeco 原始脚本节选（us_economics.py）",
            "date": datetime.now(timezone.utc).date().isoformat(),
            "tags": ["代码节选", "Streamlit", "量化函数"],
            "sourceFiles": [str(useco_script)],
            "preview": "保留原始脚本关键片段（前 240 行），用于对照迁移时的指标定义与函数逻辑。",
            "toc": ["脚本节选（前 240 行）"],
            "content": "\n".join(script_lines[:240]),
            "lineCount": min(240, len(script_lines)),
        },
    ]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "macroReports": macro_reports,
        "usEconomicDocs": useco_docs,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build market-analysis-library.json from local docs.")
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
        default="/Users/momo/Desktop/USeco/us_economics.py",
        help="Path to USeco main script",
    )
    parser.add_argument(
        "--useco-requirements",
        default="/Users/momo/Desktop/USeco/requirements.txt",
        help="Path to USeco requirements.txt",
    )
    parser.add_argument(
        "--output",
        default="web/public/data/market-analysis-library.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    payload = build_payload(
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
