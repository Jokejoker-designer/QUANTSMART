"""MFE market-data bridge plus an isolated, user-confirmed Demo-only adapter.

Copyright 2026 MFE Workspace contributors. Licensed under Apache-2.0.
The SDK is imported lazily; Linux/macOS and missing SDKs remain valid offline states.
"""
from __future__ import annotations

import importlib
import asyncio
import json
import math
import os
import re
import secrets
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, SecretStr, ConfigDict
if __package__:
    from .demo_execution import DemoExecution, DemoPreviewInput, DemoSubmitInput
else:
    from demo_execution import DemoExecution, DemoPreviewInput, DemoSubmitInput

AUTHORITY = {"authority": "SHADOW_ONLY", "decision": "NO_DECISION", "live_apply_allowed": False, "read_only": True}
TF_MINUTES = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440, "W1": 10080}
GOLD_ALIASES = ("XAUUSD", "GOLD", "GOLD#", "XAUUSDm", "XAUUSD.a", "XAUUSD.pro", "GOLDmicro")


def numeric(value: Any) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError, OverflowError):
        return None


class ConnectInput(BaseModel):
    terminal_path: str = Field(default="", max_length=1024)
    login: str = Field(default="", max_length=24, pattern=r"^\d*$")
    password: SecretStr | None = None
    server: str = Field(default="", max_length=128)

    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class SymbolInput(BaseModel):
    symbol: str = Field(min_length=3, max_length=64)
    broker_symbol: str = Field(default="", max_length=80)

    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


def indicators(bars: list[dict]) -> dict:
    # Same EMA and Wilder ATR recurrence as the historical observation adapter.
    fast = slow = bars[0]["c"]
    atr = bars[0]["h"] - bars[0]["l"]
    for i, bar in enumerate(bars[1:], 1):
        fast += (bar["c"] - fast) * (2 / 11)
        slow += (bar["c"] - slow) * (2 / 35)
        previous = bars[i - 1]["c"]
        true_range = max(bar["h"] - bar["l"], abs(bar["h"] - previous), abs(bar["l"] - previous))
        atr = (atr * 13 + true_range) / 14
    return {"ema10": fast, "ema34": slow, "atr14": atr if len(bars) > 1 else atr or 1}


class TerminalService:
    def __init__(self, sdk: Any = None, platform: str | None = None, server_timezone: str = "UTC"):
        self.sdk = sdk
        self.platform = platform or sys.platform
        self.lock = threading.RLock()
        self.attached = False
        self.reason = "NOT_ATTACHED"
        self.generation = secrets.randbelow(1_000_000_000) + 1
        self.account_identity = None
        self.overrides: dict[str, str] = {}
        self.cache: dict[tuple, tuple[float, dict]] = {}
        self.server_timezone_name = server_timezone
        self.server_timezone = ZoneInfo(server_timezone)
        self.tick_symbols: dict[tuple, str] = {}

    def market_time(self, value: Any) -> datetime:
        # Some terminal feeds encode broker wall-clock fields as an epoch value.
        # Use an explicit IANA timezone, including its historical DST rules.
        # UTC remains the default; never infer an offset from an old/stale tick.
        wall = datetime.fromtimestamp(int(value), timezone.utc).replace(tzinfo=None)
        return wall.replace(tzinfo=self.server_timezone).astimezone(timezone.utc)

    def query_time(self, value: datetime) -> datetime:
        return value.astimezone(self.server_timezone).replace(tzinfo=timezone.utc)

    def capability(self) -> dict:
        if self.sdk is None:
            if self.platform != "win32":
                return {"supported": False, "reason": "NATIVE_MT5_REQUIRES_WINDOWS"}
            try:
                self.sdk = importlib.import_module("MetaTrader5")
            except (ImportError, OSError):
                return {"supported": False, "reason": "MT5_PACKAGE_UNAVAILABLE"}
        return {"supported": True, "reason": self.reason}

    def account(self) -> dict:
        with self.lock:
            capability = self.capability()
            base = {**AUTHORITY, **capability, "connected": False, "account_kind": "UNKNOWN", "trade_allowed": False, "generation": self.generation}
            if not capability["supported"] or not self.attached:
                return {**base, "reason": capability["reason"]}
            try:
                account, terminal = self.sdk.account_info(), self.sdk.terminal_info()
                if account is None or terminal is None or not terminal.connected:
                    return {**base, "reason": "TERMINAL_DISCONNECTED"}
                identity = (str(account.login), str(account.server))
                if self.account_identity is not None and identity != self.account_identity:
                    self.generation += 1
                    self.cache.clear()
                    self.overrides.clear()
                self.account_identity = identity
                mode = int(account.trade_mode)
                kind = "DEMO" if mode == getattr(self.sdk, "ACCOUNT_TRADE_MODE_DEMO", 0) else "REAL" if mode == getattr(self.sdk, "ACCOUNT_TRADE_MODE_REAL", 2) else "UNKNOWN"
                return {**base, "connected": True, "reason": None, "account_id": str(account.login), "account_kind": kind,
                        "server": str(account.server), "broker": str(getattr(account, "company", "")),
                        "balance": numeric(account.balance), "equity": numeric(account.equity), "currency": str(account.currency), "generation": self.generation}
            except Exception:
                return {**base, "reason": "ACCOUNT_UNAVAILABLE"}

    def connect(self, settings: ConnectInput) -> dict:
        with self.lock:
            capability = self.capability()
            self.generation += 1
            self.cache.clear()
            self.overrides.clear()
            if not capability["supported"]:
                return {"ok": False, **self.account()}
            # Detach only this Python IPC session; never close the terminal or positions.
            if self.attached:
                self.sdk.shutdown()
            self.attached = False
            self.reason = "NOT_ATTACHED"
            self.account_identity = None
            path = settings.terminal_path.strip()
            if path and (not Path(path).is_absolute() or path.startswith("\\\\") or Path(path).name.lower() not in {"terminal64.exe", "terminal.exe", "metatrader64.exe", "metatrader.exe"} or not Path(path).is_file()):
                self.reason = "INVALID_TERMINAL_PATH"
                return {"ok": False, **self.account()}
            kwargs: dict[str, Any] = {"timeout": 10000}
            if settings.login:
                if not settings.server:
                    self.reason = "SERVER_REQUIRED_FOR_ACCOUNT_SWITCH"
                    return {"ok": False, **self.account()}
                kwargs["login"], kwargs["server"] = int(settings.login), settings.server.strip()
                if settings.password:
                    kwargs["password"] = settings.password.get_secret_value()
            elif settings.password or settings.server:
                self.reason = "LOGIN_REQUIRED_FOR_ACCOUNT_SWITCH"
                return {"ok": False, **self.account()}
            try:
                self.attached = bool(self.sdk.initialize(path, **kwargs) if path else self.sdk.initialize(**kwargs))
                if not self.attached:
                    self.reason = "MT5_INITIALIZE_FAILED"
                result = self.account()
                return {"ok": bool(result["connected"]), **result}
            except Exception:
                self.reason = "MT5_INITIALIZE_FAILED"
                return {"ok": False, **self.account()}
            finally:
                kwargs.clear()  # No credentials are retained in this service, files, logs or URLs.

    def disconnect(self) -> dict:
        with self.lock:
            if self.attached and self.sdk:
                self.sdk.shutdown()
            self.attached = False
            self.account_identity = None
            self.reason = "NOT_ATTACHED"
            self.generation += 1
            self.overrides.clear()
            self.cache.clear()
            return {"ok": True, **self.account()}

    def symbols(self, canonical: str) -> list[dict]:
        if not re.fullmatch(r"[A-Za-z0-9_.#-]{3,64}", canonical):
            return []
        canonical = canonical.upper()
        candidates = []
        aliases = [s.upper() for s in GOLD_ALIASES] if canonical in {"XAUUSD", "GOLD"} else [canonical]
        for item in self.sdk.symbols_get() or ():
            name = str(item.name)
            upper = name.upper()
            gold = canonical in {"XAUUSD", "GOLD"}
            base = str(getattr(item, "currency_base", "")).upper()
            quote = str(getattr(item, "currency_profit", "")).upper()
            named_match = bool(re.fullmatch(r"(?:XAUUSD|GOLD)(?:[._#-].*|MICRO|M|C|PRO)?", upper)) if gold else bool(re.fullmatch(re.escape(canonical) + r"(?:[._#-].*|MICRO|M|C|PRO)?", upper))
            pair_match = (base == "XAU" and quote == "USD") if gold else len(canonical) == 6 and base == canonical[:3] and quote == canonical[3:]
            match = upper in aliases or named_match or pair_match
            if not match or bool(getattr(item, "custom", False)) or int(getattr(item, "expiration_time", 0) or 0):
                continue
            quote = str(getattr(item, "currency_profit", "")).upper()
            expected_quote = "USD" if gold else canonical[3:] if len(canonical) == 6 and canonical.isalpha() else ""
            if expected_quote and quote and quote != expected_quote:
                continue
            rank = aliases.index(upper) if upper in aliases else len(aliases)
            candidates.append({"name": name, "description": str(getattr(item, "description", "")), "base": str(getattr(item, "currency_base", "")), "quote": quote, "rank": rank})
        return sorted(candidates, key=lambda item: (item["rank"], item["name"]))

    def resolve(self, canonical: str, override: str = "") -> dict:
        with self.lock:
            if not self.account()["connected"]:
                return {"ok": False, "reason": "NOT_CONNECTED", "candidates": []}
            candidates = self.symbols(canonical)
            name = override or self.overrides.get(canonical.upper(), "") or (candidates[0]["name"] if candidates else "")
            if not name or name not in {item["name"] for item in candidates}:
                return {"ok": False, "reason": "SYMBOL_NOT_FOUND", "canonical_symbol": canonical, "candidates": candidates}
            if not self.sdk.symbol_select(name, True):
                return {"ok": False, "reason": "SYMBOL_SELECTION_FAILED", "candidates": candidates}
            if override:
                self.overrides[canonical.upper()] = name
                self.cache.clear()
            return {"ok": True, "canonical_symbol": canonical, "broker_symbol": name, "candidates": candidates, "generation": self.generation}

    def rates(self, canonical: str, tf: str, count: int = 600, forming: bool = False, use_cache: bool = True) -> dict:
        with self.lock:
            if tf not in TF_MINUTES or count < 1 or count > 5000:
                return {"ok": False, "reason": "INVALID_BAR_REQUEST", "bars": []}
            resolved = self.resolve(canonical)
            if not resolved["ok"]:
                return {**resolved, "bars": []}
            name = resolved["broker_symbol"]
            key = (self.generation, name, tf, count, forming)
            cached = self.cache.get(key)
            if use_cache and cached and time.monotonic() - cached[0] < 3:
                return cached[1]
            data = self.sdk.copy_rates_from_pos(name, getattr(self.sdk, "TIMEFRAME_" + tf), 0 if forming else 1, count)
            bars = []
            for i, item in enumerate(data if data is not None else []):
                observed_time = self.market_time(item["time"])
                if not forming and observed_time.timestamp() + TF_MINUTES[tf] * 60 > time.time() + 1:
                    continue
                values = [numeric(item[field]) for field in ("open", "high", "low", "close")]
                if any(value is None for value in values):
                    return {"ok": False, "reason": "INVALID_PRICE_OBSERVATION", "bars": [], **AUTHORITY}
                bars.append({"i": i, "o": values[0], "h": values[1], "l": values[2], "c": values[3], "t": observed_time.isoformat(timespec="seconds").replace("+00:00", "Z"), "r": "N", "tick_volume": int(item["tick_volume"]), "spread": int(item["spread"])})
            bars.sort(key=lambda bar: bar["t"])
            result = {"ok": bool(bars), "reason": None if bars else "NO_MARKET_DATA", "bars": bars, "symbol": canonical, "broker_symbol": name, "timeframe": tf, "source": "MT5_CLOSED_BARS" if not forming else "MT5_FORMING_BAR", "server_timezone": self.server_timezone_name, "timestamp_basis": "UTC", **AUTHORITY}
            self.cache[key] = (time.monotonic(), result)
            if len(self.cache) > 48:
                self.cache.pop(next(iter(self.cache)))
            return result

    def ticks(self, canonical: str, tf: str, cursor: str = "") -> dict:
        """Read every terminal tick after a millisecond/ordinal cursor, not just last price."""
        with self.lock:
            account = self.account()
            if not account["connected"]:
                return {"ok": False, "reason": account.get("reason"), **AUTHORITY}
            if tf not in TF_MINUTES or not re.fullmatch(r"[A-Za-z0-9_.#-]{3,64}", canonical):
                return {"ok": False, "reason": "INVALID_TICK_REQUEST", **AUTHORITY}
            previous_ms = previous_ordinal = 0
            if cursor:
                try:
                    gen, previous_ms, previous_ordinal = map(int, cursor.split(":"))
                    if min(gen, previous_ms, previous_ordinal) < 0:
                        raise ValueError()
                except (ValueError, TypeError):
                    return {"ok": False, "reason": "INVALID_TICK_CURSOR", **AUTHORITY}
                if gen != self.generation:
                    return {"ok": False, "reason": "TERMINAL_CHANGED", **AUTHORITY}
            symbol_key = (self.generation, canonical.upper(), self.overrides.get(canonical.upper()))
            name = self.tick_symbols.get(symbol_key)
            if not name:
                resolved = self.resolve(canonical)
                if not resolved["ok"]:
                    return resolved
                name = resolved["broker_symbol"]
                self.tick_symbols[symbol_key] = name
                if len(self.tick_symbols) > 16:
                    self.tick_symbols.pop(next(iter(self.tick_symbols)))
            latest = self.sdk.symbol_info_tick(name)
            if latest is None:
                return {"ok": False, "reason": "NO_MARKET_DATA", **AUTHORITY}
            latest_ms = int(getattr(latest, "time_msc", 0) or latest.time * 1000)
            start_ms = previous_ms or latest_ms
            # Query the inclusive second and count equal-ms rows to preserve duplicates.
            start = datetime.fromtimestamp(start_ms // 1000, timezone.utc)
            raw = self.sdk.copy_ticks_from(name, start, 8192, self.sdk.COPY_TICKS_ALL)
            if raw is None:
                return {"ok": False, "reason": "TICK_HISTORY_UNAVAILABLE", **AUTHORITY}
            ticks = []
            last_ms = previous_ms
            last_ordinal = previous_ordinal
            group_ms = group_count = 0
            for item in raw:
                raw_ms = int(item["time_msc"] or int(item["time"]) * 1000)
                if raw_ms < previous_ms:
                    continue
                group_count = group_count + 1 if raw_ms == group_ms else 1
                group_ms = raw_ms
                if raw_ms == previous_ms and group_count <= previous_ordinal:
                    continue
                bid, ask, last = (numeric(item[field]) for field in ("bid", "ask", "last"))
                if bid is None or ask is None or last is None or bid <= 0 or ask < bid:
                    return {"ok": False, "reason": "INVALID_TICK_OBSERVATION", **AUTHORITY}
                utc_ms = int(self.market_time(raw_ms // 1000).timestamp()) * 1000 + raw_ms % 1000
                ticks.append({"time_msc": utc_ms, "bid": bid, "ask": ask, "last": last, "volume": numeric(item["volume"]), "flags": int(item["flags"])})
                last_ms, last_ordinal = raw_ms, group_count
            if len(raw) >= 8192 and not ticks:
                return {"ok": False, "reason": "TICK_BACKLOG_OVERFLOW", **AUTHORITY}
            result = {"ok": True, "symbol": canonical, "broker_symbol": name, "timeframe": tf,
                      "generation": self.generation, "cursor": f"{self.generation}:{last_ms}:{last_ordinal}",
                      "ticks": ticks, "catching_up": len(raw) >= 8192,
                      "received_at": datetime.now(timezone.utc).isoformat(), **AUTHORITY}
            if ticks or not cursor:
                # Small direct read, deliberately bypassing the slow historical cache.
                raw_bars = self.sdk.copy_rates_from_pos(name, getattr(self.sdk, "TIMEFRAME_" + tf), 0, 2)
                converted = []
                for item in raw_bars if raw_bars is not None else []:
                    values = [numeric(item[k]) for k in ("open", "high", "low", "close")]
                    if any(value is None for value in values):
                        return {"ok": False, "reason": "INVALID_PRICE_OBSERVATION", **AUTHORITY}
                    converted.append({"symbol": canonical, "timeframe": tf,
                                      "time": self.market_time(item["time"]).isoformat(timespec="seconds").replace("+00:00", "Z"),
                                      "open": values[0], "high": values[1], "low": values[2], "close": values[3],
                                      "tick_volume": int(item["tick_volume"]), "spread": int(item["spread"])})
                converted.sort(key=lambda item: item["time"])
                result["bar"] = converted[-1] if converted else None
                result["closed_bar"] = converted[-2] if len(converted) > 1 else None
            return result

    def bar(self, canonical: str, tf: str) -> dict:
        result = self.rates(canonical, tf, 1, True)
        if not result["ok"]:
            return {"bar": None, "reason": result["reason"]}
        b = result["bars"][-1]
        return {"symbol": canonical, "broker_symbol": result["broker_symbol"], "timeframe": tf, "time": b["t"], "open": b["o"], "high": b["h"], "low": b["l"], "close": b["c"], "tick_volume": b["tick_volume"], "spread": b["spread"]}

    def bundle(self, canonical: str, tf: str, count: int) -> dict:
        with self.lock:
            account = self.account()
            main = self.rates(canonical, tf, count)
            observed = {}
            if main["ok"]:
                cutoff = datetime.fromisoformat(main["bars"][-1]["t"].replace("Z", "+00:00")).timestamp() + TF_MINUTES[tf] * 60
                for frame in dict.fromkeys((tf, "M15", "H1", "H4", "D1", "W1")):
                    tape = main if frame == tf else self.rates(canonical, frame, min(count, 600))
                    aligned = [bar for bar in tape.get("bars", []) if datetime.fromisoformat(bar["t"].replace("Z", "+00:00")).timestamp() + TF_MINUTES[frame] * 60 <= cutoff]
                    if len(aligned) >= 35:
                        observed[frame] = {"as_of": aligned[-1]["t"], "indicators": indicators(aligned), "indicator_lookback": len(aligned)}
            return {"ok": bool(account["connected"] and main["ok"]), "account": account, "bars": main.get("bars", []), "broker_symbol": main.get("broker_symbol"), "live_bar": self.bar(canonical, tf) if main["ok"] else {"bar": None, "reason": main.get("reason")}, "observations": observed.get(tf), "observations_by_tf": observed, "advice": {"ok": False, "reason": "NO_ADVISORY_SOURCE"}, "positions": [], "candle_markers": {"ok": False, "reason": "NOT_MEASURED"}, **AUTHORITY}

    def spec(self, canonical: str) -> dict:
        with self.lock:
            resolved = self.resolve(canonical)
            if not resolved["ok"]:
                return resolved
            item = self.sdk.symbol_info(resolved["broker_symbol"])
            if item is None:
                return {"ok": False, "reason": "SPEC_UNAVAILABLE"}
            keys = ("digits", "point", "trade_tick_size", "trade_tick_value", "trade_contract_size", "volume_min", "volume_step", "volume_max", "swap_long", "swap_short")
            return {"ok": True, **resolved, **{key: numeric(getattr(item, key, None)) for key in keys}}

    def history(self, canonical: str, tf: str, start: str, end: str) -> dict:
        with self.lock:
            if tf not in TF_MINUTES:
                return {"ok": False, "reason": "INVALID_TIMEFRAME", "bars": []}
            try:
                first = datetime.fromisoformat(start.replace("Z", "+00:00"))
                last = datetime.fromisoformat(end.replace("Z", "+00:00"))
                first = first.replace(tzinfo=timezone.utc) if first.tzinfo is None else first.astimezone(timezone.utc)
                last = last.replace(tzinfo=timezone.utc) if last.tzinfo is None else last.astimezone(timezone.utc)
                if last <= first or (last - first).total_seconds() / (TF_MINUTES[tf] * 60) > 50000:
                    raise ValueError()
            except (ValueError, TypeError):
                return {"ok": False, "reason": "INVALID_OR_EXCESSIVE_HISTORY_WINDOW", "bars": []}
            resolved = self.resolve(canonical)
            if not resolved["ok"]:
                return {**resolved, "bars": []}
            data = self.sdk.copy_rates_range(resolved["broker_symbol"], getattr(self.sdk, "TIMEFRAME_" + tf), self.query_time(first), self.query_time(last))
            bars = []
            for i, item in enumerate(data if data is not None else []):
                observed_time = self.market_time(item["time"])
                if observed_time.timestamp() + TF_MINUTES[tf] * 60 > time.time():
                    continue
                if all(numeric(item[k]) is not None for k in ("open", "high", "low", "close")):
                    bars.append({"i": i, "t": observed_time.isoformat(timespec="seconds").replace("+00:00", "Z"), "o": float(item["open"]), "h": float(item["high"]), "l": float(item["low"]), "c": float(item["close"]), "r": "N"})
            return {"ok": bool(bars), "bars": bars, "n": len(bars), "source": "MT5_HISTORY", "broker_symbol": resolved["broker_symbol"], **AUTHORITY}


def create_app(service: TerminalService | None = None, token: str | None = None) -> FastAPI:
    terminal = service or TerminalService(server_timezone=os.environ.get("MFE_MT5_SERVER_TIMEZONE", "UTC"))
    shared_token = os.environ.get("MFE_BRIDGE_TOKEN", "") if token is None else token
    app = FastAPI(title="MFE Read-only MT5 Bridge", docs_url=None, redoc_url=None, openapi_url=None)
    active_streams = 0
    demo = DemoExecution(terminal, enabled=os.environ.get("MFE_ENABLE_MANUAL_DEMO", "false").lower() == "true")

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        host = request.url.hostname
        if host not in {"127.0.0.1", "localhost", "::1"} or request.headers.get("origin"):
            return JSONResponse({"error": "LOCAL_BRIDGE_ONLY"}, 403)
        try:
            length = int(request.headers.get("content-length", "0") or 0)
        except ValueError:
            return JSONResponse({"error": "INVALID_CONTENT_LENGTH"}, 400)
        if length > 16384:
            return JSONResponse({"error": "REQUEST_TOO_LARGE"}, 413)
        if request.url.path != "/health" and (not shared_token or not secrets.compare_digest(request.headers.get("x-mfe-bridge-token", ""), shared_token)):
            return JSONResponse({"error": "LOCAL_SESSION_REQUIRED"}, 403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request: Request, _error: RequestValidationError):
        return JSONResponse({"error": "INVALID_DEMO_INPUT" if _request.url.path.startswith("/mt5/demo/") else "INVALID_CONNECTION_INPUT"}, 422)

    @app.exception_handler(Exception)
    async def unavailable(_request: Request, _error: Exception):
        # Never serialize SDK exception strings or request bodies: they may include credentials.
        return JSONResponse({"error": "MT5_BRIDGE_REQUEST_FAILED"}, 503)

    @app.get("/health")
    def health():
        return {"ok": True, "service": "mfe-mt5-readonly", "schema": 1, "active_tick_streams": active_streams, **AUTHORITY}

    @app.get("/mt5/status")
    @app.get("/mt5/account")
    def account():
        return terminal.account()

    @app.get("/mt5/demo/status")
    def demo_status():
        return demo.status()

    @app.get("/mt5/demo/positions")
    def demo_positions():
        return demo.positions()

    @app.post("/mt5/demo/preview")
    def demo_preview(body: DemoPreviewInput):
        return demo.preview(body)

    @app.post("/mt5/demo/submit")
    def demo_submit(body: DemoSubmitInput):
        return demo.submit(body)

    @app.get("/mt5/demo/receipt")
    def demo_receipt(request_id: str = Query(min_length=20, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")):
        return demo.receipt(request_id)

    @app.post("/mt5/connect")
    def connect(body: ConnectInput):
        return terminal.connect(body)

    @app.post("/mt5/disconnect")
    def disconnect():
        return terminal.disconnect()

    @app.get("/mt5/symbols")
    def symbols(symbol: str = "XAUUSD"):
        return terminal.resolve(symbol)

    @app.post("/mt5/resolve")
    def resolve_symbol(body: SymbolInput):
        return terminal.resolve(body.symbol, body.broker_symbol)

    @app.get("/mt5/bars")
    def bars(symbol: str = "XAUUSD", tf: str = "H1", n: int = 600):
        return terminal.rates(symbol, tf, n)

    @app.get("/mt5/bar")
    def bar(symbol: str = "XAUUSD", tf: str = "M1"):
        return terminal.bar(symbol, tf)

    @app.get("/mt5/live_bundle")
    def bundle(symbol: str = "XAUUSD", tf: str = "H1", n: int = 600):
        return terminal.bundle(symbol, tf, n)

    @app.get("/mt5/stream")
    async def stream(request: Request, symbol: str = "XAUUSD", tf: str = "H1", cursor: str = ""):
        nonlocal active_streams
        if tf not in TF_MINUTES or not re.fullmatch(r"[A-Za-z0-9_.#-]{3,64}", symbol):
            return JSONResponse({"error": "INVALID_TICK_REQUEST"}, 400)
        initial = request.headers.get("last-event-id", cursor)
        if initial and not re.fullmatch(r"\d{1,12}:\d{1,16}:\d{1,8}", initial):
            return JSONResponse({"error": "INVALID_TICK_CURSOR"}, 400)
        if active_streams >= 8:
            return JSONResponse({"error": "TICK_STREAM_LIMIT"}, 503)
        active_streams += 1
        async def events():
            nonlocal active_streams
            after = initial
            heartbeat = time.monotonic()
            try:
                yield "retry: 1000\n\n"
                while not await request.is_disconnected():
                    packet = await asyncio.to_thread(terminal.ticks, symbol, tf, after)
                    if not packet.get("ok"):
                        reset = packet.get("reason") == "TERMINAL_CHANGED"
                        yield f"event: {'reset' if reset else 'status'}\ndata: {json.dumps(packet)}\n\n"
                        if reset:
                            return
                        await asyncio.sleep(1)
                        continue
                    if packet["ticks"] or not after:
                        after = packet["cursor"]
                        yield f"id: {after}\nevent: tick\ndata: {json.dumps(packet)}\n\n"
                        heartbeat = time.monotonic()
                    elif time.monotonic() - heartbeat >= 5:
                        yield ": heartbeat\n\n"
                        heartbeat = time.monotonic()
                    await asyncio.sleep(0 if packet["catching_up"] else 0.1)
            finally:
                active_streams -= 1
        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})

    @app.get("/mt5/symbol_spec")
    def spec(symbol: str = "XAUUSD"):
        return terminal.spec(symbol)

    @app.get("/mt5/history")
    def history(symbol: str = "XAUUSD", tf: str = "H1", start: str = Query(default="", alias="from"), end: str = Query(default="", alias="to")):
        return terminal.history(symbol, tf, start, end)

    @app.get("/mt5/advice")
    @app.get("/mt5/week_history")
    @app.get("/mt5/candle_markers")
    @app.get("/mt5/candle_lessons")
    @app.get("/mt5/vote_ledger")
    def not_measured():
        return {"ok": False, "reason": "NO_RESEARCH_SOURCE", **AUTHORITY}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("MFE_BRIDGE_PORT", "8791"))
    uvicorn.run(app, host="127.0.0.1", port=port, access_log=False, log_level="critical")
