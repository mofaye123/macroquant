import streamlit as st
import pandas as pd
import numpy as np
import math
import json
import io
import re
import html
import textwrap
import plotly.graph_objects as go
from datetime import datetime, timedelta
import yfinance as yf
from config import GEMINI_API_KEY
from google import genai

# --- [核心功能]：AI 调用函数 (使用 google-genai SDK) ---
def call_gemini_new_sdk(prompt, api_key):
        client = genai.Client(api_key=api_key, http_options={'api_version': 'v1alpha'})
 
        response = client.models.generate_content(
            model='gemini-3-flash-preview', 
            contents=prompt
        )
        return response.text
       

PROFESSIONAL_LIGHT_CSS = """
<style>
    :root {
        --ui-bg: #f8f9fa;
        --ui-card: #ffffff;
        --ui-border: #e5e7eb;
        --ui-text: #111827;
        --ui-subtext: #6b7280;
        --ui-accent: #2563eb;
        --ui-success: #059669;
        --ui-danger: #dc2626;
        --ui-warn: #f59e0b;
    }
    /* 1. 全局背景：极淡的灰白，护眼 */
    .stApp {
        background-color: var(--ui-bg);
        color: var(--ui-text);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    /* 2. 卡片样式：纯白底 + 微阴影 (Apple风格) */
    .term-card {
        background: var(--ui-card);
        border: 1px solid var(--ui-border);
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .term-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
        border-color: #d1d5db;
    }

        /* 模块卡片统一高度与底部对齐 */
    .module-card {
        min-height: 240px;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
    }
    .module-card .module-footer {
        margin-top: auto;
        min-height: 44px;
    }
    .module-card .module-desc {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    
    /* 3. 字体颜色定义 (适配浅色底) */
    .text-main { color: var(--ui-text); }
    .text-dim { color: var(--ui-subtext); font-size: 0.85em; font-weight: 500; }
    .text-green { color: var(--ui-success); font-weight: 600; }
    .text-red { color: var(--ui-danger); font-weight: 600; }
    .text-gold { color: #b45309; font-weight: 700; }
    .text-blue { color: var(--ui-accent); }
    
    /* 4. 进度条容器 */
    .progress-bg {
        width: 100%; height: 8px; background: #f3f4f6; border-radius: 4px; margin-top: 12px; overflow: hidden;
    }
    .progress-bar { height: 100%; border-radius: 4px; }
    
    /* 5. 状态胶囊 */
    .status-pill {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 14px; border-radius: 20px;
        font-size: 12px; font-weight: 600;
        margin-right: 8px; margin-bottom: 8px;
        border: 1px solid;
    }
    .pill-danger { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
    .pill-success { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }

    /* AI 报告样式 */
    .ai-report-container {
        background-color: #f0fdf4; border: 1px solid #bbf7d0;
        border-radius: 12px; padding: 25px; margin-bottom: 30px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
    }
    .ai-report-title {
        color: #166534; font-size: 18px; font-weight: 800; margin-bottom: 15px; 
        display: flex; align-items: center; gap: 10px;
        border-bottom: 1px solid #dcfce7; padding-bottom: 10px;
    }
    .ai-content { font-family: 'Georgia', serif; font-size: 15px; line-height: 1.7; color: #14532d; }

    /* 模块卡片可点击样式 */
    a.module-link { text-decoration: none; color: inherit; display: block; width: 100%; }
    a.module-link * { cursor: pointer; }
    a.module-link:hover .term-card {
        transform: translateY(-3px);
        box-shadow: 0 12px 22px rgba(15,23,42,0.12);
        border-color: #cbd5e1;
    }
    a.module-link:hover { transform: translateY(-2px); }
    a.module-link .term-card { transition: transform 0.2s, box-shadow 0.2s; }
    
    /* 隐藏 Streamlit 默认元素 */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    /* 保留顶部栏以显示侧边栏展开按钮 */
    header {visibility: visible;}
    
    code { background: transparent !important; color: inherit !important; padding: 0 !important; }
</style>
"""


@st.cache_data(ttl=300)
def _get_rt_market_snapshot():
    """
    拉取跨资产实时快照（Yahoo，通常有15~20分钟延迟）
    """
    tickers = [
        "ZN=F", "ZB=F",      # UST Futures
        "^FVX", "^TNX", "^TYX",  # 5Y/10Y/30Y yields (*10)
        "^GSPC", "^IXIC",    # equity index
        "LQD", "HYG", "JNK", # credit
        "GLD", "DX-Y.NYB", "JPY=X"  # gold / dxy / usdjpy
    ]
    raw = yf.download(
        tickers=tickers,
        period="40d",
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=False
    )
    if raw is None or raw.empty:
        return pd.DataFrame()
    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" not in raw.columns.levels[0]:
            return pd.DataFrame()
        close_df = raw["Close"].copy()
    else:
        if "Close" not in raw.columns:
            return pd.DataFrame()
        close_df = raw[["Close"]].copy()
        close_df.columns = [tickers[0]]
    if hasattr(close_df.index, "tz") and close_df.index.tz is not None:
        close_df.index = close_df.index.tz_localize(None)
    return close_df.sort_index()


def _last_pct_chg(series):
    s = series.dropna()
    if len(s) < 2:
        return np.nan, np.nan
    last = float(s.iloc[-1])
    prev = float(s.iloc[-2])
    pct = np.nan if prev == 0 else (last / prev - 1.0) * 100.0
    return last, pct


def _last_diff(series, scale=1.0):
    s = series.dropna()
    if len(s) < 2:
        return np.nan, np.nan
    last = float(s.iloc[-1]) * scale
    prev = float(s.iloc[-2]) * scale
    return last, last - prev


def _fmt_rt_num(v, digits=2, suffix=""):
    if pd.isna(v):
        return "-"
    return f"{v:.{digits}f}{suffix}"


def _fmt_rt_delta(v, digits=2, suffix=""):
    if pd.isna(v):
        return "-"
    sign = "+" if v >= 0 else ""
    return f"{sign}{v:.{digits}f}{suffix}"

# ==========================================
# Dashboard 逻辑
# ==========================================
def render_dashboard_standalone(df_all):
    # 注入 CSS
    st.markdown(PROFESSIONAL_LIGHT_CSS, unsafe_allow_html=True)

    # 关键列缺失时给出可读错误，避免直接抛 KeyError
    required_cols = {'WALCL', 'WTREGEN', 'RRPONTSYD', 'WRESBAL'}
    missing_cols = sorted(list(required_cols - set(df_all.columns)))
    if missing_cols:
        st.error(
            "FRED 核心数据暂不可用，Dashboard 需要以下列："
            + "、".join(missing_cols)
            + "。请稍后刷新（当前可能是网络超时或接口限流）。"
        )
        return

    # ----------------------------------------------------
    # 1. 核心计算逻辑 (完全保留原代码)
    # ----------------------------------------------------
    def prev_week_value(series, days=7):
        target = series.index[-1] - pd.Timedelta(days=days)
        idx = series.index.get_indexer([target], method='nearest')[0]
        return series.iloc[idx]
    df_raw_a = df_all[df_all.index >= '2020-01-01'].copy()
    
    df_a = pd.DataFrame()
    df_a['WALCL'] = df_raw_a['WALCL'].resample('W-WED').last() 
    df_a['WTREGEN'] = df_raw_a['WTREGEN'].resample('W-WED').last()
    df_a['RRPONTSYD'] = df_raw_a['RRPONTSYD'].resample('W-WED').last()
    df_a['WRESBAL'] = df_raw_a['WRESBAL'].resample('W-WED').last()
    df_a = df_a.fillna(method='ffill').dropna()

    def get_tga_penalty(tga_val):
        tga_b = tga_val / 1000 if tga_val > 10000 else tga_val
        if tga_b < 800: return 1.0  
        elif 800 <= tga_b < 850: return 0.8  
        elif 850 <= tga_b < 900: return 0.6
        else: return 0.5
    
    tga_b = df_a['WTREGEN'].where(df_a['WTREGEN'] <= 10000, df_a['WTREGEN'] / 1000)
    df_a['TGA_Penalty_Level'] = tga_b.apply(get_tga_penalty)

    def get_tga_trend_penalty(delta_b):
        if delta_b <= 0: return 1.0
        elif delta_b <= 50: return 0.95
        elif delta_b <= 100: return 0.9
        elif delta_b <= 150: return 0.8
        else: return 0.7

    df_a['TGA_Change_4W'] = tga_b.diff(4).fillna(0)
    df_a['TGA_Penalty_Trend'] = df_a['TGA_Change_4W'].apply(get_tga_trend_penalty)
    df_a['TGA_Penalty_Total'] = df_a['TGA_Penalty_Level'] * df_a['TGA_Penalty_Trend']
    if df_a['RRPONTSYD'].mean() < 10000:
        df_a['RRP_Clean'] = df_a['RRPONTSYD'] * 1000
    else:
        df_a['RRP_Clean'] = df_a['RRPONTSYD']
    df_a['Net_Liquidity'] = df_a['WALCL'] - df_a['WTREGEN'] - df_a['RRP_Clean']

    df_a['Liquidity_Sink'] = df_a['WTREGEN'] + df_a['RRP_Clean']
    df_a['Liquidity_Sink_Ratio'] = (df_a['Liquidity_Sink'] / df_a['WALCL']).clip(lower=0)
    def sink_penalty_ratio(r):
        if r < 0.10: return 1.0
        elif r < 0.15: return 0.9
        elif r < 0.20: return 0.8
        elif r < 0.25: return 0.7
        else: return 0.6
    df_a['Sink_Penalty'] = df_a['Liquidity_Sink_Ratio'].apply(sink_penalty_ratio)
    
    def rolling_percentile(series, window=156, min_periods=20):
        return series.rolling(window, min_periods=min_periods).apply(
            lambda s: s.rank(pct=True).iloc[-1],
            raw=False
        ) * 100

    def get_score_a(series):
        return rolling_percentile(series.diff(13))
    df_a['Score_NetLiq'] = get_score_a(df_a['Net_Liquidity'])
    df_a['Score_TGA'] = get_score_a(-df_a['WTREGEN'])
    df_a['Score_RRP'] = get_score_a(-df_a['RRP_Clean'])
    df_a['Score_Reserves'] = get_score_a(df_a['WRESBAL'])
    base_total_a = (df_a['Score_NetLiq']*0.45 + df_a['Score_TGA']*0.2 + df_a['Score_RRP']*0.25 + df_a['Score_Reserves']*0.1)
    df_a['Score_NetLiq_Adj'] = df_a['Score_NetLiq'] * df_a['Sink_Penalty']
    df_a['Total_Score'] = (
        df_a['Score_NetLiq_Adj'] * 0.45 +
        df_a['Score_TGA'] * 0.2 +
        df_a['Score_RRP'] * 0.25 +
        df_a['Score_Reserves'] * 0.1
    ) * df_a['TGA_Penalty_Total']

    def ensure_df(df, cols):
        return df.dropna(subset=cols).copy()

    # 模块 B
    df_b = ensure_df(df_all, ['SOFR', 'IORB', 'RRPONTSYAWARD', 'TGCRRATE', 'RPONTSYD'])
    df_b['SOFR_MA13'] = df_b['SOFR'].rolling(65, min_periods=1).mean()
    df_b['SOFR_Trend'] = df_b['SOFR_MA13'].diff(21)
    df_b['Score_Trend'] = df_b['SOFR_Trend'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
    def get_regime_bonus(sofr):
        if sofr < 1.0: return 20
        elif sofr < 2.5: return 10
        elif sofr > 5.0: return -20
        elif sofr > 4.0: return -10
        else: return 0
    df_b['Regime_Bonus'] = df_b['SOFR'].apply(get_regime_bonus)
    df_b['Score_Policy'] = (df_b['Score_Trend'] + df_b['Regime_Bonus']).clip(0, 100)
    
    df_b['Corridor_Width'] = (df_b['IORB'] - df_b['RRPONTSYAWARD']).abs().clip(lower=0.05)

    df_b['F1_Spread'] = df_b['SOFR'] - df_b['IORB']
    df_b['F1_Ratio'] = df_b['F1_Spread'].clip(lower=0) / df_b['Corridor_Width']

    df_b['F2_Spread'] = df_b['SOFR'] - df_b['RRPONTSYAWARD']
    df_b['F2_Ratio'] = df_b['F2_Spread'].abs() / df_b['Corridor_Width']

    df_b['F3_Spread'] = df_b['TGCRRATE'] - df_b['SOFR']
    df_b['F3_Ratio'] = df_b['F3_Spread'].abs() / df_b['Corridor_Width']

    def ratio_to_score(series, max_ratio_series):
        denom = max_ratio_series.replace(0, np.nan).ffill().fillna(0.5)
        scaled = (series / denom).clip(lower=0, upper=1)
        return (1 - scaled**1.6) * 100

    df_b['F1_Max'] = df_b['F1_Ratio'].rolling(180, min_periods=60).quantile(0.85)
    df_b['F2_Max'] = df_b['F2_Ratio'].rolling(180, min_periods=60).quantile(0.85)
    df_b['F3_Max'] = df_b['F3_Ratio'].rolling(180, min_periods=60).quantile(0.85)

    df_b['Score_F1'] = ratio_to_score(df_b['F1_Ratio'], df_b['F1_Max'])
    df_b['Score_F2'] = ratio_to_score(df_b['F2_Ratio'], df_b['F2_Max'])
    df_b['Score_F3'] = ratio_to_score(df_b['F3_Ratio'], df_b['F3_Max'])

    df_b['SRF_Penalty_Base'] = 100 / (1 + np.exp(-0.6 * (df_b['RPONTSYD'] - 5)))
    df_b['SRF_Accel'] = df_b['RPONTSYD'].diff(3).clip(lower=0)
    df_b['SRF_Penalty'] = (df_b['SRF_Penalty_Base'] + (df_b['SRF_Accel'] / 20).clip(0, 1) * 35).clip(0, 100)
    df_b['Score_SRF'] = 100 - df_b['SRF_Penalty']

    df_b['SRF_Weight'] = 0.10 + 0.15 * (df_b['SRF_Penalty'] / 100)
    residual = 1 - df_b['SRF_Weight']
    df_b['Score_Friction'] = (
        df_b['Score_F1'] * residual * 0.4 +
        df_b['Score_F2'] * residual * 0.3 +
        df_b['Score_F3'] * residual * 0.3 +
        df_b['Score_SRF'] * df_b['SRF_Weight']
    )
    df_b['Total_Score'] = df_b['Score_Policy'] * 0.40 + df_b['Score_Friction'] * 0.60

    # 模块 C
    df_c = ensure_df(df_all, ['DGS10', 'DGS2', 'DGS30', 'T10Y2Y', 'T10Y3M'])
    def get_level_score(series): return series.rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
    df_c['Score_10Y'] = get_level_score(df_c['DGS10'])
    df_c['Score_2Y'] = get_level_score(df_c['DGS2'])
    df_c['Score_30Y'] = get_level_score(df_c['DGS30'])
    def get_slope_score(series, target, tol):
        dev = (series - target).abs()
        return (100 - (dev / tol * 80)).clip(0, 100)
    df_c['Score_Curve_2s10s'] = get_slope_score(df_c['T10Y2Y'], 0.5, 1.5)
    df_c['Score_Curve_3m10s'] = get_slope_score(df_c['T10Y3M'], 0.75, 2.0)
    df_c['Total_Score1'] = (df_c['Score_Curve_2s10s']*0.3 + df_c['Score_Curve_3m10s']*0.3 + df_c['Score_10Y']*0.2 + df_c['Score_2Y']*0.1 + df_c['Score_30Y']*0.1)
    
    slope_10 = df_c['DGS10'].diff(60)
    slope_30 = df_c['DGS30'].diff(60)
    df_c['Max_Slope'] = pd.concat([slope_10, slope_30], axis=1).max(axis=1)
    def get_slope_penalty(s):
        if s > 0.50: return 0.2
        elif s > 0.30: return 0.6 
        elif s > 0.15: return 0.8
        else: return 1.0
    df_c['Penalty_Factor'] = df_c['Max_Slope'].apply(get_slope_penalty)
    df_c['Total_Score'] = df_c['Total_Score1'] * df_c['Penalty_Factor']

    # 模块 D
    df_d = ensure_df(df_all, ['DFII10', 'DFII5', 'T10YIE'])
    df_d['Score_Real_10Y'] = df_d['DFII10'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
    df_d['Score_Real_5Y'] = df_d['DFII5'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
    df_d['Score_Breakeven'] = get_slope_score(df_d['T10YIE'], 2.1, 0.6) 
    df_d['Total_Score'] = (df_d['Score_Real_10Y']*0.4 + df_d['Score_Real_5Y']*0.3 + df_d['Score_Breakeven']*0.3)

    # 模块 E
    df_e = df_all.copy().fillna(method='ffill')
    df_e = ensure_df(df_e, ['DTWEXBGS', 'DXY', 'DEXJPUS', 'IRSTCI01JPM156N', 'DCOILWTICO', 'DHHNGSP'])
    df_e['Chg_USD'] = df_e['DTWEXBGS'].pct_change(63)
    df_e['Score_USD'] = (1 - df_e['Chg_USD'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    df_e['Chg_DXY'] = df_e['DXY'].pct_change(63)
    df_e['Score_DXY'] = (1 - df_e['Chg_DXY'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    df_e['Yen_Appreciation'] = -1 * df_e['DEXJPUS'].pct_change(63)
    df_e['Score_Yen_FX'] = (1 - df_e['Yen_Appreciation'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    df_e['Score_BoJ_Rate'] = (1 - df_e['IRSTCI01JPM156N'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    df_e['Score_Yen_Total'] = df_e['Score_Yen_FX'] * 0.7 + df_e['Score_BoJ_Rate'] * 0.3
    df_e['Chg_Oil'] = df_e['DCOILWTICO'].pct_change(63)
    df_e['Score_Oil'] = (1 - df_e['Chg_Oil'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    df_e['Chg_Gas'] = df_e['DHHNGSP'].pct_change(63)
    df_e['Score_Gas'] = (1 - df_e['Chg_Gas'].rolling(1260, min_periods=1).rank(pct=True)) * 100
    df_e['Score_Energy'] = df_e['Score_Oil'] * 0.5 + df_e['Score_Gas'] * 0.5
    df_e['Total_Score'] = (df_e['Score_USD'] * 0.20 + df_e['Score_DXY'] * 0.20 + df_e['Score_Yen_Total'] * 0.3 + df_e['Score_Energy'] * 0.3)

    # --------------------------------------------------------
    # 2. 准备渲染数据 (获取最新值)
    # --------------------------------------------------------
    score_a = df_a['Total_Score'].iloc[-1]
    score_b = df_b['Total_Score'].iloc[-1]
    score_c = df_c['Total_Score'].iloc[-1]
    score_d = df_d['Total_Score'].iloc[-1]
    score_e = df_e['Total_Score'].iloc[-1]

    # 模块 F: 信用压力
    df_f = ensure_df(df_all, ['BAMLH0A0HYM2', 'BAA10Y'])
    def rolling_percentile_f(series, window=756, min_periods=30):
        return series.rolling(window, min_periods=min_periods).apply(
            lambda s: s.rank(pct=True).iloc[-1],
            raw=False
        ) * 100
    def bounded_score(series):
        return series.clip(lower=0, upper=100)
    df_f['HY_Spread'] = df_f['BAMLH0A0HYM2']
    df_f['BAA10Y'] = df_f['BAA10Y']
    df_f['Score_HY_Level'] = 100 - rolling_percentile_f(df_f['HY_Spread'])
    df_f['Score_HY_Trend'] = rolling_percentile_f(-df_f['HY_Spread'].diff(13))
    df_f['Score_BAA_Level'] = 100 - rolling_percentile_f(df_f['BAA10Y'])
    df_f['Total_Score'] = bounded_score(
        df_f['Score_HY_Level'] * 0.5 +
        df_f['Score_HY_Trend'] * 0.3 +
        df_f['Score_BAA_Level'] * 0.2
    )

    # 模块 G: 风险偏好
    vix_yh = df_all['VIX_YH'] if 'VIX_YH' in df_all.columns else None
    vix_fd = df_all['VIXCLS'] if 'VIXCLS' in df_all.columns else None
    vxv_yh = df_all['VXV_YH'] if 'VXV_YH' in df_all.columns else None
    vxv_fd = df_all['VXVCLS'] if 'VXVCLS' in df_all.columns else None
    df_g = df_all.copy()
    df_g['VIX'] = vix_yh.combine_first(vix_fd) if vix_yh is not None else vix_fd
    df_g['VXV'] = vxv_yh.combine_first(vxv_fd) if vxv_yh is not None else vxv_fd
    if df_g['VIX'] is None or df_g['VXV'] is None or 'SP500' not in df_g.columns:
        df_g = pd.DataFrame()
    else:
        df_g = ensure_df(df_g, ['SP500', 'VIX', 'VXV'])
    if not df_g.empty:
        df_g['VIX_VXV'] = df_g['VIX'] / df_g['VXV']
        df_g['SPX'] = df_g['SP500']
        df_g = df_g.dropna(subset=['VIX', 'VXV', 'SPX'])
        if not df_g.empty:
            df_g['Score_VIX'] = bounded_score(100 - rolling_percentile_f(df_g['VIX']))
            df_g['Score_Term'] = bounded_score(100 - rolling_percentile_f(df_g['VIX_VXV']))
            df_g['Score_Mom'] = bounded_score(rolling_percentile_f(df_g['SPX'].diff(65)))
            df_g['Total_Score'] = bounded_score(
                df_g['Score_Term'] * 0.4 +
                df_g['Score_VIX'] * 0.3 +
                df_g['Score_Mom'] * 0.3
            )

    def safe_last(series, fallback=50.0):
        try:
            val = series.iloc[-1]
            return fallback if pd.isna(val) else float(val)
        except Exception:
            return fallback

    score_f = safe_last(df_f['Total_Score']) if not df_f.empty else 50.0
    if not df_g.empty and 'Total_Score' in df_g.columns and df_g['Total_Score'].dropna().shape[0] > 0:
        score_g = float(df_g['Total_Score'].dropna().iloc[-1])
    else:
        score_g = 50.0
    
    # 变动 (WoW/MoM 根据原逻辑)
    chg_a = score_a - df_a['Total_Score'].iloc[-2] # A为周频，直接取上周
    chg_b = score_b - prev_week_value(df_b['Total_Score'])
    chg_c = score_c - prev_week_value(df_c['Total_Score'])
    chg_d = score_d - prev_week_value(df_d['Total_Score'])
    chg_e = score_e - prev_week_value(df_e['Total_Score'])
    chg_f = score_f - (prev_week_value(df_f['Total_Score']) if not df_f.empty else score_f)
    if df_g.empty:
        chg_g = 0.0
    else:
        prev_g = prev_week_value(df_g['Total_Score'])
        chg_g = score_g - (prev_g if not pd.isna(prev_g) else score_g)
    
    total_score = (
        score_a*0.20 + score_b*0.20 + score_c*0.15 + score_d*0.15 + score_e*0.15 +
        score_f*0.075 + score_g*0.075
    )
    prev_total = (
        df_a['Total_Score'].iloc[-2]*0.20 +
        prev_week_value(df_b['Total_Score'])*0.20 +
        prev_week_value(df_c['Total_Score'])*0.15 +
        prev_week_value(df_d['Total_Score'])*0.15 +
        prev_week_value(df_e['Total_Score'])*0.15 +
        (prev_week_value(df_f['Total_Score']) if not df_f.empty else 50.0)*0.075 +
        (prev_week_value(df_g['Total_Score']) if not df_g.empty else 50.0)*0.075
    )
    total_chg = total_score - prev_total

    # Dashboard 页面不显示 AI 报告

 
    col_left, col_spacer, col_right = st.columns([1, 0.06, 2])

    with col_left:
        # --- 1. 动态仪表盘颜色逻辑 ---
        if total_score < 20:
            gauge_color = "#dc2626" # 红色
        elif total_score < 40:
            gauge_color = "#f97316" # 橙色
        elif total_score < 60:
            gauge_color = "#eab308" # 黄色
        else:
            gauge_color = "#059669" # 绿色

        # --- 2. Plotly 仪表盘 ---
        fig_gauge = go.Figure(go.Indicator(
            mode = "gauge",
            value = total_score,
            gauge = {
                'axis': {'range': [0, 100], 'tickwidth': 1, 'tickcolor': "#333"},
                'bar': {'color': gauge_color},
                'bgcolor': "#f3f4f6",
                'borderwidth': 0,
                'steps': [{'range': [0, 100], 'color': "#f3f4f6"}],
            }
        ))
        fig_gauge.update_layout(
            height=250, margin=dict(l=20,r=20,t=20,b=20),
            paper_bgcolor='rgba(0,0,0,0)', font={'family': "Inter"},
            annotations=[
                dict(
                    x=0.5, y=0.12, xref="paper", yref="paper",
                    text=f"<b>{total_score:.1f}</b>",
                    showarrow=False,
                    font=dict(size=56, color="#1f2937", family="Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif")
                )
            ]
        )
        
        st.markdown(f"""<div class="term-card" style="text-align:center;"><div style="font-weight:bold; font-size:20px; color:black; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">宏观综合得分</div></div>""", unsafe_allow_html=True)
        st.plotly_chart(fig_gauge, use_container_width=True)
        
        chg_color = "text-green" if total_chg >= 0 else "text-red"
        chg_arrow = "▲" if total_chg >= 0 else "▼"
        st.markdown(f"""<div style="text-align:center; margin-top:-5px; margin-bottom:20px;"><span class="text-dim">vs 上周: </span><span class="{chg_color}" style="font-weight:bold; font-family:monospace;">{chg_arrow} {abs(total_chg):.1f}</span></div>""", unsafe_allow_html=True)

        # 状态 Pills
        pills_html = ""
        tga_latest = df_all['WTREGEN'].iloc[-1]
        tga_prev = df_all['WTREGEN'].iloc[-9]
        # 统一到“十亿美元”尺度判断（与模型惩罚逻辑一致）
        tga_latest_b = tga_latest / 1000 if tga_latest > 10000 else tga_latest
        tga_prev_b = tga_prev / 1000 if tga_prev > 10000 else tga_prev
        tga_diff_b = tga_latest_b - tga_prev_b
        tga_is_drain = True if tga_latest_b > 800 else (tga_diff_b > 0)
        pills_html += f'<span class="status-pill {"pill-danger" if tga_is_drain else "pill-success"}">💧 TGA {"抽水" if tga_is_drain else "放水"}</span>'
        pills_html += f'<span class="status-pill {"pill-danger" if df_all["T10Y2Y"].iloc[-1] < 0 else "pill-success"}">{"📉 倒挂" if df_all["T10Y2Y"].iloc[-1] < 0 else " 10Y-2Y利差正常"}</span>'
        pills_html += f'<span class="status-pill {"pill-danger" if df_all["RPONTSYD"].iloc[-1] > 1 else "pill-success"}">{"🏦 SRF 启用" if df_all["RPONTSYD"].iloc[-1] > 1 else " SRF 闲置"}</span>'
        
        st.markdown(f"""<div style="display:flex; flex-wrap:wrap; justify-content:center;">{pills_html}</div>""", unsafe_allow_html=True)

    with col_right:
        # 趋势图 (适配浅色：深灰线)
        st.markdown("""<div class="term-card" style="height: 100%;"><div style="display:flex; justify-content:space-between; margin-bottom:9px;"><div style="font-weight:bold; font-size:20px; color:#1f2937;">综合得分趋势 (Historical Trend)</div>""", unsafe_allow_html=True)

        lookback_years = st.slider("⏱️ 观察窗口 (年)", 1, 10, 5)
        idx = df_b.index
        s_a_hist = df_a['Total_Score'].reindex(idx, method='ffill')
        def safe_series(frame, col, fallback=50.0):
            if frame is None or frame.empty or col not in frame.columns:
                return pd.Series(fallback, index=idx)
            return frame[col].reindex(idx, method='ffill').fillna(fallback)

        s_total_hist = (
            s_a_hist*0.20 +
            safe_series(df_b, 'Total_Score')*0.20 +
            safe_series(df_c, 'Total_Score')*0.15 +
            safe_series(df_d, 'Total_Score')*0.15 +
            safe_series(df_e, 'Total_Score')*0.15 +
            safe_series(df_f, 'Total_Score')*0.075 +
            safe_series(df_g, 'Total_Score')*0.075
        ).dropna()
        trading_days = lookback_years * 252
        recent_trend = s_total_hist.tail(trading_days)

        fig_trend = go.Figure()
        # 主线：深蓝
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=recent_trend.values, name='综合得分', mode='lines', line=dict(color='#2563eb', width=2), fill='tozeroy', fillcolor='rgba(37, 99, 235, 0.05)'))
        # 辅线：淡灰/淡彩
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=s_a_hist.loc[recent_trend.index], name='A.流动性', line=dict(color='#06b6d4', width=1, dash='dot'), visible='legendonly'))
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=safe_series(df_b, 'Total_Score').loc[recent_trend.index], name='B.资金面', line=dict(color='#8b5cf6', width=1, dash='dot'), visible='legendonly'))
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=safe_series(df_c, 'Total_Score').loc[recent_trend.index], name='C.国债', line=dict(color='#f59e0b', width=1, dash='dot'), visible='legendonly'))
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=safe_series(df_d, 'Total_Score').loc[recent_trend.index], name='D.利率', line=dict(color='#ec4899', width=1, dash='dot'), visible='legendonly'))
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=safe_series(df_e, 'Total_Score').loc[recent_trend.index], name='E.外部', line=dict(color='#10b981', width=1, dash='dot'), visible='legendonly'))
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=safe_series(df_f, 'Total_Score').loc[recent_trend.index], name='F.信用', line=dict(color='#ef4444', width=1, dash='dot'), visible='legendonly'))
        fig_trend.add_trace(go.Scatter(x=recent_trend.index, y=safe_series(df_g, 'Total_Score').loc[recent_trend.index], name='G.风险偏好', line=dict(color='#0ea5e9', width=1, dash='dot'), visible='legendonly'))
        
        
        fig_trend.update_layout(
            height=300,
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
            margin=dict(l=0,r=0,t=10,b=0),
            xaxis=dict(showgrid=False, tickfont=dict(color='#9ca3af')),
            yaxis=dict(showgrid=True, gridcolor='#f3f4f6', zeroline=False, tickfont=dict(color='#9ca3af')),
            hovermode="x unified",
            legend=dict(orientation="h", y=1.1, font=dict(color="#4b5563"))
        )
        st.plotly_chart(fig_trend, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # --------------------------------------------------------
    # 4. 模块卡片区域 (HTML 生成) - 修复缩进问题
    # --------------------------------------------------------
    def section_header(title):
        st.markdown(
            f"""<div style="display:flex; align-items:center; margin: 30px 0 20px 0;">
            <div style="width:8px; height:8px; background:#2563eb; border-radius:50%; margin-right:10px;"></div>
            <div style="font-size:16px; font-weight:700; color:#1f2937; letter-spacing:1px;">{title}</div>
            <div style="flex:1; height:1px; background:#e5e7eb; margin-left:15px;"></div></div>""",
            unsafe_allow_html=True
        )

    section_header("模块因子")

    def create_card_html(mod_id, title, sub, score, change, weight, desc, link=None):
        color_cls = "text-green" if score >= 60 else ("text-gold" if score >= 40 else "text-red")
        bar_color = "#059669" if score >= 60 else ("#eab308" if score >= 40 else "#dc2626")
        arrow = "▲" if change >= 0 else "▼"
        chg_cls = "text-green" if change >= 0 else "text-red"
        
        card_html = f"""<div class="term-card module-card"><div style="display:flex; justify-content:space-between; margin-bottom:10px;"><div><span style="background:#f3f4f6; color:#4b5563; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600;">MOD {mod_id}</span><span class="text-dim" style="text-transform:uppercase; margin-left:5px; font-size:10px;">{sub}</span><div style="font-size:16px; font-weight:bold; color:#111827; margin-top:5px;">{title}</div></div><div class="text-dim" style="font-family:monospace;">{weight}</div></div><div style="display:flex; align-items:baseline; gap:10px;"><span style="font-size:32px; font-weight:bold; color:#111827;">{score:.1f}</span><span class="{chg_cls}" style="font-size:12px; font-family:monospace;">{arrow} {abs(change):.1f}</span></div><div class="progress-bg"><div class="progress-bar" style="width: {score}%; background: {bar_color};"></div></div><div class="module-footer" style="margin-top:15px; padding-top:10px; border-top:1px solid #f3f4f6; font-size:11px; color:#6b7280; display:flex; align-items:center;"><div style="width:6px; height:6px; background:{bar_color}; border-radius:50%; margin-right:6px;"></div><span class="module-desc">{desc}</span></div></div>"""
        if link:
            return f"""<a class="module-link" href="{link}" target="_self">{card_html}</a>"""
        return card_html

    # 动态文案
    tga_curr = df_all['WTREGEN'].iloc[-1]
    tga_penalty_now = df_a['TGA_Penalty_Total'].iloc[-1] if 'TGA_Penalty_Total' in df_a.columns else 1.0
    sink_penalty_now = df_a['Sink_Penalty'].iloc[-1] if 'Sink_Penalty' in df_a.columns else 1.0
    if tga_curr >= 800000:
        desc_a = f"TGA水位过高 ({tga_curr/1000:.0f}B) · 惩罚 {tga_penalty_now:.2f}x / 吸收惩罚 {sink_penalty_now:.2f}x"
    else:
        desc_a = f"吸收惩罚 {sink_penalty_now:.2f}x" if sink_penalty_now < 0.9 else ("净流动性回落" if score_a < 40 else "净流动性趋势平稳")
    desc_b = "SOFR 突破 IORB" if df_all['SOFR'].iloc[-1] > df_all['IORB'].iloc[-1] else "回购市场利率控制良好"
    desc_c = f"长端动量惩罚 ({df_c['Penalty_Factor'].iloc[-1]}x)" if df_c['Penalty_Factor'].iloc[-1] < 1.0 else ("深度倒挂 >50bps" if df_all['T10Y2Y'].iloc[-1] < -0.5 else "期限结构健康")
    desc_d = f"通胀预期 {df_all['T10YIE'].iloc[-1]:.2f}%"
    desc_e = "美元指数强势压制" if df_e['Chg_DXY'].iloc[-1] > 0.02 else "外部汇率环境相对宽松"
    hy_now = df_f['HY_Spread'].iloc[-1]
    baa_now = df_f['BAA10Y'].iloc[-1]
    desc_f = "信用压力偏紧" if (hy_now > 6.0 or baa_now > 3.0) else ("信用压力回升" if score_f > 55 else "信用压力中性")
    if df_g.empty or 'VIX' not in df_g.columns or 'VIX_VXV' not in df_g.columns:
        desc_g = "风险偏好中性"
        vix_now = 0.0
        term_now = 1.0
    else:
        vix_now = float(df_g['VIX'].dropna().iloc[-1]) if df_g['VIX'].dropna().shape[0] else 0.0
        term_now = float(df_g['VIX_VXV'].dropna().iloc[-1]) if df_g['VIX_VXV'].dropna().shape[0] else 1.0
        desc_g = "风险偏好收缩" if (vix_now > 25 or term_now > 1.0 or score_g < 40) else ("风险偏好回暖" if score_g > 55 else "风险偏好中性")

    c1, c2, c3, c4, c5 = st.columns(5)
    with c1: st.markdown(create_card_html("A", "系统流动性", "Liquidity", score_a, chg_a, "20%", desc_a, link="?nav=module_a"), unsafe_allow_html=True)
    with c2: st.markdown(create_card_html("B", "资金价格", "Funding", score_b, chg_b, "20%", desc_b, link="?nav=module_b"), unsafe_allow_html=True)
    with c3: st.markdown(create_card_html("C", "国债结构", "Yield Curve", score_c, chg_c, "15%", desc_c, link="?nav=module_c"), unsafe_allow_html=True)
    with c4: st.markdown(create_card_html("D", "实际利率", "Real Rates", score_d, chg_d, "15%", desc_d, link="?nav=module_d"), unsafe_allow_html=True)
    with c5: st.markdown(create_card_html("E", "外部冲击", "External", score_e, chg_e, "15%", desc_e, link="?nav=module_e"), unsafe_allow_html=True)

    c6, c7, c8, c9, c10 = st.columns(5)
    with c6: st.markdown(create_card_html("F", "信用压力", "Credit", score_f, chg_f, "7.5%", desc_f, link="?nav=module_f"), unsafe_allow_html=True)
    with c7: st.markdown(create_card_html("G", "风险偏好", "Risk", score_g, chg_g, "7.5%", desc_g, link="?nav=module_g"), unsafe_allow_html=True)

    # --------------------------------------------------------
    # 5. Top Score Lift / Drag（主要改善与拖累）
    # --------------------------------------------------------
    def _collect_factor_delta(factors, label, series, module_weight, bucket):
        if series is None:
            return
        s = pd.Series(series).dropna()
        if s.shape[0] < 2:
            return
        now = float(s.iloc[-1]) * module_weight
        prev = float(prev_week_value(s)) * module_weight
        factors.append({"name": label, "delta": now - prev, "bucket": bucket})

    factor_deltas = []

    # A 模块分解
    _collect_factor_delta(
        factor_deltas,
        "Net Liquidity",
        df_a['Score_NetLiq_Adj'] * 0.45 * df_a['TGA_Penalty_Total'],
        0.20,
        "Flow"
    )
    _collect_factor_delta(factor_deltas, "TGA", df_a['Score_TGA'] * 0.20 * df_a['TGA_Penalty_Total'], 0.20, "Flow")
    _collect_factor_delta(factor_deltas, "ON RRP", df_a['Score_RRP'] * 0.25 * df_a['TGA_Penalty_Total'], 0.20, "Flow")
    _collect_factor_delta(factor_deltas, "Reserves", df_a['Score_Reserves'] * 0.10 * df_a['TGA_Penalty_Total'], 0.20, "Level")
    _collect_factor_delta(
        factor_deltas,
        "TGA Penalty",
        (
            (df_a['Score_NetLiq_Adj'] * 0.45 + df_a['Score_TGA'] * 0.20 + df_a['Score_RRP'] * 0.25 + df_a['Score_Reserves'] * 0.10)
            * (df_a['TGA_Penalty_Total'] - 1.0)
        ),
        0.20,
        "Penalty"
    )
    _collect_factor_delta(
        factor_deltas,
        "Sink Penalty",
        (
            (df_a['Score_NetLiq_Adj'] - df_a['Score_NetLiq']) * 0.45 * df_a['TGA_Penalty_Total']
        ),
        0.20,
        "Penalty"
    )

    # B 模块分解
    b_res = 1 - df_b['SRF_Weight']
    _collect_factor_delta(factor_deltas, "SOFR Policy", df_b['Score_Policy'] * 0.40, 0.20, "Level")
    _collect_factor_delta(factor_deltas, "F1 Friction", df_b['Score_F1'] * b_res * 0.40 * 0.60, 0.20, "Flow")
    _collect_factor_delta(factor_deltas, "F2 Friction", df_b['Score_F2'] * b_res * 0.30 * 0.60, 0.20, "Flow")
    _collect_factor_delta(factor_deltas, "F3 Friction", df_b['Score_F3'] * b_res * 0.30 * 0.60, 0.20, "Flow")
    _collect_factor_delta(factor_deltas, "SRF", df_b['Score_SRF'] * df_b['SRF_Weight'] * 0.60, 0.20, "Penalty")

    # C 模块分解
    _collect_factor_delta(factor_deltas, "10Y Nominal Rate", df_c['Score_10Y'] * 0.20, 0.15, "Level")
    _collect_factor_delta(factor_deltas, "2Y Rate", df_c['Score_2Y'] * 0.10, 0.15, "Level")
    _collect_factor_delta(factor_deltas, "30Y Rate", df_c['Score_30Y'] * 0.10, 0.15, "Level")
    _collect_factor_delta(factor_deltas, "2s10s Curve", df_c['Score_Curve_2s10s'] * 0.30, 0.15, "Flow")
    _collect_factor_delta(factor_deltas, "3m10s Curve", df_c['Score_Curve_3m10s'] * 0.30, 0.15, "Flow")
    _collect_factor_delta(
        factor_deltas,
        "Curve Penalty",
        df_c['Total_Score'] - df_c['Total_Score1'],
        0.15,
        "Penalty"
    )

    # D 模块分解
    _collect_factor_delta(factor_deltas, "10Y Real Rate", df_d['Score_Real_10Y'] * 0.40, 0.15, "Level")
    _collect_factor_delta(factor_deltas, "5Y Real Rate", df_d['Score_Real_5Y'] * 0.30, 0.15, "Level")
    _collect_factor_delta(factor_deltas, "10Y Breakeven", df_d['Score_Breakeven'] * 0.30, 0.15, "Flow")

    # E 模块分解
    _collect_factor_delta(factor_deltas, "DXY", df_e['Score_DXY'] * 0.20, 0.15, "Flow")
    _collect_factor_delta(factor_deltas, "Broad USD", df_e['Score_USD'] * 0.20, 0.15, "Flow")
    _collect_factor_delta(factor_deltas, "Yen/Carry", df_e['Score_Yen_Total'] * 0.30, 0.15, "Flow")
    _collect_factor_delta(factor_deltas, "Energy", df_e['Score_Energy'] * 0.30, 0.15, "Flow")

    # F/G 模块分解
    if not df_f.empty:
        _collect_factor_delta(factor_deltas, "HY Credit", df_f['Score_HY_Level'] * 0.50, 0.075, "Level")
        _collect_factor_delta(factor_deltas, "BAA10Y", df_f['Score_BAA_Level'] * 0.20, 0.075, "Level")
        _collect_factor_delta(factor_deltas, "HY Trend", df_f['Score_HY_Trend'] * 0.30, 0.075, "Flow")
    if not df_g.empty:
        _collect_factor_delta(factor_deltas, "VIX", df_g['Score_VIX'] * 0.30, 0.075, "Level")
        _collect_factor_delta(factor_deltas, "VIX/VXV", df_g['Score_Term'] * 0.40, 0.075, "Level")
        _collect_factor_delta(factor_deltas, "Risk vs Safe", df_g['Score_Mom'] * 0.30, 0.075, "Flow")

    section_header("Top Score Lift / Drag")

    if factor_deltas:
        factor_delta_df = pd.DataFrame(factor_deltas)
        lifts = factor_delta_df[factor_delta_df["delta"] > 0].sort_values("delta", ascending=False).head(3)
        drags = factor_delta_df[factor_delta_df["delta"] < 0].sort_values("delta", ascending=True).head(3)
        bucket_delta = factor_delta_df.groupby("bucket")["delta"].sum().reindex(["Level", "Flow", "Penalty"]).fillna(0.0)
        level_delta = float(bucket_delta["Level"])
        flow_delta = float(bucket_delta["Flow"])
        penalty_delta = float(bucket_delta["Penalty"])
        structural_delta = level_delta + penalty_delta
        driver_text = "结构性变化主导" if abs(structural_delta) >= abs(flow_delta) else "短期波动主导"

        c_lift, c_drag = st.columns(2)
        with c_lift:
            rows = "".join(
                [
                    f"""<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px dashed #f3f4f6;">
                    <span style="color:#111827;">{r['name']}</span>
                    <span style="color:#16a34a; font-weight:700;">▲ {abs(r['delta']):.1f} pts</span>
                    </div>"""
                    for _, r in lifts.iterrows()
                ]
            ) if not lifts.empty else """<div class="text-dim" style="padding:12px 0;">本周暂无明显正向抬升。</div>"""

            st.markdown(
                f"""<div class="term-card" style="padding:18px;">
                <div style="font-size:30px; font-weight:800; color:#16a34a; line-height:1;">↗</div>
                <div style="font-size:24px; font-weight:800; color:#111827; margin-top:2px;">Score Lift</div>
                <div class="text-dim" style="margin-bottom:6px;">改善总分</div>
                {rows}
                </div>""",
                unsafe_allow_html=True
            )

        b1, b2, b3 = st.columns(3)
        with b1:
            st.markdown(
                f"""<div class="term-card" style="padding:14px; margin-top:-6px;">
                <div class="text-dim">Level 贡献（结构）</div>
                <div style="font-size:24px; font-weight:800; color:{'#16a34a' if level_delta >= 0 else '#dc2626'};">{level_delta:+.2f} pts</div>
                </div>""",
                unsafe_allow_html=True
            )
        with b2:
            st.markdown(
                f"""<div class="term-card" style="padding:14px; margin-top:-6px;">
                <div class="text-dim">Flow 贡献（短期）</div>
                <div style="font-size:24px; font-weight:800; color:{'#16a34a' if flow_delta >= 0 else '#dc2626'};">{flow_delta:+.2f} pts</div>
                </div>""",
                unsafe_allow_html=True
            )
        with b3:
            st.markdown(
                f"""<div class="term-card" style="padding:14px; margin-top:-6px;">
                <div class="text-dim">Penalty 贡献（结构）</div>
                <div style="font-size:24px; font-weight:800; color:{'#16a34a' if penalty_delta >= 0 else '#dc2626'};">{penalty_delta:+.2f} pts</div>
                </div>""",
                unsafe_allow_html=True
            )

        st.markdown(
            f"""<div class="term-card" style="padding:14px; margin-top:-10px;">
            <div style="font-weight:700; color:#111827;">本周总分变化归因: {driver_text}</div>
            <div class="text-dim" style="margin-top:6px;">
            结构性变化 = Level + Penalty = <b>{structural_delta:+.2f} pts</b>；
            短期波动 = Flow = <b>{flow_delta:+.2f} pts</b>。
            </div>
            </div>""",
            unsafe_allow_html=True
        )

        with c_drag:
            rows = "".join(
                [
                    f"""<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px dashed #f3f4f6;">
                    <span style="color:#111827;">{r['name']}</span>
                    <span style="color:#dc2626; font-weight:700;">▼ {abs(r['delta']):.1f} pts</span>
                    </div>"""
                    for _, r in drags.iterrows()
                ]
            ) if not drags.empty else """<div class="text-dim" style="padding:12px 0;">本周暂无明显负向拖累。</div>"""

            st.markdown(
                f"""<div class="term-card" style="padding:18px;">
                <div style="font-size:30px; font-weight:800; color:#dc2626; line-height:1;">↘</div>
                <div style="font-size:24px; font-weight:800; color:#111827; margin-top:2px;">Score Drag</div>
                <div class="text-dim" style="margin-bottom:6px;">拖累总分</div>
                {rows}
                </div>""",
                unsafe_allow_html=True
            )

    # --------------------------------------------------------
    # 6. 模块热力图（周频）
    # --------------------------------------------------------
    section_header("模块状态热力图（周频）")

    base_idx = df_all.index
    module_hist = pd.DataFrame(
        {
            "系统流动性": df_a["Total_Score"].reindex(base_idx, method="ffill"),
            "资金价格/应急闸": df_b["Total_Score"].reindex(base_idx, method="ffill"),
            "国债供给与市场功能": df_c["Total_Score"].reindex(base_idx, method="ffill"),
            "利率预期与真实利": df_d["Total_Score"].reindex(base_idx, method="ffill"),
            "信用与银行": (df_f["Total_Score"].reindex(base_idx, method="ffill") if not df_f.empty else pd.Series(50.0, index=base_idx)),
            "风险偏好与波动": (df_g["Total_Score"].reindex(base_idx, method="ffill") if not df_g.empty else pd.Series(50.0, index=base_idx)),
            "外部冲击与成本": df_e["Total_Score"].reindex(base_idx, method="ffill"),
        },
        index=base_idx,
    )
    module_weekly = module_hist.resample("W-FRI").last().dropna(how="all").tail(26)

    if module_weekly.empty:
        st.info("热力图数据不足，稍后刷新。")
    else:
        module_names = list(module_weekly.columns)
        weekly_scores = module_weekly.T.values
        heat_z = np.where(
            weekly_scores < 33, 0,
            np.where(weekly_scores < 55, 1, np.where(weekly_scores < 66, 2, 3))
        )
        week_labels = [f"W{int(ts.isocalendar().week):02d}" for ts in module_weekly.index]
        week_idx = list(range(len(week_labels)))
        tick_vals = [i for i in week_idx if i % 4 == 0 or i == week_idx[-1]]
        tick_text = [week_labels[i] for i in tick_vals]

        fig_heat = go.Figure(
            data=go.Heatmap(
                z=heat_z,
                x=week_idx,
                y=module_names,
                customdata=weekly_scores,
                colorscale=[
                    [0.00, "#fca5a5"], [0.24, "#fca5a5"],
                    [0.25, "#fde68a"], [0.49, "#fde68a"],
                    [0.50, "#bbf7d0"], [0.74, "#bbf7d0"],
                    [0.75, "#86efac"], [1.00, "#86efac"],
                ],
                zmin=0,
                zmax=3,
                showscale=False,
                xgap=4,
                ygap=4,
                hovertemplate="周次: %{text}<br>模块: %{y}<br>得分: %{customdata:.1f}<extra></extra>",
                text=np.array([week_labels for _ in module_names]),
            )
        )
        fig_heat.update_layout(
            height=410,
            margin=dict(l=10, r=10, t=8, b=8),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            xaxis=dict(
                tickmode="array",
                tickvals=tick_vals,
                ticktext=tick_text,
                showgrid=False,
                zeroline=False,
                tickfont=dict(color="#9ca3af"),
            ),
            yaxis=dict(
                autorange="reversed",
                showgrid=False,
                zeroline=False,
                tickfont=dict(color="#6b7280", size=14),
            ),
        )
        st.plotly_chart(fig_heat, use_container_width=True)
        st.markdown(
            """<div style="display:flex; gap:22px; flex-wrap:wrap; margin-top:8px;">
            <span style="display:inline-flex; align-items:center; gap:7px;"><span style="width:12px;height:12px;border-radius:4px;background:#fca5a5;"></span>&lt;33</span>
            <span style="display:inline-flex; align-items:center; gap:7px;"><span style="width:12px;height:12px;border-radius:4px;background:#fde68a;"></span>33-55</span>
            <span style="display:inline-flex; align-items:center; gap:7px;"><span style="width:12px;height:12px;border-radius:4px;background:#bbf7d0;"></span>55-66</span>
            <span style="display:inline-flex; align-items:center; gap:7px;"><span style="width:12px;height:12px;border-radius:4px;background:#86efac;"></span>≥66</span>
            </div>""",
            unsafe_allow_html=True
        )

    # --------------------------------------------------------
    # 7. Regime 看板（四象限）
    # --------------------------------------------------------
    section_header("Regime 看板（复苏 / 过热 / 滞胀 / 放缓）")
    reg = ensure_df(df_all, ["INDPRO", "PCEPILFE"]).copy()
    if reg.empty:
        st.info("Regime 数据不足（需要 INDPRO/PCEPILFE）。")
    else:
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
            st.info("Regime 数据样本不足（至少需要12个月有效数据）。")
        else:
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
            regime_code_map = {"放缓": 0, "复苏": 1, "过热": 2, "滞胀": 3}
            reg_view = reg_m.tail(30).copy()
            reg_view["Regime_Code"] = reg_view["Regime"].map(regime_code_map).astype(float)
            reg_now = reg_view.iloc[-1]
            switches = reg_view[reg_view["Regime"] != reg_view["Regime"].shift(1)]
            if switches.shape[0] > 1:
                sw = switches.iloc[-1]
                sw_dt = switches.index[-1].strftime("%Y-%m")
                reason_bits = []
                prev_idx = reg_view.index.get_loc(switches.index[-1]) - 1
                if prev_idx >= 0:
                    prev_row = reg_view.iloc[prev_idx]
                    if np.sign(sw["Growth_Z"]) != np.sign(prev_row["Growth_Z"]):
                        reason_bits.append("增长动能穿越阈值(0)")
                    if np.sign(sw["Infl_Z"]) != np.sign(prev_row["Infl_Z"]):
                        reason_bits.append("通胀压力穿越阈值(0)")
                sw_reason = " + ".join(reason_bits) if reason_bits else "增长/通胀组合发生切换"
                sw_text = f"最近切换: {sw_dt} → {sw['Regime']}（{sw_reason}）"
            else:
                sw_text = "最近区间未发生象限切换。"

            rc1, rc2 = st.columns([1.1, 1.9])
            with rc1:
                st.markdown(
                    f"""<div class="term-card" style="padding:16px;">
                    <div style="font-weight:800; font-size:18px; color:#111827;">当前状态: {reg_now['Regime']}</div>
                    <div class="text-dim" style="margin-top:8px;">阈值: Growth_Z=0 / CorePCE_Z=0</div>
                    <div style="margin-top:6px;">增长动能 Z: <b>{reg_now['Growth_Z']:+.2f}</b></div>
                    <div style="margin-top:4px;">通胀压力 Z: <b>{reg_now['Infl_Z']:+.2f}</b></div>
                    <div class="text-dim" style="margin-top:10px;">{sw_text}</div>
                    </div>""",
                    unsafe_allow_html=True,
                )
            with rc2:
                fig_reg = go.Figure(
                    data=go.Heatmap(
                        z=[reg_view["Regime_Code"].values],
                        x=list(range(reg_view.shape[0])),
                        y=["Regime"],
                        text=np.array([[d.strftime("%Y-%m") for d in reg_view.index]]),
                        customdata=np.array([reg_view["Regime"].values]),
                        hovertemplate="日期: %{text}<br>状态: %{customdata}<extra></extra>",
                        colorscale=[
                            [0.00, "#93c5fd"], [0.24, "#93c5fd"],  # 放缓
                            [0.25, "#86efac"], [0.49, "#86efac"],  # 复苏
                            [0.50, "#fb923c"], [0.74, "#fb923c"],  # 过热
                            [0.75, "#fca5a5"], [1.00, "#fca5a5"],  # 滞胀
                        ],
                        zmin=0,
                        zmax=3,
                        showscale=False,
                        xgap=3,
                        ygap=3,
                    )
                )
                tv = [i for i in range(reg_view.shape[0]) if i % 4 == 0 or i == reg_view.shape[0] - 1]
                tt = [reg_view.index[i].strftime("%y-%m") for i in tv]
                fig_reg.update_layout(
                    height=170,
                    margin=dict(l=8, r=8, t=8, b=8),
                    paper_bgcolor="rgba(0,0,0,0)",
                    plot_bgcolor="rgba(0,0,0,0)",
                    xaxis=dict(
                        tickmode="array",
                        tickvals=tv,
                        ticktext=tt,
                        showgrid=False,
                        zeroline=False,
                        tickfont=dict(color="#9ca3af"),
                    ),
                    yaxis=dict(showgrid=False, zeroline=False, tickfont=dict(color="#6b7280")),
                )
                st.plotly_chart(fig_reg, use_container_width=True)
                st.markdown(
                    """<div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:2px;">
                    <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:#86efac;"></span>复苏</span>
                    <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:#fb923c;"></span>过热</span>
                    <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:#fca5a5;"></span>滞胀</span>
                    <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:#93c5fd;"></span>放缓</span>
                    </div>""",
                    unsafe_allow_html=True,
                )

    # --------------------------------------------------------
    # 8. 实时市场看板（跨资产）
    # --------------------------------------------------------
    st.markdown("<br>", unsafe_allow_html=True)
    section_header("实时市场看板")
    st.caption("实时数据源: Yahoo Finance（存在延迟）。用于跟踪跨资产盘面结构，不直接覆盖模块打分。")

    rt_y10_bps, rt_hyg_chg = np.nan, np.nan
    rt = _get_rt_market_snapshot()
    if rt.empty:
        st.info("实时数据拉取失败，稍后刷新。")
    else:
        zn = rt["ZN=F"] if "ZN=F" in rt.columns else pd.Series(dtype=float)
        zb = rt["ZB=F"] if "ZB=F" in rt.columns else pd.Series(dtype=float)
        y5 = rt["^FVX"] if "^FVX" in rt.columns else pd.Series(dtype=float)
        y10 = rt["^TNX"] if "^TNX" in rt.columns else pd.Series(dtype=float)
        y30 = rt["^TYX"] if "^TYX" in rt.columns else pd.Series(dtype=float)
        spx_rt = rt["^GSPC"] if "^GSPC" in rt.columns else pd.Series(dtype=float)
        ixic_rt = rt["^IXIC"] if "^IXIC" in rt.columns else pd.Series(dtype=float)
        lqd_rt = rt["LQD"] if "LQD" in rt.columns else pd.Series(dtype=float)
        hyg_rt = rt["HYG"] if "HYG" in rt.columns else pd.Series(dtype=float)
        jnk_rt = rt["JNK"] if "JNK" in rt.columns else pd.Series(dtype=float)
        gld_rt = rt["GLD"] if "GLD" in rt.columns else pd.Series(dtype=float)
        dxy_rt = rt["DX-Y.NYB"] if "DX-Y.NYB" in rt.columns else pd.Series(dtype=float)
        usdjpy_rt = rt["JPY=X"] if "JPY=X" in rt.columns else pd.Series(dtype=float)

        zn_last, zn_chg = _last_pct_chg(zn)
        zb_last, zb_chg = _last_pct_chg(zb)
        spx_last, spx_chg = _last_pct_chg(spx_rt)
        ixic_last, ixic_chg = _last_pct_chg(ixic_rt)
        lqd_last, lqd_chg = _last_pct_chg(lqd_rt)
        hyg_last, hyg_chg = _last_pct_chg(hyg_rt)
        jnk_last, jnk_chg = _last_pct_chg(jnk_rt)
        gld_last, gld_chg = _last_pct_chg(gld_rt)
        dxy_last, dxy_chg = _last_pct_chg(dxy_rt)
        usdjpy_last, usdjpy_chg = _last_pct_chg(usdjpy_rt)

        y5_last, y5_diff = _last_diff(y5, scale=0.1)
        y10_last, y10_diff = _last_diff(y10, scale=0.1)
        y30_last, y30_diff = _last_diff(y30, scale=0.1)
        y5_bps = y5_diff * 100.0 if pd.notna(y5_diff) else np.nan
        y10_bps = y10_diff * 100.0 if pd.notna(y10_diff) else np.nan
        y30_bps = y30_diff * 100.0 if pd.notna(y30_diff) else np.nan
        rt_y10_bps = y10_bps
        rt_hyg_chg = hyg_chg

        bull_flattener = (
            pd.notna(y30_bps) and pd.notna(y5_bps) and
            (y30_bps < 0) and (y5_bps < 0) and
            (abs(y30_bps) > abs(y5_bps))
        )
        credit_stable = (
            pd.notna(lqd_chg) and pd.notna(hyg_chg) and pd.notna(jnk_chg) and
            (lqd_chg >= 0) and (hyg_chg > -0.6) and (jnk_chg > -0.6)
        )
        no_usd_squeeze = (
            pd.notna(dxy_chg) and pd.notna(usdjpy_chg) and
            (abs(dxy_chg) < 0.5) and (usdjpy_chg <= 0)
        )
        growth_reprice = (
            bull_flattener and pd.notna(spx_chg) and pd.notna(ixic_chg) and
            (spx_chg < 0) and (ixic_chg < 0)
        )

        r1, r2, r3, r4 = st.columns(4)
        with r1:
            st.markdown(
                f"""<div class="term-card" style="padding:16px;">
                <div class="text-dim">债市先行动量</div>
                <div style="font-weight:700; color:#111827;">ZN {_fmt_rt_delta(zn_chg, 2, '%')} · ZB {_fmt_rt_delta(zb_chg, 2, '%')}</div>
                <div class="text-dim" style="margin-top:6px;">ZN {_fmt_rt_num(zn_last)} / ZB {_fmt_rt_num(zb_last)}</div>
                </div>""",
                unsafe_allow_html=True
            )
        with r2:
            st.markdown(
                f"""<div class="term-card" style="padding:16px;">
                <div class="text-dim">收益率结构</div>
                <div style="font-weight:700; color:#111827;">30Y {_fmt_rt_delta(y30_bps, 1, 'bp')} · 5Y {_fmt_rt_delta(y5_bps, 1, 'bp')}</div>
                <div class="text-dim" style="margin-top:6px;">{"Bull Flattener" if bull_flattener else "非Bull Flattener"}</div>
                </div>""",
                unsafe_allow_html=True
            )
        with r3:
            st.markdown(
                f"""<div class="term-card" style="padding:16px;">
                <div class="text-dim">权益表现</div>
                <div style="font-weight:700; color:#111827;">IXIC {_fmt_rt_delta(ixic_chg, 2, '%')} · SPX {_fmt_rt_delta(spx_chg, 2, '%')}</div>
                <div class="text-dim" style="margin-top:6px;">风格切换/补跌监测</div>
                </div>""",
                unsafe_allow_html=True
            )
        with r4:
            st.markdown(
                f"""<div class="term-card" style="padding:16px;">
                <div class="text-dim">信用与美元</div>
                <div style="font-weight:700; color:#111827;">LQD {_fmt_rt_delta(lqd_chg, 2, '%')} · HYG {_fmt_rt_delta(hyg_chg, 2, '%')}</div>
                <div class="text-dim" style="margin-top:6px;">DXY {_fmt_rt_delta(dxy_chg, 2, '%')} · USDJPY {_fmt_rt_delta(usdjpy_chg, 2, '%')}</div>
                </div>""",
                unsafe_allow_html=True
            )

        verdicts = []
        if growth_reprice:
            verdicts.append("债券先行+权益回落：更像增长预期下修触发的估值重估。")
        if credit_stable:
            verdicts.append("信用维持稳定：暂不支持系统性信用冲击。")
        if no_usd_squeeze:
            verdicts.append("美元端平稳：暂不支持美元荒/全球挤兑交易。")
        if pd.notna(gld_chg) and pd.notna(y10_bps) and (gld_chg < 0) and (y10_bps < 0):
            verdicts.append("黄金与长端同向走弱：更偏向仓位去杠杆与流动性再分配。")
        if not verdicts:
            verdicts.append("当前是混合盘面，尚未形成单一高置信主线，建议等待下一交易日确认。")

        st.markdown("**实时结构结论**")
        for v in verdicts:
            st.markdown(f"- {v}")

        with st.expander("查看实时原始快照"):
            snap = pd.DataFrame([
                {"资产": "ZN=F", "最新": _fmt_rt_num(zn_last), "日变动": _fmt_rt_delta(zn_chg, 2, "%")},
                {"资产": "ZB=F", "最新": _fmt_rt_num(zb_last), "日变动": _fmt_rt_delta(zb_chg, 2, "%")},
                {"资产": "5Y收益率", "最新": _fmt_rt_num(y5_last, 2, "%"), "日变动": _fmt_rt_delta(y5_bps, 1, "bp")},
                {"资产": "10Y收益率", "最新": _fmt_rt_num(y10_last, 2, "%"), "日变动": _fmt_rt_delta(y10_bps, 1, "bp")},
                {"资产": "30Y收益率", "最新": _fmt_rt_num(y30_last, 2, "%"), "日变动": _fmt_rt_delta(y30_bps, 1, "bp")},
                {"资产": "IXIC", "最新": _fmt_rt_num(ixic_last), "日变动": _fmt_rt_delta(ixic_chg, 2, "%")},
                {"资产": "SPX", "最新": _fmt_rt_num(spx_last), "日变动": _fmt_rt_delta(spx_chg, 2, "%")},
                {"资产": "LQD", "最新": _fmt_rt_num(lqd_last), "日变动": _fmt_rt_delta(lqd_chg, 2, "%")},
                {"资产": "HYG", "最新": _fmt_rt_num(hyg_last), "日变动": _fmt_rt_delta(hyg_chg, 2, "%")},
                {"资产": "JNK", "最新": _fmt_rt_num(jnk_last), "日变动": _fmt_rt_delta(jnk_chg, 2, "%")},
                {"资产": "GLD", "最新": _fmt_rt_num(gld_last), "日变动": _fmt_rt_delta(gld_chg, 2, "%")},
                {"资产": "DXY", "最新": _fmt_rt_num(dxy_last), "日变动": _fmt_rt_delta(dxy_chg, 2, "%")},
                {"资产": "USDJPY", "最新": _fmt_rt_num(usdjpy_last), "日变动": _fmt_rt_delta(usdjpy_chg, 2, "%")}
            ])
            st.dataframe(snap, use_container_width=True, hide_index=True)

    # --------------------------------------------------------
    # 6. 参考图表 (TGA/SOFR联动 & 真理检验)
    # --------------------------------------------------------
    st.markdown("<br>", unsafe_allow_html=True)
    section_header("参考图表")
    col_chart_1, col_chart_2 = st.columns(2)
    
    with col_chart_1:
        # TGA / SOFR / SRF 资金联动监测
        latest_tga = df_all['WTREGEN'].iloc[-1]
        prev_tga_week = df_all['WTREGEN'].iloc[-8]
        latest_srf = df_all['RPONTSYD'].iloc[-1]
        latest_sofr = df_all['SOFR'].iloc[-1]
        prev_sofr_month = df_all['SOFR'].iloc[-30]
        
        # 积分计算逻辑 (原样保留)
        score = 0
        tga_diff = (latest_tga - prev_tga_week) / 1000
        if tga_diff < -10: score += 1
        elif tga_diff > 10: score -= 1
        
        if latest_tga >= 900: score -= 3
        elif latest_tga >= 850: score -= 2
        elif latest_tga >= 800: score -= 1
            
        if latest_srf < 5: score += 1
        elif latest_srf > 50: score -= 2
        
        sofr_diff = latest_sofr - prev_sofr_month
        if sofr_diff < -0.05: score += 1
        elif sofr_diff > 0.10: score -= 1
        
        if score >= 1:
            status_text = f"🟢 NET INFLOW [积分:{score}]"
            status_color = "#34c759"
        elif score <= -1:
            status_text = f"🔴 NET OUTFLOW [积分:{score}]"
            status_color = "#ff3b30"
        else:
            status_text = "⚪ NEUTRAL"
            status_color = "#d4af37"

        st.markdown(f"""<div class="term-card"><div style="font-weight:bold; color:#111827; margin-bottom:10px;">TGA / SOFR 联动监测 <span style="color:{status_color}; margin-left:10px;">{status_text}</span></div></div>""", unsafe_allow_html=True)
        
        dview = df_all[df_all.index >= '2023-01-01']
        fig_cross = go.Figure()
        fig_cross.add_trace(go.Scatter(x=dview.index, y=dview['WTREGEN']/1000, name='TGA ($B)', fill='tozeroy', line=dict(width=0), fillcolor='rgba(128,128,128,0.15)'))
        fig_cross.add_trace(go.Scatter(x=dview.index, y=dview['SOFR'], name='SOFR (%)', yaxis='y2', line=dict(color='#0068c9', width=2)))
        fig_cross.add_trace(go.Bar(x=dview.index, y=dview['RPONTSYD'], name='SRF ($B)', yaxis='y2', marker_color='rgba(255,43,43,0.6)'))
        
        fig_cross.update_layout(
            height=300, 
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
            yaxis=dict(title="TGA ($B)", showgrid=False, title_font=dict(color='#374151'), tickfont=dict(color='#9ca3af')),
            yaxis2=dict(title="Rate / SRF", overlaying='y', side='right', showgrid=True, gridcolor='#f3f4f6', title_font=dict(color='#374151'), tickfont=dict(color='#9ca3af')),
            xaxis=dict(showgrid=False, tickfont=dict(color='#9ca3af')),
            legend=dict(orientation="h", y=-0.2, font=dict(color="#4b5563")), 
            margin=dict(t=10, b=10, l=10, r=10), hovermode="x unified"
        )
        st.plotly_chart(fig_cross, use_container_width=True)
        

    with col_chart_2:
        # 宏观分 vs 风险资产 (真理检验)
        st.markdown(f"""<div class="term-card"><div style="font-weight:bold; color:#111827; margin-bottom:10px;">真理检验: 宏观分 vs SPX/BTC</div></div>""", unsafe_allow_html=True)
        
        valid_view = df_all[df_all.index >= (datetime.now() - timedelta(days=1080))]
        valid_score = s_total_hist.reindex(valid_view.index, method='ffill')
        
        fig_spx = go.Figure()
        fig_spx.add_trace(go.Scatter(x=valid_view.index, y=valid_score, name='宏观得分', line=dict(color='#09ab3b', width=2), fill='tozeroy', fillcolor='rgba(9,171,59,0.1)'))
        
        if 'SP500' in df_all.columns:
            fig_spx.add_trace(go.Scatter(x=valid_view.index, y=valid_view['SP500'], name='S&P 500', line=dict(color='#d4af37', width=1.5, dash='dot'), yaxis='y2'))
        if 'CBBTCUSD' in df_all.columns:
            fig_spx.add_trace(go.Scatter(x=valid_view.index, y=valid_view['CBBTCUSD'], name='Bitcoin', line=dict(color='#f7931a', width=1.5, dash='dot'), yaxis='y3'))

        fig_spx.update_layout(
            height=300,
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
            yaxis=dict(title="Score", range=[0,100], showgrid=False, tickfont=dict(color='#9ca3af')),
            yaxis2=dict(title="SPX", overlaying='y', side='right', showgrid=True, gridcolor='#f3f4f6', tickfont=dict(color='#d97706')),
            yaxis3=dict(overlaying='y', side='right', position=0.95, showgrid=False, tickfont=dict(color='#ea580c'), showticklabels=False),
            xaxis=dict(showgrid=False, tickfont=dict(color='#9ca3af')),
            legend=dict(orientation="h", y=-0.2, font=dict(color="#4b5563")),
            margin=dict(t=10, b=10, l=10, r=10), hovermode="x unified"
        )
        st.plotly_chart(fig_spx, use_container_width=True)

    # --------------------------------------------------------
    # 6. 风险雷达 (Text Output)
    # --------------------------------------------------------
    section_header("风险雷达")
    risk_items = []
    context_notes = []

    def add_risk(level, title, trigger, off):
        risk_items.append({"level": level, "title": title, "trigger": trigger, "off": off})

    tga_val_check = tga_curr / 1000 if tga_curr > 10000 else tga_curr
    if tga_val_check >= 800:
        p_val = "0.5x" if tga_val_check >= 900 else ("0.6x" if tga_val_check >= 850 else "0.8x")
        add_risk(
            "red" if tga_val_check >= 900 else "orange",
            f"A模块 (TGA惩罚): 流动性抽水加剧，惩罚系数 {p_val}",
            f"TGA 水位 {tga_val_check:.0f}B >= 800B。",
            "TGA 重新回落至 <800B 且 4周变化转负。"
        )
    if score_a < 40:
        add_risk(
            "red",
            f"A模块 (流动性): 整体流动性偏紧，得分 {score_a:.1f}",
            "A模块得分跌破 40。",
            "A模块得分连续两周回到 >=45。"
        )

    if df_all['RPONTSYD'].iloc[-1] > 10:
        add_risk(
            "red",
            "B模块 (资金面): 应急融资启动",
            f"SRF 使用量 {df_all['RPONTSYD'].iloc[-1]:.1f}B > 10B。",
            "SRF 回落到 5B 以下并维持 3 个交易日。"
        )
    elif df_all['SOFR'].iloc[-1] > df_all['IORB'].iloc[-1]:
        add_risk(
            "orange",
            "B模块 (资金面): 资金价格偏贵",
            f"SOFR {df_all['SOFR'].iloc[-1]:.2f}% 高于 IORB {df_all['IORB'].iloc[-1]:.2f}%。",
            "SOFR 回落至 IORB 下方并持续 2-3 天。"
        )

    if df_c['Penalty_Factor'].iloc[-1] < 1.0:
        add_risk(
            "red",
            "C模块 (国债): 长端利率急涨，估值压力增加",
            f"长端斜率惩罚触发，Penalty={df_c['Penalty_Factor'].iloc[-1]:.1f}x。",
            "Penalty 恢复到 1.0x 且 10Y 60日斜率回到温和区间。"
        )
    elif df_all['T10Y2Y'].iloc[-1] < -0.5:
        add_risk(
            "orange",
            "C模块 (国债): 曲线深度倒挂",
            f"2s10s={df_all['T10Y2Y'].iloc[-1]:.2f} (< -0.50)。",
            "2s10s 回升至 > -0.20 且保持。"
        )

    if df_all['DFII10'].iloc[-1] > 2.0:
        add_risk(
            "orange",
            "D模块 (实利): 实际利率偏高",
            f"10Y 实际利率 {df_all['DFII10'].iloc[-1]:.2f}% > 2.0%。",
            "10Y 实际利率回落至 <1.8%。"
        )

    try:
        if df_all['DEXJPUS'].pct_change(5).iloc[-1] < -0.03:
            add_risk(
                "red",
                "E模块 (汇率): 套息退潮风险",
                f"USDJPY 5日变动 {df_all['DEXJPUS'].pct_change(5).iloc[-1]*100:.1f}% < -3%。",
                "USDJPY 波动收敛且回到 -1%~+1% 区间。"
            )
    except Exception:
        pass

    try:
        if df_all['DCOILWTICO'].pct_change(20).iloc[-1] > 0.15:
            add_risk(
                "orange",
                "E模块 (能源): 通胀再抬头风险",
                f"WTI 20日涨幅 {df_all['DCOILWTICO'].pct_change(20).iloc[-1]*100:.1f}% > 15%。",
                "WTI 20日涨幅回落至 <8%。"
            )
    except Exception:
        pass

    if not df_f.empty and (score_f < 40 or df_f['HY_Spread'].iloc[-1] > 6.0 or df_f['BAA10Y'].iloc[-1] > 3.0):
        add_risk(
            "red",
            "F模块 (信用): 信用压力升温",
            f"HY={df_f['HY_Spread'].iloc[-1]:.2f}% / BAA10Y={df_f['BAA10Y'].iloc[-1]:.2f}%。",
            "HY 低于 5% 且 BAA10Y 低于 2.5%。"
        )

    if not df_g.empty and (score_g < 40 or df_g['VIX'].iloc[-1] > 25 or df_g['VIX_VXV'].iloc[-1] > 1.0):
        add_risk(
            "red",
            "G模块 (风险偏好): 风险厌恶升温",
            f"VIX={df_g['VIX'].iloc[-1]:.1f} / VIX/VXV={df_g['VIX_VXV'].iloc[-1]:.2f}。",
            "VIX 回落至 20 以下且 VIX/VXV 低于 0.95。"
        )

    # 盘面验证补充（用户指定示例逻辑）
    if pd.notna(rt_y10_bps) and pd.notna(rt_hyg_chg) and (rt_y10_bps <= -5) and (rt_hyg_chg > -0.3):
        context_notes.append(
            f"估值压缩但非系统信用风险: 10Y {rt_y10_bps:+.1f}bp，HYG {rt_hyg_chg:+.2f}% 未明显走扩。"
        )

    if not risk_items:
        st.markdown(
            """<div class="term-card" style="border-left: 4px solid #059669; background:#ecfdf5;">
            <div style="color:#065f46; font-weight:bold;">✅ SYSTEM NOMINAL</div>
            <div style="color:#374151; font-size:13px; margin-top:5px;">宏观环境相对平稳。</div>
            </div>""",
            unsafe_allow_html=True
        )
    else:
        level_color = {"red": "#dc2626", "orange": "#ea580c", "yellow": "#ca8a04"}
        level_icon = {"red": "🔴", "orange": "🟠", "yellow": "🟡"}
        critical_count = sum(1 for x in risk_items if x["level"] == "red")
        items_html = "".join(
            [
                f"""<div style="margin-top:10px; padding:10px 0; border-top:1px dashed #fecaca;">
                <div style="font-weight:700; color:{level_color.get(r['level'], '#dc2626')};">{level_icon.get(r['level'], '🔴')} {r['title']}</div>
                <div style="color:#374151; font-size:13px; margin-top:5px;">触发条件: {r['trigger']}</div>
                <div style="color:#6b7280; font-size:13px; margin-top:2px;">失效条件: {r['off']}</div>
                </div>"""
                for r in risk_items
            ]
        )
        note_html = "".join([f"<div style='margin-top:6px; color:#14532d; font-size:13px;'>✅ {n}</div>" for n in context_notes])
        st.markdown(
            f"""<div class="term-card" style="border-left: 4px solid #dc2626; background:#fef2f2;">
            <div style="color:#991b1b; font-weight:bold;">⚠️ WARNING: {critical_count} CRITICAL RISKS / {len(risk_items)} TOTAL</div>
            {items_html}
            {note_html}
            """,
            unsafe_allow_html=True
        )

    # --------------------------------------------------------
    # 7. AI 宏观分析 (风险雷达下方)
    # --------------------------------------------------------
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown('<div id="ai-macro"></div>', unsafe_allow_html=True)
    section_header("AI 宏观分析")
    st.caption("基于当前宏观因子自动生成的研究报告")

    if 'ai_report' not in st.session_state:
        st.session_state.ai_report = None

    def clean_text_for_pdf(raw_text: str) -> str:
        if not raw_text:
            return ""
        txt = html.unescape(raw_text)
        txt = re.sub(r"<[^>]+>", "", txt)
        txt = txt.replace("\r\n", "\n")
        return txt

    def normalize_report_date(raw_text: str, cutoff_date: str) -> str:
        if not raw_text:
            return raw_text
        lines = [ln.rstrip() for ln in raw_text.splitlines()]
        kept = []
        for ln in lines:
            if re.search(r"(报告日期|发布日期)\s*[:：]", ln):
                continue
            kept.append(ln)
        body = "\n".join(kept).lstrip()
        header = f"报告日期（数据截止）: {cutoff_date}"
        if body.startswith(header):
            return body
        return f"{header}\n\n{body}"

    def build_pdf_bytes(text: str, title: str = "AI宏观分析报告") -> bytes:
        try:
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.cidfonts import UnicodeCIDFont

            pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
            buffer = io.BytesIO()
            c = canvas.Canvas(buffer, pagesize=A4)
            width, height = A4
            c.setFont("STSong-Light", 16)
            c.drawString(50, height - 50, title)
            c.setFont("STSong-Light", 10)
            y = height - 80
            for line in text.split("\n"):
                wrapped = textwrap.wrap(line, width=90) or [""]
                for wline in wrapped:
                    if y < 50:
                        c.showPage()
                        c.setFont("STSong-Light", 10)
                        y = height - 50
                    c.drawString(50, y, wline)
                    y -= 14
            c.save()
            buffer.seek(0)
            return buffer.getvalue()
        except Exception:
            # 兜底：返回空字节
            return b""

    col_left, col_right = st.columns([0.35, 0.65])
    with col_left:
        if st.button("生成AI宏观分析", type="primary", use_container_width=True):
            st.session_state.ai_request = True
    with col_right:
        if st.session_state.get("ai_report"):
            safe_text = clean_text_for_pdf(st.session_state.ai_report)
            pdf_bytes = build_pdf_bytes(safe_text, title="AI宏观分析报告")
            st.download_button(
                "下载PDF报告",
                data=pdf_bytes,
                file_name=f"macro_report_{df_all.index[-1].strftime('%Y-%m-%d')}.pdf",
                mime="application/pdf",
                use_container_width=False
            )
        else:
            st.download_button(
                "下载PDF报告",
                data=b"",
                file_name="macro_report.pdf",
                mime="application/pdf",
                use_container_width=False,
                disabled=True
            )

    if st.session_state.get("ai_request"):
        with st.spinner("🤖 正在生成宏观研究报告..."):
            # ---------- build structured AI context ----------
            def safe_hist_value(series, days_back):
                try:
                    target = series.index[-1] - pd.Timedelta(days=days_back)
                    idx = series.index.get_indexer([target], method='nearest')[0]
                    return float(series.iloc[idx])
                except Exception:
                    return float(series.iloc[-1])

            def classify_regime(val):
                if val < 30: return "Crisis"
                if val < 45: return "Weak"
                if val < 60: return "Neutral"
                return "Strong"

            def find_similar_periods(series, band=2.0, min_gap=90):
                if series is None or series.empty:
                    return []
                latest = series.iloc[-1]
                hits = series[(series >= latest - band) & (series <= latest + band)]
                hits = hits[hits.index <= (series.index[-1] - pd.Timedelta(days=min_gap))]
                return [d.strftime('%Y-%m-%d') for d in hits.tail(3).index]

            def forward_returns(prices, anchor_dates, horizon_days=63):
                if prices is None or prices.empty:
                    return []
                out = []
                for d in anchor_dates:
                    try:
                        anchor = prices.loc[:d].iloc[-1]
                        future = prices.loc[d:].iloc[:horizon_days].iloc[-1]
                        out.append(float((future / anchor - 1) * 100))
                    except Exception:
                        continue
                return out

            def percentile_rank(series, value):
                try:
                    return float(series.rank(pct=True).iloc[-1] * 100)
                except Exception:
                    return 50.0

            def identify_top_drivers(mod):
                if mod == "A":
                    return [
                        f"TGA {tga_val_check:.0f}B",
                        f"RRP {df_all['RRPONTSYD'].iloc[-1]:.1f}B",
                        f"NetLiqAdj {df_a['Score_NetLiq_Adj'].iloc[-1]:.1f}"
                    ]
                if mod == "B":
                    return [
                        f"SOFR {df_all['SOFR'].iloc[-1]:.2f}",
                        f"IORB {df_all['IORB'].iloc[-1]:.2f}",
                        f"SRF {df_all['RPONTSYD'].iloc[-1]:.1f}B"
                    ]
                if mod == "C":
                    return [
                        f"10Y-2Y {df_all['T10Y2Y'].iloc[-1]:.2f}",
                        f"10Y {df_all['DGS10'].iloc[-1]:.2f}",
                        f"Penalty {df_c['Penalty_Factor'].iloc[-1]:.1f}x"
                    ]
                if mod == "D":
                    return [
                        f"10Y Real {df_all['DFII10'].iloc[-1]:.2f}",
                        f"Breakeven {df_all['T10YIE'].iloc[-1]:.2f}"
                    ]
                if mod == "E":
                    return [
                        f"DXY chg {df_e['Chg_DXY'].iloc[-1]:.2%}",
                        f"Oil chg {df_e['Chg_Oil'].iloc[-1]:.2%}"
                    ]
                if mod == "F":
                    return [
                        f"HY {df_f['HY_Spread'].iloc[-1]:.2f}%",
                        f"BAA10Y {df_f['BAA10Y'].iloc[-1]:.2f}%"
                    ] if not df_f.empty else ["data limited"]
                if mod == "G":
                    return [
                        f"VIX {vix_now:.1f}",
                        f"VIX/VXV {term_now:.2f}",
                        f"SPX mom {df_g['Score_Mom'].iloc[-1]:.1f}" if not df_g.empty else "SPX mom n/a"
                    ]
                return []

            total_series = s_total_hist.reindex(df_all.index, method='ffill').dropna() if 's_total_hist' in locals() else pd.Series(dtype=float)
            total_now = float(total_series.iloc[-1]) if not total_series.empty else total_score
            total_1m = safe_hist_value(total_series, 30) if not total_series.empty else total_score
            total_3m = safe_hist_value(total_series, 90) if not total_series.empty else total_score
            total_1y = safe_hist_value(total_series, 365) if not total_series.empty else total_score

            spx = df_all['SP500'].dropna() if 'SP500' in df_all.columns else pd.Series(dtype=float)
            similar_dates = find_similar_periods(total_series)
            fwd_3m = forward_returns(spx, similar_dates, 63)

            report_cutoff_date = df_all.index[-1].strftime('%Y-%m-%d')
            report_cutoff_month = df_all.index[-1].strftime('%Y年%m月')
            context_obj = {
                "meta": {
                    "data_cutoff_date": report_cutoff_date,
                    "data_cutoff_month": report_cutoff_month,
                },
                "summary": {
                    "overall_score": round(total_now, 1),
                    "vs_1m": round(total_now - total_1m, 1),
                    "vs_3m": round(total_now - total_3m, 1),
                    "vs_1y": round(total_now - total_1y, 1)
                },
                "module_breakdown": [
                    {
                        "name": "Liquidity (A)",
                        "score": round(float(score_a), 1),
                        "key_drivers": identify_top_drivers("A"),
                        "historical_context": f"Score pct {percentile_rank(df_a['Total_Score'], score_a):.0f}"
                    },
                    {
                        "name": "Funding (B)",
                        "score": round(float(score_b), 1),
                        "key_drivers": identify_top_drivers("B"),
                        "historical_context": f"Score pct {percentile_rank(df_b['Total_Score'], score_b):.0f}"
                    },
                    {
                        "name": "Yield Curve (C)",
                        "score": round(float(score_c), 1),
                        "key_drivers": identify_top_drivers("C"),
                        "historical_context": f"Score pct {percentile_rank(df_c['Total_Score'], score_c):.0f}"
                    },
                    {
                        "name": "Real Rates (D)",
                        "score": round(float(score_d), 1),
                        "key_drivers": identify_top_drivers("D"),
                        "historical_context": f"Score pct {percentile_rank(df_d['Total_Score'], score_d):.0f}"
                    },
                    {
                        "name": "External (E)",
                        "score": round(float(score_e), 1),
                        "key_drivers": identify_top_drivers("E"),
                        "historical_context": f"Score pct {percentile_rank(df_e['Total_Score'], score_e):.0f}"
                    },
                    {
                        "name": "Credit (F)",
                        "score": round(float(score_f), 1),
                        "key_drivers": identify_top_drivers("F"),
                        "historical_context": f"Score pct {percentile_rank(df_f['Total_Score'], score_f):.0f}" if not df_f.empty else "n/a"
                    },
                    {
                        "name": "Risk Appetite (G)",
                        "score": round(float(score_g), 1),
                        "key_drivers": identify_top_drivers("G"),
                        "historical_context": f"Score pct {percentile_rank(df_g['Total_Score'], score_g):.0f}" if not df_g.empty else "n/a"
                    }
                ],
                "regime_analysis": {
                    "current": classify_regime(total_now),
                    "last_similar": similar_dates,
                    "what_happened_next": f"SPX 3M fwd returns: {', '.join([f'{x:.1f}%' for x in fwd_3m])}" if fwd_3m else "Not enough history"
                },
                "cross_asset_implications": {
                    "equities": "High real rates + inverted curve → Bearish",
                    "bonds": "Rising TGA + falling RRP → Duration risk",
                    "commodities": "Strong USD + energy spike → Mixed"
                }
            }

            prompt = f"""
            你是一位顶级宏观策略师。基于以下结构化数据写一份Deep Research 市场分析报告:
            {json.dumps(context_obj, ensure_ascii=False, indent=2)}

            强约束:
            1. 报告日期必须使用数据截止日：{report_cutoff_date}
            2. 如果你写月度表达，只能写：{report_cutoff_month}
            3. 不允许自行推断或虚构其它日期
            4. 报告第一行必须是：报告日期（数据截止）: {report_cutoff_date}

            请提供:
            1. 当前宏观环境定性 (1句话)
            2. 核心驱动因素分析 (Top 3)
            3. 历史相似情境对比
            4. 资产配置建议 (股/债/商品/现金/BTC)
            5. 关键风险点及触发条件
            6. 风格：专业、犀利、数据驱动
            """

            raw_ai_report = call_gemini_new_sdk(prompt, GEMINI_API_KEY)
            st.session_state.ai_report = normalize_report_date(raw_ai_report, report_cutoff_date)
        st.session_state.ai_request = False

    if st.session_state.ai_report:
        render_cutoff_date = df_all.index[-1].strftime('%Y-%m-%d')
        st.session_state.ai_report = normalize_report_date(st.session_state.ai_report, render_cutoff_date)
        st.markdown(
            f"""
            <div class="ai-report-container">
                <div class="ai-report-title">
                    <span style="font-size:24px;">🧠</span> AI 宏观研究报告
                </div>
                <div class="ai-content">
                    {st.session_state.ai_report}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.info("点击上方按钮生成最新 AI 宏观研究报告。")

    # 8. 说明书
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("📖 Dashboard 使用说明书"):
        st.markdown("""
        <div class="glossary-box" style="border-left: 4px solid #333;">
            <div class="glossary-title">宏观量化逻辑：模块风险判断 & 动态惩罚</div>
            <div class="glossary-content">
                本模型并非简单的加权平均，而是旨在模拟宏观环境的脆弱性。核心逻辑在于识别各个模块因子风险。<br><br>
                <b>1. 常态环境 (Normal Regime)：</b><br>
                当市场平稳时，A/B/C/D/E/F/G 按照 <b>20/20/15/15/15/7.5/7.5</b> 权重线性叠加，反映整体水位。<br><br>
                <b>2. 动态惩罚 - 坏的时候权重增大：</b><br>
                宏观环境危机往往由单一因子做为导火索从而引发更大规模的危机。为了捕捉这种非线性风险，模型内置了动态调控惩罚机制：
                <br>
                &nbsp;&nbsp;🛑 <b>A模块 (TGA 抽水)</b>：监测财政部账户存量。当 TGA > 800B 时触发阶梯惩罚系数 (0.8x / 0.6x / 0.5x)，即使趋势向好，高绝对水位也会强行压制得分。
                <br>
                &nbsp;&nbsp;🛑 <b>B模块 (SRF)</b>：一旦监测到银行开始使用 SRF (急救贷款)，说明流动性传导失效。此时 B 模块内部权重重组，SRF 权重瞬间拉满，直接拉低B模块总分。
                <br>
                &nbsp;&nbsp;🛑 <b>C模块 (利率急涨)</b>：市场不怕高利率，怕急涨。若 10Y/30Y 利率在 60天内快速上涨，C 模块总分会直接乘以惩罚系数 (例如 0.2-0.8x)，模拟“杀估值”效应。
                <br><br>
                <b>3. 如何解读“流入/流出”动态标题？</b><br>
                标题基于<b>积分权重制</b>判定。当 TGA 周度放水、SRF 闲置及资金成本稳定等因子贡献积分 ≥ 1 时，判定为 🟢 NET INFLOW。反之，若积分 ≤ -1 (如 TGA 高位且抽水)，则判定为 🔴 NET OUTFLOW。
                <br><br>
                <b>4. 如何使用本看板？</b><br>
                不要只看总分。请重点关注上方的风险雷达。如果出现红色警报，说明宏观环境的某一根支柱出现了裂痕，此时即便其他模块得分很高，整体环境也是极其脆弱的。
            </div>
        </div>
        """, unsafe_allow_html=True)

    # 底部版权
    st.markdown(
        """<div style="text-align:center; color:#475569; font-size:10px; font-family:monospace; margin-top:40px; border-top:1px solid rgba(255,255,255,0.05); padding-top:20px;">QUANT_MODEL_V1.2 // INTERNAL USE ONLY // POWERED BY STREAMLIT </div>""",
        unsafe_allow_html=True,
    )
