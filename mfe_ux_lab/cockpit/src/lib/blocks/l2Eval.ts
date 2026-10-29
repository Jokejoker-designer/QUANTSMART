// l2Eval — the core L2 evaluator: compute L1 feature series, fuse them with WEIGHTS (→ composite + per-feature
// contributions for the Contribution Bars viz), and classify regimes (→ code series for the Regime Ribbon viz).
// All CAUSAL: feature eval is causal (L1), normalize01 uses an EXPANDING window (no future), regime thresholds
// are FIXED (no data-dependent quantiles). L2 = context only — these produce regime/strength, never an order.
import { BASE_FEATURES, FEATURE_TEMPLATES } from "./featureTemplates.ts";
import { evalGraph } from "./featureGraph.ts";
import { loadCustomL1 } from "./customL1.ts";
import { loadCustomL2, type CustomL2Module } from "./customL2.ts";
import { suggestRoles, type FeatureUsageRole } from "./featureRoles.ts";
import { computeClassic, type ClassicSeries, type ClassicFlags } from "../classicIndicators.ts";
import { emaArr, atrArr } from "./stdIndicators.ts";
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";

export const L1_PICKABLE = [...BASE_FEATURES, ...FEATURE_TEMPLATES];
// resolve an L1 feature series by key — a built-in/template key OR a PROMOTED custom L1 module id.
export function l1Series(key: string, bars: OhlcBar[]): number[] {
  const t = L1_PICKABLE.find((x) => x.key === key); if (t) return evalGraph(t.graph, bars);
  const m = loadCustomL1().find((x) => x.id === key); return m ? evalGraph(m.graph, bars) : [];
}
const PALETTE = ["#79c0ff", "#a371f7", "#ffb454", "#3fb950", "#f78c6c", "#5ad1c4", "#db6d28", "#c792ea", "#58a6ff", "#e3b341"];
export interface AvailL1 { key: string; label: string; color: string; role?: FeatureUsageRole }
// the L1 features an L2 module can consume: built-in/templates + PROMOTED custom L1 (L2 reads L1).
export function availableL1(): AvailL1[] {
  const out: AvailL1[] = L1_PICKABLE.map((t, i) => ({ key: t.key, label: t.title, color: PALETTE[i % PALETTE.length], role: suggestRoles(t.graph).primaryRole }));
  loadCustomL1().forEach((m, i) => out.push({ key: m.id, label: m.name, color: PALETTE[(out.length + i) % PALETTE.length], role: m.roles?.primaryRole }));
  return out;
}
// ── L1 + L2 as a UNIFIED input pool for L3 (QuantLab). An L2 module is a Weighted-Sum of L1 features → it IS
// evaluable as a single causal series, so L3 can read L2 contexts the same way it reads L1 features. Only PROMOTED
// custom L1/L2 are exposed (SHADOW must qualify first — same gate as L1). Built-in L1 features always available.
export type InputLayer = "L1" | "L2";
export type InputStatus = "BUILTIN" | "SHADOW" | "VALIDATING" | "PROMOTED";
export interface AvailInput { key: string; label: string; layer: InputLayer; color: string; role?: FeatureUsageRole; status: InputStatus }
// ── built-in DEFAULT L2 indicators (qualified) — the system's classic indicators, exposed as clean VALUE series so
// L3 can read them. Computed by the SAME computeClassic the realistic engine uses → the L3 input == the engine's
// indicator (never a divergent re-derivation). Gate-type L2 (adx-veto / sr-zone / level-memory / dead-hour) are NOT
// continuous series → not exposed (a formula input must be a number); adx is exposed as its VALUE instead.
const ALL_CLASSIC: ClassicFlags = { ichimoku: true, macd: true, stochastic: true, bollinger: true, fib: true, adx: true };
let _ccBars: OhlcBar[] | null = null, _cc: ClassicSeries | null = null;
function classicOf(bars: OhlcBar[]): ClassicSeries { if (_ccBars === bars && _cc) return _cc; _cc = computeClassic(bars, ALL_CLASSIC); _ccBars = bars; return _cc; }   // memoize by bars ref
const CLASSIC_INPUTS: { key: string; label: string; calc: (s: ClassicSeries, bars: OhlcBar[]) => number[] }[] = [
  { key: "macd_hist", label: "MACD Histogram", calc: (s) => s.macd.map((v, i) => v - s.macdSig[i]) },
  { key: "stoch_k", label: "Stochastic %K", calc: (s) => s.stochK.slice() },
  { key: "adx_value", label: "ADX · trend strength", calc: (s) => s.adx.slice() },
  { key: "bb_pctb", label: "Bollinger %b", calc: (s, bars) => s.bbUp.map((u, i) => { const lo = s.bbLow[i]; return u > lo ? (bars[i].c - lo) / (u - lo) : NaN; }) },
];
const CLASSIC_KEYS = new Set(CLASSIC_INPUTS.map((c) => c.key));
function classicInputSeries(key: string, bars: OhlcBar[]): number[] { const c = CLASSIC_INPUTS.find((x) => x.key === key); return c ? c.calc(classicOf(bars), bars) : []; }

// evaluate a PROMOTED L2 module as a series: composite (0..1) of its L1 feature inputs, signed (−1..1) for bias.
export function l2ModuleSeries(m: CustomL2Module, bars: OhlcBar[]): number[] {
  const items = m.featureKeys.map((k) => ({ key: k, label: k, color: "#888", series: l1Series(k, bars) }));
  if (!items.length) return [];
  const r = m.kind === "bias" ? weightedCompositeSigned(items, m.weights) : weightedComposite(items, m.weights);
  return r.composite;
}
// the full input pool L3 can reference. Built-in L1 features = the system's DEFAULT indicators (already qualified →
// status BUILTIN, usable with no promote). User's own custom L1/L2 carry their real status (SHADOW until promoted) —
// shown + usable in the LAB (research), but the card-promotion gate later requires the whole chain be proven.
export function availableInputs(): AvailInput[] {
  const builtin: AvailInput[] = L1_PICKABLE.map((t, i) => ({ key: t.key, label: t.title, layer: "L1", color: PALETTE[i % PALETTE.length], role: suggestRoles(t.graph).primaryRole, status: "BUILTIN" }));
  const dL2: AvailInput[] = CLASSIC_INPUTS.map((c) => ({ key: c.key, label: c.label, layer: "L2", color: "#5ad1c4", status: "BUILTIN" }));   // default L2 indicators (qualified)
  const cL1: AvailInput[] = loadCustomL1().map((m, i) => ({ key: m.id, label: m.name, layer: "L1", color: PALETTE[(builtin.length + i) % PALETTE.length], role: m.roles?.primaryRole, status: m.status }));
  const cL2: AvailInput[] = loadCustomL2().map((m) => ({ key: m.id, label: m.name, layer: "L2", color: "#a371f7", role: m.primaryRole, status: m.status }));
  return [...builtin, ...dL2, ...cL1, ...cL2];
}
// causal RSI (Wilder-ish EMA of gains/losses) — không có helper sẵn nên tự viết, no-lookahead.
function rsiArr(close: number[], p = 14): number[] {
  const out = new Array(close.length).fill(50); let ag = 0, al = 0;
  for (let i = 1; i < close.length; i++) { const d = close[i] - close[i - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
    ag = i <= p ? (ag * (i - 1) + g) / i : (ag * (p - 1) + g) / p; al = i <= p ? (al * (i - 1) + l) / i : (al * (p - 1) + l) / p;
    out[i] = al < 1e-12 ? (ag > 0 ? 100 : 50) : 100 - 100 / (1 + ag / al); }
  return out;
}
// RAW price / chuẩn: close/open/high/low/ema10/ema20/ema34/atr/rsi — input tự nhiên nhất AI hay dùng. Causal.
// Đây là danh sách KHỚP với KNOWN_L3_INPUTS trong aiContextPack → whitelist == resolvable (không còn flat vì input rỗng).
export function rawPriceSeries(key: string, bars: OhlcBar[]): number[] | null {
  const close = bars.map((b) => b.c);
  switch (key) {
    case "close": return close;
    case "open": return bars.map((b) => b.o);
    case "high": return bars.map((b) => b.h);
    case "low": return bars.map((b) => b.l);
    case "ema10": return emaArr(close, 10);
    case "ema20": return emaArr(close, 20);
    case "ema34": return emaArr(close, 34);
    case "atr": return atrArr(bars, 14);
    case "rsi": return rsiArr(close, 14);
    default: return null;
  }
}
// resolve ANY input key (built-in L1 / default L2 indicator / custom L1 / custom L2 / raw price) → its causal series.
// Thứ tự: classic → custom L2 → L1 feature → RAW price (fallback). Fallback CHỈ chạy khi các nguồn trên trả rỗng →
// KHÔNG đổi hành vi key cũ (additive, regression-safe); chỉ CỨU những key trước đây trả [] (close/ema/atr/rsi…).
export function inputSeries(key: string, bars: OhlcBar[]): number[] {
  if (CLASSIC_KEYS.has(key)) return classicInputSeries(key, bars);
  const l2 = loadCustomL2().find((m) => m.id === key);
  if (l2) return l2ModuleSeries(l2, bars);
  const l1 = l1Series(key, bars);
  if (l1.length) return l1;
  return rawPriceSeries(key, bars) ?? l1;
}

// suggest an L2 usage role from the picked features' roles (most common primary).
export function suggestL2Role(keys: string[]): FeatureUsageRole {
  const av = availableL1(); const tally: Record<string, number> = {};
  for (const k of keys) { const r = av.find((a) => a.key === k)?.role; if (r) tally[r] = (tally[r] || 0) + 1; }
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]; return (top?.[0] as FeatureUsageRole) ?? "REGIME_VOL";
}

// the 4 demo L1 features wired into the L2 preview (a Feature Bus → Weighted Sum).
export const L2_DEMO_FEATURES: { key: string; label: string; color: string; signed: boolean }[] = [
  { key: "ema_slope", label: "EMA Slope", color: "#79c0ff", signed: true },
  { key: "atr_percentile", label: "ATR Percentile", color: "#a371f7", signed: false },
  { key: "range_wick", label: "Range / Wick", color: "#ffb454", signed: false },
  { key: "rsi_value", label: "RSI", color: "#3fb950", signed: false },
];

// CAUSAL min-max to [0,1] over an EXPANDING window (each bar uses only data ≤ i).
export function normalize01(s: number[]): number[] {
  let lo = Infinity, hi = -Infinity;
  return s.map((v) => { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } const span = hi - lo; return span > 0 && isFinite(v) ? Math.min(1, Math.max(0, (v - lo) / span)) : 0.5; });
}

export interface L2Contribution { key: string; label: string; color: string; weight: number; norm: number[]; contrib: number[] }
// Weighted Sum fusion: each feature normalised [0,1], weighted, composite = Σ wᵢfᵢ / Σw (so composite ∈ [0,1]).
export function weightedComposite(items: { key: string; label: string; color: string; series: number[] }[], weights: Record<string, number>): { composite: number[]; contributions: L2Contribution[]; wsum: number } {
  const wsum = items.reduce((s, it) => s + Math.max(0, weights[it.key] ?? 1), 0) || 1;
  const contributions = items.map((it) => { const w = Math.max(0, weights[it.key] ?? 1), norm = normalize01(it.series); return { key: it.key, label: it.label, color: it.color, weight: w, norm, contrib: norm.map((v) => (v * w) / wsum) }; });
  const n = items[0]?.series.length ?? 0, composite = new Array(n).fill(0);
  for (let i = 0; i < n; i++) composite[i] = contributions.reduce((s, c) => s + (isFinite(c.contrib[i]) ? c.contrib[i] : 0), 0);
  return { composite, contributions, wsum };
}

// CAUSAL normalize to [-1,1] (centered) — the manager's "chuẩn hóa nội bộ về [-1,1] trước khi tổng hợp".
export function normalize11(s: number[]): number[] { return normalize01(s).map((v) => 2 * v - 1); }
// Signed Weighted Sum: features → [-1,1], weighted; composite = Σ wᵢfᵢ/Σw ∈ [-1,1]; contributions signed (±).
export function weightedCompositeSigned(items: { key: string; label: string; color: string; series: number[] }[], weights: Record<string, number>): { composite: number[]; contributions: L2Contribution[]; wsum: number } {
  const wsum = items.reduce((s, it) => s + Math.max(0, weights[it.key] ?? 1), 0) || 1;
  const contributions = items.map((it) => { const w = Math.max(0, weights[it.key] ?? 1), norm = normalize11(it.series); return { key: it.key, label: it.label, color: it.color, weight: w, norm, contrib: norm.map((v) => (v * w) / wsum) }; });
  const n = items[0]?.series.length ?? 0, composite = new Array(n).fill(0);
  for (let i = 0; i < n; i++) composite[i] = contributions.reduce((s, c) => s + (isFinite(c.contrib[i]) ? c.contrib[i] : 0), 0);
  return { composite, contributions, wsum };
}

export interface RegimeView { code: number[]; bands: Record<number, { label: string; color: string }> }
// Trend Regime from a SIGNED indicator (e.g. ema_slope in ATR units): UP / RANGE / DOWN at ±t. Causal (fixed t).
export function trendRegime(signed: number[], t = 0.15): RegimeView {
  return { code: signed.map((v) => (!isFinite(v) ? 0 : v >= t ? 1 : v <= -t ? -1 : 0)), bands: { 1: { label: "UP", color: "#21d07a" }, 0: { label: "RANGE", color: "#5b6b7d" }, [-1]: { label: "DOWN", color: "#f7768e" } } };
}
// Volatility Regime from a [0,1] percentile feature (e.g. atr_percentile): LOW / NORMAL / HIGH at fixed cuts. Causal.
export function volRegime(pct01: number[], lo = 0.33, hi = 0.66): RegimeView {
  return { code: pct01.map((v) => (!isFinite(v) ? 1 : v >= hi ? 2 : v <= lo ? 0 : 1)), bands: { 0: { label: "LOW", color: "#3b5566" }, 1: { label: "NORMAL", color: "#c8a13a" }, 2: { label: "HIGH", color: "#f7768e" } } };
}
// 3-state regime of a [0,1] composite context score: WEAK / NEUTRAL / STRONG at fixed cuts. Causal.
export function contextRegime(composite: number[], lo = 0.4, hi = 0.6): RegimeView {
  return { code: composite.map((v) => (!isFinite(v) ? 1 : v >= hi ? 2 : v <= lo ? 0 : 1)), bands: { 0: { label: "WEAK", color: "#5b6b7d" }, 1: { label: "NEUTRAL", color: "#c8a13a" }, 2: { label: "STRONG", color: "#21d07a" } } };
}
// Bias Context (directional context, NOT entry) from a [0,1] composite: BULL / NEUTRAL / BEAR. Causal.
export function biasContext(composite: number[], lo = 0.4, hi = 0.6): RegimeView {
  return { code: composite.map((v) => (!isFinite(v) ? 0 : v >= hi ? 1 : v <= lo ? -1 : 0)), bands: { 1: { label: "BULL", color: "#21d07a" }, 0: { label: "NEUTRAL", color: "#5b6b7d" }, [-1]: { label: "BEAR", color: "#f7768e" } } };
}
// Context confidence [0,1] = how DECISIVE the composite is (distance from 0.5). NOT a win probability.
export function confidenceSeries(composite: number[]): number[] { return composite.map((v) => (isFinite(v) ? Math.min(1, Math.abs(v - 0.5) * 2) : 0)); }
// rolling z-score + percentile of the last value (over last N) — causal context stats.
export function rollingZLast(s: number[], N = 250): number { const w = s.filter(isFinite).slice(-N); if (w.length < 5) return 0; const m = w.reduce((a, b) => a + b, 0) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length) || 1; const last = s[s.length - 1]; return isFinite(last) ? (last - m) / sd : 0; }
export function percentileLast(s: number[], N = 250): number { const last = s[s.length - 1], w = s.filter(isFinite).slice(-N); return w.length && isFinite(last) ? w.filter((v) => v <= last).length / w.length : 0; }
