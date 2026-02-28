import streamlit as st
import pandas as pd
import numpy as np
import yfinance as yf
import plotly.graph_objects as go
import plotly.express as px


def _compute_macro_regime_series(df_all, target_index, z_window=60):
    """
    基于 工业产出(增长) + 核心PCE(通胀) 的 Z 分数生成四象限 Regime。
    """
    if df_all is None or df_all.empty:
        return pd.Series(index=target_index, dtype=object)
    if 'INDPRO' not in df_all.columns or 'PCEPILFE' not in df_all.columns:
        return pd.Series(index=target_index, dtype=object)

    src = df_all[['INDPRO', 'PCEPILFE']].copy().sort_index().ffill().dropna()
    if src.empty:
        return pd.Series(index=target_index, dtype=object)

    monthly = src.resample('M').last().ffill()
    monthly['IP_YoY'] = monthly['INDPRO'].pct_change(12) * 100
    monthly['PCE_YoY'] = monthly['PCEPILFE'].pct_change(12) * 100

    min_periods = max(24, int(z_window // 2))
    ip_mean = monthly['IP_YoY'].rolling(z_window, min_periods=min_periods).mean()
    ip_std = monthly['IP_YoY'].rolling(z_window, min_periods=min_periods).std()
    pce_mean = monthly['PCE_YoY'].rolling(z_window, min_periods=min_periods).mean()
    pce_std = monthly['PCE_YoY'].rolling(z_window, min_periods=min_periods).std()

    monthly['IP_Z'] = (monthly['IP_YoY'] - ip_mean) / ip_std.replace(0, np.nan)
    monthly['PCE_Z'] = (monthly['PCE_YoY'] - pce_mean) / pce_std.replace(0, np.nan)
    monthly = monthly.dropna(subset=['IP_Z', 'PCE_Z'])
    if monthly.empty:
        return pd.Series(index=target_index, dtype=object)

    conditions = [
        (monthly['IP_Z'] >= 0) & (monthly['PCE_Z'] >= 0),
        (monthly['IP_Z'] < 0) & (monthly['PCE_Z'] >= 0),
        (monthly['IP_Z'] < 0) & (monthly['PCE_Z'] < 0),
        (monthly['IP_Z'] >= 0) & (monthly['PCE_Z'] < 0),
    ]
    labels = [
        '过热(增长↑通胀↑)',
        '滞胀(增长↓通胀↑)',
        '衰退(增长↓通胀↓)',
        '复苏(增长↑通胀↓)',
    ]
    monthly['Macro_Regime'] = np.select(conditions, labels, default='未分类')
    return monthly['Macro_Regime'].reindex(target_index, method='ffill')


def _build_regime_validation(df, score_col='Total_Score', price_col='Price', regime_col='Macro_Regime'):
    """
    分 Regime 输出 forward 回报与相关性，检查“同向/背离”。
    """
    required = [score_col, price_col, regime_col]
    if any(c not in df.columns for c in required):
        return pd.DataFrame()

    view = df[required].copy().dropna()
    if view.empty:
        return pd.DataFrame()

    view['Fwd20'] = view[price_col].pct_change(20).shift(-20)
    view['Fwd60'] = view[price_col].pct_change(60).shift(-60)
    view = view.dropna(subset=['Fwd20'])
    if view.empty:
        return pd.DataFrame()

    view['Aligned20'] = (
        np.where(view[score_col] >= 50, 1, -1) ==
        np.where(view['Fwd20'] >= 0, 1, -1)
    )
    view['Divergence20'] = (~view['Aligned20']).astype(float)

    regime_order = [
        '过热(增长↑通胀↑)',
        '滞胀(增长↓通胀↑)',
        '衰退(增长↓通胀↓)',
        '复苏(增长↑通胀↓)',
    ]
    rows = []
    for regime in regime_order:
        g = view[view[regime_col] == regime]
        if g.empty:
            rows.append({
                'Regime': regime, '样本数': 0, '平均宏观分': np.nan, '20D胜率': np.nan,
                '20D均值': np.nan, '60D均值': np.nan, '相关性(分数,20D)': np.nan, '背离率': np.nan
            })
            continue

        corr_val = g[score_col].corr(g['Fwd20']) if g[score_col].nunique() > 1 else np.nan
        rows.append({
            'Regime': regime,
            '样本数': int(len(g)),
            '平均宏观分': g[score_col].mean(),
            '20D胜率': (g['Fwd20'] > 0).mean(),
            '20D均值': g['Fwd20'].mean(),
            '60D均值': g['Fwd60'].mean(),
            '相关性(分数,20D)': corr_val,
            '背离率': g['Divergence20'].mean(),
        })

    return pd.DataFrame(rows)


def _build_lead_lag_validation(df, score_col='Total_Score', price_col='Price', horizons=(20, 40, 60)):
    """
    宏观分领先性验证：对比“分数 vs 未来收益”和“分数 vs 过去收益”。
    仅用于离线诊断，不参与交易信号生成。
    """
    if df is None or df.empty or score_col not in df.columns or price_col not in df.columns:
        return pd.DataFrame()
    view = df[[score_col, price_col]].copy().dropna()
    if len(view) < max(horizons) + 30:
        return pd.DataFrame()

    rows = []
    for h in horizons:
        fwd = view[price_col].pct_change(h).shift(-h)
        past = view[price_col].pct_change(h)
        corr_fwd = view[score_col].corr(fwd)
        corr_past = view[score_col].corr(past)
        rows.append({
            'Horizon(D)': int(h),
            'Corr(Score, FwdRet)': corr_fwd,
            'Corr(Score, PastRet)': corr_past,
            'Lead_Edge': np.nan if pd.isna(corr_fwd) or pd.isna(corr_past) else (corr_fwd - corr_past)
        })
    return pd.DataFrame(rows)


def _build_shock_forward_stats(price_series, threshold=0.08, horizons=(3, 5, 21, 63)):
    """
    统计单日大涨/大跌事件后，不同持有期的前瞻收益分布。
    """
    px = price_series.dropna().copy()
    if px.empty:
        return pd.DataFrame()

    ret1 = px.pct_change()
    rows = []
    event_defs = [
        ('大涨事件', ret1 >= abs(threshold)),
        ('大跌事件', ret1 <= -abs(threshold)),
    ]
    for event_name, mask in event_defs:
        for h in horizons:
            fwd = px.pct_change(h).shift(-h)
            vals = fwd[mask].dropna()
            if vals.empty:
                rows.append({
                    '事件类型': event_name,
                    '前瞻窗口': f'T+{h}D',
                    '样本数': 0,
                    '胜率(>0)': np.nan,
                    '均值': np.nan,
                    '中位数': np.nan,
                    '25分位': np.nan,
                    '75分位': np.nan
                })
                continue
            rows.append({
                '事件类型': event_name,
                '前瞻窗口': f'T+{h}D',
                '样本数': int(len(vals)),
                '胜率(>0)': float((vals > 0).mean()),
                '均值': float(vals.mean()),
                '中位数': float(vals.median()),
                '25分位': float(vals.quantile(0.25)),
                '75分位': float(vals.quantile(0.75))
            })
    return pd.DataFrame(rows)


def _calculate_score_internal(df_all):
    """
    与 Dashboard 对齐：计算 A-G 模块分数并输出总分与关键风险特征。
    """
    if df_all is None or df_all.empty:
        return pd.DataFrame(columns=['Total_Score'])

    df_all = df_all.sort_index().copy().ffill()
    idx = df_all.index

    def ensure_df(frame, cols):
        if any(col not in frame.columns for col in cols):
            return pd.DataFrame()
        return frame.dropna(subset=cols).copy()

    def rolling_percentile(series, window=156, min_periods=20):
        return series.rolling(window, min_periods=min_periods).apply(
            lambda s: s.rank(pct=True).iloc[-1],
            raw=False
        ) * 100

    def rolling_percentile_long(series, window=756, min_periods=30):
        return series.rolling(window, min_periods=min_periods).apply(
            lambda s: s.rank(pct=True).iloc[-1],
            raw=False
        ) * 100

    def get_slope_score(series, target, tol):
        dev = (series - target).abs()
        return (100 - (dev / tol * 80)).clip(0, 100)

    def align_total(df_mod, fallback=50.0):
        if df_mod is None or df_mod.empty or 'Total_Score' not in df_mod.columns:
            return pd.Series(fallback, index=idx, dtype=float)
        return df_mod['Total_Score'].reindex(idx, method='ffill').fillna(fallback).astype(float)

    def align_feature(df_mod, col, fallback=np.nan):
        if df_mod is None or df_mod.empty or col not in df_mod.columns:
            return pd.Series(fallback, index=idx, dtype=float)
        return df_mod[col].reindex(idx, method='ffill').fillna(fallback).astype(float)

    # ---------------- A 模块 ----------------
    df_raw_a = df_all[df_all.index >= '2020-01-01'].copy()
    df_a = pd.DataFrame()
    if not df_raw_a.empty and all(col in df_raw_a.columns for col in ['WALCL', 'WTREGEN', 'RRPONTSYD', 'WRESBAL']):
        df_a['WALCL'] = df_raw_a['WALCL'].resample('W-WED').last()
        df_a['WTREGEN'] = df_raw_a['WTREGEN'].resample('W-WED').last()
        df_a['RRPONTSYD'] = df_raw_a['RRPONTSYD'].resample('W-WED').last()
        df_a['WRESBAL'] = df_raw_a['WRESBAL'].resample('W-WED').last()
        df_a = df_a.ffill().dropna()

        def get_tga_penalty(tga_val):
            tga_b = tga_val / 1000 if tga_val > 10000 else tga_val
            if tga_b < 800:
                return 1.0
            if tga_b < 850:
                return 0.8
            if tga_b < 900:
                return 0.6
            return 0.5

        def get_tga_trend_penalty(delta_b):
            if delta_b <= 0:
                return 1.0
            if delta_b <= 50:
                return 0.95
            if delta_b <= 100:
                return 0.9
            if delta_b <= 150:
                return 0.8
            return 0.7

        tga_b = df_a['WTREGEN'].where(df_a['WTREGEN'] <= 10000, df_a['WTREGEN'] / 1000)
        df_a['TGA_Penalty_Level'] = tga_b.apply(get_tga_penalty)
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
            if r < 0.10:
                return 1.0
            if r < 0.15:
                return 0.9
            if r < 0.20:
                return 0.8
            if r < 0.25:
                return 0.7
            return 0.6

        df_a['Sink_Penalty'] = df_a['Liquidity_Sink_Ratio'].apply(sink_penalty_ratio)
        df_a['Score_NetLiq'] = rolling_percentile(df_a['Net_Liquidity'].diff(13))
        df_a['Score_TGA'] = rolling_percentile((-df_a['WTREGEN']).diff(13))
        df_a['Score_RRP'] = rolling_percentile((-df_a['RRP_Clean']).diff(13))
        df_a['Score_Reserves'] = rolling_percentile(df_a['WRESBAL'].diff(13))
        df_a['Score_NetLiq_Adj'] = df_a['Score_NetLiq'] * df_a['Sink_Penalty']
        df_a['Total_Score'] = (
            df_a['Score_NetLiq_Adj'] * 0.45 +
            df_a['Score_TGA'] * 0.2 +
            df_a['Score_RRP'] * 0.25 +
            df_a['Score_Reserves'] * 0.1
        ) * df_a['TGA_Penalty_Total']

    # ---------------- B 模块 ----------------
    df_b = ensure_df(df_all, ['SOFR', 'IORB', 'RRPONTSYAWARD', 'TGCRRATE', 'RPONTSYD'])
    if not df_b.empty:
        df_b['SOFR_MA13'] = df_b['SOFR'].rolling(65, min_periods=1).mean()
        df_b['SOFR_Trend'] = df_b['SOFR_MA13'].diff(21)
        df_b['Score_Trend'] = df_b['SOFR_Trend'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100

        def get_regime_bonus(sofr):
            if sofr < 1.0:
                return 20
            if sofr < 2.5:
                return 10
            if sofr > 5.0:
                return -20
            if sofr > 4.0:
                return -10
            return 0

        df_b['Regime_Bonus'] = df_b['SOFR'].apply(get_regime_bonus)
        df_b['Score_Policy'] = (df_b['Score_Trend'] + df_b['Regime_Bonus']).clip(0, 100)
        df_b['Corridor_Width'] = (df_b['IORB'] - df_b['RRPONTSYAWARD']).abs().clip(lower=0.05)
        df_b['F1_Ratio'] = (df_b['SOFR'] - df_b['IORB']).clip(lower=0) / df_b['Corridor_Width']
        df_b['F2_Ratio'] = (df_b['SOFR'] - df_b['RRPONTSYAWARD']).abs() / df_b['Corridor_Width']
        df_b['F3_Ratio'] = (df_b['TGCRRATE'] - df_b['SOFR']).abs() / df_b['Corridor_Width']

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
        df_b['Total_Score'] = (df_b['Score_Policy'] * 0.40 + df_b['Score_Friction'] * 0.60).clip(0, 100)

    # ---------------- C 模块 ----------------
    df_c = ensure_df(df_all, ['DGS10', 'DGS2', 'DGS30', 'T10Y2Y', 'T10Y3M'])
    if not df_c.empty:
        df_c['Score_10Y'] = df_c['DGS10'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_c['Score_2Y'] = df_c['DGS2'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_c['Score_30Y'] = df_c['DGS30'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_c['Score_Curve_2s10s'] = get_slope_score(df_c['T10Y2Y'], 0.5, 1.5)
        df_c['Score_Curve_3m10s'] = get_slope_score(df_c['T10Y3M'], 0.75, 2.0)
        df_c['Total_Score1'] = (
            df_c['Score_Curve_2s10s'] * 0.3 +
            df_c['Score_Curve_3m10s'] * 0.3 +
            df_c['Score_10Y'] * 0.2 +
            df_c['Score_2Y'] * 0.1 +
            df_c['Score_30Y'] * 0.1
        )
        slope_10 = df_c['DGS10'].diff(60)
        slope_30 = df_c['DGS30'].diff(60)
        df_c['Max_Slope'] = pd.concat([slope_10, slope_30], axis=1).max(axis=1)

        def get_slope_penalty(s):
            if s > 0.50:
                return 0.2
            if s > 0.30:
                return 0.6
            if s > 0.15:
                return 0.8
            return 1.0

        df_c['Penalty_Factor'] = df_c['Max_Slope'].apply(get_slope_penalty)
        df_c['Total_Score'] = (df_c['Total_Score1'] * df_c['Penalty_Factor']).clip(0, 100)

    # ---------------- D 模块 ----------------
    df_d = ensure_df(df_all, ['DFII10', 'DFII5', 'T10YIE'])
    if not df_d.empty:
        df_d['Score_Real_10Y'] = df_d['DFII10'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_d['Score_Real_5Y'] = df_d['DFII5'].rolling(1260, min_periods=1).rank(pct=True, ascending=False) * 100
        df_d['Score_Breakeven'] = get_slope_score(df_d['T10YIE'], 2.1, 0.6)
        df_d['Total_Score'] = (
            df_d['Score_Real_10Y'] * 0.4 +
            df_d['Score_Real_5Y'] * 0.3 +
            df_d['Score_Breakeven'] * 0.3
        ).clip(0, 100)

    # ---------------- E 模块 ----------------
    df_e = ensure_df(df_all, ['DTWEXBGS', 'DXY', 'DEXJPUS', 'IRSTCI01JPM156N', 'DCOILWTICO', 'DHHNGSP'])
    if not df_e.empty:
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
        df_e['Total_Score'] = (
            df_e['Score_USD'] * 0.20 +
            df_e['Score_DXY'] * 0.20 +
            df_e['Score_Yen_Total'] * 0.3 +
            df_e['Score_Energy'] * 0.3
        ).clip(0, 100)

    # ---------------- F 模块 ----------------
    df_f = ensure_df(df_all, ['BAMLH0A0HYM2', 'BAA10Y'])
    if not df_f.empty:
        df_f['HY_Spread'] = df_f['BAMLH0A0HYM2']
        df_f['Score_HY_Level'] = 100 - rolling_percentile_long(df_f['HY_Spread'])
        df_f['Score_HY_Trend'] = rolling_percentile_long(-df_f['HY_Spread'].diff(13))
        df_f['Score_BAA_Level'] = 100 - rolling_percentile_long(df_f['BAA10Y'])
        df_f['Total_Score'] = (
            df_f['Score_HY_Level'] * 0.5 +
            df_f['Score_HY_Trend'] * 0.3 +
            df_f['Score_BAA_Level'] * 0.2
        ).clip(0, 100)

    # ---------------- G 模块 ----------------
    vix_yh = df_all['VIX_YH'] if 'VIX_YH' in df_all.columns else None
    vix_fd = df_all['VIXCLS'] if 'VIXCLS' in df_all.columns else None
    vxv_yh = df_all['VXV_YH'] if 'VXV_YH' in df_all.columns else None
    vxv_fd = df_all['VXVCLS'] if 'VXVCLS' in df_all.columns else None

    df_g = pd.DataFrame(index=idx)
    if 'SP500' in df_all.columns:
        df_g['SP500'] = df_all['SP500']
    if vix_yh is not None or vix_fd is not None:
        vix = vix_yh.combine_first(vix_fd) if (vix_yh is not None and vix_fd is not None) else (vix_yh if vix_yh is not None else vix_fd)
        df_g['VIX'] = vix
    if vxv_yh is not None or vxv_fd is not None:
        vxv = vxv_yh.combine_first(vxv_fd) if (vxv_yh is not None and vxv_fd is not None) else (vxv_yh if vxv_yh is not None else vxv_fd)
        df_g['VXV'] = vxv
    if not set(['SP500', 'VIX', 'VXV']).issubset(df_g.columns):
        df_g = pd.DataFrame()
    else:
        df_g = df_g.dropna(subset=['SP500', 'VIX', 'VXV']).copy()
    if not df_g.empty:
        df_g['VIX_VXV'] = df_g['VIX'] / df_g['VXV']
        df_g['Score_VIX'] = (100 - rolling_percentile_long(df_g['VIX'])).clip(0, 100)
        df_g['Score_Term'] = (100 - rolling_percentile_long(df_g['VIX_VXV'])).clip(0, 100)
        df_g['Score_Mom'] = rolling_percentile_long(df_g['SP500'].diff(65)).clip(0, 100)
        df_g['Total_Score'] = (
            df_g['Score_Term'] * 0.4 +
            df_g['Score_VIX'] * 0.3 +
            df_g['Score_Mom'] * 0.3
        ).clip(0, 100)

    # ---------------- 合成总分（A-G） ----------------
    s_a = align_total(df_a, fallback=50.0)
    s_b = align_total(df_b, fallback=50.0)
    s_c = align_total(df_c, fallback=50.0)
    s_d = align_total(df_d, fallback=50.0)
    s_e = align_total(df_e, fallback=50.0)
    s_f = align_total(df_f, fallback=50.0)
    s_g = align_total(df_g, fallback=50.0)

    total_score = (
        s_a * 0.20 +
        s_b * 0.20 +
        s_c * 0.15 +
        s_d * 0.15 +
        s_e * 0.15 +
        s_f * 0.075 +
        s_g * 0.075
    ).clip(0, 100)

    score_frame = pd.DataFrame(index=idx)
    score_frame['Total_Score'] = total_score.astype(float)
    score_frame['Score_A'] = s_a
    score_frame['Score_B'] = s_b
    score_frame['Score_C'] = s_c
    score_frame['Score_D'] = s_d
    score_frame['Score_E'] = s_e
    score_frame['Score_F'] = s_f
    score_frame['Score_G'] = s_g

    # 关键惩罚机制（来自现有宏观模块）
    score_frame['A_TGA_Penalty'] = align_feature(df_a, 'TGA_Penalty_Total', fallback=1.0).clip(0, 1.2)
    score_frame['A_Sink_Penalty'] = align_feature(df_a, 'Sink_Penalty', fallback=1.0).clip(0, 1.0)
    score_frame['B_SRF_Penalty'] = (align_feature(df_b, 'SRF_Penalty', fallback=0.0) / 100.0).clip(0, 1.0)
    score_frame['G_VIXVXV'] = align_feature(df_g, 'VIX_VXV', fallback=1.0)

    return score_frame.dropna(subset=['Total_Score'])

# ==========================================
# 2. 辅助计算 RSI
# ==========================================
def calculate_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


# ==========================================
# 3. 策略逻辑引擎 
# ==========================================
def run_strategy_logic(
    df,
    price_col,
    asset_name,
    macro_lag_days=0,
    one_way_cost_bps=0.0,
    risk_free_rate=0.04,
    max_leverage=2.0,
    strategy_cfg=None,
    allow_short=False,
    short_leverage=0.5,
    short_min_risk_count=2
):
    df = df.copy()
    cfg = strategy_cfg or {}

    df['Pct_Change'] = df[price_col].pct_change()
    df['RSI'] = calculate_rsi(df[price_col])
    score = df['Total_Score'].shift(int(macro_lag_days)).ffill() if macro_lag_days > 0 else df['Total_Score']
    df['Score_Exec'] = score

    max_leverage = float(max(1.0, min(2.0, max_leverage)))
    th1 = float(cfg.get('th1', 20.0))
    th2 = float(cfg.get('th2', 35.0))
    th3 = float(cfg.get('th3', 50.0))
    th4 = float(cfg.get('th4', 65.0))
    th5 = float(cfg.get('th5', 80.0))

    rebalance_mode = str(cfg.get('rebalance_mode', 'W')).upper()
    min_hold_days = max(0, int(cfg.get('min_hold_days', 10)))
    trade_buffer = max(0.0, float(cfg.get('trade_buffer', 0.15)))
    macro_smooth_span = max(1, int(cfg.get('macro_smooth_span', 10)))
    macro_trend_window = max(5, int(cfg.get('macro_trend_window', 20)))
    macro_up_th = float(cfg.get('macro_up_th', 3.0))
    macro_down_th = float(cfg.get('macro_down_th', -3.0))
    position_step = max(0.05, float(cfg.get('position_step', 0.10)))
    mid_band_low = float(cfg.get('mid_band_low', 40.0))
    mid_band_high = float(cfg.get('mid_band_high', 60.0))
    recover_low_threshold = float(cfg.get('recover_low_threshold', 40.0))
    recover_lookback = max(5, int(cfg.get('recover_lookback', 30)))
    recover_slope_fast_th = float(cfg.get('recover_slope_fast_th', 1.0))
    recover_boost = max(0.0, float(cfg.get('recover_boost', 0.25)))
    mid_ma20_floor_mult = float(np.clip(float(cfg.get('mid_ma20_floor_mult', 0.95)), 0.0, 1.2))
    extreme_high_trim = float(np.clip(float(cfg.get('extreme_high_trim', 0.85)), 0.1, 1.0))
    extreme_low_trim = float(np.clip(float(cfg.get('extreme_low_trim', 0.75)), 0.1, 1.0))
    force_max_on_bull_stack = bool(cfg.get('force_max_on_bull_stack', True))

    reference_max_leverage = max(1.0, float(cfg.get('reference_max_leverage', 1.5)))
    leverage_follow_allocation = bool(cfg.get('leverage_follow_allocation', True))
    leverage_scale = (max_leverage / reference_max_leverage) if leverage_follow_allocation else 1.0
    df['Leverage_Scale'] = leverage_scale

    # 宏观分只做仓位大小，不混入价格信息
    score_smooth = score.ewm(span=macro_smooth_span, adjust=False).mean()
    score_slope = score_smooth.diff(macro_trend_window).fillna(0.0)
    score_slope_fast = score_smooth.diff(max(3, macro_trend_window // 4)).fillna(0.0)
    score_regime = score_smooth.clip(0.0, 100.0)

    df['Score_Regime_Base'] = score_smooth
    df['Score_Regime'] = score_regime
    df['Score_Regime_Raw'] = score_regime
    df['Score_Slope'] = score_slope
    df['Score_Slope_Fast'] = score_slope_fast
    df['Score_Trend'] = (50.0 + score_slope).clip(0.0, 100.0)
    df['Score_Trend_Fast'] = (50.0 + score_slope_fast).clip(0.0, 100.0)
    df['Regime_Trend_Adjust'] = 0.0

    base_super = min(max_leverage, max(0.0, float(cfg.get('base_super', max_leverage)) * leverage_scale))
    base_risk_on = min(max_leverage, max(0.0, float(cfg.get('base_risk_on', 1.20)) * leverage_scale))
    base_neutral = min(max_leverage, max(0.0, float(cfg.get('base_neutral', 0.85)) * leverage_scale))
    base_caution = min(max_leverage, max(0.0, float(cfg.get('base_caution', 0.45)) * leverage_scale))
    base_risk_off = min(max_leverage, max(0.0, float(cfg.get('base_risk_off', 0.15)) * leverage_scale))
    macro_up_add = float(cfg.get('macro_up_add', 0.10)) * leverage_scale
    macro_down_cut = float(cfg.get('macro_down_cut', 0.15)) * leverage_scale

    macro_base = np.select(
        [score_regime >= th5, score_regime >= th4, score_regime >= th3, score_regime >= th2],
        [base_super, base_risk_on, base_neutral, base_caution],
        default=base_risk_off
    )
    macro_adj = np.select(
        [score_slope >= macro_up_th, score_slope <= macro_down_th],
        [macro_up_add, -macro_down_cut],
        default=0.0
    )
    macro_alloc = pd.Series(macro_base + macro_adj, index=df.index).clip(0.0, max_leverage)
    df['Macro_Target'] = macro_alloc
    df['Liq_Mult'] = 1.0

    # 趋势引擎：只看 120 长均线 + 20/60/120 排布
    is_crypto = any(k in asset_name for k in ['BTC', 'Bitcoin', 'ETH', 'Ethereum'])
    if is_crypto:
        df['EMA20'] = df[price_col].ewm(span=20, adjust=False).mean()
        df['EMA60'] = df[price_col].ewm(span=60, adjust=False).mean()
        df['EMA120'] = df[price_col].ewm(span=120, adjust=False).mean()
        fast_ma = df['EMA20']
        mid_ma = df['EMA60']
        long_ma = df['EMA120']
        trend_mult = np.select(
            [
                (df[price_col] > long_ma) & (fast_ma > mid_ma) & (mid_ma > long_ma) & (long_ma.diff() > 0),
                (df[price_col] > long_ma) & (fast_ma > mid_ma) & (mid_ma > long_ma),
                (df[price_col] > long_ma),
                (df[price_col] < long_ma) & (fast_ma < mid_ma) & (mid_ma < long_ma) & (long_ma.diff() < 0),
                (df[price_col] < long_ma)
            ],
            [1.00, 0.92, 0.78, 0.20, 0.42],
            default=0.60
        )
    else:
        df['MA20'] = df[price_col].rolling(window=20).mean()
        df['MA60'] = df[price_col].rolling(window=60).mean()
        df['MA120'] = df[price_col].rolling(window=120).mean()
        fast_ma = df['MA20']
        mid_ma = df['MA60']
        long_ma = df['MA120']
        trend_mult = np.select(
            [
                (df[price_col] > long_ma) & (fast_ma > mid_ma) & (mid_ma > long_ma) & (long_ma.diff() > 0),
                (df[price_col] > long_ma) & (fast_ma > mid_ma) & (mid_ma > long_ma),
                (df[price_col] > long_ma),
                (df[price_col] < long_ma) & (fast_ma < mid_ma) & (mid_ma < long_ma) & (long_ma.diff() < 0),
                (df[price_col] < long_ma)
            ],
            [1.00, 0.90, 0.72, 0.20, 0.40],
            default=0.58
        )

    long_ma_valid = long_ma.notna()
    cross_up = ((df[price_col] > long_ma) & (df[price_col].shift(1) <= long_ma.shift(1)) & long_ma_valid).fillna(False)
    cross_down = ((df[price_col] < long_ma) & (df[price_col].shift(1) >= long_ma.shift(1)) & long_ma_valid).fillna(False)
    ma20_reclaim = ((df[price_col] > fast_ma) & (df[price_col].shift(1) <= fast_ma.shift(1))).fillna(False)
    trend_strong = ((df[price_col] > long_ma) & (fast_ma > mid_ma) & (mid_ma > long_ma) & (long_ma.diff() > 0) & long_ma_valid).fillna(False)
    trend_break = ((df[price_col] < long_ma) & (fast_ma < mid_ma) & (mid_ma < long_ma) & (long_ma.diff() < 0) & long_ma_valid).fillna(False)
    trend_weak = ((df[price_col] < long_ma) & (~trend_break) & long_ma_valid).fillna(False)
    bull_stack_full = ((df[price_col] > fast_ma) & (fast_ma > mid_ma) & (mid_ma > long_ma) & long_ma_valid).fillna(False)
    ma20_up = (fast_ma > fast_ma.shift(3)).fillna(False)
    mid_macro_band = ((score_regime >= mid_band_low) & (score_regime <= mid_band_high)).fillna(False)
    recent_low = (score_regime.rolling(recover_lookback, min_periods=1).min() <= recover_low_threshold).fillna(False)
    macro_recover_fast = ((score_slope_fast >= recover_slope_fast_th) & recent_low).fillna(False)
    mid_ma20_positive = (mid_macro_band & (df[price_col] > fast_ma) & ma20_up).fillna(False)
    early_recovery = (mid_ma20_positive & (macro_recover_fast | ma20_reclaim)).fillna(False)

    trend_mult = pd.Series(trend_mult, index=df.index).clip(0.0, 1.0)
    trend_target = (macro_alloc * trend_mult).clip(0.0, max_leverage)
    # 40-60 震荡宏观区间更多依赖 MA20：站上且MA20拐头向上时，至少接近宏观目标仓位
    mid_floor = (macro_alloc * mid_ma20_floor_mult).clip(0.0, max_leverage)
    trend_target = np.where(mid_ma20_positive, np.maximum(trend_target, mid_floor), trend_target)
    # 宏观低位快速修复 + MA20转强：提前加仓，减少“晚一个月”问题
    trend_target = np.where(
        early_recovery,
        np.minimum(max_leverage, trend_target + recover_boost * leverage_scale),
        trend_target
    )

    # 宏观转强 + 均线强势时允许快速上仓，避免错过主升段
    quick_add = float(cfg.get('parallel_bull_boost', 0.20)) * leverage_scale
    trend_target = np.where(
        trend_strong & (score_regime >= th3) & (score_slope_fast > 0),
        np.minimum(max_leverage, trend_target + quick_add),
        trend_target
    )
    # 跌破120并且宏观走弱时，强制降到低仓位
    trend_break_cap = float(np.clip(float(cfg.get('trend_target_break_crypto' if is_crypto else 'trend_target_break_other', 0.25)), 0.0, max_leverage))
    trend_target = np.where(
        trend_break & (score_regime < th2),
        np.minimum(trend_target, trend_break_cap),
        trend_target
    )
    # 极值区间（>=65 或 <=35）优先防守：过热减仓，极弱+跌破MA20继续降仓
    extreme_high = (score_regime >= th4).fillna(False)
    extreme_low = (score_regime <= th2).fillna(False)
    trend_target = np.where(extreme_high & (score_slope_fast <= 0), trend_target * extreme_high_trim, trend_target)
    trend_target = np.where(extreme_low & (df[price_col] < fast_ma), trend_target * extreme_low_trim, trend_target)
    trend_target = np.where(force_max_on_bull_stack & bull_stack_full, max_leverage, trend_target)
    trend_target = np.clip(trend_target, 0.0, max_leverage)

    target_long = pd.Series(trend_target, index=df.index).clip(0.0, max_leverage)
    is_eth = any(k in asset_name for k in ['ETH', 'Ethereum'])
    eth_shock_enabled = bool(cfg.get('eth_shock_enabled', False)) and is_eth
    eth_shock_drop_pct = abs(float(cfg.get('eth_shock_drop_pct', 0.135)))
    eth_shock_retain_ratio = float(np.clip(float(cfg.get('eth_shock_retain_ratio', 0.50)), 0.0, 1.0))
    eth_shock_trigger = (df[price_col].pct_change().fillna(0.0) <= -eth_shock_drop_pct).fillna(False)
    if eth_shock_enabled:
        target_long = np.where(eth_shock_trigger, target_long * eth_shock_retain_ratio, target_long)
        target_long = pd.Series(target_long, index=df.index).clip(0.0, max_leverage)
    else:
        target_long = pd.Series(target_long, index=df.index).clip(0.0, max_leverage)

    df['Trend_Target'] = target_long
    df['Trend_Weak'] = trend_weak
    df['Timing_Mult'] = (target_long / np.maximum(macro_alloc, 1e-6)).clip(0.0, 1.5)
    df['Mid_Band_MA20_On'] = mid_ma20_positive.astype(int)
    df['Early_Recovery_On'] = early_recovery.astype(int)
    df['Bull_Stack_Force_Max'] = bull_stack_full.astype(int)
    df['ETH_Shock_Trigger'] = eth_shock_trigger.astype(int)

    eth_event_hedge_enabled = bool(cfg.get('eth_event_hedge_enabled', False)) and is_eth
    short_notional_cap = 3.0 if eth_event_hedge_enabled else max_leverage
    short_notional = min(float(short_leverage), float(short_notional_cap))
    short_score_threshold = float(cfg.get('short_score_threshold', th1))
    short_trigger_score = float(cfg.get('short_trigger_score', th2))
    short_min_risk_count = max(1, int(short_min_risk_count))
    long_bias_min = float(np.clip(float(cfg.get('long_bias_min', 0.25)) * leverage_scale, 0.0, max_leverage))
    is_shortable = any(k in asset_name for k in ['BTC', 'Bitcoin', 'ETH', 'Ethereum', 'SPY', 'Nasdaq', 'IXIC'])

    risk_count = (
        (score_regime < short_trigger_score).astype(int) +
        trend_break.astype(int) +
        (score_slope_fast <= 0).astype(int)
    )
    df['Short_Risk_Count'] = risk_count

    use_default_short_logic = allow_short and is_shortable and (not eth_event_hedge_enabled)
    if use_default_short_logic:
        hedge_weak = float(np.clip(float(cfg.get('hedge_size_weak', 0.35)), 0.0, 1.0))
        hedge_strong = float(np.clip(float(cfg.get('hedge_size_strong', 0.70)), 0.0, 1.0))
        hedge_early = float(np.clip(float(cfg.get('hedge_size_early', 0.20)), 0.0, 1.0))
        bear_weak = (risk_count >= short_min_risk_count) & trend_break & (score_regime < short_trigger_score)
        bear_strong = bear_weak & (score_regime < short_score_threshold) & (score_slope <= macro_down_th)
        bear_early = (score_regime <= th2) & (df[price_col] < fast_ma) & (score_slope_fast <= 0)
        hedge_notional = np.where(
            bear_strong,
            short_notional * hedge_strong,
            np.where(bear_weak, short_notional * hedge_weak, np.where(bear_early, short_notional * hedge_early, 0.0))
        )
        df['Hedge_Notional'] = pd.Series(hedge_notional, index=df.index).astype(float)
        target = np.maximum(target_long - df['Hedge_Notional'], long_bias_min)
        # 极端下行才允许少量净空
        extreme_short = bear_strong & (target_long <= long_bias_min * 0.6)
        target = np.where(extreme_short, -np.minimum(short_notional, df['Hedge_Notional'] * 0.6), target)
    else:
        df['Hedge_Notional'] = 0.0
        target = target_long

    # ETH 专属应急对冲：单日急跌触发，T+1~T+2 快速平仓，或达到累计跌幅目标即刻平仓
    eth_event_hedge = pd.Series(0.0, index=df.index, dtype=float)
    if eth_event_hedge_enabled:
        eth_hedge_fraction = float(np.clip(float(cfg.get('eth_hedge_fraction', 1.0 / 3.0)), 0.0, 1.0))
        eth_hedge_leverage = float(np.clip(float(cfg.get('eth_hedge_leverage', 2.0)), 0.0, 3.0))
        eth_hedge_hold_days = int(np.clip(int(cfg.get('eth_hedge_hold_days', 2)), 1, 2))
        eth_hedge_takeprofit_drop = abs(float(cfg.get('eth_hedge_takeprofit_drop', 0.20)))
        eth_hedge_cap_ratio = float(np.clip(float(cfg.get('eth_hedge_cap_ratio', 1.0)), 0.2, 2.0))
        base_hedge_size = eth_hedge_fraction * eth_hedge_leverage
        px = df[price_col].to_numpy(dtype=float)
        trg = eth_shock_trigger.to_numpy(dtype=bool)

        for i in np.where(trg)[0]:
            open_i = i + 1
            if open_i >= len(df.index):
                continue
            # 对冲仓位：默认 1/3 * 杠杆（可调），并限制不超过当期多头仓位比例上限
            long_ref = float(target_long.iloc[open_i]) if not pd.isna(target_long.iloc[open_i]) else 0.0
            if long_ref <= 0:
                continue
            hedge_cap = max(0.0, max_leverage * eth_hedge_cap_ratio)
            hedge_size = min(base_hedge_size, hedge_cap)
            if hedge_size <= 0:
                continue

            close_i = min(len(df.index) - 1, open_i + eth_hedge_hold_days - 1)
            tp_px = px[i] * (1.0 - eth_hedge_takeprofit_drop)
            for j in range(open_i, close_i + 1):
                if px[j] <= tp_px:
                    close_i = j
                    break
            eth_event_hedge.iloc[open_i:close_i + 1] = np.maximum(
                eth_event_hedge.iloc[open_i:close_i + 1], hedge_size
            )

    df['ETH_Event_Hedge'] = eth_event_hedge
    if eth_event_hedge_enabled:
        # 保持长仓主导，对冲仓位作为独立腿位叠加在净仓位中
        target = np.maximum(pd.Series(target, index=df.index).astype(float) - eth_event_hedge, 0.0)

    desired_target = pd.Series(target, index=df.index).astype(float)
    desired_target = (np.round(desired_target / position_step) * position_step).astype(float)
    if use_default_short_logic:
        desired_target = desired_target.clip(-short_notional, max_leverage)
    else:
        desired_target = desired_target.clip(0.0, max_leverage)
    df['Target_Position_Desired'] = desired_target

    if rebalance_mode == 'D':
        rebalance_mask = pd.Series(True, index=df.index)
    elif rebalance_mode == 'M':
        p = pd.Series(df.index.to_period('M'), index=df.index)
        rebalance_mask = p.ne(p.shift(-1)).fillna(True)
    else:
        p = pd.Series(df.index.to_period('W-FRI'), index=df.index)
        rebalance_mask = p.ne(p.shift(-1)).fillna(True)

    regime_bucket = np.select(
        [score_regime < th2, score_regime < th3, score_regime < th4, score_regime < th5],
        [0, 1, 2, 3],
        default=4
    ).astype(int)
    trend_bucket = np.select([trend_break, trend_weak, trend_strong], [0, 1, 4], default=2).astype(int)
    cycle_state = pd.Series(regime_bucket * 10 + trend_bucket, index=df.index).astype(int)
    df['Cycle_State'] = cycle_state

    emergency_flag = ((score_regime < th1) & trend_break).fillna(False)
    exec_target = pd.Series(index=df.index, dtype=float)
    last_target = 0.0
    last_trade_i = -10**9

    for i in range(len(df.index)):
        desired = float(desired_target.iat[i])
        if i == 0:
            last_target = desired
            last_trade_i = 0
            exec_target.iat[i] = last_target
            continue

        allow_rebalance_now = bool(rebalance_mask.iat[i])
        hold_ok = (i - last_trade_i) >= min_hold_days
        delta_ok = abs(desired - last_target) >= trade_buffer
        cycle_changed = cycle_state.iat[i] != cycle_state.iat[i - 1]
        force_switch = bool(cross_up.iat[i] or cross_down.iat[i] or emergency_flag.iat[i])

        if force_switch and abs(desired - last_target) > 1e-8:
            last_target = desired
            last_trade_i = i
        elif cycle_changed and hold_ok and delta_ok:
            last_target = desired
            last_trade_i = i
        elif allow_rebalance_now and hold_ok and delta_ok:
            last_target = desired
            last_trade_i = i

        exec_target.iat[i] = last_target

    df['Target_Position'] = exec_target
    if use_default_short_logic:
        df['Target_Position'] = df['Target_Position'].clip(-short_notional, max_leverage)
    else:
        df['Target_Position'] = df['Target_Position'].clip(0.0, max_leverage)

    df['Long_Target_Position'] = df['Target_Position'].clip(0.0, max_leverage)
    df['Hedge_Target_Position'] = -df['ETH_Event_Hedge'] if eth_event_hedge_enabled else 0.0
    df['Target_Position_Net'] = df['Long_Target_Position'] + df['Hedge_Target_Position']
    df['Target_Position'] = df['Target_Position_Net']

    signal_labels = np.select(
        [
            df['Hedge_Target_Position'] < -0.05,
            df['Long_Target_Position'] >= min(max_leverage, 1.2),
            df['Long_Target_Position'] >= 0.9,
            df['Long_Target_Position'] >= 0.45,
            df['Long_Target_Position'] > 0
        ],
        ['🔻 对冲做空', '🔥 杠杆进攻', '🚀 进攻', '🛡️ 防守', '🌤️ 试探'],
        default='⚪ 空仓 (Cash)'
    )
    df['Signal_Type'] = pd.Series(signal_labels, index=df.index)
    df['Long_Position'] = df['Long_Target_Position'].shift(1).fillna(0.0)
    df['Hedge_Position'] = df['Hedge_Target_Position'].shift(1).fillna(0.0)
    df['Position'] = df['Long_Position'] + df['Hedge_Position']

    df['Turnover_Long'] = df['Long_Position'].diff().abs().fillna(df['Long_Position'].abs())
    df['Turnover_Hedge'] = df['Hedge_Position'].diff().abs().fillna(df['Hedge_Position'].abs())
    df['Turnover'] = df['Turnover_Long'] + df['Turnover_Hedge']
    fee_rate = float(one_way_cost_bps) / 10000.0
    df['Tx_Cost'] = df['Turnover'] * fee_rate

    slippage_vol_window = max(5, int(cfg.get('slippage_vol_window', 20)))
    slippage_mult = max(0.0, float(cfg.get('slippage_mult', 0.30)))
    vol_proxy = df[price_col].pct_change().rolling(slippage_vol_window, min_periods=5).std()
    vol_proxy = vol_proxy.fillna(vol_proxy.median() if not vol_proxy.dropna().empty else 0.0).clip(lower=0.0)
    df['Slippage_Cost'] = (df['Turnover'] * vol_proxy * slippage_mult).clip(lower=0.0)

    funding_bps_daily = max(0.0, float(cfg.get('funding_bps_daily', 1.0)))
    funding_daily = funding_bps_daily / 10000.0
    leverage_excess = (df['Position'].abs() - 1.0).clip(lower=0.0)
    df['Funding_Cost'] = (leverage_excess * funding_daily).clip(lower=0.0)
    df['Total_Cost'] = df['Tx_Cost'] + df['Slippage_Cost'] + df['Funding_Cost']

    risk_free_daily = float(risk_free_rate) / 252
    df['Strategy_Ret_Gross'] = df['Position'] * df['Pct_Change'] + (1 - df['Position'].abs()) * risk_free_daily
    df['Strategy_Ret'] = df['Strategy_Ret_Gross'] - df['Total_Cost']
    df['Strategy_Nav'] = (1 + df['Strategy_Ret'].fillna(0)).cumprod()
    df['Benchmark_Nav'] = (1 + df['Pct_Change'].fillna(0)).cumprod()
    return df

# ==========================================
# 4. 交易日志 (修复 Mode 列名问题)
# ==========================================
def generate_trade_log(df, price_col):
    trades = []
    in_trade = False
    entry_side = 0
    entry_date, entry_price, entry_score, entry_sig = None, 0, 0, ""
    score_col = 'Score_Exec' if 'Score_Exec' in df.columns else 'Total_Score'

    for i in range(len(df)):
        curr_pos = df['Position'].iloc[i]
        prev_pos = df['Position'].iloc[i-1] if i > 0 else 0
        curr_side = 1 if curr_pos > 0 else (-1 if curr_pos < 0 else 0)
        prev_side = 1 if prev_pos > 0 else (-1 if prev_pos < 0 else 0)
        
        # 触发入场（空仓 -> 持仓）
        if curr_side != 0 and prev_side == 0:
            in_trade = True
            entry_side = curr_side
            entry_date = df.index[i]
            entry_price = df[price_col].iloc[i]
            sig_i = i - 1 if i > 0 else i
            entry_score = df[score_col].iloc[sig_i]
            entry_sig = df['Signal_Type'].iloc[sig_i]
            
        # 触发离场（持仓 -> 空仓）或反手（多空切换）
        elif in_trade and ((curr_side == 0 and prev_side != 0) or (curr_side != 0 and curr_side != prev_side)):
            in_trade = False
            raw = (df[price_col].iloc[i] - entry_price) / entry_price
            pnl = raw if entry_side > 0 else -raw
            trades.append({
                'Mode': entry_sig,  # 这里的键必须是 'Mode' 以匹配 render 函数
                'Entry Date': entry_date,
                'Exit Date': df.index[i],
                'Entry Score': entry_score,
                'Entry Price': entry_price,
                'Exit Price': df[price_col].iloc[i],
                'PnL': pnl,
                'Result': 'Win' if pnl > 0 else 'Loss'
            })

            # 反手：同一根 K 线重新开仓
            if curr_side != 0:
                in_trade = True
                entry_side = curr_side
                entry_date = df.index[i]
                entry_price = df[price_col].iloc[i]
                sig_i = i - 1 if i > 0 else i
                entry_score = df[score_col].iloc[sig_i]
                entry_sig = df['Signal_Type'].iloc[sig_i]
            
    if in_trade:
        raw = (df[price_col].iloc[-1] - entry_price) / entry_price
        pnl = raw if entry_side > 0 else -raw
        trades.append({
            'Mode': entry_sig + "(Hold)",
            'Entry Date': entry_date,
            'Exit Date': 'Running',
            'Entry Score': entry_score,
            'Entry Price': entry_price,
            'Exit Price': df[price_col].iloc[-1],
            'PnL': pnl,
            'Result': 'Floating'
        })
    return pd.DataFrame(trades)


def compute_perf_metrics(df, risk_free_rate=0.04):
    ret = df['Strategy_Ret'].dropna()
    bench_ret = df['Pct_Change'].dropna()
    nav = df['Strategy_Nav'].dropna()
    if ret.empty or nav.empty:
        return {}

    total_days = max((nav.index[-1] - nav.index[0]).days, 1)
    years = total_days / 365.25
    cagr = nav.iloc[-1] ** (1 / years) - 1 if years > 0 else np.nan

    dd = nav / nav.cummax() - 1
    mdd = dd.min()
    trough_dt = dd.idxmin()
    peak_level = nav.loc[:trough_dt].cummax().max()
    recov_idx = nav.loc[trough_dt:][nav.loc[trough_dt:] >= peak_level]
    recovery_days = np.nan if recov_idx.empty else (recov_idx.index[0] - trough_dt).days

    monthly_nav = (1 + ret).resample('M').prod()
    monthly_ret = monthly_nav - 1
    rf_monthly = (1 + float(risk_free_rate)) ** (1 / 12) - 1
    monthly_excess = monthly_ret - rf_monthly
    sharpe_m = np.nan
    sortino_m = np.nan
    if monthly_excess.std(ddof=0) > 0:
        sharpe_m = (monthly_excess.mean() / monthly_excess.std(ddof=0)) * np.sqrt(12)
    downside = monthly_excess[monthly_excess < 0]
    if len(downside) > 0 and downside.std(ddof=0) > 0:
        sortino_m = (monthly_excess.mean() / downside.std(ddof=0)) * np.sqrt(12)

    calmar = np.nan if mdd == 0 else cagr / abs(mdd)

    var5 = ret.quantile(0.05)
    cvar5 = ret[ret <= var5].mean() if (ret <= var5).any() else np.nan

    down_mask = bench_ret < 0
    if down_mask.any() and bench_ret[down_mask].mean() != 0:
        downside_capture = ret.reindex(bench_ret.index).fillna(0)[down_mask].mean() / bench_ret[down_mask].mean()
    else:
        downside_capture = np.nan

    avg_turnover = df['Turnover'].dropna().mean() if 'Turnover' in df.columns else np.nan
    fee_cost = df['Tx_Cost'].dropna().sum() if 'Tx_Cost' in df.columns else np.nan
    slip_cost = df['Slippage_Cost'].dropna().sum() if 'Slippage_Cost' in df.columns else np.nan
    funding_cost = df['Funding_Cost'].dropna().sum() if 'Funding_Cost' in df.columns else np.nan
    if 'Total_Cost' in df.columns:
        total_cost = df['Total_Cost'].dropna().sum()
    elif 'Tx_Cost' in df.columns:
        total_cost = fee_cost
    else:
        total_cost = np.nan

    return {
        'cagr': cagr,
        'mdd': mdd,
        'sharpe_m': sharpe_m,
        'sortino_m': sortino_m,
        'calmar': calmar,
        'cvar5': cvar5,
        'recovery_days': recovery_days,
        'downside_capture': downside_capture,
        'avg_turnover': avg_turnover,
        'fee_cost': fee_cost,
        'slippage_cost': slip_cost,
        'funding_cost': funding_cost,
        'total_cost': total_cost,
    }

# ==========================================
# 5. Yahoo 数据
# ==========================================
@st.cache_data(ttl=3600)
def get_yahoo_data(start_date):
    tickers = "BTC-USD ETH-USD GLD SPY ^IXIC EURUSD=X"
    return yf.download(
        tickers,
        start=start_date,
        group_by='ticker',
        auto_adjust=False,
        progress=False,
        threads=True
    )

# ==========================================
# 6. 主渲染函数
# ==========================================
def render_backtest(df_all):
    st.markdown("## 量化策略分数回测")
    st.info("采用『宏观状态机定仓位 + 趋势跟随执行 + 低频调仓 + 下行对冲』：先判大方向，再用20/60/120均线执行仓位。")
    if df_all is None or df_all.empty:
        st.error("回测失败：输入数据为空。")
        return

    # 回测起始日期（动态可调）
    idx_min = pd.Timestamp(df_all.index.min()).date()
    idx_max = pd.Timestamp(df_all.index.max()).date()
    default_start = pd.Timestamp("2023-01-01").date()
    if default_start < idx_min:
        default_start = idx_min
    if default_start > idx_max:
        default_start = idx_min

    selected_start = st.date_input(
        "回测起始日期",
        value=default_start,
        min_value=idx_min,
        max_value=idx_max,
        key="backtest_start_date"
    )
    backtest_start = pd.Timestamp(selected_start)

    p1, p2, p3, p4, p5 = st.columns(5)
    with p1:
        macro_lag_days = int(st.number_input("宏观信号滞后(交易日)", min_value=0, max_value=10, value=1, step=1))
    with p2:
        rf_pct = float(st.number_input("年化无风险利率(%)", min_value=0.0, max_value=15.0, value=4.0, step=0.1))
    with p3:
        cost_scale = float(st.slider("交易成本系数", min_value=0.5, max_value=2.0, value=1.0, step=0.1, help="按比例放大/缩小基础单边费率。1.0=默认，1.5=成本增加50%，0.8=成本降低20%。"))
    with p4:
        max_leverage = float(st.slider("最大杠杆", min_value=1.0, max_value=2.0, value=2.0, step=0.1))
    with p5:
        leverage_follow_allocation = st.checkbox("杠杆联动仓位档", value=True, help="开启后，最大杠杆变化会按比例联动所有仓位档位与底仓。")

    # ETH 专属：急跌减仓 + 事件概率看板 + 紧急对冲
    with st.expander("ETH 风险控制与事件统计", expanded=False):
        e1, e2, e3, e4 = st.columns(4)
        with e1:
            eth_shock_enabled = st.checkbox("启用ETH单日急跌减仓", value=True)
        with e2:
            eth_shock_drop_pct = float(st.slider("ETH急跌阈值(%)", min_value=3.0, max_value=20.0, value=13.5, step=0.5))
        with e3:
            eth_shock_retain_ratio = float(st.slider("触发后多头保留比例", min_value=0.0, max_value=1.0, value=0.5, step=0.05))
        with e4:
            eth_event_hedge_enabled = st.checkbox("启用ETH紧急对冲", value=True)

        h1, h2, h3, h4 = st.columns(4)
        with h1:
            eth_hedge_fraction = float(st.slider("对冲资金比例", min_value=0.10, max_value=1.00, value=1.0 / 3.0, step=0.05))
        with h2:
            eth_hedge_leverage = float(st.slider("对冲杠杆上限(x)", min_value=1.0, max_value=3.0, value=2.0, step=0.1))
        with h3:
            eth_hedge_hold_days = int(st.slider("对冲持有天数(T+)", min_value=1, max_value=2, value=2, step=1))
        with h4:
            eth_hedge_takeprofit_drop = float(st.slider("触发后累计跌幅平仓(%)", min_value=10.0, max_value=30.0, value=20.0, step=1.0))

        s1, s2, s3 = st.columns(3)
        with s1:
            eth_hedge_cap_ratio = float(st.slider("对冲上限(相对最大杠杆)", min_value=0.5, max_value=2.0, value=1.0, step=0.1))
        with s2:
            st.caption("ETH事件统计改用下方全标的趋势统计面板。")
        with s3:
            st.caption("ETH对冲逻辑只影响ETH，不影响其它标的。")

    with st.expander("趋势跟随设置（全标的事件统计）", expanded=False):
        s1, s2, s3 = st.columns(3)
        with s1:
            trend_event_enabled = st.checkbox("显示事件统计面板", value=True, help="对每个标的统计‘单日大涨/大跌’后的前瞻收益表现。")
        with s2:
            trend_event_threshold = float(st.slider("单日涨跌阈值(%)", min_value=1.0, max_value=20.0, value=5.0, step=0.5))
        with s3:
            st.caption("窗口: T+3D / T+5D / T+21D / T+63D")

        d1, d2 = st.columns(2)
        with d1:
            trend_stats_start = st.date_input(
                "统计起始日期",
                value=default_start,
                min_value=idx_min,
                max_value=idx_max,
                key="trend_stats_start_date"
            )
        with d2:
            trend_stats_end = st.date_input(
                "统计结束日期",
                value=idx_max,
                min_value=idx_min,
                max_value=idx_max,
                key="trend_stats_end_date"
            )

    # 固定使用防守稳健策略（不再暴露策略切换）
    preset_name = "防守稳健"

    preset_map = {
        "趋势跟随": {
            "allow_short": True,
            "short_leverage": 0.7,
            "short_min_risk_count": 3,
            "cfg": {
                "th1": 20.0, "th2": 35.0, "th3": 50.0, "th4": 65.0, "th5": 80.0,
                "regime_low": 35.0, "regime_mid": 50.0, "regime_hi": 65.0, "regime_top": 80.0,
                "base_risk_off": 0.10, "base_caution": 0.40, "base_neutral": 0.90, "base_risk_on": 1.20, "base_super": 1.35,
                "floor_risk_off": 0.00, "floor_caution": 0.20, "floor_neutral": 0.55, "floor_risk_on": 0.75, "floor_super": 0.85,
                "crypto_strong_mult": 1.00, "crypto_up_mult": 0.92, "crypto_flat_mult": 0.78, "crypto_down_mult": 0.52,
                "other_strong_mult": 1.00, "other_up_mult": 0.92, "other_flat_mult": 0.80, "other_down_mult": 0.58,
                "short_score_threshold": 24.0, "short_trigger_score": 26.0, "short_trigger_deep": 18.0,
                "hedge_size_weak": 0.30, "hedge_size_strong": 0.55, "hedge_size_early": 0.20, "short_min_risk_count_early": 3,
                "long_bias_mode": True, "long_bias_min": 0.35,
                "rebalance_mode": "W", "min_hold_days": 14, "trade_buffer": 0.25, "position_step": 0.20,
                "macro_smooth_span": 10, "regime_confirm_days": 3,
                "emergency_risk_count": 3, "emergency_score": 18.0,
                "liq_cut_mild": 0.90, "liq_cut_strong": 0.75,
                "macro_trend_window": 20, "macro_up_th": 4.0, "macro_down_th": -4.0,
                "macro_up_add": 0.12, "macro_down_cut": 0.15,
                "regime_base_weight": 0.68, "regime_trend_weight": 0.24, "regime_fast_weight": 0.08,
                "macro_trend_scale": 4.8, "macro_trend_fast_scale": 2.9,
                "parallel_macro_weight": 0.55, "parallel_trend_weight": 0.45,
                "parallel_bull_boost": 0.35, "parallel_bull_min_score": 24.0,
                "trend_target_strong_crypto": 1.50, "trend_target_up_crypto": 1.40,
                "trend_target_flat_crypto": 1.05, "trend_target_weak_crypto": 0.75, "trend_target_break_crypto": 0.30,
                "trend_target_strong_other": 1.35, "trend_target_up_other": 1.15,
                "trend_target_flat_other": 0.90, "trend_target_weak_other": 0.70, "trend_target_break_other": 0.25,
                "ma60_break_cut_ratio": 0.90, "weak_floor_cap_ratio": 1.00
                ,"slippage_mult": 0.30, "funding_bps_daily": 1.0
            }
        },
        "防守稳健": {
            "allow_short": True,
            "short_leverage": 0.4,
            "short_min_risk_count": 3,
            "cfg": {
                "th1": 20.0, "th2": 35.0, "th3": 50.0, "th4": 65.0, "th5": 80.0,
                "regime_low": 35.0, "regime_mid": 50.0, "regime_hi": 65.0, "regime_top": 80.0,
                "base_risk_off": 0.05, "base_caution": 0.30, "base_neutral": 0.70, "base_risk_on": 0.95, "base_super": 1.10,
                "floor_risk_off": 0.00, "floor_caution": 0.12, "floor_neutral": 0.45, "floor_risk_on": 0.62, "floor_super": 0.70,
                "crypto_strong_mult": 1.00, "crypto_up_mult": 0.90, "crypto_flat_mult": 0.72, "crypto_down_mult": 0.45,
                "other_strong_mult": 1.00, "other_up_mult": 0.90, "other_flat_mult": 0.75, "other_down_mult": 0.55,
                "short_score_threshold": 22.0, "short_trigger_score": 28.0, "short_trigger_deep": 18.0,
                "hedge_size_weak": 0.30, "hedge_size_strong": 0.70, "hedge_size_early": 0.15, "short_min_risk_count_early": 3,
                "long_bias_mode": True, "long_bias_min": 0.25,
                "rebalance_mode": "M", "min_hold_days": 15, "trade_buffer": 0.20, "position_step": 0.10,
                "macro_smooth_span": 14, "regime_confirm_days": 5,
                "emergency_risk_count": 3, "emergency_score": 20.0,
                "liq_cut_mild": 0.82, "liq_cut_strong": 0.65,
                "macro_trend_window": 25, "macro_up_th": 4.0, "macro_down_th": -4.0,
                "macro_up_add": 0.08, "macro_down_cut": 0.18,
                "regime_base_weight": 0.80, "regime_trend_weight": 0.15, "regime_fast_weight": 0.05,
                "macro_trend_scale": 5.5, "macro_trend_fast_scale": 3.3,
                "parallel_macro_weight": 0.68, "parallel_trend_weight": 0.32,
                "parallel_bull_boost": 0.12, "parallel_bull_min_score": 32.0,
                "trend_target_strong_crypto": 1.30, "trend_target_up_crypto": 1.05,
                "trend_target_flat_crypto": 0.72, "trend_target_weak_crypto": 0.55, "trend_target_break_crypto": 0.22,
                "trend_target_strong_other": 1.15, "trend_target_up_other": 0.92,
                "trend_target_flat_other": 0.65, "trend_target_weak_other": 0.50, "trend_target_break_other": 0.20,
                "ma60_break_cut_ratio": 0.82, "weak_floor_cap_ratio": 1.00
                ,"slippage_mult": 0.30, "funding_bps_daily": 1.0
            }
        }
    }

    with st.expander("策略参数 (分档 / 执行 / 做空)", expanded=False):
        t1, t2, t3, t4, t5 = st.columns(5)
        with t1:
            th1 = float(st.number_input("阈值1", min_value=0.0, max_value=99.0, value=20.0, step=1.0))
        with t2:
            th2 = float(st.number_input("阈值2", min_value=0.0, max_value=99.0, value=35.0, step=1.0))
        with t3:
            th3 = float(st.number_input("阈值3", min_value=0.0, max_value=99.0, value=50.0, step=1.0))
        with t4:
            th4 = float(st.number_input("阈值4", min_value=0.0, max_value=99.0, value=65.0, step=1.0))
        with t5:
            th5 = float(st.number_input("阈值5", min_value=0.0, max_value=100.0, value=80.0, step=1.0))

        a1, a2, a3, a4, a5 = st.columns(5)
        with a1:
            alloc_0_20 = float(st.number_input("0-20仓位", min_value=0.0, max_value=2.0, value=0.20, step=0.05))
        with a2:
            alloc_20_35 = float(st.number_input("20-35仓位", min_value=0.0, max_value=2.0, value=0.45, step=0.05))
        with a3:
            alloc_35_50 = float(st.number_input("35-50仓位", min_value=0.0, max_value=2.0, value=0.65, step=0.05))
        with a4:
            alloc_50_65 = float(st.number_input("50-65仓位", min_value=0.0, max_value=2.0, value=0.85, step=0.05))
        with a5:
            alloc_65_80 = float(st.number_input("65-80仓位", min_value=0.0, max_value=2.0, value=1.00, step=0.05))

        e1, e2, e3, e4 = st.columns(4)
        with e1:
            crypto_mid = float(st.number_input("Crypto中趋势系数", min_value=0.0, max_value=1.0, value=0.92, step=0.05))
        with e2:
            crypto_soft = float(st.number_input("Crypto弱趋势系数", min_value=0.0, max_value=1.0, value=0.78, step=0.05))
        with e3:
            other_mid = float(st.number_input("非Crypto中趋势系数", min_value=0.0, max_value=1.0, value=0.88, step=0.05))
        with e4:
            short_score_threshold = float(st.number_input("做空分数阈值", min_value=0.0, max_value=100.0, value=20.0, step=1.0))

        s1, s2, s3 = st.columns(3)
        with s1:
            allow_short = st.checkbox("启用做空 (仅BTC/ETH/SPY/Nasdaq)", value=False)
        with s2:
            short_leverage = float(st.slider("做空仓位上限", min_value=0.1, max_value=1.5, value=0.5, step=0.1))
        with s3:
            short_min_risk_count = int(st.slider("做空触发风险计数", min_value=1, max_value=4, value=2, step=1))

        l1, l2, l3, l4, l5 = st.columns(5)
        with l1:
            rebalance_label = st.selectbox("调仓频率", ["每周", "每月", "每日"], index=0)
        with l2:
            min_hold_days = int(st.slider("最小持有天数", min_value=0, max_value=40, value=10, step=1))
        with l3:
            trade_buffer = float(st.slider("调仓触发阈值", min_value=0.00, max_value=0.60, value=0.20, step=0.05))
        with l4:
            macro_smooth_span = int(st.slider("宏观平滑天数", min_value=1, max_value=30, value=10, step=1))
        with l5:
            regime_confirm_days = int(st.slider("换档确认天数", min_value=1, max_value=10, value=3, step=1))

        m1, m2, m3 = st.columns(3)
        with m1:
            emergency_risk_count = int(st.slider("紧急风控风险计数", min_value=1, max_value=4, value=3, step=1))
        with m2:
            emergency_score = float(st.slider("紧急风控分数阈值", min_value=0.0, max_value=40.0, value=20.0, step=1.0))
        with m3:
            position_step = float(st.slider("仓位离散步长", min_value=0.05, max_value=0.50, value=0.10, step=0.05))

        r1, r2, r3, r4, r5 = st.columns(5)
        with r1:
            regime_base_weight = float(st.slider("Regime水平权重", min_value=0.40, max_value=0.90, value=0.72, step=0.01))
        with r2:
            regime_trend_weight = float(st.slider("Regime趋势权重", min_value=0.05, max_value=0.40, value=0.20, step=0.01))
        with r3:
            regime_fast_weight = float(st.slider("Regime短趋势权重", min_value=0.00, max_value=0.20, value=0.08, step=0.01))
        with r4:
            macro_trend_scale = float(st.slider("趋势归一尺度", min_value=2.0, max_value=12.0, value=4.8, step=0.1))
        with r5:
            macro_trend_fast_scale = float(st.slider("短趋势归一尺度", min_value=1.0, max_value=8.0, value=2.9, step=0.1))

        p1, p2, p3, p4 = st.columns(4)
        with p1:
            parallel_macro_weight = float(st.slider("并行-宏观权重", min_value=0.30, max_value=0.85, value=0.60, step=0.01))
        with p2:
            parallel_trend_weight = float(st.slider("并行-趋势权重", min_value=0.15, max_value=0.70, value=0.40, step=0.01))
        with p3:
            parallel_bull_boost = float(st.slider("主升段加仓(额外x)", min_value=0.00, max_value=0.60, value=0.20, step=0.05))
        with p4:
            parallel_bull_min_score = float(st.slider("主升段最低宏观分", min_value=10.0, max_value=60.0, value=28.0, step=1.0))

        q1, q2, q3, q4 = st.columns(4)
        with q1:
            trend_target_strong_mult = float(st.slider("强趋势仓位系数", min_value=0.70, max_value=1.20, value=1.00, step=0.05))
        with q2:
            trend_target_up_mult = float(st.slider("上行趋势仓位系数", min_value=0.40, max_value=1.10, value=0.85, step=0.05))
        with q3:
            trend_target_flat_mult = float(st.slider("震荡趋势仓位系数", min_value=0.20, max_value=0.90, value=0.60, step=0.05))
        with q4:
            trend_target_break_mult = float(st.slider("破位趋势仓位系数", min_value=0.00, max_value=0.60, value=0.25, step=0.05))

        cst1, cst2 = st.columns(2)
        with cst1:
            slippage_mult = float(st.slider("滑点系数(基于波动率)", min_value=0.00, max_value=1.00, value=0.30, step=0.05))
        with cst2:
            funding_bps_daily = float(st.slider("杠杆资金成本(bps/日)", min_value=0.0, max_value=10.0, value=1.0, step=0.5))

        h1, h2, h3, h4 = st.columns(4)
        with h1:
            ma60_break_cut_ratio = float(st.slider("跌破60日降仓系数", min_value=0.50, max_value=1.00, value=0.90, step=0.05))
        with h2:
            hedge_size_early = float(st.slider("早期对冲比例", min_value=0.00, max_value=0.80, value=0.20, step=0.05))
        with h3:
            short_min_risk_count_early = int(st.slider("早期对冲风险计数", min_value=1, max_value=4, value=3, step=1))
        with h4:
            long_bias_min = float(st.slider("长仓偏置最低仓位", min_value=0.00, max_value=1.50, value=0.35, step=0.05))

    rebalance_mode = {'每日': 'D', '每周': 'W', '每月': 'M'}[rebalance_label]

    strategy_cfg = {
        'th1': th1, 'th2': th2, 'th3': th3, 'th4': th4, 'th5': th5,
        'alloc_0_20': alloc_0_20,
        'alloc_20_35': alloc_20_35, 'alloc_35_50': alloc_35_50, 'alloc_50_65': alloc_50_65, 'alloc_65_80': alloc_65_80,
        'crypto_mid': crypto_mid, 'crypto_soft': crypto_soft, 'other_mid': other_mid,
        'short_score_threshold': short_score_threshold,
        'regime_low': th2, 'regime_mid': th3, 'regime_hi': th4, 'regime_top': th5,
        'base_risk_off': alloc_0_20, 'base_caution': alloc_20_35, 'base_neutral': alloc_35_50, 'base_risk_on': alloc_50_65, 'base_super': alloc_65_80,
        'floor_risk_off': 0.00,
        'floor_caution': min(alloc_20_35, alloc_20_35 * 0.35),
        'floor_neutral': min(alloc_35_50, alloc_35_50 * 0.60),
        'floor_risk_on': min(alloc_50_65, alloc_50_65 * 0.65),
        'floor_super': min(alloc_65_80, alloc_65_80 * 0.70),
        'crypto_up_mult': crypto_mid,
        'crypto_flat_mult': crypto_soft,
        'crypto_down_mult': 0.52,
        'other_up_mult': other_mid,
        'other_flat_mult': 0.80,
        'other_down_mult': 0.60,
        'position_step': position_step,
        'rebalance_mode': rebalance_mode,
        'min_hold_days': min_hold_days,
        'trade_buffer': trade_buffer,
        'macro_smooth_span': macro_smooth_span,
        'regime_confirm_days': regime_confirm_days,
        'regime_base_weight': regime_base_weight,
        'regime_trend_weight': regime_trend_weight,
        'regime_fast_weight': regime_fast_weight,
        'macro_trend_scale': macro_trend_scale,
        'macro_trend_fast_scale': macro_trend_fast_scale,
        'parallel_macro_weight': parallel_macro_weight,
        'parallel_trend_weight': parallel_trend_weight,
        'parallel_bull_boost': parallel_bull_boost,
        'parallel_bull_min_score': parallel_bull_min_score,
        'trend_target_strong_crypto': max_leverage * trend_target_strong_mult,
        'trend_target_up_crypto': max_leverage * trend_target_up_mult,
        'trend_target_flat_crypto': max_leverage * trend_target_flat_mult,
        'trend_target_break_crypto': max_leverage * trend_target_break_mult,
        'trend_target_strong_other': max_leverage * max(0.70, trend_target_strong_mult * 0.90),
        'trend_target_up_other': max_leverage * max(0.45, trend_target_up_mult * 0.88),
        'trend_target_flat_other': max_leverage * max(0.20, trend_target_flat_mult * 0.92),
        'trend_target_weak_crypto': max_leverage * max(0.15, trend_target_flat_mult * 0.72),
        'trend_target_weak_other': max_leverage * max(0.12, trend_target_flat_mult * 0.65),
        'trend_target_break_other': max_leverage * max(0.00, trend_target_break_mult * 0.90),
        'ma60_break_cut_ratio': ma60_break_cut_ratio,
        'hedge_size_early': hedge_size_early,
        'short_min_risk_count_early': short_min_risk_count_early,
        'long_bias_mode': True,
        'long_bias_min': long_bias_min,
        'slippage_mult': slippage_mult,
        'funding_bps_daily': funding_bps_daily,
        'emergency_risk_count': emergency_risk_count,
        'emergency_score': emergency_score,
        'reference_max_leverage': 1.5,
        'leverage_follow_allocation': leverage_follow_allocation
    }

    # 强制防守稳健预设
    preset = preset_map[preset_name]
    strategy_cfg.update(preset["cfg"])
    allow_short = bool(preset["allow_short"])
    short_leverage = float(preset["short_leverage"])
    short_min_risk_count = int(preset["short_min_risk_count"])
    rebalance_mode = strategy_cfg.get('rebalance_mode', rebalance_mode)
    rebalance_label = {'D': '每日', 'W': '每周', 'M': '每月'}.get(rebalance_mode, rebalance_label)

    rf_rate = rf_pct / 100.0

    def default_cost_bps(asset_name):
        if any(k in asset_name for k in ['BTC', 'Bitcoin', 'ETH', 'Ethereum']):
            return 18.0
        if 'EUR/USD' in asset_name or 'EURUSD' in asset_name:
            return 3.0
        return 4.0

    with st.spinner("Calculating..."):
        score_frame_full = _calculate_score_internal(df_all)
        if score_frame_full.empty:
            st.error("回测失败：宏观总分序列为空。请检查 FRED/Yahoo 数据是否完整。")
            return
        score_frame = score_frame_full[score_frame_full.index >= backtest_start].dropna(subset=['Total_Score']).copy()
        if score_frame.empty:
            st.error(f"回测失败：{backtest_start.strftime('%Y-%m-%d')} 之后没有可用宏观分数数据。")
            return
        start_date = backtest_start.strftime('%Y-%m-%d')
        y_data = get_yahoo_data(start_date)
        if y_data is None or not isinstance(y_data, pd.DataFrame) or y_data.empty:
            st.error("回测失败：Yahoo 行情下载为空。请稍后重试。")
            return
    st.caption(f"回测区间：{score_frame.index.min().strftime('%Y-%m-%d')} 至 {score_frame.index.max().strftime('%Y-%m-%d')}")

    def extract_price(y_df, ticker):
        if isinstance(y_df.columns, pd.MultiIndex):
            lv0 = y_df.columns.get_level_values(0)
            lv1 = y_df.columns.get_level_values(1)
            if ticker in lv0:
                part = y_df[ticker]
                if 'Close' in part.columns:
                    return part['Close']
                if 'Adj Close' in part.columns:
                    return part['Adj Close']
            if 'Close' in lv0 and ticker in y_df['Close'].columns:
                return y_df['Close'][ticker]
            if 'Adj Close' in lv0 and ticker in y_df['Adj Close'].columns:
                return y_df['Adj Close'][ticker]
            if ticker in lv1 and 'Close' in y_df.columns.get_level_values(0):
                return y_df['Close'][ticker]
        else:
            if 'Close' in y_df.columns:
                return y_df['Close']
            if 'Adj Close' in y_df.columns:
                return y_df['Adj Close']
        return pd.Series(dtype=float)

    assets = {
        'Bitcoin (BTC)': 'BTC-USD',
        'Ethereum (ETH)': 'ETH-USD',
        'Gold (GLD)': 'GLD',
        'SPY (SPY)': 'SPY',
        'Nasdaq (IXIC)': '^IXIC',
        'EUR/USD (EURUSD)': 'EURUSD=X'
    }
    tabs = st.tabs(list(assets.keys()))
    
    for (name, ticker), tab in zip(assets.items(), tabs):
        with tab:
            try:
                price_s = extract_price(y_data, ticker)
                if price_s.empty:
                    st.warning(f"{name} 行情为空（{ticker}），请稍后刷新。")
                    continue
                if getattr(price_s.index, "tz", None) is not None:
                    price_s.index = price_s.index.tz_localize(None)
                df = score_frame.join(price_s.rename('Price'), how='inner').dropna(subset=['Total_Score', 'Price'])
                if len(df) < 150:
                    st.warning("数据不足 150 天，暂不回测。")
                    continue

                # 运行策略（含滞后与成本）
                asset_cost_bps = default_cost_bps(name) * cost_scale
                asset_cfg = strategy_cfg.copy()
                asset_allow_short = allow_short
                asset_short_leverage = short_leverage
                asset_short_min_risk_count = short_min_risk_count
                if 'Ethereum' in name or '(ETH)' in name:
                    asset_cfg.update({
                        'eth_shock_enabled': eth_shock_enabled,
                        'eth_shock_drop_pct': eth_shock_drop_pct / 100.0,
                        'eth_shock_retain_ratio': eth_shock_retain_ratio,
                        'eth_event_hedge_enabled': eth_event_hedge_enabled,
                        'eth_hedge_fraction': eth_hedge_fraction,
                        'eth_hedge_leverage': eth_hedge_leverage,
                        'eth_hedge_hold_days': eth_hedge_hold_days,
                        'eth_hedge_takeprofit_drop': eth_hedge_takeprofit_drop / 100.0,
                        'eth_hedge_cap_ratio': eth_hedge_cap_ratio
                    })
                    asset_short_leverage = max(asset_short_leverage, eth_hedge_leverage)

                df = run_strategy_logic(
                    df,
                    'Price',
                    name,
                    macro_lag_days=macro_lag_days,
                    one_way_cost_bps=asset_cost_bps,
                    risk_free_rate=rf_rate,
                    max_leverage=max_leverage,
                    strategy_cfg=asset_cfg,
                    allow_short=asset_allow_short,
                    short_leverage=asset_short_leverage,
                    short_min_risk_count=asset_short_min_risk_count
                )
                trade_log = generate_trade_log(df, 'Price')
                perf = compute_perf_metrics(df, risk_free_rate=rf_rate)

                # --- 顶部 KPI ---
                last_nav = df['Strategy_Nav'].iloc[-1]
                bench_nav = df['Benchmark_Nav'].iloc[-1]
                alpha_pct = (last_nav - bench_nav) * 100
                trades_n = len(trade_log)
                
                # 计算总盈亏比
                if trades_n > 0:
                    avg_win = trade_log[trade_log['PnL'] > 0]['PnL'].mean()
                    avg_loss = trade_log[trade_log['PnL'] < 0]['PnL'].mean()
                    # 防止分母为0或空值
                    if pd.isna(avg_win): avg_win = 0
                    if pd.isna(avg_loss) or avg_loss == 0: 
                        win_loss_ratio = "∞" 
                    else:
                        win_loss_ratio = f"{abs(avg_win/avg_loss):.2f}"
                else:
                    win_loss_ratio = "-"
                
                c1,c2,c3,c4 = st.columns(4)
                c1.metric("Strategy Return", f"{(last_nav-1)*100:.1f}%")
                c2.metric("Benchmark", f"{(bench_nav-1)*100:.1f}%")
                c3.metric("Alpha", f"{alpha_pct:.1f}%")
                c4.metric("PnL Ratio (盈亏比)", win_loss_ratio, help="平均盈利 / 平均亏损")
                if alpha_pct >= 0:
                    st.success(f"目标检查：当前跑赢 Hold（Alpha {alpha_pct:.1f}%）")
                else:
                    st.error(f"目标检查：当前未跑赢 Hold（Alpha {alpha_pct:.1f}%）")

                def _fmt_pct(v):
                    return "-" if pd.isna(v) else f"{v*100:.2f}%"

                def _fmt_num(v):
                    return "-" if pd.isna(v) else f"{v:.2f}"

                c5, c6, c7, c8 = st.columns(4)
                c5.metric("CAGR", _fmt_pct(perf.get('cagr', np.nan)))
                c6.metric("MDD", _fmt_pct(perf.get('mdd', np.nan)))
                c7.metric("Sharpe(月)", _fmt_num(perf.get('sharpe_m', np.nan)))
                c8.metric("Calmar", _fmt_num(perf.get('calmar', np.nan)))

                c9, c10, c11, c12 = st.columns(4)
                c9.metric("Sortino(月)", _fmt_num(perf.get('sortino_m', np.nan)))
                c10.metric("CVaR 5%(日)", _fmt_pct(perf.get('cvar5', np.nan)))
                c11.metric("Down Capture", _fmt_num(perf.get('downside_capture', np.nan)))
                rec_days = perf.get('recovery_days', np.nan)
                c12.metric("Recovery(天)", "-" if pd.isna(rec_days) else f"{int(rec_days)}")
                cycle_switches = int((df['Cycle_State'].diff().fillna(0) != 0).sum()) if 'Cycle_State' in df.columns else 0
                st.caption(f"宏观周期切换次数: {cycle_switches} 次")
                st.caption(
                    f"执行假设: lag={macro_lag_days}日, 最大杠杆={max_leverage:.1f}x, 单边成本={asset_cost_bps:.1f} bps, "
                    f"调仓={rebalance_label}, 最小持有={min_hold_days}天, 触发阈值={trade_buffer:.2f}, "
                    f"做空={'ON' if allow_short else 'OFF'}, 平均日换手={_fmt_pct(perf.get('avg_turnover', np.nan))}, "
                    f"成本拖累累计={_fmt_pct(perf.get('total_cost', np.nan))}"
                )
                st.caption(
                    f"成本分解: 手续费={_fmt_pct(perf.get('fee_cost', np.nan))}, "
                    f"滑点={_fmt_pct(perf.get('slippage_cost', np.nan))}, "
                    f"资金成本={_fmt_pct(perf.get('funding_cost', np.nan))}"
                )

                # 宏观总分趋势
                fig_macro = go.Figure()
                fig_macro.add_trace(go.Scatter(
                    x=df.index,
                    y=df['Total_Score'],
                    mode='lines',
                    name='Macro Score',
                    line=dict(color='#1d4ed8', width=2)
                ))
                if 'Score_Regime_Base' in df.columns:
                    fig_macro.add_trace(go.Scatter(
                        x=df.index,
                        y=df['Score_Regime_Base'],
                        mode='lines',
                        name='Regime Base',
                        line=dict(color='#64748b', width=1.5, dash='dash')
                    ))
                if 'Score_Trend' in df.columns:
                    fig_macro.add_trace(go.Scatter(
                        x=df.index,
                        y=df['Score_Trend'],
                        mode='lines',
                        name='Trend Score',
                        line=dict(color='#f59e0b', width=1.5, dash='dot')
                    ))
                if 'Score_Regime' in df.columns:
                    fig_macro.add_trace(go.Scatter(
                        x=df.index,
                        y=df['Score_Regime'],
                        mode='lines',
                        name='Regime Score',
                        line=dict(color='#0f766e', width=2, dash='dot')
                    ))
                for lv, col in [(20, '#dc2626'), (35, '#f59e0b'), (50, '#64748b'), (65, '#22c55e'), (80, '#16a34a')]:
                    fig_macro.add_hline(y=lv, line_color=col, line_dash='dot', line_width=1, opacity=0.45)
                fig_macro.update_layout(
                    title='宏观得分趋势 (Total / Regime Base / Trend / Regime Composite)',
                    yaxis_title='Score (0-100)',
                    legend=dict(orientation='h'),
                    margin=dict(l=20, r=20, t=50, b=20)
                )
                st.plotly_chart(fig_macro, use_container_width=True, key=f"{ticker}_macro_score_chart")
                st.caption(
                    f"Regime执行分数=宏观总分EWMA平滑(span={macro_smooth_span})，"
                    f"趋势只由均线结构(20/60/120)决定进出场，宏观分只决定仓位大小。"
                )
                lead_lag_tbl = _build_lead_lag_validation(df, score_col='Total_Score', price_col='Price', horizons=(20, 40, 60))
                if not lead_lag_tbl.empty:
                    disp_ll = lead_lag_tbl.copy()
                    for c in ['Corr(Score, FwdRet)', 'Corr(Score, PastRet)', 'Lead_Edge']:
                        disp_ll[c] = disp_ll[c].apply(lambda v: "-" if pd.isna(v) else f"{v:.3f}")
                    st.markdown("##### 领先性验证 (宏观分 vs 收益)")
                    st.dataframe(disp_ll, use_container_width=True, hide_index=True)
                    st.caption("说明: 该面板仅用于离线诊断，不参与交易信号。")

                # 价格 + MA20/60/120
                df['MA20_disp'] = df['Price'].rolling(20).mean()
                df['MA60_disp'] = df['Price'].rolling(60).mean()
                df['MA120_disp'] = df['Price'].rolling(120).mean()
                fig_px = go.Figure()
                fig_px.add_trace(go.Scatter(
                    x=df.index, y=df['Price'], mode='lines', name='Price',
                    line=dict(color='#111827', width=2)
                ))
                fig_px.add_trace(go.Scatter(
                    x=df.index, y=df['MA20_disp'], mode='lines', name='MA20',
                    line=dict(color='#2563eb', width=1.8)
                ))
                fig_px.add_trace(go.Scatter(
                    x=df.index, y=df['MA60_disp'], mode='lines', name='MA60',
                    line=dict(color='#f59e0b', width=1.8)
                ))
                fig_px.add_trace(go.Scatter(
                    x=df.index, y=df['MA120_disp'], mode='lines', name='MA120',
                    line=dict(color='#16a34a', width=1.8)
                ))
                fig_px.update_layout(
                    title='价格趋势与均线结构 (MA20 / MA60 / MA120)',
                    yaxis_title='Price',
                    legend=dict(orientation='h'),
                    margin=dict(l=20, r=20, t=50, b=20)
                )
                st.plotly_chart(fig_px, use_container_width=True, key=f"{ticker}_price_ma_chart")

                if trend_event_enabled:
                    st.markdown("##### 趋势跟随事件统计（单日阈值事件）")
                    stat_start_ts = pd.Timestamp(trend_stats_start)
                    stat_end_ts = pd.Timestamp(trend_stats_end)
                    if stat_end_ts < stat_start_ts:
                        st.warning("统计区间无效：结束日期早于开始日期。")
                    else:
                        px_stats = price_s[(price_s.index >= stat_start_ts) & (price_s.index <= stat_end_ts)].dropna()
                        event_tbl = _build_shock_forward_stats(
                            px_stats,
                            threshold=trend_event_threshold / 100.0,
                            horizons=(3, 5, 21, 63)
                        )
                        if event_tbl.empty:
                            st.info(f"{name} 样本不足，无法生成事件统计。")
                        else:
                            disp_evt = event_tbl.copy()
                            for col in ['胜率(>0)', '均值', '中位数', '25分位', '75分位']:
                                disp_evt[col] = disp_evt[col].apply(lambda v: "-" if pd.isna(v) else f"{v*100:.2f}%")
                            st.dataframe(disp_evt, use_container_width=True, hide_index=True)

                            evt_plot = event_tbl.copy()
                            fig_evt = go.Figure()
                            for evt_name, color in [('大涨事件', '#2563eb'), ('大跌事件', '#dc2626')]:
                                sub = evt_plot[evt_plot['事件类型'] == evt_name]
                                fig_evt.add_trace(go.Bar(
                                    x=sub['前瞻窗口'],
                                    y=sub['均值'],
                                    name=f"{evt_name}后均值",
                                    marker_color=color
                                ))
                            fig_evt.update_layout(
                                barmode='group',
                                title=f'{name} 事件后前瞻收益均值',
                                yaxis_title='Forward Return',
                                legend=dict(orientation='h'),
                                margin=dict(l=20, r=20, t=45, b=20)
                            )
                            st.plotly_chart(fig_evt, use_container_width=True, key=f"{ticker}_event_mean_chart")

                            fig_evt_win = go.Figure()
                            for evt_name, color in [('大涨事件', '#1d4ed8'), ('大跌事件', '#b91c1c')]:
                                sub = evt_plot[evt_plot['事件类型'] == evt_name]
                                fig_evt_win.add_trace(go.Scatter(
                                    x=sub['前瞻窗口'],
                                    y=sub['胜率(>0)'],
                                    mode='lines+markers',
                                    name=f"{evt_name}后胜率",
                                    line=dict(color=color, width=2)
                                ))
                            fig_evt_win.update_layout(
                                title=f'{name} 事件后胜率',
                                yaxis_title='Win Rate',
                                yaxis=dict(tickformat='.0%'),
                                legend=dict(orientation='h'),
                                margin=dict(l=20, r=20, t=45, b=20)
                            )
                            st.plotly_chart(fig_evt_win, use_container_width=True, key=f"{ticker}_event_win_chart")

                if ('Ethereum' in name or '(ETH)' in name) and ('ETH_Shock_Trigger' in df.columns):
                    trig_cnt = int(df['ETH_Shock_Trigger'].sum())
                    hedge_days = int((df.get('ETH_Event_Hedge', pd.Series(0, index=df.index)) > 0).sum())
                    hedge_peak = float(df.get('ETH_Event_Hedge', pd.Series(0.0, index=df.index)).max())
                    st.caption(
                        f"ETH急跌触发次数: {trig_cnt} 次 | 对冲激活天数: {hedge_days} 天 | "
                        f"对冲峰值仓位: {hedge_peak:.2f}x"
                    )

                # Plot + 买卖点标注（基于仓位切换）
                fig = go.Figure()
                fig.add_trace(go.Scatter(x=df.index, y=df['Strategy_Nav'], name='Strategy', line=dict(color='#09ab3b', width=2)))
                fig.add_trace(go.Scatter(x=df.index, y=df['Benchmark_Nav'], name='Hold', line=dict(color='gray', width=1, dash='dot')))
                pos_prev = df['Position'].shift(1).fillna(0.0)
                pos_curr = df['Position'].fillna(0.0)
                pos_delta = (pos_curr - pos_prev).fillna(0.0)
                rebalance_mask = pos_delta.abs() > 1e-8
                regime_col = df['Score_Regime'] if 'Score_Regime' in df.columns else df['Total_Score']
                rebalance_pts = df.loc[rebalance_mask, ['Strategy_Nav']].copy()
                rebalance_custom = np.column_stack([
                    pos_prev.loc[rebalance_mask].values,
                    pos_curr.loc[rebalance_mask].values,
                    pos_delta.loc[rebalance_mask].values,
                    regime_col.loc[rebalance_mask].values
                ]) if len(rebalance_pts) > 0 else None
                # 图上买卖点与交易日志统一：仅标注“开仓/平仓”
                buy_points = pd.DataFrame(columns=['Strategy_Nav'])
                sell_points = pd.DataFrame(columns=['Strategy_Nav'])
                if not trade_log.empty:
                    entry_idx = pd.to_datetime(trade_log['Entry Date'], errors='coerce').dropna()
                    entry_idx = entry_idx[entry_idx.isin(df.index)]
                    if len(entry_idx) > 0:
                        buy_points = df.loc[entry_idx.unique(), ['Strategy_Nav']]

                    exit_idx = pd.to_datetime(
                        trade_log.loc[trade_log['Exit Date'] != 'Running', 'Exit Date'],
                        errors='coerce'
                    ).dropna()
                    exit_idx = exit_idx[exit_idx.isin(df.index)]
                    if len(exit_idx) > 0:
                        sell_points = df.loc[exit_idx.unique(), ['Strategy_Nav']]

                if not buy_points.empty:
                    fig.add_trace(go.Scatter(
                        x=buy_points.index,
                        y=buy_points['Strategy_Nav'],
                        mode='markers',
                        name='Buy',
                        marker=dict(symbol='triangle-up', size=10, color='#2563eb', line=dict(color='white', width=1)),
                        hovertemplate='Buy (开仓)<br>%{x|%Y-%m-%d}<br>Strategy NAV: %{y:.2f}<extra></extra>'
                    ))
                if not sell_points.empty:
                    fig.add_trace(go.Scatter(
                        x=sell_points.index,
                        y=sell_points['Strategy_Nav'],
                        mode='markers',
                        name='Sell',
                        marker=dict(symbol='triangle-down', size=10, color='#dc2626', line=dict(color='white', width=1)),
                        hovertemplate='Sell (平仓)<br>%{x|%Y-%m-%d}<br>Strategy NAV: %{y:.2f}<extra></extra>'
                    ))
                if not rebalance_pts.empty:
                    fig.add_trace(go.Scatter(
                        x=rebalance_pts.index,
                        y=rebalance_pts['Strategy_Nav'],
                        mode='markers',
                        name='Rebalance',
                        marker=dict(symbol='circle-open', size=8, color='#f59e0b', line=dict(color='#b45309', width=1)),
                        customdata=rebalance_custom,
                        hovertemplate='Rebalance (调仓)<br>%{x|%Y-%m-%d}<br>Prev: %{customdata[0]:.2f}x'
                                      '<br>Now: %{customdata[1]:.2f}x<br>Delta: %{customdata[2]:+.2f}x'
                                      '<br>Regime Score: %{customdata[3]:.1f}<extra></extra>'
                    ))

                st.plotly_chart(fig, use_container_width=True, key=f"{ticker}_nav_chart")
                rebalance_events = int((df['Position'].diff().abs().fillna(df['Position'].abs()) > 1e-8).sum())
                st.caption(
                    f"开仓信号: {len(buy_points)} 次 | 平仓信号: {len(sell_points)} 次（与交易日志一致）"
                    f" | 调仓动作: {rebalance_events} 次（仓位变化事件）"
                )

                # 仓位轨迹图：直接展示策略何时、改成了多少仓位
                fig_pos = go.Figure()
                fig_pos.add_trace(go.Scatter(
                    x=df.index,
                    y=df['Position'],
                    mode='lines',
                    name='实际仓位',
                    line=dict(color='#1d4ed8', width=2, shape='hv')
                ))
                fig_pos.add_trace(go.Scatter(
                    x=df.index,
                    y=df['Target_Position'],
                    mode='lines',
                    name='目标仓位',
                    line=dict(color='#f59e0b', width=1.8, dash='dot')
                ))
                if ('Ethereum' in name or '(ETH)' in name) and ('Long_Position' in df.columns):
                    fig_pos.add_trace(go.Scatter(
                        x=df.index,
                        y=df['Long_Position'],
                        mode='lines',
                        name='多头仓位',
                        line=dict(color='#16a34a', width=1.5, dash='solid')
                    ))
                if ('Ethereum' in name or '(ETH)' in name) and ('Hedge_Position' in df.columns):
                    fig_pos.add_trace(go.Scatter(
                        x=df.index,
                        y=df['Hedge_Position'],
                        mode='lines',
                        name='空头对冲仓位',
                        line=dict(color='#dc2626', width=1.5, dash='dash')
                    ))
                if not rebalance_pts.empty:
                    fig_pos.add_trace(go.Scatter(
                        x=rebalance_pts.index,
                        y=pos_curr.loc[rebalance_mask],
                        mode='markers',
                        name='调仓点',
                        marker=dict(symbol='diamond', size=8, color='#7c3aed', line=dict(color='white', width=1)),
                        customdata=rebalance_custom,
                        hovertemplate='调仓点<br>%{x|%Y-%m-%d}<br>Prev: %{customdata[0]:.2f}x<br>Now: %{customdata[1]:.2f}x'
                                      '<br>Delta: %{customdata[2]:+.2f}x<extra></extra>'
                    ))
                fig_pos.update_layout(
                    title='仓位轨迹 (实际仓位 / 目标仓位)',
                    yaxis_title='Position (x)',
                    legend=dict(orientation='h'),
                    margin=dict(l=20, r=20, t=50, b=20)
                )
                st.plotly_chart(fig_pos, use_container_width=True, key=f"{ticker}_position_chart")
                st.caption(
                    f"仓位范围: {df['Position'].min():.2f}x ~ {df['Position'].max():.2f}x"
                    f" | 目标仓位范围: {df['Target_Position'].min():.2f}x ~ {df['Target_Position'].max():.2f}x"
                )

                # Regime 验证面板：检查不同宏观周期里“宏观分 vs 资产收益”关系是否切换
                regime_series = _compute_macro_regime_series(df_all, df.index, z_window=60)
                if regime_series.dropna().empty:
                    st.info("Regime 验证面板：缺少 INDPRO/PCEPILFE 数据，无法完成四象限验证。")
                else:
                    df['Macro_Regime'] = regime_series.reindex(df.index, method='ffill')
                    regime_eval = _build_regime_validation(df, score_col='Total_Score', price_col='Price', regime_col='Macro_Regime')
                    st.markdown("##### Regime 验证面板")
                    if regime_eval.empty:
                        st.info("Regime 验证面板：样本不足，无法统计。")
                    else:
                        disp = regime_eval.copy()
                        for c in ['平均宏观分', '20D均值', '60D均值', '20D胜率', '相关性(分数,20D)', '背离率']:
                            if c in disp.columns:
                                if c in ['20D均值', '60D均值', '20D胜率', '背离率']:
                                    disp[c] = disp[c].apply(lambda v: "-" if pd.isna(v) else f"{v*100:.2f}%")
                                else:
                                    disp[c] = disp[c].apply(lambda v: "-" if pd.isna(v) else f"{v:.2f}")
                        st.dataframe(disp, use_container_width=True, hide_index=True)

                        plot_df = regime_eval.copy()
                        fig_regime = go.Figure()
                        fig_regime.add_trace(go.Bar(
                            x=plot_df['Regime'],
                            y=plot_df['相关性(分数,20D)'],
                            name='相关性(分数,20D)',
                            marker_color='#2563eb'
                        ))
                        fig_regime.add_trace(go.Bar(
                            x=plot_df['Regime'],
                            y=plot_df['背离率'],
                            name='背离率',
                            marker_color='#dc2626',
                            opacity=0.85
                        ))
                        fig_regime.update_layout(
                            title='Regime 分层：相关性与背离率',
                            barmode='group',
                            yaxis_title='Value',
                            legend=dict(orientation='h'),
                            margin=dict(l=20, r=20, t=50, b=20)
                        )
                        st.plotly_chart(fig_regime, use_container_width=True, key=f"{ticker}_regime_validation_chart")

                if rebalance_events > 0:
                    rebal_tbl = pd.DataFrame({
                        'Date': df.index[rebalance_mask],
                        'Prev_Pos': pos_prev.loc[rebalance_mask].round(2).values,
                        'New_Pos': pos_curr.loc[rebalance_mask].round(2).values,
                        'Delta': pos_delta.loc[rebalance_mask].round(2).values,
                        'Regime_Score': regime_col.loc[rebalance_mask].round(1).values,
                        'Signal': df.loc[rebalance_mask, 'Signal_Type'].values
                    })
                    with st.expander("调仓事件日志（仓位变更）", expanded=False):
                        st.dataframe(rebal_tbl.sort_values('Date', ascending=False), use_container_width=True)

                # --- 统计表格 (把 Win% 换成 PnL Ratio) ---
                if not trade_log.empty:
                    c_s1, c_s2 = st.columns(2)
                    
                    # 辅助函数：计算盈亏比
                    def calc_ratio(g):
                        aw = g[g['PnL']>0]['PnL'].mean()
                        al = g[g['PnL']<0]['PnL'].mean()
                        if pd.isna(aw): aw=0
                        if pd.isna(al) or al==0: return "∞"
                        return f"{abs(aw/al):.2f}"

                    with c_s1:
                        st.markdown("##### 🎯 Strategy Mode")
                        trade_log['Base'] = trade_log['Mode'].apply(lambda x: x.split(' (')[0])
                        gs = []
                        for m, g in trade_log.groupby('Base'):
                            gs.append({
                                'Mode': m, 
                                'Trades': len(g), 
                                'PnL Ratio': calc_ratio(g),  # 这里改了
                                'Avg Return': f"{g['PnL'].mean()*100:.1f}%"
                            })
                        st.table(pd.DataFrame(gs).set_index('Mode'))
                        
                    with c_s2:
                        st.markdown("##### 🌍 宏观得分区间")
                        def get_b(s): return "1. <20" if s<20 else ("2. 20-40" if s<40 else ("3. 40-60" if s<60 else "4. >60"))
                        trade_log['Regime'] = trade_log['Entry Score'].apply(get_b)
                        bs = []
                        for b in ["1. <20", "2. 20-40", "3. 40-60", "4. 60+"]:
                            g = trade_log[trade_log['Regime']==b]
                            if len(g)>0:
                                bs.append({
                                    'Regime': b, 
                                    'Trades': len(g), 
                                    'PnL Ratio': calc_ratio(g), 
                                    'Avg Return': f"{g['PnL'].mean()*100:.1f}%"
                                })
                            else: 
                                bs.append({'Regime':b, 'Trades':0, 'PnL Ratio':'-', 'Avg Return':'-'})
                        st.table(pd.DataFrame(bs).set_index('Regime'))
                    
                    with st.expander("模拟交易日志"):
                        dlog = trade_log.copy()
                        dlog['PnL'] = dlog['PnL'].apply(lambda x: f"{x*100:.2f}%")
                        dlog['Entry Price'] = dlog['Entry Price'].apply(lambda x: f"{x:.2f}")
                        dlog['Exit Price'] = dlog['Exit Price'].apply(lambda x: f"{x:.2f}")
                        def hl(s): return ['background-color: #d4edda' if v in ['Win','Floating'] else 'background-color: #f8d7da' for v in s]
                        st.dataframe(dlog[['Entry Date','Mode','Entry Score','Entry Price','Exit Price','PnL','Result']].style.apply(hl, subset=['Result']), use_container_width=True)

            except Exception as e: st.error(f"Error: {e}")

   # ==========================================
    # 7. 策略操作手册 (Standard Operating Procedure)
    # ==========================================
    st.markdown("---")
    st.markdown("### 策略操作手册 (SOP)")
    
    with st.expander("点击查看：宏观环境配合指数进出场执行标准", expanded=False):
        col_rule1, col_rule2 = st.columns(2)
        
        with col_rule1:
            st.markdown("#### Crypto (BTC/ETH) —— 宏观分档 + EMA 执行")
            st.info("先判断宏观状态（Risk-Off/Caution/Neutral/Risk-On），再由 EMA20/60/120 决定执行强度；弱宏观+破位时可触发对冲。")
            st.markdown("""
            **1. 宏观状态机（目标仓位）**
            * 极弱宏观：低仓位或现金（必要时触发对冲）
            * 中性宏观：中等仓位
            * 强宏观：高仓位，允许杠杆扩展（受最大杠杆约束）

            **2. 趋势执行（EMA20/60/120）**
            * 强趋势：按宏观目标高比例执行
            * 中趋势：按宏观目标中比例执行
            * 跌破长期均线：显著降仓

            **3. 风险共振（可选做空）**
            * 仅当“宏观弱 + 趋势破位 + 风险计数达标”同时满足时触发，避免噪声交易。
            """)
            
        with col_rule2:
            st.markdown("#### SPY/Nasdaq/Gold/EURUSD —— 宏观分档 + MA 执行")
            st.success("核心原则：宏观负责“配多少”，均线负责“何时执行”。趋势确认使用 MA20/60/120。")
            st.markdown("""
            **1. 宏观状态决定基础仓位**
            * Risk-Off 低仓，Risk-On 高仓，不再按日频繁切换。

            **2. MA 趋势过滤**
            * 多头结构（Price>MA20>MA60>MA120）提升执行比例
            * 跌破 MA120 并形成空头结构时降仓/对冲

            **3. 低频执行约束**
            * 通过调仓频率、最小持有天数、仓位步长和触发阈值控制换手，适配大资金。
            """)
