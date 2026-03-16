"""Minimal Bitget REST client for demo/live contract execution.

This client follows the official Bitget REST authentication flow:
- ACCESS-SIGN = Base64(HMAC_SHA256(secret, prehash))
- prehash = timestamp + METHOD + request_path + (?query_string) + body
- demo trading requests send `paptrading: 1`
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import DEFAULT_ENGINE_CONFIG


class BitgetApiError(RuntimeError):
    """Raised when Bitget returns a request or transport error."""


@dataclass(frozen=True)
class BitgetCredentials:
    api_key: str
    api_secret: str
    passphrase: str

    @classmethod
    def from_env(cls) -> "BitgetCredentials":
        key = os.getenv("BITGET_API_KEY", "").strip()
        secret = os.getenv("BITGET_API_SECRET", "").strip()
        passphrase = os.getenv("BITGET_API_PASSPHRASE", "").strip()
        if not key or not secret or not passphrase:
            raise BitgetApiError(
                "缺少 Bitget API 凭证，请设置 BITGET_API_KEY / BITGET_API_SECRET / BITGET_API_PASSPHRASE。"
            )
        return cls(api_key=key, api_secret=secret, passphrase=passphrase)


@dataclass
class BitgetRestClient:
    credentials: BitgetCredentials
    base_url: str
    locale: str = "zh-CN"
    demo_trading: bool = True
    timeout_seconds: float = 10.0

    @classmethod
    def from_env(cls, *, demo_trading: Optional[bool] = None) -> "BitgetRestClient":
        cfg = DEFAULT_ENGINE_CONFIG["bitget_execution"]
        env_demo = os.getenv("BITGET_DEMO_TRADING")
        resolved_demo = cfg["demo_trading"] if demo_trading is None else demo_trading
        if env_demo is not None:
            resolved_demo = env_demo.strip().lower() in {"1", "true", "yes", "on"}
        return cls(
            credentials=BitgetCredentials.from_env(),
            base_url=os.getenv("BITGET_BASE_URL", str(cfg["base_url"])).rstrip("/"),
            locale=os.getenv("BITGET_LOCALE", str(cfg["locale"])),
            demo_trading=bool(resolved_demo),
        )

    @staticmethod
    def _timestamp_ms() -> str:
        return str(int(time.time() * 1000))

    @staticmethod
    def _encode_body(body: Optional[Mapping[str, Any]]) -> str:
        if not body:
            return ""
        return json.dumps(body, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _encode_query(params: Optional[Mapping[str, Any]]) -> str:
        if not params:
            return ""
        filtered = {key: value for key, value in params.items() if value is not None}
        return urlencode(filtered, doseq=True)

    def _sign(self, timestamp: str, method: str, request_path: str, query: str, body: str) -> str:
        prehash = f"{timestamp}{method.upper()}{request_path}"
        if query:
            prehash += f"?{query}"
        prehash += body
        digest = hmac.new(
            self.credentials.api_secret.encode("utf-8"),
            prehash.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.b64encode(digest).decode("utf-8")

    def _headers(self, *, timestamp: str, signature: str) -> dict[str, str]:
        headers = {
            "ACCESS-KEY": self.credentials.api_key,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": self.credentials.passphrase,
            "Content-Type": "application/json",
            "locale": self.locale,
        }
        if self.demo_trading:
            headers["paptrading"] = "1"
        return headers

    def request(
        self,
        method: str,
        request_path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        body: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Any]:
        query = self._encode_query(params)
        body_text = self._encode_body(body)
        timestamp = self._timestamp_ms()
        signature = self._sign(timestamp, method, request_path, query, body_text)
        url = f"{self.base_url}{request_path}"
        if query:
            url = f"{url}?{query}"

        request = Request(
            url,
            data=body_text.encode("utf-8") if body_text else None,
            method=method.upper(),
            headers=self._headers(timestamp=timestamp, signature=signature),
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            payload = exc.read().decode("utf-8", errors="replace")
            raise BitgetApiError(f"Bitget HTTP {exc.code}: {payload}") from exc
        except URLError as exc:
            raise BitgetApiError(f"Bitget 连接失败: {exc}") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BitgetApiError(f"Bitget 返回了非 JSON 响应: {raw[:200]}") from exc

        code = str(parsed.get("code", ""))
        if code and code != "00000":
            raise BitgetApiError(f"Bitget API 错误 {code}: {parsed.get('msg', 'unknown error')}")
        return parsed

    def set_position_mode(
        self,
        *,
        product_type: str,
        pos_mode: str,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/mix/account/set-position-mode",
            body={
                "productType": product_type,
                "posMode": pos_mode,
            },
        )

    def get_all_positions(
        self,
        *,
        product_type: str,
        margin_coin: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"productType": product_type}
        if margin_coin:
            params["marginCoin"] = margin_coin
        return self.request(
            "GET",
            "/api/v2/mix/position/all-position",
            params=params,
        )

    def place_contract_order(
        self,
        *,
        symbol: str,
        product_type: str,
        margin_coin: str,
        side: str,
        size: float,
        client_oid: str,
        order_type: str = "market",
        margin_mode: str = "crossed",
        time_in_force: Optional[str] = None,
        reduce_only: str = "NO",
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "symbol": symbol,
            "productType": product_type,
            "marginMode": margin_mode,
            "marginCoin": margin_coin,
            "size": self._format_size(size),
            "side": side.lower(),
            "orderType": order_type,
            "clientOid": client_oid,
            "reduceOnly": reduce_only,
        }
        if time_in_force and order_type != "market":
            body["force"] = time_in_force.lower()
        return self.request("POST", "/api/v2/mix/order/place-order", body=body)

    @staticmethod
    def _format_size(value: float) -> str:
        text = f"{float(value):.8f}".rstrip("0").rstrip(".")
        return text or "0"


def client_from_env(*, demo_trading: Optional[bool] = None) -> BitgetRestClient:
    return BitgetRestClient.from_env(demo_trading=demo_trading)
