// blockLibrary — THE L1 primitive palette: ~70 port-typed, causal blocks across the 9 official groups, each a
// full L1PrimitiveBlockSpec (inputs/outputs/parameters/safety/authority) + a `viz`/`vizMode` for live preview.
// SOURCE…LOGIC ship a CAUSAL `compute`; pure FSM control nodes are runtime-handled. L1 emits a MEASUREMENT only.
// NOTE on the manager's guards: volume + m1_subbar are PROVISIONAL (may be NOT_AVAILABLE; never synthesise as
// evidence; m1 path is APPROX_PATH, cannot look beyond the closed candle). Pattern-type labels (PIN_BAR/
// ENGULFING) are deliberately NOT here — that is an L2 job; L1 only does numeric value-shape, kept out for now.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { type L1PrimitiveBlockSpec, type BlockEvalCtx, type L1Group, mk, np, safeDiv, clampN, at, win, P } from "./blockTypes.ts";

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a: number[]) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
// ── MEMOIZED cumulative series (O(n²)→O(n)) — [[block-is-fixed-foundation-doctrine]]. Các block dưới có state phụ
// thuộc TOÀN lịch sử [0..i]; bản cũ recompute từ 0 mỗi nến → O(n²). Trước cầu evidence chỉ chạy ở sandbox (≤1500
// nến) nên vô hại; nay MỌI block chạy ở engine 10 năm (~250k nến) → phải O(n) hoặc đơ/crash. Memo theo REF mảng
// nguồn (cùng ref trong một eval → tính 1 lần); giá trị khớp TỪNG BYTE thuật toán cũ (guard: perfBlocks.harness).
const _atrCache = new WeakMap<OhlcBar[], Map<number, number[]>>();
function atrSeries(bars: OhlcBar[], p: number): number[] {
  let byP = _atrCache.get(bars); if (!byP) { byP = new Map(); _atrCache.set(bars, byP); }
  const hit = byP.get(p); if (hit) return hit;
  const n = bars.length, out = new Array<number>(n);
  if (n) { out[0] = bars[0].h - bars[0].l; let a = out[0]; for (let i = 1; i < n; i++) { const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); a = (a * (p - 1) + tr) / p; out[i] = a || (bars[i].h - bars[i].l) || 1; } }
  byP.set(p, out); return out;
}
function atrAt(bars: OhlcBar[], i: number, p: number): number { if (!bars.length) return 1; const s = atrSeries(bars, p); return i <= 0 ? s[0] : s[i]; }

const _emaCache = new WeakMap<number[], Map<number, number[]>>();
function emaSeriesAt(s: number[], i: number, p: number): number {
  if (!s.length) return 0;
  let byP = _emaCache.get(s); if (!byP) { byP = new Map(); _emaCache.set(s, byP); }
  let out = byP.get(p);
  if (!out) { const n = s.length, k = 2 / (p + 1); out = new Array<number>(n); let e = s[0] ?? 0; out[0] = e; for (let j = 1; j < n; j++) { e = (s[j] ?? e) * k + e * (1 - k); out[j] = e; } byP.set(p, out); }
  return i < out.length ? out[i] : out[out.length - 1];
}

const _hystCache = new WeakMap<number[], Map<string, number[]>>();
function hystAt(s: number[], i: number, on: number, off: number): number {
  if (!s.length) return 0;
  let byK = _hystCache.get(s); if (!byK) { byK = new Map(); _hystCache.set(s, byK); }
  const key = on + "|" + off; let out = byK.get(key);
  if (!out) { const n = s.length; out = new Array<number>(n); let st = 0; for (let j = 0; j < n; j++) { const v = s[j] ?? 0; if (v > on) st = 1; else if (v < off) st = 0; out[j] = st; } byK.set(key, out); }
  return i < out.length ? out[i] : out[out.length - 1];
}

const _swHiCache = new WeakMap<OhlcBar[], Map<number, number[]>>();
function swingHighAt(bars: OhlcBar[], i: number, W: number): number {
  let byW = _swHiCache.get(bars); if (!byW) { byW = new Map(); _swHiCache.set(bars, byW); }
  let out = byW.get(W);
  if (!out) { const n = bars.length; out = new Array<number>(n); let last: number | undefined; for (let x = 0; x < n; x++) { const k = x - W; if (k >= W) { let hi = true; for (let j = k - W; j <= k + W; j++) { if (j !== k && bars[j] && bars[j].h >= bars[k].h) { hi = false; break; } } if (hi) last = bars[k].h; } out[x] = last !== undefined ? last : bars[x].h; } byW.set(W, out); }
  return out[i];
}
const _swLoCache = new WeakMap<OhlcBar[], Map<number, number[]>>();
function swingLowAt(bars: OhlcBar[], i: number, W: number): number {
  let byW = _swLoCache.get(bars); if (!byW) { byW = new Map(); _swLoCache.set(bars, byW); }
  let out = byW.get(W);
  if (!out) { const n = bars.length; out = new Array<number>(n); let last: number | undefined; for (let x = 0; x < n; x++) { const k = x - W; if (k >= W) { let isLo = true; for (let j = k - W; j <= k + W; j++) { if (j !== k && bars[j] && bars[j].l <= bars[k].l) { isLo = false; break; } } if (isLo) last = bars[k].l; } out[x] = last !== undefined ? last : bars[x].l; } byW.set(W, out); }
  return out[i];
}
const In = (c: BlockEvalCtx, k: number) => at(c.inputs[k], c.i);   // upstream numeric value at the current bar

export const BLOCKS: L1PrimitiveBlockSpec[] = [
  // ───────── 1 · SOURCE (closed data; raw price scale) ─────────
  mk({ id: "open", group: "SOURCE", label: "Open", desc: "Bar opening price", in: ["STREAM_OHLC"], out: "PRICE", viz: "candle", vizMode: "RAW", compute: (c) => c.bars[c.i].o }),
  mk({ id: "high", group: "SOURCE", label: "High", desc: "Bar high", in: ["STREAM_OHLC"], out: "PRICE", viz: "candle", vizMode: "RAW", compute: (c) => c.bars[c.i].h }),
  mk({ id: "low", group: "SOURCE", label: "Low", desc: "Bar low", in: ["STREAM_OHLC"], out: "PRICE", viz: "candle", vizMode: "RAW", compute: (c) => c.bars[c.i].l }),
  mk({ id: "close", group: "SOURCE", label: "Close", desc: "Bar closing price", in: ["STREAM_OHLC"], out: "PRICE", viz: "candle", vizMode: "RAW", compute: (c) => c.bars[c.i].c }),
  mk({ id: "volume", group: "SOURCE", label: "Volume", desc: "Optional observed volume. Missing broker or CSV volume is unavailable; synthetic volume is not measured evidence.", in: ["STREAM_OHLC"], out: "NUMBER", viz: "oscillator", vizMode: "RAW", provisional: true, note: "Optional source. Missing values remain unavailable; synthetic volume is not market evidence.", compute: (c) => { const v = (c.bars[c.i] as { v?: number }).v; return typeof v === "number" && v > 0 ? v : 0; } }),
  mk({ id: "m1_subbar", group: "SOURCE", label: "M1 Sub-bar (path)", desc: "M1 path inside a completed design-timeframe candle, for replay explanation only. Reconstructed paths are approximate and must not read beyond that closed candle.", in: [], out: "STREAM_NUMBER", viz: "chart", vizMode: "RAW", provisional: true, note: "Approximate path proxy, using completed observations only." }),
  mk({ id: "const_value", group: "SOURCE", label: "Constant", desc: "A constant, such as 1.0 or 0.5, for composition with other blocks", in: [], out: "NUMBER", params: [np("v", "Value", 1, -1e6, 1e6, 0.01)], viz: "wire", vizMode: "RAW", compute: (c) => P(c, "v", 1) }),

  // ───────── 2 · CANDLE_ANATOMY ─────────
  mk({ id: "body", group: "CANDLE_ANATOMY", label: "Body", desc: "Absolute close minus open, in price units", in: ["STREAM_OHLC"], out: "NUMBER", viz: "candle", vizMode: "RAW", compute: (c) => { const b = c.bars[c.i]; return Math.abs(b.c - b.o); } }),
  mk({ id: "upper_wick", group: "CANDLE_ANATOMY", label: "Upper Wick", desc: "Upper wick in price units", in: ["STREAM_OHLC"], out: "NUMBER", viz: "candle", vizMode: "RAW", compute: (c) => { const b = c.bars[c.i]; return b.h - Math.max(b.o, b.c); } }),
  mk({ id: "lower_wick", group: "CANDLE_ANATOMY", label: "Lower Wick", desc: "Lower wick in price units", in: ["STREAM_OHLC"], out: "NUMBER", viz: "candle", vizMode: "RAW", compute: (c) => { const b = c.bars[c.i]; return Math.min(b.o, b.c) - b.l; } }),
  mk({ id: "range", group: "CANDLE_ANATOMY", label: "Range (H−L)", desc: "Bar high minus low", in: ["STREAM_OHLC"], out: "NUMBER", viz: "candle", vizMode: "RAW", compute: (c) => { const b = c.bars[c.i]; return b.h - b.l; } }),
  mk({ id: "true_range", group: "CANDLE_ANATOMY", label: "True Range", desc: "True range including gaps", in: ["STREAM_OHLC"], out: "NUMBER", viz: "candle", vizMode: "RAW", compute: (c) => { const b = c.bars[c.i], pc = c.bars[Math.max(0, c.i - 1)].c; return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); } }),
  mk({ id: "typical_price", group: "CANDLE_ANATOMY", label: "Typical Price", desc: "(H+L+C)/3", in: ["STREAM_OHLC"], out: "PRICE", viz: "chart", vizMode: "RAW", compute: (c) => { const b = c.bars[c.i]; return (b.h + b.l + b.c) / 3; } }),
  mk({ id: "clv", group: "CANDLE_ANATOMY", label: "Close Location (CLV)", desc: "(C−L)/(H−L): closing position within the bar", in: ["STREAM_OHLC"], out: { name: "out", type: "RATIO_0_1", scaleFree: true, range: "[0,1]" }, viz: "candle", vizMode: "NORMALIZED", compute: (c) => { const b = c.bars[c.i]; return clampN(safeDiv(b.c - b.l, b.h - b.l), 0, 1); } }),
  mk({ id: "body_ratio", group: "CANDLE_ANATOMY", label: "Body Ratio", desc: "body / range", in: ["STREAM_OHLC"], out: { name: "out", type: "RATIO_0_1", scaleFree: true, range: "[0,1]" }, viz: "gauge", vizMode: "NORMALIZED", compute: (c) => { const b = c.bars[c.i]; return clampN(safeDiv(Math.abs(b.c - b.o), b.h - b.l), 0, 1); } }),
  mk({ id: "upper_wick_ratio", group: "CANDLE_ANATOMY", label: "Upper Wick Ratio", desc: "Upper wick / range", in: ["STREAM_OHLC"], out: { name: "out", type: "RATIO_0_1", scaleFree: true, range: "[0,1]" }, viz: "gauge", vizMode: "NORMALIZED", compute: (c) => { const b = c.bars[c.i]; return clampN(safeDiv(b.h - Math.max(b.o, b.c), b.h - b.l), 0, 1); } }),
  mk({ id: "lower_wick_ratio", group: "CANDLE_ANATOMY", label: "Lower Wick Ratio", desc: "Lower wick / range", in: ["STREAM_OHLC"], out: { name: "out", type: "RATIO_0_1", scaleFree: true, range: "[0,1]" }, viz: "gauge", vizMode: "NORMALIZED", compute: (c) => { const b = c.bars[c.i]; return clampN(safeDiv(Math.min(b.o, b.c) - b.l, b.h - b.l), 0, 1); } }),
  mk({ id: "gap", group: "CANDLE_ANATOMY", label: "Gap", desc: "Open minus the previous close", in: ["STREAM_OHLC"], out: "NUMBER", viz: "chart", vizMode: "RAW", compute: (c) => c.bars[c.i].o - c.bars[Math.max(0, c.i - 1)].c }),
  mk({ id: "direction", group: "CANDLE_ANATOMY", label: "Direction", desc: "Sign of close minus open: −1 / 0 / 1", in: ["STREAM_OHLC"], out: { name: "out", type: "NUMBER", scaleFree: true, range: "[-1,1]" }, viz: "ribbon", vizMode: "RAW", compute: (c) => { const b = c.bars[c.i]; return Math.sign(b.c - b.o); } }),

  // ───────── 3 · ROLLING_WINDOW (numeric series, last N) ─────────
  mk({ id: "roll_max", group: "ROLLING_WINDOW", label: "Roll Max", desc: "Maximum over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "chart", vizMode: "RAW", compute: (c) => Math.max(...win(c.inputs[0], c.i, P(c, "N", 20))) }),
  mk({ id: "roll_min", group: "ROLLING_WINDOW", label: "Roll Min", desc: "Minimum over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "chart", vizMode: "RAW", compute: (c) => Math.min(...win(c.inputs[0], c.i, P(c, "N", 20))) }),
  mk({ id: "roll_mean", group: "ROLLING_WINDOW", label: "Roll Mean", desc: "Mean over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "chart", vizMode: "RAW", compute: (c) => mean(win(c.inputs[0], c.i, P(c, "N", 20))) }),
  mk({ id: "roll_median", group: "ROLLING_WINDOW", label: "Roll Median", desc: "Median over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "chart", vizMode: "RAW", compute: (c) => median(win(c.inputs[0], c.i, P(c, "N", 20))) }),
  mk({ id: "roll_std", group: "ROLLING_WINDOW", label: "Roll Std", desc: "Standard deviation over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "oscillator", vizMode: "NORMALIZED", compute: (c) => std(win(c.inputs[0], c.i, P(c, "N", 20))) }),
  mk({ id: "roll_sum", group: "ROLLING_WINDOW", label: "Roll Sum", desc: "Sum over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "oscillator", vizMode: "RAW", compute: (c) => win(c.inputs[0], c.i, P(c, "N", 20)).reduce((s, x) => s + x, 0) }),
  mk({ id: "roll_range", group: "ROLLING_WINDOW", label: "Roll Range", desc: "Maximum minus minimum over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "chart", vizMode: "RAW", compute: (c) => { const w = win(c.inputs[0], c.i, P(c, "N", 20)); return Math.max(...w) - Math.min(...w); } }),
  mk({ id: "percent_rank", group: "ROLLING_WINDOW", label: "Percentile Rank", desc: "Current percentile rank over N bars, from 0 to 1", in: ["NUMBER"], out: { name: "out", type: "RATIO_0_1", scaleFree: true, range: "[0,1]" }, params: [np("N", "Window", 50, 5, 500)], viz: "histogram", vizMode: "NORMALIZED", compute: (c) => { const w = win(c.inputs[0], c.i, P(c, "N", 50)), x = In(c, 0); return w.length ? w.filter((v) => v <= x).length / w.length : 0; } }),
  mk({ id: "count_above", group: "ROLLING_WINDOW", label: "Count Above", desc: "Count values above the threshold over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300), np("t", "Threshold", 0, -1e6, 1e6, 0.01)], viz: "oscillator", vizMode: "RAW", compute: (c) => win(c.inputs[0], c.i, P(c, "N", 20)).filter((v) => v > P(c, "t", 0)).length }),
  mk({ id: "reg_slope", group: "ROLLING_WINDOW", label: "Reg Slope", desc: "Regression slope over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 3, 300)], viz: "chart", vizMode: "RAW", compute: (c) => { const w = win(c.inputs[0], c.i, P(c, "N", 20)), n = w.length; if (n < 2) return 0; const xs = w.map((_, k) => k), mx = mean(xs), my = mean(w); let num = 0, den = 0; for (let k = 0; k < n; k++) { num += (xs[k] - mx) * (w[k] - my); den += (xs[k] - mx) ** 2; } return safeDiv(num, den); } }),
  mk({ id: "path_length", group: "ROLLING_WINDOW", label: "Path Length", desc: "Sum of absolute changes over N bars", in: ["NUMBER"], out: "NUMBER", params: [np("N", "Window", 20, 2, 300)], viz: "oscillator", vizMode: "RAW", compute: (c) => { const w = win(c.inputs[0], c.i, P(c, "N", 20)); let s = 0; for (let k = 1; k < w.length; k++) s += Math.abs(w[k] - w[k - 1]); return s; } }),
  mk({ id: "swing_high", group: "ROLLING_WINDOW", label: "Swing High", desc: "Pivot high confirmed after W bars, without lookahead", in: ["STREAM_OHLC"], out: "PRICE", params: [np("W", "Confirmation bars", 3, 1, 20)], viz: "chart", vizMode: "RAW", compute: (c) => swingHighAt(c.bars, c.i, P(c, "W", 3)) }),
  mk({ id: "swing_low", group: "ROLLING_WINDOW", label: "Swing Low", desc: "Pivot low confirmed after W bars, without lookahead", in: ["STREAM_OHLC"], out: "PRICE", params: [np("W", "Confirmation bars", 3, 1, 20)], viz: "chart", vizMode: "RAW", compute: (c) => swingLowAt(c.bars, c.i, P(c, "W", 3)) }),
  mk({ id: "atr", group: "ROLLING_WINDOW", label: "ATR", desc: "Wilder Average True Range over p bars, in price units", in: ["STREAM_OHLC"], out: "NUMBER", params: [np("p", "Period", 14, 2, 200)], viz: "oscillator", vizMode: "NORMALIZED", compute: (c) => atrAt(c.bars, c.i, P(c, "p", 14)) }),

  // ───────── 4 · NORMALIZE (scale-free) ─────────
  mk({ id: "div_atr", group: "NORMALIZE", label: "÷ ATR", desc: "Divide by ATR(p) to express the value in ATR units", in: ["NUMBER"], out: { name: "out", type: "NUMBER", scaleFree: true }, params: [np("p", "ATR period", 14, 2, 200)], viz: "curve", vizMode: "NORMALIZED", kidi: true, compute: (c) => safeDiv(In(c, 0), atrAt(c.bars, c.i, P(c, "p", 14))) }),
  mk({ id: "div_price", group: "NORMALIZE", label: "÷ Price (bps)", desc: "Divide by close and multiply by 10,000 to express basis points", in: ["NUMBER"], out: { name: "out", type: "NUMBER", scaleFree: true }, viz: "curve", vizMode: "NORMALIZED", kidi: true, compute: (c) => safeDiv(In(c, 0), c.bars[c.i].c) * 1e4 }),
  mk({ id: "zscore", group: "NORMALIZE", label: "Z-Score", desc: "(x−mean)/std over a rolling N-bar window", in: ["NUMBER"], out: { name: "out", type: "NUMBER", scaleFree: true }, params: [np("N", "Window", 50, 5, 500)], viz: "oscillator", vizMode: "NORMALIZED", kidi: true, compute: (c) => { const w = win(c.inputs[0], c.i, P(c, "N", 50)); return safeDiv(In(c, 0) - mean(w), std(w)); } }),
  mk({ id: "minmax", group: "NORMALIZE", label: "Min-Max [0,1]", desc: "Scale to 0–1 over N bars", in: ["NUMBER"], out: { name: "out", type: "RATIO_0_1", scaleFree: true, range: "[0,1]" }, params: [np("N", "Window", 50, 5, 500)], viz: "curve", vizMode: "NORMALIZED", kidi: true, compute: (c) => { const w = win(c.inputs[0], c.i, P(c, "N", 50)), lo = Math.min(...w), hi = Math.max(...w); return clampN(safeDiv(In(c, 0) - lo, hi - lo), 0, 1); } }),
  mk({ id: "log_abs", group: "NORMALIZE", label: "Log", desc: "Log of absolute value for tail compression", in: ["NUMBER"], out: "NUMBER", viz: "curve", vizMode: "NORMALIZED", compute: (c) => Math.log(Math.max(Math.abs(In(c, 0)), 1e-9)) }),
  mk({ id: "ratio", group: "NORMALIZE", label: "Ratio (a/b)", desc: "Ratio a/b with numerical guard", in: ["NUMBER", "NUMBER"], out: { name: "out", type: "NUMBER", scaleFree: true }, viz: "wire", vizMode: "NORMALIZED", kidi: true, compute: (c) => safeDiv(In(c, 0), In(c, 1)) }),
  mk({ id: "diff", group: "NORMALIZE", label: "Diff (a−b)", desc: "Difference a−b", in: ["NUMBER", "NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => In(c, 0) - In(c, 1) }),

  // ───────── 5 · SMOOTH_LAG_MOMENTUM ─────────
  mk({ id: "ema", group: "SMOOTH_LAG_MOMENTUM", label: "EMA", desc: "Exponential moving average over p observations", in: ["NUMBER"], out: "NUMBER", params: [np("p", "Period", 10, 2, 300)], viz: "chart", vizMode: "RAW", compute: (c) => emaSeriesAt(c.inputs[0] || [], c.i, P(c, "p", 10)) }),
  mk({ id: "sma", group: "SMOOTH_LAG_MOMENTUM", label: "SMA", desc: "Simple moving average over p observations", in: ["NUMBER"], out: "NUMBER", params: [np("p", "Period", 10, 2, 300)], viz: "chart", vizMode: "RAW", compute: (c) => mean(win(c.inputs[0], c.i, P(c, "p", 10))) }),
  mk({ id: "lag", group: "SMOOTH_LAG_MOMENTUM", label: "Lag(k)", desc: "Value k bars ago", in: ["NUMBER"], out: "NUMBER", params: [np("k", "Bars", 1, 1, 100)], viz: "chart", vizMode: "RAW", compute: (c) => at(c.inputs[0], c.i - P(c, "k", 1)) }),
  mk({ id: "delta", group: "SMOOTH_LAG_MOMENTUM", label: "Delta(k)", desc: "Current value minus its value k bars ago", in: ["NUMBER"], out: "NUMBER", params: [np("k", "Bars", 1, 1, 100)], viz: "oscillator", vizMode: "NORMALIZED", compute: (c) => In(c, 0) - at(c.inputs[0], c.i - P(c, "k", 1)) }),
  mk({ id: "roc", group: "SMOOTH_LAG_MOMENTUM", label: "ROC %", desc: "(x/x[k]−1)·100", in: ["NUMBER"], out: { name: "out", type: "NUMBER", scaleFree: true }, params: [np("k", "Bars", 1, 1, 100)], viz: "oscillator", vizMode: "NORMALIZED", kidi: true, compute: (c) => safeDiv(In(c, 0) - at(c.inputs[0], c.i - P(c, "k", 1)), at(c.inputs[0], c.i - P(c, "k", 1))) * 100 }),
  mk({ id: "slope", group: "SMOOTH_LAG_MOMENTUM", label: "Slope", desc: "Current value minus its previous value", in: ["NUMBER"], out: "NUMBER", viz: "oscillator", vizMode: "NORMALIZED", compute: (c) => In(c, 0) - at(c.inputs[0], c.i - 1) }),

  // ───────── 6 · MATH (safe) ─────────
  mk({ id: "add", group: "MATH", label: "Add", desc: "a + b", in: ["NUMBER", "NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => In(c, 0) + In(c, 1) }),
  mk({ id: "sub", group: "MATH", label: "Sub", desc: "a − b", in: ["NUMBER", "NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => In(c, 0) - In(c, 1) }),
  mk({ id: "mul", group: "MATH", label: "Mul", desc: "a × b", in: ["NUMBER", "NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => In(c, 0) * In(c, 1) }),
  mk({ id: "div", group: "MATH", label: "Div (guarded)", desc: "a / b (KIDI-guard)", in: ["NUMBER", "NUMBER"], out: "NUMBER", viz: "wire", vizMode: "NORMALIZED", kidi: true, compute: (c) => safeDiv(In(c, 0), In(c, 1)) }),
  mk({ id: "abs", group: "MATH", label: "Abs", desc: "|x|", in: ["NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => Math.abs(In(c, 0)) }),
  mk({ id: "neg", group: "MATH", label: "Negate", desc: "−x", in: ["NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => -In(c, 0) }),
  mk({ id: "sign", group: "MATH", label: "Sign", desc: "Sign of x", in: ["NUMBER"], out: { name: "out", type: "NUMBER", scaleFree: true, range: "[-1,1]" }, viz: "wire", vizMode: "RAW", compute: (c) => Math.sign(In(c, 0)) }),
  mk({ id: "sqrt", group: "MATH", label: "Sqrt", desc: "√|x|", in: ["NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => Math.sqrt(Math.abs(In(c, 0))) }),
  mk({ id: "min2", group: "MATH", label: "Min", desc: "min(a,b)", in: ["NUMBER", "NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => Math.min(In(c, 0), In(c, 1)) }),
  mk({ id: "max2", group: "MATH", label: "Max", desc: "max(a,b)", in: ["NUMBER", "NUMBER"], out: "NUMBER", viz: "wire", vizMode: "RAW", compute: (c) => Math.max(In(c, 0), In(c, 1)) }),
  mk({ id: "pow", group: "MATH", label: "Power", desc: "x^e", in: ["NUMBER"], out: "NUMBER", params: [np("e", "Exponent", 2, 0, 5, 0.1)], viz: "curve", vizMode: "RAW", compute: (c) => Math.sign(In(c, 0)) * Math.pow(Math.abs(In(c, 0)), P(c, "e", 2)) }),
  mk({ id: "clamp", group: "MATH", label: "Clamp", desc: "Constrain to [lo, hi]", in: ["NUMBER"], out: "NUMBER", params: [np("lo", "Min", 0, -1e6, 1e6, 0.1), np("hi", "Max", 1, -1e6, 1e6, 0.1)], viz: "curve", vizMode: "RAW", compute: (c) => clampN(In(c, 0), P(c, "lo", 0), P(c, "hi", 1)) }),
  mk({ id: "scale", group: "MATH", label: "Scale ×k", desc: "x × k", in: ["NUMBER"], out: "NUMBER", params: [np("k", "Factor", 1, -100, 100, 0.1)], viz: "curve", vizMode: "RAW", compute: (c) => In(c, 0) * P(c, "k", 1) }),
  mk({ id: "offset", group: "MATH", label: "Offset +c", desc: "x + c", in: ["NUMBER"], out: "NUMBER", params: [np("c", "Offset", 0, -1e6, 1e6, 0.1)], viz: "curve", vizMode: "RAW", compute: (c) => In(c, 0) + P(c, "c", 0) }),

  // ───────── 7 · LOGIC_CONNECTOR (AND/OR/IF/CROSS/THRESHOLD → BOOL) ─────────
  mk({ id: "gt", group: "LOGIC_CONNECTOR", label: "Greater (a>b)", desc: "a > b → 1/0", in: ["NUMBER", "NUMBER"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) > In(c, 1) ? 1 : 0) }),
  mk({ id: "lt", group: "LOGIC_CONNECTOR", label: "Less (a<b)", desc: "a < b → 1/0", in: ["NUMBER", "NUMBER"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) < In(c, 1) ? 1 : 0) }),
  mk({ id: "threshold", group: "LOGIC_CONNECTOR", label: "Threshold", desc: "x > t → 1/0", in: ["NUMBER"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, params: [np("t", "Threshold", 0, -1e6, 1e6, 0.01)], viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) > P(c, "t", 0) ? 1 : 0) }),
  mk({ id: "between", group: "LOGIC_CONNECTOR", label: "Between", desc: "lo ≤ x ≤ hi → 1/0", in: ["NUMBER"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, params: [np("lo", "Min", 0, -1e6, 1e6, 0.01), np("hi", "Max", 1, -1e6, 1e6, 0.01)], viz: "ribbon", vizMode: "FSM", compute: (c) => { const x = In(c, 0); return x >= P(c, "lo", 0) && x <= P(c, "hi", 1) ? 1 : 0; } }),
  mk({ id: "and", group: "LOGIC_CONNECTOR", label: "AND", desc: "a AND b", in: ["BOOL", "BOOL"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) > 0.5 && In(c, 1) > 0.5 ? 1 : 0) }),
  mk({ id: "or", group: "LOGIC_CONNECTOR", label: "OR", desc: "a OR b", in: ["BOOL", "BOOL"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) > 0.5 || In(c, 1) > 0.5 ? 1 : 0) }),
  mk({ id: "not", group: "LOGIC_CONNECTOR", label: "NOT", desc: "Logical negation", in: ["BOOL"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) > 0.5 ? 0 : 1) }),
  mk({ id: "xor", group: "LOGIC_CONNECTOR", label: "XOR", desc: "Exclusive OR", in: ["BOOL", "BOOL"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => ((In(c, 0) > 0.5) !== (In(c, 1) > 0.5) ? 1 : 0) }),
  mk({ id: "if_else", group: "LOGIC_CONNECTOR", label: "If-Else", desc: "cond ? a : b", in: [{ name: "cond", type: "BOOL", required: true }, { name: "a", type: "NUMBER", required: true }, { name: "b", type: "NUMBER", required: true }], out: "NUMBER", viz: "wire", vizMode: "FSM", compute: (c) => (In(c, 0) > 0.5 ? In(c, 1) : In(c, 2)) }),
  mk({ id: "cross_above", group: "LOGIC_CONNECTOR", label: "Cross-Above", desc: "1 when a crosses above b; otherwise 0", in: ["NUMBER", "NUMBER"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) > In(c, 1) && at(c.inputs[0], c.i - 1) <= at(c.inputs[1], c.i - 1) ? 1 : 0) }),
  mk({ id: "cross_below", group: "LOGIC_CONNECTOR", label: "Cross-Below", desc: "1 when a crosses below b; otherwise 0", in: ["NUMBER", "NUMBER"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, viz: "ribbon", vizMode: "FSM", compute: (c) => (In(c, 0) < In(c, 1) && at(c.inputs[0], c.i - 1) >= at(c.inputs[1], c.i - 1) ? 1 : 0) }),
  mk({ id: "hysteresis", group: "LOGIC_CONNECTOR", label: "Hysteresis", desc: "Stateful threshold: on above the on threshold; off below the off threshold", in: ["NUMBER"], out: { name: "out", type: "BOOL", scaleFree: true, range: "[0,1]" }, params: [np("on", "On above", 0.7, -1e6, 1e6, 0.01), np("off", "Off below", 0.3, -1e6, 1e6, 0.01)], viz: "ribbon", vizMode: "FSM", compute: (c) => hystAt(c.inputs[0] || [], c.i, P(c, "on", 0.7), P(c, "off", 0.3)) }),

  // ───────── 8 · FSM_STATE (control-flow — runtime handles; metadata only except since_event) ─────────
  mk({ id: "state_start", group: "FSM_STATE", label: "Start State", desc: "State-machine entry", out: "STATE", viz: "fsm", vizMode: "FSM" }),
  mk({ id: "state_end", group: "FSM_STATE", label: "End State", desc: "State-machine exit and feature output", in: ["STATE"], out: "STATE", viz: "fsm", vizMode: "FSM" }),
  mk({ id: "state_node", group: "FSM_STATE", label: "State", desc: "A state, such as waiting for a reclaim", in: [{ name: "enter", type: "BOOL", required: true, accepts: ["BOOL", "STATE"] }], out: "STATE", viz: "fsm", vizMode: "FSM" }),
  mk({ id: "transition", group: "FSM_STATE", label: "Transition-On", desc: "Transition when the condition is true", in: [{ name: "on", type: "BOOL", required: true }], out: "STATE", viz: "fsm", vizMode: "FSM" }),
  mk({ id: "counter", group: "FSM_STATE", label: "Counter", desc: "Count bars while a state is active", in: [{ name: "active", type: "BOOL", required: true }], out: "NUMBER", viz: "fsm", vizMode: "FSM" }),
  mk({ id: "latch", group: "FSM_STATE", label: "Latch / Hold", desc: "Hold a value until reset", in: [{ name: "value", type: "NUMBER", required: true }, { name: "reset", type: "BOOL", required: true }], out: "NUMBER", viz: "fsm", vizMode: "FSM" }),
  mk({ id: "since_event", group: "FSM_STATE", label: "Since-Event", desc: "Bars since the most recent event", in: [{ name: "event", type: "BOOL", required: true }], out: "NUMBER", viz: "fsm", vizMode: "FSM", compute: (c) => { const s = c.inputs[0] || []; let n = c.i + 1; for (let j = c.i; j >= 0; j--) { if ((s[j] ?? 0) > 0.5) { n = c.i - j; break; } } return n; } }),

  // ───────── 9 · SAFETY_OUTPUT (KIDI · no-lookahead seal · emit feature) ─────────
  mk({ id: "emit_feature", group: "SAFETY_OUTPUT", label: "Emit Feature", desc: "Emit the final numeric L1 feature", in: [{ name: "value", type: "NUMBER", required: true, accepts: ["NUMBER", "RATIO_0_1", "PRICE", "STREAM_NUMBER", "BOOL"] }], out: "FEATURE_OUTPUT", emit: true, viz: "oscillator", vizMode: "NORMALIZED", seal: true, compute: (c) => In(c, 0) }),
  mk({ id: "clamp_out", group: "SAFETY_OUTPUT", label: "Clamp-Out [0,1]", desc: "Constrain output to 0–1", in: ["NUMBER"], out: { name: "out", type: "RATIO_0_1", scaleFree: true, range: "[0,1]" }, viz: "gauge", vizMode: "NORMALIZED", compute: (c) => clampN(In(c, 0), 0, 1) }),
  mk({ id: "map_label", group: "SAFETY_OUTPUT", label: "Map-Label", desc: "Display-only descriptive label; not an L2 pattern", in: ["NUMBER"], out: "FEATURE_OUTPUT", emit: true, viz: "badge", vizMode: "NORMALIZED", compute: (c) => In(c, 0) }),
  mk({ id: "nan_guard", group: "SAFETY_OUTPUT", label: "NaN/Inf Guard", desc: "Replace a non-finite value with zero", in: ["NUMBER"], out: "NUMBER", viz: "badge", vizMode: "NORMALIZED", compute: (c) => { const v = In(c, 0); return isFinite(v) ? v : 0; } }),
  mk({ id: "kidi_guard", group: "SAFETY_OUTPUT", label: "KIDI Guard", desc: "Near-zero denominator: SINGULAR; prevent division by zero", in: ["NUMBER"], out: "NUMBER", viz: "badge", vizMode: "NORMALIZED", kidi: true }),
  mk({ id: "nolookahead_seal", group: "SAFETY_OUTPUT", label: "No-Lookahead Seal", desc: "Seal against reading future bars", in: ["NUMBER"], out: "NUMBER", viz: "badge", vizMode: "NORMALIZED", seal: true, compute: (c) => In(c, 0) }),
];

export const BLOCKS_BY_ID: Record<string, L1PrimitiveBlockSpec> = Object.fromEntries(BLOCKS.map((b) => [b.blockId, b]));
export function blocksByGroup(g: L1Group): L1PrimitiveBlockSpec[] { return BLOCKS.filter((b) => b.group === g); }
export function blockSummary() {
  const byGroup: Record<string, number> = {}, byViz: Record<string, number> = {};
  let withCompute = 0, scaleFree = 0, provisional = 0;
  for (const b of BLOCKS) { byGroup[b.group] = (byGroup[b.group] || 0) + 1; byViz[b.viz] = (byViz[b.viz] || 0) + 1; if (b.compute) withCompute++; if (b.outputs[0].scaleFree) scaleFree++; if (b.provisional) provisional++; }
  return { total: BLOCKS.length, byGroup, byViz, withCompute, scaleFree, provisional };
}
