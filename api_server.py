import copy
import json
import os
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
        df_e["Score_Oil"] = (1 - df_e["Chg_Oil"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Chg_Gas"] = df_e["DHHNGSP"].pct_change(63)
        df_e["Score_Gas"] = (1 - df_e["Chg_Gas"].rolling(1260, min_periods=1).rank(pct=True)) * 100
        df_e["Score_Energy"] = df_e["Score_Oil"] * 0.5 + df_e["Score_Gas"] * 0.5
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
            _factor_from_col(frame, "Total_Score", "D Module Total", weight_text),
        ]
    if module_id == "E":
        return [
            _factor_from_col(frame, "Score_USD", "Broad USD", "20%"),
            _factor_from_col(frame, "Score_DXY", "DXY", "20%"),
            _factor_from_col(frame, "Score_Yen_Total", "Yen / Carry", "30%"),
            _factor_from_col(frame, "Score_Energy", "Energy", "30%"),
            _factor_from_col(frame, "Total_Score", "E Module Total", weight_text),
        ]
    if module_id == "F":
        return [
            _factor_from_col(frame, "Score_HY_Level", "HY Spread Level", "50%"),
            _factor_from_col(frame, "Score_HY_Trend", "HY Trend", "30%"),
            _factor_from_col(frame, "Score_BAA_Level", "BAA10Y", "20%"),
            _factor_from_col(frame, "Total_Score", "F Module Total", weight_text),
        ]
    if module_id == "G":
        return [
            _factor_from_col(frame, "Score_Term", "VIX/VXV Term", "40%"),
            _factor_from_col(frame, "Score_VIX", "VIX Level", "30%"),
            _factor_from_col(frame, "Score_Mom", "Risk Momentum", "30%"),
            _factor_from_col(frame, "Total_Score", "G Module Total", weight_text),
        ]
    return [_factor_from_col(frame, "Total_Score", "Module Total", weight_text)]


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
        snapshots.append(_snapshot_from_series("WTI", df_all.get("DCOILWTICO"), delta_mode="pct", delta_suffix="%", inverse_state=True))
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

    snapshots.append({"label": "最新更新时间", "value": updated_date, "delta": "UTC", "state": "neutral"})
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
        }

    contributors = sorted(contributors, key=lambda x: abs(x["delta"]), reverse=True)[:6]

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
            "delta": _format_signed(vix_stats["diff"], digits=2),
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
