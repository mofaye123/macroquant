from __future__ import annotations

import math
import os
import time
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

_QUOTE_CACHE: Dict[str, Any] = {"expires_at": 0.0, "items": [], "source_mode": "fallback"}
_NEWS_CACHE: Dict[str, Any] = {"expires_at": 0.0, "items": [], "source_mode": "fallback"}
_QUOTE_TTL = int(os.getenv("MARKET_DAILY_QUOTE_TTL", "180"))
_NEWS_TTL = int(os.getenv("MARKET_DAILY_NEWS_TTL", "300"))

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

_QUOTE_SYMBOLS: Tuple[Tuple[str, str, str], ...] = (
    ("BTC", "BTC-USD", "crypto"),
    ("ETH", "ETH-USD", "crypto"),
    ("SOL", "SOL-USD", "crypto"),
    ("SPY", "SPY", "equity"),
    ("QQQ", "QQQ", "equity"),
)

_DEEP_DIVE_SYMBOLS: Tuple[Tuple[str, str], ...] = (
    ("NVIDIA", "NVDA"),
    ("Apple", "AAPL"),
    ("Tesla", "TSLA"),
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

    symbols = [symbol for _, symbol, _ in _QUOTE_SYMBOLS]
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
        for ticker, symbol, bucket in _QUOTE_SYMBOLS:
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
                    "name": symbol.replace("-USD", ""),
                    "bucket": bucket,
                    "spot": round(latest or 0.0, 2),
                    "change24hPct": round(chg1 or 0.0, 2),
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
    else:
        news_items = sorted(news_items, key=lambda x: x.get("publishedAt", ""), reverse=True)[:10]

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
        trend_signal = "震荡"
        if ma20 is not None and ma60 is not None:
            if ma20 > ma60 * 1.01:
                trend_signal = "趋势多头"
            elif ma20 < ma60 * 0.99:
                trend_signal = "趋势走弱"
        summary = (
            "均线结构偏多，优先顺势持有，回调分批处理。"
            if trend_signal == "趋势多头"
            else "中短期结构偏弱，优先防守，等待放量企稳信号。"
            if trend_signal == "趋势走弱"
            else "方向未明，关注突破/跌破关键区间后的确认信号。"
        )
        rows.append(
            {
                "name": name,
                "ticker": symbol,
                "signal": trend_signal,
                "summary": summary,
                "rsi14": round(rsi14 or 50.0, 2),
                "ret20dPct": round(ret20 or 0.0, 2),
            }
        )

    return rows[:3], "live"


def _build_crypto_project_updates(hot_news: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    keywords = (
        ("BTC", "比特币生态"),
        ("ETH", "以太坊生态"),
        ("SOL", "Solana 生态"),
    )
    updates: List[Dict[str, Any]] = []
    for key, bucket in keywords:
        matched = next((item for item in hot_news if key.lower() in item.get("title", "").lower()), None)
        if matched:
            updates.append(
                {
                    "project": bucket,
                    "headline": matched.get("title", ""),
                    "source": matched.get("source", "News"),
                    "url": matched.get("url", ""),
                }
            )
        else:
            updates.append(
                {
                    "project": bucket,
                    "headline": f"{bucket}暂无重大突发，维持跟踪链上活跃度与资金流向。",
                    "source": "MacroQuant Engine",
                    "url": "",
                }
            )
    return updates


def _build_market_calendar(as_of: datetime) -> List[Dict[str, Any]]:
    base = as_of.astimezone(timezone.utc).date()
    events = [
        {
            "date": (base + timedelta(days=0)).isoformat(),
            "timeUtc": "13:30",
            "category": "Macro",
            "event": "美国初请失业金",
            "importance": "高",
        },
        {
            "date": (base + timedelta(days=1)).isoformat(),
            "timeUtc": "12:30",
            "category": "Macro",
            "event": "美国非农就业数据",
            "importance": "高",
        },
        {
            "date": (base + timedelta(days=1)).isoformat(),
            "timeUtc": "14:00",
            "category": "Macro",
            "event": "FOMC 官员讲话",
            "importance": "中",
        },
        {
            "date": (base + timedelta(days=2)).isoformat(),
            "timeUtc": "00:00",
            "category": "Crypto",
            "event": "主要交易所周度持仓与资金费率复盘",
            "importance": "中",
        },
    ]
    return events


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
    return lines[:4]


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
        default_model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4")
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
