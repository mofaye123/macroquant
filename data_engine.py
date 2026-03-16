import concurrent.futures
import io
import os
import shutil
import ssl
import subprocess
import urllib.request

import pandas as pd
import streamlit as st
from fredapi import Fred
import yfinance as yf

# 强制忽略 SSL 证书验证
ssl._create_default_https_context = ssl._create_unverified_context

_LAST_FETCH_META = {
    "fred_success_count": 0,
    "fred_csv_fallback_hits": 0,
    "fred_fetch_mode": "api-first",
    "fredapi_success_count": 0,
    "fredapi_failure_count": 0,
    "fred_csv_blocked": False,
    "fred_csv_skip_reason": None,
    "fred_failed_series": [],
    "fred_failure_details": [],
    "yahoo_columns": [],
    "yahoo_source_map": {},
    "yahoo_failed_targets": [],
    "yahoo_empty_targets": [],
    "yahoo_failure_details": [],
}


def _streamlit_warning(message):
    try:
        from streamlit.runtime.scriptrunner import get_script_run_ctx

        if get_script_run_ctx() is None:
            return
    except Exception:
        return
    st.warning(message)


def _fetch_fred_series_via_csv(series_id, start_date):
    """
    FRED graph CSV endpoint does not require an API key and is a useful fallback
    when fredapi fails or the local API key is invalid.
    """
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd={start_date}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) MacroQuant/1.0",
            "Accept": "text/csv,text/plain;q=0.9,*/*;q=0.8",
            "Referer": "https://fred.stlouisfed.org/",
        },
    )
    body = None
    if shutil.which("curl"):
        try:
            completed = subprocess.run(
                ["curl", "-L", "--silent", "--show-error", "--max-time", "20", url],
                check=True,
                capture_output=True,
                text=True,
                timeout=25,
            )
            body = completed.stdout
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            body = None

    if body is None:
        with urllib.request.urlopen(request, timeout=20, context=ssl._create_unverified_context()) as response:
            body = response.read().decode("utf-8", errors="replace")

    raw = pd.read_csv(io.StringIO(body))
    if raw is None or raw.empty:
        return None

    date_col = "DATE" if "DATE" in raw.columns else "observation_date" if "observation_date" in raw.columns else None
    if date_col is None:
        return None

    value_col = series_id if series_id in raw.columns else next((col for col in raw.columns if col != date_col), None)
    if value_col is None:
        return None

    values = pd.to_numeric(raw[value_col].replace(".", pd.NA), errors="coerce")
    index = pd.to_datetime(raw[date_col], errors="coerce")
    series = pd.Series(values.to_numpy(), index=index).dropna()
    if series.empty:
        return None
    series.index.name = None
    return series


def _fetch_fred_series_via_fredapi(name, series_id, start_date, fred_client):
    if fred_client is None:
        return None, [f"{name}({series_id}) fredapi unavailable"]

    try:
        series = fred_client.get_series(series_id, observation_start=start_date)
        if series is not None and len(series) > 0:
            return series, []
        return None, [f"{name}({series_id}) fredapi empty"]
    except Exception as exc:
        return None, [f"{name}({series_id}) fredapi error: {exc}"]


def _fetch_fred_series_csv_wrapped(name, series_id, start_date):
    try:
        series = _fetch_fred_series_via_csv(series_id, start_date)
        if series is not None and len(series) > 0:
            return series, []
        return None, [f"{name}({series_id}) csv empty"]
    except Exception as exc:
        return None, [f"{name}({series_id}) csv error: {exc}"]


def _parallel_csv_fetch(series_items, start_date, max_workers):
    results = {}
    if not series_items:
        return results

    worker_count = max(1, min(int(max_workers), len(series_items)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as pool:
        future_map = {
            pool.submit(_fetch_fred_series_csv_wrapped, name, series_id, start_date): (name, series_id)
            for name, series_id in series_items
        }
        for future in concurrent.futures.as_completed(future_map):
            name, series_id = future_map[future]
            try:
                series, errors = future.result()
            except Exception as exc:
                series, errors = None, [f"{name}({series_id}) csv worker error: {exc}"]
            results[name] = {"series_id": series_id, "series": series, "errors": errors}
    return results


def _probe_fred_csv_access(start_date):
    probe_name = "WALCL"
    probe_id = "WALCL"
    try:
        series = _fetch_fred_series_via_csv(probe_id, start_date)
        if series is not None and len(series) > 0:
            return True, None
        return False, f"{probe_name}({probe_id}) csv probe empty"
    except Exception as exc:
        return False, f"{probe_name}({probe_id}) csv probe error: {exc}"


def get_last_fetch_meta():
    return dict(_LAST_FETCH_META)


def _extract_close_series_from_yahoo_frame(raw, ticker):
    if raw is None or getattr(raw, "empty", True):
        return None

    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" in raw.columns.get_level_values(0):
            close_frame = raw["Close"].copy()
            if isinstance(close_frame, pd.Series):
                series = close_frame
            elif ticker in close_frame.columns:
                series = close_frame[ticker]
            elif close_frame.shape[1] == 1:
                series = close_frame.iloc[:, 0]
            else:
                return None
        else:
            return None
    elif "Close" in raw.columns:
        series = raw["Close"].copy()
    else:
        return None

    series = pd.to_numeric(series, errors="coerce").dropna()
    if series.empty:
        return None
    if getattr(series.index, "tz", None) is not None:
        series.index = series.index.tz_localize(None)
    series.index.name = None
    return series


def _download_yahoo_target(target_name, tickers, start_date):
    errors = []
    empty_candidates = []

    for ticker in tickers:
        try:
            raw = yf.download(
                ticker,
                start=start_date,
                progress=False,
                auto_adjust=False,
                threads=False,
            )
        except Exception as exc:
            errors.append(f"{ticker}: download error: {exc}")
            continue

        series = _extract_close_series_from_yahoo_frame(raw, ticker)
        if series is None:
            empty_candidates.append(ticker)
            errors.append(f"{ticker}: empty close series")
            continue
        return series.rename(target_name), ticker, errors, empty_candidates

    return None, None, errors, empty_candidates

@st.cache_data(ttl=3600)
def get_mixed_data(api_key, series_ids, start_date='2010-01-01'): 
    """
    同时从 FRED 和 Yahoo Finance 获取数据并合并
    """
    # 1. 获取 FRED 数据
    df_fred = pd.DataFrame()
    fetch_mode = os.getenv("FRED_FETCH_MODE", "api-first").strip().lower()
    max_workers = int(os.getenv("FRED_MAX_WORKERS", "8"))
    fred = None
    if api_key:
        try:
            fred = Fred(api_key=api_key)
        except Exception:
            fred = None

    data = {}
    failed_series = []
    failure_details = []
    csv_fallback_hits = 0
    fredapi_success_count = 0
    fredapi_failure_count = 0
    fred_csv_blocked = False
    fred_csv_skip_reason = None
    pending = list(series_ids.items())

    if fetch_mode in {"csv-only", "csv-first"}:
        csv_allowed, csv_probe_error = _probe_fred_csv_access(start_date)
        if not csv_allowed:
            fred_csv_blocked = True
            fred_csv_skip_reason = csv_probe_error
            failure_details.append(csv_probe_error)
        else:
            csv_results = _parallel_csv_fetch(pending, start_date, max_workers=max_workers)
            next_pending = []
            for name, series_id in pending:
                result = csv_results.get(name, {"series": None, "errors": [f"{name}({series_id}) csv missing result"]})
                series = result["series"]
                if series is not None and len(series) > 0:
                    data[name] = series
                    csv_fallback_hits += 1
                else:
                    next_pending.append((name, series_id))
                    failure_details.extend(result["errors"][:2])
            pending = next_pending

    if fetch_mode in {"api-first", "csv-first"} and pending:
        next_pending = []
        for name, series_id in pending:
            series, errors = _fetch_fred_series_via_fredapi(name, series_id, start_date, fred_client=fred)
            if series is not None and len(series) > 0:
                data[name] = series
                fredapi_success_count += 1
            else:
                next_pending.append((name, series_id))
                fredapi_failure_count += 1
                failure_details.extend(errors[:2])
        pending = next_pending

    if fetch_mode == "api-first" and pending:
        csv_allowed, csv_probe_error = _probe_fred_csv_access(start_date)
        if not csv_allowed:
            fred_csv_blocked = True
            fred_csv_skip_reason = csv_probe_error
            failure_details.append(csv_probe_error)
        else:
            csv_results = _parallel_csv_fetch(pending, start_date, max_workers=max_workers)
            next_pending = []
            for name, series_id in pending:
                result = csv_results.get(name, {"series": None, "errors": [f"{name}({series_id}) csv missing result"]})
                series = result["series"]
                if series is not None and len(series) > 0:
                    data[name] = series
                    csv_fallback_hits += 1
                else:
                    next_pending.append((name, series_id))
                    failure_details.extend(result["errors"][:2])
            pending = next_pending

    for name, series_id in pending:
        failed_series.append(f"{name}({series_id})")

    if failed_series:
        sample = "、".join(failed_series[:8])
        more = f" 等{len(failed_series)}个" if len(failed_series) > 8 else ""
        _streamlit_warning(f"FRED 部分序列拉取失败：{sample}{more}")
    if csv_fallback_hits:
        _streamlit_warning(f"FRED 已使用 CSV 兜底拉取 {csv_fallback_hits} 条序列")

    df_fred = pd.DataFrame(data) if data else pd.DataFrame()

    # 2. 获取 Yahoo 数据 (DXY / VIX / VXV / WTI)
    # DXY 主用 DX-Y.NYB，必要时回退到 DX=F 期货近月连续。
    df_yahoo = pd.DataFrame()
    yahoo_frames = []
    yahoo_source_map = {}
    yahoo_failed_targets = []
    yahoo_empty_targets = []
    yahoo_failure_details = []
    yahoo_targets = {
        "DXY": ["DX-Y.NYB", "DX=F"],
        "VIX_YH": ["^VIX"],
        "VXV_YH": ["^VXV"],
        "WTI_YH": ["CL=F"],
    }

    for target_name, tickers in yahoo_targets.items():
        series, source_ticker, errors, empty_candidates = _download_yahoo_target(target_name, tickers, start_date)
        if series is not None:
            yahoo_frames.append(series.to_frame())
            yahoo_source_map[target_name] = source_ticker
        else:
            yahoo_failed_targets.append(target_name)
        if empty_candidates:
            yahoo_empty_targets.append(target_name)
        yahoo_failure_details.extend(errors[:4])

    if yahoo_frames:
        df_yahoo = pd.concat(yahoo_frames, axis=1).sort_index()
    elif yahoo_failure_details:
        _streamlit_warning(f"Yahoo Finance API fallback failed: {' | '.join(yahoo_failure_details[:3])}")

    _LAST_FETCH_META["fred_success_count"] = len(data)
    _LAST_FETCH_META["fred_csv_fallback_hits"] = csv_fallback_hits
    _LAST_FETCH_META["fred_fetch_mode"] = fetch_mode
    _LAST_FETCH_META["fredapi_success_count"] = fredapi_success_count
    _LAST_FETCH_META["fredapi_failure_count"] = fredapi_failure_count
    _LAST_FETCH_META["fred_csv_blocked"] = fred_csv_blocked
    _LAST_FETCH_META["fred_csv_skip_reason"] = fred_csv_skip_reason
    _LAST_FETCH_META["fred_failed_series"] = failed_series[:20]
    _LAST_FETCH_META["fred_failure_details"] = failure_details[:40]
    _LAST_FETCH_META["yahoo_columns"] = [str(col) for col in df_yahoo.columns]
    _LAST_FETCH_META["yahoo_source_map"] = yahoo_source_map
    _LAST_FETCH_META["yahoo_failed_targets"] = yahoo_failed_targets[:12]
    _LAST_FETCH_META["yahoo_empty_targets"] = yahoo_empty_targets[:12]
    _LAST_FETCH_META["yahoo_failure_details"] = yahoo_failure_details[:20]

    # 3. 合并数据
    # 使用 outer join 确保即使某一侧数据缺失，另一侧也能保留
    if not df_fred.empty and not df_yahoo.empty:
        df_all = df_fred.join(df_yahoo, how='outer')
    elif not df_fred.empty:
        df_all = df_fred
    elif not df_yahoo.empty:
        df_all = df_yahoo
    else:
        return pd.DataFrame()

    # 4. 填充缺失值 (ffill)
    return df_all.ffill().sort_index()
