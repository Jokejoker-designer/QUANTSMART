"""User-requested MANUAL_DEMO_ONLY adapter. Independent of MFE research decisions.

No strategy callback can invoke this adapter. Real/contest/unknown accounts fail
closed. A short-lived reviewed preview is required for each manual transaction.
"""
from __future__ import annotations

import math
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AUTHORITY = "MANUAL_DEMO_ONLY"
SCOPE = {"scope": AUTHORITY, "real_execution_allowed": False, "live_apply_allowed": False}


class DemoPreviewInput(BaseModel):
    kind: Literal["OPEN", "CLOSE"] = "OPEN"
    symbol: str = Field(default="XAUUSD", min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.#-]+$")
    side: Literal["BUY", "SELL"] = "BUY"
    volume: float = Field(default=0, ge=0, allow_inf_nan=False)
    sl: float = Field(default=0, ge=0, allow_inf_nan=False)
    tp: float = Field(default=0, ge=0, allow_inf_nan=False)
    ticket: int = Field(default=0, ge=0)
    deviation: int = Field(default=20, ge=0, le=10000)
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class DemoSubmitInput(BaseModel):
    preview_id: str = Field(min_length=20, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    confirm_demo: Literal[True]
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class DemoExecution:
    def __init__(self, terminal, enabled: bool = False):
        self.terminal = terminal
        self.enabled = enabled
        self.lock = threading.RLock()
        self.requests = {}

    def status(self):
        with self.terminal.lock:
            account = self.terminal.account()
            base = {**SCOPE, "available": False, "connected": account["connected"],
                    "account_kind": account["account_kind"], "server": account.get("server"),
                    "account_id": account.get("account_id"), "generation": self.terminal.generation}
            if not self.enabled:
                return {**base, "reason": "MANUAL_DEMO_DISABLED"}
            if not account["connected"]:
                return {**base, "reason": "CONNECT_MT5_FIRST"}
            if account["account_kind"] != "DEMO":
                return {**base, "reason": "DEMO_ACCOUNT_REQUIRED"}
            native = self.terminal.sdk.account_info()
            info = self.terminal.sdk.terminal_info()
            if native is None or info is None:
                return {**base, "reason": "ACCOUNT_UNAVAILABLE"}
            if int(native.trade_mode) != self.terminal.sdk.ACCOUNT_TRADE_MODE_DEMO or (str(native.login), str(native.server)) != (account.get("account_id"), account.get("server")):
                return {**base, "reason": "DEMO_ACCOUNT_CHANGED"}
            if not getattr(info, "trade_allowed", False):
                return {**base, "reason": "MT5_ALGO_TRADING_DISABLED"}
            if getattr(info, "tradeapi_disabled", True):
                return {**base, "reason": "MT5_PYTHON_TRADING_DISABLED"}
            if not getattr(native, "trade_allowed", False) or not getattr(native, "trade_expert", False):
                return {**base, "reason": "BROKER_DEMO_TRADING_DISABLED"}
            return {**base, "available": True, "reason": None}

    def positions(self):
        with self.terminal.lock:
            account = self.terminal.account()
            if not account["connected"] or account["account_kind"] != "DEMO":
                return {"ok": False, "reason": "DEMO_ACCOUNT_REQUIRED", "positions": [], **SCOPE}
            data = self.terminal.sdk.positions_get()
            if data is None:
                return {"ok": False, "reason": "POSITIONS_UNAVAILABLE", "positions": [], **SCOPE}
            current = self.terminal.sdk.account_info()
            if current is None or int(current.trade_mode) != self.terminal.sdk.ACCOUNT_TRADE_MODE_DEMO or (str(current.login), str(current.server)) != (account.get("account_id"), account.get("server")):
                return {"ok": False, "reason": "DEMO_ACCOUNT_CHANGED", "positions": [], **SCOPE}
            rows = [{"ticket": str(p.ticket), "symbol": p.symbol, "side": "BUY" if int(p.type) == 0 else "SELL",
                     "volume": float(p.volume), "open_price": float(p.price_open), "current_price": float(p.price_current),
                     "profit": float(p.profit), "sl": float(p.sl), "tp": float(p.tp)} for p in data[:100]]
            return {"ok": True, "positions": rows, "total": len(data), **SCOPE}

    def _quote(self, name):
        tick = self.terminal.sdk.symbol_info_tick(name)
        if tick is None or not all(math.isfinite(float(v)) and float(v) > 0 for v in (tick.bid, tick.ask)) or tick.ask < tick.bid:
            raise ValueError("QUOTE_UNAVAILABLE")
        age = time.time() - self.terminal.market_time(tick.time).timestamp()
        if not -1 <= age <= 10:
            raise ValueError("QUOTE_STALE")
        return tick

    def _fill(self, info):
        sdk = self.terminal.sdk
        flags = int(info.filling_mode)
        if flags & 2:
            return sdk.ORDER_FILLING_IOC
        if flags & 1:
            return sdk.ORDER_FILLING_FOK
        if int(info.trade_exemode) != sdk.SYMBOL_TRADE_EXECUTION_MARKET:
            return sdk.ORDER_FILLING_RETURN
        raise ValueError("BROKER_FILLING_UNSUPPORTED")

    def _check(self, request):
        check = self.terminal.sdk.order_check(request)
        if check is None or int(check.retcode) != 0:
            raise ValueError(f"BROKER_CHECK_{int(check.retcode) if check else 'UNAVAILABLE'}")

    def preview(self, body: DemoPreviewInput):
        with self.terminal.lock:
            status = self.status()
            if not status["available"]:
                return {"ok": False, "reason": status["reason"], **SCOPE}
            sdk = self.terminal.sdk
            try:
                if body.kind == "CLOSE":
                    found = sdk.positions_get(ticket=body.ticket) if body.ticket else None
                    if not found:
                        raise ValueError("POSITION_NOT_FOUND")
                    position = found[0]
                    name, volume = position.symbol, float(position.volume)
                    side = "SELL" if int(position.type) == 0 else "BUY"
                else:
                    resolved = self.terminal.resolve(body.symbol)
                    if not resolved["ok"]:
                        raise ValueError(resolved.get("reason", "SYMBOL_NOT_FOUND"))
                    name, volume, side = resolved["broker_symbol"], body.volume, body.side
                info = sdk.symbol_info(name)
                if info is None:
                    raise ValueError("SYMBOL_NOT_FOUND")
                step = float(info.volume_step)
                if volume <= 0 or not float(info.volume_min) <= volume <= float(info.volume_max) or step <= 0 or abs(volume / step - round(volume / step)) > 1e-6:
                    raise ValueError("INVALID_LOT_SIZE")
                tick = self._quote(name)
                price = float(tick.ask if side == "BUY" else tick.bid)
                request = {"action": sdk.TRADE_ACTION_DEAL, "symbol": name, "volume": volume,
                           "type": sdk.ORDER_TYPE_BUY if side == "BUY" else sdk.ORDER_TYPE_SELL,
                           "price": price, "deviation": body.deviation, "comment": "MFE manual demo",
                           "type_time": sdk.ORDER_TIME_GTC, "type_filling": self._fill(info)}
                market_execution = int(info.trade_exemode) == sdk.SYMBOL_TRADE_EXECUTION_MARKET
                if market_execution:
                    request.pop("price")
                if body.kind == "CLOSE":
                    request["position"] = int(position.ticket)
                else:
                    distance = max(0, int(info.trade_stops_level)) * float(info.point)
                    if body.sl and (body.sl >= tick.bid - distance if side == "BUY" else body.sl <= tick.ask + distance):
                        raise ValueError("INVALID_STOP_LOSS")
                    if body.tp and (body.tp <= tick.bid + distance if side == "BUY" else body.tp >= tick.ask - distance):
                        raise ValueError("INVALID_TAKE_PROFIT")
                    if body.sl:
                        request["sl"] = body.sl
                    if body.tp:
                        request["tp"] = body.tp
                self._check(request)
                preview_id = secrets.token_urlsafe(24)
                summary = {"kind": body.kind, "symbol": name, "side": side, "volume": volume,
                           "price": price, "sl": request.get("sl", 0), "tp": request.get("tp", 0),
                           "ticket": str(body.ticket) if body.kind == "CLOSE" else None,
                           "account_id": status["account_id"], "server": status["server"],
                           "deviation": body.deviation, "expires_in_seconds": 30}
                with self.lock:
                    self.requests = {k: v for k, v in self.requests.items() if time.monotonic() - v["created"] < 1200}
                    if len(self.requests) >= 128:
                        raise ValueError("TOO_MANY_DEMO_REQUESTS")
                    self.requests[preview_id] = {"created": time.monotonic(), "generation": status["generation"],
                                                 "identity": (status["account_id"], status["server"]),
                                                 "request": request, "quoted_price": price, "market_execution": market_execution,
                                                 "summary": summary, "state": "preview"}
                return {"ok": True, "preview_id": preview_id, **summary, **SCOPE}
            except ValueError as error:
                return {"ok": False, "reason": str(error), **SCOPE}
            except Exception:
                return {"ok": False, "reason": "DEMO_PREVIEW_UNAVAILABLE", **SCOPE}

    def receipt(self, preview_id):
        with self.lock:
            item = self.requests.get(preview_id)
            if not item:
                return {"ok": False, "state": "unknown", "reason": "REQUEST_NOT_FOUND", **SCOPE}
            return item.get("result") or {"ok": True, "state": item["state"], **SCOPE}

    def submit(self, body: DemoSubmitInput):
        with self.lock:
            item = self.requests.get(body.preview_id)
            if not item:
                return {"ok": False, "state": "rejected", "reason": "PREVIEW_EXPIRED", **SCOPE}
            if item["state"] != "preview":
                return item.get("result") or {"ok": True, "state": item["state"], **SCOPE}
            item["state"] = "sending"
        result = None
        try:
            with self.terminal.lock:
                status = self.status()
                if not status["available"]:
                    raise ValueError(status["reason"])
                if time.monotonic() - item["created"] > 30:
                    raise ValueError("PREVIEW_EXPIRED")
                if item["generation"] != status["generation"] or item["identity"] != (status["account_id"], status["server"]):
                    raise ValueError("ACCOUNT_CHANGED_REVIEW_AGAIN")
                request = dict(item["request"])
                if "position" in request:
                    found = self.terminal.sdk.positions_get(ticket=request["position"])
                    if not found or found[0].symbol != request["symbol"] or abs(float(found[0].volume) - request["volume"]) > 1e-8:
                        raise ValueError("POSITION_CHANGED_REVIEW_AGAIN")
                tick = self._quote(request["symbol"])
                info = self.terminal.sdk.symbol_info(request["symbol"])
                current = float(tick.ask if request["type"] == self.terminal.sdk.ORDER_TYPE_BUY else tick.bid)
                if abs(current - item["quoted_price"]) > request["deviation"] * float(info.point) + 1e-9:
                    raise ValueError("PRICE_CHANGED_REVIEW_AGAIN")
                if not item["market_execution"]:
                    request["price"] = current
                self._check(request)
                # Recheck the native account immediately before the one-shot IPC send.
                native = self.terminal.sdk.account_info()
                if native is None or int(native.trade_mode) != self.terminal.sdk.ACCOUNT_TRADE_MODE_DEMO or (str(native.login), str(native.server)) != item["identity"]:
                    raise ValueError("DEMO_ACCOUNT_CHANGED")
                sent = self.terminal.sdk.order_send(request)
                if sent is None:
                    result = {"ok": False, "state": "unknown", "reason": "BROKER_RESULT_UNKNOWN_CHECK_MT5", **SCOPE}
                else:
                    code = int(sent.retcode)
                    state = "filled" if code == 10009 else "partial" if code == 10010 else "accepted" if code == 10008 else "rejected"
                    result = {"ok": state != "rejected", "state": state, "retcode": code,
                              "order": str(sent.order), "deal": str(sent.deal), "volume": float(sent.volume),
                              "price": float(sent.price), "reason": None if state != "rejected" else f"BROKER_REJECTED_{code}", **SCOPE}
        except ValueError as error:
            result = {"ok": False, "state": "rejected", "reason": str(error), **SCOPE}
        except Exception:
            result = {"ok": False, "state": "unknown", "reason": "BROKER_RESULT_UNKNOWN_CHECK_MT5", **SCOPE}
        finally:
            with self.lock:
                item["result"] = result
                item["state"] = result["state"]
        return result
