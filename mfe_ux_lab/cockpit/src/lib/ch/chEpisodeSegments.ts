// chEpisodeSegments — episode legs as DRAWABLE bands (bar-index ranges) for chart overlays. Pure OBSERVER
// (CH_AUTH_1, affects_verdict=false): the SAME confirmed legs as chEpisodeLens (via buildSegmentEpisodes) plus the
// forming leg, but exposing i0/i1 (indices into `bars`) so a chart can colour each leg. Never touches engine/verdict.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "../simConfig.ts";
import type { EpisodeKind } from "./chTypes.ts";
import { buildSegmentEpisodes, atrCausal, classifyLeg, DEFAULT_BUILDER_CONFIG, type SegmentBuilderConfig } from "./segmentEpisodeBuilder.ts";
import { confirmedSwings } from "./confirmedSwing.ts";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : +x.toFixed(4));

export interface EpisodeBand { i0: number; i1: number; kind: EpisodeKind; dir: -1 | 0 | 1; confirmed: boolean }
export interface EpisodeSegments { bands: EpisodeBand[]; forming: EpisodeBand | null }

// colours match the ChEpisodeLensPanel chips (one source of truth for the palette)
export const EPISODE_COLOR: Record<string, string> = {
  IMPULSE: "#21D07A", CORRECTIVE: "#E3B341", RANGE: "#6e7681",
  SWEEP_RECLAIM: "#9D5CFF", FAILED_BREAKOUT: "#FF8A2A", UNCLASSIFIED: "#6e7681",
};

export function chEpisodeSegments(bars: OhlcBar[], tf: string, cfg: SegmentBuilderConfig = DEFAULT_BUILDER_CONFIG): EpisodeSegments {
  if (bars.length < 5) return { bands: [], forming: null };
  const eps = buildSegmentEpisodes(bars, tf as Timeframe, cfg);                      // CONFIRMED legs (asOf-correct)
  const bands: EpisodeBand[] = eps.map((e) => {
    const ids = e.trace.source_bar_ids;
    return { i0: ids[0], i1: ids[ids.length - 1], kind: e.kind, dir: e.direction_sign, confirmed: true };
  });

  // forming leg — MIRRORS chEpisodeLens (last confirmed swing → current bar, PROVISIONAL · can repaint)
  const swings = confirmedSwings(bars, cfg.swing).sort((a, b) => a.k - b.k || (a.kind < b.kind ? -1 : 1));
  const last = swings[swings.length - 1];
  let forming: EpisodeBand | null = null;
  if (last && last.k < bars.length - 1) {
    const atr = atrCausal(bars, cfg.atrPeriod), a0 = atr[last.k] || 1e-9, Bk = bars.length - 1;
    let hi = -Infinity, lo = Infinity, path = 0;
    for (let j = last.k; j <= Bk; j++) { hi = Math.max(hi, bars[j].h); lo = Math.min(lo, bars[j].l); if (j > last.k) path += Math.abs(bars[j].c - bars[j - 1].c); }
    const net = bars[Bk].c - bars[last.k].c, rangeAtr = +((hi - lo) / a0).toFixed(4);
    const bodyRatio = path > 0 ? clamp01(Math.abs(net) / path) : 0, dir: -1 | 0 | 1 = net > 0 ? 1 : net < 0 ? -1 : 0;
    const opp = last.kind === "high" ? "low" : "high";
    const priorOpp = [...swings].reverse().find((s) => s.kind === opp);
    let pierce: number | null = null, reclaimed = false;
    if (priorOpp) { pierce = +((dir >= 0 ? hi - priorOpp.price : priorOpp.price - lo) / a0).toFixed(4); reclaimed = dir >= 0 ? bars[Bk].c < priorOpp.price : bars[Bk].c > priorOpp.price; }
    const { kind } = classifyLeg(cfg.thresholds, rangeAtr, bodyRatio, pierce, reclaimed);
    forming = { i0: last.k, i1: Bk, kind, dir, confirmed: false };
  }
  return { bands, forming };
}
