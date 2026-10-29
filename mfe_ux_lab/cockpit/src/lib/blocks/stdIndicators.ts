// stdIndicators — well-known indicators (Ichimoku · Fibonacci · Bollinger · Donchian · SuperTrend · MACD) as
// PARAMETERISED templates: each computes CAUSALLY from (bars, params) so the L2 sandbox can show them AND let
// the user tweak the params → save their own module. CONTEXT only (trend/level/vol/momentum) — never an order.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { FeatureUsageRole } from "./featureRoles.ts";
import type { RegimeView } from "./l2Eval.ts";

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const winAt = <T,>(a: T[], i: number, p: number) => a.slice(Math.max(0, i - p + 1), i + 1);
export function emaArr(s: number[], p: number): number[] { const k = 2 / (p + 1); let e = s[0] ?? 0; return s.map((v, i) => (i === 0 ? (e = v) : (e = v * k + e * (1 - k)))); }
export function smaArr(s: number[], p: number): number[] { return s.map((_, i) => mean(winAt(s, i, p))); }
export function stdArr(s: number[], p: number): number[] { return s.map((_, i) => { const w = winAt(s, i, p), m = mean(w); return Math.sqrt(mean(w.map((x) => (x - m) ** 2))); }); }
export function hiArr(s: number[], p: number): number[] { return s.map((_, i) => Math.max(...winAt(s, i, p))); }
export function loArr(s: number[], p: number): number[] { return s.map((_, i) => Math.min(...winAt(s, i, p))); }
export function atrArr(bars: OhlcBar[], p: number): number[] { const out = new Array(bars.length).fill(1); let a = bars[0] ? bars[0].h - bars[0].l : 1; out[0] = a || 1; for (let i = 1; i < bars.length; i++) { const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); a = (a * (p - 1) + tr) / p; out[i] = a; } return out; }
const shiftFwd = (s: number[], k: number) => s.map((_, i) => (i - k >= 0 ? s[i - k] : NaN));
const P = (p: Record<string, number> | undefined, k: string, def: number) => { const v = p?.[k]; return typeof v === "number" && isFinite(v) ? v : def; };
const PI = (p: Record<string, number> | undefined, k: string, def: number) => Math.round(P(p, k, def));

export interface IndicatorOverlay {
  lines?: { name: string; color: string; series: number[] }[];
  cloud?: { a: number[]; b: number[]; up: string; down: string };
  bands?: { upper: number[]; lower: number[]; mid?: number[]; color: string };
  bandList?: { upper: number[]; lower: number[]; mid?: number[]; color: string }[];  // multiple bands (from-scratch L1 overlay)
  levels?: { label: string; price: number; color: string }[];
  sub?: { name: string; color: string; series: number[]; hist?: boolean }[];
}
export interface IndParam { name: string; label: string; def: number; min: number; max: number; step?: number }
export interface StdIndicator { key: string; name: string; category: string; role: FeatureUsageRole; desc: string; context: string; buildFrom: string; params: IndParam[]; compute: (bars: OhlcBar[], p?: Record<string, number>) => IndicatorOverlay }

export const STD_INDICATORS: StdIndicator[] = [
  {
    key: "ichimoku", name: "Ichimoku Kinko Hyo", category: "Trend / Cloud", role: "BIAS_TREND",
    desc: "Tenkan, Kijun and displaced Senkou A/B cloud", context: "Price above or below the causal cloud describes trend context. Cloud width is a geometric measure, not proof of trend strength.", buildFrom: "L1: rolling highs/lows and their midpoint form Tenkan/Kijun. The cloud combines their midpoint with the span-B midpoint and the configured displacement.",
    params: [{ name: "tenkan", label: "Tenkan", def: 9, min: 2, max: 30 }, { name: "kijun", label: "Kijun", def: 26, min: 5, max: 60 }, { name: "spanB", label: "Span B", def: 52, min: 10, max: 120 }, { name: "shift", label: "Cloud shift", def: 26, min: 0, max: 60 }],
    compute: (b, p) => { const T = PI(p, "tenkan", 9), K = PI(p, "kijun", 26), SB = PI(p, "spanB", 52), SH = PI(p, "shift", 26); const H = b.map((x) => x.h), L = b.map((x) => x.l); const tk = H.map((_, i) => (Math.max(...winAt(H, i, T)) + Math.min(...winAt(L, i, T))) / 2); const kj = H.map((_, i) => (Math.max(...winAt(H, i, K)) + Math.min(...winAt(L, i, K))) / 2); const sA = tk.map((v, i) => (v + kj[i]) / 2); const sB = H.map((_, i) => (Math.max(...winAt(H, i, SB)) + Math.min(...winAt(L, i, SB))) / 2); return { lines: [{ name: "Tenkan", color: "#37c0ff", series: tk }, { name: "Kijun", color: "#e3b341", series: kj }], cloud: { a: shiftFwd(sA, SH), b: shiftFwd(sB, SH), up: "#21d07a", down: "#f7768e" } }; },
  },
  {
    key: "fibonacci", name: "Fibonacci Retracement", category: "Level / Context", role: "FILTER_CONTEXT",
    desc: "Swing levels at 0, 23.6, 38.2, 50, 61.8, 78.6 and 100%", context: "Fibonacci levels are reference context, not execution instructions.", buildFrom: "L1: Swing High − Swing Low defines the range; each level is High − ratio × range.",
    params: [{ name: "mode", label: "Mode 0=swing · 1=range", def: 0, min: 0, max: 1 }, { name: "strength", label: "Swing strength (bar)", def: 3, min: 1, max: 10 }, { name: "lookback", label: "Range lookback", def: 120, min: 20, max: 300 }],
    // SWING mode (mặc-định): neo vào pivot-high↔pivot-low ĐÃ XÁC-NHẬN gần nhất (K bar mỗi bên) → 7 mức TĨNH, chỉ đổi
    // khi swing MỚI confirm (hết staircase). CAUSAL: pivot tại q chỉ dùng khi confirm ở bar q+K, mọi nến đọc ≤ i → fib[i]
    // KHÔNG đổi khi cắt tương-lai (harness chứng). RANGE mode: rolling hi/lo cuộn (Auto-Fib). Overlay · advisory · no-order.
    compute: (b, p) => {
      const rs: [number, string][] = [[0, "#f7768e"], [0.236, "#e3b341"], [0.382, "#9d8bff"], [0.5, "#5ad1c4"], [0.618, "#37c0ff"], [0.786, "#a371f7"], [1, "#21d07a"]];
      const n = b.length;
      if (PI(p, "mode", 0) === 1) {   // RANGE (Auto-Fib cuộn)
        const LB = PI(p, "lookback", 120), H = hiArr(b.map((x) => x.h), LB), L = loArr(b.map((x) => x.l), LB);
        return { lines: rs.map(([r, c]) => ({ name: `Fib ${(r * 100).toFixed(1)}% (range)`, color: c, series: H.map((hi, i) => { const lo = L[i], d = hi - lo || 1; return hi - r * d; }) })) };
      }
      // SWING (neo pivot đã confirm, mức tĩnh)
      const K = PI(p, "strength", 3);
      const lines = rs.map(([r, c]) => ({ name: `Fib ${(r * 100).toFixed(1)}%`, color: c, series: new Array<number>(n).fill(NaN) }));
      let hiPx = NaN, hiPos = -1, loPx = NaN, loPos = -1;
      for (let i = 0; i < n; i++) {
        const q = i - K;   // pivot tại q CONFIRM ở bar i (đủ K nến mỗi bên)
        if (q >= K && q + K < n) {
          let ph = true, pl = true;
          for (let j = 1; j <= K; j++) { if (b[q].h <= b[q - j].h || b[q].h <= b[q + j].h) ph = false; if (b[q].l >= b[q - j].l || b[q].l >= b[q + j].l) pl = false; }
          if (ph) { hiPx = b[q].h; hiPos = q; }
          if (pl) { loPx = b[q].l; loPos = q; }
        }
        if (isFinite(hiPx) && isFinite(loPx)) {
          const a0 = loPos > hiPos ? hiPx : loPx, a100 = loPos > hiPos ? loPx : hiPx;   // pivot mới hơn = 100%
          rs.forEach(([r], k) => { lines[k].series[i] = a0 - r * (a0 - a100); });
        }
      }
      return { lines };
    },
  },
  {
    key: "bollinger", name: "Bollinger Bands", category: "Volatility", role: "REGIME_VOL",
    desc: "SMA ± multiplier × standard deviation; bands expand with volatility", context: "Band width describes current dispersion; contraction does not prove a future expansion.", buildFrom: "L1: SMA(close,p) = mid; Roll Std(close,p) ×mult; upper = Add, lower = Sub.",
    params: [{ name: "period", label: "Period", def: 20, min: 5, max: 100 }, { name: "mult", label: "Mult σ", def: 2, min: 1, max: 4, step: 0.1 }],
    compute: (b, p) => { const N = PI(p, "period", 20), M = P(p, "mult", 2), c = b.map((x) => x.c), mid = smaArr(c, N), sd = stdArr(c, N); return { bands: { mid, upper: mid.map((m, i) => m + M * sd[i]), lower: mid.map((m, i) => m - M * sd[i]), color: "#9d8bff" } }; },
  },
  {
    key: "donchian", name: "Donchian Channel", category: "Level / Breakout", role: "FILTER_CONTEXT",
    desc: "Rolling N-bar highs/lows form a price channel", context: "Channel boundaries describe price location relative to the rolling range.", buildFrom: "L1: rolling High maximum is the upper band; rolling Low minimum is the lower band; the midpoint is their average.",
    params: [{ name: "period", label: "Period", def: 20, min: 5, max: 100 }],
    compute: (b, p) => { const N = PI(p, "period", 20), up = hiArr(b.map((x) => x.h), N), lo = loArr(b.map((x) => x.l), N); return { bands: { upper: up, lower: lo, mid: up.map((u, i) => (u + lo[i]) / 2), color: "#58a6ff" } }; },
  },
  {
    key: "supertrend", name: "SuperTrend (ATR)", category: "Trend", role: "BIAS_TREND",
    desc: "ATR-based trend line with a state change on reversal", context: "Line position relative to price describes the configured directional context.", buildFrom: "L1: ATR(p) × multiplier around (High+Low)/2; FSM or hysteresis tracks the trend state.",
    params: [{ name: "atr", label: "ATR period", def: 10, min: 2, max: 50 }, { name: "mult", label: "Mult", def: 3, min: 1, max: 6, step: 0.5 }],
    compute: (b, p) => { const AP = PI(p, "atr", 10), m = P(p, "mult", 3), n = b.length, atr = atrArr(b, AP), hl2 = b.map((x) => (x.h + x.l) / 2), c = b.map((x) => x.c); const ub = hl2.map((v, i) => v + m * atr[i]), lb = hl2.map((v, i) => v - m * atr[i]); const fU = new Array(n), fL = new Array(n), st = new Array(n); for (let i = 0; i < n; i++) { if (i === 0) { fU[i] = ub[i]; fL[i] = lb[i]; st[i] = ub[i]; continue; } fU[i] = ub[i] < fU[i - 1] || c[i - 1] > fU[i - 1] ? ub[i] : fU[i - 1]; fL[i] = lb[i] > fL[i - 1] || c[i - 1] < fL[i - 1] ? lb[i] : fL[i - 1]; st[i] = st[i - 1] === fU[i - 1] ? (c[i] <= fU[i] ? fU[i] : fL[i]) : (c[i] >= fL[i] ? fL[i] : fU[i]); } return { lines: [{ name: "SuperTrend", color: "#5ad1c4", series: st }] }; },
  },
  {
    key: "macd", name: "MACD", category: "Momentum", role: "TIMING_TRIGGER",
    desc: "EMA fast−slow · signal · histogram", context: "MACD and signal crossings describe momentum context.", buildFrom: "L1: EMA(close,fast) − EMA(close,slow) = MACD; EMA(MACD,signal); MACD − signal = histogram.",
    params: [{ name: "fast", label: "Fast", def: 12, min: 2, max: 50 }, { name: "slow", label: "Slow", def: 26, min: 5, max: 100 }, { name: "signal", label: "Signal", def: 9, min: 2, max: 50 }],
    compute: (b, p) => { const F = PI(p, "fast", 12), S = PI(p, "slow", 26), SG = PI(p, "signal", 9), c = b.map((x) => x.c), ef = emaArr(c, F), es = emaArr(c, S), macd = ef.map((v, i) => v - es[i]); const sig = emaArr(macd, SG); return { sub: [{ name: "histogram", color: "#5b6b7d", series: macd.map((v, i) => v - sig[i]), hist: true }, { name: "MACD", color: "#37c0ff", series: macd }, { name: "signal", color: "#e3b341", series: sig }] }; },
  },
  {
    key: "ema", name: "EMA Line", category: "Trend", role: "BIAS_TREND",
    desc: "EMA(p) line", context: "Price position relative to the EMA describes directional context.", buildFrom: "L1: EMA(close,p).",
    params: [{ name: "period", label: "Period", def: 21, min: 2, max: 200 }],
    compute: (b, p) => { const N = PI(p, "period", 21), c = b.map((x) => x.c); return { lines: [{ name: "EMA", color: "#37c0ff", series: emaArr(c, N) }] }; },
  },
  {
    key: "keltner", name: "Keltner Channel", category: "Volatility", role: "REGIME_VOL",
    desc: "EMA(p) ± ATR(a)·mult", context: "Price outside the channel describes an extension relative to the configured bands.", buildFrom: "L1: EMA(close,p) ± ATR(a)·mult.",
    params: [{ name: "period", label: "EMA", def: 20, min: 5, max: 100 }, { name: "atr", label: "ATR", def: 10, min: 2, max: 50 }, { name: "mult", label: "Mult", def: 2, min: 1, max: 4, step: 0.1 }],
    compute: (b, p) => { const N = PI(p, "period", 20), AP = PI(p, "atr", 10), M = P(p, "mult", 2), c = b.map((x) => x.c), mid = emaArr(c, N), atr = atrArr(b, AP); return { bands: { mid, upper: mid.map((m, i) => m + M * atr[i]), lower: mid.map((m, i) => m - M * atr[i]), color: "#5ad1c4" } }; },
  },
  {
    key: "sr_zone", name: "S/R Zone Context", category: "Level / Context", role: "FILTER_CONTEXT",
    desc: "Support/resistance reference zones from recent pivots", context: "Nearby support/resistance levels are reference context, not execution instructions.", buildFrom: "L1: use only confirmed Swing High and Swing Low pivots to form recent reference levels.",
    params: [{ name: "lookback", label: "Lookback", def: 120, min: 30, max: 300 }, { name: "strength", label: "Strength (bar)", def: 3, min: 1, max: 10 }, { name: "zones", label: "Zones", def: 3, min: 1, max: 6 }],
    compute: (b, p) => { const LB = PI(p, "lookback", 120), K = PI(p, "strength", 3), MZ = PI(p, "zones", 3); const w = b.slice(-LB); const res: number[] = [], sup: number[] = []; for (let i = K; i < w.length - K; i++) { let ph = true, pl = true; for (let j = 1; j <= K; j++) { if (w[i].h <= w[i - j].h || w[i].h <= w[i + j].h) ph = false; if (w[i].l >= w[i - j].l || w[i].l >= w[i + j].l) pl = false; } if (ph) res.push(w[i].h); if (pl) sup.push(w[i].l); } const levels = [...res.slice(-MZ).map((pr, k) => ({ label: `R${k + 1}`, price: pr, color: "#f7768e" })), ...sup.slice(-MZ).map((pr, k) => ({ label: `S${k + 1}`, price: pr, color: "#21d07a" }))]; return { levels }; },
  },
  {
    key: "stoch_k", name: "Stochastic %K", category: "Momentum / Oscillator", role: "TIMING_TRIGGER",
    desc: "%K is the close position within the N-bar range; %D is SMA(%K)", context: "Stochastic close location within the rolling high/low range.", buildFrom: "L1: rolling High/Low bounds give %K=(Close−min)/(max−min)×100; SMA smoothing gives %D.",
    params: [{ name: "k", label: "%K period", def: 14, min: 3, max: 50 }, { name: "smooth", label: "Smooth %K", def: 3, min: 1, max: 10 }, { name: "d", label: "%D period", def: 3, min: 1, max: 10 }],
    compute: (b, p) => { const KP = PI(p, "k", 14), SM = PI(p, "smooth", 3), DP = PI(p, "d", 3); const hh = hiArr(b.map((x) => x.h), KP), ll = loArr(b.map((x) => x.l), KP), c = b.map((x) => x.c); const raw = c.map((v, i) => { const d = hh[i] - ll[i]; return d > 1e-9 ? (100 * (v - ll[i])) / d : 50; }); const k = smaArr(raw, SM), d = smaArr(k, DP); return { sub: [{ name: "%K", color: "#37c0ff", series: k }, { name: "%D", color: "#e3b341", series: d }] }; },
  },
  {
    key: "ch_episode", name: "CH Episode Lens", category: "Structure / Context", role: "FILTER_CONTEXT",
    desc: "Multi-bar episode state: expansion, contraction or directional movement", context: "Episode-direction approximation, not a forecast or performance result.", buildFrom: "L1: sum Close−Open over W bars and normalize by ATR to measure episode magnitude.",
    params: [{ name: "window", label: "Episode window", def: 20, min: 5, max: 60 }],
    compute: (b, p) => { const W = PI(p, "window", 20), atr = atrArr(b, 14); const score = b.map((_, i) => { if (i < W) return 50; let run = 0; for (let j = i - W + 1; j <= i; j++) run += b[j].c - b[j].o; return 50 + 50 * Math.max(-1, Math.min(1, run / (atr[i] * W * 0.5 + 1e-9))); }); return { sub: [{ name: "Episode", color: "#a371f7", series: score }] }; },
  },
];
export const STD_BY_KEY: Record<string, StdIndicator> = Object.fromEntries(STD_INDICATORS.map((s) => [s.key, s]));
// price-overlay indicators (draw lines/bands/cloud/levels ON price) — what the Overlay Builder offers. (MACD is a
// subpanel oscillator, not a price overlay, so it's excluded here.)
export const OVERLAY_KEYS = ["ema", "bollinger", "keltner", "donchian", "supertrend", "ichimoku", "fibonacci", "sr_zone"];
export const OVERLAY_INDICATORS = OVERLAY_KEYS.map((k) => STD_BY_KEY[k]).filter(Boolean);

// STD_PRESET — each standard indicator expressed AS an L2 weighted-fusion of L1 features (which features + what
// weights), so it loads straight into the L2 Simple Builder and the user can EDIT the weights → save their own
// module. (An approximation of the indicator's character in the fusion paradigm, not a pixel-exact replica.)
export interface StdPreset { name: string; featureKeys: string[]; weights: Record<string, number>; mode: "indicator" | "regime" | "bias" | "confidence"; role: FeatureUsageRole; note: string }
export const STD_PRESET: Record<string, StdPreset> = {
  ichimoku: { name: "Ichimoku-style (Trend)", featureKeys: ["ema_slope", "pullback_pressure", "range_wick"], weights: { ema_slope: 1.6, pullback_pressure: 0.8, range_wick: 0.4 }, mode: "regime", role: "BIAS_TREND", note: "Trend and cloud context with EMA slope and pullback location." },
  fibonacci: { name: "Fibonacci-style (Level)", featureKeys: ["sweep_depth", "wick_rejection_strength", "range_wick"], weights: { sweep_depth: 1.0, wick_rejection_strength: 0.9, range_wick: 0.5 }, mode: "regime", role: "FILTER_CONTEXT", note: "Level and sweep context with depth and wick rejection." },
  bollinger: { name: "Bollinger-style (Vol)", featureKeys: ["atr_percentile", "range_expansion_score", "range_wick"], weights: { atr_percentile: 1.5, range_expansion_score: 1.2, range_wick: 0.6 }, mode: "regime", role: "REGIME_VOL", note: "Volatility regime: ATR percentile + range expansion." },
  donchian: { name: "Donchian-style (Breakout)", featureKeys: ["range_expansion_score", "sweep_depth", "ema_slope"], weights: { range_expansion_score: 1.3, sweep_depth: 0.8, ema_slope: 0.6 }, mode: "regime", role: "FILTER_CONTEXT", note: "Range expansion, sweep and directional context." },
  supertrend: { name: "SuperTrend-style (Trend Bias)", featureKeys: ["ema_slope", "pullback_pressure"], weights: { ema_slope: 1.8, pullback_pressure: 0.7 }, mode: "bias", role: "BIAS_TREND", note: "EMA-slope trend context." },
  macd: { name: "MACD-style (Momentum)", featureKeys: ["ema_slope", "rsi_value", "pullback_pressure"], weights: { ema_slope: 1.2, rsi_value: 1.0, pullback_pressure: 0.6 }, mode: "indicator", role: "TIMING_TRIGGER", note: "Momentum: EMA slope + RSI + pullback." },
  sr_zone: { name: "S/R Zone-style (Level)", featureKeys: ["sweep_depth", "wick_rejection_strength", "pullback_pressure"], weights: { sweep_depth: 1.2, wick_rejection_strength: 1.0, pullback_pressure: 0.6 }, mode: "regime", role: "FILTER_CONTEXT", note: "Support/resistance context with sweep, rejection and pullback location." },
  stoch_k: { name: "Stochastic-style (Oscillator)", featureKeys: ["rsi_value", "pullback_pressure", "range_wick"], weights: { rsi_value: 1.5, pullback_pressure: 0.8, range_wick: 0.5 }, mode: "indicator", role: "TIMING_TRIGGER", note: "Oscillator context with RSI, pullback location and range." },
  ch_episode: { name: "CH Episode-style (Structure)", featureKeys: ["range_expansion_score", "ema_slope", "atr_percentile", "pullback_pressure"], weights: { range_expansion_score: 1.3, ema_slope: 0.9, atr_percentile: 0.8, pullback_pressure: 0.6 }, mode: "regime", role: "FILTER_CONTEXT", note: "Multi-bar episode approximation from expansion, direction, volatility and structure." },
};

export const STD_META: Record<string, { blocks: string[]; outputType: string; contextOf: (b: OhlcBar[], ov: IndicatorOverlay) => RegimeView }> = {
  ichimoku: {
    blocks: ["High", "Low", "Roll Max", "Roll Min", "Add", "Scale ×0.5", "Lag"], outputType: "Trend Context (Bias)",
    contextOf: (b, ov) => { const code = b.map((x, i) => { const a = ov.cloud?.a[i] ?? NaN, bb = ov.cloud?.b[i] ?? NaN; if (!isFinite(a) || !isFinite(bb)) return 0; const top = Math.max(a, bb), bot = Math.min(a, bb); return x.c > top ? 1 : x.c < bot ? -1 : 0; }); return { code, bands: { 1: { label: "UP", color: "#21d07a" }, 0: { label: "IN-CLOUD", color: "#5b6b7d" }, [-1]: { label: "DOWN", color: "#f7768e" } } }; },
  },
  fibonacci: {
    blocks: ["Swing High", "Swing Low", "Sub", "Scale (ratio)"], outputType: "Level Context",
    contextOf: (b, ov) => { const l50 = ov.lines?.find((x) => x.name.includes("50"))?.series; return { code: b.map((x, i) => (l50 && isFinite(l50[i]) ? (x.c >= l50[i] ? 1 : -1) : 0)), bands: { 1: { label: "ABOVE 50%", color: "#21d07a" }, [-1]: { label: "BELOW 50%", color: "#f7768e" }, 0: { label: "—", color: "#5b6b7d" } } }; },
  },
  bollinger: {
    blocks: ["Close", "SMA", "Roll Std", "Scale", "Add", "Sub"], outputType: "Volatility Regime",
    contextOf: (b, ov) => { const w = ov.bands!.upper.map((u, i) => u - ov.bands!.lower[i]); let mn = Infinity, mx = -Infinity; return { code: w.map((v) => { if (isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } const sp = mx - mn, r = sp > 0 ? (v - mn) / sp : 0.5; return r >= 0.66 ? 2 : r <= 0.33 ? 0 : 1; }), bands: { 0: { label: "SQUEEZE", color: "#3b5566" }, 1: { label: "NORMAL", color: "#c8a13a" }, 2: { label: "EXPAND", color: "#f7768e" } } }; },
  },
  donchian: {
    blocks: ["High", "Low", "Roll Max", "Roll Min", "Add", "Scale ×0.5"], outputType: "Breakout / Level Context",
    contextOf: (b, ov) => ({ code: b.map((x, i) => { const r = (x.c - ov.bands!.lower[i]) / ((ov.bands!.upper[i] - ov.bands!.lower[i]) || 1); return r >= 0.8 ? 1 : r <= 0.2 ? -1 : 0; }), bands: { 1: { label: "NEAR HIGH", color: "#21d07a" }, 0: { label: "MID", color: "#5b6b7d" }, [-1]: { label: "NEAR LOW", color: "#f7768e" } } }),
  },
  supertrend: {
    blocks: ["High", "Low", "ATR", "Scale", "Add", "Sub", "State (FSM)"], outputType: "Trend Context (Bias)",
    contextOf: (b, ov) => { const st = ov.lines![0].series; return { code: b.map((x, i) => (isFinite(st[i]) ? (x.c >= st[i] ? 1 : -1) : 0)), bands: { 1: { label: "UP", color: "#21d07a" }, [-1]: { label: "DOWN", color: "#f7768e" }, 0: { label: "—", color: "#5b6b7d" } } }; },
  },
  macd: {
    blocks: ["Close", "EMA", "Sub", "EMA (signal)", "Sub (hist)"], outputType: "Momentum Context",
    contextOf: (_b, ov) => { const macd = ov.sub!.find((s) => s.name === "MACD")!.series, sig = ov.sub!.find((s) => s.name === "signal")!.series; return { code: macd.map((v, i) => (isFinite(v) && isFinite(sig[i]) ? (v >= sig[i] ? 1 : -1) : 0)), bands: { 1: { label: "BULL", color: "#21d07a" }, [-1]: { label: "BEAR", color: "#f7768e" }, 0: { label: "—", color: "#5b6b7d" } } }; },
  },
};
