// CH-WO-2 GATE — adding the similarity index must NOT degrade era-stability. The index searches a FEATURE
// space, so we test that the FEATURE DISTRIBUTION (not just the kind distribution of WO-1) is era-stable:
// EraStability(featureHist) = 1 − JSD ≥ 0.70 across two eras. If it FAILS → HARD STOP (don't tune).
// We ALSO report a DESCRIPTIVE OOS sanity metric: train the index on era1, query era2 episodes, and measure
// how often the nearest neighbour shares the query's KIND vs the majority-class baseline. This is "sample/
// OOS reported" — NOT an edge claim (edge = CH-WO-4's non-circular outcome gate, still deferred).
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "../simConfig.ts";
import type { AsOfEpisode, EpisodeKind } from "./chTypes.ts";
import { eraStability, ERA_STABILITY_MIN } from "./chMetrics.ts";
import { buildSegmentEpisodes, episodeKnownAt, DEFAULT_BUILDER_CONFIG, type SegmentBuilderConfig } from "./segmentEpisodeBuilder.ts";
import { episodeFeatureVector, buildSimilarityIndex, searchSimilar } from "./similaritySearch.ts";

// marginal histogram of each scale-free feature, quantised into `bins`, concatenated into one vector.
// F adapts to the actual feature length (4 base, or 4+anatomy_ext when enriched).
export function featureHistogram(eps: AsOfEpisode[], bins = 5): number[] {
  const F = eps.length ? episodeFeatureVector(eps[0]).length : 4;
  const h = new Array(F * bins).fill(0);
  for (const e of eps) {
    const v = episodeFeatureVector(e);
    for (let f = 0; f < F; f++) { const b = Math.min(bins - 1, Math.max(0, Math.floor((v[f] ?? 0) * bins))); h[f * bins + b]++; }
  }
  return h;
}

export interface SimEraReport {
  featureStability: number; pass: boolean; threshold: number; n1: number; n2: number;
  nnKindMatch: number; nnBaseline: number; nnLift: number; nnN: number;   // descriptive OOS sanity (not edge)
}

function knownAtOf(bars: OhlcBar[], tf: Timeframe, cfg: SegmentBuilderConfig): number[] {
  return episodeKnownAt(bars, tf, cfg).map((x) => x.at);
}

export function similarityEraStability(bars: OhlcBar[], tf: Timeframe, cfg: SegmentBuilderConfig = DEFAULT_BUILDER_CONFIG, splitFrac = 0.5): SimEraReport {
  const mid = Math.floor(bars.length * splitFrac);
  const b1 = bars.slice(0, mid), b2 = bars.slice(mid);
  const ep1 = buildSegmentEpisodes(b1, tf, cfg), ep2 = buildSegmentEpisodes(b2, tf, cfg);
  const featureStability = eraStability(featureHistogram(ep1), featureHistogram(ep2));

  // OOS NN kind-match: index on era1; for each era2 episode, NN by feature distance ONLY (coarseByKind=false,
  // so kind is NOT used to filter → no circularity). Match if the NN's kind equals the query's kind.
  const idx1 = buildSimilarityIndex(ep1, knownAtOf(b1, tf, cfg));
  let matches = 0, nnN = 0;
  for (const q of ep2) {
    const hit = searchSimilar(idx1, { feature: episodeFeatureVector(q) }, { asOfIndex: Number.POSITIVE_INFINITY, topN: 1, coarseByKind: false });
    if (hit[0]) { nnN++; if (hit[0].kind === q.kind) matches++; }
  }
  const nnKindMatch = nnN ? +(matches / nnN).toFixed(4) : 0;
  // majority-class baseline = the rate you'd get by always guessing era1's most common kind on era2.
  const counts: Record<string, number> = {}; for (const e of ep1) counts[e.kind] = (counts[e.kind] || 0) + 1;
  const majKind = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) as EpisodeKind | undefined;
  let baseHits = 0; for (const q of ep2) if (q.kind === majKind) baseHits++;
  const nnBaseline = ep2.length ? +(baseHits / ep2.length).toFixed(4) : 0;

  return {
    featureStability, pass: featureStability >= ERA_STABILITY_MIN, threshold: ERA_STABILITY_MIN,
    n1: ep1.length, n2: ep2.length,
    nnKindMatch, nnBaseline, nnLift: +(nnKindMatch - nnBaseline).toFixed(4), nnN,
  };
}
