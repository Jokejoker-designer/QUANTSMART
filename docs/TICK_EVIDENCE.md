# Local tick evidence recorder

The recorder runs inside the existing Python market-data bridge and uses the same TerminalService/SDK connection. It does not depend on browser SSE subscribers and has no order, position or strategy API.

Open Assets → Recorded market evidence. Connect the terminal, then choose **Start / resume recording** for the selected asset. Stop recording waits for any in-flight batch before acknowledging. The last explicit collection intent is saved. On a service restart, an enabled recorder resumes only the same source. It can reattach read-only to an already-running MT5 terminal; it does not enter credentials or start a trading runner. A changed source halts recording until the operator explicitly starts again.

Storage is `.mfe-state/tick-evidence/quotes.sqlite3` beside the installed application, or the directory set by `MFE_TICK_EVIDENCE_DIR`. SQLite uses WAL and FULL synchronous commits. An OS file lock permits one recorder owner per database. Each batch commits quotes, cursor and initial source binding together. Repeated source timestamp/ordinal rows must have identical values; conflicting retries are refused. Reading or checking integrity verifies stored hashes.

Source identity is a salted hash of account/server/terminal path, symbol mapping and timestamp contract. Diagnostics expose the source hash, broker label, symbols and timezone, never the login, balance, password or salt. Raw quote records retain Bid, Ask, Last, flags, optional volume, original encoded source milliseconds, source ordinal, normalized UTC milliseconds and local receive time. MT5 tick volume is not exchange trade volume or signed order flow.

The default limit is 250,000 quotes and 256 MiB. Capacity refusal never deletes old evidence. An observed interval over 30 seconds is recorded as **UNKNOWN_QUOTE_INTERVAL**, not a frozen feed, outage or confirmed market closure. Repeated timestamps can be legitimate distinct quotes. A source reset, invalid quote, non-progressing backlog overflow, clock rewind or storage conflict is explicitly reported; the recorder does not fabricate continuity or silently skip a rejected batch.

Assets owns start/stop and source coverage. KIDI Events shows separate tick-recorder integrity while retaining the OHLC witness. Debugger offers sanitized recorded-evidence status. Replay and integrity links read the same database, not browser storage.

The APIs are same-origin, loopback-only through the existing token-protected gateway:

- GET `/api/mt5/evidence/status`
- POST `/api/mt5/evidence/start` with `{ "symbol": "XAUUSD" }`
- POST `/api/mt5/evidence/stop` with `{}`
- GET `/api/mt5/evidence/replay?source_id=...&after_ms=...&limit=1000`
- GET `/api/mt5/evidence/integrity`

Replay is bounded at 10,000 records per request. Use the returned next_cursor fields on the next request. The exclusive UTC/raw-time/ordinal cursor preserves same-millisecond multiplicity across page boundaries. Stored integrity is not proof of complete broker tick history. Native duration/reconnect tests and their accepted/rejected/cursor counts are reported separately.

Collection alone leaves qualification **UNCERTIFIED**. No predictive score, calibrated probability, coefficient override, memory promotion or strategy input is created by WP1. Backtest signals, costs and order behavior remain unchanged.

The observer extension and bounded native reconciliation are documented in [Recorded quote observations](RECORDED_OBSERVER.md). Explicit terminal disconnect now revokes recorder resume intent.
