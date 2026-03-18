"""Data helpers for the isolated five-asset macro CTA strategy."""

from __future__ import annotations

import json
import importlib
import csv
import io
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pandas as pd
import yfinance as yf

from config import API_KEY, SERIES_IDS
from data_engine import get_mixed_data
from modules.backtest import _calculate_score_internal, _extract_price_series

from .config import ASSETS, DEFAULT_MSTR_TREASURY_SCHEDULE, YFINANCE_SYMBOLS

ROOT = Path(__file__).resolve().parents[3]
MARKET_CACHE_DIR = ROOT / "strategies" / "five_asset_macro_cta" / "state" / "market_cache"
PRICE_CACHE_PATH = MARKET_CACHE_DIR / "prices.csv"
MACRO_CACHE_PATH = MARKET_CACHE_DIR / "macro.csv"
CACHE_META_PATH = MARKET_CACHE_DIR / "meta.json"
DIRECT_MACRO_CACHE_DIR = ROOT / "strategies" / "five_asset_macro_cta" / "state" / "macro_cache"
DIRECT_MACRO_CACHE_PATH = DIRECT_MACRO_CACHE_DIR / "fred_graph_macro.csv"
DIRECT_MACRO_META_PATH = DIRECT_MACRO_CACHE_DIR / "meta.json"
MACRO_PAYLOAD_PATH = ROOT / "web" / "public" / "data" / "macro-data.json"
MSTR_TREASURY_OVERRIDE_PATH = ROOT / "strategies" / "five_asset_macro_cta" / "state" / "mstr_treasury_overrides.json"
MSTR_TREASURY_REMOTE_URL_ENV = "FIVE_ASSET_MSTR_TREASURY_URL"
BITGET_HISTORY_SYMBOLS = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
}
BITGET_QUOTE_SYMBOLS = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
    # Use tokenized gold for the live XAU tape so the real-time quote stays on the
    # same price scale as spot gold instead of falling back to ETF pricing.
    "XAU": "PAXGUSDT",
}
STOOQ_SYMBOLS = {
    "SPY": "spy.us",
    "MSTR": "mstr.us",
}
DAY_MS = 24 * 60 * 60 * 1000
DIRECT_MACRO_SOURCE = "direct_fred_graph"
DIRECT_MACRO_REFRESH_HOURS = 8.0
DIRECT_MACRO_MODULE_META = (
    ("A", "a", "系统流动性", "央行资产负债表、TGA、RRP 与准备金共同定义美元流动性脉冲。"),
    ("B", "b", "资金价格与摩擦", "隔夜利率走廊、回购摩擦与 SRF 占用决定短端资金张力。"),
    ("C", "c", "国债期限结构", "2Y/10Y/30Y 曲线与倒挂修复反映宏观增长与政策预期。"),
    ("D", "d", "实际利率与通胀", "实际利率与盈亏平衡通胀共同定义风险资产贴现率。"),
    ("E", "e", "外部冲击与汇率", "美元、日元与能源价格共同影响全球风险偏好。"),
    ("F", "f", "信用压力", "高收益利差与 BAA10Y 反映信用条件收紧程度。"),
    ("G", "g", "风险偏好", "SPX、VIX 与 VIX/VXV 结构定义市场风险偏好与拥挤度。"),
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _ensure_datetime_index(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    out.index = pd.to_datetime(out.index)
    return out.sort_index()


def _read_csv_frame(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    frame = pd.read_csv(path, index_col=0, parse_dates=True)
    if frame.empty:
        return pd.DataFrame()
    return _ensure_datetime_index(frame)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _parse_iso_timestamp(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _fetch_text(url: str, *, timeout: float = 15.0) -> str:
    if "fred.stlouisfed.org/graph/fredgraph.csv" in url and shutil.which("curl"):
        try:
            completed = subprocess.run(
                ["curl", "-L", "--silent", "--show-error", "--max-time", str(int(max(timeout, 5.0))), url],
                check=True,
                capture_output=True,
                text=True,
                timeout=max(timeout + 5.0, 10.0),
            )
            return completed.stdout
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            pass

    request = Request(url, headers={"User-Agent": "MacroQuant/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"request failed for {url}: {exc}") from exc


def _fetch_json(url: str, *, timeout: float = 15.0) -> dict[str, Any]:
    raw = _fetch_text(url, timeout=timeout)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON response from {url}") from exc


def _normalize_treasury_schedule(raw_schedule: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(raw_schedule)
    if frame.empty:
        return pd.DataFrame(columns=["btc_holdings", "basic_shares_outstanding"])
    if "date" not in frame.columns:
        if "as_of" in frame.columns:
            frame["date"] = frame["as_of"]
        elif "updatedAt" in frame.columns:
            frame["date"] = frame["updatedAt"]
    if "btc_holdings" not in frame.columns:
        for key in ("btc", "btcHoldings", "bitcoin_holdings", "bitcoinHoldings"):
            if key in frame.columns:
                frame["btc_holdings"] = frame[key]
                break
    if "basic_shares_outstanding" not in frame.columns:
        for key in ("basicSharesOutstanding", "shares_outstanding", "sharesOutstanding", "share_count"):
            if key in frame.columns:
                frame["basic_shares_outstanding"] = frame[key]
                break
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame = frame.dropna(subset=["date"]).set_index("date").sort_index()
    for column in ("btc_holdings", "basic_shares_outstanding"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame[["btc_holdings", "basic_shares_outstanding"]].dropna(how="all")

def _treasury_records_to_payload(schedule: pd.DataFrame, *, source: str, label: str, fetched_at: Optional[str]) -> dict[str, Any]:
    rows = []
    if not schedule.empty:
        for dt, row in schedule.iterrows():
            rows.append(
                {
                    "date": pd.Timestamp(dt).strftime("%Y-%m-%d"),
                    "btc_holdings": None if pd.isna(row["btc_holdings"]) else float(row["btc_holdings"]),
                    "basic_shares_outstanding": None if pd.isna(row["basic_shares_outstanding"]) else float(row["basic_shares_outstanding"]),
                }
            )
    return {
        "source": source,
        "label": label,
        "fetchedAt": fetched_at,
        "rowCount": len(rows),
        "schedule": rows,
    }


def _extract_treasury_schedule_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("schedule", "data", "items", "results", "holdings", "treasury"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def write_mstr_treasury_override(
    schedule_frame: pd.DataFrame,
    *,
    source: str,
    label: str,
    fetched_at: Optional[str] = None,
    path: Path = MSTR_TREASURY_OVERRIDE_PATH,
) -> dict[str, Any]:
    payload = _treasury_records_to_payload(
        schedule_frame,
        source=source,
        label=label,
        fetched_at=fetched_at or _now_iso(),
    )
    _write_json(path, payload)
    return payload


def refresh_mstr_treasury_override_from_url(
    url: str,
    *,
    timeout: float = 8.0,
    path: Path = MSTR_TREASURY_OVERRIDE_PATH,
) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": "MacroQuant/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"failed to fetch MSTR treasury source: {exc}") from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("MSTR treasury source did not return valid JSON") from exc

    schedule = _normalize_treasury_schedule(_extract_treasury_schedule_records(payload))
    if schedule.empty:
        raise RuntimeError("MSTR treasury source returned no usable schedule rows")

    return write_mstr_treasury_override(
        schedule,
        source="remote_json",
        label=url,
        fetched_at=_now_iso(),
        path=path,
    )


def load_mstr_treasury_source(*, prefer_remote: bool = False) -> tuple[pd.DataFrame, dict[str, Any], list[str]]:
    warnings: list[str] = []
    remote_url = os.getenv(MSTR_TREASURY_REMOTE_URL_ENV, "").strip()
    if prefer_remote and remote_url:
        try:
            payload = refresh_mstr_treasury_override_from_url(remote_url)
            schedule = _normalize_treasury_schedule(payload.get("schedule", []))
            if not schedule.empty:
                meta = {
                    "source": payload.get("source", "remote_json"),
                    "label": payload.get("label", remote_url),
                    "fetchedAt": payload.get("fetchedAt"),
                    "rowCount": int(payload.get("rowCount", len(schedule))),
                    "remote": True,
                }
                return schedule, meta, warnings
        except Exception as exc:
            warnings.append(f"MSTR treasury 实时源刷新失败，已回退：{exc}")

    override_payload = _read_json(MSTR_TREASURY_OVERRIDE_PATH)
    if override_payload and isinstance(override_payload.get("schedule"), list):
        override_frame = _normalize_treasury_schedule(override_payload["schedule"])
        if not override_frame.empty:
            meta = {
                "source": str(override_payload.get("source", "local_override")),
                "label": str(override_payload.get("label", MSTR_TREASURY_OVERRIDE_PATH.name)),
                "fetchedAt": override_payload.get("fetchedAt"),
                "rowCount": int(override_payload.get("rowCount", len(override_frame))),
                "remote": False,
            }
            return override_frame, meta, warnings

    default_frame = _normalize_treasury_schedule(DEFAULT_MSTR_TREASURY_SCHEDULE)
    meta = {
        "source": "embedded_schedule",
        "label": "内置 Strategy BTC treasury 时间表",
        "fetchedAt": None,
        "rowCount": int(len(default_frame)),
        "remote": False,
    }
    return default_frame, meta, warnings


def load_project_macro_payload(*, prefer_live_builder: bool = True) -> tuple[dict[str, Any] | None, str, list[str]]:
    """Load the project's macro payload from the live builder, then static JSON as fallback."""
    warnings: list[str] = []
    if prefer_live_builder:
        try:
            module = importlib.import_module("api_server")
            builder = getattr(module, "build_macro_payload", None)
            if callable(builder):
                payload = builder()
                data_quality = payload.get("dataQuality", {}) if isinstance(payload, dict) else {}
                ready_modules = list(data_quality.get("readyModules") or [])
                if isinstance(payload, dict) and payload and str(data_quality.get("mode") or "unknown") == "ok" and len(ready_modules) >= 7:
                    return payload, "live_builder", warnings
                if isinstance(payload, dict) and payload:
                    warnings.append("项目宏观实时引擎处于降级模式，已切换到五资产策略自维护的宏观实时源。")
                else:
                    warnings.append("宏观实时引擎返回空 payload，已切换到五资产策略自维护的宏观实时源。")
            else:
                warnings.append("api_server.build_macro_payload 不可用，已切换到五资产策略自维护的宏观实时源。")
        except Exception as exc:
            warnings.append(f"项目宏观实时引擎构建失败，已切换到五资产策略自维护的宏观实时源：{exc}")

    payload = _read_json(MACRO_PAYLOAD_PATH)
    if payload:
        return payload, "static_json", warnings

    direct_payload = _build_direct_macro_payload()
    if direct_payload:
        return direct_payload, DIRECT_MACRO_SOURCE, warnings

    warnings.append("宏观静态快照不可用。")
    return None, "unavailable", warnings


def macro_payload_to_score_frame(payload: Optional[dict[str, Any]]) -> pd.DataFrame:
    """Convert the project's macro payload dashboard scoreSeries into a Total_Score frame."""
    if not payload:
        return pd.DataFrame()
    series = payload.get("dashboard", {}).get("scoreSeries", [])
    if not isinstance(series, list) or not series:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    for item in series:
        if not isinstance(item, dict):
            continue
        date = item.get("date")
        value = item.get("value")
        if date is None or value is None:
            continue
        rows.append({"date": date, "Total_Score": float(value)})

    if not rows:
        return pd.DataFrame()

    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame = frame.dropna(subset=["date"]).set_index("date").sort_index()
    return frame[["Total_Score"]]


def build_macro_signal_context(
    payload: Optional[dict[str, Any]],
    *,
    source_type: str,
    warnings: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Build a compact macro-signal context block for strategy payloads and UI."""
    if not payload:
        return {
            "sourceType": source_type,
            "generatedAt": None,
            "overallScore": None,
            "scoreDate": None,
            "dataQuality": {},
            "modules": [],
            "realtimeSnapshots": [],
            "warnings": warnings or [],
        }

    dashboard = payload.get("dashboard", {})
    score_series = dashboard.get("scoreSeries", [])
    last_score_date = None
    if isinstance(score_series, list) and score_series:
        last_item = score_series[-1]
        if isinstance(last_item, dict):
            last_score_date = last_item.get("date")

    modules = []
    for module in dashboard.get("modules", []):
        if not isinstance(module, dict):
            continue
        modules.append(
            {
                "id": module.get("id"),
                "slug": module.get("slug"),
                "title": module.get("title"),
                "score": module.get("score"),
                "change": module.get("change"),
                "description": module.get("description"),
            }
        )

    return {
        "sourceType": source_type,
        "generatedAt": payload.get("generatedAt"),
        "overallScore": dashboard.get("overallScore"),
        "scoreDate": last_score_date,
        "dataQuality": payload.get("dataQuality", {}),
        "modules": modules,
        "realtimeSnapshots": dashboard.get("realtimeSnapshots", []),
        "warnings": warnings or [],
    }


def _download_fred_graph_series(series_id: str, *, start_date: str) -> pd.Series:
    text = _fetch_text(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
    frame = pd.read_csv(io.StringIO(text))
    if frame.empty or frame.columns.tolist()[:2] != ["observation_date", series_id]:
        raise RuntimeError(f"FRED graph CSV unavailable for {series_id}")
    frame["observation_date"] = pd.to_datetime(frame["observation_date"], errors="coerce")
    frame[series_id] = pd.to_numeric(frame[series_id], errors="coerce")
    frame = frame.dropna(subset=["observation_date"]).set_index("observation_date").sort_index()
    series = frame[series_id]
    series = series.loc[series.index >= pd.Timestamp(start_date).normalize()]
    return series


def _download_direct_macro_frame(start_date: str = "2010-01-01") -> pd.DataFrame:
    pieces: dict[str, pd.Series] = {}
    errors: list[str] = []
    for column, series_id in SERIES_IDS.items():
        try:
            pieces[column] = _download_fred_graph_series(series_id, start_date=start_date)
        except Exception as exc:
            errors.append(f"{column}({series_id}) {exc}")

    if not pieces:
        raise RuntimeError("所有 FRED graph 宏观序列获取失败: " + " | ".join(errors[:5]))

    frame = pd.concat(pieces, axis=1).sort_index().ffill()
    if "DXY" not in frame.columns and "DTWEXBGS" in frame.columns:
        # FRED 自带广义美元指数，可作为 DXY 的稳定代理。
        frame["DXY"] = frame["DTWEXBGS"]
    return _ensure_datetime_index(frame)


def _store_direct_macro_cache(frame: pd.DataFrame, *, start_date: str) -> None:
    DIRECT_MACRO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    frame.to_csv(DIRECT_MACRO_CACHE_PATH, encoding="utf-8")
    _write_json(
        DIRECT_MACRO_META_PATH,
        {
            "cachedAt": _now_iso(),
            "startDate": start_date,
            "rows": int(len(frame)),
            "columns": list(frame.columns),
        },
    )


def _load_direct_macro_cache(start_date: str = "2010-01-01") -> tuple[pd.DataFrame, dict[str, Any] | None]:
    frame = _read_csv_frame(DIRECT_MACRO_CACHE_PATH)
    meta = _read_json(DIRECT_MACRO_META_PATH)
    if frame.empty:
        return pd.DataFrame(), meta
    frame = frame.loc[frame.index >= pd.Timestamp(start_date).normalize()]
    return frame.ffill(), meta


def build_direct_macro_payload_from_frame(frame: pd.DataFrame) -> dict[str, Any] | None:
    frame = _ensure_datetime_index(frame)
    if frame.empty:
        return None
    score_frame = _calculate_score_internal(frame)
    if score_frame.empty or "Total_Score" not in score_frame.columns:
        return None

    last_ts = score_frame.index[-1]
    prior_ts = score_frame.index[-6] if len(score_frame.index) >= 6 else score_frame.index[0]
    total_now = float(score_frame.at[last_ts, "Total_Score"])
    total_then = float(score_frame.at[prior_ts, "Total_Score"])
    ready_modules: list[str] = []
    modules: list[dict[str, Any]] = []

    for key, slug, title, description in DIRECT_MACRO_MODULE_META:
        column = f"Score_{key}"
        value = float(score_frame[column].iloc[-1]) if column in score_frame.columns else 50.0
        prev_value = float(score_frame[column].loc[prior_ts]) if column in score_frame.columns else value
        if column in score_frame.columns:
            ready_modules.append(slug)
        modules.append(
            {
                "id": key,
                "slug": slug,
                "title": title,
                "score": round(value, 2),
                "change": round(value - prev_value, 2),
                "description": description,
            }
        )

    snapshots = []
    for label, column in (("US10Y", "DGS10"), ("DXY", "DXY"), ("VIX", "VIXCLS"), ("SP500", "SP500")):
        if column not in frame.columns:
            snapshots.append({"label": label, "value": "-", "delta": "-", "state": "neutral"})
            continue
        series = frame[column].dropna()
        if series.empty:
            snapshots.append({"label": label, "value": "-", "delta": "-", "state": "neutral"})
            continue
        last_val = float(series.iloc[-1])
        prev_val = float(series.iloc[-2]) if len(series) > 1 else last_val
        delta_pct = ((last_val / prev_val) - 1.0) * 100.0 if abs(prev_val) > 1e-12 else 0.0
        tone = "positive"
        if label in {"DXY", "VIX"}:
            tone = "negative" if delta_pct > 0 else "positive"
        else:
            tone = "positive" if delta_pct >= 0 else "negative"
        snapshots.append(
            {
                "label": label,
                "value": f"{last_val:.2f}",
                "delta": f"{delta_pct:+.2f}%",
                "state": tone,
            }
        )

    status_tags: list[dict[str, str]] = []
    if total_now >= 65:
        status_tags.append({"label": "风险偏好扩张", "tone": "positive"})
    elif total_now <= 35:
        status_tags.append({"label": "风险偏好收缩", "tone": "negative"})
    else:
        status_tags.append({"label": "中性区间", "tone": "neutral"})

    return {
        "generatedAt": _now_iso(),
        "dataQuality": {
            "mode": "ok" if len(ready_modules) == len(DIRECT_MACRO_MODULE_META) else "degraded",
            "readyModules": ready_modules,
            "missingModules": [slug for _, slug, _, _ in DIRECT_MACRO_MODULE_META if slug not in ready_modules],
            "availableColumnCount": int(len(frame.columns)),
            "availableColumns": list(frame.columns),
            "rows": int(len(frame)),
        },
        "dashboard": {
            "overallScore": {
                "value": round(total_now, 2),
                "wow": round(total_now - total_then, 2),
                "statusTags": status_tags,
            },
            "scoreSeries": [
                {"date": ts.strftime("%Y-%m-%d"), "value": round(float(value), 2)}
                for ts, value in score_frame["Total_Score"].loc[
                    score_frame.index >= pd.Timestamp("2020-01-01")
                ].items()
            ],
            "modules": modules,
            "realtimeSnapshots": snapshots,
        },
        "modules": {},
        "backtest": {},
        "marketDaily": {},
        "usEconomy": {},
    }


def _build_direct_macro_payload(start_date: str = "2010-01-01") -> dict[str, Any] | None:
    frame = load_project_macro_frame(start_date=start_date)
    return build_direct_macro_payload_from_frame(frame)


def load_project_macro_frame(start_date: str = "2010-01-01") -> pd.DataFrame:
    """Load a live macro frame for the five-asset strategy, preferring direct FRED graph data."""
    cached_frame, meta = _load_direct_macro_cache(start_date=start_date)
    cached_at = _parse_iso_timestamp((meta or {}).get("cachedAt"))
    now = datetime.now(timezone.utc)
    if not cached_frame.empty and cached_at is not None:
        age_hours = (now - cached_at).total_seconds() / 3600.0
        if age_hours <= DIRECT_MACRO_REFRESH_HOURS:
            return cached_frame

    try:
        frame = _download_direct_macro_frame(start_date=start_date)
        if not frame.empty:
            _store_direct_macro_cache(frame, start_date=start_date)
            return frame
    except Exception:
        pass

    if not cached_frame.empty:
        return cached_frame

    loader = getattr(get_mixed_data, "__wrapped__", get_mixed_data)
    frame = loader(API_KEY, SERIES_IDS, start_date=start_date)
    if frame is None:
        return pd.DataFrame()
    return _ensure_datetime_index(frame).ffill()


def _download_yahoo_price_frame(
    start_date: str,
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    raw = yf.download(
        " ".join(YFINANCE_SYMBOLS.values()),
        start=start_date,
        end=end_date,
        auto_adjust=False,
        group_by="ticker",
        progress=False,
        threads=True,
    )
    return normalize_price_frame(raw)


def _download_yahoo_history(
    symbol: str,
    *,
    start_date: str,
    end_date: Optional[str] = None,
) -> pd.Series:
    frame = yf.download(
        symbol,
        start=start_date,
        end=end_date,
        auto_adjust=False,
        progress=False,
        threads=False,
    )
    if frame is None or frame.empty:
        raise RuntimeError(f"Yahoo 历史数据不可用: {symbol}")

    if "Adj Close" in frame.columns:
        series = pd.to_numeric(frame["Adj Close"], errors="coerce")
    elif "Close" in frame.columns:
        series = pd.to_numeric(frame["Close"], errors="coerce")
    else:
        raise RuntimeError(f"Yahoo 历史数据缺少收盘列: {symbol}")

    series.index = pd.to_datetime(series.index)
    series = series.dropna().sort_index()
    if series.empty:
        raise RuntimeError(f"Yahoo 历史数据切片为空: {symbol}")
    return series


def _download_yahoo_quote(symbol: str) -> tuple[pd.Timestamp, float]:
    frame = yf.download(
        symbol,
        period="5d",
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=False,
    )
    if frame is None or frame.empty:
        raise RuntimeError(f"Yahoo 报价不可用: {symbol}")

    if "Adj Close" in frame.columns:
        series = pd.to_numeric(frame["Adj Close"], errors="coerce")
    elif "Close" in frame.columns:
        series = pd.to_numeric(frame["Close"], errors="coerce")
    else:
        raise RuntimeError(f"Yahoo 报价缺少收盘列: {symbol}")

    series.index = pd.to_datetime(series.index)
    series = series.dropna().sort_index()
    if series.empty:
        raise RuntimeError(f"Yahoo 报价为空: {symbol}")
    return pd.Timestamp(series.index[-1]).normalize(), float(series.iloc[-1])


def _download_bitget_history(
    symbol: str,
    *,
    start_date: str,
    end_date: Optional[str] = None,
) -> pd.Series:
    start_ts = pd.Timestamp(start_date).normalize()
    end_ts = pd.Timestamp(end_date).normalize() if end_date else pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()
    cursor_end_ms = int((end_ts + pd.Timedelta(days=1)).timestamp() * 1000)
    start_ms = int(start_ts.timestamp() * 1000)
    records: dict[pd.Timestamp, float] = {}

    for _ in range(8):
        url = (
            "https://api.bitget.com/api/v2/spot/market/candles"
            f"?symbol={symbol}&granularity=1day&limit=1000&endTime={cursor_end_ms}"
        )
        payload = _fetch_json(url)
        rows = payload.get("data", [])
        if not isinstance(rows, list) or not rows:
            break

        earliest_ms: int | None = None
        for row in rows:
            if not isinstance(row, list) or len(row) < 5:
                continue
            ts_ms = int(float(row[0]))
            close = float(row[4])
            dt = pd.to_datetime(ts_ms, unit="ms", utc=True).tz_convert(None).normalize()
            records[dt] = close
            if earliest_ms is None or ts_ms < earliest_ms:
                earliest_ms = ts_ms

        if earliest_ms is None or earliest_ms <= start_ms:
            break
        cursor_end_ms = earliest_ms - DAY_MS

    if not records:
        raise RuntimeError(f"Bitget 返回空历史数据: {symbol}")

    series = pd.Series(records).sort_index()
    return series.loc[series.index >= start_ts]


def _download_bitget_quote(symbol: str) -> tuple[pd.Timestamp, float]:
    payload = _fetch_json(f"https://api.bitget.com/api/v2/spot/market/tickers?symbol={symbol}")
    rows = payload.get("data", [])
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"Bitget 返回空报价: {symbol}")
    row = rows[0]
    ts_ms = int(float(row["ts"]))
    price = float(row["lastPr"])
    dt = pd.to_datetime(ts_ms, unit="ms", utc=True).tz_convert(None).normalize()
    return dt, price


def _download_stooq_history(
    symbol: str,
    *,
    start_date: str,
    end_date: Optional[str] = None,
) -> pd.Series:
    text = _fetch_text(f"https://stooq.com/q/d/l/?s={symbol}&i=d")
    frame = pd.read_csv(io.StringIO(text))
    if frame.empty or "Date" not in frame.columns or "Close" not in frame.columns:
        raise RuntimeError(f"Stooq 历史数据不可用: {symbol}")
    frame["Date"] = pd.to_datetime(frame["Date"], errors="coerce")
    frame["Close"] = pd.to_numeric(frame["Close"], errors="coerce")
    frame = frame.dropna(subset=["Date", "Close"]).set_index("Date").sort_index()
    start_ts = pd.Timestamp(start_date).normalize()
    out = frame["Close"].loc[frame.index >= start_ts]
    if end_date:
        out = out.loc[out.index <= pd.Timestamp(end_date).normalize()]
    if out.empty:
        raise RuntimeError(f"Stooq 历史数据切片为空: {symbol}")
    return out


def _download_stooq_quote(symbol: str) -> tuple[pd.Timestamp, float]:
    text = _fetch_text(f"https://stooq.com/q/l/?s={symbol}&f=sd2t2ohlcvn&e=csv")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows or len(rows[0]) < 6:
        raise RuntimeError(f"Stooq 报价不可用: {symbol}")
    row = rows[0]
    date_text = row[1]
    close_text = row[5]
    if not date_text or date_text == "N/D" or not close_text or close_text == "N/D":
        raise RuntimeError(f"Stooq 报价为空: {symbol}")
    dt = pd.Timestamp(date_text).normalize()
    price = float(close_text)
    return dt, price


def _merge_live_quote(frame: pd.DataFrame, *, asset: str, quote_dt: pd.Timestamp, quote_price: float) -> pd.DataFrame:
    out = frame.copy()
    quote_dt = pd.Timestamp(quote_dt).normalize()
    if quote_dt not in out.index:
        out.loc[quote_dt, asset] = quote_price
    else:
        out.at[quote_dt, asset] = quote_price
    return out.sort_index()


def _download_hybrid_price_frame(
    start_date: str,
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    pieces: dict[str, pd.Series] = {}
    for asset, symbol in BITGET_HISTORY_SYMBOLS.items():
        pieces[asset] = _download_bitget_history(symbol, start_date=start_date, end_date=end_date)
    for asset, symbol in STOOQ_SYMBOLS.items():
        pieces[asset] = _download_stooq_history(symbol, start_date=start_date, end_date=end_date)
    pieces["XAU"] = _download_yahoo_history(YFINANCE_SYMBOLS["XAU"], start_date=start_date, end_date=end_date)

    frame = pd.concat(pieces, axis=1).sort_index()
    frame = frame.loc[frame.index >= pd.Timestamp(start_date).normalize()]
    if end_date:
        frame = frame.loc[frame.index <= pd.Timestamp(end_date).normalize()]

    if not end_date:
        for asset, symbol in BITGET_QUOTE_SYMBOLS.items():
            quote_dt, quote_price = _download_bitget_quote(symbol)
            frame = _merge_live_quote(frame, asset=asset, quote_dt=quote_dt, quote_price=quote_price)
        for asset, symbol in STOOQ_SYMBOLS.items():
            quote_dt, quote_price = _download_stooq_quote(symbol)
            frame = _merge_live_quote(frame, asset=asset, quote_dt=quote_dt, quote_price=quote_price)

    frame = frame.ffill()
    return normalize_price_frame(frame)


def _resolve_previous_close(
    history: pd.Series,
    *,
    quote_dt: pd.Timestamp,
    quote_price: float,
) -> tuple[float, Optional[pd.Timestamp]]:
    clean = pd.to_numeric(history, errors="coerce").dropna().sort_index()
    if clean.empty:
        return float(quote_price), None

    quote_dt = pd.Timestamp(quote_dt).normalize()
    earlier = clean.loc[clean.index < quote_dt]
    if not earlier.empty:
        return float(earlier.iloc[-1]), pd.Timestamp(earlier.index[-1]).normalize()

    same_day = clean.loc[clean.index == quote_dt]
    if not same_day.empty and len(clean) >= 2:
        return float(clean.iloc[-2]), pd.Timestamp(clean.index[-2]).normalize()

    if len(clean) >= 2:
        return float(clean.iloc[-2]), pd.Timestamp(clean.index[-2]).normalize()

    return float(clean.iloc[-1]), pd.Timestamp(clean.index[-1]).normalize()


def download_live_quote_snapshot(
    *,
    reference_frame: Optional[pd.DataFrame] = None,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    frame = normalize_price_frame(reference_frame) if reference_frame is not None and not reference_frame.empty else _read_csv_frame(PRICE_CACHE_PATH)
    snapshot: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []

    for asset in ASSETS:
        quote_dt: Optional[pd.Timestamp] = None
        quote_price: Optional[float] = None
        source = "unknown"

        try:
            if asset in BITGET_QUOTE_SYMBOLS:
                quote_dt, quote_price = _download_bitget_quote(BITGET_QUOTE_SYMBOLS[asset])
                source = "bitget"
            elif asset in STOOQ_SYMBOLS:
                quote_dt, quote_price = _download_stooq_quote(STOOQ_SYMBOLS[asset])
                source = "stooq"
            else:
                quote_dt, quote_price = _download_yahoo_quote(YFINANCE_SYMBOLS[asset])
                source = "yahoo"
        except Exception as exc:
            warnings.append(f"{asset} 实时报价获取失败，已回退历史收盘价：{exc}")

        history = frame[asset] if not frame.empty and asset in frame.columns else pd.Series(dtype=float)
        if quote_dt is None or quote_price is None:
            history_clean = pd.to_numeric(history, errors="coerce").dropna().sort_index()
            if history_clean.empty:
                continue
            quote_dt = pd.Timestamp(history_clean.index[-1]).normalize()
            quote_price = float(history_clean.iloc[-1])
            source = "cached_close"

        previous_close, previous_close_dt = _resolve_previous_close(history, quote_dt=quote_dt, quote_price=quote_price)
        day_change_pct = ((float(quote_price) / float(previous_close)) - 1.0) * 100.0 if abs(float(previous_close)) > 1e-12 else 0.0

        snapshot[asset] = {
            "asset": asset,
            "price": round(float(quote_price), 4),
            "dayChangePct": round(float(day_change_pct), 2),
            "quoteDate": pd.Timestamp(quote_dt).strftime("%Y-%m-%d"),
            "previousClose": round(float(previous_close), 4),
            "previousCloseDate": previous_close_dt.strftime("%Y-%m-%d") if previous_close_dt is not None else None,
            "source": source,
            "stale": source == "cached_close",
        }

    return snapshot, warnings


def download_price_frame(
    start_date: str,
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    """Download live market prices using the hybrid provider stack, then Yahoo as a last resort."""
    errors: list[str] = []

    try:
        frame = _download_hybrid_price_frame(start_date=start_date, end_date=end_date)
        if not frame.empty:
            return frame
        errors.append("hybrid provider stack returned empty frame")
    except Exception as exc:
        errors.append(f"hybrid provider stack failed: {exc}")

    try:
        frame = _download_yahoo_price_frame(start_date=start_date, end_date=end_date)
        if not frame.empty:
            return frame
        errors.append("yahoo fallback returned empty frame")
    except Exception as exc:
        errors.append(f"yahoo fallback failed: {exc}")

    raise RuntimeError(" | ".join(errors))


def normalize_price_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Normalize either raw Yahoo output or a ready-made asset price frame."""
    if frame is None or frame.empty:
        return pd.DataFrame(columns=list(ASSETS))

    if all(asset in frame.columns for asset in ASSETS):
        out = frame.loc[:, list(ASSETS)].copy()
        return _ensure_datetime_index(out)

    out = pd.DataFrame(index=pd.to_datetime(frame.index))
    for asset in ASSETS:
        symbol = YFINANCE_SYMBOLS[asset]
        out[asset] = _extract_price_series(frame, symbol)

    return _ensure_datetime_index(out)


def store_market_cache(
    macro_frame: pd.DataFrame,
    price_frame: pd.DataFrame,
    *,
    start_date: str,
    end_date: Optional[str] = None,
) -> None:
    """Persist the most recent successful live market inputs for future fallback runs."""
    norm_prices = normalize_price_frame(price_frame)
    norm_macro = _ensure_datetime_index(macro_frame).ffill() if macro_frame is not None and not macro_frame.empty else pd.DataFrame()
    MARKET_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    norm_prices.to_csv(PRICE_CACHE_PATH, encoding="utf-8")
    norm_macro.to_csv(MACRO_CACHE_PATH, encoding="utf-8")
    _write_json(
        CACHE_META_PATH,
        {
            "cachedAt": _now_iso(),
            "priceRows": int(len(norm_prices)),
            "macroRows": int(len(norm_macro)),
            "startDate": start_date,
            "endDate": end_date,
            "assets": list(ASSETS),
        },
    )


def load_market_cache(
    *,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any] | None]:
    """Load cached macro + price inputs and slice them to the requested range."""
    prices = _read_csv_frame(PRICE_CACHE_PATH)
    macro = _read_csv_frame(MACRO_CACHE_PATH)
    meta = _read_json(CACHE_META_PATH)

    if prices.empty:
        return pd.DataFrame(), pd.DataFrame(), meta

    if start_date:
        start_ts = pd.Timestamp(start_date)
        prices = prices.loc[prices.index >= start_ts]
        if not macro.empty:
            macro = macro.loc[macro.index >= start_ts]
    if end_date:
        end_ts = pd.Timestamp(end_date)
        prices = prices.loc[prices.index <= end_ts]
        if not macro.empty:
            macro = macro.loc[macro.index <= end_ts]

    prices = prices.dropna(subset=list(ASSETS))
    if not macro.empty:
        macro = macro.ffill()

    return prices, macro, meta
