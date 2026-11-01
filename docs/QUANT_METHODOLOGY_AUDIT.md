# Quantitative methodology audit

Audit date: 1 November 2026. Baseline: `e17448af4e1f4f93414b8ee512600b9e1bc2e634`.
Scope: the public QUANTSMART research engine, measurement implementations,
leave-one-out ablation and backend search provenance. No broker orders were sent.
`SHADOW_ONLY / NO_DECISION / live_apply_allowed=false` remains the authority boundary.

## Assessment of the two recommendations

Both recommendations are useful experimental controls. Neither establishes that
an arbitrary Strategy Card has a profitable edge.

| Recommendation | Assessment and observed result |
| --- | --- |
| Test entries with a fixed holding period against random bars within the same regime | A useful event study. Pin the regime, direction, entry time, sample size, costs, horizons and random seeds first. Preserve chronological holdouts and compare exposure and overlapping events. This audit does not claim to have validated every Card against matched random entries. |
| A trigger that fails one fixed-horizon test can never be rescued downstream | Too strong. Equal terminal returns do not imply equal paths. The regression suite constructs a signal path `100 -> 110 -> 100` and a flat control path `100 -> 100 -> 100`: terminal returns match, but a causal profit target at 105 distinguishes them. This is a mathematical counterexample, not trading evidence. |
| Test the same exit on random entries | Useful to separate contributions. A positive result can also reflect drift, exposure, direction bias or favorable costs. Compare random-entry exits with random-entry fixed holds over the same eligible sample and repeat seeds. |
| Remove or replace one layer at a time | Useful, provided the intervention really removes that layer. A custom-trigger removal bug was reproduced and fixed. Small marginal changes do not prove a layer is decorative: components can be redundant or interact. |
| Compare full-series measurements with prefix-only evaluation | Appropriate causality check. 41,280 comparisons passed in this suite. A mismatch would require investigation: look-ahead, warm-up, state or implementation differences are possible causes. Passing finite tests is not a proof for all formulas or datasets. |
| Check exit assumptions before attributing edge | Confirmed defect: design-bar OHLC used the stop/target level after an open gap had already crossed it. The M1 resolver handled gaps, but the coarse path did not. Both paths now use open-before-extremes resolution. |
| Wick ratios explode on zero-range bars | Not reproduced on valid OHLC inputs. The existing zero-range guard returns 0. Near-zero ranges can receive a high bounded score, which is a resolution/sensitivity question rather than infinity. |
| Compare wick rankings with 20 visually labeled bars | Sensible initial semantic check, still incomplete. Twenty engineered geometry fixtures pass; they are not 20 independently labeled real examples. See issue #4. |
| Log how many variants were tried | Confirmed provenance gap. A durable backend journal now records observed requests and canonical simulator starts, including fold/intervention calls. It explicitly does not reconstruct past or external trials. |

## Confirmed defects and fixes

### Gap fills, ambiguous costs and the final bar — issue #1

With entry 100, stop 98 and the next candle opening at 95, the old coarse path
recorded an exit at 98 and gross -1R. It now records the first observed open, 95,
and gross -2.5R before costs. Long/short stop gaps, target gaps, ordinary touches,
ambiguous candles and the final available candle are covered by regression tests.
The old loop skipped existing-position exits on the last candle; it now processes
them without inventing a subsequent entry fill.

The default ambiguous policy remains marked and conservative. An explicit
optimistic policy is tested separately. Conservative M1 ambiguity now also applies
the stop-exit cost penalty. Unambiguous stop-first/target-first bounds equal the
actual gross result instead of inventing an alternate target result.

OHLC still cannot reveal the sequence of both extremes in a candle, queue priority,
partial fills or actual broker slippage. The shared resolver is named
`resolveIntrabarM1`; the coarse path uses one design candle and retains
`m1Resolved=false` with a `DESIGN_` outcome prefix. It does not claim M1 evidence.
The open-gap convention agrees with the execution model documented by
[Backtrader](https://www.backtrader.com/docu/order-creation-execution/order-creation-execution/).

### Custom-module ablation and frozen context — issue #2

On a deterministic 2,400-bar fixture with custom triggers A and B, the old
without-A row reported 48.00 OOS R and 132 trades, identical to the full Card.
An actual B-only run produced 52.10 OOS R and 90 trades. The intervention had
removed the module ID but retained its executable custom definition.

Each intervention now filters both IDs and executable custom modules. The test
compares the without-A row directly with a separately constructed B-only run.
Native-trigger detection uses the shared census, including `psl_sweep` and the
other families. Symbol, cost configuration and coefficient profile are frozen
across interventions. A Card declaring a finer execution timeframe is rejected
for this design-bar diagnostic instead of silently changing its execution path.
Removing the last trigger remains explicitly marked as a different EMA fallback.

A second aggregation defect excluded every window with fewer than five trades
from net R, while still displaying its trades. A sparse three-window fixture
reported 0R even though the windows incurred losses. Net R now includes all
windows, preserving the sample across interventions. Positive-fold fractions
retain the existing minimum-trade rule; fewer than three qualifying windows
cannot set the heuristic positive/consistent baseline flag.

`NEUTRAL` is a heuristic marginal-change label, not statistical significance or
proof of no role. The existing positive/consistent baseline flag is also a
heuristic, not a selection-adjusted edge test. Interactions are non-additive.

### Search provenance — issue #3

`GET /api/research/trials` exposes the owner-local journal summary.
In the UI, open **System -> Debugger -> Search trials (observed only)**.
The file is `search-trials.jsonl` inside the selected workspace directory.

It retains accepted non-market requests, cache reuse, observed simulator starts,
configuration hashes and per-module definition-context counts. Fold and ablation
calls are instrumented at the canonical simulator, not inferred from top-level
job counts. An accepted request remains recorded if its job fails or is cancelled;
terminal success/failure totals are not provided by this journal.

Frozen custom-library contents contribute to context hashes, so editing a saved
measurement without changing its ID does not disappear from provenance. Unrelated
library edits can also increase context counts. Counts are not independent trials.
No raw bars, credentials or account details are added to the journal. Restart
replays the journal; corrupt or oversized history fails explicitly rather than
silently resetting counts. Cache/receipt pruning does not prune this history.

Coverage is incomplete: prior trials, browser edits never submitted, direct
external calls and abrupt termination before an observation reaches the journal
can be missing. `historyComplete=false`, `lifetimeTrialCount=null` and
`multipleTestingAdjustment=NOT_COMPUTED_INCOMPLETE_SEARCH_HISTORY` are deliberate.
A count alone is not a Deflated Sharpe Ratio or a correction for selection bias;
see the primary [Deflated Sharpe Ratio paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf).

## Measurement checks and remaining human evidence — issue #4

The suite evaluates every prefix of a 320-bar deterministic, nonconstant valid
OHLC series against the corresponding full-series output:

- 77 computable primitive blocks, with default parameters and supplied inputs.
- 8 feature graphs (3 templates and 5 base features).
- 2 expanding normalizers, 39 AST operations and 3 seeded macro templates.

All 41,280 comparisons passed at the specified numerical tolerance. This covers
these inputs, parameters, operations and warm-up paths. It does not establish
causality for every user-authored graph, custom parameter, imported dataset or
unexecuted branch. The comparison follows the type of sliced-baseline inspection
in [Freqtrade's look-ahead analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/).

Wick-template observations on valid OHLC:

- Zero range (`O=H=L=C=100`) returns 0.
- A nonzero-range doji (`O=C=100, H=101, L=99`) returns 0.25 for the combined
  wick-rejection template. A doji is not synonymous with a zero-range bar.
- A tiny-range fixture returns about 0.648, finite and inside [0,1]. Scaling a
  geometric ratio alone does not make it informative above tick resolution.
- Ten engineered lower-wick examples rank above ten weak examples. This checks
  formula geometry, not human agreement, calibration or predictive usefulness.

A tick floor was not guessed or retrofitted to improve results. A broker's actual
minimum price increment and an agreed treatment of sub-resolution bars are needed.
To finish issue #4, freeze the score and sampling plan; have a person label 20 real
bars without seeing the score; retain bar IDs, rejection labels and reasons;
then publish rank agreement and disagreements. Predeclare zero-range handling,
tick-floor candidates and sensitivity checks. Do not tune the score on these
same 20 bars and present the result as independent validation.

## Local-history regression impact

No data was downloaded or installed. Two existing local XAUUSD files were read
without modification. Their metadata identifies them as `sim_wide`, which does
not independently establish broker provenance. Three fixed 5,000-bar windows
(first, middle, last) per timeframe and two frozen trigger configurations were
compared under the same provisional cost specification and fixed-R sizing.
These are engineering comparisons, not out-of-sample strategy qualification.

| TF | Window | Trigger | Old net R | New net R | New gap exits |
| --- | --- | --- | ---: | ---: | ---: |
| H1 | first | `trend_pullback` | 6.2271 | 8.7811 | 2 |
| H1 | first | `sweep_reclaim` | -16.0550 | -14.0381 | 2 |
| H1 | middle | `trend_pullback` | 40.9286 | 40.9286 | 0 |
| H1 | middle | `sweep_reclaim` | -86.3681 | -88.3369 | 3 |
| H1 | last | `trend_pullback` | 43.9705 | 42.6728 | 2 |
| H1 | last | `sweep_reclaim` | 9.2450 | 7.0475 | 3 |
| M15 | first | `trend_pullback` | -46.4529 | -47.3375 | 3 |
| M15 | first | `sweep_reclaim` | -43.1469 | -43.1469 | 0 |
| M15 | middle | `trend_pullback` | -14.7413 | -15.2543 | 2 |
| M15 | middle | `sweep_reclaim` | -51.5441 | -51.5441 | 0 |
| M15 | last | `trend_pullback` | 55.6997 | 55.5676 | 1 |
| M15 | last | `sweep_reclaim` | 43.0415 | 43.8881 | 1 |

Nine of twelve runs changed. Changes can increase or decrease modeled returns:
correct gap treatment applies to favorable as well as adverse gaps. The aggregate
JSON contains source hashes and window dates, not raw market history.

## Reproduce and interpret

```sh
npm run setup -- --historical --no-browser
npm run test:quant
npm run test:public
npm run test:bridge
```

The public suite includes a real built server/worker test: durable trial counts,
cache-request counts, each ablation fold, restart readback and no raw bars in the
journal. The ledger suite also checks invalid-event refusal and corrupt-history
refusal. Test fixtures are synthetic and confined to tests.

To reproduce the old gap failure in a checkout containing the baseline commit:

```sh
node tests/quant-methodology.test.mjs --baseline
```

That command is expected to fail with old exit 98 versus expected 95. To repeat
the optional read-only history comparison with your own authorized local files:

```sh
node tests/quant-history-impact.mjs --data /path/to/local/data/sim
```

It requires XAUUSD H1/M15 files and the pinned baseline Git object. It prints only
aggregate results and hashes. No download or dataset installation occurs.

Existing receipts remain historical evidence, not results from this engine.
The worker hash changes, so earlier publication receipts require revalidation.
Version 1.1.0 contains the old engine; use the patch release containing this audit.
This work does not validate live trading, every Card, arbitrary regime filters,
entry-only/exit-only randomized controls or a complete lifetime trial census.

## Tracking

- [#1: gap/final-bar execution](https://github.com/Jokejoker-designer/QUANTSMART/issues/1).
- [#2: ablation interventions and context](https://github.com/Jokejoker-designer/QUANTSMART/issues/2).
- [#3: durable search provenance](https://github.com/Jokejoker-designer/QUANTSMART/issues/3).
- [#4: blinded human rejection labels](https://github.com/Jokejoker-designer/QUANTSMART/issues/4), remains open pending actual human evidence.
