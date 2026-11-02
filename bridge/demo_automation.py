"""One process-local Demo session. Only the local backend sees these endpoints."""

import hashlib
import math
import secrets
import time
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

if __package__:
    from .demo_execution import DemoExecution, DemoPreviewInput, DemoSubmitInput
else:
    from demo_execution import DemoExecution, DemoPreviewInput, DemoSubmitInput


class AutoStart(BaseModel):
    symbol: str = Field(pattern=r"^[A-Z0-9]{3,12}$")
    definition_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    volume: float = Field(gt=0, le=10, allow_inf_nan=False)
    max_entries: int = Field(ge=1, le=100)
    confirm_demo: Literal[True]
    model_config = ConfigDict(extra="forbid")


class AutoAction(BaseModel):
    session_id: str = Field(min_length=20, max_length=80)
    action_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    kind: Literal["OPEN", "CLOSE"]
    side: Literal["BUY", "SELL"] = "BUY"
    sl: float = Field(default=0, ge=0, allow_inf_nan=False)
    tp: float = Field(default=0, ge=0, allow_inf_nan=False)
    model_config = ConfigDict(extra="forbid")


class DemoAutomation:
    def __init__(self, terminal, enabled=False):
        self.terminal = terminal
        self.demo = DemoExecution(terminal, enabled=enabled)
        self.session = None

    def status(self):
        result = self.demo.status()
        if result.get("reason") == "MANUAL_DEMO_DISABLED":
            result = {**result, "reason": "CARD_DEMO_DISABLED"}
        return result

    def stop(self):
        with self.terminal.lock:
            if self.session:
                self.session["active"] = False
            return {"ok": True, "state": "STOPPED", "positionMayRemainOpen": True}

    def flat(self):
        positions = self.terminal.sdk.positions_get()
        if positions is None or positions:
            raise ValueError("DEMO_ACCOUNT_MUST_START_FLAT")
        orders = self.terminal.sdk.orders_get()
        if orders is None or orders:
            raise ValueError("DEMO_ACCOUNT_HAS_PENDING_OR_UNAVAILABLE_ORDERS")

    def reconcile(self):
        with self.terminal.lock:
            try:
                status = self.status()
                if not status["available"]:
                    raise ValueError(status["reason"])
                self.flat()
                return {
                    "ok": True,
                    "flat": True,
                    "pendingOrders": 0,
                    "accountHash": hashlib.sha256(
                        (status["account_id"] + "|" + status["server"]).encode()
                    ).hexdigest(),
                }
            except ValueError as error:
                return {"ok": False, "reason": str(error)}

    def market(self, symbol, tf):
        with self.terminal.lock:
            try:
                status = self.status()
                if not status["available"]:
                    raise ValueError(status["reason"])
                resolved = self.terminal.resolve(symbol)
                if not resolved["ok"]:
                    raise ValueError("SYMBOL_NOT_FOUND")
                quote = self.demo._quote(resolved["broker_symbol"])
                rates = self.terminal.rates(symbol, tf, 2000)
                if not rates.get("ok"):
                    raise ValueError(rates.get("reason", "CLOSED_BARS_UNAVAILABLE"))
                return {
                    "ok": True,
                    "bars": rates["bars"],
                    "bid": float(quote.bid),
                    "ask": float(quote.ask),
                    "nowMs": int(time.time() * 1000),
                }
            except ValueError as error:
                return {"ok": False, "reason": str(error)}

    def _guard(self, session_id=None):
        session = self.session
        status = self.status()
        if (
            not session
            or not session["active"]
            or session_id is not None
            and session_id != session["id"]
        ):
            raise ValueError("DEMO_RUNNER_NOT_ARMED")
        if not status["available"]:
            raise ValueError(status["reason"])
        if time.monotonic() - session["heartbeat"] > 12:
            raise ValueError("DEMO_RUNNER_LEASE_EXPIRED")
        if (status["account_id"], status["server"], status["generation"]) != session[
            "identity"
        ]:
            raise ValueError("DEMO_ACCOUNT_CHANGED")
        return session

    def start(self, body: AutoStart):
        with self.terminal.lock:
            status = self.status()
            if not status["available"]:
                return {"ok": False, "reason": status["reason"]}
            if self.session and self.session["active"]:
                return {"ok": False, "reason": "DEMO_RUNNER_ALREADY_ACTIVE"}
            try:
                self.flat()
            except ValueError as error:
                return {"ok": False, "reason": str(error)}
            resolved = self.terminal.resolve(body.symbol)
            if not resolved["ok"]:
                return {
                    "ok": False,
                    "reason": resolved.get("reason", "SYMBOL_NOT_FOUND"),
                }
            info = self.terminal.sdk.symbol_info(resolved["broker_symbol"])
            if (
                info is None
                or not info.volume_min <= body.volume <= info.volume_max
                or abs(
                    body.volume / info.volume_step
                    - round(body.volume / info.volume_step)
                )
                > 1e-6
            ):
                return {"ok": False, "reason": "INVALID_LOT_SIZE"}
            self.session = {
                "id": secrets.token_urlsafe(24),
                "identity": (
                    status["account_id"],
                    status["server"],
                    status["generation"],
                ),
                "symbol": body.symbol,
                "broker_symbol": resolved["broker_symbol"],
                "volume": body.volume,
                "max_entries": body.max_entries,
                "entries": 0,
                "position": None,
                "actions": {},
                "active": True,
                "heartbeat": time.monotonic(),
                "magic": secrets.randbelow(2_000_000_000) + 1,
                "definition_hash": body.definition_hash,
            }
            return {
                "ok": True,
                "session_id": self.session["id"],
                "state": "ARMED",
                "definition_hash": body.definition_hash,
                "accountHash": hashlib.sha256(
                    (status["account_id"] + "|" + status["server"]).encode()
                ).hexdigest(),
            }

    def heartbeat(self, session_id):
        with self.terminal.lock:
            try:
                session = self._guard(session_id)
                session["heartbeat"] = time.monotonic()
                rows = self.terminal.sdk.positions_get()
                if rows is None:
                    raise ValueError("POSITIONS_UNAVAILABLE")
                owned = [
                    x
                    for x in rows
                    if getattr(x, "magic", None) == session["magic"]
                    and x.symbol == session["broker_symbol"]
                ]
                if any(getattr(x, "magic", None) != session["magic"] for x in rows):
                    raise ValueError("EXTERNAL_POSITION_CONFLICT")
                if len(owned) > 1:
                    raise ValueError("OWNED_POSITION_CONFLICT")
                position = owned[0] if owned else None
                if (
                    position
                    and session["position"]
                    and str(position.ticket) != session["position"]
                ):
                    raise ValueError("POSITION_IDENTITY_CHANGED")
                session["position"] = str(position.ticket) if position else None
                return {
                    "ok": True,
                    "position": (
                        None
                        if not position
                        else {
                            "ticket": str(position.ticket),
                            "side": "BUY" if position.type == 0 else "SELL",
                            "volume": float(position.volume),
                            "entry": float(position.price_open),
                            "sl": float(position.sl),
                            "tp": float(position.tp),
                            "openedAt": self.terminal.market_time(
                                position.time
                            ).isoformat(),
                        }
                    ),
                    "entries": session["entries"],
                }
            except ValueError as error:
                if self.session:
                    self.session["active"] = False
                return {"ok": False, "reason": str(error)}

    def execute(self, body: AutoAction):
        with self.terminal.lock:
            try:
                session = self._guard(body.session_id)
                if body.action_id in session["actions"]:
                    return session["actions"][body.action_id]
                state = self.heartbeat(body.session_id)
                if not state["ok"]:
                    return state
                if body.kind == "OPEN":
                    if state["position"]:
                        raise ValueError("OWNED_POSITION_ALREADY_OPEN")
                    if session["entries"] >= session["max_entries"]:
                        raise ValueError("DEMO_ENTRY_LIMIT_REACHED")
                    if body.sl <= 0 or body.tp <= 0:
                        raise ValueError("DEMO_PROTECTIVE_LEVELS_REQUIRED")
                    info = self.terminal.sdk.symbol_info(session["broker_symbol"])
                    tick_size = float(getattr(info, "trade_tick_size", 0) or info.point)
                    if not math.isfinite(tick_size) or tick_size <= 0:
                        raise ValueError("BROKER_TICK_SIZE_UNAVAILABLE")
                    digits = int(
                        getattr(info, "digits", max(0, round(-math.log10(tick_size))))
                    )
                    down = lambda value: round(
                        math.floor(value / tick_size + 1e-9) * tick_size, digits
                    )
                    up = lambda value: round(
                        math.ceil(value / tick_size - 1e-9) * tick_size, digits
                    )
                    sl = down(body.sl) if body.side == "BUY" else up(body.sl)
                    tp = up(body.tp) if body.side == "BUY" else down(body.tp)
                    draft = DemoPreviewInput(
                        symbol=session["symbol"],
                        side=body.side,
                        volume=session["volume"],
                        sl=sl,
                        tp=tp,
                        deviation=20,
                    )
                else:
                    if not state["position"]:
                        raise ValueError("OWNED_POSITION_NOT_FOUND")
                    draft = DemoPreviewInput(
                        kind="CLOSE", ticket=int(state["position"]["ticket"])
                    )
                preview = self.demo.preview(draft)
                if not preview["ok"]:
                    raise ValueError(preview["reason"])
                request = self.demo.requests[preview["preview_id"]]["request"]
                request["magic"] = session["magic"]
                request["comment"] = "QS card " + session["definition_hash"][:12]
                session["actions"][body.action_id] = {
                    "ok": False,
                    "state": "unknown",
                    "reason": "DEMO_SEND_IN_PROGRESS",
                }
                result = self.demo.submit(
                    DemoSubmitInput(preview_id=preview["preview_id"], confirm_demo=True)
                )
                expected_volume = (
                    draft.volume
                    if body.kind == "OPEN"
                    else float(state["position"]["volume"])
                )
                if result.get("state") == "filled" and (
                    not math.isfinite(float(result.get("price", 0)))
                    or float(result.get("price", 0)) <= 0
                    or abs(float(result.get("volume", 0)) - expected_volume) > 1e-8
                    or result.get("deal") in (None, "0")
                ):
                    result = {
                        "ok": False,
                        "state": "unknown",
                        "reason": "DEMO_FILL_RECONCILIATION_REQUIRED",
                    }
                session["actions"][body.action_id] = result
                if result.get("state") != "filled":
                    session["active"] = False
                elif body.kind == "OPEN":
                    session["entries"] += 1
                return result
            except ValueError as error:
                if self.session:
                    self.session["active"] = False
                return {"ok": False, "state": "rejected", "reason": str(error)}
