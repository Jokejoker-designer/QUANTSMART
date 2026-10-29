// classicIndicators — standard, well-defined technical indicators (Ichimoku / MACD / Stochastic /
// Bollinger / Fibonacci / ADX). The CALCULATION is proven; the EDGE is NOT — these are SHADOW-grade
// vote/gate contributors that compose with the existing fusion/combine/gate system. Causal (value at i
// uses bars[0..i] only), volume-free. Each must earn trust via calibration + walk-forward.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export interface ClassicFlags { ichimoku: boolean; macd: boolean; stochastic: boolean; bollinger: boolean; fib: boolean; adx: boolean }
export const classicFlags = (has: (id: string) => boolean): ClassicFlags => ({
  ichimoku: has("ichimoku"), macd: has("macd"), stochastic: has("stochastic"), bollinger: has("bollinger"), fib: has("fib_retrace"), adx: has("adx"),
});
export const anyClassicTrigger = (f: ClassicFlags) => f.ichimoku || f.macd || f.stochastic || f.bollinger || f.fib;
export const anyClassic = (f: ClassicFlags) => anyClassicTrigger(f) || f.adx;
export const ADX_MIN = 20;

export interface ClassicSeries {
  tenkan: number[]; kijun: number[]; cloudTop: number[]; cloudBot: number[];
  bbUp: number[]; bbLow: number[];
  macd: number[]; macdSig: number[];
  stochK: number[];
  adx: number[];
  swingHigh: number[]; swingLow: number[];
}

function ema(vals: number[], p: number): number[] { const k = 2 / (p + 1); const o: number[] = []; let prev = NaN; for (let i = 0; i < vals.length; i++) { prev = isNaN(prev) ? vals[i] : vals[i] * k + prev * (1 - k); o.push(prev); } return o; }
function rollMax(a: number[], i: number, p: number): number { let m = -Infinity; for (let k = Math.max(0, i - p + 1); k <= i; k++) if (a[k] > m) m = a[k]; return m; }
function rollMin(a: number[], i: number, p: number): number { let m = Infinity; for (let k = Math.max(0, i - p + 1); k <= i; k++) if (a[k] < m) m = a[k]; return m; }

export function computeClassic(bars: OhlcBar[], f: ClassicFlags): ClassicSeries {
  const n = bars.length; const NA = () => new Array(n).fill(NaN);
  const closes = bars.map((b) => b.c), highs = bars.map((b) => b.h), lows = bars.map((b) => b.l);
  const s: ClassicSeries = { tenkan: NA(), kijun: NA(), cloudTop: NA(), cloudBot: NA(), bbUp: NA(), bbLow: NA(), macd: NA(), macdSig: NA(), stochK: NA(), adx: NA(), swingHigh: NA(), swingLow: NA() };

  if (f.ichimoku) {
    const tk: number[] = NA(), kj: number[] = NA(), sa: number[] = NA(), sb: number[] = NA();
    for (let i = 0; i < n; i++) {
      if (i >= 8) tk[i] = (rollMax(highs, i, 9) + rollMin(lows, i, 9)) / 2;
      if (i >= 25) kj[i] = (rollMax(highs, i, 26) + rollMin(lows, i, 26)) / 2;
      if (i >= 25) sa[i] = (tk[i] + kj[i]) / 2;                                  // Senkou A (raw)
      if (i >= 51) sb[i] = (rollMax(highs, i, 52) + rollMin(lows, i, 52)) / 2;   // Senkou B (raw)
    }
    s.tenkan = tk; s.kijun = kj;
    for (let i = 0; i < n; i++) { if (i >= 26 && !isNaN(sa[i - 26]) && !isNaN(sb[i - 26])) { s.cloudTop[i] = Math.max(sa[i - 26], sb[i - 26]); s.cloudBot[i] = Math.min(sa[i - 26], sb[i - 26]); } }   // cloud shifted +26 (no lookahead: at i uses data ≤ i-26)
  }
  if (f.bollinger) {
    const P = 20; for (let i = P - 1; i < n; i++) { let sum = 0; for (let k = i - P + 1; k <= i; k++) sum += closes[k]; const mid = sum / P; let v = 0; for (let k = i - P + 1; k <= i; k++) v += (closes[k] - mid) ** 2; const sd = Math.sqrt(v / P); s.bbUp[i] = mid + 2 * sd; s.bbLow[i] = mid - 2 * sd; }
  }
  if (f.macd) { const e12 = ema(closes, 12), e26 = ema(closes, 26); for (let i = 0; i < n; i++) s.macd[i] = e12[i] - e26[i]; s.macdSig = ema(s.macd, 9); }
  if (f.stochastic) { const P = 14; for (let i = P - 1; i < n; i++) { const hi = rollMax(highs, i, P), lo = rollMin(lows, i, P); s.stochK[i] = hi > lo ? (closes[i] - lo) / (hi - lo) * 100 : 50; } }
  if (f.adx) {
    const P = 14; let smTR = 0, smP = 0, smM = 0, adxPrev = NaN; const dx: number[] = NA();
    for (let i = 1; i < n; i++) {
      const up = highs[i] - highs[i - 1], dn = lows[i - 1] - lows[i];
      const pDM = up > dn && up > 0 ? up : 0, mDM = dn > up && dn > 0 ? dn : 0;
      const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
      if (i <= P) { smTR += tr; smP += pDM; smM += mDM; if (i === P) { /* seeded */ } }
      else { smTR = smTR - smTR / P + tr; smP = smP - smP / P + pDM; smM = smM - smM / P + mDM; }
      if (i >= P && smTR > 0) { const diP = 100 * smP / smTR, diM = 100 * smM / smTR; const sum = diP + diM; dx[i] = sum > 0 ? 100 * Math.abs(diP - diM) / sum : 0; }
      if (i >= 2 * P) { adxPrev = isNaN(adxPrev) ? (() => { let a = 0; for (let k = P + 1; k <= 2 * P; k++) a += dx[k]; return a / P; })() : (adxPrev * (P - 1) + dx[i]) / P; s.adx[i] = adxPrev; }
    }
  }
  if (f.fib) { for (let i = 20; i < n; i++) { s.swingHigh[i] = rollMax(highs, i, 20); s.swingLow[i] = rollMin(lows, i, 20); } }
  return s;
}

export interface CVote { dir: number; w: number; rel: number; src: string }
// votes (compose into the engine's votes[] → fusion/bayesian/majority). regime = engine's current regime.
export function classicEntryVotes(i: number, b: OhlcBar, regime: number, atr_i: number, s: ClassicSeries, f: ClassicFlags): CVote[] {
  const out: CVote[] = []; const a = atr_i || 1;
  if (f.ichimoku && !isNaN(s.cloudTop[i]) && !isNaN(s.tenkan[i]) && !isNaN(s.kijun[i])) {
    if (b.c > s.cloudTop[i] && s.tenkan[i] > s.kijun[i]) out.push({ dir: 1, w: 1, rel: 0.55, src: "ichimoku" });
    else if (b.c < s.cloudBot[i] && s.tenkan[i] < s.kijun[i]) out.push({ dir: -1, w: 1, rel: 0.55, src: "ichimoku" });
  }
  if (f.macd && i > 0 && !isNaN(s.macdSig[i]) && !isNaN(s.macdSig[i - 1])) {
    if (s.macd[i] > s.macdSig[i] && s.macd[i - 1] <= s.macdSig[i - 1]) out.push({ dir: 1, w: 0.8, rel: 0.53, src: "macd" });
    else if (s.macd[i] < s.macdSig[i] && s.macd[i - 1] >= s.macdSig[i - 1]) out.push({ dir: -1, w: 0.8, rel: 0.53, src: "macd" });
  }
  if (f.stochastic && i > 0 && !isNaN(s.stochK[i]) && !isNaN(s.stochK[i - 1])) {
    if (s.stochK[i] < 25 && s.stochK[i] > s.stochK[i - 1]) out.push({ dir: 1, w: 0.7, rel: 0.52, src: "stochastic" });
    else if (s.stochK[i] > 75 && s.stochK[i] < s.stochK[i - 1]) out.push({ dir: -1, w: 0.7, rel: 0.52, src: "stochastic" });
  }
  if (f.bollinger && !isNaN(s.bbLow[i])) {                                   // mean-revert fade
    if (b.c < s.bbLow[i]) out.push({ dir: 1, w: 0.7, rel: 0.52, src: "bollinger" });
    else if (b.c > s.bbUp[i]) out.push({ dir: -1, w: 0.7, rel: 0.52, src: "bollinger" });
  }
  if (f.fib && !isNaN(s.swingHigh[i])) {
    const rng = s.swingHigh[i] - s.swingLow[i];
    if (rng > 0) {
      const near = (lvl: number) => Math.abs(b.l - lvl) < 0.4 * a || Math.abs(b.h - lvl) < 0.4 * a;
      const fibs = [0.382, 0.5, 0.618];
      if (regime > 0 && b.c > b.o && fibs.some((r) => near(s.swingHigh[i] - rng * r))) out.push({ dir: 1, w: 0.8, rel: 0.54, src: "fib_retrace" });
      else if (regime < 0 && b.c < b.o && fibs.some((r) => near(s.swingLow[i] + rng * r))) out.push({ dir: -1, w: 0.8, rel: 0.54, src: "fib_retrace" });
    }
  }
  return out;
}
// ADX trend-strength gate (can DOWNGRADE → veto): block entries when ADX below threshold (no trend).
export function classicGateBlocked(i: number, s: ClassicSeries, f: ClassicFlags, adxMin = ADX_MIN): boolean {
  if (!f.adx) return false; const v = s.adx[i]; return !isNaN(v) && v < adxMin;
}
