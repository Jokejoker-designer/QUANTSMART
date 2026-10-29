// marketInstabilityFeatures — a TRANSPARENT, causal instability fingerprint computed from raw OHLC. Same 6 features
// for the CURRENT window AND each historical episode → a REAL multi-feature similarity (not a 1-D scalar match), with
// per-feature EVIDENCE. Every feature ∈ [0,1], higher = more unstable. No advisor black-box; recomputable by anyone.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export interface InstFeatures {
  atrPct: number;      // ATR percentile in a rolling window — overall volatility LEVEL
  rangeExp: number;    // largest bar range / ATR — range EXPANSION (blow-off bars)
  reversal: number;    // fraction of return sign-flips — WHIPSAW / two-way churn
  spike: number;       // largest single-bar move / ATR — SPIKE / gap-like jump
  choppiness: number;  // 1 − directionality (net/path) — NON-trending churn
  wickiness: number;   // 1 − avg body/range — INDECISION (long wicks)
}
export type InstKey = keyof InstFeatures;
export const INST_KEYS: InstKey[] = ["atrPct", "rangeExp", "reversal", "spike", "choppiness", "wickiness"];
export const INST_LABEL: Record<InstKey, string> = {
  atrPct: "Vol (ATR %ile)", rangeExp: "Range expansion", reversal: "Whipsaw reversals", spike: "Bar spikes", choppiness: "Choppiness", wickiness: "Wicks / indecision",
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function atrSeries(bars: OhlcBar[], p = 14): number[] {
  const out: number[] = new Array(bars.length).fill(0);
  let a = bars.length ? bars[0].h - bars[0].l : 0; out[0] = a;
  for (let i = 1; i < bars.length; i++) { const pc = bars[i - 1].c; const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - pc), Math.abs(bars[i].l - pc)); a = (a * (p - 1) + tr) / p; out[i] = a; }
  return out;
}

// causal fingerprint at bar `at` (uses only bars ≤ at)
export function computeInstabilityFeatures(bars: OhlcBar[], at: number, N = 12, volWin = 300, atr?: number[]): InstFeatures {
  const a = atr ?? atrSeries(bars);
  at = Math.max(N, Math.min(bars.length - 1, at));
  const aAt = a[at] || 1e-9;
  const lo = Math.max(15, at - volWin + 1); let le = 0, tot = 0;
  for (let i = lo; i <= at; i++) { if (a[i] > 0) { tot++; if (a[i] <= aAt) le++; } }
  const atrPct = tot ? le / tot : 0.5;
  const w = bars.slice(Math.max(0, at - N + 1), at + 1);
  const maxRange = Math.max(...w.map((b) => b.h - b.l));
  const rangeExp = clamp01(maxRange / aAt / 6);
  const rets: number[] = []; for (let k = 1; k < w.length; k++) rets.push(Math.sign(w[k].c - w[k - 1].c));
  let flips = 0; for (let k = 1; k < rets.length; k++) if (rets[k] !== 0 && rets[k - 1] !== 0 && rets[k] !== rets[k - 1]) flips++;
  const reversal = rets.length > 1 ? flips / (rets.length - 1) : 0;
  let mx = 0; for (let k = 1; k < w.length; k++) mx = Math.max(mx, Math.abs(w[k].c - w[k - 1].c));
  const spike = clamp01(mx / aAt / 5);
  const net = Math.abs(w[w.length - 1].c - w[0].c); let path = 0; for (let k = 1; k < w.length; k++) path += Math.abs(w[k].c - w[k - 1].c);
  const choppiness = clamp01(1 - (path > 0 ? net / path : 0));
  let brs = 0, bc = 0; for (const b of w) { const rng = b.h - b.l; if (rng > 0) { brs += Math.abs(b.c - b.o) / rng; bc++; } }
  const wickiness = clamp01(1 - (bc ? brs / bc : 0.5));
  return { atrPct: +atrPct.toFixed(3), rangeExp: +rangeExp.toFixed(3), reversal: +reversal.toFixed(3), spike: +spike.toFixed(3), choppiness: +choppiness.toFixed(3), wickiness: +wickiness.toFixed(3) };
}

// a TRANSPARENT overall instability score = the simple MEAN of the 6 features (each ∈ [0,1], higher = harder to
// trade). EQUAL weight on purpose — no feature is privileged, so the score itself isn't a hidden coefficient.
// Recomputable from OHLC, unlike the advisor's opaque shock/danger/swan blend. High vol OR whipsaw OR chop all count.
export const INST_WEIGHT: Record<InstKey, number> = { atrPct: 1 / 6, rangeExp: 1 / 6, spike: 1 / 6, reversal: 1 / 6, choppiness: 1 / 6, wickiness: 1 / 6 };
export function instabilityScore(f: InstFeatures): number {
  let s = 0; for (const k of INST_KEYS) s += f[k];
  return +Math.min(1, s / INST_KEYS.length).toFixed(3);
}

export interface FeatureDiff { key: InstKey; now: number; ep: number; diff: number }
export interface InstSimilarity { similarity: number; distance: number; perFeature: FeatureDiff[] }
// normalized euclidean over the 6 features → similarity ∈ [0,1] (1 = identical), with per-feature evidence.
export function instSimilarity(now: InstFeatures, ep: InstFeatures): InstSimilarity {
  let sum = 0; const perFeature: FeatureDiff[] = [];
  for (const k of INST_KEYS) { const d = now[k] - ep[k]; sum += d * d; perFeature.push({ key: k, now: now[k], ep: ep[k], diff: +Math.abs(d).toFixed(3) }); }
  const distance = Math.sqrt(sum), maxDist = Math.sqrt(INST_KEYS.length);
  return { similarity: +Math.max(0, 1 - distance / maxDist).toFixed(3), distance: +distance.toFixed(3), perFeature };
}

// the fingerprint at an episode's PEAK bar (the bar in [startDate,endDate] with the largest range/ATR).
export function episodePeakFeatures(bars: OhlcBar[], startDate: string, endDate: string, atr?: number[]): { at: number; feat: InstFeatures } | null {
  const a = atr ?? atrSeries(bars);
  const s = startDate.slice(0, 10), e = endDate.slice(0, 10);
  let peakI = -1, peakVal = -Infinity;
  for (let i = 20; i < bars.length; i++) { const d = String(bars[i].t).slice(0, 10); if (d < s || d > e) continue; const v = (bars[i].h - bars[i].l) / (a[i] || 1e-9); if (v > peakVal) { peakVal = v; peakI = i; } }
  if (peakI < 0) return null;
  return { at: peakI, feat: computeInstabilityFeatures(bars, peakI, 12, 300, a) };
}
