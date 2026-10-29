// CH-WO-1 — the Era-Stability GATE for the segment episode builder. Splits the tape into two eras, builds
// episodes in each, and measures whether the EPISODE-KIND DISTRIBUTION is stable across eras via the LOCKED
// metric EraStability = 1 − JSD ≥ 0.70 (chMetrics). If it FAILS, CH-WO-1 STOPS (HARD STOP — do not tune to
// pass; that would be curve-fit). Because the anatomy is scale-free (ATR-relative) the distribution SHOULD
// generalise across price regimes — but it must be MEASURED, never assumed. See price-era-shift-guard.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "../simConfig.ts";
import type { EpisodeKind } from "./chTypes.ts";
import { eraStability, ERA_STABILITY_MIN } from "./chMetrics.ts";
import { buildSegmentEpisodes, EPISODE_KINDS, DEFAULT_BUILDER_CONFIG, type SegmentBuilderConfig } from "./segmentEpisodeBuilder.ts";

export function kindHistogram(eps: { kind: EpisodeKind }[]): number[] {
  const idx: Record<string, number> = {}; EPISODE_KINDS.forEach((k, i) => (idx[k] = i));
  const h = new Array(EPISODE_KINDS.length).fill(0);
  for (const e of eps) h[idx[e.kind]]++;
  return h;
}
export function kindFractions(h: number[]): Record<EpisodeKind, number> {
  const tot = h.reduce((a, b) => a + b, 0) || 1;
  const out = {} as Record<EpisodeKind, number>;
  EPISODE_KINDS.forEach((k, i) => (out[k] = +(h[i] / tot).toFixed(4)));
  return out;
}

export interface EraStabilityReport {
  stability: number; pass: boolean; threshold: number;
  hist1: number[]; hist2: number[]; frac1: Record<EpisodeKind, number>; frac2: Record<EpisodeKind, number>;
  n1: number; n2: number; kinds: EpisodeKind[];
}

// split at `splitFrac` (default the midpoint) → two eras; build + histogram + EraStability.
export function episodeEraStability(bars: OhlcBar[], tf: Timeframe, cfg: SegmentBuilderConfig = DEFAULT_BUILDER_CONFIG, splitFrac = 0.5): EraStabilityReport {
  const mid = Math.floor(bars.length * splitFrac);
  const era1 = bars.slice(0, mid), era2 = bars.slice(mid);
  const ep1 = buildSegmentEpisodes(era1, tf, cfg), ep2 = buildSegmentEpisodes(era2, tf, cfg);
  const h1 = kindHistogram(ep1), h2 = kindHistogram(ep2);
  const stability = eraStability(h1, h2);
  return {
    stability, pass: stability >= ERA_STABILITY_MIN, threshold: ERA_STABILITY_MIN,
    hist1: h1, hist2: h2, frac1: kindFractions(h1), frac2: kindFractions(h2),
    n1: ep1.length, n2: ep2.length, kinds: EPISODE_KINDS,
  };
}
