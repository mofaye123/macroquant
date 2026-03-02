import copy
import json
import os
import re
import textwrap
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from config import API_KEY, SERIES_IDS
from data_engine import get_last_fetch_meta, get_mixed_data
from modules.backtest import _calculate_score_internal


MODULE_META = [
    {"id": "A", "slug": "a", "title": "系统流动性", "subtitle": "Liquidity", "weight": 0.20, "weight_text": "20%"},
    {"id": "B", "slug": "b", "title": "资金价格与摩擦", "subtitle": "Funding", "weight": 0.20, "weight_text": "20%"},
    {"id": "C", "slug": "c", "title": "国债期限结构", "subtitle": "Yield Curve", "weight": 0.15, "weight_text": "15%"},
    {"id": "D", "slug": "d", "title": "实际利率与通胀", "subtitle": "Real Rates", "weight": 0.15, "weight_text": "15%"},
    {"id": "E", "slug": "e", "title": "外部冲击与汇率", "subtitle": "External", "weight": 0.15, "weight_text": "15%"},
    {"id": "F", "slug": "f", "title": "信用压力", "subtitle": "Credit", "weight": 0.075, "weight_text": "7.5%"},
    {"id": "G", "slug": "g", "title": "风险偏好", "subtitle": "Risk", "weight": 0.075, "weight_text": "7.5%"},
]

MODULE_BUCKET = {
    "A": "Flow",
    "B": "Penalty",
    "C": "Flow",
    "D": "Level",
    "E": "Flow",
    "F": "Level",
    "G": "Flow",
}

MODULE_GLOSSARY: Dict[str, List[Dict[str, str]]] = {
    "a": [
        {"term": "Net Liquidity", "definition": "WALCL - TGA - ON RRP，反映系统可用流动性。", "signal": "上行偏 Risk-On"},
        {"term": "TGA Penalty", "definition": "财政账户规模对流动性打分的惩罚系数。", "signal": "高位时压制风险资产"},
        {"term": "Sink Ratio", "definition": "吸收项 / 总资产比例。", "signal": ">25% 代表抽水压力"},
    ],
    "b": [
        {"term": "SOFR Policy", "definition": "政策利率方向和区间位置打分。", "signal": "利率上行压制风险偏好"},
        {"term": "Friction", "definition": "资金利率偏离政策走廊程度。", "signal": "偏离越大得分越低"},
        {"term": "SRF", "definition": "联储紧急流动性工具使用频率。", "signal": "放量说明资金压力"},
    ],
    "c": [
        {"term": "2s10s", "definition": "2年与10年期国债利差。", "signal": "深度倒挂偏衰退"},
        {"term": "3m10s", "definition": "3月与10年期利差。", "signal": "回正通常领先修复"},
        {"term": "Curve Penalty", "definition": "长端斜率快速上行的惩罚项。", "signal": "避免误判急速重定价"},
    ],
    "d": [
        {"term": "Real Yield", "definition": "10Y/5Y TIPS 实际利率。", "signal": "上行通常压制估值"},
        {"term": "Breakeven", "definition": "隐含通胀预期。", "signal": "接近目标区间最优"},
        {"term": "Real Curve", "definition": "不同期限实际利率结构。", "signal": "倒挂反映增长压力"},
    ],
    "e": [
        {"term": "DXY", "definition": "美元指数变动与跨市场金融条件。", "signal": "强美元偏紧"},
        {"term": "JPY Carry", "definition": "日元与利差环境的风险偏好映射。", "signal": "套息回补时波动上升"},
        {"term": "Energy", "definition": "油气价格冲击。", "signal": "上行会压利润和通胀"},
    ],
    "f": [
        {"term": "HY Spread", "definition": "高收益债利差水平。", "signal": "放大代表信用风险抬升"},
        {"term": "HY Trend", "definition": "利差中期方向。", "signal": "持续走阔偏 Risk-Off"},
        {"term": "BAA10Y", "definition": "投资级公司债风险补偿。", "signal": "与增长预期共振"},
    ],
    "g": [
        {"term": "VIX", "definition": "隐含波动率水平。", "signal": "升高意味着避险需求"},
        {"term": "VIX/VXV", "definition": "短端与中期波动率结构。", "signal": ">1 代表短期压力"},
        {"term": "Risk Momentum", "definition": "风险资产相对动量。", "signal": "强势提升风险偏好"},
    ],
}

MODULE_REQUIRED_COLUMNS: Dict[str, List[str]] = {
    "a": ["WALCL", "WTREGEN", "RRPONTSYD", "WRESBAL"],
    "b": ["SOFR", "IORB", "RRPONTSYAWARD", "TGCRRATE", "RPONTSYD"],
    "c": ["DGS10", "DGS2", "DGS30", "T10Y2Y", "T10Y3M"],
    "d": ["DFII10", "DFII5", "T10YIE"],
    "e": ["DTWEXBGS", "DXY", "DEXJPUS", "IRSTCI01JPM156N", "DCOILWTICO", "DHHNGSP"],
    "f": ["BAMLH0A0HYM2", "BAA10Y"],
}

_MODULE_SOURCE_CACHE: Dict[str, str] = {}


def _module_source_text(slug: str) -> str:
    cached = _MODULE_SOURCE_CACHE.get(slug)
    if cached is not None:
        return cached
    path = Path(__file__).resolve().parent / "modules" / f"module_{slug}.py"
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        text = ""
    _MODULE_SOURCE_CACHE[slug] = text
    return text


def _extract_glossary_html(slug: str) -> str:
    source = _module_source_text(slug)
    if not source:
        return ""
    start = source.find('with st.expander("📚')
    if start < 0:
        return ""
    end = source.find('with st.expander("📄', start)
    section = source[start:end] if end > start else source[start:]
    blocks = re.findall(
        r"st\.markdown\(\s*(?:f)?(?P<quote>\"\"\"|''')(?P<html>.*?)(?P=quote)\s*,\s*unsafe_allow_html=True\s*\)",
        section,
        flags=re.S,
    )
    if not blocks:
        return ""
    html_parts = [textwrap.dedent(match[1]).strip() for match in blocks if match[1].strip()]
    return "\n".join(html_parts)


def _series_points(series: pd.Series, limit: int = 260) -> List[Dict[str, Any]]:
    s = series.dropna().tail(limit)
    return [{"date": idx.strftime("%Y-%m-%d"), "value": round(float(val), 2)} for idx, val in s.items()]


def _prev_value(series: pd.Series, days: int = 7) -> float:
    s = series.dropna()
    if s.empty:
        return 0.0
    if len(s) == 1:
        return float(s.iloc[-1])
    target = s.index[-1] - pd.Timedelta(days=days)
    idx = s.index.get_indexer([target], method="nearest")[0]
    if idx < 0:
        return float(s.iloc[-2])
    return float(s.iloc[idx])


def _state_from_delta(delta: float) -> str:
    if delta > 0:
        return "positive"
    if delta < 0:
        return "negative"
    return "neutral"


def _score_state(score: float) -> Dict[str, str]:
    if score >= 75:
        return {"label": "极松", "hint": "风险偏好明显回暖", "state": "positive"}
    if score >= 60:
        return {"label": "偏松", "hint": "金融条件偏宽松", "state": "positive"}
    if score >= 45:
        return {"label": "中性", "hint": "处于均衡区间", "state": "neutral"}
    if score >= 30:
        return {"label": "偏紧", "hint": "流动性边际偏紧", "state": "negative"}
    return {"label": "极紧", "hint": "风险约束显著抬升", "state": "negative"}


def _safe_float(value: Any, fallback: float = np.nan) -> float:
    try:
        if pd.isna(value):
            return float(fallback)
        return float(value)
    except Exception:
        return float(fallback)


def _latest_and_diff(series: pd.Series) -> Dict[str, float]:
    s = series.dropna()
    if s.empty:
        return {"last": np.nan, "diff": np.nan, "pct": np.nan}
    if len(s) == 1:
        return {"last": float(s.iloc[-1]), "diff": 0.0, "pct": 0.0}
    last = float(s.iloc[-1])
    prev = float(s.iloc[-2])
    diff = last - prev
    pct = (diff / prev * 100.0) if prev else np.nan
    return {"last": last, "diff": diff, "pct": pct}


def _module_input_gaps(df_all: pd.DataFrame) -> Dict[str, List[str]]:
    columns = set(str(col) for col in df_all.columns)
    gaps: Dict[str, List[str]] = {}

    for slug, required in MODULE_REQUIRED_COLUMNS.items():
        missing = [col for col in required if col not in columns]
        if missing:
            gaps[slug] = missing

    g_missing: List[str] = []
    if "SP500" not in columns:
        g_missing.append("SP500")
    if not ({"VIX_YH", "VIXCLS"} & columns):
        g_missing.append("VIX_YH|VIXCLS")
    if not ({"VXV_YH", "VXVCLS"} & columns):
        g_missing.append("VXV_YH|VXVCLS")
    if g_missing:
        gaps["g"] = g_missing

    return gaps


def _format_signed(value: float, digits: int = 1, suffix: str = "") -> str:
    if pd.isna(value):
        return "-"
    sign = "+" if value >= 0 else ""
    return f"{sign}{value:.{digits}f}{suffix}"


def _score_bucket(score: float) -> str:
    if score < 33:
        return "critical"
    if score < 55:
        return "warning"
    if score < 66:
        return "stable"
    return "strong"


def _build_raw_table(frame: pd.DataFrame, fallback_points: List[Dict[str, Any]]) -> Dict[str, Any]:
    if frame is None or frame.empty:
        return {
            "columns": ["Date", "Total_Score"],
            "rows": [[point["date"], round(float(point["value"]), 2)] for point in reversed(fallback_points[-12:])],
        }

    raw = frame.tail(12).copy()
    columns = ["Date"] + [str(col) for col in raw.columns]
    rows: List[List[Any]] = []
    for idx, row in raw.sort_index(ascending=False).iterrows():
        values: List[Any] = [idx.strftime("%Y-%m-%d")]
        for value in row.tolist():
            if pd.isna(value):
                values.append(None)
            elif isinstance(value, (int, np.integer)):
                values.append(int(value))
            else:
                values.append(round(float(value), 4))
        rows.append(values)
    return {"columns": columns, "rows": rows}


def _build_module_special_series(module_id: str, frame: pd.DataFrame) -> Optional[Dict[str, List[Dict[str, Any]]]]:
    if frame is None or frame.empty or "Total_Score" not in frame.columns:
        return None

    if module_id == "A":
        payload: Dict[str, List[Dict[str, Any]]] = {
            "score": _series_points(frame["Total_Score"], limit=320),
        }
        if "Liquidity_Sink" in frame.columns:
            payload["sink"] = _series_points(frame["Liquidity_Sink"] / 1000.0, limit=320)
        if "WTREGEN" in frame.columns:
            tga_series = frame["WTREGEN"].where(frame["WTREGEN"] <= 10000, frame["WTREGEN"] / 1000.0)
            payload["tga"] = _series_points(tga_series, limit=320)
        if "RRP_Clean" in frame.columns:
            payload["rrp"] = _series_points(frame["RRP_Clean"] / 1000.0, limit=320)
        return payload

    if module_id == "B":
        payload = {
            "score": _series_points(frame["Total_Score"], limit=320),
        }
        if "Corridor_Width" in frame.columns:
            payload["corridor"] = _series_points(frame["Corridor_Width"] * 100.0, limit=320)
        if "SRF_Weight" in frame.columns:
            payload["srfWeight"] = _series_points(frame["SRF_Weight"] * 100.0, limit=320)
        if "SOFR" in frame.columns:
            payload["sofr"] = _series_points(frame["SOFR"], limit=320)
        if "IORB" in frame.columns:
            payload["iorb"] = _series_points(frame["IORB"], limit=320)
        if "RRPONTSYAWARD" in frame.columns:
            payload["floor"] = _series_points(frame["RRPONTSYAWARD"], limit=320)
        if "SOFR_MA13" in frame.columns:
            payload["sofrMa13"] = _series_points(frame["SOFR_MA13"], limit=320)
        if "SOFR" in frame.columns and "IORB" in frame.columns:
            payload["spread"] = _series_points((frame["SOFR"] - frame["IORB"]) * 100.0, limit=320)
        if "RPONTSYD" in frame.columns:
            payload["srf"] = _series_points(frame["RPONTSYD"], limit=320)
        return payload

    return None


def _collect_contributor_delta(
    items: List[Dict[str, Any]],
    frame: pd.DataFrame,
    col: str,
    name: str,
    module_weight: float,
    factor_weight: float,
    bucket: str,
) -> None:
    if frame is None or frame.empty or col not in frame.columns:
        return
    series = frame[col].dropna()
    if series.empty:
        return
    latest = float(series.iloc[-1])
    prev = _prev_value(series, days=7)
    delta = (latest - prev) * module_weight * factor_weight
    if abs(delta) < 0.01:
        return
    items.append({"name": name, "delta": round(delta, 2), "bucket": bucket})


def _build_lift_drag(module_frames: Dict[str, pd.DataFrame]) -> Dict[str, Any]:
    factor_deltas: List[Dict[str, Any]] = []
    frame_map = {slug: module_frames.get(slug, pd.DataFrame()) for slug in ("a", "b", "c", "d", "e", "f", "g")}

    _collect_contributor_delta(factor_deltas, frame_map["a"], "Score_NetLiq_Adj", "Net Liquidity", 0.20, 0.45, "Flow")
    _collect_contributor_delta(factor_deltas, frame_map["a"], "Score_TGA", "TGA", 0.20, 0.20, "Penalty")
    _collect_contributor_delta(factor_deltas, frame_map["a"], "Score_RRP", "ON RRP", 0.20, 0.25, "Flow")
    _collect_contributor_delta(factor_deltas, frame_map["a"], "Score_Reserves", "Bank Reserves", 0.20, 0.10, "Level")

    _collect_contributor_delta(factor_deltas, frame_map["b"], "Score_Policy", "SOFR Policy", 0.20, 0.40, "Level")
    _collect_contributor_delta(factor_deltas, frame_map["b"], "Score_Friction", "Funding Friction", 0.20, 0.60, "Flow")

    _collect_contributor_delta(factor_deltas, frame_map["c"], "Score_Curve_2s10s", "2s10s Curve", 0.15, 0.30, "Flow")
    _collect_contributor_delta(factor_deltas, frame_map["c"], "Score_Curve_3m10s", "3m10s Curve", 0.15, 0.30, "Flow")
    _collect_contributor_delta(factor_deltas, frame_map["c"], "Penalty_Factor", "Curve Penalty", 0.15, 0.30, "Penalty")

    _collect_contributor_delta(factor_deltas, frame_map["d"], "Score_Real_10Y", "10Y Real Rate", 0.15, 0.40, "Level")
    _collect_contributor_delta(factor_deltas, frame_map["d"], "Score_Breakeven", "10Y Breakeven", 0.15, 0.30, "Flow")

    _collect_contributor_delta(factor_deltas, frame_map["e"], "Score_DXY", "DXY", 0.15, 0.20, "Flow")
    _collect_contributor_delta(factor_deltas, frame_map["e"], "Score_Yen_Total", "Yen / Carry", 0.15, 0.30, "Flow")
    _collect_contributor_delta(factor_deltas, frame_map["e"], "Score_Energy", "Energy", 0.15, 0.30, "Flow")

    _collect_contributor_delta(factor_deltas, frame_map["f"], "Score_HY_Level", "HY Credit", 0.075, 0.50, "Level")
    _collect_contributor_delta(factor_deltas, frame_map["f"], "Score_HY_Trend", "HY Trend", 0.075, 0.30, "Flow")

    _collect_contributor_delta(factor_deltas, frame_map["g"], "Score_Term", "VIX/VXV", 0.075, 0.40, "Level")
    _collect_contributor_delta(factor_deltas, frame_map["g"], "Score_Mom", "Risk vs Safe", 0.075, 0.30, "Flow")

    lifts = sorted((item for item in factor_deltas if item["delta"] > 0), key=lambda item: item["delta"], reverse=True)[:3]
    drags = sorted((item for item in factor_deltas if item["delta"] < 0), key=lambda item: item["delta"])[:3]
    bucket_totals = {"Level": 0.0, "Flow": 0.0, "Penalty": 0.0}
    for item in factor_deltas:
        bucket_totals[item["bucket"]] = bucket_totals.get(item["bucket"], 0.0) + float(item["delta"])
    structural_delta = bucket_totals["Level"] + bucket_totals["Penalty"]
    flow_delta = bucket_totals["Flow"]
    return {
        "lifts": lifts,
        "drags": drags,
        "summary": {
            "level": round(bucket_totals["Level"], 2),
            "flow": round(flow_delta, 2),
            "penalty": round(bucket_totals["Penalty"], 2),
            "structural": round(structural_delta, 2),
            "driver": "结构性变化主导" if abs(structural_delta) >= abs(flow_delta) else "短期波动主导",
        },
    }


def _build_dashboard_heatmap(module_frames: Dict[str, pd.DataFrame], df_all: pd.DataFrame) -> Dict[str, Any]:
    if df_all.empty:
        return {"weeks": [], "rows": []}
    base_idx = df_all.index
    labels = {
        "a": "系统流动性",
        "b": "资金价格与摩擦",
        "c": "国债期限结构",
        "d": "实际利率与通胀",
        "e": "外部冲击与汇率",
        "f": "信用压力",
        "g": "风险偏好",
    }
    module_hist = pd.DataFrame(index=base_idx)
    for slug, label in labels.items():
        frame = module_frames.get(slug, pd.DataFrame())
        if not frame.empty and "Total_Score" in frame.columns:
            module_hist[label] = frame["Total_Score"].reindex(base_idx, method="ffill")
        else:
            module_hist[label] = pd.Series(50.0, index=base_idx)
    weekly = module_hist.resample("W-FRI").last().dropna(how="all").tail(26)
    if weekly.empty:
        return {"weeks": [], "rows": []}
    weeks = [f"W{int(ts.isocalendar().week):02d}" for ts in weekly.index]
    rows = []
    for label in weekly.columns:
        cells = []
        for idx, value in enumerate(weekly[label].tolist()):
            score = float(value)
            cells.append({"week": weeks[idx], "score": round(score, 1), "bucket": _score_bucket(score)})
        rows.append({"label": label, "cells": cells})
    return {"weeks": weeks, "rows": rows}


def _build_regime_view(df_all: pd.DataFrame) -> Dict[str, Any]:
    reg = _ensure_df(df_all, ["INDPRO", "PCEPILFE"]).copy()
    if reg.empty:
        return {"current": None, "growthZ": None, "inflationZ": None, "lastSwitch": None, "timeline": []}

    reg_m = reg.resample("M").last()
    reg_m["Growth_YoY"] = reg_m["INDPRO"].pct_change(12) * 100
    reg_m["CorePCE_YoY"] = reg_m["PCEPILFE"].pct_change(12) * 100
    g_mean = reg_m["Growth_YoY"].rolling(60, min_periods=12).mean()
    g_std = reg_m["Growth_YoY"].rolling(60, min_periods=12).std().replace(0, np.nan)
    i_mean = reg_m["CorePCE_YoY"].rolling(60, min_periods=12).mean()
    i_std = reg_m["CorePCE_YoY"].rolling(60, min_periods=12).std().replace(0, np.nan)
    reg_m["Growth_Z"] = (reg_m["Growth_YoY"] - g_mean) / g_std
    reg_m["Infl_Z"] = (reg_m["CorePCE_YoY"] - i_mean) / i_std
    reg_m = reg_m.dropna(subset=["Growth_Z", "Infl_Z"])
    if reg_m.empty:
        return {"current": None, "growthZ": None, "inflationZ": None, "lastSwitch": None, "timeline": []}

    reg_m["Regime"] = np.select(
        [
            (reg_m["Growth_Z"] >= 0) & (reg_m["Infl_Z"] < 0),
            (reg_m["Growth_Z"] >= 0) & (reg_m["Infl_Z"] >= 0),
            (reg_m["Growth_Z"] < 0) & (reg_m["Infl_Z"] >= 0),
            (reg_m["Growth_Z"] < 0) & (reg_m["Infl_Z"] < 0),
        ],
        ["复苏", "过热", "滞胀", "放缓"],
        default="放缓",
    )
    view = reg_m.tail(30).copy()
    switches = view[view["Regime"] != view["Regime"].shift(1)]
    switch_text = "最近区间未发生象限切换。"
    if switches.shape[0] > 1:
        sw = switches.iloc[-1]
        switch_text = f"最近切换: {switches.index[-1].strftime('%Y-%m')} → {sw['Regime']}"

    current = view.iloc[-1]
    return {
        "current": str(current["Regime"]),
        "growthZ": round(float(current["Growth_Z"]), 2),
        "inflationZ": round(float(current["Infl_Z"]), 2),
        "lastSwitch": switch_text,
        "timeline": [
            {"date": idx.strftime("%y-%m"), "regime": str(row["Regime"])}
            for idx, row in view.iterrows()
        ],
    }


def _market_stat(series: Optional[pd.Series]) -> Dict[str, float]:
    if series is None:
        return {"last": np.nan, "diff": np.nan, "pct": np.nan}
    return _latest_and_diff(series)


def _format_combined_change(
    diff_value: float,
    pct_value: float,
    diff_digits: int = 2,
    pct_digits: int = 2,
    diff_suffix: str = "",
    pct_suffix: str = "%",
) -> str:
    has_diff = not pd.isna(diff_value)
    has_pct = not pd.isna(pct_value)
    if has_diff and has_pct:
        return f"{_format_signed(diff_value, diff_digits, diff_suffix)} · {_format_signed(pct_value, pct_digits, pct_suffix)}"
    if has_diff:
        return _format_signed(diff_value, diff_digits, diff_suffix)
    if has_pct:
        return _format_signed(pct_value, pct_digits, pct_suffix)
    return "-"


def _tone_from_signed_value(value: float) -> str:
    if pd.isna(value):
        return "neutral"
    if value > 0:
        return "positive"
    if value < 0:
        return "negative"
    return "neutral"


def _merged_series(df_all: pd.DataFrame, *columns: str) -> Optional[pd.Series]:
    merged: Optional[pd.Series] = None
    for column in columns:
        if column not in df_all.columns:
            continue
        series = df_all.get(column)
        if series is None:
            continue
        merged = series if merged is None else merged.combine_first(series)
    return merged


def _compute_oil_shock_signal(df_all: pd.DataFrame) -> Dict[str, Any]:
    wti = _merged_series(df_all, "WTI_YH", "DCOILWTICO")
    if wti is None:
        return {"adjustment": 0.0, "label": "未触发", "reason": "无可用油价序列", "move_pct": np.nan}

    wti_valid = wti.dropna()
    if len(wti_valid) < 2:
        return {"adjustment": 0.0, "label": "未触发", "reason": "油价历史不足", "move_pct": np.nan}

    oil_1d = _safe_float(wti_valid.pct_change().dropna().iloc[-1])

    dxy_series = df_all.get("DXY", pd.Series(dtype=float)).dropna()
    spx_series = df_all.get("SP500", pd.Series(dtype=float)).dropna()
    vix_series = _merged_series(df_all, "VIX_YH", "VIXCLS")
    hy_series = df_all.get("BAMLH0A0HYM2", pd.Series(dtype=float)).dropna()

    dxy_1d = _safe_float(dxy_series.pct_change().dropna().iloc[-1] if len(dxy_series) >= 2 else np.nan)
    spx_1d = _safe_float(spx_series.pct_change().dropna().iloc[-1] if len(spx_series) >= 2 else np.nan)
    vix_valid = vix_series.dropna() if vix_series is not None else pd.Series(dtype=float)
    vix_1d = _safe_float(vix_valid.pct_change().dropna().iloc[-1] if len(vix_valid) >= 2 else np.nan)
    hy_1d = _safe_float(hy_series.diff().dropna().iloc[-1] if len(hy_series) >= 2 else np.nan)

    risk_confirmation = any(
        (
            not pd.isna(dxy_1d) and dxy_1d >= 0.005,
            not pd.isna(spx_1d) and spx_1d <= -0.01,
            not pd.isna(vix_1d) and vix_1d >= 0.10,
            not pd.isna(hy_1d) and hy_1d >= 0.03,
        )
    )

    adjustment = 0.0
    label = "未触发"
    reason = "日度波动仍处于正常区间"

    if oil_1d >= 0.08:
        adjustment = -18.0
        label = "通胀冲击"
        reason = "WTI 单日暴涨 >= 8%"
    elif oil_1d >= 0.05:
        adjustment = -10.0
        label = "通胀冲击"
        reason = "WTI 单日暴涨 >= 5%"
    elif oil_1d >= 0.03:
        adjustment = -5.0
        label = "短期升温"
        reason = "WTI 单日上涨 >= 3%"
    elif oil_1d <= -0.04:
        if risk_confirmation:
            adjustment = -8.0
            label = "需求冲击"
            reason = "WTI 暴跌且伴随风险共振"
        else:
            adjustment = 4.0
            label = "通胀缓和"
            reason = "WTI 暴跌但未见风险共振"

    return {
        "adjustment": adjustment,
        "label": label,
        "reason": reason,
        "move_pct": oil_1d * 100.0 if not pd.isna(oil_1d) else np.nan,
    }


def _build_market_board(df_all: pd.DataFrame) -> Dict[str, Any]:
    dgs2 = _market_stat(df_all.get("DGS2"))
    dgs10 = _market_stat(df_all.get("DGS10"))
    dgs30 = _market_stat(df_all.get("DGS30"))
    curve_2s10s = _market_stat(df_all.get("T10Y2Y"))
    curve_3m10s = _market_stat(df_all.get("T10Y3M"))
    dxy = _market_stat(df_all.get("DXY"))
    spx = _market_stat(df_all.get("SP500"))
    hy = _market_stat(df_all.get("BAMLH0A0HYM2"))
    wti = _market_stat(_merged_series(df_all, "WTI_YH", "DCOILWTICO"))

    vix_series = None
    if "VIX_YH" in df_all.columns or "VIXCLS" in df_all.columns:
        vix_series = df_all.get("VIX_YH", pd.Series(index=df_all.index, dtype=float)).combine_first(
            df_all.get("VIXCLS", pd.Series(index=df_all.index, dtype=float))
        )
    vix = _market_stat(vix_series)
    dgs10_value = "-" if pd.isna(dgs10["last"]) else f"{dgs10['last']:.2f}%"
    dgs30_value = "-" if pd.isna(dgs30["last"]) else f"{dgs30['last']:.2f}%"
    spx_value = "-" if pd.isna(spx["last"]) else f"{spx['last']:.0f}"
    vix_value = "-" if pd.isna(vix["last"]) else f"{vix['last']:.1f}"
    dxy_value = "-" if pd.isna(dxy["last"]) else f"{dxy['last']:.2f}"
    hy_value = "-" if pd.isna(hy["last"]) else f"{hy['last']:.2f}"
    wti_value = "-" if pd.isna(wti["last"]) else f"{wti['last']:.2f}"

    cards = [
        {
            "title": "债市先行动量",
            "headline": f"10Y {dgs10_value} / 30Y {dgs30_value}",
            "detail": "长端利率同步变动",
            "changes": [
                {"label": "10Y", "value": _format_signed(dgs10["diff"] * 100.0, 1, "bp"), "tone": _tone_from_signed_value(dgs10["diff"])},
                {"label": "30Y", "value": _format_signed(dgs30["diff"] * 100.0, 1, "bp"), "tone": _tone_from_signed_value(dgs30["diff"])},
            ],
        },
        {
            "title": "收益率结构",
            "headline": f"2s10s {_format_signed(curve_2s10s['last'], 2)} · 3m10s {_format_signed(curve_3m10s['last'], 2)}",
            "detail": "Bull Flattener" if (not pd.isna(curve_2s10s["diff"]) and curve_2s10s["diff"] > 0) else "曲线仍处重定价阶段",
            "changes": [
                {"label": "2s10s Δ", "value": _format_signed(curve_2s10s["diff"], 2), "tone": _tone_from_signed_value(curve_2s10s["diff"])},
                {"label": "3m10s Δ", "value": _format_signed(curve_3m10s["diff"], 2), "tone": _tone_from_signed_value(curve_3m10s["diff"])},
            ],
        },
        {
            "title": "权益表现",
            "headline": f"SPX {spx_value} / VIX {vix_value}",
            "detail": "风格切换/补跌监测",
            "changes": [
                {"label": "SPX", "value": _format_signed(spx["pct"], 2, "%"), "tone": _tone_from_signed_value(spx["pct"])},
                {"label": "VIX", "value": _format_combined_change(vix["diff"], vix["pct"], diff_digits=2, pct_digits=2), "tone": _tone_from_signed_value(vix["diff"])},
            ],
        },
        {
            "title": "信用与美元",
            "headline": f"DXY {dxy_value} / HY {hy_value}",
            "detail": f"WTI {wti_value}",
            "changes": [
                {"label": "DXY", "value": _format_signed(dxy["pct"], 2, "%"), "tone": _tone_from_signed_value(dxy["pct"])},
                {"label": "HY", "value": _format_signed(hy["diff"], 2), "tone": _tone_from_signed_value(hy["diff"])},
                {"label": "WTI", "value": _format_signed(wti["pct"], 2, "%"), "tone": _tone_from_signed_value(wti["pct"])},
            ],
        },
    ]

    verdicts: List[str] = []
    if not pd.isna(dgs10["diff"]) and not pd.isna(spx["pct"]) and dgs10["diff"] < 0 and spx["pct"] < 0:
        verdicts.append("债券先行+权益回落：更像增长预期下修触发的估值重估。")
    if pd.isna(hy["last"]) or hy["last"] < 6.0:
        verdicts.append("信用维持稳定：暂不支持系统性信用冲击。")
    if not pd.isna(dxy["pct"]) and abs(dxy["pct"]) < 0.5:
        verdicts.append("美元端平稳：暂不支持美元荒/全球挤兑交易。")
    if not verdicts:
        verdicts.append("当前是混合盘面，尚未形成单一高置信主线，建议等待下一交易日确认。")

    raw_rows = [
        {"asset": "2Y收益率", "value": None if pd.isna(dgs2["last"]) else round(float(dgs2["last"]), 2), "delta": _format_signed(dgs2["diff"] * 100.0, 1, "bp")},
        {"asset": "10Y收益率", "value": None if pd.isna(dgs10["last"]) else round(float(dgs10["last"]), 2), "delta": _format_signed(dgs10["diff"] * 100.0, 1, "bp")},
        {"asset": "30Y收益率", "value": None if pd.isna(dgs30["last"]) else round(float(dgs30["last"]), 2), "delta": _format_signed(dgs30["diff"] * 100.0, 1, "bp")},
        {"asset": "2s10s", "value": None if pd.isna(curve_2s10s["last"]) else round(float(curve_2s10s["last"]), 2), "delta": _format_signed(curve_2s10s["diff"], 2)},
        {"asset": "3m10s", "value": None if pd.isna(curve_3m10s["last"]) else round(float(curve_3m10s["last"]), 2), "delta": _format_signed(curve_3m10s["diff"], 2)},
        {"asset": "DXY", "value": None if pd.isna(dxy["last"]) else round(float(dxy["last"]), 2), "delta": _format_signed(dxy["pct"], 2, "%")},
        {"asset": "SP500", "value": None if pd.isna(spx["last"]) else round(float(spx["last"]), 2), "delta": _format_signed(spx["pct"], 2, "%")},
        {"asset": "HY利差", "value": None if pd.isna(hy["last"]) else round(float(hy["last"]), 2), "delta": _format_signed(hy["diff"], 2)},
        {"asset": "VIX", "value": None if pd.isna(vix["last"]) else round(float(vix["last"]), 2), "delta": _format_combined_change(vix["diff"], vix["pct"], diff_digits=2, pct_digits=2)},
        {"asset": "WTI", "value": None if pd.isna(wti["last"]) else round(float(wti["last"]), 2), "delta": _format_signed(wti["pct"], 2, "%")},
    ]
    return {"cards": cards, "verdicts": verdicts, "rawRows": raw_rows}


def _build_reference_panels(df_all: pd.DataFrame, total_series: pd.Series) -> Dict[str, Any]:
    left_status = {"label": "⚪ NEUTRAL", "tone": "neutral", "score": 0}
    if all(col in df_all.columns for col in ["WTREGEN", "SOFR", "RPONTSYD"]):
        tga = df_all["WTREGEN"].dropna()
        sofr = df_all["SOFR"].dropna()
        srf = df_all["RPONTSYD"].dropna()
        if (not tga.empty) and (not sofr.empty) and (not srf.empty):
            latest_tga = float(tga.iloc[-1])
            prev_tga = float(tga.iloc[-8]) if len(tga) > 8 else float(tga.iloc[0])
            latest_srf = float(srf.iloc[-1])
            latest_sofr = float(sofr.iloc[-1])
            prev_sofr = float(sofr.iloc[-30]) if len(sofr) > 30 else float(sofr.iloc[0])
            score = 0
            tga_diff = (latest_tga - prev_tga) / 1000.0
            if tga_diff < -10:
                score += 1
            elif tga_diff > 10:
                score -= 1
            if latest_tga >= 900:
                score -= 3
            elif latest_tga >= 850:
                score -= 2
            elif latest_tga >= 800:
                score -= 1
            if latest_srf < 5:
                score += 1
            elif latest_srf > 50:
                score -= 2
            sofr_diff = latest_sofr - prev_sofr
            if sofr_diff < -0.05:
                score += 1
            elif sofr_diff > 0.10:
                score -= 1
            if score >= 1:
                left_status = {"label": f"🟢 NET INFLOW [积分:{score}]", "tone": "positive", "score": score}
            elif score <= -1:
                left_status = {"label": f"🔴 NET OUTFLOW [积分:{score}]", "tone": "negative", "score": score}
            else:
                left_status = {"label": "⚪ NEUTRAL", "tone": "neutral", "score": score}

    reference_window = df_all[df_all.index >= "2023-01-01"].copy()
    valid_window = df_all[df_all.index >= (df_all.index.max() - pd.Timedelta(days=1080))].copy() if not df_all.empty else pd.DataFrame()
    score_window = total_series[total_series.index >= (total_series.index.max() - pd.Timedelta(days=1080))] if not total_series.empty else pd.Series(dtype=float)

    return {
        "liquidityMonitor": {
            "status": left_status,
            "series": {
                "tga": _series_points(reference_window["WTREGEN"] / 1000.0, limit=800) if "WTREGEN" in reference_window.columns else [],
                "sofr": _series_points(reference_window["SOFR"], limit=800) if "SOFR" in reference_window.columns else [],
                "srf": _series_points(reference_window["RPONTSYD"], limit=800) if "RPONTSYD" in reference_window.columns else [],
            },
        },
        "truthTest": {
            "series": {
                "score": _series_points(score_window, limit=800),
                "spx": _series_points(valid_window["SP500"], limit=800) if "SP500" in valid_window.columns else [],
                "btc": _series_points(valid_window["CBBTCUSD"], limit=800) if "CBBTCUSD" in valid_window.columns else [],
            },
        },
    }


def _build_risk_radar(
    df_all: pd.DataFrame,
    module_frames: Dict[str, pd.DataFrame],
    module_scores: Dict[str, float],
) -> Dict[str, Any]:
    items: List[Dict[str, str]] = []

    def add_risk(level: str, title: str, trigger: str, off: str) -> None:
        items.append({"level": level, "title": title, "trigger": trigger, "off": off})

    tga = _safe_float(df_all.get("WTREGEN", pd.Series(dtype=float)).dropna().iloc[-1] if "WTREGEN" in df_all.columns and not df_all["WTREGEN"].dropna().empty else np.nan)
    tga_b = tga / 1000.0 if tga > 10000 else tga
    if not pd.isna(tga_b) and tga_b >= 800:
        penalty = "0.5x" if tga_b >= 900 else ("0.6x" if tga_b >= 850 else "0.8x")
        add_risk("red" if tga_b >= 900 else "orange", f"A模块 (TGA惩罚): 流动性抽水加剧，惩罚系数 {penalty}", f"TGA 水位 {tga_b:.0f}B >= 800B。", "TGA 重新回落至 <800B 且 4周变化转负。")
    if module_scores.get("A", 50.0) < 40:
        add_risk("red", f"A模块 (流动性): 整体流动性偏紧，得分 {module_scores['A']:.1f}", "A模块得分跌破 40。", "A模块得分连续两周回到 >=45。")

    if "SOFR" in df_all.columns and "IORB" in df_all.columns and not df_all["SOFR"].dropna().empty and not df_all["IORB"].dropna().empty:
        sofr = float(df_all["SOFR"].dropna().iloc[-1])
        iorb = float(df_all["IORB"].dropna().iloc[-1])
        if "RPONTSYD" in df_all.columns and not df_all["RPONTSYD"].dropna().empty and float(df_all["RPONTSYD"].dropna().iloc[-1]) > 10:
            add_risk("red", "B模块 (资金面): 应急融资启动", f"SRF 使用量 {float(df_all['RPONTSYD'].dropna().iloc[-1]):.1f}B > 10B。", "SRF 回落到 5B 以下并维持 3 个交易日。")
        elif sofr > iorb:
            add_risk("orange", "B模块 (资金面): 资金价格偏贵", f"SOFR {sofr:.2f}% 高于 IORB {iorb:.2f}%。", "SOFR 回落至 IORB 下方并持续 2-3 天。")

    frame_c = module_frames.get("c", pd.DataFrame())
    if not frame_c.empty and "Penalty_Factor" in frame_c.columns and float(frame_c["Penalty_Factor"].dropna().iloc[-1]) < 1.0:
        add_risk("red", "C模块 (国债): 长端利率急涨，估值压力增加", f"长端斜率惩罚触发，Penalty={float(frame_c['Penalty_Factor'].dropna().iloc[-1]):.1f}x。", "Penalty 恢复到 1.0x 且 10Y 60日斜率回到温和区间。")
    elif "T10Y2Y" in df_all.columns and not df_all["T10Y2Y"].dropna().empty and float(df_all["T10Y2Y"].dropna().iloc[-1]) < -0.5:
        add_risk("orange", "C模块 (国债): 曲线深度倒挂", f"2s10s={float(df_all['T10Y2Y'].dropna().iloc[-1]):.2f} (< -0.50)。", "2s10s 回升至 > -0.20 且保持。")

    if "DFII10" in df_all.columns and not df_all["DFII10"].dropna().empty and float(df_all["DFII10"].dropna().iloc[-1]) > 2.0:
        add_risk("orange", "D模块 (实利): 实际利率偏高", f"10Y 实际利率 {float(df_all['DFII10'].dropna().iloc[-1]):.2f}% > 2.0%。", "10Y 实际利率回落至 <1.8%。")

    if "DEXJPUS" in df_all.columns and df_all["DEXJPUS"].dropna().shape[0] > 5:
        usd_jpy_move = float(df_all["DEXJPUS"].pct_change(5).dropna().iloc[-1])
        if usd_jpy_move < -0.03:
            add_risk("red", "E模块 (汇率): 套息退潮风险", f"USDJPY 5日变动 {usd_jpy_move * 100:.1f}% < -3%。", "USDJPY 波动收敛且回到 -1%~+1% 区间。")

    if "DCOILWTICO" in df_all.columns and df_all["DCOILWTICO"].dropna().shape[0] > 20:
        oil_move = float(df_all["DCOILWTICO"].pct_change(20).dropna().iloc[-1])
        if oil_move > 0.15:
            add_risk("orange", "E模块 (能源): 通胀再抬头风险", f"WTI 20日涨幅 {oil_move * 100:.1f}% > 15%。", "WTI 20日涨幅回落至 <8%。")

    frame_f = module_frames.get("f", pd.DataFrame())
    if not frame_f.empty and module_scores.get("F", 50.0) < 40:
        hy_val = float(frame_f["HY_Spread"].dropna().iloc[-1]) if "HY_Spread" in frame_f.columns and not frame_f["HY_Spread"].dropna().empty else np.nan
        baa_val = float(frame_f["BAA10Y"].dropna().iloc[-1]) if "BAA10Y" in frame_f.columns and not frame_f["BAA10Y"].dropna().empty else np.nan
        add_risk("red", "F模块 (信用): 信用压力升温", f"HY={hy_val:.2f}% / BAA10Y={baa_val:.2f}%。", "HY 低于 5% 且 BAA10Y 低于 2.5%。")

    frame_g = module_frames.get("g", pd.DataFrame())
    if not frame_g.empty and (
        module_scores.get("G", 50.0) < 40
        or ("VIX" in frame_g.columns and not frame_g["VIX"].dropna().empty and float(frame_g["VIX"].dropna().iloc[-1]) > 25)
        or ("VIX_VXV" in frame_g.columns and not frame_g["VIX_VXV"].dropna().empty and float(frame_g["VIX_VXV"].dropna().iloc[-1]) > 1.0)
    ):
        vix_val = float(frame_g["VIX"].dropna().iloc[-1]) if "VIX" in frame_g.columns and not frame_g["VIX"].dropna().empty else np.nan
        term_val = float(frame_g["VIX_VXV"].dropna().iloc[-1]) if "VIX_VXV" in frame_g.columns and not frame_g["VIX_VXV"].dropna().empty else np.nan
        add_risk("red", "G模块 (风险偏好): 风险厌恶升温", f"VIX={vix_val:.1f} / VIX/VXV={term_val:.2f}。", "VIX 回落至 20 以下且 VIX/VXV 低于 0.95。")

    critical = len([item for item in items if item["level"] == "red"])
    return {"items": items, "criticalCount": critical, "totalCount": len(items)}


def _module_description(module_id: str, latest_raw: pd.Series, score: float) -> str:
    if module_id == "A":
        tga = _safe_float(latest_raw.get("WTREGEN", np.nan))
        tga_b = tga / 1000 if tga > 10000 else tga
        if not pd.isna(tga_b) and tga_b >= 800:
            return f"TGA水位偏高 ({tga_b:.0f}B)，流动性仍受抽水约束。"
        return "净流动性边际改善，吸收压力处于可控区间。"
    if module_id == "B":
        sofr = _safe_float(latest_raw.get("SOFR", np.nan))
        iorb = _safe_float(latest_raw.get("IORB", np.nan))
        if not pd.isna(sofr) and not pd.isna(iorb) and sofr > iorb:
            return "SOFR高于IORB，资金摩擦仍有抬升迹象。"
        return "政策走廊运转平稳，资金面摩擦可控。"
    if module_id == "C":
        s2s10 = _safe_float(latest_raw.get("T10Y2Y", np.nan))
        if not pd.isna(s2s10) and s2s10 < 0:
            return "期限结构仍有倒挂，增长预期修复不充分。"
        return "期限结构趋于正常化，利率曲线压力下降。"
    if module_id == "D":
        be = _safe_float(latest_raw.get("T10YIE", np.nan))
        if not pd.isna(be):
            return f"通胀预期约 {be:.2f}%，实际利率维持区间波动。"
        return "实际利率与通胀预期整体平稳。"
    if module_id == "E":
        dxy = _safe_float(latest_raw.get("DXY", np.nan))
        if not pd.isna(dxy):
            return f"美元指数 {dxy:.2f}，外部冲击处于中性偏缓状态。"
        return "外部冲击压力中性，汇率与能源波动可控。"
    if module_id == "F":
        hy = _safe_float(latest_raw.get("BAMLH0A0HYM2", np.nan))
        if not pd.isna(hy) and hy > 6:
            return "高收益利差偏高，信用压力仍需关注。"
        return "信用条件中性，风险溢价未显著恶化。"
    if module_id == "G":
        return "风险偏好由波动率与动量共同驱动，需关注趋势持续性。"
    return f"{module_id} 模块得分已由 Python 引擎实时计算。"


def _ensure_df(frame: pd.DataFrame, cols: List[str]) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    if any(col not in frame.columns for col in cols):
        return pd.DataFrame()
    return frame.dropna(subset=cols).copy()


def _rolling_percentile(series: pd.Series, window: int = 156, min_periods: int = 20) -> pd.Series:
    return series.rolling(window, min_periods=min_periods).apply(
        lambda s: s.rank(pct=True).iloc[-1],
        raw=False,
    ) * 100


def _rolling_percentile_long(series: pd.Series, window: int = 756, min_periods: int = 30) -> pd.Series:
    return series.rolling(window, min_periods=min_periods).apply(
        lambda s: s.rank(pct=True).iloc[-1],
        raw=False,
    ) * 100


def _get_slope_score(series: pd.Series, target: float, tol: float) -> pd.Series:
    dev = (series - target).abs()
    return (100 - (dev / tol * 80)).clip(0, 100)


def _compute_module_frames(df_all: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    frames: Dict[str, pd.DataFrame] = {}

    # A
    df_raw_a = df_all[df_all.index >= "2020-01-01"].copy()
    df_a = pd.DataFrame()
    if not df_raw_a.empty and all(col in df_raw_a.columns for col in ["WALCL", "WTREGEN", "RRPONTSYD", "WRESBAL"]):
        df_a["WALCL"] = df_raw_a["WALCL"].resample("W-WED").last()
        df_a["WTREGEN"] = df_raw_a["WTREGEN"].resample("W-WED").last()
        df_a["RRPONTSYD"] = df_raw_a["RRPONTSYD"].resample("W-WED").last()
        df_a["WRESBAL"] = df_raw_a["WRESBAL"].resample("W-WED").last()
        df_a = df_a.ffill().dropna()

        def get_tga_penalty(tga_val: float) -> float:
            tga_b = tga_val / 1000 if tga_val > 10000 else tga_val
            if tga_b < 800:
                return 1.0
            if tga_b < 850:
                return 0.8
            if tga_b < 900:
                return 0.6
            return 0.5

        def get_tga_trend_penalty(delta_b: float) -> float:
            if delta_b <= 0:
                return 1.0
            if delta_b <= 50:
                return 0.95
            if delta_b <= 100:
                return 0.9
            if delta_b <= 150:
                return 0.8
            return 0.7

        tga_b = df_a["WTREGEN"].where(df_a["WTREGEN"] <= 10000, df_a["WTREGEN"] / 1000)
        df_a["TGA_Penalty_Level"] = tga_b.apply(get_tga_penalty)
        df_a["TGA_Change_4W"] = tga_b.diff(4).fillna(0)
        df_a["TGA_Penalty_Trend"] = df_a["TGA_Change_4W"].apply(get_tga_trend_penalty)
        df_a["TGA_Penalty_Total"] = df_a["TGA_Penalty_Level"] * df_a["TGA_Penalty_Trend"]
        df_a["RRP_Clean"] = np.where(df_a["RRPONTSYD"].mean() < 10000, df_a["RRPONTSYD"] * 1000, df_a["RRPONTSYD"])
        df_a["Net_Liquidity"] = df_a["WALCL"] - df_a["WTREGEN"] - df_a["RRP_Clean"]
        df_a["Liquidity_Sink"] = df_a["WTREGEN"] + df_a["RRP_Clean"]
        df_a["Liquidity_Sink_Ratio"] = (df_a["Liquidity_Sink"] / df_a["WALCL"]).clip(lower=0)

        def sink_penalty_ratio(r: float) -> float:
            if r < 0.10:
                return 1.0
            if r < 0.15:
                return 0.9
            if r < 0.20:
                return 0.8
            if r < 0.25:
                return 0.7
            return 0.6

        df_a["Sink_Penalty"] = df_a["Liquidity_Sink_Ratio"].apply(sink_penalty_ratio)
        df_a["Score_NetLiq"] = _rolling_percentile(df_a["Net_Liquidity"].diff(13))
        df_a["Score_TGA"] = _rolling_percentile((-df_a["WTREGEN"]).diff(13))
        df_a["Score_RRP"] = _rolling_percentile((-df_a["RRP_Clean"]).diff(13))
        df_a["Score_Reserves"] = _rolling_percentile(df_a["WRESBAL"].diff(13))
        df_a["Score_NetLiq_Adj"] = df_a["Score_NetLiq"] * df_a["Sink_Penalty"]
        df_a["Total_Score"] = (
            df_a["Score_NetLiq_Adj"] * 0.45
            + df_a["Score_TGA"] * 0.2
            + df_a["Score_RRP"] * 0.25
            + df_a["Score_Reserves"] * 0.1
        ) * df_a["TGA_Penalty_Total"]
    frames["a"] = df_a

    # B
    df_b = _ensure_df(df_all, ["SOFR", "IORB", "RRPONTSYAWARD", "TGCRRATE", "RPONTSYD"])
    if not df_b.empty:
        df_b["SOFR_MA13"] = df_b["SOFR"].rolling(65, min_periods=1).mean()
        df_b["SOFR_Trend"] = df_b["SOFR_MA13"].diff(21)
        df_b["Score_Trend"] = df_b["SOFR_Trend"].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100

        def get_regime_bonus(sofr: float) -> int:
            if sofr < 1.0:
                return 20
            if sofr < 2.5:
                return 10
            if sofr > 5.0:
                return -20
            if sofr > 4.0:
                return -10
            return 0

        df_b["Regime_Bonus"] = df_b["SOFR"].apply(get_regime_bonus)
        df_b["Score_Policy"] = (df_b["Score_Trend"] + df_b["Regime_Bonus"]).clip(0, 100)
        df_b["Corridor_Width"] = (df_b["IORB"] - df_b["RRPONTSYAWARD"]).abs().clip(lower=0.05)
        df_b["F1_Ratio"] = (df_b["SOFR"] - df_b["IORB"]).clip(lower=0) / df_b["Corridor_Width"]
        df_b["F2_Ratio"] = (df_b["SOFR"] - df_b["RRPONTSYAWARD"]).abs() / df_b["Corridor_Width"]
        df_b["F3_Ratio"] = (df_b["TGCRRATE"] - df_b["SOFR"]).abs() / df_b["Corridor_Width"]

        def ratio_to_score(series: pd.Series, max_ratio_series: pd.Series) -> pd.Series:
            denom = max_ratio_series.replace(0, np.nan).ffill().fillna(0.5)
            scaled = (series / denom).clip(lower=0, upper=1)
            return (1 - scaled**1.6) * 100

        df_b["F1_Max"] = df_b["F1_Ratio"].rolling(180, min_periods=60).quantile(0.85)
        df_b["F2_Max"] = df_b["F2_Ratio"].rolling(180, min_periods=60).quantile(0.85)
        df_b["F3_Max"] = df_b["F3_Ratio"].rolling(180, min_periods=60).quantile(0.85)
        df_b["Score_F1"] = ratio_to_score(df_b["F1_Ratio"], df_b["F1_Max"])
        df_b["Score_F2"] = ratio_to_score(df_b["F2_Ratio"], df_b["F2_Max"])
        df_b["Score_F3"] = ratio_to_score(df_b["F3_Ratio"], df_b["F3_Max"])
        df_b["SRF_Penalty_Base"] = 100 / (1 + np.exp(-0.6 * (df_b["RPONTSYD"] - 5)))
        df_b["SRF_Accel"] = df_b["RPONTSYD"].diff(3).clip(lower=0)
        df_b["SRF_Penalty"] = (df_b["SRF_Penalty_Base"] + (df_b["SRF_Accel"] / 20).clip(0, 1) * 35).clip(0, 100)
        df_b["Score_SRF"] = 100 - df_b["SRF_Penalty"]
        df_b["SRF_Weight"] = 0.10 + 0.15 * (df_b["SRF_Penalty"] / 100)
        residual = 1 - df_b["SRF_Weight"]
        df_b["Score_Friction"] = (
            df_b["Score_F1"] * residual * 0.4
            + df_b["Score_F2"] * residual * 0.3
            + df_b["Score_F3"] * residual * 0.3
            + df_b["Score_SRF"] * df_b["SRF_Weight"]
        )
        df_b["Total_Score"] = (df_b["Score_Policy"] * 0.40 + df_b["Score_Friction"] * 0.60).clip(0, 100)
    frames["b"] = df_b

    # C
    df_c = _ensure_df(df_all, ["DGS10", "DGS2", "DGS30", "T10Y2Y", "T10Y3M"])
    if not df_c.empty:
        df_c["Score_10Y"] = df_c["DGS10"].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_c["Score_2Y"] = df_c["DGS2"].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_c["Score_30Y"] = df_c["DGS30"].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_c["Score_Curve_2s10s"] = _get_slope_score(df_c["T10Y2Y"], 0.5, 1.5)
        df_c["Score_Curve_3m10s"] = _get_slope_score(df_c["T10Y3M"], 0.75, 2.0)
        df_c["Total_Score1"] = (
            df_c["Score_Curve_2s10s"] * 0.3
            + df_c["Score_Curve_3m10s"] * 0.3
            + df_c["Score_10Y"] * 0.2
            + df_c["Score_2Y"] * 0.1
            + df_c["Score_30Y"] * 0.1
        )
        slope_10 = df_c["DGS10"].diff(60)
        slope_30 = df_c["DGS30"].diff(60)
        df_c["Max_Slope"] = pd.concat([slope_10, slope_30], axis=1).max(axis=1)

        def get_slope_penalty(s: float) -> float:
            if s > 0.50:
                return 0.2
            if s > 0.30:
                return 0.6
            if s > 0.15:
                return 0.8
            return 1.0

        df_c["Penalty_Factor"] = df_c["Max_Slope"].apply(get_slope_penalty)
        df_c["Total_Score"] = (df_c["Total_Score1"] * df_c["Penalty_Factor"]).clip(0, 100)
    frames["c"] = df_c

    # D
    df_d = _ensure_df(df_all, ["DFII10", "DFII5", "T10YIE"])
    if not df_d.empty:
        df_d["Score_Real_10Y"] = df_d["DFII10"].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_d["Score_Real_5Y"] = df_d["DFII5"].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_d["Score_Breakeven"] = _get_slope_score(df_d["T10YIE"], 2.1, 0.6)
        df_d["Total_Score"] = (
            df_d["Score_Real_10Y"] * 0.4 + df_d["Score_Real_5Y"] * 0.3 + df_d["Score_Breakeven"] * 0.3
        ).clip(0, 100)
    frames["d"] = df_d

    # E
    df_e = _ensure_df(df_all, ["DTWEXBGS", "DXY", "DEXJPUS", "IRSTCI01JPM156N", "DCOILWTICO", "DHHNGSP"])
    if not df_e.empty:
        df_e["Chg_USD"] = df_e["DTWEXBGS"].pct_change(63)
        df_e["Score_USD"] = (1 - df_e["Chg_USD"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Chg_DXY"] = df_e["DXY"].pct_change(63)
        df_e["Score_DXY"] = (1 - df_e["Chg_DXY"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Yen_Appreciation"] = -1 * df_e["DEXJPUS"].pct_change(63)
        df_e["Score_Yen_FX"] = (1 - df_e["Yen_Appreciation"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Score_BoJ_Rate"] = (1 - df_e["IRSTCI01JPM156N"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Score_Yen_Total"] = df_e["Score_Yen_FX"] * 0.7 + df_e["Score_BoJ_Rate"] * 0.3
        df_e["Chg_Oil"] = df_e["DCOILWTICO"].pct_change(63)
        df_e["Score_Oil_Long"] = (1 - df_e["Chg_Oil"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Score_Oil"] = df_e["Score_Oil_Long"]
        df_e["Chg_Gas"] = df_e["DHHNGSP"].pct_change(63)
        df_e["Score_Gas"] = (1 - df_e["Chg_Gas"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Score_Energy_Base"] = df_e["Score_Oil_Long"] * 0.5 + df_e["Score_Gas"] * 0.5
        oil_shock = _compute_oil_shock_signal(df_all)
        df_e["Oil_Shock_Adjustment"] = 0.0
        df_e["Oil_Shock_Label"] = "未触发"
        df_e["Oil_Shock_Reason"] = "日度波动仍处于正常区间"
        df_e["Oil_Shock_Move_Pct"] = np.nan
        last_idx = df_e.index[-1]
        df_e.loc[last_idx, "Oil_Shock_Adjustment"] = oil_shock["adjustment"]
        df_e.loc[last_idx, "Oil_Shock_Label"] = oil_shock["label"]
        df_e.loc[last_idx, "Oil_Shock_Reason"] = oil_shock["reason"]
        df_e.loc[last_idx, "Oil_Shock_Move_Pct"] = oil_shock["move_pct"]
        df_e["Score_Energy"] = (df_e["Score_Energy_Base"] + df_e["Oil_Shock_Adjustment"]).clip(0, 100)
        df_e["Total_Score"] = (
            df_e["Score_USD"] * 0.20
            + df_e["Score_DXY"] * 0.20
            + df_e["Score_Yen_Total"] * 0.3
            + df_e["Score_Energy"] * 0.3
        ).clip(0, 100)
    frames["e"] = df_e

    # F
    df_f = _ensure_df(df_all, ["BAMLH0A0HYM2", "BAA10Y"])
    if not df_f.empty:
        df_f["HY_Spread"] = df_f["BAMLH0A0HYM2"]
        df_f["Score_HY_Level"] = 100 - _rolling_percentile_long(df_f["HY_Spread"])
        df_f["Score_HY_Trend"] = _rolling_percentile_long(-df_f["HY_Spread"].diff(13))
        df_f["Score_BAA_Level"] = 100 - _rolling_percentile_long(df_f["BAA10Y"])
        df_f["Total_Score"] = (
            df_f["Score_HY_Level"] * 0.5 + df_f["Score_HY_Trend"] * 0.3 + df_f["Score_BAA_Level"] * 0.2
        ).clip(0, 100)
    frames["f"] = df_f

    # G
    df_g = pd.DataFrame(index=df_all.index)
    if "SP500" in df_all.columns:
        df_g["SP500"] = df_all["SP500"]
    if "VIX_YH" in df_all.columns or "VIXCLS" in df_all.columns:
        vix = df_all.get("VIX_YH", pd.Series(index=df_all.index, dtype=float)).combine_first(
            df_all.get("VIXCLS", pd.Series(index=df_all.index, dtype=float))
        )
        df_g["VIX"] = vix
    if "VXV_YH" in df_all.columns or "VXVCLS" in df_all.columns:
        vxv = df_all.get("VXV_YH", pd.Series(index=df_all.index, dtype=float)).combine_first(
            df_all.get("VXVCLS", pd.Series(index=df_all.index, dtype=float))
        )
        df_g["VXV"] = vxv
    if set(["SP500", "VIX", "VXV"]).issubset(df_g.columns):
        df_g = df_g.dropna(subset=["SP500", "VIX", "VXV"]).copy()
        if not df_g.empty:
            df_g["VIX_VXV"] = df_g["VIX"] / df_g["VXV"]
            df_g["Score_VIX"] = (100 - _rolling_percentile_long(df_g["VIX"])).clip(0, 100)
            df_g["Score_Term"] = (100 - _rolling_percentile_long(df_g["VIX_VXV"])).clip(0, 100)
            df_g["Score_Mom"] = _rolling_percentile_long(df_g["SP500"].diff(65)).clip(0, 100)
            df_g["Total_Score"] = (
                df_g["Score_Term"] * 0.4 + df_g["Score_VIX"] * 0.3 + df_g["Score_Mom"] * 0.3
            ).clip(0, 100)
    else:
        df_g = pd.DataFrame()
    frames["g"] = df_g

    return frames


def _factor_from_col(
    frame: pd.DataFrame,
    col: str,
    name: str,
    contribution: str,
    scale: float = 1.0,
    clamp_max: float = 100.0,
) -> Dict[str, Any]:
    if frame is None or frame.empty or col not in frame.columns:
        return {"name": name, "score": 50.0, "change": 0.0, "contribution": contribution}
    s = frame[col].dropna()
    if s.empty:
        return {"name": name, "score": 50.0, "change": 0.0, "contribution": contribution}
    latest_raw = float(s.iloc[-1]) * scale
    prev_raw = _prev_value(s, days=7) * scale
    score = float(np.clip(latest_raw, 0, clamp_max))
    change = latest_raw - prev_raw
    return {"name": name, "score": round(score, 1), "change": round(change, 1), "contribution": contribution}


def _build_module_factors(module_id: str, frame: pd.DataFrame, weight_text: str) -> List[Dict[str, Any]]:
    if module_id == "A":
        return [
            _factor_from_col(frame, "Score_NetLiq_Adj", "Net Liquidity", "45%"),
            _factor_from_col(frame, "Score_TGA", "TGA", "20%"),
            _factor_from_col(frame, "Score_RRP", "ON RRP", "25%"),
            _factor_from_col(frame, "Score_Reserves", "Reserves", "10%"),
            _factor_from_col(frame, "TGA_Penalty_Total", "TGA Penalty", "Penalty", scale=100.0),
        ]
    if module_id == "B":
        return [
            _factor_from_col(frame, "Score_Policy", "SOFR Policy", "40%"),
            _factor_from_col(frame, "Score_Friction", "Friction Composite", "60%"),
            _factor_from_col(frame, "Score_F1", "F1 Corridor", "Flow"),
            _factor_from_col(frame, "Score_F2", "F2 Corridor", "Flow"),
            _factor_from_col(frame, "Score_SRF", "SRF", "Penalty"),
        ]
    if module_id == "C":
        return [
            _factor_from_col(frame, "Score_Curve_2s10s", "2s10s Curve", "30%"),
            _factor_from_col(frame, "Score_Curve_3m10s", "3m10s Curve", "30%"),
            _factor_from_col(frame, "Score_10Y", "10Y Level", "20%"),
            _factor_from_col(frame, "Score_2Y", "2Y Level", "10%"),
            _factor_from_col(frame, "Penalty_Factor", "Curve Penalty", "Penalty", scale=100.0),
        ]
    if module_id == "D":
        return [
            _factor_from_col(frame, "Score_Real_10Y", "10Y Real Rate", "40%"),
            _factor_from_col(frame, "Score_Real_5Y", "5Y Real Rate", "30%"),
            _factor_from_col(frame, "Score_Breakeven", "10Y Breakeven", "30%"),
        ]
    if module_id == "E":
        return [
            _factor_from_col(frame, "Score_USD", "Broad USD", "20%"),
            _factor_from_col(frame, "Score_DXY", "DXY", "20%"),
            _factor_from_col(frame, "Score_Yen_Total", "Yen / Carry", "30%"),
            _factor_from_col(frame, "Score_Energy", "Energy", "30%"),
        ]
    if module_id == "F":
        return [
            _factor_from_col(frame, "Score_HY_Level", "HY Spread Level", "50%"),
            _factor_from_col(frame, "Score_HY_Trend", "HY Trend", "30%"),
            _factor_from_col(frame, "Score_BAA_Level", "BAA10Y", "20%"),
        ]
    if module_id == "G":
        return [
            _factor_from_col(frame, "Score_Term", "VIX/VXV Term", "40%"),
            _factor_from_col(frame, "Score_VIX", "VIX Level", "30%"),
            _factor_from_col(frame, "Score_Mom", "Risk Momentum", "30%"),
        ]
    return []


def _aligned_points(series: pd.Series, base_points: List[Dict[str, Any]], fallback: float = 50.0) -> List[Dict[str, Any]]:
    if not base_points:
        return []
    base_idx = pd.to_datetime([point["date"] for point in base_points])
    if series is None or series.dropna().empty:
        values = pd.Series([fallback] * len(base_points), index=base_idx)
    else:
        values = series.reindex(base_idx, method="ffill").fillna(fallback)
    return [{"date": p["date"], "value": round(float(values.iloc[i]), 2)} for i, p in enumerate(base_points)]


def _build_module_auxiliary(module_id: str, frame: pd.DataFrame, score_points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    overlays: List[Dict[str, Any]] = [
        {
            "name": "Baseline",
            "points": [{"date": p["date"], "value": 50.0} for p in score_points],
            "color": "#94a3b8",
        }
    ]

    column_map = {
        "A": [("Score_NetLiq_Adj", "Net Liquidity", "#06b6d4"), ("Score_TGA", "TGA", "#0ea5e9")],
        "B": [("Score_Policy", "SOFR Policy", "#2563eb"), ("Score_Friction", "Friction", "#8b5cf6")],
        "C": [("Score_Curve_2s10s", "2s10s", "#f59e0b"), ("Score_Curve_3m10s", "3m10s", "#ef4444")],
        "D": [("Score_Real_10Y", "Real 10Y", "#2563eb"), ("Score_Breakeven", "Breakeven", "#ec4899")],
        "E": [("Score_DXY", "DXY Score", "#10b981"), ("Score_Energy", "Energy Score", "#f97316")],
        "F": [("Score_HY_Level", "HY Level", "#ef4444"), ("Score_HY_Trend", "HY Trend", "#dc2626")],
        "G": [("Score_Term", "VIX/VXV", "#0ea5e9"), ("Score_VIX", "VIX Score", "#38bdf8")],
    }
    for col, name, color in column_map.get(module_id, []):
        if frame is not None and not frame.empty and col in frame.columns:
            overlays.append({"name": name, "points": _aligned_points(frame[col], score_points), "color": color})

    return overlays


def _snapshot_from_series(
    label: str,
    series: Optional[pd.Series],
    value_suffix: str = "",
    value_digits: int = 2,
    delta_mode: str = "diff",
    delta_scale: float = 1.0,
    delta_suffix: str = "",
    inverse_state: bool = False,
) -> Dict[str, Any]:
    if series is None:
        return {"label": label, "value": "-", "delta": "-", "state": "neutral"}
    stats = _latest_and_diff(series)
    if pd.isna(stats["last"]):
        return {"label": label, "value": "-", "delta": "-", "state": "neutral"}

    if delta_mode == "pct":
        delta_val = stats["pct"]
    else:
        delta_val = stats["diff"] * delta_scale
    state = _state_from_delta(delta_val if not inverse_state else -delta_val)
    return {
        "label": label,
        "value": f"{stats['last']:.{value_digits}f}{value_suffix}",
        "delta": _format_signed(delta_val, digits=2, suffix=delta_suffix),
        "state": state,
    }


def _build_module_snapshots(
    module_id: str,
    df_all: pd.DataFrame,
    frame: pd.DataFrame,
    latest_score: float,
    wow_change: float,
    updated_date: str,
) -> List[Dict[str, Any]]:
    snapshots: List[Dict[str, Any]] = [
        {
            "label": f"{module_id} 模块当前分数",
            "value": f"{latest_score:.1f}",
            "delta": _format_signed(wow_change),
            "state": _state_from_delta(wow_change),
        }
    ]

    if module_id == "D":
        snapshots.append(_snapshot_from_series("10Y实际利率", df_all.get("DFII10"), value_suffix="%", inverse_state=True))
        snapshots.append(_snapshot_from_series("10Y通胀预期", df_all.get("T10YIE"), value_suffix="%"))
        snapshots.append(_snapshot_from_series("5Y实际利率", df_all.get("DFII5"), value_suffix="%", inverse_state=True))
    elif module_id == "E":
        snapshots.append(_snapshot_from_series("DXY", df_all.get("DXY"), delta_mode="pct", delta_suffix="%", inverse_state=True))
        snapshots.append(_snapshot_from_series("Broad USD", df_all.get("DTWEXBGS"), delta_mode="pct", delta_suffix="%", inverse_state=True))
        snapshots.append(
            _snapshot_from_series(
                "WTI",
                _merged_series(df_all, "WTI_YH", "DCOILWTICO"),
                delta_mode="pct",
                delta_suffix="%",
                inverse_state=True,
            )
        )
        if not frame.empty and "Oil_Shock_Adjustment" in frame.columns:
            shock_series = frame["Oil_Shock_Adjustment"].dropna()
            adj = _safe_float(shock_series.iloc[-1] if not shock_series.empty else 0.0, 0.0)
            label = (
                str(frame["Oil_Shock_Label"].dropna().iloc[-1])
                if "Oil_Shock_Label" in frame.columns and not frame["Oil_Shock_Label"].dropna().empty
                else "未触发"
            )
            move_pct = (
                _safe_float(frame["Oil_Shock_Move_Pct"].dropna().iloc[-1])
                if "Oil_Shock_Move_Pct" in frame.columns and not frame["Oil_Shock_Move_Pct"].dropna().empty
                else np.nan
            )
            delta_text = _format_signed(adj, 0, "分")
            if not pd.isna(move_pct):
                delta_text = f"{delta_text} · {_format_signed(move_pct, 2, '%')}"
            snapshots.append(
                {
                    "label": "Oil Shock",
                    "value": label,
                    "delta": delta_text,
                    "state": _state_from_delta(adj),
                }
            )
    elif module_id == "F":
        snapshots.append(_snapshot_from_series("HY利差", df_all.get("BAMLH0A0HYM2"), value_suffix="%", inverse_state=True))
        snapshots.append(_snapshot_from_series("BAA10Y", df_all.get("BAA10Y"), value_suffix="%", inverse_state=True))
        snapshots.append(_snapshot_from_series("HY趋势分", frame.get("Score_HY_Trend") if not frame.empty else None))
    elif module_id == "G":
        snapshots.append(_snapshot_from_series("VIX", frame.get("VIX") if not frame.empty else None, inverse_state=True))
        snapshots.append(_snapshot_from_series("VIX/VXV", frame.get("VIX_VXV") if not frame.empty else None, inverse_state=True))
        snapshots.append(_snapshot_from_series("动量分", frame.get("Score_Mom") if not frame.empty else None))
    else:
        snapshots.append(
            {
                "label": "近四周均值",
                "value": f"{float(frame['Total_Score'].dropna().tail(20).mean()):.1f}" if (not frame.empty and "Total_Score" in frame.columns) else "-",
                "delta": "稳定",
                "state": "neutral",
            }
        )
        snapshots.append(
            {
                "label": "13周波动(σ)",
                "value": (
                    f"{float(frame['Total_Score'].dropna().diff().tail(65).std(ddof=0)):.2f}"
                    if (not frame.empty and "Total_Score" in frame.columns and frame["Total_Score"].dropna().shape[0] > 2)
                    else "-"
                ),
                "delta": "score pt",
                "state": "neutral",
            }
        )

    score_state = _score_state(latest_score)
    snapshots.append(
        {
            "label": "分数状态",
            "value": score_state["label"],
            "delta": f"{latest_score:.1f} / 100",
            "state": score_state["state"],
        }
    )
    return snapshots


def build_macro_payload() -> Dict[str, Any]:
    fred_api_key = os.getenv("FRED_API_KEY", API_KEY)
    start_date = os.getenv("MACRO_START_DATE", "2010-01-01")
    warnings: List[str] = []

    loader = getattr(get_mixed_data, "__wrapped__", get_mixed_data)
    try:
        df_all = loader(fred_api_key, SERIES_IDS, start_date=start_date)
    except Exception as exc:
        warnings.append(f"data loader error: {exc}")
        df_all = pd.DataFrame()
    fetch_meta = get_last_fetch_meta()

    if df_all is None or df_all.empty:
        warnings.append("python data engine returned empty dataset")
        fallback_idx = pd.DatetimeIndex([pd.Timestamp.utcnow().normalize()])
        df_all = pd.DataFrame(index=fallback_idx)

    df_all = df_all.sort_index().ffill()
    latest_raw = df_all.iloc[-1]

    try:
        score_frame = _calculate_score_internal(df_all)
    except Exception as exc:
        warnings.append(f"score engine error: {exc}")
        score_frame = pd.DataFrame(index=df_all.index)

    if score_frame.empty or "Total_Score" not in score_frame.columns:
        warnings.append("macro score engine returned empty score frame")
        if score_frame.empty:
            score_frame = pd.DataFrame(index=df_all.index)
        score_frame["Total_Score"] = 50.0

    for item in MODULE_META:
        score_col = f"Score_{item['id']}"
        if score_col not in score_frame.columns:
            score_frame[score_col] = 50.0

    try:
        module_frames = _compute_module_frames(df_all)
    except Exception as exc:
        warnings.append(f"module frame build error: {exc}")
        module_frames = {}

    for item in MODULE_META:
        module_frames.setdefault(item["slug"], pd.DataFrame())

    module_input_gaps = _module_input_gaps(df_all)

    ready_modules = [
        slug
        for slug, frame in module_frames.items()
        if frame is not None and not frame.empty and "Total_Score" in frame.columns and frame["Total_Score"].dropna().shape[0] > 0
    ]
    missing_modules = [item["slug"] for item in MODULE_META if item["slug"] not in ready_modules]
    if not ready_modules:
        warnings.append("no module score could be computed from upstream data")
        if module_input_gaps:
            gap_notes: List[str] = []
            for item in MODULE_META:
                slug = item["slug"]
                missing = module_input_gaps.get(slug)
                if not missing:
                    continue
                gap_notes.append(f"{item['id']}[{','.join(missing[:3])}]")
            if gap_notes:
                warnings.append(f"missing required columns: {'; '.join(gap_notes[:5])}")
        fred_success_count = int(fetch_meta.get("fred_success_count", 0) or 0)
        fred_failure_details = fetch_meta.get("fred_failure_details", [])
        if fred_success_count == 0:
            warnings.append("FRED delivered 0 usable series")
            if fred_failure_details:
                warnings.append(f"FRED sample failures: {' | '.join([str(x) for x in fred_failure_details[:3]])}")

    total_series = score_frame["Total_Score"].dropna()
    if total_series.empty:
        warnings.append("total score series empty, fallback to baseline")
        total_series = pd.Series([50.0], index=pd.DatetimeIndex([df_all.index[-1]]))
    overall_value = float(total_series.iloc[-1])
    overall_wow = overall_value - _prev_value(total_series, days=7)

    module_cards: List[Dict[str, Any]] = []
    module_details: Dict[str, Any] = {}
    contributors: List[Dict[str, Any]] = []
    module_scores: Dict[str, float] = {}

    for item in MODULE_META:
        module_id = item["id"]
        slug = item["slug"]
        score_col = f"Score_{module_id}"
        module_frame = module_frames.get(slug, pd.DataFrame())

        if not module_frame.empty and "Total_Score" in module_frame.columns:
            series = module_frame["Total_Score"].dropna()
        else:
            series = score_frame[score_col].dropna() if score_col in score_frame.columns else pd.Series(dtype=float)
        if series.empty:
            series = pd.Series([50.0], index=total_series.tail(1).index)

        latest_score = float(series.iloc[-1])
        wow_change = latest_score - _prev_value(series, days=7)

        description = _module_description(module_id, latest_raw, latest_score)
        module_scores[module_id] = latest_score

        module_cards.append(
            {
                "id": module_id,
                "slug": slug,
                "title": item["title"],
                "subtitle": item["subtitle"],
                "weight": item["weight_text"],
                "score": round(latest_score, 1),
                "change": round(wow_change, 1),
                "description": description,
            }
        )

        contributors.append(
            {
                "name": item["title"],
                "delta": round(wow_change * item["weight"], 2),
                "bucket": MODULE_BUCKET[module_id],
            }
        )

        score_points = _series_points(series)
        module_details[slug] = {
            "moduleId": module_id,
            "title": f"{module_id} 模块 · {item['title']}",
            "subtitle": item["subtitle"],
            "overview": description,
            "factors": _build_module_factors(module_id, module_frame, item["weight_text"]),
            "snapshots": _build_module_snapshots(
                module_id=module_id,
                df_all=df_all,
                frame=module_frame,
                latest_score=latest_score,
                wow_change=wow_change,
                updated_date=total_series.index[-1].strftime("%Y-%m-%d"),
            ),
            "scoreSeries": score_points,
            "auxiliarySeries": _build_module_auxiliary(module_id, module_frame, score_points),
            "glossary": MODULE_GLOSSARY.get(slug, []),
            "glossaryHtml": _extract_glossary_html(slug),
            "specialSeries": _build_module_special_series(module_id, module_frame),
            "rawTable": _build_raw_table(module_frame, score_points),
        }

    contributors = sorted(contributors, key=lambda x: abs(x["delta"]), reverse=True)[:6]
    lift_drag = _build_lift_drag(module_frames)
    heatmap = _build_dashboard_heatmap(module_frames, df_all)
    regime = _build_regime_view(df_all)
    market_board = _build_market_board(df_all)
    reference_panels = _build_reference_panels(df_all, total_series)
    risk_radar = _build_risk_radar(df_all, module_frames, module_scores)

    # status tags
    tga = _safe_float(latest_raw.get("WTREGEN", np.nan))
    tga_b = tga / 1000 if tga > 10000 else tga
    tga_tag = {"label": "TGA 抽水" if (not pd.isna(tga_b) and tga_b >= 800) else "TGA 放水", "tone": "negative" if (not pd.isna(tga_b) and tga_b >= 800) else "positive"}

    curve = _safe_float(latest_raw.get("T10Y2Y", np.nan))
    curve_tag = {"label": "10Y-2Y 倒挂" if (not pd.isna(curve) and curve < 0) else "10Y-2Y 正常", "tone": "negative" if (not pd.isna(curve) and curve < 0) else "positive"}

    srf = _safe_float(latest_raw.get("RPONTSYD", np.nan))
    srf_tag = {"label": "SRF 启用" if (not pd.isna(srf) and srf > 1) else "SRF 闲置", "tone": "negative" if (not pd.isna(srf) and srf > 1) else "positive"}

    risk_score = next((m["score"] for m in module_cards if m["id"] == "G"), 50.0)
    risk_tag = {
        "label": "风险偏好回暖" if risk_score >= 55 else "风险偏好收缩",
        "tone": "positive" if risk_score >= 55 else "negative",
    }

    # realtime snapshots
    dgs10 = _latest_and_diff(df_all["DGS10"]) if "DGS10" in df_all.columns else {"last": np.nan, "diff": np.nan, "pct": np.nan}
    dxy = _latest_and_diff(df_all["DXY"]) if "DXY" in df_all.columns else {"last": np.nan, "diff": np.nan, "pct": np.nan}

    if "VIX_YH" in df_all.columns or "VIXCLS" in df_all.columns:
        vix = df_all.get("VIX_YH", pd.Series(index=df_all.index, dtype=float)).combine_first(
            df_all.get("VIXCLS", pd.Series(index=df_all.index, dtype=float))
        )
        vix_stats = _latest_and_diff(vix)
    else:
        vix_stats = {"last": np.nan, "diff": np.nan, "pct": np.nan}

    spx = _latest_and_diff(df_all["SP500"]) if "SP500" in df_all.columns else {"last": np.nan, "diff": np.nan, "pct": np.nan}

    realtime_snapshots = [
        {
            "label": "US10Y",
            "value": "-" if pd.isna(dgs10["last"]) else f"{dgs10['last']:.2f}%",
            "delta": _format_signed(dgs10["diff"] * 100.0, digits=1, suffix="bp"),
            "state": "negative" if (not pd.isna(dgs10["diff"]) and dgs10["diff"] > 0) else "positive",
        },
        {
            "label": "DXY",
            "value": "-" if pd.isna(dxy["last"]) else f"{dxy['last']:.2f}",
            "delta": _format_signed(dxy["pct"], digits=2, suffix="%"),
            "state": "negative" if (not pd.isna(dxy["pct"]) and dxy["pct"] > 0) else "positive",
        },
        {
            "label": "VIX",
            "value": "-" if pd.isna(vix_stats["last"]) else f"{vix_stats['last']:.1f}",
            "delta": _format_combined_change(vix_stats["diff"], vix_stats["pct"], diff_digits=2, pct_digits=2),
            "state": "negative" if (not pd.isna(vix_stats["diff"]) and vix_stats["diff"] > 0) else "positive",
        },
        {
            "label": "SP500",
            "value": "-" if pd.isna(spx["last"]) else f"{spx['last']:.0f}",
            "delta": _format_signed(spx["pct"], digits=2, suffix="%"),
            "state": "positive" if (not pd.isna(spx["pct"]) and spx["pct"] >= 0) else "negative",
        },
    ]

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataQuality": {
            "mode": "ok" if len(missing_modules) == 0 and not warnings else "degraded",
            "readyModules": ready_modules,
            "missingModules": missing_modules,
            "availableColumnCount": int(len(df_all.columns)),
            "availableColumns": [str(c) for c in df_all.columns],
            "rows": int(df_all.shape[0]),
            "moduleInputGaps": module_input_gaps,
            "fetchMeta": fetch_meta,
            "warnings": warnings,
        },
        "dashboard": {
            "overallScore": {
                "value": round(overall_value, 1),
                "wow": round(overall_wow, 1),
                "statusTags": [tga_tag, curve_tag, srf_tag, risk_tag],
            },
            "modules": module_cards,
            "scoreSeries": _series_points(total_series, limit=260),
            "contributors": contributors,
            "realtimeSnapshots": realtime_snapshots,
            "liftDrag": lift_drag,
            "heatmap": heatmap,
            "regime": regime,
            "marketBoard": market_board,
            "referencePanels": reference_panels,
            "riskRadar": risk_radar,
        },
        "modules": module_details,
    }
    if warnings:
        payload["dataQuality"]["reason"] = "; ".join(warnings[:3])
    return payload


app = FastAPI(title="MacroQuant Python API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: Dict[str, Any] = {"payload": None, "expires_at": 0.0}
_CACHE_TTL = int(os.getenv("MACRO_API_CACHE_TTL", "300"))
_BOOTSTRAP_TTL = int(os.getenv("MACRO_API_BOOTSTRAP_TTL", "15"))
_SNAPSHOT_PATH = Path(os.getenv("MACRO_API_SNAPSHOT_PATH", ".cache/macro_payload.json"))


def _payload_has_live_modules(payload: Optional[Dict[str, Any]]) -> bool:
    if not payload:
        return False
    data_quality = payload.get("dataQuality", {})
    ready_modules = data_quality.get("readyModules", [])
    return isinstance(ready_modules, list) and len(ready_modules) > 0


def _load_snapshot_payload() -> Optional[Dict[str, Any]]:
    if not _SNAPSHOT_PATH.exists():
        return None
    try:
        return json.loads(_SNAPSHOT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_snapshot_payload(payload: Dict[str, Any]) -> None:
    try:
        _SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SNAPSHOT_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        return


def _mark_snapshot_payload(snapshot_payload: Dict[str, Any], reason: str) -> Dict[str, Any]:
    payload = copy.deepcopy(snapshot_payload)
    payload["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    data_quality = payload.setdefault("dataQuality", {})
    snapshot_generated_at = snapshot_payload.get("generatedAt")
    data_quality["mode"] = "degraded"
    data_quality["servedFromSnapshot"] = True
    data_quality["stale"] = True
    data_quality["snapshotGeneratedAt"] = snapshot_generated_at
    data_quality["reason"] = f"Serving last successful snapshot because live refresh failed: {reason}"
    warnings = list(data_quality.get("warnings", []))
    warnings.append("served cached snapshot instead of live upstream pull")
    data_quality["warnings"] = warnings[-8:]
    return payload


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/macro-data")
def macro_data(refresh: bool = Query(False)) -> Dict[str, Any]:
    now = time.time()
    use_cache = (not refresh) and _cache["payload"] is not None and now < _cache["expires_at"]
    if use_cache:
        return _cache["payload"]

    if (not refresh) and _cache["payload"] is None:
        snapshot_payload = _load_snapshot_payload()
        if snapshot_payload is not None:
            _cache["payload"] = snapshot_payload
            _cache["expires_at"] = now + min(_CACHE_TTL, _BOOTSTRAP_TTL)
            return snapshot_payload

    try:
        payload = build_macro_payload()
    except Exception as exc:
        snapshot_payload = _load_snapshot_payload()
        if snapshot_payload is not None:
            payload = _mark_snapshot_payload(snapshot_payload, str(exc))
            _cache["payload"] = payload
            _cache["expires_at"] = now + _CACHE_TTL
            return payload
        raise HTTPException(status_code=500, detail=f"Failed to compute macro payload: {exc}") from exc

    if _payload_has_live_modules(payload):
        _save_snapshot_payload(payload)
    else:
        snapshot_payload = _load_snapshot_payload()
        if snapshot_payload is not None:
            payload = _mark_snapshot_payload(
                snapshot_payload,
                payload.get("dataQuality", {}).get("reason", "live upstream returned degraded payload"),
            )

    _cache["payload"] = payload
    _cache["expires_at"] = now + _CACHE_TTL
    return payload


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)
