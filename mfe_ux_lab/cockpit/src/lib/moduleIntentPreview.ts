// moduleIntentPreview — WO INTENT_SANDBOX. Chạy condsMet ĐÃ CÓ trên metric-ctx CAUSAL per bar → trả điểm module
// "bắn" + câu lý do đọc được. Mục tiêu = INTENT VERIFICATION ("module bắn đúng ý không"), KHÔNG phải edge.
//
// KHÔNG nhân bản engine (fill/cost/order của realisticStrategySim). Chỉ tính LẠI metric-context READ-ONLY từ OHLC
// bằng cùng công thức causal (ema/rsi/atr — indicator primitive, như cardZones/footprintProxy tự tính ATR), +
// TÁI DÙNG pocDistAtrOf đã export (valueAreaProxy). Metric cần TRADE-STATE (vote/lệnh đang giữ/PnL ngày) KHÔNG
// preview được trên nến trần → NO_DATA (fail-closed, không bịa điểm). Đây là feature: sandbox nói rõ điều kiện nào
// xem được trên nến, điều kiện nào cần chạy Microscope.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { condsMet, METRICS, type Ctx, type CustomModule, type Condition } from "./customModule.ts";
import { pocDistAtrOf } from "./valueAreaProxy.ts";

// ── metric preview được từ OHLC causal (phần còn lại = NO_DATA vì cần trade/vote state) ──
export const PREVIEWABLE_METRICS: ReadonlySet<string> = new Set([
  "price", "rsi", "regime", "hour", "atrPct", "atrRatio", "emaGapAtr", "priceEmaAtr",
  "brokeHigh20", "brokeLow20", "wickRatio", "bodyRatio", "flowConsistency", "pocDistAtr", "extAtr", "candleDir",
]);
// metric NA trong preview (cần trade-state / vote / session-cost) — liệt kê rõ để sandbox trung thực
const NA_METRICS: ReadonlySet<string> = new Set(METRICS.map((m) => m.key).filter((k) => !PREVIEWABLE_METRICS.has(k)));

// ── indicator primitives causal (đọc-chỉ; KHÔNG phải engine fill/cost) ──
function emaSeries(vals: number[], p: number): number[] { const k = 2 / (p + 1); const o: number[] = []; let e = vals[0] ?? 0; vals.forEach((v, i) => { e = i === 0 ? v : v * k + e * (1 - k); o.push(e); }); return o; }
function rsiAt(bars: OhlcBar[], i: number, p = 14): number {
  if (i < p) return 50; let g = 0, l = 0;
  for (let k = i - p + 1; k <= i; k++) { const ch = bars[k].c - bars[k - 1].c; if (ch >= 0) g += ch; else l -= ch; }
  const rs = l === 0 ? 100 : g / l; return l === 0 ? 100 : 100 - 100 / (1 + rs);
}
function atrAt(bars: OhlcBar[], i: number, p = 14): number {
  if (i < 1) return bars[0].h - bars[0].l || 1; let a = bars[1].h - bars[1].l;
  for (let k = 1; k <= i; k++) { const tr = Math.max(bars[k].h - bars[k].l, Math.abs(bars[k].h - bars[k - 1].c), Math.abs(bars[k].l - bars[k - 1].c)); a = k === 1 ? tr : (a * (p - 1) + tr) / p; }
  return a || 1;
}
function hi20(bars: OhlcBar[], i: number): number { let h = -Infinity; for (let k = Math.max(0, i - 20); k < i; k++) if (bars[k].h > h) h = bars[k].h; return h; }
function lo20(bars: OhlcBar[], i: number): number { let l = Infinity; for (let k = Math.max(0, i - 20); k < i; k++) if (bars[k].l < l) l = bars[k].l; return l; }
function flowConsistencyAt(bars: OhlcBar[], i: number): number { let up = 0, n = 0; for (let k = Math.max(1, i - 7); k <= i; k++) { if (bars[k].c !== bars[k].o) { n++; if (bars[k].c > bars[k].o) up++; } } return n ? Math.max(up, n - up) / n : 0; }
function candleDirAt(bars: OhlcBar[], i: number, a: number): number {
  if (i < 1 || !(a > 0)) return 0; const b = bars[i], p = bars[i - 1];
  const rng = b.h - b.l, body = Math.abs(b.c - b.o), bodyP = Math.abs(p.c - p.o);
  if (body >= 0.3 * a && bodyP > 0) { if (p.c < p.o && b.c > b.o && b.c >= Math.max(p.o, p.c) && b.o <= Math.min(p.o, p.c)) return 1; if (p.c > p.o && b.c < b.o && b.c <= Math.min(p.o, p.c) && b.o >= Math.max(p.o, p.c)) return -1; }
  if (rng < 0.5 * a || body <= 0) return 0;
  const upW = b.h - Math.max(b.o, b.c), loW = Math.min(b.o, b.c) - b.l;
  if (loW >= 2 * body && upW <= body && Math.min(b.o, b.c) >= b.h - rng / 3) return 1;
  if (upW >= 2 * body && loW <= body && Math.max(b.o, b.c) <= b.l + rng / 3) return -1;
  if (loW / rng >= 2 / 3 && Math.min(b.o, b.c) >= b.h - rng / 3) return 1;
  if (upW / rng >= 2 / 3 && Math.max(b.o, b.c) <= b.l + rng / 3) return -1;
  return 0;
}
function hourOf(t: string): number { const m = t.match(/T(\d{2})/); return m ? +m[1] : 0; }

// ── PERF: precompute ema10/ema34/atr14/atr100 MỘT LẦN theo bars-ref (WeakMap) → buildPreviewCtx O(1) thay vì O(i).
// Trước: emaSeries(bars.slice(0,i+1)) + atrAt(bars,i) gọi MỖI nến = O(n²) → freeze trên tape M15 ~64k nến. Giá trị
// GIỮ NGUYÊN (EMA/ATR causal: series[i] == recompute tới i) → byte-identical (guard: moduleIntentPreview.harness).
function atrSeriesP(bars: OhlcBar[], p: number): number[] {
  const n = bars.length, out = new Array<number>(n);
  if (!n) return out; out[0] = (bars[0].h - bars[0].l) || 1; let a = 0;
  for (let i = 1; i < n; i++) { const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); a = i === 1 ? tr : (a * (p - 1) + tr) / p; out[i] = a || 1; }
  return out;
}
interface PreCtx { ema10: number[]; ema34: number[]; atr14: number[]; atr100: number[] }
const _preCache = new WeakMap<OhlcBar[], PreCtx>();
function preCtx(bars: OhlcBar[]): PreCtx {
  const hit = _preCache.get(bars); if (hit) return hit;
  const closes = bars.map((x) => x.c);
  const pre: PreCtx = { ema10: emaSeries(closes, 10), ema34: emaSeries(closes, 34), atr14: atrSeriesP(bars, 14), atr100: atrSeriesP(bars, 100) };
  _preCache.set(bars, pre); return pre;
}

export interface PreviewCtx { ctx: Ctx; na: string[] }
/** metric-ctx CAUSAL tại nến i (chỉ dùng bars ≤ i). na = metric không preview được (trade-state). */
export function buildPreviewCtx(bars: OhlcBar[], i: number): PreviewCtx {
  const b = bars[i]; const pre = preCtx(bars);
  const a = i < 1 ? ((bars[0].h - bars[0].l) || 1) : pre.atr14[i]; const e10 = pre.ema10[i] ?? b.c; const e34 = pre.ema34[i] ?? b.c;
  const rng = b.h - b.l, body = Math.abs(b.c - b.o);
  const ctx: Ctx = {
    price: b.c, rsi: rsiAt(bars, i), regime: e10 > e34 ? 1 : e10 < e34 ? -1 : 0, hour: hourOf(b.t),
    atrPct: a / b.c * 100, atrRatio: a / (pre.atr100[i] || a), emaGapAtr: (e10 - e34) / a, priceEmaAtr: (b.c - e10) / a,
    brokeHigh20: b.c > hi20(bars, i) ? 1 : 0, brokeLow20: b.c < lo20(bars, i) ? 1 : 0,
    wickRatio: rng > 0 ? +((rng - body) / rng).toFixed(3) : 0, bodyRatio: rng > 0 ? +(body / rng).toFixed(3) : 0,
    flowConsistency: +flowConsistencyAt(bars, i).toFixed(3), pocDistAtr: +pocDistAtrOf(bars, i, a).toFixed(3),
    extAtr: +(b.c > hi20(bars, i) ? (b.c - hi20(bars, i)) / a : b.c < lo20(bars, i) ? (lo20(bars, i) - b.c) / a : 0).toFixed(3),
    candleDir: candleDirAt(bars, i, a),
  };
  return { ctx, na: [...NA_METRICS] };
}

const mLabel = (k: string) => METRICS.find((x) => x.key === k)?.label || k;
function condText(c: Condition, ctx: Ctx): string {
  const v = ctx[c.metric];
  const val = v == null ? "?" : Number.isInteger(v) ? String(v) : v.toFixed(2);
  const rhs = c.op === "between" || c.op === "outside" ? `${c.value}..${c.value2 ?? "?"}` : String(c.value);
  return `${mLabel(c.metric)}=${val} ${c.op} ${rhs}`;
}

export interface FirePoint { i: number; time: string; price: number; reason: string }
export interface PreviewResult {
  fires: FirePoint[];
  previewable: boolean;      // false nếu có ĐK dùng metric NA (preview không đủ dữ kiện)
  naConditions: number;      // số điều kiện dùng metric NO_DATA
  naMetrics: string[];       // metric NA thực sự bị dùng
  usedMetrics: string[];
  scannedBars: number;
}

// signed margin của MỘT điều-kiện (dương = thoả, âm = chưa) — tín-hiệu LIÊN TỤC trước ngưỡng (pre-threshold).
function condMargin(v: number, c: Condition): number {
  const a = c.value, b = c.value2 ?? 0;
  switch (c.op) {
    case ">": case ">=": return v - a;
    case "<": case "<=": return a - v;
    case "==": return -Math.abs(v - a);
    case "between": return Math.min(v - a, b - v);   // trong dải [a,b] → dương
    case "outside": return Math.max(a - v, v - b);   // ngoài dải → dương
    default: return v - a;
  }
}
export interface MarginResult { series: number[]; previewable: boolean; naMetrics: string[]; usedMetrics: string[]; extraMetric?: string }
/** SATISFACTION-MARGIN liên tục per bar cho L4/L5 (pre-threshold): ALL → min các margin · ANY → max. Metric NA (trade-
 * state) → không preview được. Metric evidence L1/L2/L3 (không built-in) resolve qua `extra` (customMetricSeries). */
export function previewMarginSeries(bars: OhlcBar[], m: CustomModule, extra?: (key: string, bars: OhlcBar[]) => number[] | null, warmup = 40): MarginResult {
  const conds = m.conditions || [];
  const usedMetrics = [...new Set(conds.map((c) => c.metric))];
  const extraSeries = new Map<string, number[]>();
  const naMetrics: string[] = [];
  for (const k of usedMetrics) {
    if (PREVIEWABLE_METRICS.has(k)) continue;
    const s = extra?.(k, bars);   // evidence L1/L2/L3 → chuỗi block-computed; nếu không có → NA
    if (s && s.length === bars.length) extraSeries.set(k, s); else naMetrics.push(k);
  }
  const previewable = naMetrics.length === 0 && conds.length > 0;
  const series = new Array<number>(bars.length).fill(NaN);
  if (previewable) {
    for (let i = warmup; i < bars.length; i++) {
      const { ctx } = buildPreviewCtx(bars, i);
      for (const [k, s] of extraSeries) ctx[k] = s[i];
      const margins = conds.map((c) => condMargin(ctx[c.metric], c));
      series[i] = m.logic === "ANY" ? Math.max(...margins) : Math.min(...margins);   // ALL = khâu yếu nhất
    }
  }
  return { series, previewable, naMetrics, usedMetrics };
}

export interface CondMarginResult { perCond: { metric: string; label: string; series: number[] }[]; previewable: boolean; naMetrics: string[] }
/** Margin PER-CONDITION (pre-threshold) cho L4/L5 env — để kit biết ĐIỀU-KIỆN nào đang BÓ (block-rate). Dùng CÙNG
 * buildPreviewCtx + condMargin như previewMarginSeries → aggregate (ALL=min·ANY=max per bar) của perCond GIỐNG HỆT
 * series của previewMarginSeries (guard trong harness). Additive: không đổi export cũ. */
export function previewCondMarginSeries(bars: OhlcBar[], m: CustomModule, extra?: (key: string, bars: OhlcBar[]) => number[] | null, warmup = 40): CondMarginResult {
  const conds = m.conditions || [];
  const usedMetrics = [...new Set(conds.map((c) => c.metric))];
  const extraSeries = new Map<string, number[]>();
  const naMetrics: string[] = [];
  for (const k of usedMetrics) {
    if (PREVIEWABLE_METRICS.has(k)) continue;
    const s = extra?.(k, bars);
    if (s && s.length === bars.length) extraSeries.set(k, s); else naMetrics.push(k);
  }
  const previewable = naMetrics.length === 0 && conds.length > 0;
  const perCond = conds.map((c) => ({ metric: c.metric, label: `${mLabel(c.metric)} ${c.op} ${c.op === "between" || c.op === "outside" ? `${c.value}..${c.value2 ?? "?"}` : c.value}`, series: new Array<number>(bars.length).fill(NaN) }));
  if (previewable) {
    for (let i = warmup; i < bars.length; i++) {
      const { ctx } = buildPreviewCtx(bars, i);
      for (const [k, s] of extraSeries) ctx[k] = s[i];
      conds.forEach((c, ci) => { perCond[ci].series[i] = condMargin(ctx[c.metric], c); });
    }
  }
  return { perCond, previewable, naMetrics };
}

/** Preview module trên nến thật: điểm bắn (condsMet=true) + câu lý do. Fail-closed nếu điều kiện dùng metric NA. */
export function previewModule(bars: OhlcBar[], m: CustomModule, warmup = 40): PreviewResult {
  const conds = m.conditions || [];
  const usedMetrics = [...new Set(conds.map((c) => c.metric))];
  const naMetrics = usedMetrics.filter((k) => NA_METRICS.has(k));
  const previewable = naMetrics.length === 0 && conds.length > 0;
  const fires: FirePoint[] = [];
  if (previewable) {
    for (let i = warmup; i < bars.length; i++) {
      const { ctx } = buildPreviewCtx(bars, i);
      if (condsMet(ctx, m)) {
        // lý do = các điều kiện ĐANG đúng, với giá trị thực tại nến (đọc được như câu nói)
        const firing = conds.filter((c) => condsMet(ctx, { ...m, conditions: [c], logic: "ALL" }));
        const reason = `bắn vì ${firing.map((c) => condText(c, ctx)).join(m.logic === "ANY" ? " HOẶC " : " & ")}`;
        fires.push({ i, time: bars[i].t, price: bars[i].c, reason });
      }
    }
  }
  return { fires, previewable, naConditions: naMetrics.length, naMetrics, usedMetrics, scannedBars: Math.max(0, bars.length - warmup) };
}
