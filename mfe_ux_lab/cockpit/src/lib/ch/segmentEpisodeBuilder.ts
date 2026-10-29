// CH-WO-1 — Segment Episode Builder (L2). From CONFIRMED swing points → AsOfEpisode[] classified by
// SCALE-FREE geometry (IMPULSE / CORRECTIVE / RANGE / SWEEP_RECLAIM / FAILED_BREAKOUT / UNCLASSIFIED).
// Causal by construction: a leg ending at swing B is only KNOWN at B.confirm_index, and every feature uses
// bars ≤ B.k < confirm_index. No cluster, no similarity, no query (those are CH-WO-2..4). Authority CH_AUTH_1
// (offline + may be shown as a UI diagnostic; NEVER touches a verdict). Descriptive geometry — not a forecast.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "../simConfig.ts";
import type { AsOfEpisode, EpisodeKind, SegmentEpisodeBase, CalibrationSpec } from "./chTypes.ts";
import { mkAsOfEpisode } from "./chTypes.ts";
import { buildSourceTrace } from "./chTrace.ts";
import { confirmedSwings, type ConfirmedSwing, type ConfirmedSwingConfig, DEFAULT_SWING_CONFIG } from "./confirmedSwing.ts";
import { asOfHigherTf } from "../moduleTfScope.ts";

// optional higher-timeframe context for mtf_candle_construction features (causal via asOfHigherTf).
export interface HigherTfContext { higherBars: OhlcBar[]; higherTf: Timeframe }

export const EPISODE_KINDS: EpisodeKind[] = ["IMPULSE", "CORRECTIVE", "RANGE", "SWEEP_RECLAIM", "FAILED_BREAKOUT", "UNCLASSIFIED"];

// FIXED defaults (scale-free → era-stable). Each is declared as a calibration_spec so the shared
// self-calibration gate (CH-WO-0) can later tune it on TRAIN→OOS→era — SHADOW_ONLY until proven.
export interface SegmentThresholds {
  range_small: number;       // ATR — below this + low body = RANGE
  impulse_body: number;      // net/path ≥ this = directional
  impulse_range: number;     // ATR — span ≥ this = meaningful move
  corrective_body: number;   // net/path < this = choppy/counter
  sweep_pierce_atr: number;  // ATR a leg must pierce a prior same-kind level to count as a sweep/breakout
}
export const DEFAULT_THRESHOLDS: SegmentThresholds = { range_small: 1.0, impulse_body: 0.6, impulse_range: 1.5, corrective_body: 0.45, sweep_pierce_atr: 0.25 };

// NOTE on `enrich`: the local_candle_context + mtf `anatomy_ext` features were a HYPOTHESIS to separate gold
// from noise. The 2026-06-27 hard probe REJECTED it (enriched cross-era ARI ≤ random-walk ARI, and the
// enriched feature distribution is era-SENSITIVE). So enrichment is OPT-IN (default OFF) — the shipped episode
// keeps the validated base representation; the enriched path stays available for future experiments only.
export interface SegmentBuilderConfig { swing: ConfirmedSwingConfig; thresholds: SegmentThresholds; atrPeriod: number; enrich?: boolean }
export const DEFAULT_BUILDER_CONFIG: SegmentBuilderConfig = { swing: DEFAULT_SWING_CONFIG, thresholds: DEFAULT_THRESHOLDS, atrPeriod: 14, enrich: false };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : +x.toFixed(4));

// causal Wilder ATR — atr[i] uses only bars ≤ i (TR over the prior close). atr[0] = h-l of bar 0.
export function atrCausal(bars: OhlcBar[], period = 14): number[] {
  const out: number[] = new Array(bars.length).fill(0);
  let atr = bars.length ? bars[0].h - bars[0].l : 0; out[0] = atr;
  for (let i = 1; i < bars.length; i++) {
    const pc = bars[i - 1].c;
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - pc), Math.abs(bars[i].l - pc));
    atr = (atr * (period - 1) + tr) / period;
    out[i] = atr;
  }
  return out;
}

export function classifyLeg(t: SegmentThresholds, rangeAtr: number, bodyRatio: number, pierceAtr: number | null, reclaimed: boolean):
  { kind: EpisodeKind; confidence: number } {
  if (pierceAtr != null && pierceAtr > t.sweep_pierce_atr) {
    if (reclaimed) return { kind: "SWEEP_RECLAIM", confidence: clamp01(pierceAtr / (2 * t.sweep_pierce_atr)) };
    if (bodyRatio < t.impulse_body) return { kind: "FAILED_BREAKOUT", confidence: clamp01(pierceAtr / (2 * t.sweep_pierce_atr)) };
    // pierced + strong follow-through → falls through to IMPULSE below
  }
  if (rangeAtr < t.range_small && bodyRatio < t.corrective_body) return { kind: "RANGE", confidence: clamp01(1 - bodyRatio) };
  if (bodyRatio >= t.impulse_body && rangeAtr >= t.impulse_range) return { kind: "IMPULSE", confidence: clamp01((bodyRatio / t.impulse_body + rangeAtr / t.impulse_range) / 2 - 0.5) };
  if (bodyRatio < t.corrective_body) return { kind: "CORRECTIVE", confidence: clamp01(1 - bodyRatio) };
  return { kind: "UNCLASSIFIED", confidence: 0.3 };
}

// the previous CONFIRMED swing of the same kind as `swing`, among swings strictly before index `upto`.
function priorSameKind(swings: ConfirmedSwing[], upto: number, kind: "high" | "low"): ConfirmedSwing | null {
  for (let i = upto - 1; i >= 0; i--) if (swings[i].kind === kind) return swings[i];
  return null;
}

// enriched SCALE-FREE features (order = ANATOMY_EXT_KEYS). local_candle_context from the segment bars; mtf from
// the LAST CLOSED higher bar as-of the segment start (causal). All ∈ [0,1]; no absolute price.
function extFeatures(bars: OhlcBar[], Ak: number, Bk: number, atr: number[], dir: number, asOf: number[] | null, higher: OhlcBar[] | null): number[] {
  let clv = 0, uw = 0, lw = 0, n = 0;
  for (let j = Ak; j <= Bk; j++) { const b = bars[j], rng = b.h - b.l; if (rng <= 0) { clv += 0.5; n++; continue; } clv += (b.c - b.l) / rng; uw += (b.h - Math.max(b.o, b.c)) / rng; lw += (Math.min(b.o, b.c) - b.l) / rng; n++; }
  const clvMean = n ? clamp01(clv / n) : 0.5, upperWick = n ? clamp01(uw / n) : 0, lowerWick = n ? clamp01(lw / n) : 0;
  const rangeExp = clamp01(((atr[Bk] || 0) / (atr[Ak] || 1e-9)) / 3);   // vol change over the leg, capped at 3×
  // mtf_candle_construction (causal): higher-TF momentum agreement + position within the closed higher bar.
  let htfAlign = 0.5, htfPos = 0.5;
  if (asOf && higher && higher.length) {
    const h = asOf[Ak];
    if (h >= 1) { const slope = Math.sign(higher[h].c - higher[h - 1].c); htfAlign = slope === 0 ? 0.5 : (slope === Math.sign(dir) && dir !== 0 ? 1 : 0); }
    if (h >= 0) { const hb = higher[h], rng = hb.h - hb.l; htfPos = rng > 0 ? clamp01((bars[Ak].c - hb.l) / rng) : 0.5; }
  }
  return [clvMean, upperWick, lowerWick, rangeExp, htfAlign, htfPos];
}

export function buildSegmentEpisodes(bars: OhlcBar[], tf: Timeframe, cfg: SegmentBuilderConfig = DEFAULT_BUILDER_CONFIG, ctx?: HigherTfContext): AsOfEpisode[] {
  if (bars.length < 3) return [];
  const swings = confirmedSwings(bars, cfg.swing).sort((a, b) => a.k - b.k || (a.kind < b.kind ? -1 : 1));
  const atr = atrCausal(bars, cfg.atrPeriod);
  const asOf = ctx && cfg.enrich ? asOfHigherTf(bars, ctx.higherBars, tf, ctx.higherTf) : null;
  const out: AsOfEpisode[] = [];
  for (let i = 1; i < swings.length; i++) {
    const A = swings[i - 1], B = swings[i];
    if (B.k <= A.k) continue;
    const a0 = atr[A.k] || 1e-9;
    const seg = bars.slice(A.k, B.k + 1);
    let hi = -Infinity, lo = Infinity, path = 0;
    for (let j = 0; j < seg.length; j++) { hi = Math.max(hi, seg[j].h); lo = Math.min(lo, seg[j].l); if (j > 0) path += Math.abs(seg[j].c - seg[j - 1].c); }
    const net = bars[B.k].c - bars[A.k].c;
    const rangeAtr = +((hi - lo) / a0).toFixed(4);
    const bodyRatio = path > 0 ? clamp01(Math.abs(net) / path) : 0;
    const dir: -1 | 0 | 1 = net > 0 ? 1 : net < 0 ? -1 : 0;
    // sweep/breakout context: did this leg pierce the prior SAME-kind level (the level B is testing)?
    const prior = priorSameKind(swings, i, B.kind);
    let pierceAtr: number | null = null, reclaimed = false;
    if (prior) {
      const pierce = B.kind === "high" ? (hi - prior.price) / a0 : (prior.price - lo) / a0;
      pierceAtr = +pierce.toFixed(4);
      reclaimed = B.kind === "high" ? bars[B.k].c < prior.price : bars[B.k].c > prior.price;
    }
    const { kind, confidence } = classifyLeg(cfg.thresholds, rangeAtr, bodyRatio, pierceAtr, reclaimed);
    const base: SegmentEpisodeBase = {
      episode_id: `${tf}-${A.k}-${B.k}`,
      kind, detection_confidence: confidence,
      range_atr: rangeAtr, body_ratio: bodyRatio, duration_bars: B.k - A.k, direction_sign: dir,
      trace: buildSourceTrace(bars, tf, Array.from({ length: B.k - A.k + 1 }, (_, x) => A.k + x)),
      anatomy_ext: cfg.enrich ? extFeatures(bars, A.k, B.k, atr, dir, asOf, ctx?.higherBars ?? null).map((x) => +x.toFixed(4)) : undefined,
    };
    out.push(mkAsOfEpisode(base, bars[Math.min(B.confirm_index, bars.length - 1)].t));   // KNOWN at B's confirmation
  }
  return out;
}

// the as-of index at which each episode becomes known (for the no-lookahead harness: at = B.confirm_index).
export function episodeKnownAt(bars: OhlcBar[], tf: Timeframe, cfg: SegmentBuilderConfig = DEFAULT_BUILDER_CONFIG): { at: number; episode_id: string; kind: EpisodeKind }[] {
  const swings = confirmedSwings(bars, cfg.swing).sort((a, b) => a.k - b.k || (a.kind < b.kind ? -1 : 1));
  const eps = buildSegmentEpisodes(bars, tf, cfg);
  return eps.map((e, i) => ({ at: swings[i + 1]?.confirm_index ?? bars.length - 1, episode_id: e.episode_id, kind: e.kind }));
}

// calibration_spec declarations (manager §5.5) — self-learning is the DEFAULT; these only reach a verdict
// AFTER the shared gate (fit→OOS→era≥0.70→beat-default→SHADOW). AUTO mode; user may override to MANUAL.
export const SEGMENT_BUILDER_SPECS: CalibrationSpec[] = [
  { module_id: "segment_episode_builder", param: "impulse_body", range: [0.5, 0.8], objective: "MAXIMIZE_ERA_STABILITY", fit_window: { startFrac: 0, endFrac: 0.6 }, oos_window: { startFrac: 0.6, endFrac: 1 }, default_value: DEFAULT_THRESHOLDS.impulse_body, mode: "AUTO" },
  { module_id: "segment_episode_builder", param: "impulse_range", range: [1.0, 2.5], objective: "MAXIMIZE_ERA_STABILITY", fit_window: { startFrac: 0, endFrac: 0.6 }, oos_window: { startFrac: 0.6, endFrac: 1 }, default_value: DEFAULT_THRESHOLDS.impulse_range, mode: "AUTO" },
  { module_id: "segment_episode_builder", param: "range_small", range: [0.6, 1.5], objective: "MAXIMIZE_ERA_STABILITY", fit_window: { startFrac: 0, endFrac: 0.6 }, oos_window: { startFrac: 0.6, endFrac: 1 }, default_value: DEFAULT_THRESHOLDS.range_small, mode: "AUTO" },
  { module_id: "segment_episode_builder", param: "sweep_pierce_atr", range: [0.1, 0.6], objective: "MAXIMIZE_ERA_STABILITY", fit_window: { startFrac: 0, endFrac: 0.6 }, oos_window: { startFrac: 0.6, endFrac: 1 }, default_value: DEFAULT_THRESHOLDS.sweep_pierce_atr, mode: "AUTO" },
];
