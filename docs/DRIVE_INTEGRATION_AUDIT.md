# Drive integration assessment

Follow-up: [direct-source reassessment and entry-branch evidence](DRIVE_REASSESSMENT.md) extends this original assessment. New decision journals capture the first reached entry branch; older archived reports retain their original coverage limitations.

Assessment date: 2026-11-02, Asia/Bangkok. Repository baseline: 90e4ef46020c5ba4ef95cd543dc6af7b3e8d9a86, release 1.2.0-rc.4. The supplied handoff used the older 8d13f9a baseline. This review inspected the 28 specific Drive objects linked by the owner, not an assumed latest version of every file in Drive. Their source code was read, not executed or copied into the public package.

## Conclusion

The handoff identifies useful research gaps. It is not evidence that five production-ready engines can be imported or that they improve strategy performance. Several mechanisms are already partially present in QUANTSMART, and several Drive components depend on runtime semantics that do not belong in a research observer.

The integrated change is an optional backend decision/outcome journal with immutable local storage, source hashes, observation IDs and explicit missing values. It reuses the canonical simulator's existing event ledger. It does not add strategy votes, scores, probabilities, risk controls or broker instructions.

| Claim | Verified evidence | Decision |
|---|---|---|
| A persistent structural setup instance differs from a Strategy Card ID | Correct. Card Passport and run IDs identify definitions/runs. They do not supply canonical structural anchor, breakout origin and terminal thesis lineage. | Keep the gap explicit. Add stable signal-observation IDs now; do not label them structural setup identities. |
| runtime_lifecycle_assessment.py is the main setup-identity engine | Overstated. It produces PositionLifecycleAssessment, including trailing/TP governance modes, add-position permission and retirement candidacy. It consumes Strategy evidence; it does not generate canonical setup identity. | Do not import the position-governance outputs. |
| Drive lifecycle contracts are ready as a complete state machine | Its stage_legality_audit reports partial compliance, inferred previous stages and no durable terminal latch. identity_collision_audit reports missing structural proof fields. | Use those failure cases as acceptance requirements. Do not import a contract as proof of a working lifecycle. |
| MAM provides grouped candidate convergence absent from the current Card model | Partly correct. MamConvergenceEngine clusters directional priced sources, computes weighted scores and attribution. Its constructor stores configuration; persistent candidate tracking is in the separate runtime bucket pool. | A separate research experiment may be useful, but this is not a drop-in persistent setup engine. No new candidate ranking is activated. |
| WRCT scoring is safe to carry into MFE unchanged | Incorrect as a general statement. The source maps fuzzy_membership to risk_quality_factor and recommended_runtime_eligible; the report connects metadata with PID/runtime. | Keep those outputs outside QUANTSMART research authority. A fuzzy membership is not a calibrated win probability. |
| Kalman/MTF/liquidity Adaptive improves outcomes | Not established. The supplied impact report uses 1,000 proxy-only samples and explicitly reports NO_PROMOTION_CANDIDATE_PROXY_ONLY. It calls itself a filter-impact demo. | No adaptive confidence multiplier or tuning profile is enabled. Require chronological, outcome-linked baseline and ablation comparisons first. |
| QI OLD/REVERSE/WAIT assessment exists in the linked source | Correct. The engine integrates decayed evidence, groups it and uses softmax. Its evaluate method only handles INVALIDATED lifecycle input; other lifecycle states return an unsupported result. | Do not invent absent canonical lifecycle input or treat its normalized scores as calibrated probabilities. |
| The old P2 report proves there is no runtime adapter/shadow wiring | Incorrect. runtime_superposition_adapter.py exists. main_runtime_integration.py contains QI_P4_SHADOW_WIRING and journal recording, and refuses runtime-consume/reverse-candidate flags in its shadow path. | Treat P2's phase label as historical. The later wiring still does not establish predictive calibration or authorize execution. |
| Decision/outcome evidence should distinguish no-entry from zero-return trades | Correct and useful. The existing event ledger, trial ledger, Card receipts and trade results provide much of the data, but not a single durable observation join. | Integrated as the optional decision journal. |
| Existing attribution and walk-forward must be replaced | Not supported. The current repository already has matched entry/exit controls, chronological checks and per-role ablation, with explicit support limits. | Keep those implementations and their regression tests. |

## What changed

Microscope shows **Decision & outcome evidence** when a saved CSV and Card are selected. The backend performs one optional canonical simulation, joins observed SIGNAL_SEEN events with policy blocks, modeled fills and completed trades, then stores an immutable evidence artifact. Reopening an artifact reads stored evidence rather than recomputing the simulation.

Each record has an observation ID separate from the Card ID. Its identity excludes confidence, ATR, UI labels and the complete future dataset hash. Repeating a run or appending future observations preserves past observation IDs. The run identity still includes the full source hash, definition hash, configuration hash and worker hash so two different experiment contexts remain distinguishable.

These are **signal observations**, not persistent structural setups. The report explicitly sets structuralSetupLifecycle to NOT_IMPLEMENTED. Silent pre-signal veto and abstain branches are not present in the canonical ledger, so they remain missing evidence. A post-signal rejection without an emitted reason is marked NO_FILL_RECORDED; a reason is not guessed from a later outcome.

No-entry records and open positions have a null outcome. A position open at the end of the tape is right-censored, not a zero-R trade. A closed trade retains the canonical gross/net/cost R values. Complete design bars before its exit bar provide lower-bound price excursions; the exit bar is excluded because its high/low may occur after the modeled exit. Exact excursion R remains null because the canonical result does not emit structured initial risk and an exact path.

Artifacts live under the owner's local workspace in decision-evidence. Content-derived IDs make writes idempotent. Writes use a temporary file and atomic rename. Reads validate the content hash and refuse corrupted artifacts. Capacity is bounded; the service requests explicit archiving instead of silently deleting evidence. Saved metadata is cached by file modification time and size to avoid rereading every complete report on each refresh.

This feature accepts 61–5,000 selected design bars. It requires equal design and execution timeframes and a saved CSV. It does not infer M1/tick paths or silently accept incomplete aggregation.

## Additional verified defect

The legacy signatureBuild.ts helper assigned positive net R to mfe_R, negative net R to mae_R, and took its feature snapshot at the entry candle even though entry occurs at that candle's open. Those values were not path excursions and the snapshot could consume that candle's future high/low/close.

A regression test reproduced the false excursion values before the fix. The helper now snapshots the completed signal bar, keeps canonical net R and marks unavailable excursion R as null. Consumers of this legacy entry-record helper must accept nullable mfe_R/mae_R; it is not the new journal's data source.

## Verification

- A deterministic 1,200-bar test joined 33 observed signals and 28 closed trades, preserved simulator output byte-for-byte, repeated IDs across replay, excluded exit-bar extremes and preserved null no-entry/open outcomes.
- A real built HTTP service test used 1,500 synthetic bars, 41 observed signals and 36 completed trades. One journal request invoked one canonical simulator call. Save/reopen, duplicate requests, restart, hash corruption and unsupported execution modes were checked.
- That synthetic HTTP test observed approximately 119 ms for its cold journal request and a 77 KB report on this machine. This is a bounded local observation, not a general performance guarantee or a trading-quality improvement.
- A separate integration run used the existing 5,000-row XAUUSD H1 research import and joined 459 observed signals to 305 completed modeled trades with no unjoined trades. The original source is labeled sim_wide and its broker provenance is unverified.
- The production build, public regression lane and 28 bridge tests passed locally. Canonical trades, costs, event state and receipt semantics remain unchanged by the observer.
- The new panel passed production TypeScript/build and server-rendered control checks. Fresh browser visual acceptance was unavailable because local browser access was disabled; no visual acceptance claim is made.

The old Drive smoke tests and QI owner report were inspected as source evidence. They were not executed against the user's live runtime, and their historical PASS statements are not claimed as fresh verification.

## What must happen before further integration

1. Export actual structural anchor/origin/terminal-lineage facts from a supported strategy. Prove terminal latching, identity stability, collision resistance and deterministic replay. Do not manufacture these facts from confidence or a sliding ATR bucket.
2. Run grouped convergence and adaptive filtering as explicitly separate shadow experiments. Deduplicate correlated source families, disclose weights and compare against the existing baseline across chronological held-out windows.
3. Feed QI only valid lifecycle/evidence contracts. Preserve unsupported, insufficient-evidence and noise states. Require independent outcome calibration before presenting any probability interpretation.
4. Keep runtime policy, PID scaling, account state, execution authority and credentials outside this integration. Independent human-label measurement validation remains open in issue #4.

## Direction and honesty audit

Authority: SHADOW_ONLY. Decision: NO_DECISION. live_apply_allowed=false. Canonical simulator runtime behavior changed: NO. New observer/report behavior: YES, opt-in. Legacy signature-record semantics changed: YES, unavailable excursion fields are null and snapshots use the completed signal bar. MT5/order path touched: NO. Raw Drive source, .env files, account state and credentials published: NO.
