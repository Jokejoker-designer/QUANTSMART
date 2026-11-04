# Project status and remaining work

Status reviewed: **4 November 2026**. QUANTSMART is an open-source research preview
under Apache-2.0, maintained by Phan Trần Anh Quân.

## Release and installation

The `v1.2.0-rc.7` synchronization release includes the completed-candle availability
correction documented in [the timing audit](docs/AVAILABILITY_TIMING_FIX.md).
Its Windows ZIP records the exact source commit and approved file hashes in
`PORTABLE_MANIFEST.json`. Release assets include checksums. Older packages may
contain different research behavior even when their UI looks similar.

The default address is **http://localhost:5090/**. A busy port causes startup to
stop; the launcher does not silently choose another port. Source setup and portable
installation share that default. Local data and configuration are separate from
the distributed package. Preserve them when upgrading an existing installation.

## Implemented, with bounded verification

- Local CSV storage/reopen, chart aggregation and a streaming local XAUUSD M1
  importer. Gaps are retained; incomplete higher-timeframe buckets are omitted.
- L1–L6 editors and executable JSON import contracts, Strategy Cards and BEAST
  composition. Valid definitions remain unvalidated trading hypotheses.
- Canonical research simulation, explicit fill/cost assumptions, ablation and an
  observed-only trial ledger. The ledger cannot reconstruct prior or external trials.
- Decision/outcome journals and Card/BEAST activity diagnostics. Custom gate
  attribution remains aggregate where the evaluator supplies no individual facts.
- Read-only MT5 market-data integration and actual broker-deal chart markers.
- A separately enabled, opt-in MT5 Demo Card runner for supported rules. SDK and
  engine fixtures are separate from native broker acceptance.

Read [verification](docs/VERIFICATION.md), [layer validation](docs/LAYER_VALIDATION.md),
[methodology](docs/QUANT_METHODOLOGY_AUDIT.md) and
[Demo execution](docs/DEMO_AUTOMATION.md) for the scope of each recorded check.
Finite software tests do not establish strategy edge or future profitability.

## Open acceptance and research work

- [#4](https://github.com/Jokejoker-designer/QUANTSMART/issues/4): independently
  labeled rejection measurements. Geometry fixtures are not blinded human labels.
- [#25](https://github.com/Jokejoker-designer/QUANTSMART/issues/25): close visual
  acceptance of actual broker entry/close/protection markers.
- [#26](https://github.com/Jokejoker-designer/QUANTSMART/issues/26): complete an
  automatically generated Card entry and exit on a native Demo account, with
  broker receipts. A manual round trip does not satisfy this acceptance.
- Recompute Atlas and Conductor reports made before the availability correction.
- Verify original large-history source hashes and lineage independently of local
  projections; define session calendars and historical broker timezone behavior.
- Extend causal, gap and candle-revision coverage; compare against an independent
  engine and retain untouched chronological evaluation samples.

## Blueprint recovery: partial implementation

| Work package | Current scope | Still incomplete |
| --- | --- | --- |
| WP1: source collection | Backend tick recorder, stored evidence and bounded reconciliation | Long-duration continuity, total tick completeness, session calendar and historical DST |
| WP2: measurements | Completed quote windows, strictly earlier baselines and frozen experimental declarations | Validated thresholds, regime/multi-era coverage and predictive qualification |
| WP3: outcomes | Explicit pending, unknown, invalid-source and observed-event states | Purged OOS validation, missed-event recall, lead-time skill and calibration |
| WP4: descriptive versions | Source/code/config hashes, selection, rollback and quarantine | Fitted strategy coefficients and authenticated manager promotion |
| WP5: workspace integration | Shared snapshots, similar-window rankings and distribution comparisons | Qualified recorded L1/L2 inputs and validated drift thresholds |

These are descriptive research tools. They do not measure exchange-wide order
flow or certify a Black Swan predictor. See [recorded observer](docs/RECORDED_OBSERVER.md).
Structural setup lifecycle, durable terminal latching and calibrated QI/MAM
probabilities are not claimed as completed. Historical Drive designs are not
automatically current or production-ready code; see [Drive reassessment](docs/DRIVE_REASSESSMENT.md).

## Next priorities

1. Keep release, installed build and documented source provenance aligned.
2. Close native Demo/chart acceptance with attributable broker evidence.
3. Establish a common research protocol, blinded labels, controls and independent
   chronological validation before stronger statistical claims.
4. Document architecture, design history, contribution and maintenance governance.
   This status page is not a complete contributor or succession policy.

Research remains `SHADOW_ONLY / NO_DECISION / live_apply_allowed=false`.
The separate execution adapter is Demo-only and requires explicit local opt-in.
Real-account execution, QTQ integration and automatic strategy promotion are absent.
The [tutorial index](docs/TUTORIALS.md) is the canonical course entry point;
Drive access remains controlled by the owner.
