// environmentFingerprint — WO-4. MEASURED, CAUSAL market-environment label at each bar (≤ t only).
// It is DESCRIPTIVE ("where are we now"), NEVER predictive. This is the prerequisite that lets the Atlas
// (WO-5) bucket each card's trades by the environment they ACTUALLY occurred in — upgrading the
// cardTaxonomy heuristic regime/vol/liquidity to `source: "measured"`. Pure · no engine · no lookahead.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { parseBarTime, classifySession, type Session } from "./simTimeframe.ts";

export type Regime = "TREND_UP" | "TREND_DOWN" | "RANGE" | "CHOP";
export type VolatilityBucket = "LOW" | "NORMAL" | "HIGH";
export type LiquiditySpread = "TIGHT" | "NORMAL" | "WIDE";

export interface EnvironmentFingerprint {
  index: number; time: string;
  regime: Regime;                 // from EMA structure + ADX (not a prediction)
  volatilityBucket: VolatilityBucket;   // from rolling ATR percentile (causal)
  liquiditySpread: LiquiditySpread;     // from session (broker GMT+3)
  session: Session; hourBucket: string; month: number;
  adx: number; atr: number; atrPercentile: number;     // the measured inputs (transparency)
  source: "measured";
}

export interface FingerprintOptions {
  emaFast?: number; emaSlow?: number; adxPeriod?: number; atrPeriod?: number;
  volLookback?: number; adxTrend?: number; adxRange?: number;
}

// ── causal indicator series (value at i uses only bars[0..i]) ──
function emaSeries(vals: number[], period: number): number[] {
  const k = 2 / (period + 1); const out: number[] = []; let e = vals[0] ?? 0;
  for (let i = 0; i < vals.length; i++) { e = i === 0 ? (vals[0] ?? 0) : vals[i] * k + e * (1 - k); out.push(e); }
  return out;
}
function trueRanges(bars: OhlcBar[]): number[] {
  return bars.map((b, i) => i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)));
}
// Wilder smoothing (RMA): seed with SMA of first `period`, then recursive. NaN before warmup.
function wilder(vals: number[], period: number): number[] {
  const out: number[] = new Array(vals.length).fill(NaN);
  if (vals.length < period) return out;
  let sum = 0; for (let i = 0; i < period; i++) sum += vals[i];
  let prev = sum / period; out[period - 1] = prev;
  for (let i = period; i < vals.length; i++) { prev = (prev * (period - 1) + vals[i]) / period; out[i] = prev; }
  return out;
}
function atrSeries(bars: OhlcBar[], period: number): number[] { return wilder(trueRanges(bars), period); }

function adxSeries(bars: OhlcBar[], period: number): number[] {
  const n = bars.length; const plusDM: number[] = [], minusDM: number[] = [], tr: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { plusDM.push(0); minusDM.push(0); tr.push(bars[0].h - bars[0].l); continue; }
    const up = bars[i].h - bars[i - 1].h, down = bars[i - 1].l - bars[i].l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)));
  }
  const sTR = wilder(tr, period), sPlus = wilder(plusDM, period), sMinus = wilder(minusDM, period);
  const dx: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (isNaN(sTR[i]) || sTR[i] === 0) continue;
    const pDI = 100 * sPlus[i] / sTR[i], mDI = 100 * sMinus[i] / sTR[i], sum = pDI + mDI;
    dx[i] = sum === 0 ? 0 : 100 * Math.abs(pDI - mDI) / sum;
  }
  // ADX = Wilder smoothing of the valid DX values (seed = SMA of first `period` valid DX)
  const adx: number[] = new Array(n).fill(NaN);
  const valid: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) { if (!isNaN(dx[i])) { valid.push(dx[i]); idx.push(i); } }
  if (valid.length < period) return adx;
  let prev = 0; for (let j = 0; j < period; j++) prev += valid[j]; prev /= period; adx[idx[period - 1]] = prev;
  for (let j = period; j < valid.length; j++) { prev = (prev * (period - 1) + valid[j]) / period; adx[idx[j]] = prev; }
  return adx;
}

// per-bar fingerprint array (null before warmup / before indicators valid). CAUSAL by construction.
export function environmentFingerprint(bars: OhlcBar[], opts: FingerprintOptions = {}): (EnvironmentFingerprint | null)[] {
  const emaF = opts.emaFast ?? 20, emaS = opts.emaSlow ?? 50, adxP = opts.adxPeriod ?? 14, atrP = opts.atrPeriod ?? 14;
  const L = opts.volLookback ?? 300, adxTrend = opts.adxTrend ?? 22, adxRange = opts.adxRange ?? 12;
  const closes = bars.map((b) => b.c);
  const ef = emaSeries(closes, emaF), es = emaSeries(closes, emaS);
  const atr = atrSeries(bars, atrP), adx = adxSeries(bars, adxP);
  const warmup = Math.max(emaS, atrP, adxP * 2);
  return bars.map((b, t) => {
    if (t < warmup || isNaN(adx[t]) || isNaN(atr[t])) return null;
    const pt = parseBarTime(b.t);
    const session = classifySession(pt.h, pt.mi);
    // regime — EMA direction + ADX strength (descriptive, not predictive)
    const up = ef[t] > es[t];
    const regime: Regime = adx[t] >= adxTrend ? (up ? "TREND_UP" : "TREND_DOWN") : adx[t] >= adxRange ? "RANGE" : "CHOP";
    // volatility — ATR percentile within a CAUSAL rolling window [t-L+1 .. t]
    const lo = Math.max(0, t - L + 1); let le = 0, tot = 0;
    for (let i = lo; i <= t; i++) { if (!isNaN(atr[i])) { tot++; if (atr[i] <= atr[t]) le++; } }
    const pct = tot ? le / tot : 0.5;
    const volatilityBucket: VolatilityBucket = pct < 0.33 ? "LOW" : pct > 0.66 ? "HIGH" : "NORMAL";
    // liquidity — broker session (overlap tightest, Asia/rollover widest)
    const liquiditySpread: LiquiditySpread = session === "overlap" ? "TIGHT" : session === "single" ? "NORMAL" : "WIDE";
    return {
      index: t, time: b.t, regime, volatilityBucket, liquiditySpread, session,
      hourBucket: String(pt.h), month: pt.mo,
      adx: +adx[t].toFixed(1), atr: +atr[t].toFixed(3), atrPercentile: +pct.toFixed(3), source: "measured",
    };
  });
}

// single-bar fingerprint AS OF index t — only needs bars[0..t] (proves no-lookahead at the call site).
export function fingerprintAt(bars: OhlcBar[], t: number, opts: FingerprintOptions = {}): EnvironmentFingerprint | null {
  if (t < 0 || t >= bars.length) return null;
  return environmentFingerprint(bars.slice(0, t + 1), opts)[t] ?? null;
}

// environment bucket key for the Atlas (WO-5): regime × session.
export function environmentKey(fp: EnvironmentFingerprint): string { return `${fp.regime}·${fp.session}`; }
