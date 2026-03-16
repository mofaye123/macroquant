"""Live cycle pipeline for the five-asset strategy terminal."""

from __future__ import annotations

import json
import socket
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from .demo_data import build_demo_five_asset_backtest_payload
from .engine import build_five_asset_backtest_payload
from .paper_execution import sync_paper_book
from .bitget_paper import get_bitget_paper_meta
from .macro_guard import evaluate_macro_signal_guard
from .data import (
    DIRECT_MACRO_SOURCE,
    build_macro_signal_context,
    build_direct_macro_payload_from_frame,
    download_price_frame,
    load_market_cache,
    load_project_macro_payload,
    load_project_macro_frame,
    macro_payload_to_score_frame,
    store_market_cache,
)

LIVE_PREFLIGHT_HOSTS = (
    ("api.bitget.com", 443),
    ("stooq.com", 443),
    ("fred.stlouisfed.org", 443),
)

ROOT = Path(__file__).resolve().parents[3]
LIVE_OUTPUT_DIR = ROOT / "strategies" / "five_asset_macro_cta" / "outputs" / "live"
STATE_PATH = ROOT / "strategies" / "five_asset_macro_cta" / "state" / "paper_book.json"
LAST_LIVE_STRATEGY_PATH = LIVE_OUTPUT_DIR / "last_live_strategy.json"
WEB_TERMINAL_PATH = ROOT / "web" / "public" / "data" / "five-asset-terminal.json"
WEB_STRATEGY_PATH = ROOT / "web" / "public" / "data" / "five-asset-backtest.json"
LOOKBACK_WARMUP_DAYS = 400


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _compute_warmup_start(start_date: Optional[str]) -> Optional[str]:
    if not start_date:
        return None
    start_ts = datetime.fromisoformat(start_date)
    warmup = start_ts - timedelta(days=LOOKBACK_WARMUP_DAYS)
    return warmup.date().isoformat()


def _build_live_strategy_payload(
    *,
    start_date: str,
    end_date: Optional[str] = None,
    view_start_date: Optional[str] = None,
) -> tuple[dict[str, Any], list[str]]:
    macro_frame = load_project_macro_frame(start_date="2010-01-01")
    price_frame = download_price_frame(start_date=start_date, end_date=end_date)
    macro_payload, macro_source, macro_warnings = load_project_macro_payload(prefer_live_builder=True)
    if not macro_payload:
        macro_payload = build_direct_macro_payload_from_frame(macro_frame)
        macro_source = DIRECT_MACRO_SOURCE
        macro_warnings.append("项目宏观实时引擎不可用，已回退到五资产实时宏观引擎。")
    payload = build_five_asset_backtest_payload(
        df_all=macro_frame,
        price_frame=price_frame,
        score_frame=macro_payload_to_score_frame(macro_payload) if macro_payload else None,
        macro_payload=macro_payload,
        macro_signal_context=build_macro_signal_context(
            macro_payload,
            source_type=macro_source,
            warnings=macro_warnings,
        ),
        config={"prefer_remote_treasury": True},
        start_date=start_date,
        end_date=end_date,
        view_start_date=view_start_date,
    )
    store_market_cache(
        macro_frame,
        price_frame,
        start_date=start_date,
        end_date=end_date,
    )
    return payload, macro_warnings


def _build_cached_market_payload(
    *,
    start_date: str,
    end_date: Optional[str] = None,
    view_start_date: Optional[str] = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[str]]:
    price_frame, macro_frame, meta = load_market_cache(start_date=start_date, end_date=end_date)
    if price_frame.empty or macro_frame.empty:
        return None, meta, []
    macro_payload, macro_source, macro_warnings = load_project_macro_payload(prefer_live_builder=True)
    if not macro_payload:
        macro_payload = build_direct_macro_payload_from_frame(macro_frame)
        macro_source = DIRECT_MACRO_SOURCE
        macro_warnings.append("项目宏观实时引擎不可用，市场缓存已回退到五资产实时宏观引擎。")
    payload = build_five_asset_backtest_payload(
        df_all=macro_frame if not macro_frame.empty else None,
        price_frame=price_frame,
        score_frame=macro_payload_to_score_frame(macro_payload) if macro_payload else None,
        macro_payload=macro_payload,
        macro_signal_context=build_macro_signal_context(
            macro_payload,
            source_type=macro_source,
            warnings=macro_warnings,
        ),
        config={"prefer_remote_treasury": False},
        start_date=start_date,
        end_date=end_date,
        view_start_date=view_start_date,
    )
    return payload, meta, macro_warnings


def _attach_macro_signal_context(
    payload: dict[str, Any],
    *,
    prefer_live_builder: bool,
) -> tuple[dict[str, Any], list[str]]:
    macro_payload, macro_source, macro_warnings = load_project_macro_payload(
        prefer_live_builder=prefer_live_builder,
    )
    enriched = dict(payload)
    enriched["macroSignal"] = build_macro_signal_context(
        macro_payload,
        source_type=macro_source,
        warnings=macro_warnings,
    )
    return enriched, macro_warnings


def _check_host(host: str, port: int, timeout: float = 1.5) -> tuple[bool, str | None]:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, None
    except OSError as exc:
        return False, f"{host}:{port} unreachable ({exc})"


def _can_attempt_live() -> tuple[bool, list[str]]:
    failures: list[str] = []
    for host, port in LIVE_PREFLIGHT_HOSTS:
        ok, error = _check_host(host, port)
        if not ok and error:
            failures.append(error)
    return len(failures) == 0, failures


def _enrich_strategy_payload(
    payload: dict[str, Any],
    *,
    source_mode: str,
    source_label: str,
    warnings: list[str],
    cache_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    enriched = dict(payload)
    enriched["generatedAt"] = _now_iso()
    enriched["sourceMode"] = source_mode
    enriched["sourceLabel"] = source_label
    data_sources = dict(enriched.get("dataSources", {}))
    macro_signal = enriched.get("macroSignal", {}) if isinstance(enriched.get("macroSignal"), dict) else {}
    data_sources["market"] = {
        "sourceMode": source_mode,
        "sourceLabel": source_label,
        "generatedAt": enriched["generatedAt"],
        "cacheMeta": cache_meta or {},
    }
    data_sources["macro"] = {
        "sourceType": macro_signal.get("sourceType"),
        "generatedAt": macro_signal.get("generatedAt"),
        "scoreDate": macro_signal.get("scoreDate"),
    }
    enriched["dataSources"] = data_sources
    if warnings:
        enriched["warnings"] = warnings
    return enriched


def _has_required_terminal_boards(payload: dict[str, Any]) -> bool:
    boards = payload.get("terminalBoards") or {}
    return bool(boards.get("tickerTape")) and bool(boards.get("referenceBenchmark")) and bool(boards.get("optionsBoard")) and bool(boards.get("operationsBoard"))


def resolve_strategy_payload(
    *,
    mode: str = "auto",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict[str, Any]:
    requested_start = start_date or "2020-01-01"
    compute_start = _compute_warmup_start(requested_start) if start_date else requested_start
    warnings: list[str] = []
    source_mode = "live"
    source_label = "项目宏观实时引擎 + Bitget 现货/黄金代理 + Stooq/Yahoo 行情"
    should_try_live = mode != "demo"

    if mode == "auto":
        live_ready, preflight_errors = _can_attempt_live()
        if not live_ready:
            should_try_live = False
            warnings.append("网络预检失败，已跳过实时构建：" + "; ".join(preflight_errors))

    if should_try_live:
        try:
            payload, macro_warnings = _build_live_strategy_payload(
                start_date=compute_start,
                end_date=end_date,
                view_start_date=requested_start if start_date else None,
            )
            warnings.extend(macro_warnings)
            payload = _enrich_strategy_payload(
                payload,
                source_mode="live",
                source_label=source_label,
                warnings=warnings,
            )
            _write_json(LAST_LIVE_STRATEGY_PATH, payload)
            return payload
        except Exception as exc:
            if mode == "live":
                raise
            warnings.append(f"实时构建失败，已切换到回退数据源：{exc}")

    if mode != "demo":
        try:
            cached_payload, cache_meta, cache_warnings = _build_cached_market_payload(
                start_date=compute_start,
                end_date=end_date,
                view_start_date=requested_start if start_date else None,
            )
            warnings.extend(cache_warnings)
        except Exception as exc:
            cached_payload = None
            cache_meta = None
            warnings.append(f"市场缓存重建失败，已继续回退：{exc}")
        if cached_payload:
            cache_suffix = ""
            if cache_meta and cache_meta.get("cachedAt"):
                cache_suffix = f"（缓存时间 {cache_meta['cachedAt']}）"
            return _enrich_strategy_payload(
                cached_payload,
                source_mode="cached_live_inputs",
                source_label=f"最近一次成功的实时市场缓存{cache_suffix}",
                warnings=warnings,
                cache_meta=cache_meta,
            )

    cached_live = _load_json(LAST_LIVE_STRATEGY_PATH)
    if mode == "auto" and cached_live:
        cached_live = dict(cached_live)
        cached_live, macro_warnings = _attach_macro_signal_context(
            cached_live,
            prefer_live_builder=False,
        )
        warnings.extend(macro_warnings)
        cached_live["sourceMode"] = "stale_live"
        cached_live["sourceLabel"] = "最近一次成功的实时快照"
        stale_sources = dict(cached_live.get("dataSources", {}))
        macro_signal = cached_live.get("macroSignal", {}) if isinstance(cached_live.get("macroSignal"), dict) else {}
        stale_sources["market"] = {
            "sourceMode": "stale_live",
            "sourceLabel": "最近一次成功的实时快照",
            "generatedAt": cached_live.get("generatedAt"),
            "cacheMeta": {},
        }
        stale_sources["macro"] = {
            "sourceType": macro_signal.get("sourceType"),
            "generatedAt": macro_signal.get("generatedAt"),
            "scoreDate": macro_signal.get("scoreDate"),
        }
        cached_live["dataSources"] = stale_sources
        cached_warnings = list(cached_live.get("warnings", []))
        cached_warnings.extend(warnings)
        if cached_warnings:
            cached_live["warnings"] = cached_warnings
        cached_live["terminalFallbackAt"] = _now_iso()
        if _has_required_terminal_boards(cached_live):
            return cached_live
        warnings.append("最近一次实时快照缺少新版终端板块字段，已继续回退到当前可用的数据构建结果。")

    payload = build_demo_five_asset_backtest_payload(
        start_date=compute_start,
        end_date=end_date,
        view_start_date=requested_start if start_date else None,
    )
    payload, macro_warnings = _attach_macro_signal_context(
        payload,
        prefer_live_builder=False,
    )
    warnings.extend(macro_warnings)
    return _enrich_strategy_payload(
        payload,
        source_mode="demo",
        source_label="5资产策略确定性演示数据",
        warnings=warnings,
    )


def _build_backtest_paper_book(strategy_payload: dict[str, Any]) -> dict[str, Any]:
    last = strategy_payload["lastSnapshot"]
    starting_capital = float(strategy_payload["startingCapital"])
    cash = starting_capital
    state_by_asset: dict[str, dict[str, Any]] = {
        asset: {"quantity": 0.0, "avgPrice": 0.0, "openedAt": None, "lastRebalancedAt": None}
        for asset in strategy_payload.get("configSummary", {}).get("assets", [])
    }
    replay_orders = sorted(
        list(strategy_payload.get("positionReplayHistory", strategy_payload.get("executionHistory", []))),
        key=lambda row: (str(row.get("timestamp")), str(row.get("asset"))),
    )
    for order in replay_orders:
        asset = str(order.get("asset"))
        if asset not in state_by_asset:
            continue
        price = float(order.get("price", 0.0) or 0.0)
        quantity = float(order.get("quantity", 0.0) or 0.0)
        if price <= 0 or quantity <= 0:
            continue
        side = str(order.get("side", "HOLD"))
        previous_qty = float(state_by_asset[asset]["quantity"])
        previous_avg = float(state_by_asset[asset]["avgPrice"])
        if side == "BUY":
            next_qty = previous_qty + quantity
            next_avg = ((previous_qty * previous_avg) + (quantity * price)) / next_qty if next_qty > 1e-12 else 0.0
            state_by_asset[asset]["quantity"] = next_qty
            state_by_asset[asset]["avgPrice"] = next_avg
            if previous_qty <= 1e-12:
                state_by_asset[asset]["openedAt"] = str(order.get("timestamp"))
            state_by_asset[asset]["lastRebalancedAt"] = str(order.get("timestamp"))
            cash -= quantity * price
        elif side == "SELL":
            next_qty = max(0.0, previous_qty - quantity)
            state_by_asset[asset]["quantity"] = next_qty
            state_by_asset[asset]["avgPrice"] = 0.0 if next_qty <= 1e-12 else previous_avg
            state_by_asset[asset]["lastRebalancedAt"] = str(order.get("timestamp"))
            if next_qty <= 1e-12:
                state_by_asset[asset]["openedAt"] = None
            cash += quantity * price

    positions: list[dict[str, Any]] = []
    for asset in strategy_payload.get("configSummary", {}).get("assets", []):
        meta = get_bitget_paper_meta(asset)
        weight_pct = float(last["net_weights"].get(asset, last["weights"].get(asset, 0.0)))
        price = float(last["prices"][asset])
        quantity = float(state_by_asset.get(asset, {}).get("quantity", 0.0))
        avg_price = float(state_by_asset.get(asset, {}).get("avgPrice", 0.0))
        opened_at = state_by_asset.get(asset, {}).get("openedAt")
        last_rebalanced_at = state_by_asset.get(asset, {}).get("lastRebalancedAt")
        market_value = quantity * price
        positions.append(
            {
                "asset": asset,
                "venue": meta["venue"],
                "symbol": meta["symbol"],
                "productType": meta["productType"],
                "executable": bool(meta["executable"]),
                "mode": meta["mode"],
                "side": "LONG" if quantity > 1e-12 else "SHORT" if quantity < -1e-12 else "FLAT",
                "quantity": round(quantity, 8),
                "avgPrice": round(avg_price, 4),
                "markPrice": round(price, 4),
                "marketValue": round(market_value, 2),
                "targetWeightPct": round(weight_pct, 2),
                "currentWeightPct": 0.0,
                "driftWeightPct": 0.0,
                "targetValue": 0.0,
                "unrealizedPnl": round((price - avg_price) * quantity, 2) if quantity > 1e-12 and avg_price > 0 else 0.0,
                "openedAt": opened_at,
                "lastRebalancedAt": last_rebalanced_at,
            }
        )

    equity = cash + sum(float(row["marketValue"]) for row in positions)
    equity = max(equity, 1e-9)
    cash_weight_pct = (cash / equity) * 100.0 if equity else 0.0
    for row in positions:
        current_weight_pct = (float(row["marketValue"]) / equity) * 100.0 if equity else 0.0
        row["currentWeightPct"] = round(current_weight_pct, 2)
        row["driftWeightPct"] = round(float(row["targetWeightPct"]) - current_weight_pct, 2)
        row["targetValue"] = round(equity * float(row["targetWeightPct"]) / 100.0, 2)

    display_orders = list(strategy_payload.get("executionHistory", []))
    executable_assets = [row["asset"] for row in positions if bool(row["executable"])]
    shadow_assets = [row["asset"] for row in positions if not bool(row["executable"])]
    macro_guard = evaluate_macro_signal_guard(strategy_payload)
    return {
        "status": "snapshot",
        "bookUpdatedAt": strategy_payload.get("generatedAt", _now_iso()),
        "cycleCount": len({str(order.get("timestamp")) for order in display_orders}),
        "venue": "BACKTEST",
        "baseCurrency": "USD",
        "executableAssets": executable_assets,
        "shadowAssets": shadow_assets,
        "ledger": {
            "cash": round(cash, 2),
            "equity": round(equity, 2),
            "cashWeightPct": round(cash_weight_pct, 2),
            "grossExposurePct": round(sum(abs(float(row["currentWeightPct"])) for row in positions), 2),
        },
        "positions": positions,
        "orders": display_orders,
        "alerts": [],
        "routing": {
            "generatedAt": strategy_payload.get("generatedAt", _now_iso()),
            "readyExecutableOrders": sum(1 for order in display_orders if bool(order.get("executable"))),
            "shadowSyncOrders": sum(1 for order in display_orders if not bool(order.get("executable"))),
            "blockedOrders": 0,
            "holdCount": 0,
            "executableNotional": round(sum(float(order.get("notional", 0.0)) for order in display_orders if bool(order.get("executable"))), 2),
            "shadowNotional": round(sum(float(order.get("notional", 0.0)) for order in display_orders if not bool(order.get("executable"))), 2),
            "blockedNotional": 0.0,
            "intents": display_orders,
        },
        "macroGuard": {
            **macro_guard,
            "status": "snapshot",
        },
    }


def build_terminal_payload(
    *,
    mode: str = "auto",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    state_path: Path = STATE_PATH,
) -> dict[str, Any]:
    strategy_payload = resolve_strategy_payload(mode=mode, start_date=start_date, end_date=end_date)
    if start_date or end_date:
        paper_trading = _build_backtest_paper_book(strategy_payload)
    else:
        paper_trading = sync_paper_book(strategy_payload, state_path=state_path)
    return {
        "status": "ok",
        "terminalId": "five_asset_macro_cta_terminal",
        "generatedAt": _now_iso(),
        "sourceMode": strategy_payload.get("sourceMode", "unknown"),
        "sourceLabel": strategy_payload.get("sourceLabel", "unknown"),
        "warnings": strategy_payload.get("warnings", []),
        "strategy": strategy_payload,
        "paperTrading": paper_trading,
    }
