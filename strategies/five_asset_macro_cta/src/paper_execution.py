"""Paper execution ledger for the isolated five-asset strategy."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .config import ASSETS, DEFAULT_ENGINE_CONFIG
from .execution_router import build_execution_intents, summarize_execution_intents
from .macro_guard import evaluate_macro_signal_guard


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _round(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def _empty_state(starting_capital: float, config: dict[str, Any]) -> dict[str, Any]:
    paper_cfg = config["paper_execution"]
    return {
        "version": 1,
        "updatedAt": _now_iso(),
        "cycleCount": 0,
        "baseCurrency": str(paper_cfg["base_currency"]),
        "cash": float(starting_capital),
        "equity": float(starting_capital),
        "positions": {},
        "orders": [],
        "lastSignalSignature": None,
        "lastRouting": None,
    }


def _load_state(path: Path, starting_capital: float, config: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return _empty_state(starting_capital, config)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return _empty_state(starting_capital, config)
    if not isinstance(data, dict):
        return _empty_state(starting_capital, config)
    data.setdefault("positions", {})
    data.setdefault("orders", [])
    data.setdefault("cash", float(starting_capital))
    data.setdefault("equity", float(starting_capital))
    data.setdefault("cycleCount", 0)
    data.setdefault("baseCurrency", str(config["paper_execution"]["base_currency"]))
    data.setdefault("lastSignalSignature", None)
    data.setdefault("lastRouting", None)
    data = _backfill_order_equity_fields(data, starting_capital=float(starting_capital))
    return data


def _position_market_value(position: dict[str, Any], price: float) -> float:
    return float(position.get("quantity", 0.0)) * float(price)


def _equity_snapshot(
    *,
    cash: float,
    prices: dict[str, float],
    updated_positions: dict[str, dict[str, Any]],
    existing_positions: dict[str, dict[str, Any]],
) -> float:
    equity = float(cash)
    for asset in ASSETS:
        position = updated_positions.get(asset)
        if position is None:
            position = existing_positions.get(asset, {})
        equity += _position_market_value(position, prices[asset])
    return equity


def _requires_blocked_state_reset(state: dict[str, Any]) -> bool:
    positions = state.get("positions", {})
    has_open_positions = any(abs(float(position.get("quantity", 0.0))) > 1e-12 for position in positions.values())
    if not has_open_positions:
        return False

    orders = list(state.get("orders", []))
    has_blocked_orders = any(str(order.get("status")) == "blocked" for order in orders)
    has_committed_orders = any(str(order.get("status")) in {"filled", "shadow_sync"} for order in orders)
    return has_open_positions and has_blocked_orders and not has_committed_orders


def _next_avg_price(previous_qty: float, previous_avg: float, delta_qty: float, fill_price: float) -> float:
    new_qty = previous_qty + delta_qty
    if abs(new_qty) < 1e-12:
        return 0.0
    if abs(previous_qty) < 1e-12:
        return float(fill_price)
    if previous_qty * delta_qty > 0:
        return ((previous_qty * previous_avg) + (delta_qty * fill_price)) / new_qty
    if abs(delta_qty) > abs(previous_qty):
        return float(fill_price)
    return float(previous_avg)


def _has_matching_blocked_order(existing_orders: list[dict[str, Any]], candidate: dict[str, Any]) -> bool:
    candidate_codes = [str(item.get("code")) for item in candidate.get("blockReasons", []) if isinstance(item, dict)]
    for order in existing_orders:
        if str(order.get("status")) != "blocked":
            continue
        order_codes = [str(item.get("code")) for item in order.get("blockReasons", []) if isinstance(item, dict)]
        if (
            str(order.get("asset")) == str(candidate.get("asset"))
            and float(order.get("targetWeightPct", 0.0)) == float(candidate.get("targetWeightPct", 0.0))
            and float(order.get("deltaWeightPct", 0.0)) == float(candidate.get("deltaWeightPct", 0.0))
            and str(order.get("reason")) == str(candidate.get("reason"))
            and order_codes == candidate_codes
        ):
            return True
    return False


def _backfill_order_equity_fields(state: dict[str, Any], *, starting_capital: float) -> dict[str, Any]:
    orders = list(state.get("orders", []))
    if not orders:
        return state

    cash = float(starting_capital)
    positions: dict[str, float] = {}
    last_prices: dict[str, float] = {}
    enriched_by_id: dict[str, dict[str, Any]] = {}

    def snapshot_equity() -> float:
        return cash + sum(float(quantity) * float(last_prices.get(asset, 0.0)) for asset, quantity in positions.items())

    chronology = sorted(orders, key=lambda order: str(order.get("timestamp", "")))
    for raw_order in chronology:
        order = dict(raw_order)
        asset = str(order.get("asset", ""))
        side = str(order.get("side", "HOLD"))
        status = str(order.get("status", "hold"))
        quantity = float(order.get("quantity", 0.0) or 0.0)
        notional = float(order.get("notional", 0.0) or 0.0)
        price = float(order.get("price", 0.0) or 0.0)
        if price > 0:
            last_prices[asset] = price
        current_price = float(last_prices.get(asset, price))
        cash_before = cash
        quantity_before = float(positions.get(asset, 0.0))
        position_value_before = quantity_before * current_price

        equity_before = snapshot_equity()
        if status in {"filled", "shadow_sync"} and side in {"BUY", "SELL"}:
            sign = 1.0 if side == "BUY" else -1.0
            cash -= sign * notional
            positions[asset] = float(positions.get(asset, 0.0)) + sign * quantity
            if abs(float(positions[asset])) < 1e-12:
                positions.pop(asset, None)

        equity_after = snapshot_equity()
        quantity_after = float(positions.get(asset, 0.0))
        position_value_after = quantity_after * current_price
        order["equityBefore"] = _round(equity_before, 2)
        order["equityAfter"] = _round(equity_after, 2)
        order["equityDelta"] = _round(equity_after - equity_before, 2)
        order["cashBefore"] = _round(cash_before, 2)
        order["cashAfter"] = _round(cash, 2)
        order["cashDelta"] = _round(cash - cash_before, 2)
        order["quantityBefore"] = _round(quantity_before, 8)
        order["quantityAfter"] = _round(quantity_after, 8)
        order["positionValueBefore"] = _round(position_value_before, 2)
        order["positionValueAfter"] = _round(position_value_after, 2)
        order["positionValueDelta"] = _round(position_value_after - position_value_before, 2)
        enriched_by_id[str(order.get("id"))] = order

    state["orders"] = [enriched_by_id.get(str(order.get("id")), order) for order in orders]
    return state


def _build_signal_signature(strategy_payload: dict[str, Any], *, execution_allowed: bool) -> str:
    last = strategy_payload["lastSnapshot"]
    signature = {
        "date": str(last.get("date")),
        "regime": str(last.get("regime")),
        "rebalanceReason": str(last.get("rebalance_reason")),
        "executionAllowed": bool(execution_allowed),
        "netWeights": {
            asset: round(float(last.get("net_weights", {}).get(asset, last.get("weights", {}).get(asset, 0.0))), 4)
            for asset in ASSETS
        },
    }
    return json.dumps(signature, sort_keys=True, ensure_ascii=False)


def _mark_to_market_positions(
    existing_positions: dict[str, dict[str, Any]],
    *,
    prices: dict[str, float],
    target_weights: dict[str, float],
    cash: float,
) -> tuple[list[dict[str, Any]], float, float]:
    equity = float(cash)
    marked_positions: dict[str, dict[str, Any]] = {}
    for asset in ASSETS:
        position = dict(existing_positions.get(asset, {}))
        quantity = float(position.get("quantity", 0.0))
        price = float(prices[asset])
        market_value = quantity * price
        equity += market_value
        position["asset"] = asset
        position["quantity"] = _round(quantity, 8)
        position["markPrice"] = _round(price, 4)
        position["marketValue"] = _round(market_value, 2)
        position["targetWeightPct"] = float(target_weights.get(asset, 0.0))
        avg_price = float(position.get("avgPrice", 0.0))
        position["avgPrice"] = _round(avg_price, 4)
        position["unrealizedPnl"] = _round((price - avg_price) * quantity, 2) if abs(quantity) > 1e-12 else 0.0
        position["side"] = "LONG" if quantity > 1e-12 else "SHORT" if quantity < -1e-12 else "FLAT"
        position["openedAt"] = position.get("openedAt")
        position["lastRebalancedAt"] = position.get("lastRebalancedAt")
        marked_positions[asset] = position

    equity = max(equity, 1e-9)
    positions_view: list[dict[str, Any]] = []
    for asset in ASSETS:
        position = dict(marked_positions[asset])
        current_weight_pct = (float(position["marketValue"]) / equity) * 100.0 if equity else 0.0
        position["currentWeightPct"] = _round(current_weight_pct, 2)
        position["driftWeightPct"] = _round(float(position["targetWeightPct"]) - current_weight_pct, 2)
        position["targetValue"] = _round(equity * float(position["targetWeightPct"]) / 100.0, 2)
        positions_view.append(position)

    cash_weight_pct = (float(cash) / equity) * 100.0 if equity else 0.0
    return positions_view, _round(equity, 2), _round(cash_weight_pct, 2)


def _build_alerts(
    strategy_payload: dict[str, Any],
    positions: list[dict[str, Any]],
    cash_weight_pct: float,
    config: dict[str, Any],
    macro_guard: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    last = strategy_payload["lastSnapshot"]
    risk_cfg = config["risk_alerts"]
    paper_cfg = config["paper_execution"]

    source_mode = str(strategy_payload.get("sourceMode", "unknown"))
    if source_mode != "live":
        alerts.append(
            {
                "level": "warning",
                "code": "DATA_FALLBACK",
                "title": "策略数据当前不是实时源",
                "detail": f"当前数据模式为 {source_mode}。",
            }
        )

    if macro_guard and not bool(macro_guard.get("executionAllowed", False)):
        reasons = macro_guard.get("reasons", [])
        detail = "；".join(str(item.get("message")) for item in reasons[:3] if isinstance(item, dict))
        alerts.append(
            {
                "level": "critical",
                "code": "MACRO_EXECUTION_BLOCK",
                "title": "宏观信号未通过执行闸门",
                "detail": detail or "当前宏观信号不是实时且新鲜的可交易状态，执行层已阻断下单。",
            }
        )

    if str(last["regime"]) == "RISK_OFF":
        alerts.append(
            {
                "level": "warning",
                "code": "RISK_OFF_REGIME",
                "title": "当前处于风险收缩阶段",
                "detail": "组合应优先防守，并主动降低整体风险暴露。",
            }
        )

    risk_signals = int(last["risk_signals"])
    if risk_signals >= int(risk_cfg["critical_risk_signals"]):
        alerts.append(
            {
                "level": "critical",
                "code": "RISK_CLUSTER",
                "title": "风险信号进入临界聚集状态",
                "detail": f"当前同时激活了 {risk_signals} 个风险信号。",
            }
        )
    elif risk_signals >= int(risk_cfg["warning_risk_signals"]):
        alerts.append(
            {
                "level": "warning",
                "code": "RISK_CLUSTER",
                "title": "风险信号正在升温",
                "detail": f"当前同时激活了 {risk_signals} 个风险信号。",
            }
        )

    strategy_dd = float(last["strategy_dd"])
    if strategy_dd <= float(risk_cfg["drawdown_critical_pct"]):
        alerts.append(
            {
                "level": "critical",
                "code": "DRAWDOWN_BREACH",
                "title": "回撤已超过临界阈值",
                "detail": f"当前策略回撤为 {strategy_dd:.2f}%。",
            }
        )
    elif strategy_dd <= float(risk_cfg["drawdown_warning_pct"]):
        alerts.append(
            {
                "level": "warning",
                "code": "DRAWDOWN_BREACH",
                "title": "回撤已进入预警区间",
                "detail": f"当前策略回撤为 {strategy_dd:.2f}%。",
            }
        )

    if float(last["mstr_short_pct"]) > 0:
        alerts.append(
            {
                "level": "info",
                "code": "MSTR_SHORT_ACTIVE",
                "title": "MSTR 保护性空头已激活",
                "detail": f"当前 MSTR 空头保护层为 {float(last['mstr_short_pct']):.2f}%。",
            }
        )

    if cash_weight_pct < float(risk_cfg["cash_floor_pct"]) and str(last["regime"]) == "RISK_OFF":
        alerts.append(
            {
                "level": "warning",
                "code": "LOW_CASH_BUFFER",
                "title": "风险收缩阶段现金缓冲偏薄",
                "detail": f"当前现金权重仅为 {cash_weight_pct:.2f}%。",
            }
        )

    drift_limit = float(paper_cfg["drift_alert_pct"])
    for position in positions:
        if not bool(position["executable"]) and abs(float(position["targetWeightPct"])) >= float(paper_cfg["min_order_weight_pct"]):
            alerts.append(
                {
                    "level": "info",
                    "code": "SHADOW_ONLY_ASSET",
                    "title": f"{position['asset']} 当前以影子仓方式跟踪",
                    "detail": "该资产在模型组合中会持续跟踪，但无法在 Bitget 上按原标的直接执行。",
                    "asset": position["asset"],
                }
            )
        if abs(float(position["driftWeightPct"])) >= drift_limit:
            alerts.append(
                {
                    "level": "warning",
                    "code": "POSITION_DRIFT",
                    "title": f"{position['asset']} 权重漂移超过阈值",
                    "detail": f"当前漂移为 {float(position['driftWeightPct']):.2f}%。",
                    "asset": position["asset"],
                }
            )

    return alerts


def sync_paper_book(
    strategy_payload: dict[str, Any],
    *,
    state_path: Path,
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    cfg = config or DEFAULT_ENGINE_CONFIG
    last = strategy_payload["lastSnapshot"]
    prices = {asset: float(last["prices"][asset]) for asset in ASSETS}
    state = _load_state(state_path, float(strategy_payload["startingCapital"]), cfg)
    if _requires_blocked_state_reset(state):
        state["positions"] = {}
        state["equity"] = float(state.get("cash", strategy_payload["startingCapital"]))
    macro_guard = evaluate_macro_signal_guard(strategy_payload, config=cfg)
    target_weights = {
        asset: float(last["net_weights"].get(asset, last["weights"].get(asset, 0.0)))
        for asset in ASSETS
    }
    signal_signature = _build_signal_signature(
        strategy_payload,
        execution_allowed=bool(macro_guard["executionAllowed"]),
    )

    pre_equity = float(state.get("cash", strategy_payload["startingCapital"]))
    existing_positions = state.get("positions", {})
    for asset in ASSETS:
        position = existing_positions.get(asset, {})
        pre_equity += _position_market_value(position, prices[asset])
    if pre_equity <= 0:
        pre_equity = float(strategy_payload["startingCapital"])

    if str(state.get("lastSignalSignature") or "") == signal_signature:
        positions_view, equity, cash_weight_pct = _mark_to_market_positions(
            existing_positions,
            prices=prices,
            target_weights=target_weights,
            cash=float(state.get("cash", pre_equity)),
        )
        alerts = _build_alerts(strategy_payload, positions_view, cash_weight_pct, cfg, macro_guard=macro_guard)
        routing_summary = state.get("lastRouting") or {
            "generatedAt": state.get("updatedAt", _now_iso()),
            "readyExecutableOrders": 0,
            "shadowSyncOrders": 0,
            "blockedOrders": 0,
            "holdCount": len(ASSETS),
            "executableNotional": 0.0,
            "shadowNotional": 0.0,
            "blockedNotional": 0.0,
            "intents": [],
        }
        state.update(
            {
                "updatedAt": _now_iso(),
                "equity": _round(equity, 2),
                "positions": {asset: row for asset, row in ((row["asset"], row) for row in positions_view)},
            }
        )
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        executable_assets = [asset for asset in ASSETS if bool(state["positions"][asset]["executable"])]
        shadow_assets = [asset for asset in ASSETS if not bool(state["positions"][asset]["executable"])]
        status = "blocked" if not bool(macro_guard["executionAllowed"]) else ("shadow_only" if any(abs(float(state["positions"][asset]["targetWeightPct"])) > 0 for asset in shadow_assets) else "ok")
        return {
            "status": status,
            "bookUpdatedAt": state["updatedAt"],
            "cycleCount": int(state["cycleCount"]),
            "venue": "BITGET_PAPER",
            "baseCurrency": state["baseCurrency"],
            "executableAssets": executable_assets,
            "shadowAssets": shadow_assets,
            "ledger": {
                "cash": _round(float(state["cash"]), 2),
                "equity": _round(equity, 2),
                "cashWeightPct": _round(cash_weight_pct, 2),
                "grossExposurePct": _round(sum(abs(float(row["currentWeightPct"])) for row in positions_view), 2),
            },
            "positions": positions_view,
            "orders": list(state.get("orders", [])),
            "alerts": alerts,
            "routing": routing_summary,
            "macroGuard": macro_guard,
        }

    timestamp = _now_iso()
    cash = float(state.get("cash", pre_equity))
    new_positions: dict[str, dict[str, Any]] = {}
    cycle_orders: list[dict[str, Any]] = []
    existing_order_history = list(state.get("orders", []))
    intents = build_execution_intents(
        strategy_payload,
        existing_positions,
        equity=pre_equity,
        allow_execution=bool(macro_guard["executionAllowed"]),
        block_reasons=list(macro_guard.get("reasons", [])),
        config=cfg,
        timestamp=timestamp,
    )

    for intent in intents:
        asset = str(intent["asset"])
        previous = dict(existing_positions.get(asset, {}))
        previous_qty = float(previous.get("quantity", 0.0))
        previous_avg = float(previous.get("avgPrice", 0.0))
        price = prices[asset]
        delta_qty = float(intent["signedQuantity"])
        delta_value = float(intent["signedNotional"])
        next_qty = previous_qty + delta_qty
        next_avg = previous_avg
        cash_before_order = cash
        position_value_before = previous_qty * price
        opened_at = previous.get("openedAt")
        last_rebalanced_at = previous.get("lastRebalancedAt")
        equity_before_order = _equity_snapshot(
            cash=cash,
            prices=prices,
            updated_positions=new_positions,
            existing_positions=existing_positions,
        )
        order_record: dict[str, Any] | None = None

        if intent["action"] in {"place_order", "shadow_sync"}:
            next_avg = _next_avg_price(previous_qty, previous_avg, delta_qty, price)
            cash -= delta_value
            order_record = {
                "id": intent["id"],
                "timestamp": intent["timestamp"],
                "asset": asset,
                "venue": intent["venue"],
                "symbol": intent["symbol"],
                "productType": intent["productType"],
                "side": intent["side"],
                "status": "filled" if bool(intent["executable"]) else "shadow_sync",
                "executable": bool(intent["executable"]),
                "previousWeightPct": float(intent["previousWeightPct"]),
                "targetWeightPct": float(intent["targetWeightPct"]),
                "deltaWeightPct": float(intent["deltaWeightPct"]),
                "quantity": float(intent["quantity"]),
                "notional": float(intent["notional"]),
                "price": float(intent["price"]),
                "reason": str(intent["reason"]),
                "reduceOnly": str(intent["reduceOnly"]),
                "marginCoin": str(intent["marginCoin"]),
                "action": str(intent["action"]),
            }
        elif intent["action"] == "blocked":
            blocked_order = {
                "id": intent["id"],
                "timestamp": intent["timestamp"],
                "asset": asset,
                "venue": intent["venue"],
                "symbol": intent["symbol"],
                "productType": intent["productType"],
                "side": intent["side"],
                "status": "blocked",
                "executable": bool(intent["executable"]),
                "previousWeightPct": float(intent["previousWeightPct"]),
                "targetWeightPct": float(intent["targetWeightPct"]),
                "deltaWeightPct": float(intent["deltaWeightPct"]),
                "quantity": float(intent["quantity"]),
                "notional": float(intent["notional"]),
                "price": float(intent["price"]),
                "reason": str(intent["reason"]),
                "reduceOnly": str(intent["reduceOnly"]),
                "marginCoin": str(intent["marginCoin"]),
                "action": str(intent["action"]),
                "blockReasons": list(intent.get("blockReasons", [])),
            }
            order_record = blocked_order
            delta_qty = 0.0
            delta_value = 0.0
            next_qty = previous_qty
            next_avg = previous_avg

        market_value = next_qty * price
        if abs(previous_qty) < 1e-12 and abs(next_qty) > 1e-12:
            opened_at = timestamp
        elif abs(next_qty) < 1e-12:
            opened_at = None
        if abs(next_qty - previous_qty) > 1e-12:
            last_rebalanced_at = timestamp
        new_positions[asset] = {
            "asset": asset,
            "venue": intent["venue"],
            "symbol": intent["symbol"],
            "productType": intent["productType"],
            "executable": bool(intent["executable"]),
            "mode": intent["mode"],
            "side": "LONG" if next_qty > 1e-12 else "SHORT" if next_qty < -1e-12 else "FLAT",
            "quantity": _round(next_qty, 8),
            "avgPrice": _round(next_avg, 4),
            "markPrice": _round(price, 4),
            "marketValue": _round(market_value, 2),
            "targetWeightPct": float(intent["targetWeightPct"]),
            "currentWeightPct": 0.0,
            "driftWeightPct": 0.0,
            "targetValue": _round(pre_equity * float(intent["targetWeightPct"]) / 100.0, 2),
            "unrealizedPnl": _round((price - next_avg) * next_qty, 2) if abs(next_qty) > 1e-12 else 0.0,
            "openedAt": opened_at,
            "lastRebalancedAt": last_rebalanced_at,
        }

        if order_record is not None:
            equity_after_order = _equity_snapshot(
                cash=cash,
                prices=prices,
                updated_positions=new_positions,
                existing_positions=existing_positions,
            )
            order_record["equityBefore"] = _round(equity_before_order, 2)
            order_record["equityAfter"] = _round(equity_after_order, 2)
            order_record["equityDelta"] = _round(equity_after_order - equity_before_order, 2)
            order_record["cashBefore"] = _round(cash_before_order, 2)
            order_record["cashAfter"] = _round(cash, 2)
            order_record["cashDelta"] = _round(cash - cash_before_order, 2)
            order_record["quantityBefore"] = _round(previous_qty, 8)
            order_record["quantityAfter"] = _round(next_qty, 8)
            order_record["positionValueBefore"] = _round(position_value_before, 2)
            order_record["positionValueAfter"] = _round(next_qty * price, 2)
            order_record["positionValueDelta"] = _round((next_qty * price) - position_value_before, 2)
            if str(order_record.get("status")) == "blocked":
                if not _has_matching_blocked_order(existing_order_history, order_record):
                    cycle_orders.append(order_record)
            else:
                cycle_orders.append(order_record)

    equity = float(cash)
    for asset in ASSETS:
        equity += float(new_positions[asset]["marketValue"])
    equity = max(equity, 1e-9)

    positions_view: list[dict[str, Any]] = []
    for asset in ASSETS:
        position = dict(new_positions[asset])
        current_weight_pct = (float(position["marketValue"]) / equity) * 100.0 if equity else 0.0
        position["currentWeightPct"] = _round(current_weight_pct, 2)
        position["driftWeightPct"] = _round(float(position["targetWeightPct"]) - current_weight_pct, 2)
        positions_view.append(position)

    cash_weight_pct = (float(cash) / equity) * 100.0 if equity else 0.0
    alerts = _build_alerts(strategy_payload, positions_view, cash_weight_pct, cfg, macro_guard=macro_guard)

    all_orders = cycle_orders + existing_order_history
    max_history = int(cfg["paper_execution"]["max_order_history"])
    all_orders = all_orders[:max_history]
    routing_summary = summarize_execution_intents(intents)

    state.update(
        {
            "updatedAt": timestamp,
            "cycleCount": int(state.get("cycleCount", 0)) + 1,
            "cash": _round(cash, 2),
            "equity": _round(equity, 2),
            "positions": new_positions,
            "orders": all_orders,
            "lastSignalSignature": signal_signature,
            "lastRouting": routing_summary,
        }
    )
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    executable_assets = [asset for asset in ASSETS if bool(new_positions[asset]["executable"])]
    shadow_assets = [asset for asset in ASSETS if not bool(new_positions[asset]["executable"])]
    if not bool(macro_guard["executionAllowed"]):
        status = "blocked"
    else:
        status = "shadow_only" if any(abs(float(new_positions[asset]["targetWeightPct"])) > 0 for asset in shadow_assets) else "ok"

    return {
        "status": status,
        "bookUpdatedAt": timestamp,
        "cycleCount": int(state["cycleCount"]),
        "venue": "BITGET_PAPER",
        "baseCurrency": state["baseCurrency"],
        "executableAssets": executable_assets,
        "shadowAssets": shadow_assets,
        "ledger": {
            "cash": _round(cash, 2),
            "equity": _round(equity, 2),
            "cashWeightPct": _round(cash_weight_pct, 2),
            "grossExposurePct": _round(sum(abs(float(row["currentWeightPct"])) for row in positions_view), 2),
        },
        "positions": positions_view,
        "orders": all_orders,
        "alerts": alerts,
        "routing": routing_summary,
        "macroGuard": macro_guard,
    }
