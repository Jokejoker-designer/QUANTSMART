# Demo execution and broker chart evidence

The requested execution scope is automated Strategy Cards on MT5 Demo accounts only. Research jobs retain SHADOW_ONLY / NO_DECISION. This adapter does not provide a real-account execution route or connect to QTQ.

## Execution contract

- Start requires an explicitly selected, saved Card and broker-valid fixed lot size. The backend freezes the Card, referenced definitions and coefficients, and reports their hash.
- One runner, one instrument and one owned position at a time. The account identity and terminal generation are bound at start and checked immediately before each broker operation.
- Start records the current last closed candle and does not trade old signals. Each subsequently closed candle is evaluated once; stale signals are not replayed after interruption.
- Card entry and close decisions use the existing causal evaluator. A last-closed-bar probe can inspect a candidate without fabricating a future candle. Existing backtest behavior must remain identical when the probe is absent.
- Initial support is design-close execution with equal design and execution timeframes. Unsupported intrabar, performance-memory or protective-stop mutation behavior is explicitly rejected; it is never replaced with an EMA fallback or an unconditional BUY/SELL.
- Broker SL/TP is attached to the entry from the Card's risk geometry. Close rules operate on the runner's actual owned position. A stop does not imply a close: the UI identifies any remaining broker position.
- Unknown broker results halt the runner; no blind resend. A durable intent precedes IPC send. Restart never resumes trading automatically.
- Unresolved requests survive restart in the local journal. **I checked MT5; reconcile the stopped runner** requires the original account and a flat account with no pending orders. It does not close positions or cancel orders.
- Account changes, real/contest/unknown accounts, invalid quotes, gaps, missing definitions, external position conflicts and invalid lot/stop specifications fail closed.

## Chart evidence

Broker markers come from MT5 deal history, not submitted requests or simulated trades. ENTRY, EXIT, REVERSAL and EXIT_BY are distinct. A SELL deal that closes a BUY position is not presented as a new short entry. Every marker retains its actual UTC execution time, price, volume and position lineage. Simulated markers are labeled separately.

Deal history errors are unavailable evidence, not an empty successful history. The chart maps deals to actual candle intervals without placing weekend or out-of-range executions on an unrelated candle.

## Local acceptance already observed

The user manually opened and closed one Demo GOLD BUY position of 0.03 lots. Native history contains an entry at 3902.69 and an exit at 3903.71 sharing the same position identifier; refreshed positions are empty. This verifies the manual round trip, not the new automated runner.

The current broker tick clock was measured at UTC+02:00 over five fresh samples. The local connector was configured as Etc/GMT-2 for this acceptance session. That fixed current offset does not certify historical DST behavior; use the broker's verified historical timezone rules for a historical import.

## References

- [MetaQuotes deal history API](https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py)
- [MetaQuotes deal properties](https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties)
- [MetaQuotes order submission API](https://www.mql5.com/en/docs/python_metatrader5/mt5ordersend_py)

The implementation has passed the checks listed below. Visual acceptance and a live automatic Card trade remain pending.

## Current verification scope

- The default simulator output matches the SHA-256 measured from unmodified commit `391b6a0` on a 1,200-bar deterministic fixture. The entry adapter matches the canonical trigger/gate evaluator on 150 chronological prefixes. The custom L1–L6 dependency chain is also evaluated, and unavailable account-history metrics are refused.
- SDK fixture tests cover Demo-only account binding, account changes, lease expiry, exact position ownership, duplicate requests, tick-grid prices, entry limits, pending orders, unknown results and disabled defaults. No fixture test sends a broker transaction.
- HTTP runner checks cover loopback/origin/JSON boundaries, read-only preflight, concurrent polling, claimed-candle idempotence, durable intent before send, restart and unresolved-result reconciliation.
- The native `/demo/deals` endpoint returned the two manually confirmed GOLD deals with UTC timestamps and ENTRY/EXIT classifications. Native Card preflight returned `armed=false` and `sendsOrders=false`.
- Browser access became unavailable before the new marker rendering and runner controls could receive visual acceptance. A live automatic Card trade has not been accepted. Do not interpret the manual round trip as automatic-runner acceptance.

## Use the preview

1. Open your own MT5 Demo account and attach it through QUANTSMART.
2. In the local `.env`, set `MFE_ENABLE_CARD_DEMO=true`, then restart the launcher. Distributed defaults keep it off.
3. In Cockpit, choose a saved Card and open **MT5 Demo**.
4. Select **Check Card support**. It checks definitions and the current closed tape without arming a session or sending an order.
5. Enter a broker-valid fixed volume and a maximum entry count. Read the authorization checkbox, then select **Start Card on Demo** yourself.
6. Keep the local service running. The runner waits for a newly closed candle; Start does not replay an old signal.
7. Use **Stop Card runner** to prevent further requests. Stop does not liquidate an existing broker position. Use **Manual Demo ticket & positions** or MT5 to manage that position.

The initial execution scope is design-close with equal design/execution timeframes, fixed lots, static initial broker SL/TP, and supported native/custom trigger, gate and close rules. Dynamic protective-stop changes, modeled trade-memory modules, intrabar execution and account-history metrics are refused. `L6` is reference geometry; adding a zone does not define an order or replace a Card's stop model. Check support before assuming that a saved BEAST or Card can run through this adapter.

Research responses remain `SHADOW_ONLY / NO_DECISION / live_apply_allowed=false`. The separate execution adapter is `CARD_DEMO_ONLY`; its order path is changed in this preview. Real-account execution and QTQ integration remain absent.
