// CH-WO-2 — Similarity Index (L3). `ch_similarity_search` over the WO-1 SegmentEpisodes: given a query
// episode, return the most similar HISTORICAL episodes — "historical similarity, NOT prediction". Two hard
// rules: (1) SCALE-FREE features only (ATR-relative / ratios / log-count / sign — never raw price), and
// (2) asOf-CORRECT — a query as-of time T may only see episodes whose confirm_index ≤ T (no future leak).
// Coarse-to-fine with the manager's candidate caps. Authority CH_AUTH_1 (still no verdict effect).
import type { AsOfEpisode, EpisodeKind } from "./chTypes.ts";

// candidate caps per hierarchy level (manager spec). WO-2 works at the SEGMENT level (coarse cap = 100).
export const SIM_CAPS = { macro: 500, segment: 100, cluster: 30, candle: 10 } as const;

// ── SCALE-FREE feature vector (the embedding the index searches over) ──
// 4 base dims + the optional enriched `anatomy_ext` (local_candle_context + mtf — all already scale-free [0,1]).
export function episodeFeatureVector(ep: { range_atr: number; body_ratio: number; duration_bars: number; direction_sign: number; anatomy_ext?: number[] }): number[] {
  const base = [
    Math.min(Math.max(ep.range_atr, 0) / 5, 1),                     // span in ATR, capped at 5 → [0,1]
    Math.min(Math.max(ep.body_ratio, 0), 1),                        // net/path → [0,1]
    Math.min(Math.log10(Math.max(1, ep.duration_bars) + 1) / 2, 1), // log duration → ~[0,1] up to ~100 bars
    (ep.direction_sign + 1) / 2,                                    // sign → {0,0.5,1}
  ];
  return ep.anatomy_ext && ep.anatomy_ext.length ? [...base, ...ep.anatomy_ext] : base;
}
function euclid(a: number[], b: number[]): number { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

export interface SimIndexEntry { episode_id: string; feature: number[]; knownAt: number; kind: EpisodeKind; dir: number }
export interface SimilarityIndex { entries: SimIndexEntry[] }    // sorted ascending by knownAt

// build the index from WO-1 episodes + their known-at indices (confirm_index of the closing swing).
export function buildSimilarityIndex(episodes: AsOfEpisode[], knownAt: number[]): SimilarityIndex {
  const entries: SimIndexEntry[] = episodes.map((e, i) => ({
    episode_id: e.episode_id, feature: episodeFeatureVector(e), knownAt: knownAt[i] ?? i, kind: e.kind, dir: e.direction_sign,
  }));
  entries.sort((a, b) => a.knownAt - b.knownAt);
  return { entries };
}

export interface SimQuery { feature: number[]; kind?: EpisodeKind; dir?: number; selfId?: string }
export interface SimHit { episode_id: string; distance: number; kind: EpisodeKind; knownAt: number }
export interface SimSearchOpts { asOfIndex: number; topN?: number; coarseCap?: number; coarseByKind?: boolean }

// coarse-to-fine search. COARSE: asOf filter (knownAt ≤ asOfIndex) [+ optional same-kind/dir bucket], keep
// the most-recent `coarseCap`. FINE: euclidean on the scale-free feature, return the `topN` closest.
export function searchSimilar(index: SimilarityIndex, query: SimQuery, opts: SimSearchOpts): SimHit[] {
  const topN = opts.topN ?? SIM_CAPS.candle, coarseCap = opts.coarseCap ?? SIM_CAPS.segment;
  let cands = index.entries.filter((e) => e.knownAt <= opts.asOfIndex && e.episode_id !== query.selfId);
  if (opts.coarseByKind && query.kind != null) {
    const same = cands.filter((e) => e.kind === query.kind && (query.dir == null || e.dir === query.dir));
    if (same.length >= Math.min(topN, 5)) cands = same;   // only narrow if the bucket is usefully populated
  }
  if (cands.length > coarseCap) cands = cands.slice(cands.length - coarseCap);   // most-recent coarseCap (cheap pre-filter)
  return cands
    .map((e) => ({ episode_id: e.episode_id, distance: +euclid(query.feature, e.feature).toFixed(6), kind: e.kind, knownAt: e.knownAt }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topN);
}

// convenience: nearest neighbour of an episode, strictly in its PAST (asOf = its knownAt − 1).
export function nearestPast(index: SimilarityIndex, ep: AsOfEpisode, knownAt: number, opts: Partial<SimSearchOpts> = {}): SimHit | null {
  const hits = searchSimilar(index, { feature: episodeFeatureVector(ep), kind: ep.kind, dir: ep.direction_sign, selfId: ep.episode_id }, { asOfIndex: knownAt - 1, topN: 1, ...opts });
  return hits[0] ?? null;
}
