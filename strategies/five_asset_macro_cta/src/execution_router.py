"""Route strategy targets into explicit execution intents."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from .bitget_paper import get_bitget_paper_meta
from .config import ASSETS, DEFAULT_ENGINE_CONFIG


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _round(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def _deep_merge(base: dict[str, Any], override: Optional[dict[str, Any]]) -> dict[str, Any]:
    out = dict(base)
    if not override:
        return out
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _resolve_config(config: Optional[dict[str, Any]]) -> dict[str, Any]:
    return _deep_merge(DEFAULT_ENGINE_CONFIG, config)


def _reduce_only_flag(previous_qty: float, next_qty: float, delta_qty: float) -> str:
    if abs(previous_qty) < 1e-12 or abs(delta_qty) < 1e-12:
        return "NO"
    if previous_qty > 0 and delta_qty < 0 and next_qty >= -1e-12:
        return "YES"
    if previous_qty < 0 and delta_qty > 0 and next_qty <= 1e-12:
        return "YES"
    return "NO"


def build_execution_intents(
    strategy_payload: dict[str, Any],
    existing_positions: dict[str, dict[str, Any]],
    *,
    equity: float,
    allow_execution: bool = True,
    block_reasons: Optional[list[dict[str, str]]] = None,
    config: Optional[dict[str, Any]] = None,
    timestamp: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Translate the latest strategy snapshot into per-asset execution intents."""
    cfg = _resolve_config(config)
    last = strategy_payload["lastSnapshot"]
    ts = timestamp or _now_iso()
    min_order_weight_pct = float(cfg["paper_execution"]["min_order_weight_pct"])
    margin_coin = str(cfg["paper_execution"]["base_currency"])
    reason = f"signal::{last['rebalance_reason']}"
    capital = max(float(equity), 1e-9)

    intents: list[dict[str, Any]] = []
    for index, asset in enumerate(ASSETS, start=1):
        meta = get_bitget_paper_meta(asset)
        previous = dict(existing_positions.get(asset, {}))
        price = float(last["prices"][asset])
        previous_qty = float(previous.get("quantity", 0.0))
        current_value = previous_qty * price
        current_weight_pct = (current_value / capital) * 100.0 if capital else 0.0
        target_weight_pct = float(last["net_weights"].get(asset, last["weights"].get(asset, 0.0)))
        target_value = capital * target_weight_pct / 100.0
        delta_value = target_value - current_value
        delta_weight_pct = target_weight_pct - current_weight_pct
        delta_qty = delta_value / price if abs(price) > 1e-12 else 0.0
        next_qty = previous_qty + delta_qty

        if not previous and abs(target_weight_pct) > 1e-12:
            should_trade = True
        else:
            should_trade = abs(delta_weight_pct) >= min_order_weight_pct

        side = "HOLD"
        if delta_qty > 1e-12:
            side = "BUY"
        elif delta_qty < -1e-12:
            side = "SELL"

        if should_trade and allow_execution:
            action = "place_order" if bool(meta["executable"]) else "shadow_sync"
            status = "ready" if bool(meta["executable"]) else "shadow_ready"
        elif should_trade and not allow_execution:
            action = "blocked"
            status = "blocked"
        else:
            action = "hold"
            status = "hold"
            delta_qty = 0.0
            delta_value = 0.0
            delta_weight_pct = 0.0
            next_qty = previous_qty
            side = "HOLD"

        intents.append(
            {
                "id": f"{ts}-{asset}-{index}",
                "timestamp": ts,
                "asset": asset,
                "venue": meta["venue"],
                "symbol": meta["symbol"],
                "productType": meta["productType"],
                "marginCoin": margin_coin,
                "mode": meta["mode"],
                "executable": bool(meta["executable"]),
                "action": action,
                "status": status,
                "side": side,
                "previousWeightPct": _round(current_weight_pct, 2),
                "targetWeightPct": _round(target_weight_pct, 2),
                "deltaWeightPct": _round(delta_weight_pct, 2),
                "quantity": _round(abs(delta_qty), 8),
                "signedQuantity": _round(delta_qty, 8),
                "targetQuantity": _round(next_qty, 8),
                "notional": _round(abs(delta_value), 2),
                "signedNotional": _round(delta_value, 2),
                "price": _round(price, 4),
                "reduceOnly": _reduce_only_flag(previous_qty, next_qty, delta_qty),
                "reason": reason,
                "rebalanceReason": str(last["rebalance_reason"]),
                "regime": str(last["regime"]),
                "riskSignals": int(last["risk_signals"]),
                "blockReasons": list(block_reasons or []),
            }
        )

    return intents


def summarize_execution_intents(intents: list[dict[str, Any]]) -> dict[str, Any]:
    executable = [intent for intent in intents if intent["executable"] and intent["action"] == "place_order"]
    shadow = [intent for intent in intents if not intent["executable"] and intent["action"] == "shadow_sync"]
    blocked = [intent for intent in intents if intent["action"] == "blocked"]
    hold = [intent for intent in intents if intent["action"] == "hold"]
    return {
        "generatedAt": intents[0]["timestamp"] if intents else _now_iso(),
        "readyExecutableOrders": len(executable),
        "shadowSyncOrders": len(shadow),
        "blockedOrders": len(blocked),
        "holdCount": len(hold),
        "executableNotional": _round(sum(float(row["notional"]) for row in executable), 2),
        "shadowNotional": _round(sum(float(row["notional"]) for row in shadow), 2),
        "blockedNotional": _round(sum(float(row["notional"]) for row in blocked), 2),
        "intents": intents,
        "executableIntents": executable,
        "shadowIntents": shadow,
        "blockedIntents": blocked,
    }
