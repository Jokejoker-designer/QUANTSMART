# Recorded quote observations

This implementation extends the existing MT5 bridge and its tick-evidence SQLite database. It adds no top-level page, terminal connection, simulator or order authority. All results remain SHADOW_ONLY, NO_DECISION and live_apply_allowed=false.

## Collection and features

Start collection explicitly in Assets. The backend recorder continues without a browser tab. Completed 60-second UTC windows calculate quote-update rate, inter-arrival p50/p95, spread p50/p95/max, mid-price range and absolute progress divided by total mid-price travel. Zero travel returns null rather than an invented score. These describe broker quote updates, not exchange order flow.

A window needs at least 30 quotes spanning 45 seconds, with no internal interval over 30 seconds. Insufficient and gapped windows produce no features. Current source freshness is reported separately from the last completed window. A quiet interval does not establish a broker outage or market closure.

The descriptive baseline uses up to 180 strictly earlier windows from the same opaque source and UTC session. It requires 30 usable windows. Source and session are implemented partitions. A validated regime partition and multi-era coverage remain unfinished.

## Frozen declarations and future outcomes

Every fifth UTC minute can record a WARNING when the current spread p95 or minute mid-range exceeds its earlier p95 baseline, otherwise a NEGATIVE_CONTROL. The experimental future target is any quote spread or five-minute mid-range exceeding 1.5 times the frozen earlier baseline. The target definition is stored in each declaration. Comparing a five-minute range with minute-range quantiles is an experimental observation rule, not a validated predictive model.

These window lengths, cutoffs, minimum samples and thresholds are new engineering choices. They were not recovered as proven constants from the original Drive blueprint. Calculation code and configuration hashes identify produced windows and descriptive versions.

A declaration created within 90 seconds of its feature cutoff is labeled LIVE_PROSPECTIVE. Its five-minute outcome starts at actual publication time, after the completed feature window. Catch-up declarations are labeled HISTORICAL_REPLAY. They never enter the prospective false-alarm fraction. Features, baseline, source and target are frozen before resolving the outcome.

- PENDING means the required future source coverage has not arrived.
- UNKNOWN means future coverage is sparse or gapped. It is not a negative.
- INVALID_SOURCE means a source contract failed during the observation horizon.
- EVENT_OBSERVED means the experimental threshold was crossed.
- NO_EVENT means a warning had adequate future coverage without the defined event.
- VERIFIED_NEGATIVE means a frozen negative control had adequate coverage without the event.

Raw values and artifact hashes are checked before computing or resolving evidence. Corruption refuses calculation. Historical replay, finite fixtures and short live collection do not establish calibrated probabilities, causal trading edge, lead-time skill, missed-event recall or OOS performance.

## Similar windows and distribution changes

Playbook ranks the five closest earlier windows from the same source, UTC session and feature configuration. Distance is the mean absolute difference across empirical ranks of quote rate, inter-arrival p95, spread p95 and mid-price range. Lower distances indicate closer measurements. Weekly Audit shows medians of those measurements in the latest 15 eligible windows and the 15 immediately preceding windows. Both views require 30 earlier usable windows. These comparisons describe the recorded sample. Predictive calibration remains gated.

## Descriptive versions and review

Hidden Coefficients can save immutable source-specific descriptive snapshots after the minimum baseline exists. Versions carry the feature schema, calculation and config hashes, cutoff, coverage and explicit UNCERTIFIED tier. They are not fitted strategy coefficients. Backend-audited selection and rollback affect only a descriptive observer pointer. Quarantine prevents selecting that version again and requires a new candidate. Quarantining an inactive version does not clear another active version.

The local operator name is a declared audit label, not authenticated manager identity. No review applies data to mfe_coef_profile, Card signals, execution, sizing or canonical backtests. Existing user overrides are preserved.

## Existing page owners

Assets, KIDI and Debugger own recorder controls, source quality and sanitized diagnostics. Overview, Entry & Danger and Playbook consume the same typed recorded snapshot. Microscope offers recorded declaration inspection independently of Card selection or Live/CSV source mode. Hidden Coefficients owns descriptive versions; Governance shows blocked pipeline stages. Weekly Audit reports observation outcomes separately from broker performance. Strategy Lab shows qualification gates while retaining canonical validation. Canvas and Blocks explain why optional recorded L1/L2 inputs remain locked. Guide documents Connect → Collect → Verify → Observe → Replay → Calibrate → Review.

No predictive stage becomes qualified because enough minutes elapsed. The CSV stage sequence stays unchanged; recorded quotes enter with live_tick_ingest and reuse downstream stages. Role validation, purged OOS, predictive calibration and qualified module inputs remain explicitly unfinished.

## Local API

GET /api/mt5/evidence/observation?symbol=XAUUSD reads one asset source. Add comparison=true for the similar-window and distribution summaries. An asset without recorded evidence returns no current window, rather than borrowing another asset's profile.

POST /api/mt5/evidence/model/propose accepts source_id. POST /api/mt5/evidence/model/review accepts source_id, model_id, reviewer and one of SELECT_DESCRIPTIVE, ROLLBACK_DESCRIPTIVE or QUARANTINE_DESCRIPTIVE. Existing same-origin JSON and bridge-token protections apply.

GET /api/mt5/evidence/reconcile?source_id=...&limit=1000 compares a bounded frozen stored sample against the same terminal's native tick-range API. It reports matched, missing and changed rows. This sample comparison is not proof that every broker tick was collected.

## Verification

Run python -m unittest discover -s bridge/tests -v and npm run test:public from the source root. Native duration, restart, reconciliation and browser acceptance are recorded separately in docs/blueprint-recovery/TEST_EVIDENCE.md. Synthetic fixtures cannot certify live continuity or predictive skill.
