// CH-WO-0 — Candle Hierarchy CONTRACT (schemas + the AsOf/Oracle type split). Authority CH_AUTH_0 (offline
// analysis only; NO UI, NO verdict path, NO beast). This file defines TYPES + constructors ONLY — there is
// deliberately NO pattern/search/cluster logic here (that is CH-WO-1..4, each separately gated).
//
// THE central safety idea (manager A.1 + risk #1): an episode built using only bars CLOSED as-of a decision
// time is an `AsOfEpisode` and is the ONLY thing allowed near a backtest/passport/atlas/beast. An episode
// built with hindsight (knows how it resolved) is an `OracleEpisode` — structurally a DIFFERENT TYPE so the
// compiler refuses to feed it into any causal sink. There is NO sanctioned Oracle→AsOf conversion.
import type { Timeframe } from "../simConfig.ts";

// ── Source trace (manager §A.3): enough to detect a re-resample / version drift of the underlying bars ──
export interface SourceTrace {
  source_tf: Timeframe;
  source_bar_ids: number[];      // indices into the source bar array these features came from
  source_start_time: string;     // ISO of the first source bar (UTC)
  source_end_time: string;       // ISO of the LAST source bar used (for AsOf this must be ≤ decision time)
  source_count: number;          // number of source bars
  source_hash: string;           // stable hash over {tf|start|end|count|ohlc} — re-resample changes it
}

// pattern_scanner outputs TYPE + confidence ONLY (blueprint edit: the directional-bias label backdoor is gone).
export type EpisodeKind = "IMPULSE" | "CORRECTIVE" | "RANGE" | "SWEEP_RECLAIM" | "FAILED_BREAKOUT" | "UNCLASSIFIED";

// scale-free, era-safe anatomy (ATR-relative / ratios / counts — NEVER absolute price; see price-era-shift-guard).
export interface SegmentEpisodeBase {
  episode_id: string;
  kind: EpisodeKind;
  detection_confidence: number;  // [0,1] — recognition confidence, EXPLICITLY "not a trade probability"
  range_atr: number;             // episode high-low range in ATR units
  body_ratio: number;            // net displacement / total path (0..1)
  duration_bars: number;
  direction_sign: -1 | 0 | 1;    // GEOMETRIC net direction of the segment — NOT a forecast
  trace: SourceTrace;
  anatomy_ext?: number[];        // OPTIONAL enriched SCALE-FREE features (local_candle_context + mtf), order = ANATOMY_EXT_KEYS
}
// the fixed order of the enriched feature dimensions (so the vector is stable + interpretable). All scale-free.
export const ANATOMY_EXT_KEYS = ["clv_mean", "upper_wick", "lower_wick", "range_expansion", "htf_align", "htf_pos"] as const;

// ── The AsOf / Oracle DISTINCT TYPES ──
// Branded by a literal `view` tag (runtime-checkable) so a function that accepts only `AsOfEpisode` will
// REJECT an `OracleEpisode` at compile time. No function in CH converts Oracle→AsOf.
export type AsOfEpisode = SegmentEpisodeBase & { readonly view: "ASOF"; readonly asof_decision_time: string };
export type OracleEpisode = SegmentEpisodeBase & { readonly view: "ORACLE"; readonly resolved_outcome?: unknown };

export function mkAsOfEpisode(base: SegmentEpisodeBase, asof_decision_time: string): AsOfEpisode {
  // INVARIANT: every source bar must be closed by the decision time (caller guarantees; harness verifies).
  return { ...base, view: "ASOF", asof_decision_time };
}
export function mkOracleEpisode(base: SegmentEpisodeBase, resolved_outcome?: unknown): OracleEpisode {
  return { ...base, view: "ORACLE", resolved_outcome };
}
// runtime guard (the compile-time guard is the type itself). Useful at module boundaries / tests.
export function isAsOf(e: { view?: string }): e is AsOfEpisode { return e.view === "ASOF"; }

// ── Cluster schema (CH-WO-3 builds these; here we only fix the shape + trace) ──
export interface CandleCluster {
  cluster_id: string;
  member_episode_ids: string[];
  centroid: number[];            // scale-free feature centroid
  intra_variance: number;        // filled by chMetrics.intraClusterVariance
  size: number;
  trace: SourceTrace;            // aggregate trace over members
}

// ── CH Authority Ladder (manager A.6) — rise ONE rung per passed gate, never skip ──
export type ChAuthority = "CH_AUTH_0" | "CH_AUTH_1" | "CH_AUTH_2" | "CH_AUTH_3" | "CH_AUTH_4" | "CH_AUTH_5";
export const CH_AUTH_LADDER: ChAuthority[] = ["CH_AUTH_0", "CH_AUTH_1", "CH_AUTH_2", "CH_AUTH_3", "CH_AUTH_4", "CH_AUTH_5"];
export const CH_AUTH_MEANING: Record<ChAuthority, string> = {
  CH_AUTH_0: "Offline build/index — no UI, no verdict effect",
  CH_AUTH_1: "UI diagnostic — show only, no verdict effect",
  CH_AUTH_2: "Research evidence — into Passport/Atlas, OOS-labelled",
  CH_AUTH_3: "Beast Scout SHADOW — sees, cannot block",
  CH_AUTH_4: "Beast Scout ACTIVE — warn/downgrade after OOS gate",
  CH_AUTH_5: "Strategy-Logic input (L5) — own calibration",
};
export function canRiseTo(current: ChAuthority, target: ChAuthority): boolean {
  return CH_AUTH_LADDER.indexOf(target) === CH_AUTH_LADDER.indexOf(current) + 1;   // exactly one rung
}

// ── calibration_spec (CH-WO-0 owns this; manager §5.5: self-learning is the DEFAULT, not a cage) ──
export type CalibrationObjective = "MAXIMIZE_OOS_NETR" | "MAXIMIZE_ERA_STABILITY" | "MINIMIZE_INTRA_VARIANCE";
export interface CalibrationSpec {
  module_id: string;
  param: string;
  range: [number, number];
  step?: number;
  objective: CalibrationObjective;
  fit_window: { startFrac: number; endFrac: number };   // fractions of the tape used to FIT
  oos_window: { startFrac: number; endFrac: number };   // disjoint OOS fractions used to VALIDATE
  default_value: number;        // fall back here if the self-fit does not beat default on OOS
  mode: "AUTO" | "MANUAL";      // AUTO = self-learning default; user may override to MANUAL (not a cage)
}

// what CH-WO-0 ships (used by the manifest + tests to assert scope/authority).
export const CH_WO0_AUTHORITY: ChAuthority = "CH_AUTH_0";
export const CH_WO0_FORBIDDEN = [
  "pattern/search/cluster/beast logic (CH-WO-1..4)",
  "any UI evidence surface",
  "any oracle→backtest/passport/atlas/beast path",
] as const;
