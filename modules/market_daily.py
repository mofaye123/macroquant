from __future__ import annotations

import math
import os
import time
import json
import re
import html as html_lib
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date, datetime, time as dt_time, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yfinance as yf

_QUOTE_CACHE: Dict[str, Any] = {"expires_at": 0.0, "items": [], "source_mode": "fallback"}
_NEWS_CACHE: Dict[str, Any] = {"expires_at": 0.0, "items": [], "source_mode": "fallback"}
_CALENDAR_CACHE: Dict[str, Any] = {"expires_at": 0.0, "items": [], "source_mode": "fallback"}
_QUOTE_TTL = int(os.getenv("MARKET_DAILY_QUOTE_TTL", "180"))
_NEWS_TTL = int(os.getenv("MARKET_DAILY_NEWS_TTL", "300"))
_CALENDAR_TTL = int(os.getenv("MARKET_DAILY_CALENDAR_TTL", "900"))
_ET_TZ = ZoneInfo("America/New_York")

_DEFAULT_NEWS_FEEDS: Tuple[Tuple[str, str], ...] = (
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
    ("Yahoo Finance Crypto", "https://finance.yahoo.com/topic/crypto/rssindex"),
)

_DEFAULT_TAVILY_QUERIES: Tuple[str, ...] = (
    "latest macro policy market news Federal Reserve Treasury inflation jobs stocks",
    "latest crypto market news Bitcoin Ethereum Solana ETF regulation exchange stablecoin",
    "latest US stock market news AI semiconductor earnings Nasdaq S&P 500",
)

_QUOTE_SYMBOLS: Tuple[Tuple[str, str, str, str], ...] = (
    ("BTC", "BTC-USD", "crypto", "Bitcoin"),
    ("ETH", "ETH-USD", "crypto", "Ethereum"),
    ("SOL", "SOL-USD", "crypto", "Solana"),
    ("GOLD", "GC=F", "commodity", "COMEX Gold"),
    ("SILVER", "SI=F", "commodity", "COMEX Silver"),
    ("WTI", "CL=F", "commodity", "WTI Crude"),
    ("BRENT", "BZ=F", "commodity", "Brent Crude"),
    ("DXY", "DX-Y.NYB", "fx", "US Dollar Index"),
    ("US10Y", "^TNX", "rate", "US 10Y Yield"),
    ("VIX", "^VIX", "rate", "CBOE VIX"),
    ("DJI", "^DJI", "equity_index", "Dow Jones"),
    ("SPX", "^GSPC", "equity_index", "S&P 500"),
    ("IXIC", "^IXIC", "equity_index", "Nasdaq Composite"),
    ("RUT", "^RUT", "equity_index", "Russell 2000"),
    ("SPY", "SPY", "equity_index", "SPDR S&P 500 ETF"),
    ("QQQ", "QQQ", "equity_index", "Invesco QQQ"),
    ("XLK", "XLK", "equity_sector", "Technology"),
    ("XLF", "XLF", "equity_sector", "Financials"),
    ("XLE", "XLE", "equity_sector", "Energy"),
    ("XLV", "XLV", "equity_sector", "Health Care"),
    ("XLI", "XLI", "equity_sector", "Industrials"),
)

_DEEP_DIVE_SYMBOLS: Tuple[Tuple[str, str], ...] = (
    ("NVIDIA", "NVDA"),
    ("Microsoft", "MSFT"),
    ("Apple", "AAPL"),
    ("Amazon", "AMZN"),
    ("Meta", "META"),
    ("Broadcom", "AVGO"),
    ("Tesla", "TSLA"),
)

_NEWS_BUCKET_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "macro_policy": (
        "fed", "fomc", "powell", "sofr", "treasury", "cpi", "inflation", "pce", "jobs", "retail sales",
        "employment", "non-farm", "nfp", "jobless", "yield", "rates", "consumer confidence",
        "美联储", "鲍威尔", "联储", "通胀", "cpi", "pce", "就业", "非农", "零售销售", "初请",
        "失业", "收益率", "利率", "降息", "加息", "财政部", "国债", "消费者信心",
    ),
    "commodities": (
        "oil", "wti", "brent", "gas", "lng", "opec", "commodity", "gold", "silver", "copper",
        "原油", "油价", "布伦特", "黄金", "白银", "天然气", "欧佩克", "大宗商品", "铜",
        "霍尔木兹", "航运", "运价",
    ),
    "geopolitics": (
        "iran", "israel", "trump", "china", "tariff", "sanction", "geopolit", "war", "cuba", "saudi",
        "russia", "ukraine", "middle east", "伊朗", "以色列", "特朗普", "中国", "关税", "制裁",
        "地缘", "战争", "冲突", "古巴", "沙特", "俄罗斯", "乌克兰", "中东", "哈梅内伊",
    ),
    "crypto": (
        "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "stablecoin", "etf", "exchange",
        "crypto", "token", "blockchain", "比特币", "以太坊", "索拉纳", "稳定币", "交易所",
        "加密", "代币", "区块链", "现货etf", "解锁", "链上",
    ),
    "equity": (
        "earnings", "stock", "nasdaq", "s&p", "dow", "semiconductor", "ai", "nvidia", "apple",
        "tesla", "amazon", "meta", "google", "broadcom", "microsoft", "amd", "美股", "财报",
        "标普", "纳指", "道指", "半导体", "英伟达", "苹果", "特斯拉", "亚马逊", "谷歌",
        "博通", "微软", "科技股", "芯片",
    ),
}

_NEWS_BUCKET_PRIORITY: Dict[str, int] = {
    "macro_policy": 6,
    "commodities": 5,
    "crypto": 4,
    "equity": 3,
    "geopolitics": 2,
    "general": 1,
}

_EDITORIAL_SOURCE_BONUS: Dict[str, int] = {
    "reuters": 4,
    "bloomberg": 4,
    "wsj": 4,
    "financial times": 4,
    "ft": 4,
    "federalreserve": 4,
    "treasury": 4,
    "sec": 4,
    "the block": 3,
    "coindesk": 3,
    "cointelegraph": 2,
    "yahoo finance": 2,
}

_CALENDAR_COUNTRY_BONUS: Dict[str, int] = {
    "united states": 10,
    "euro area": 8,
    "germany": 7,
    "united kingdom": 7,
    "china": 7,
    "japan": 6,
    "saudi arabia": 6,
    "canada": 5,
    "france": 5,
    "australia": 5,
    "new zealand": 4,
    "switzerland": 4,
}

_CALENDAR_EVENT_KEYWORDS: Tuple[str, ...] = (
    "inflation", "cpi", "ppi", "gdp", "retail", "employment", "jobless", "non farm", "non-farm",
    "consumer", "confidence", "industrial", "production", "pmi", "interest rate", "rate decision",
    "central bank", "balance of trade", "trade balance", "earnings", "fomc", "powell",
)


def _normalize_as_of(as_of_dt: Optional[datetime]) -> Optional[pd.Timestamp]:
    if as_of_dt is None:
        return None
    ts = pd.Timestamp(as_of_dt)
    if ts.tzinfo is not None:
        ts = ts.tz_convert(None)
    return ts


def _safe_float(value: Any, fallback: Optional[float] = None) -> Optional[float]:
    try:
        if pd.isna(value):
            return fallback
        number = float(value)
        if not math.isfinite(number):
            return fallback
        return number
    except Exception:
        return fallback


def _format_pct(value: Optional[float]) -> str:
    if value is None:
        return "-"
    sign = "+" if value >= 0 else ""
    return f"{sign}{value:.2f}%"


def _pick_close_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    if isinstance(frame.columns, pd.MultiIndex):
        if "Close" in frame.columns.levels[0]:
            close_frame = frame["Close"].copy()
        else:
            close_frame = frame.xs("Close", level=0, axis=1, drop_level=True)
    elif "Close" in frame.columns:
        close_frame = frame[["Close"]].copy()
    else:
        close_frame = frame.copy()

    if isinstance(close_frame, pd.Series):
        close_frame = close_frame.to_frame(name=close_frame.name or "Close")

    if isinstance(close_frame.index, pd.DatetimeIndex) and close_frame.index.tz is not None:
        close_frame.index = close_frame.index.tz_localize(None)

    return close_frame


def _download_close_series(symbols: List[str], period: str = "6mo") -> pd.DataFrame:
    if not symbols:
        return pd.DataFrame()
    try:
        raw = yf.download(symbols, period=period, interval="1d", progress=False, auto_adjust=False)
    except Exception:
        return pd.DataFrame()
    close_frame = _pick_close_frame(raw)
    if close_frame.empty:
        return pd.DataFrame()
    if len(symbols) == 1 and close_frame.shape[1] == 1 and close_frame.columns[0] == "Close":
        close_frame.columns = [symbols[0]]
    close_frame = close_frame.sort_index().ffill()
    return close_frame


def _rsi(series: pd.Series, window: int = 14) -> Optional[float]:
    s = series.dropna()
    if len(s) < window + 2:
        return None
    delta = s.diff()
    gain = delta.clip(lower=0).rolling(window, min_periods=window).mean()
    loss = (-delta.clip(upper=0)).rolling(window, min_periods=window).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return _safe_float(rsi.iloc[-1], None)


def _return_pct(series: pd.Series, lookback: int) -> Optional[float]:
    s = series.dropna()
    if len(s) < lookback + 1:
        return None
    prev = _safe_float(s.iloc[-(lookback + 1)], None)
    latest = _safe_float(s.iloc[-1], None)
    if prev in (None, 0) or latest is None:
        return None
    return (latest / prev - 1.0) * 100.0


def _to_iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_feed_timestamp(value: str) -> str:
    if not value:
        return _to_iso_utc(datetime.now(timezone.utc))
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return _to_iso_utc(parsed)
    except Exception:
        return _to_iso_utc(datetime.now(timezone.utc))


def classify_market_daily_news_bucket(title: str, summary: str = "") -> str:
    title_text = str(title or "").strip().lower()
    body_text = str(summary or "").strip().lower()
    combined = f"{title_text} {body_text}".strip()
    if not combined:
        return "general"

    best_bucket = "general"
    best_score = 0
    best_priority = 0
    for bucket, keywords in _NEWS_BUCKET_KEYWORDS.items():
        title_hits = sum(1 for keyword in keywords if keyword in title_text)
        body_hits = sum(1 for keyword in keywords if keyword in body_text)
        score = title_hits * 3 + body_hits
        priority = _NEWS_BUCKET_PRIORITY.get(bucket, 0)
        if score > best_score or (score == best_score and score > 0 and priority > best_priority):
            best_bucket = bucket
            best_score = score
            best_priority = priority
    return best_bucket if best_score > 0 else "general"


def _normalize_news_key(title: str) -> str:
    text = str(title or "").strip().lower()
    compact = "".join(ch for ch in text if ch.isalnum())
    return compact[:160]


def _parse_news_datetime(value: Any) -> datetime:
    text = str(value or "").strip()
    if not text:
        return datetime.now(timezone.utc)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def _news_editor_score(item: Dict[str, Any]) -> float:
    title = str(item.get("title", "") or "")
    summary = str(item.get("summary", "") or "")
    bucket = str(item.get("bucket", "") or classify_market_daily_news_bucket(title, summary))
    published_at = _parse_news_datetime(item.get("publishedAt"))
    age_hours = max(0.0, (datetime.now(timezone.utc) - published_at).total_seconds() / 3600.0)
    freshness_bonus = max(0.0, 36.0 - min(age_hours, 36.0)) / 4.0
    bucket_bonus = _NEWS_BUCKET_PRIORITY.get(bucket, 1) * 1.2
    source = str(item.get("source", "") or "").lower()
    source_bonus = 1.0
    for needle, bonus in _EDITORIAL_SOURCE_BONUS.items():
        if needle in source:
            source_bonus = float(bonus)
            break
    text = f"{title} {summary}".lower()
    keyword_bonus = 0.0
    for bucket_name, keywords in _NEWS_BUCKET_KEYWORDS.items():
        hits = sum(1 for keyword in keywords if keyword in text)
        if bucket_name == bucket:
            keyword_bonus += min(hits, 4) * 1.5
        elif hits:
            keyword_bonus += min(hits, 2) * 0.2
    summary_bonus = 1.0 if summary else 0.0
    return round(bucket_bonus + freshness_bonus + source_bonus + keyword_bonus + summary_bonus, 4)


def curate_market_daily_news(items: List[Dict[str, Any]], limit: int = 12) -> List[Dict[str, Any]]:
    if not items:
        return []

    deduped: Dict[str, Dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "") or "").strip()
        if not title:
            continue
        bucket = str(item.get("bucket", "") or classify_market_daily_news_bucket(title, str(item.get("summary", "") or "")))
        enriched = dict(item)
        enriched["bucket"] = bucket
        enriched["editorScore"] = _news_editor_score(enriched)
        key = str(item.get("url", "") or "").strip() or _normalize_news_key(title)
        existing = deduped.get(key)
        if existing is None or float(enriched["editorScore"]) > float(existing.get("editorScore", 0.0)):
            deduped[key] = enriched

    ranked = sorted(
        deduped.values(),
        key=lambda item: (
            float(item.get("editorScore", 0.0)),
            str(item.get("publishedAt", "") or ""),
        ),
        reverse=True,
    )

    bucket_caps = {
        "macro_policy": 3,
        "commodities": 3,
        "geopolitics": 2,
        "equity": 3,
        "crypto": 3,
        "general": 2,
    }
    bucket_counts: Dict[str, int] = {}
    selected: List[Dict[str, Any]] = []
    overflow: List[Dict[str, Any]] = []
    for item in ranked:
        bucket = str(item.get("bucket", "general"))
        cap = bucket_caps.get(bucket, 2)
        if bucket_counts.get(bucket, 0) < cap:
            selected.append(item)
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
        else:
            overflow.append(item)
        if len(selected) >= limit:
            break

    if len(selected) < limit:
        for item in overflow:
            selected.append(item)
            if len(selected) >= limit:
                break

    return selected[:limit]


def _fetch_rss_entries(url: str, source: str, limit: int = 6) -> List[Dict[str, Any]]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (MacroQuant MarketDaily/1.0)",
            "Accept": "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        body = response.read()

    root = ET.fromstring(body)
    entries: List[Dict[str, Any]] = []
    seen_titles = set()
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or item.findtext("published") or "").strip()
        if not title or title in seen_titles:
            continue
        seen_titles.add(title)
        entries.append(
            {
                "title": title,
                "source": source,
                "url": link,
                "publishedAt": _parse_feed_timestamp(pub_date),
            }
        )
        if len(entries) >= limit:
            break
    return entries


def _tavily_api_key() -> str:
    return (os.getenv("TAVILY_API_KEY") or "").strip()


def _tavily_queries_from_env() -> List[str]:
    raw = (os.getenv("MARKET_NEWS_TAVILY_QUERY") or os.getenv("MARKET_NEWS_TAVILY_QUERIES") or "").strip()
    if not raw:
        return list(_DEFAULT_TAVILY_QUERIES)
    queries = [chunk.strip() for chunk in raw.split("||") if chunk.strip()]
    return queries or list(_DEFAULT_TAVILY_QUERIES)


def _tavily_domains_from_env() -> List[str]:
    raw = (os.getenv("MARKET_NEWS_TAVILY_DOMAINS") or "").strip()
    if not raw:
        return [
            "reuters.com",
            "bloomberg.com",
            "wsj.com",
            "ft.com",
            "coindesk.com",
            "cointelegraph.com",
            "theblock.co",
            "federalreserve.gov",
            "treasury.gov",
            "sec.gov",
        ]
    return [chunk.strip() for chunk in raw.split(",") if chunk.strip()]


def _parse_tavily_timestamp(value: Any) -> str:
    if isinstance(value, str) and value.strip():
        text = value.strip()
        for candidate in (text, text.replace("Z", "+00:00")):
            try:
                parsed = datetime.fromisoformat(candidate)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return _to_iso_utc(parsed)
            except Exception:
                continue
        return _parse_feed_timestamp(text)
    return _to_iso_utc(datetime.now(timezone.utc))


def _fetch_tavily_entries(
    api_key: str,
    *,
    queries: List[str],
    limit: int = 10,
    days: int = 3,
) -> List[Dict[str, Any]]:
    if not api_key or not queries:
        return []

    request_url = "https://api.tavily.com/search"
    include_domains = _tavily_domains_from_env()
    all_items: List[Dict[str, Any]] = []
    seen_urls: set[str] = set()

    for query in queries[:3]:
        body = {
            "api_key": api_key,
            "query": query,
            "topic": "news",
            "days": max(1, min(7, int(days))),
            "max_results": max(3, min(10, int(limit))),
            "search_depth": "basic",
            "include_answer": False,
            "include_raw_content": False,
            "include_domains": include_domains,
        }
        request = urllib.request.Request(
            request_url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "MacroQuant MarketDaily/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))

        results = payload.get("results", []) if isinstance(payload, dict) else []
        for item in results:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url", "") or "").strip()
            title = str(item.get("title", "") or "").strip()
            if not url or not title or url in seen_urls:
                continue
            seen_urls.add(url)
            content = str(item.get("content", "") or "").strip()
            source = (
                str(item.get("source", "") or "").strip()
                or urllib.parse.urlparse(url).netloc.replace("www.", "")
                or "Tavily"
            )
            all_items.append(
                {
                    "title": title,
                    "summary": content[:280] if content else "",
                    "source": source,
                    "url": url,
                    "publishedAt": _parse_tavily_timestamp(
                        item.get("published_date") or item.get("publishedAt") or item.get("published")
                    ),
                }
            )

    all_items = sorted(all_items, key=lambda x: x.get("publishedAt", ""), reverse=True)
    return all_items[:limit]


def _news_feeds_from_env() -> List[Tuple[str, str]]:
    raw = (os.getenv("MARKET_NEWS_RSS_URLS") or "").strip()
    if not raw:
        return list(_DEFAULT_NEWS_FEEDS)

    feeds: List[Tuple[str, str]] = []
    for chunk in raw.split(","):
        piece = chunk.strip()
        if not piece:
            continue
        if "|" in piece:
            label, url = piece.split("|", 1)
            feeds.append((label.strip() or "Custom RSS", url.strip()))
        else:
            feeds.append(("Custom RSS", piece))
    return feeds or list(_DEFAULT_NEWS_FEEDS)


def _build_market_snapshots(as_of_dt: Optional[datetime] = None) -> Tuple[List[Dict[str, Any]], str]:
    now = time.time()
    as_of_ts = _normalize_as_of(as_of_dt)
    if as_of_ts is None and _QUOTE_CACHE["items"] and now < _QUOTE_CACHE["expires_at"]:
        return list(_QUOTE_CACHE["items"]), str(_QUOTE_CACHE["source_mode"])

    symbols = [symbol for _, symbol, _, _ in _QUOTE_SYMBOLS]
    close_frame = _download_close_series(symbols, period="3mo")
    if as_of_ts is not None and not close_frame.empty:
        close_frame = close_frame[close_frame.index <= as_of_ts]
    rows: List[Dict[str, Any]] = []
    source_mode = "live"

    if close_frame.empty:
        source_mode = "fallback"
        rows = [
            {
                "ticker": "BTC",
                "name": "Bitcoin",
                "bucket": "crypto",
                "spot": 102480.0,
                "change24hPct": 1.82,
                "change7dPct": 5.21,
                "realizedVol14dPct": 56.7,
                "source": "fallback",
            },
            {
                "ticker": "ETH",
                "name": "Ethereum",
                "bucket": "crypto",
                "spot": 4180.0,
                "change24hPct": 0.94,
                "change7dPct": 3.74,
                "realizedVol14dPct": 63.2,
                "source": "fallback",
            },
            {
                "ticker": "SOL",
                "name": "Solana",
                "bucket": "crypto",
                "spot": 246.0,
                "change24hPct": -1.57,
                "change7dPct": 2.08,
                "realizedVol14dPct": 91.5,
                "source": "fallback",
            },
        ]
    else:
        for ticker, symbol, bucket, display_name in _QUOTE_SYMBOLS:
            if symbol not in close_frame.columns:
                continue
            series = close_frame[symbol].dropna()
            if len(series) < 3:
                continue
            latest = _safe_float(series.iloc[-1], None)
            prev1 = _safe_float(series.iloc[-2], None)
            prev7 = _safe_float(series.iloc[-8], None) if len(series) >= 8 else _safe_float(series.iloc[0], None)
            chg1 = None if latest in (None,) or prev1 in (None, 0) else (latest / prev1 - 1.0) * 100.0
            chg7 = None if latest in (None,) or prev7 in (None, 0) else (latest / prev7 - 1.0) * 100.0
            vol = _safe_float(series.pct_change().tail(14).std() * math.sqrt(365.0) * 100.0, None)
            rows.append(
                {
                    "ticker": ticker,
                    "name": display_name,
                    "bucket": bucket,
                    "spot": round(latest or 0.0, 2),
                    "change24hPct": round(chg1 or 0.0, 4),
                    "change7dPct": round(chg7 or 0.0, 2),
                    "realizedVol14dPct": round(vol or 0.0, 2),
                    "source": "yfinance",
                }
            )

    if as_of_ts is None:
        _QUOTE_CACHE["items"] = list(rows)
        _QUOTE_CACHE["source_mode"] = source_mode
        _QUOTE_CACHE["expires_at"] = now + _QUOTE_TTL
    return rows, source_mode


def _build_hot_news(module_cards: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], str, str]:
    now = time.time()
    if _NEWS_CACHE["items"] and now < _NEWS_CACHE["expires_at"]:
        return list(_NEWS_CACHE["items"]), str(_NEWS_CACHE["source_mode"]), str(_NEWS_CACHE.get("provider", "rss"))

    feeds = _news_feeds_from_env()
    news_items: List[Dict[str, Any]] = []
    source_mode = "fallback"
    provider = "rss"

    tavily_key = _tavily_api_key()
    tavily_items: List[Dict[str, Any]] = []
    if tavily_key:
        try:
            tavily_items = _fetch_tavily_entries(
                tavily_key,
                queries=_tavily_queries_from_env(),
                limit=10,
                days=3,
            )
        except Exception:
            tavily_items = []

    rss_items: List[Dict[str, Any]] = []
    for source, url in feeds:
        try:
            rss_items.extend(_fetch_rss_entries(url, source, limit=4))
        except Exception:
            continue

    if tavily_items:
        provider = "tavily"
        source_mode = "live"
        news_items.extend(tavily_items)
        if rss_items:
            source_mode = "hybrid"
            provider = "tavily+rss"
            existing_urls = {str(item.get("url", "") or "").strip() for item in news_items}
            existing_titles = {str(item.get("title", "") or "").strip() for item in news_items}
            for item in rss_items:
                url = str(item.get("url", "") or "").strip()
                title = str(item.get("title", "") or "").strip()
                if (url and url in existing_urls) or (title and title in existing_titles):
                    continue
                news_items.append(item)
                existing_urls.add(url)
                existing_titles.add(title)
    elif rss_items:
        provider = "rss"
        source_mode = "live"
        news_items.extend(rss_items)

    if not news_items:
        source_mode = "fallback"
        provider = "fallback"
        sorted_modules = sorted(module_cards, key=lambda x: x.get("change", 0), reverse=True)
        best = sorted_modules[0] if sorted_modules else {"title": "流动性"}
        weak = sorted_modules[-1] if sorted_modules else {"title": "风险偏好"}
        news_items = [
            {
                "title": f"{best.get('title', '流动性')}本周边际改善，风险资产短线获得支撑",
                "source": "MacroQuant Engine",
                "url": "",
                "publishedAt": _to_iso_utc(datetime.now(timezone.utc)),
            },
            {
                "title": f"{weak.get('title', '风险偏好')}拖累仍在，建议控制高 beta 杠杆",
                "source": "MacroQuant Engine",
                "url": "",
                "publishedAt": _to_iso_utc(datetime.now(timezone.utc)),
            },
            {
                "title": "美股与加密相关性阶段性回升，事件窗口前波动可能放大",
                "source": "MacroQuant Engine",
                "url": "",
                "publishedAt": _to_iso_utc(datetime.now(timezone.utc)),
            },
        ]

    news_items = curate_market_daily_news(news_items, limit=12)

    _NEWS_CACHE["items"] = list(news_items)
    _NEWS_CACHE["source_mode"] = source_mode
    _NEWS_CACHE["provider"] = provider
    _NEWS_CACHE["expires_at"] = now + _NEWS_TTL
    return news_items, source_mode, provider


def _build_deep_dives(as_of_dt: Optional[datetime] = None) -> Tuple[List[Dict[str, Any]], str]:
    as_of_ts = _normalize_as_of(as_of_dt)
    symbols = [symbol for _, symbol in _DEEP_DIVE_SYMBOLS]
    close_frame = _download_close_series(symbols, period="12mo")
    if as_of_ts is not None and not close_frame.empty:
        close_frame = close_frame[close_frame.index <= as_of_ts]
    if close_frame.empty:
        return (
            [
                {
                    "name": "NVIDIA",
                    "ticker": "NVDA",
                    "signal": "趋势延续",
                    "summary": "AI 产业链景气度维持高位，回调时关注 20 日均线支撑。",
                    "rsi14": 61.3,
                    "ret20dPct": 7.2,
                },
                {
                    "name": "Apple",
                    "ticker": "AAPL",
                    "signal": "震荡偏弱",
                    "summary": "估值修复放缓，关注新品周期与服务业务增速能否再加速。",
                    "rsi14": 47.5,
                    "ret20dPct": -1.4,
                },
                {
                    "name": "Tesla",
                    "ticker": "TSLA",
                    "signal": "高波动",
                    "summary": "事件驱动较强，仓位控制优先于方向判断。",
                    "rsi14": 44.2,
                    "ret20dPct": -6.1,
                },
            ],
            "fallback",
        )

    rows: List[Dict[str, Any]] = []
    for name, symbol in _DEEP_DIVE_SYMBOLS:
        if symbol not in close_frame.columns:
            continue
        series = close_frame[symbol].dropna()
        if len(series) < 70:
            continue
        ma20 = _safe_float(series.rolling(20).mean().iloc[-1], None)
        ma60 = _safe_float(series.rolling(60).mean().iloc[-1], None)
        rsi14 = _rsi(series, window=14)
        ret20 = _return_pct(series, 20)
        ret1 = _return_pct(series, 1)
        ret7 = _return_pct(series, 7)
        vol14 = _safe_float(series.pct_change().tail(14).std() * math.sqrt(365.0) * 100.0, None)
        trend_signal = "震荡"
        if ma20 is not None and ma60 is not None:
            if ma20 > ma60 * 1.01:
                trend_signal = "趋势多头"
            elif ma20 < ma60 * 0.99:
                trend_signal = "趋势走弱"
        summary = (
            f"近1日{(ret1 or 0.0):+.2f}%，近7日{(ret7 or 0.0):+.2f}%，近20日{(ret20 or 0.0):+.2f}%，"
            f"14日年化波动{(vol14 or 0.0):.1f}%。"
        )
        if trend_signal == "趋势多头":
            summary += " 均线结构偏多，优先顺势持有，回调分批处理。"
        elif trend_signal == "趋势走弱":
            summary += " 中短期结构偏弱，优先防守，等待放量企稳信号。"
        else:
            summary += " 方向未明，关注突破/跌破关键区间后的确认信号。"
        rows.append(
            {
                "name": name,
                "ticker": symbol,
                "signal": trend_signal,
                "summary": summary,
                "rsi14": round(rsi14 or 50.0, 2),
                "change1dPct": round(ret1 or 0.0, 2),
                "change7dPct": round(ret7 or 0.0, 2),
                "ret20dPct": round(ret20 or 0.0, 2),
                "vol14dPct": round(vol14 or 0.0, 2),
            }
        )

    rows = sorted(rows, key=lambda item: abs(float(item.get("ret20dPct", 0.0))), reverse=True)
    return rows[:5], "live"


def _build_crypto_project_updates(hot_news: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tags = (
        ("bitcoin", "比特币生态"),
        ("btc", "比特币生态"),
        ("ethereum", "以太坊生态"),
        ("eth", "以太坊生态"),
        ("solana", "Solana 生态"),
        ("sol", "Solana 生态"),
        ("stablecoin", "稳定币"),
        ("etf", "ETF / 机构资金"),
        ("exchange", "交易所 / 市场结构"),
        ("crypto", "行业观察"),
        ("token", "行业观察"),
        ("blockchain", "行业观察"),
    )
    updates: List[Dict[str, Any]] = []
    seen_titles: set[str] = set()
    for item in hot_news:
        title = str(item.get("title", "") or "").strip()
        summary = str(item.get("summary", "") or "").strip()
        text = f"{title} {summary}".lower()
        if not title or title in seen_titles:
            continue
        bucket = next((label for needle, label in tags if needle in text), "")
        if not bucket:
            continue
        seen_titles.add(title)
        updates.append(
            {
                "project": bucket,
                "headline": title,
                "source": item.get("source", "News"),
                "url": item.get("url", ""),
            }
        )
        if len(updates) >= 8:
            break

    if updates:
        return updates

    return [
        {
            "project": "比特币生态",
            "headline": "暂无重大突发，维持跟踪 ETF 资金流、链上活跃度与交易所净流向。",
            "source": "MacroQuant Engine",
            "url": "",
        },
        {
            "project": "以太坊生态",
            "headline": "暂无重大突发，关注 ETF 资金流、L2 活跃度与链上费用变化。",
            "source": "MacroQuant Engine",
            "url": "",
        },
        {
            "project": "行业观察",
            "headline": "暂无重大突发，继续跟踪稳定币净增发、交易所持仓与监管动态。",
            "source": "MacroQuant Engine",
            "url": "",
        },
    ]


def _next_weekday_event(base_et: datetime, weekday: int, hour: int, minute: int) -> datetime:
    days_ahead = (weekday - base_et.weekday()) % 7
    candidate_date = base_et.date() + timedelta(days=days_ahead)
    candidate = datetime.combine(candidate_date, dt_time(hour, minute), tzinfo=_ET_TZ)
    if candidate <= base_et:
        candidate += timedelta(days=7)
    return candidate


def _first_weekday_of_month(year: int, month: int, weekday: int) -> date:
    first_day = date(year, month, 1)
    offset = (weekday - first_day.weekday()) % 7
    return first_day + timedelta(days=offset)


def _next_nonfarm_release(base_et: datetime) -> datetime:
    year = base_et.year
    month = base_et.month
    for _ in range(24):
        release_date = _first_weekday_of_month(year, month, 4)
        candidate = datetime.combine(release_date, dt_time(8, 30), tzinfo=_ET_TZ)
        if candidate > base_et:
            return candidate
        month += 1
        if month > 12:
            year += 1
            month = 1
    return datetime.combine(base_et.date(), dt_time(8, 30), tzinfo=_ET_TZ) + timedelta(days=28)


def _calendar_event(dt_et: datetime, category: str, event: str, importance: str, note: str = "") -> Dict[str, Any]:
    dt_utc = dt_et.astimezone(timezone.utc)
    return {
        "date": dt_et.strftime("%Y-%m-%d"),
        "timeEt": dt_et.strftime("%H:%M"),
        "timeUtc": dt_utc.strftime("%H:%M"),
        "country": "美国",
        "category": category,
        "event": event,
        "importance": importance,
        "note": note,
    }


def _calendar_importance_label(value: Any) -> Tuple[int, str]:
    raw = str(value or "").strip()
    if raw in {"高", "high", "HIGH", "⭐⭐⭐", "***"}:
        return 3, "⭐⭐⭐"
    if raw in {"中", "medium", "MEDIUM", "⭐⭐", "**"}:
        return 2, "⭐⭐"
    if raw in {"低", "low", "LOW", "⭐", "*"}:
        return 1, "⭐"
    try:
        level = int(float(raw))
    except Exception:
        level = 1
    level = max(1, min(3, level))
    return level, "⭐" * level


def _calendar_event_score(item: Dict[str, Any]) -> int:
    country = str(item.get("Country") or item.get("country") or "").strip().lower()
    event = str(item.get("Event") or item.get("event") or "").strip().lower()
    category = str(item.get("Category") or item.get("category") or "").strip().lower()
    importance_level, _ = _calendar_importance_label(item.get("Importance") or item.get("importance"))
    score = importance_level * 100
    score += _CALENDAR_COUNTRY_BONUS.get(country, 0)
    if any(keyword in event for keyword in _CALENDAR_EVENT_KEYWORDS):
        score += 20
    if any(keyword in category for keyword in ("inflation", "gdp", "labour", "labor", "rates", "central bank", "economic activity")):
        score += 10
    return score


def _parse_calendar_datetime(value: Any) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    candidates = [
        raw.replace("Z", "+00:00"),
        raw,
    ]
    for candidate in candidates:
        try:
            dt = datetime.fromisoformat(candidate)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(_ET_TZ)
        except Exception:
            continue
    return None


def _fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MacroQuant/1.0",
            "Accept": "text/plain,text/html,application/xml,text/calendar,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read().decode("utf-8", errors="ignore")


def _strip_html_tags(text: str) -> str:
    cleaned = re.sub(r"(?is)<(script|style).*?>.*?</\\1>", " ", text)
    cleaned = re.sub(r"(?s)<[^>]+>", " ", cleaned)
    cleaned = html_lib.unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _unfold_ics_lines(body: str) -> List[str]:
    lines = body.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    unfolded: List[str] = []
    for line in lines:
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def _parse_ics_datetime(field: str, value: str) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw or "VALUE=DATE" in field or len(raw) == 8:
        return None
    try:
        if raw.endswith("Z"):
            dt = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            return dt.astimezone(_ET_TZ)
        dt = datetime.strptime(raw, "%Y%m%dT%H%M%S")
        return dt.replace(tzinfo=_ET_TZ)
    except Exception:
        return None


def _calendar_importance_from_text(text: str) -> str:
    normalized = str(text or "").lower()
    high_keywords = (
        "employment situation",
        "nonfarm",
        "consumer price index",
        "cpi",
        "fomc",
        "interest rate",
        "pce",
        "gross domestic product",
        "gdp",
        "retail sales",
        "jobless claims",
    )
    medium_keywords = (
        "producer price",
        "ppi",
        "job openings",
        "jolts",
        "consumer confidence",
        "ism",
        "pmi",
        "weekly petroleum status",
        "eia",
        "industrial production",
    )
    if any(keyword in normalized for keyword in high_keywords):
        return "高"
    if any(keyword in normalized for keyword in medium_keywords):
        return "中"
    return "低"


def _translate_bls_summary(summary: str) -> str:
    normalized = str(summary or "").lower()
    mappings: Tuple[Tuple[str, str], ...] = (
        ("employment situation", "美国非农就业数据"),
        ("consumer price index", "美国 CPI"),
        ("producer price index", "美国 PPI"),
        ("job openings and labor turnover", "美国 JOLTS 职位空缺"),
        ("import and export prices", "美国进出口价格指数"),
        ("productivity and costs", "美国生产率与单位劳动力成本"),
        ("producer price", "美国 PPI"),
    )
    for needle, label in mappings:
        if needle in normalized:
            return label
    return summary.strip() or "美国宏观数据发布"


def _fetch_bls_calendar_events(base_et: datetime, days_ahead: int = 7) -> List[Dict[str, Any]]:
    try:
        body = _fetch_text("https://www.bls.gov/schedule/news_release/bls.ics")
    except Exception:
        return []

    lines = _unfold_ics_lines(body)
    events: List[Dict[str, Any]] = []
    current: Dict[str, str] = {}
    within_end = base_et.date() + timedelta(days=days_ahead)
    keywords = (
        "employment situation",
        "consumer price index",
        "producer price index",
        "job openings",
        "import and export prices",
        "productivity",
    )

    for line in lines:
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            summary = current.get("SUMMARY", "").strip()
            dtstart_key = next((key for key in current if key.startswith("DTSTART")), "")
            dtstart = _parse_ics_datetime(dtstart_key, current.get(dtstart_key, ""))
            if summary and dtstart and base_et.date() <= dtstart.date() <= within_end:
                if any(keyword in summary.lower() for keyword in keywords):
                    label = _translate_bls_summary(summary)
                    events.append(
                        {
                            **_calendar_event(
                                dtstart,
                                "Macro",
                                label,
                                _calendar_importance_from_text(summary),
                                "BLS 官方发布日历",
                            ),
                            "country": "美国",
                        }
                    )
            current = {}
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        current[key] = value
        if key == "SUMMARY":
            current["SUMMARY"] = value

    return events


def _fetch_eia_calendar_events(base_et: datetime, days_ahead: int = 7) -> List[Dict[str, Any]]:
    try:
        html = _fetch_text("https://www.eia.gov/petroleum/supply/weekly/")
        text = _strip_html_tags(html)
    except Exception:
        return []

    match = re.search(r"Next Release Date:\s*([A-Za-z]+ \d{1,2}, \d{4})", text, re.IGNORECASE)
    if not match:
        return []

    try:
        release_date = datetime.strptime(match.group(1), "%B %d, %Y").date()
    except Exception:
        return []

    if not (base_et.date() <= release_date <= base_et.date() + timedelta(days=days_ahead)):
        return []

    dt_et = datetime.combine(release_date, dt_time(10, 30), tzinfo=_ET_TZ)
    return [
        {
            **_calendar_event(
                dt_et,
                "Energy",
                "美国 EIA 原油库存",
                "中",
                "EIA 官方页面；节假日周可能调整发布时间。",
            ),
            "country": "美国",
        }
    ]


def _fetch_live_market_calendar(as_of: datetime) -> Tuple[List[Dict[str, Any]], str]:
    now_ts = time.time()
    cache_key = as_of.astimezone(_ET_TZ).strftime("%Y-%m-%d")
    if _CALENDAR_CACHE.get("expires_at", 0.0) > now_ts and _CALENDAR_CACHE.get("cache_key") == cache_key:
        return list(_CALENDAR_CACHE.get("items", [])), str(_CALENDAR_CACHE.get("source_mode", "fallback"))

    base_et = as_of.astimezone(_ET_TZ)
    items: List[Dict[str, Any]] = []
    source_mode = "fallback"
    official_items: List[Dict[str, Any]] = []
    try:
        official_items.extend(_fetch_bls_calendar_events(base_et, days_ahead=7))
    except Exception:
        pass
    try:
        official_items.extend(_fetch_eia_calendar_events(base_et, days_ahead=7))
    except Exception:
        pass

    if official_items:
        seen_keys = set()
        deduped: List[Dict[str, Any]] = []
        for item in official_items:
            dedupe_key = (item.get("date", ""), item.get("timeEt", ""), item.get("country", ""), item.get("event", ""))
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)
            deduped.append(item)

        today_items = [item for item in deduped if item.get("date") == base_et.strftime("%Y-%m-%d")]
        candidate_items = today_items or deduped
        scored = sorted(
            candidate_items,
            key=lambda item: (
                -_calendar_event_score(item),
                item.get("date", ""),
                item.get("timeEt", ""),
                item.get("event", ""),
            ),
        )
        items = scored[:8]
        source_mode = "official"

    _CALENDAR_CACHE.update(
        {
            "expires_at": now_ts + _CALENDAR_TTL,
            "items": list(items),
            "source_mode": source_mode,
            "cache_key": cache_key,
        }
    )
    return items, source_mode


def _build_rule_based_market_calendar(as_of: datetime) -> List[Dict[str, Any]]:
    base_et = as_of.astimezone(_ET_TZ)
    events = [
        _calendar_event(
            _next_weekday_event(base_et, 2, 10, 30),
            "Energy",
            "美国 EIA 原油库存",
            "中",
            "每周三 10:30 ET 公布，影响原油与能源板块波动。",
        ),
        _calendar_event(
            _next_weekday_event(base_et, 3, 8, 30),
            "Macro",
            "美国初请失业金人数",
            "高",
            "每周四 08:30 ET 公布，是跟踪劳动力市场边际变化的高频指标。",
        ),
    ]

    next_nonfarm = _next_nonfarm_release(base_et)
    if (next_nonfarm.date() - base_et.date()).days <= 28:
        events.append(
            _calendar_event(
                next_nonfarm,
                "Macro",
                "美国非农就业数据",
                "高",
                "按月公布，通常在每月首个周五 08:30 ET 发布。",
            )
        )

    events.sort(key=lambda item: (item.get("date", ""), item.get("timeEt", "")))
    return events[:6]


def _build_market_calendar(as_of: datetime) -> List[Dict[str, Any]]:
    live_items, source_mode = _fetch_live_market_calendar(as_of)
    if source_mode in {"live", "official"} and live_items:
        return live_items
    return _build_rule_based_market_calendar(as_of)


def _build_push_channels() -> List[Dict[str, Any]]:
    channels = [
        {
            "channel": "telegram",
            "label": "Telegram",
            "configured": bool(os.getenv("DAILY_PUSH_TELEGRAM_BOT_TOKEN") and os.getenv("DAILY_PUSH_TELEGRAM_CHAT_ID")),
            "target": os.getenv("DAILY_PUSH_TELEGRAM_CHAT_ID", ""),
        },
        {
            "channel": "feishu",
            "label": "飞书群机器人",
            "configured": bool(os.getenv("DAILY_PUSH_FEISHU_WEBHOOK")),
            "target": os.getenv("DAILY_PUSH_FEISHU_WEBHOOK", ""),
        },
        {
            "channel": "wecom",
            "label": "企业微信机器人",
            "configured": bool(os.getenv("DAILY_PUSH_WECOM_WEBHOOK")),
            "target": os.getenv("DAILY_PUSH_WECOM_WEBHOOK", ""),
        },
        {
            "channel": "email",
            "label": "Email",
            "configured": bool(os.getenv("DAILY_PUSH_EMAIL_TO")),
            "target": os.getenv("DAILY_PUSH_EMAIL_TO", ""),
        },
    ]
    for item in channels:
        item["status"] = "ready" if item["configured"] else "pending"
    return channels


def _build_replay_lines(overall_score: float, modules: List[Dict[str, Any]], snapshots: List[Dict[str, Any]]) -> List[str]:
    best = max(modules, key=lambda x: x.get("change", -999)) if modules else None
    weak = min(modules, key=lambda x: x.get("change", 999)) if modules else None
    btc_row = next((row for row in snapshots if row.get("ticker") == "BTC"), None)
    lines = []
    lines.append(
        "总分高于 60 时优先顺势做多，总分低于 45 时优先防守并降低高 beta 暴露。"
        if overall_score >= 60
        else "总分处于中低位，技术触发信号需要搭配更严格的仓位与止损规则。"
    )
    if best:
        lines.append(f"本周主驱动来自 {best.get('title', best.get('id', '模块'))}，边际变化 {best.get('change', 0):+.1f}。")
    if weak:
        lines.append(f"主要拖累来自 {weak.get('title', weak.get('id', '模块'))}，边际变化 {weak.get('change', 0):+.1f}。")
    if btc_row:
        lines.append(
            f"BTC 24H {_format_pct(_safe_float(btc_row.get('change24hPct'), 0.0))}，7D {_format_pct(_safe_float(btc_row.get('change7dPct'), 0.0))}，"
            "执行上优先看关键位是否放量确认。"
        )
    sectors = [row for row in snapshots if row.get("bucket") == "equity_sector"]
    if sectors:
        best_sector = max(sectors, key=lambda row: float(row.get("change7dPct", 0.0)))
        weak_sector = min(sectors, key=lambda row: float(row.get("change7dPct", 0.0)))
        lines.append(
            f"板块层面，{best_sector.get('ticker')} 近7日 {_format_pct(_safe_float(best_sector.get('change7dPct'), 0.0))} 领跑，"
            f"{weak_sector.get('ticker')} 近7日 {_format_pct(_safe_float(weak_sector.get('change7dPct'), 0.0))} 偏弱。"
        )
    rates = [row for row in snapshots if row.get("bucket") == "rate"]
    if rates:
        vix_row = next((row for row in rates if row.get("ticker") == "VIX"), None)
        tnx_row = next((row for row in rates if row.get("ticker") == "US10Y"), None)
        if vix_row or tnx_row:
            pieces = []
            if vix_row:
                pieces.append(f"VIX 现报 {vix_row.get('spot', '-')}")
            if tnx_row:
                pieces.append(f"10Y 收益率现报 {tnx_row.get('spot', '-')}")
            lines.append("波动与利率环境方面，" + "，".join(pieces) + "。")
    return lines[:6]


def _build_desk_views(overall_score: float, modules: List[Dict[str, Any]], snapshots: List[Dict[str, Any]]) -> List[str]:
    views: List[str] = []
    best = max(modules, key=lambda x: x.get("change", -999)) if modules else None
    weak = min(modules, key=lambda x: x.get("change", 999)) if modules else None
    equity_indexes = [row for row in snapshots if row.get("bucket") == "equity_index"]
    sectors = [row for row in snapshots if row.get("bucket") == "equity_sector"]
    crypto = [row for row in snapshots if row.get("bucket") == "crypto"]
    rates = [row for row in snapshots if row.get("bucket") == "rate"]
    fx_rows = [row for row in snapshots if row.get("bucket") == "fx"]

    if overall_score >= 60:
        views.append("公开市场定价显示风险预算偏宽松，高 beta 资产可维持顺势配置，但不宜在事件窗口前继续加杠杆。")
    elif overall_score >= 45:
        views.append("当前宏观总分仍处中性区间，市场更适合结构化交易而非单边押注，仓位与节奏管理优先于方向激进表达。")
    else:
        views.append("总分落入偏紧区域，组合更适合防守与降杠杆，优先控制回撤而非追求高胜率进攻。")

    if best and weak:
        views.append(
            f"边际变化上，{best.get('title', best.get('id', '模块'))} 是当前主要支撑项，而 {weak.get('title', weak.get('id', '模块'))} 仍是主要拖累项，跨资产走势更可能围绕这组分化展开。"
        )

    if equity_indexes:
        spx = next((row for row in equity_indexes if row.get("ticker") in {"SPX", "SPY"}), None)
        ixic = next((row for row in equity_indexes if row.get("ticker") in {"IXIC", "QQQ"}), None)
        if spx or ixic:
            parts: List[str] = []
            if spx:
                parts.append(f"标普口径近7日 {_format_pct(_safe_float(spx.get('change7dPct'), 0.0))}")
            if ixic:
                parts.append(f"纳指口径近7日 {_format_pct(_safe_float(ixic.get('change7dPct'), 0.0))}")
            views.append("权益资产方面，" + "，".join(parts) + "，说明成长资产仍在消化宏观与估值的双重约束。")

    if sectors:
        best_sector = max(sectors, key=lambda row: float(row.get("change7dPct", 0.0)))
        weak_sector = min(sectors, key=lambda row: float(row.get("change7dPct", 0.0)))
        views.append(
            f"行业层面，{best_sector.get('name', best_sector.get('ticker', '-'))} 近7日表现相对占优，{weak_sector.get('name', weak_sector.get('ticker', '-'))} 相对承压，说明市场内部轮动并不均衡。"
        )

    if crypto:
        btc = next((row for row in crypto if row.get("ticker") == "BTC"), None)
        eth = next((row for row in crypto if row.get("ticker") == "ETH"), None)
        if btc or eth:
            parts = []
            if btc:
                parts.append(f"BTC 近7日 {_format_pct(_safe_float(btc.get('change7dPct'), 0.0))}")
            if eth:
                parts.append(f"ETH 近7日 {_format_pct(_safe_float(eth.get('change7dPct'), 0.0))}")
            views.append("加密资产方面，" + "，".join(parts) + "，短线更适合结合关键价位和成交确认判断延续性。")

    dxy = next((row for row in fx_rows if row.get("ticker") == "DXY"), None)
    us10y = next((row for row in rates if row.get("ticker") == "US10Y"), None)
    vix = next((row for row in rates if row.get("ticker") == "VIX"), None)
    macro_parts: List[str] = []
    if dxy:
        macro_parts.append(f"DXY 现报 {dxy.get('spot', '-')}")
    if us10y:
        macro_parts.append(f"美债10Y 现报 {us10y.get('spot', '-')}")
    if vix:
        macro_parts.append(f"VIX 现报 {vix.get('spot', '-')}")
    if macro_parts:
        views.append("跨市场定价方面，" + "，".join(macro_parts) + "，需同步观察美元、利率与波动率是否形成同向压力。")

    return views[:5]


def _risk_level(overall_score: float) -> str:
    if overall_score >= 66:
        return "低"
    if overall_score >= 50:
        return "中"
    if overall_score >= 35:
        return "中高"
    return "高"


def _build_ai_decision_panel(overall_score: float, modules: List[Dict[str, Any]]) -> Dict[str, Any]:
    provider = (os.getenv("MARKET_DAILY_AI_PROVIDER", "gemini") or "gemini").strip().lower()
    reasoning_mode = (os.getenv("MARKET_DAILY_AI_REASONING_MODE", "deep_think") or "deep_think").strip()
    if provider.startswith("gemini"):
        has_api = bool(os.getenv("GEMINI_API_KEY"))
        default_model = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
        pending_hint = "配置 GEMINI_API_KEY 后可调用 Gemini Deep Think 生成完整日报正文与交易建议。"
    else:
        has_api = bool(os.getenv("CLAUDE_API_KEY"))
        default_model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
        pending_hint = "配置 CLAUDE_API_KEY 后可调用模型生成完整日报正文与交易建议。"
    model = (os.getenv("MARKET_DAILY_AI_MODEL") or default_model).strip()
    top_two = sorted(modules, key=lambda x: x.get("score", 50), reverse=True)[:2]
    weak_two = sorted(modules, key=lambda x: x.get("score", 50))[:2]
    long_bias = overall_score >= 55
    return {
        "provider": provider,
        "status": "ready" if has_api else "pending_config",
        "model": model,
        "reasoningMode": reasoning_mode,
        "riskLevel": _risk_level(overall_score),
        "summary": "建议偏多执行，回调分批加仓。"
        if long_bias
        else "建议防守执行，等待趋势与宏观重新共振后再扩仓。",
        "recommendedActions": [
            "优先观察 BTC 与 ETH 的关键位确认，再决定是否扩张 SOL 风险预算。",
            "事件窗口前将杠杆下调到策略上限的 50%-70%。",
            "若宏观总分连续两周下行，降低趋势策略开仓频率。",
        ],
        "driverModules": [item.get("id", "") for item in top_two],
        "pressureModules": [item.get("id", "") for item in weak_two],
        "nextStep": pending_hint if not has_api else "已具备调用条件，可在日报任务中接入自动总结与执行建议生成。",
    }


def build_market_daily_payload(
    df_all: pd.DataFrame,
    module_cards: List[Dict[str, Any]],
    overall_score: float,
    as_of_dt: Optional[datetime] = None,
) -> Dict[str, Any]:
    resolved_as_of_dt = as_of_dt
    if resolved_as_of_dt is None:
        if isinstance(df_all.index, pd.DatetimeIndex) and len(df_all.index) > 0:
            resolved_as_of_dt = df_all.index[-1].to_pydatetime()
            if resolved_as_of_dt.tzinfo is None:
                resolved_as_of_dt = resolved_as_of_dt.replace(tzinfo=timezone.utc)
        else:
            resolved_as_of_dt = datetime.now(timezone.utc)

    snapshots, quote_mode = _build_market_snapshots(as_of_dt=resolved_as_of_dt)
    hot_news, news_mode, news_provider = _build_hot_news(module_cards)
    deep_dives, deep_dive_mode = _build_deep_dives(as_of_dt=resolved_as_of_dt)
    crypto_updates = _build_crypto_project_updates(hot_news)
    calendar = _build_market_calendar(resolved_as_of_dt)
    push_channels = _build_push_channels()
    ai_decision = _build_ai_decision_panel(overall_score, module_cards)
    replay_lines = _build_replay_lines(overall_score, module_cards, snapshots)
    desk_views = _build_desk_views(overall_score, module_cards, snapshots)

    headline = "风险偏好回暖，维持顺势偏多框架。"
    if overall_score < 45:
        headline = "宏观偏紧，优先风险控制与防守仓位。"
    elif overall_score < 60:
        headline = "宏观中性，建议事件驱动下的结构化交易。"

    return {
        "asOfDate": resolved_as_of_dt.strftime("%Y-%m-%d"),
        "generatedAt": _to_iso_utc(datetime.now(timezone.utc)),
        "headline": headline,
        "quickView": {
            "overallScore": round(float(overall_score), 2),
            "riskLevel": _risk_level(float(overall_score)),
            "quoteSourceMode": quote_mode,
            "newsSourceMode": news_mode,
            "newsSourceProvider": news_provider,
            "deepDiveSourceMode": deep_dive_mode,
            "configuredPushChannels": int(sum(1 for item in push_channels if item.get("configured"))),
        },
        "marketSnapshots": snapshots,
        "hotNews": hot_news,
        "marketReplay": replay_lines,
        "deskViews": desk_views,
        "deepStockDives": deep_dives,
        "cryptoProjectUpdates": crypto_updates,
        "marketCalendar": calendar,
        "aiDecision": ai_decision,
        "claudeDecision": ai_decision,
        "pushChannels": push_channels,
        "sourceStatus": {
            "marketData": {"provider": "yfinance", "mode": quote_mode},
            "newsData": {
                "provider": news_provider,
                "mode": news_mode,
                "feeds": [label for label, _ in _news_feeds_from_env()],
            },
            "decisionEngine": {
                "provider": ai_decision.get("provider", "gemini"),
                "mode": ai_decision.get("status", "pending_config"),
            },
            "delivery": {
                "provider": "multi-channel",
                "mode": "ready" if any(item.get("configured") for item in push_channels) else "pending_config",
            },
        },
    }
