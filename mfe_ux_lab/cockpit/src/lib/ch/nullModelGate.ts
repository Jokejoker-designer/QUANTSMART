// CH — the NULL-RELATIVE gate ("Phương án a"): a metric value is meaningless alone; it only counts when it
// beats two NULL models. This replaces the absolute era-stability threshold (0.70) that we proved passes a
// random walk. Two nulls: (1) PERMUTATION null = random partitions → "is there even a detectable era effect,
// or is the metric saturated?", and (2) RANDOM-WALK null = vol-matched shuffled-returns → "is the structure
// real gold, or just noise geometry?". A gate PASSES only when the real signal sits inside the permutation
// null AND separates from the random-walk null by a margin. Used to (re)certify WO-1/2 + as the WO-3 hard probe.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function median(a: number[]): number { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }
function shuffle<T>(a: T[], rnd: () => number): T[] { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }

// ── RANDOM-WALK null ── shuffle close-to-close returns (kills trend/serial structure, KEEPS the exact return
// multiset → identical volatility + same endpoint). Intrabar h/l = constant median range. "Is it just noise?"
export function randomWalkNull(bars: OhlcBar[], seed = 777): OhlcBar[] {
  if (bars.length < 3) return bars.slice();
  const c = bars.map((b) => b.c);
  const rets = shuffle(c.slice(1).map((v, i) => v - c[i]), mulberry32(seed));
  const hl = median(bars.map((b) => b.h - b.l));
  const sc: number[] = [c[0]]; for (const r of rets) sc.push(sc[sc.length - 1] + r);
  return sc.map((v, i) => ({ t: bars[i].t, o: v, h: v + hl / 2, l: v - hl / 2, c: v } as unknown as OhlcBar));
}

// ── PERMUTATION null ── randomly split `items` into two halves K times → percentiles of a partition metric.
// The "no group effect" reference band. If the real time-split sits inside this band, eras are indistinguishable.
export interface NullBand { p5: number; median: number; min: number; max: number; samples: number }
export function permutationNullBand<T>(items: T[], metric: (a: T[], b: T[]) => number, opts: { K?: number; seed?: number } = {}): NullBand {
  const K = opts.K ?? 500; const rnd = mulberry32(opts.seed ?? 12345); const out: number[] = [];
  for (let it = 0; it < K; it++) { const a = shuffle(items, rnd); const m = a.length >> 1; out.push(metric(a.slice(0, m), a.slice(m))); }
  out.sort((x, y) => x - y);
  return { p5: out[Math.floor(K * 0.05)], median: out[K >> 1], min: out[0], max: out[K - 1], samples: K };
}

// ── null-relative STABILITY verdict (replaces absolute 0.70 for WO-1/2) ──
// PASS iff: real era-split is WITHIN the permutation null (no detectable era effect) AND the vocabulary is
// distinct from the random-walk null by ≥ minRatio× the era variation (signal ≫ era-noise). instability = 1−stability.
export interface NullStabilityInput { realStability: number; permP5: number; eraInstability: number; goldVsNullInstability: number; minRatio?: number }
export interface NullGateVerdict { pass: boolean; withinPermNull: boolean; discrimRatio: number; reasons: string[] }
export function nullRelativeStabilityVerdict(inp: NullStabilityInput): NullGateVerdict {
  const minRatio = inp.minRatio ?? 4;
  const withinPermNull = inp.realStability >= inp.permP5;
  const discrimRatio = inp.eraInstability > 0 ? +(inp.goldVsNullInstability / inp.eraInstability).toFixed(2) : Number.POSITIVE_INFINITY;
  const reasons: string[] = [];
  if (!withinPermNull) reasons.push(`era-split ${inp.realStability} < permutation p5 ${inp.permP5} → an era effect IS detected (not stable)`);
  if (discrimRatio < minRatio) reasons.push(`signal/era-noise ratio ${discrimRatio} < ${minRatio} → vocabulary too close to a random walk (hollow PASS)`);
  return { pass: withinPermNull && discrimRatio >= minRatio, withinPermNull, discrimRatio, reasons };
}

// ── HARD cluster probe verdict (the user's strict CH-WO-3 entry condition) ──
// PASS iff gold cross-era ARI clears an absolute floor AND beats the random-walk ARI by a margin.
// Otherwise CH stays a descriptive lens (CANVAS_LENS_PREVIEW) — clustering is NOT built.
export interface HardProbeInput { goldARI: number; rwARI: number; floor?: number; margin?: number }
export interface HardProbeVerdict { pass: boolean; reasons: string[]; goldARI: number; rwARI: number; lift: number; floor: number; margin: number }
export function hardClusterProbeVerdict(inp: HardProbeInput): HardProbeVerdict {
  const floor = inp.floor ?? 0.80, margin = inp.margin ?? 0.10;
  const lift = +(inp.goldARI - inp.rwARI).toFixed(3); const reasons: string[] = [];
  if (inp.goldARI < floor) reasons.push(`gold ARI ${inp.goldARI} < floor ${floor}`);
  if (lift < margin) reasons.push(`gold−RW lift ${lift} < margin ${margin} → clusters not distinct from noise`);
  return { pass: inp.goldARI >= floor && lift >= margin, reasons, goldARI: inp.goldARI, rwARI: inp.rwARI, lift, floor, margin };
}
