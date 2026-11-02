"""Read-only broker execution evidence. Submitted requests are never fills."""

import math
from datetime import datetime, timezone, timedelta


def read_demo_deals(
    terminal, symbol: str, start: str = "", end: str = "", limit: int = 500
):
    scope = {
        "source": "MT5_DEMO_DEAL_HISTORY",
        "read_only": True,
        "live_apply_allowed": False,
    }
    with terminal.lock:
        account = terminal.account()
        if not account["connected"] or account["account_kind"] != "DEMO":
            return {
                "ok": False,
                "reason": "DEMO_ACCOUNT_REQUIRED",
                "deals": [],
                **scope,
            }
        identity = (account.get("account_id"), account.get("server"))
        generation = terminal.generation
        try:
            now = datetime.now(timezone.utc)

            def stamp(value, default):
                if not value:
                    return default
                result = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if result.tzinfo is None:
                    raise ValueError("DEAL_WINDOW_REQUIRES_UTC_OFFSET")
                return result.astimezone(timezone.utc)

            finish = min(stamp(end, now), now)
            begin = stamp(start, finish - timedelta(days=14))
            if (
                not 1 <= limit <= 2000
                or not 0 < (finish - begin).total_seconds() <= 90 * 86400
            ):
                raise ValueError("INVALID_DEAL_WINDOW")
            resolved = terminal.resolve(symbol)
            if not resolved["ok"]:
                raise ValueError(resolved.get("reason", "SYMBOL_NOT_FOUND"))
            name = resolved["broker_symbol"]
            native = terminal.sdk.history_deals_get(
                terminal.query_time(begin), terminal.query_time(finish)
            )
            if native is None:
                raise ValueError("BROKER_DEAL_HISTORY_UNAVAILABLE")
            unique = {}
            for row in native:
                if row.symbol != name or int(row.type) not in (0, 1):
                    continue
                price, volume = float(row.price), float(row.volume)
                if not all(math.isfinite(x) and x > 0 for x in (price, volume)):
                    raise ValueError("INVALID_BROKER_DEAL")
                native_ms = int(getattr(row, "time_msc", 0) or int(row.time) * 1000)
                epoch_ms = (
                    int(terminal.market_time(native_ms // 1000).timestamp()) * 1000
                    + native_ms % 1000
                )
                when = datetime.fromtimestamp(epoch_ms / 1000, timezone.utc)
                if not begin <= when <= finish:
                    continue
                entry = {0: "ENTRY", 1: "EXIT", 2: "REVERSAL", 3: "EXIT_BY"}.get(
                    int(row.entry), "UNKNOWN"
                )
                unique[str(row.ticket)] = {
                    "id": str(row.ticket),
                    "orderId": str(row.order),
                    "positionId": str(row.position_id),
                    "symbol": symbol,
                    "brokerSymbol": name,
                    "time": when.isoformat(timespec="milliseconds").replace(
                        "+00:00", "Z"
                    ),
                    "timeMs": epoch_ms,
                    "price": price,
                    "volume": volume,
                    "side": "BUY" if int(row.type) == 0 else "SELL",
                    "entryKind": entry,
                    "source": "MT5_DEMO_DEAL_HISTORY",
                }
            rows = sorted(unique.values(), key=lambda x: (x["timeMs"], int(x["id"])))
            directions = {}
            for row in rows:
                if row["entryKind"] in ("ENTRY", "REVERSAL"):
                    directions[row["positionId"]] = row["side"]
                row["positionSide"] = directions.get(row["positionId"])
            current = terminal.sdk.account_info()
            if (
                current is None
                or int(current.trade_mode) != terminal.sdk.ACCOUNT_TRADE_MODE_DEMO
                or (str(current.login), str(current.server)) != identity
                or generation != terminal.generation
            ):
                raise ValueError("DEMO_ACCOUNT_CHANGED")
            return {
                "ok": True,
                "deals": rows[-limit:],
                "brokerSymbol": name,
                "truncated": len(rows) > limit,
                "generation": generation,
                "from": begin.isoformat(),
                "to": finish.isoformat(),
                "serverTimezone": terminal.server_timezone_name,
                **scope,
            }
        except ValueError as error:
            return {"ok": False, "reason": str(error), "deals": [], **scope}
        except Exception:
            return {
                "ok": False,
                "reason": "BROKER_DEAL_HISTORY_UNAVAILABLE",
                "deals": [],
                **scope,
            }
