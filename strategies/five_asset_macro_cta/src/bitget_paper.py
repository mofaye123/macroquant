"""Bitget paper venue metadata for the five-asset strategy."""

from __future__ import annotations

BITGET_PAPER_SYMBOLS = {
    "BTC": {"symbol": "BTCUSDT", "productType": "USDT-FUTURES"},
    "ETH": {"symbol": "ETHUSDT", "productType": "USDT-FUTURES"},
}


def get_bitget_paper_meta(asset: str) -> dict[str, object]:
    mapping = BITGET_PAPER_SYMBOLS.get(asset)
    if mapping:
        return {
            "venue": "BITGET_PAPER",
            "symbol": mapping["symbol"],
            "productType": mapping["productType"],
            "executable": True,
            "mode": "paper",
        }
    return {
        "venue": "SHADOW_BOOK",
        "symbol": asset,
        "productType": None,
        "executable": False,
        "mode": "shadow",
    }
