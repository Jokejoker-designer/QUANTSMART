# Drive reassessment: evidence before integration

Date: 2026-11-02, Asia/Bangkok. Reviewed baseline: `d7b366b2111e26ce1171375aec508a6c95c6a7a9`.

This follow-up checks the supplied deep-research report against selected original Drive files and the current implementation. Drive access worked in this review. The supplied report's inability to authenticate to Drive is a limitation of that earlier review, not evidence that its Drive-side conclusions were independently reproduced. This is a targeted assessment of MFE identity/journaling, MAM, QI and MTF adaptive sources, not an exhaustive audit of every project, dependency or historical result in the folder.

## Adopted improvement

The useful idea is to preserve negative evidence at its source: a missing trade must not be interpreted as a successful abstention or given a zero return.

**Microscope → Decision & outcome evidence → Build decision journal** now captures one terminal entry-evaluation branch per processed design bar. The report distinguishes:

- no trigger vote and combination abstention;
- the first gate that vetoed a candidate;
- cooldown and daily-cap blocks;
- a rejected Auto R:R or final stop-floor plan;
- no next bar for a modeled fill;
- a modeled entry;
- an existing position, where entry evaluation was not reached;
- simulation termination after capital exhaustion.

These facts are recorded inside the actual branches. The journal does not rerun gate expressions, guess from subsequent prices, or turn later unevaluated gates into passes. Custom gate/veto attribution remains aggregate because the custom evaluator does not emit individual module attribution. Warmup and any unprocessed bars are explicitly counted. Branch timestamps describe design-close evaluation; modeled plans also consume the next observed open, which is not claimed to be known earlier.

The backend computes and saves the evidence once. The frontend filters/paginates stored facts. Archived reports without capture say **not captured** rather than showing zero abstentions. Plan rejections join existing signal observations and keep a null return. Observation IDs remain separate from definition, experiment and structural-setup identities. Repeated reports and restart preserve immutable artifact identity.

Capture is opt-in and limited to 5,000 design bars. M1/intrabar execution, probe mode and research interventions are rejected for this capture contract. Ordinary backtests, attribution, Demo automation and canonical execution events do not enable it. The change does not alter trigger conditions, gate order, fills, stops, costs, trade counters or broker behavior.

## Findings in the original sources

| Source | Verified finding | Integration decision |
| --- | --- | --- |
| Identity schema, lineage and fingerprint contracts | Distinguishing a structural setup from a Card and experiment is useful. Descriptors must not silently create a new structural identity. | Retain the separation. Do not fabricate anchor/origin/lineage facts that current native signals do not emit. |
| Stage legality and collision audits | The old code's own audits describe inferred previous stage, missing persistent lifecycle memory and incomplete identity proof. Stage-label coverage is not proof of a durable terminal latch. | Do not import this as a completed persistent lifecycle engine. Keep `structuralSetupLifecycle: NOT_IMPLEMENTED`. |
| `mam_convergence_engine.py` | Price clustering and source attribution are understandable research ideas. Its output also maps fuzzy membership to risk-quality metadata and runtime eligibility. | No score/risk/eligibility mapping is imported. There is no new evidence of independent, outcome-calibrated improvement. |
| `thesis_lifecycle_superposition_engine.py` | The inspected evaluation path only supports `INVALIDATED`; other lifecycle inputs return an unsupported result. It normalizes competing scores with softmax. | Do not present it as a general lifecycle engine or a calibrated probability model. |
| Adaptive filter-impact report | The source labels its 1,000-sample comparison `proxy_only` and `NO_PROMOTION_CANDIDATE_PROXY_ONLY`. | Retain the explicit negative result; do not promote the top-ranked filter. |
| MTF adaptive `adaptive_probability.py` | The computed `cost_r` multiplies the nonzero-cost branch by `0.0`. Four inspected arithmetic cases with cost prices 0, 1, 10 and 100 all yield zero cost R. | Do not import its `expected_r_after_cost` calculation. QUANTSMART retains its existing explicit cost model. |
| MTF adaptive `pivots.py` | A centered rolling window delayed by `right` is not causal for every supported asymmetric window. With `left=4,right=1`, changing bar 6 changes the reported pivot at bar 5; prefix and whole-series results disagree. | Do not import this implementation. The default symmetric-window fixture did not reproduce that particular defect; this is not a claim that every use of the source is noncausal. |
| Evolutionary-exit architecture V1 | Preserving NULL results, net-of-cost evaluation and disclosure of previously inspected holdouts are useful methodology. The document also makes historical measured-status claims. | Retain the methodological requirements. Historical claims of proven results, reserve usage or statistical power have not been independently reproduced from original data in this review. No genetic optimizer or new exit algorithm is activated. |

## Verification and limits

- A new regression test failed before branch capture existed, then passed after implementation.
- Eleven native Card configurations compare trace-on and trace-off results byte-for-byte after excluding the new optional trace: trades, costs, markers, events and counters match. Dedicated fixtures also test combination abstention, aggregate custom gate rejection, unsupported modes and the size limit.
- Replaying/appending future bars preserves past branch evidence before the prefix's last fill boundary. Old reports retain an explicit missing-evidence state.
- Built HTTP tests verify one canonical simulator call, CSV import, save/reopen, restart, idempotence and integrity checks. The 1,500-bar synthetic fixture records 1,460 branch facts and joins 41 signals to 36 completed modeled trades.
- The existing chronology, M1 integrity, cost, ambiguity, attribution, trial-history and L1–L6 regression lanes remain required. Their results are software-behavior evidence, not proof of strategy edge.
- The source-cost check evaluates only an inspected arithmetic expression, not the adaptive pipeline. The pivot counterexample invokes only the inspected pure pandas/NumPy measurement function. No source runtime, broker adapter or account state is executed.

Original downloaded files and exact SHA-256 values are retained in the local review folder. Only the sanitized assessment, hash inventory and newly written integration are included in the public source package. See [machine-readable findings](DRIVE_REASSESSMENT_RESULTS.json) and the [earlier assessment](DRIVE_INTEGRATION_AUDIT.md).

## Direction and honesty audit

`authority=SHADOW_ONLY`; `decision=NO_DECISION`; `live_apply_allowed=false`. Canonical simulator trade behavior changed: **NO**. Optional observer behavior changed: **YES**. MT5/order path touched: **NO**. No runtime policy, risk sizing, account state, credentials, raw Drive source or historical market data is added to this integration. Structural lifecycle, grouped-convergence edge and QI probability calibration are not claimed as implemented or validated.
