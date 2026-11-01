# CSV and strategy-control validation

Date: 1 November 2026. Release candidate: 1.2.0-rc.2. Manual browser acceptance remains pending. Baseline: `efa8194`.
Research authority remains `SHADOW_ONLY / NO_DECISION / live_apply_allowed=false`.
No broker orders were sent or broker permissions changed.

## Reproduced defects

- [#9](https://github.com/Jokejoker-designer/QUANTSMART/issues/9): reward/risk was
  checked before the stop floor but not after. Final explicit-target plans now
  pass the same minimum ratio in design and intrabar branches.
- [#10](https://github.com/Jokejoker-designer/QUANTSMART/issues/10): two declared
  ambiguous policies silently booked stop-first. They now refuse an ambiguous
  full-equity execution with a specific explanation. The auxiliary exclusion PF
  remains a sensitivity statistic, not a reconstructed equity path.
- [#11](https://github.com/Jokejoker-designer/QUANTSMART/issues/11): closed-in-time
  buckets could lack M1 minutes. The exact minute grid and stream are checked;
  incomplete closed buckets are refused rather than removed and time-compressed.
- [#12](https://github.com/Jokejoker-designer/QUANTSMART/issues/12): CSV repaired
  invalid geometry, accepted partial numeric text, dropped conflicting duplicates,
  silently truncated history and lacked durable source/timeframe integration.
  The new worker/storage path is strict, content-addressed and restart-tested.
- [#14](https://github.com/Jokejoker-designer/QUANTSMART/issues/14): direct engine
  calls could proceed with MISSING/NaN or another asset's specification. The
  canonical boundary now rejects these inputs for every caller.

The execution-contract regression has four failing groups on the pinned baseline
and four passing groups on the patched source. The strict CSV regression fails
on the baseline's price-repair behavior and passes on the new parser. Earlier
chronology and measurement regressions remain in the public test lane.

## Observed data tests

One actual external market CSV was obtained from the provider's public archive:

- Source: [Binance public-data documentation](https://github.com/binance/binance-public-data).
- Archive: [BTCUSDT M1 January 2025](https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-2025-01.zip).
- Published archive checksum: `8d028b2f91aad57d6b693d44449c93f9c4b7044f55f298c8a3ac40ab676dafac`.
- Extracted CSV SHA-256: `591e74443aed0082ecd473dd10239ecbc2c671ae19a5227712f4f50aa58632ba`.
- CSV size: 7,064,510 bytes; 44,640 source records retained; 744 H1 bars
  reconstructed. The archive checksum matched before extraction.
- The provider documents microsecond spot timestamps from January 2025 onward.
  The raw headerless CSV was imported directly, without adding a fabricated header.
- These are exchange-traded OHLC observations, not bid/ask ticks or broker fills.
  Monetary simulation without a valid BTCUSDT broker contract was correctly refused.

The raw CSV is not bundled with the source or portable release. Only provenance
and aggregate results are published. An FXCM sample endpoint returned HTTP 403;
no FXCM data was used and no access restriction was bypassed.

A second engineering test converted the last 5,000 bars of an existing local
XAUUSD H1 JSON to CSV. The original source says `sim_wide`; broker provenance is
unverified. The source JSON was read without modification. This is integration
coverage, not independent market evidence.

That provisional-cost run produced 305 trades and
17.78 net R. The bounded attribution run evaluated 24 events,
8 seeds and 768 canonical calls.
These numbers describe the observed fixture and protocol, not a profitable edge.
Exact source hashes and descriptive lift values are in the
[machine-readable record](CSV_RESEARCH_RESULTS.json).

## Matched controls

[#13](https://github.com/Jokejoker-designer/QUANTSMART/issues/13) adds a bounded
conditional event study. A/B/C/D use the canonical simulator, not a separate
optimistic fill calculator. Fixed-hold tests assert that N means exactly N
observed candles. Matching IDs and strata, equal counts, repeated seeds and the
canonical trial counter are tested. The real API test confirms that every
internal census/event call appears in the backend ledger.

This closes the missing supported-protocol implementation, not the broader
research questions. Arbitrary custom/stateful Cards, independent human labels,
exposure-matched portfolio experiments and selection-adjusted significance are
not established. Three chronological strata are not described as independently
unseen holdouts after user selection.

## Verification boundary

Observed locally: production build, type checking, strict parser/decoder tests,
actual import-form rendering, real built server/worker round trips, Card-run
source hashes, chart aggregation, invalid-file isolation, idempotent reimport,
restart readback, corrupt-store refusal and broker-specification refusal.

Browser observation reached the new import form and the actual file chooser.
The first upload attempt was blocked by missing file-URL permission. The user
subsequently enabled that Chrome permission, but the tool then reported
`Local browser use is disabled in Work settings`. Therefore manual selection ->
preview -> chart -> Card interaction was not yet accepted at this record's date.
API tests and rendered markup are not represented as proof of that manual flow.

The live local build is provided for that remaining acceptance step. No promise
of perfect behavior on every file, operating system or strategy is made.

## Carry data across updates

Preserve the selected local workspace, especially `imports/`, saved Cards and
receipts. Original datasets were not removed. Downloaded validation history is
kept outside the public source graph. Version 1.2.0 changes the worker hash and
execution contracts, so obtain new receipts for earlier experiments.
