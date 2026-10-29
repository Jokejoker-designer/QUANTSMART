// CH-WO-0 — Candle Hierarchy foundation barrel. Authority CH_AUTH_0 (offline contract + harness ONLY).
// This WO ships TYPES, the confirmed-swing rule, the LOCKED metric formulas, the self-calibration gate, and
// the no-lookahead harness — and NOTHING else. No pattern/search/cluster/beast logic, no UI, no oracle→sink
// path (those are CH-WO-1..4, each separately gated). See docs/contracts/07_CANDLE_HIERARCHY_REVIEW_AND_WO.md.
export * from "./chTypes.ts";
export * from "./chTrace.ts";
export * from "./confirmedSwing.ts";
export * from "./chMetrics.ts";
export * from "./calibrationSpec.ts";
export * from "./asOfHarness.ts";
export * from "./segmentEpisodeBuilder.ts";   // CH-WO-1
export * from "./episodeEraStability.ts";     // CH-WO-1 gate
export * from "./similaritySearch.ts";        // CH-WO-2
export * from "./similarityEraStability.ts";  // CH-WO-2 gate
export * from "./nullModelGate.ts";           // "Phương án a" — null-relative gates
export * from "./chEpisodeLens.ts";           // ch_episode_lens — L2 Canvas module (CH_AUTH_1, descriptive)
export * from "./chEpisodeSegments.ts";       // drawable episode bands (i0/i1) for chart overlays (CH_AUTH_1)

import { CH_WO0_AUTHORITY, CH_WO0_FORBIDDEN, type ChAuthority } from "./chTypes.ts";

// machine-checkable manifest of what CH-WO-0 is allowed to be (asserted in chWo0.test.ts).
export interface ChWoManifest {
  wo: string; authority: ChAuthority; ships: string[]; forbidden: readonly string[]; affects_verdict: false;
}
export const CH_WO0_MANIFEST: ChWoManifest = {
  wo: "CH-WO-0",
  authority: CH_WO0_AUTHORITY,                 // CH_AUTH_0
  ships: [
    "chTypes (SegmentEpisode/CandleCluster + SourceTrace)",
    "AsOfEpisode vs OracleEpisode DISTINCT TYPES (oracle un-feedable)",
    "confirmed_swing rule (lookback_left/right + confirmation_delay)",
    "LOCKED metrics: EraStability=1−JSD≥0.70, CrossEra=ARI≥0.80, intra-variance, entropy, Outcome-Corr+BH-FDR",
    "calibration_spec + selfCalibrate gate (SHADOW_ONLY ceiling)",
    "no-lookahead harness on asOfHigherTf (LookaheadError)",
  ],
  forbidden: CH_WO0_FORBIDDEN,
  affects_verdict: false,                      // CH-WO-0 NEVER touches a Passport/Atlas/Beast verdict
};
