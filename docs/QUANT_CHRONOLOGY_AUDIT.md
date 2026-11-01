# Entry chronology and execution-truth audit

Date: 1 November 2026. Audited baseline: `05cdaeb28c302115d0daa1d6b35d7b59582137d5`.
Patch release: 1.1.2. Scope: issues [#6](https://github.com/Jokejoker-designer/QUANTSMART/issues/6),
[#7](https://github.com/Jokejoker-designer/QUANTSMART/issues/7) and
[#8](https://github.com/Jokejoker-designer/QUANTSMART/issues/8).

All three findings in the submitted review were reproduced. The earlier
measurement-prefix tests did not cover the engine's next-open stop construction,
the entry-candle execution sequence or metadata-based truth promotion. Passing
those measurement tests did not establish that the whole engine was causal.

## Next-open risk used future candle data

The signal at completed H1 bar 40 fills at bar 41 open 100. With that open and
all signal-time history fixed, changing only bar 41 high/low/close from
101/99/100 to 125/75/115 changed the old entry plan from `risk=2.00 sl=98.00`
to `risk=5.43 sl=94.57`. The future candle's ATR was being read at its open.
The Auto R:R slices also included that candle's future extremes.

The engine now uses `atr[i]` from the completed signal candle and the last five
and twenty completed candles ending at `i`. The observed next open can affect
the fill price and plan eligibility, but its future high, low and close cannot.
An Auto R:R target already behind a gapped fill is rejected instead of converting
an adverse direction into a positive reward with `Math.abs`.

Regression coverage mutates the future candle under fixed-ATR and Auto R:R plans,
in both directions, with and without the minimum-stop floor. All eight mutation
cases preserve their entry plans after the fix. The representative Auto R:R plan
is `risk=1.26 sl=98.74 tp=120.00` before and after the future-data mutation.
Additional gap cases check that an invalid target is skipped.

## Intrabar entries missed exits in the same design candle

The old loop resolved an existing position, opened a new intrabar position, then
advanced to the next design candle. In the fixture, a post-entry M1 stop in H1
bar 41 was recorded as an exit in bar 42 with gross -2R. The M5 signal's opening
time, 17:00, was recorded as its fill time even though its close was available
at 17:05.

The repaired sequence is explicit:

1. A completed execution candle creates a signal at its close boundary.
2. The next observed child open supplies the modeled fill, including any gap.
3. The same exit/accounting function consumes only the remaining child candles
   inside that design candle.
4. If the position survives, later design candles continue its execution.

The fixture now fills at 17:05 and records the stop interval at 17:05 in bar 41,
with gross -1R. `exit_time` identifies the observed child-candle interval for a
path exit. It does not identify the exact tick inside that interval. Close-based
exit rules use the design candle's close availability time.

Pre-entry extremes are excluded. Excursion tracking stops at the consumed exit
child instead of reading later design-candle extremes. An inherited position
that exits later in a candle cannot cause the engine to replay an earlier entry
signal inside that candle. This conservative scheduler permits at most one new
intrabar entry per design candle; it does not implement multiple sequential
intrabar reentries.

An intrabar entry requires a continuous post-entry suffix through the design
candle end. Missing children fail with `INTRABAR_POST_ENTRY_PATH_INCOMPLETE` rather
than substituting the whole candle and inventing chronology. When an engine
caller supplies execution OHLC children without M1, that coarser suffix can be
used and its outcomes retain `m1Resolved=false` and an `EXECUTION_` prefix.

The provisional ATR slippage scale is frozen at entry for both entry and exit
costs. A future exit candle can no longer retrospectively set the modeled entry
slippage scale. Spread/session and financing still use the observed fill and exit
intervals. This is a fixed-ATR cost assumption, not measured broker slippage.
Daily counters reset before processing that day's exits. Event timestamps reflect
signal availability and the observed exit interval.

Regression coverage includes twelve direction/outcome combinations: long/short
stop, target, ambiguity, pre-entry-only touch, final design candle and boundary
fill gap. Extra cases cover optimistic ambiguity, incomplete paths, coarser
execution paths, inherited positions, event order and mutation after an exit.
Both directions also run through the actual M1 resampling facade, not only the
low-level simulator.

## Tick availability falsely certified exact execution

At the baseline, `hasTickBidAsk=true` alone made `applyBrokerCalibration` return
`pathExact=true`. An ordinary OHLC run then reported `TICK_PATH_EXACT` without
consuming any bid/ask ticks. The M1 facade had the same promotion.

Calibration metadata now calibrates broker inputs independently of path precision.
Both facades report `pathExact=false`. The design-bar facade uses
`HTF_HEURISTIC`; the M1 facade uses `M1_PATH_APPROX`. Calibration notes state that
reported tick availability was not executed as tick replay. Broker specification
calibration remains available. The combined cost/path state cannot become
`FULLY_CALIBRATED` without an exact executor.

The truth-contract builder also rejects `TICK_PATH_EXACT` with
`TICK_REPLAY_NOT_IMPLEMENTED`. A future tick engine must introduce an actual
executed tick-path contract and provenance, rather than reuse an availability flag.

True/false/absent flag cases are checked through both facades. Built-server tests
also submit the misleading flag through the real worker API and verify the returned
result, calibration state and manifest. No tick-exact engine was added by this fix.

## Historical regression impact

Two existing local XAUUSD files were read without modification. Their metadata
says `sim_wide`; broker provenance was not independently established. The same
first/middle/last 5,000-bar windows and two frozen trigger configurations used in
the previous engineering comparison were selected before this comparison. Costs
use `XAUUSD_PROVISIONAL_SPEC` and fixed-R sizing. No parameter search or data
installation was performed.

| TF | Window | Trigger | Old trades | New trades | Old net R | New net R |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| H1 | first | `trend_pullback` | 213 | 225 | 8.7811 | -56.8957 |
| H1 | first | `sweep_reclaim` | 198 | 212 | -14.0381 | -22.6117 |
| H1 | middle | `trend_pullback` | 193 | 200 | 40.9286 | -23.9404 |
| H1 | middle | `sweep_reclaim` | 235 | 261 | -88.3369 | -156.8025 |
| H1 | last | `trend_pullback` | 179 | 189 | 42.6728 | 2.7145 |
| H1 | last | `sweep_reclaim` | 237 | 260 | 7.0475 | -83.1645 |
| M15 | first | `trend_pullback` | 217 | 202 | -47.3375 | -126.6067 |
| M15 | first | `sweep_reclaim` | 206 | 227 | -43.1469 | -116.9601 |
| M15 | middle | `trend_pullback` | 179 | 180 | -15.2543 | -67.2383 |
| M15 | middle | `sweep_reclaim` | 221 | 244 | -51.5441 | -139.5345 |
| M15 | last | `trend_pullback` | 183 | 193 | 55.5676 | -4.3976 |
| M15 | last | `sweep_reclaim` | 224 | 244 | 43.8881 | -18.6358 |

All twelve net results decrease in this comparison. These differences include
the causal entry-level fix, target eligibility, entry-time ATR cost convention
and timestamp/counter corrections. This table does not isolate the contribution
of each change. The direct future-mutation tests isolate the entry look-ahead.
These engineering runs are not strategy qualification or proof of a remaining edge.

The submitted +92.38R claim did not include the complete Card, dataset, window,
cost configuration and receipt needed to reproduce that exact number. It was not
independently verified. It must not be presented as validated profitability.

## Reproduce

```sh
npm run setup -- --historical --no-browser
npm run test:quant
npm run test:public
npm run test:bridge
```

The `test:quant` command exercises synthetic test-only fixtures and requires no
private history. The public suite also tests the built worker and persistence.
Bridge tests use SDK fixtures, not actual broker orders.

To repeat the three failures against the pinned baseline in a Git checkout
containing that commit:

```sh
node tests/quant-chronology.test.mjs --baseline --report
```

Exit 1 is expected, with a failure in each of the three groups. The same command
without `--baseline` must pass. Optional read-only history comparison:

```sh
node tests/quant-history-impact.mjs --base 05cdaeb --data /path/to/authorized/data/sim
```

[Machine-readable observations](QUANT_CHRONOLOGY_RESULTS.json) include the before
and after cases, source hashes and selected window dates. They contain no raw
history, account details or credentials.

## Limits and migration

Versions 1.1.0 and 1.1.1 contain these defects. Rerun saved experiments against
1.1.2 and obtain fresh receipts. The engine is stamped `realistic-sim-1.1.2` independently of saved configuration version strings. The bundled worker hash changes, so old receipts
remain historical evidence rather than validation against this engine.

OHLC and M1 still leave within-candle order ambiguous. The explicit ambiguity
policy remains in force. Tick-exact fills, queue priority, partial fills and
actual broker execution are not established. Other untested paths may contain
additional defects; the earlier 41,280 measurement comparisons remain scoped to
their documented inputs. Independent human rejection labels remain pending in
[issue #4](https://github.com/Jokejoker-designer/QUANTSMART/issues/4).

Research authority remains `SHADOW_ONLY / NO_DECISION / live_apply_allowed=false`.
No broker order path was changed or exercised by this audit.
