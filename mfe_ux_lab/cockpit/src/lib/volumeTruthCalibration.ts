// volumeTruthCalibration — VALIDATION_ONLY / SHADOW_ONLY (WO: MFE_COCKPIT_VALUE_AREA_VOLUME_TRUTH_WO_V1 · P2-revised)
//
// Câu hỏi methodology sạch: Value Area proxy TPO (đếm nến, time-based) có XẤP XỈ Volume-based Value Area thật
// không, trên gold có volume thật? VALIDATION không FITTING — KHÔNG chỉnh proxy P1 cho khớp; chỉ ĐO và báo cáo
// độ lệch trung thực. binWidth/binKeyOf/valueAreaOf import từ valueAreaProxy (P1) — CÙNG bars, CÙNG binning,
// khác biệt DUY NHẤT là trọng số (count vs volume) → apple-to-apple.
//
// PER-ASSET: gold-H1 (GOLD_H1_REAL_VOLUME_EST) và GC (GC_COMEX_FUTURES) là INSTRUMENT KHÁC XAUUSD. Số ở đây
// KHÔNG được gộp vào memory/calibration XAUUSD, KHÔNG phải bằng chứng edge (edge qua signal_material_gate.py).
// Mẫu giới hạn: gold-H1 ~2 năm thô EST · GC 10 ngày một regime futures → gợi ý phương pháp trên mẫu, KHÔNG era-stable.
import { binWidth, binKeyOf, valueAreaOf } from "./valueAreaProxy.ts";

// ── PARSERS (fail-closed) ──
export interface VolBar { c: number; vol: number; t: string; o: number; h: number; l: number }
export interface ParseResult { status: "OK" | "INSUFFICIENT_VOLUME_DATA"; bars: VolBar[]; note: string }

function splitCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const header = (lines[0] || "").split(",").map((s) => s.trim());
  return { header, rows: lines.slice(1).map((l) => l.split(",")) };
}
function colIndex(header: string[], names: string[]): number {
  for (const n of names) { const i = header.findIndex((h) => h.toLowerCase() === n.toLowerCase()); if (i >= 0) return i; }
  return -1;
}
function parseGeneric(text: string, timeNames: string[]): ParseResult {
  const { header, rows } = splitCsv(text);
  const iT = colIndex(header, timeNames), iO = colIndex(header, ["open"]), iH = colIndex(header, ["high"]),
    iL = colIndex(header, ["low"]), iC = colIndex(header, ["close"]), iV = colIndex(header, ["volume"]);
  if (iC < 0 || iV < 0 || iO < 0) return { status: "INSUFFICIENT_VOLUME_DATA", bars: [], note: "Required open, close or volume column is missing." };
  const bars: VolBar[] = [];
  for (const r of rows) {
    const c = +r[iC], vol = +r[iV], o = +r[iO], h = +r[iH], l = +r[iL];
    if (!isFinite(c) || !isFinite(vol)) continue;   // dòng hỏng → bỏ, không đoán
    bars.push({ t: iT >= 0 ? (r[iT] || "").trim() : "", o, h, l, c, vol });
  }
  if (!bars.length) return { status: "INSUFFICIENT_VOLUME_DATA", bars: [], note: "No valid volume observations." };
  return { status: "OK", bars, note: `${bars.length} bar` };
}
/** gold H1: DateTime,Date,Time,Year,Month,Day,Hour,Open,High,Low,Close,Volume,… */
export function parseGoldH1(text: string): ParseResult { return parseGeneric(text, ["DateTime", "Date"]); }
/** GC M1 futures: datetime,symbol,open,high,low,close,volume */
export function parseGcM1(text: string): ParseResult { return parseGeneric(text, ["datetime"]); }

// ── HISTOGRAM có trọng số VOLUME (cùng cửa sổ 96-bar + cùng binWidth/binKeyOf như P1; chỉ khác weight) ──
export interface WeightedHistogram { bin: number; counts: Map<number, number>; total: number; pocKey: number }
export function buildVolumeHistogram(bars: { c: number; vol: number }[], i: number, a: number): WeightedHistogram {
  const bin = binWidth(a); const counts = new Map<number, number>();
  for (let k = Math.max(0, i - 95); k <= i; k++) { const key = binKeyOf(bars[k].c, bin); counts.set(key, (counts.get(key) || 0) + (bars[k].vol || 0)); }
  let best = -1, bestK = binKeyOf(bars[i].c, bin), total = 0;
  for (const [k2, w2] of counts) { total += w2; if (w2 > best) { best = w2; bestK = k2; } }
  return { bin, counts, total, pocKey: bestK };
}

// Thuật toán mở rộng 70% TỔNG QUÁT trên Map<key,weight> — GIỐNG HỆT logic valueAreaOf (mở rộng từ POC ra hai
// phía, hòa ưu tiên lên). Test "volume phẳng ≡ TPO-VA" chứng minh nó trùng khớp valueAreaOf khi weight=count.
function valueAreaFromHist(h: WeightedHistogram, mass: number): { poc: number; vah: number; val: number } {
  const keys = [...h.counts.keys()];
  const minK = Math.min(...keys), maxK = Math.max(...keys);
  const w = (k: number) => h.counts.get(k) || 0;
  let upK = h.pocKey, dnK = h.pocKey, acc = w(h.pocKey);
  const target = mass * h.total;
  while (acc < target && (upK < maxK || dnK > minK)) {
    const upNext = upK < maxK ? w(upK + 1) : -1;
    const dnNext = dnK > minK ? w(dnK - 1) : -1;
    if (upNext >= dnNext) { upK++; acc += Math.max(0, upNext); }
    else { dnK--; acc += Math.max(0, dnNext); }
  }
  return { poc: h.pocKey * h.bin, vah: upK * h.bin, val: dnK * h.bin };
}
/** Volume-weighted Value Area — CÙNG thuật toán 70% như valueAreaOf, chỉ weight = volume thật. */
export function volumeValueAreaOf(bars: { c: number; vol: number }[], i: number, a: number, mass = 0.70): { poc: number; vah: number; val: number } {
  return valueAreaFromHist(buildVolumeHistogram(bars, i, a), mass);
}

// ── SO KHỚP TPO ↔ Volume trên CÙNG cửa sổ/ATR (khác biệt duy nhất = trọng số) ──
export interface CalibThresholds { mass?: number; binMult?: number; pocDiffMaxAtr?: number; overlapMinPct?: number }
export interface TpoVsVolume {
  tpo: { poc: number; vah: number; val: number };
  volume: { poc: number; vah: number; val: number };
  poc_diff_atr: number;
  va_overlap_pct: number;                 // chồng lấn [val,vah] TPO vs Volume (% của union)
  verdict: "TPO_APPROXIMATES_VOLUME" | "TPO_DIVERGES" | "INSUFFICIENT_VOLUME_DATA";
}
// Ngưỡng verdict — CONFIGURABLE, mặc định ghi rõ (không câm): POC lệch ≤0.5 ATR VÀ overlap ≥60% → APPROXIMATES.
export const DEFAULT_THRESHOLDS: Required<Pick<CalibThresholds, "pocDiffMaxAtr" | "overlapMinPct">> = { pocDiffMaxAtr: 0.5, overlapMinPct: 60 };

export function compareTpoVsVolume(bars: { c: number; vol: number }[], i: number, a: number, opt: CalibThresholds = {}): TpoVsVolume {
  const mass = opt.mass ?? 0.70;
  // binMult cho phép sweep bin-width-multiplier: ATR hiệu dụng = a × (binMult/0.25) để binWidth = ATR×0.25 vẫn đúng công thức P1
  const aEff = opt.binMult != null ? a * (opt.binMult / 0.25) : a;
  const tpo = valueAreaOf(bars, i, aEff, mass);
  const volume = volumeValueAreaOf(bars, i, aEff, mass);
  const poc_diff_atr = Math.abs(tpo.poc - volume.poc) / (a || 1);
  const loU = Math.min(tpo.val, volume.val), hiU = Math.max(tpo.vah, volume.vah);
  const loI = Math.max(tpo.val, volume.val), hiI = Math.min(tpo.vah, volume.vah);
  const union = hiU - loU, inter = Math.max(0, hiI - loI);
  const va_overlap_pct = union > 0 ? +(inter / union * 100).toFixed(2) : 0;
  const pMax = opt.pocDiffMaxAtr ?? DEFAULT_THRESHOLDS.pocDiffMaxAtr;
  const oMin = opt.overlapMinPct ?? DEFAULT_THRESHOLDS.overlapMinPct;
  const verdict = (poc_diff_atr <= pMax && va_overlap_pct >= oMin) ? "TPO_APPROXIMATES_VOLUME" : "TPO_DIVERGES";
  return { tpo, volume, poc_diff_atr: +poc_diff_atr.toFixed(4), va_overlap_pct, verdict };
}

// ── AGGREGATE qua nhiều cửa sổ (một nguồn) + rank_corr POC ──
export interface CalibSummary {
  source: string; nWindows: number;
  mean_poc_diff_atr: number; median_poc_diff_atr: number; mean_overlap_pct: number;
  approximates_pct: number;      // % cửa sổ verdict APPROXIMATES
  rank_corr: number;             // Spearman giữa POC-time và POC-volume qua các cửa sổ
  verdict: "TPO_APPROXIMATES_VOLUME" | "TPO_DIVERGES" | "INSUFFICIENT_VOLUME_DATA";
}
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => { const idx = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(xs.length); idx.forEach(([, i], j) => (r[i as number] = j)); return r; };
  const ra = rank(a), rb = rank(b), n = a.length; if (n < 2) return 0;
  let d2 = 0; for (let i = 0; i < n; i++) { const d = ra[i] - rb[i]; d2 += d * d; }
  return +(1 - (6 * d2) / (n * (n * n - 1))).toFixed(4);
}
/** Chạy so khớp qua các cửa sổ (bước `step`) trên một nguồn; atrOf(i) cấp ATR causal tại i.
 *  minBars: ngưỡng dữ liệu tối thiểu (default 200). Với held-out NHỎ (ví dụ GC resample-H1 ~163 bar) có thể hạ,
 *  NHƯNG kết quả mẫu bé phải ghi rõ "LOW_SAMPLE" trong báo cáo — không coi ngang bằng chứng cửa sổ lớn. */
export function calibrateSource(source: string, bars: { c: number; vol: number }[], atrOf: (i: number) => number, opt: CalibThresholds = {}, step = 24, minBars = 200): CalibSummary {
  if (bars.length < minBars) return { source, nWindows: 0, mean_poc_diff_atr: NaN, median_poc_diff_atr: NaN, mean_overlap_pct: NaN, approximates_pct: NaN, rank_corr: NaN, verdict: "INSUFFICIENT_VOLUME_DATA" };
  const diffs: number[] = [], overlaps: number[] = [], pocT: number[] = [], pocV: number[] = []; let approx = 0;
  for (let i = 120; i < bars.length; i += step) {
    const a = atrOf(i); if (!(a > 0)) continue;
    const cmp = compareTpoVsVolume(bars, i, a, opt);
    diffs.push(cmp.poc_diff_atr); overlaps.push(cmp.va_overlap_pct); pocT.push(cmp.tpo.poc); pocV.push(cmp.volume.poc);
    if (cmp.verdict === "TPO_APPROXIMATES_VOLUME") approx++;
  }
  if (!diffs.length) return { source, nWindows: 0, mean_poc_diff_atr: NaN, median_poc_diff_atr: NaN, mean_overlap_pct: NaN, approximates_pct: NaN, rank_corr: NaN, verdict: "INSUFFICIENT_VOLUME_DATA" };
  const sorted = [...diffs].sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const approximates_pct = +(approx / diffs.length * 100).toFixed(1);
  const oMin = opt.overlapMinPct ?? DEFAULT_THRESHOLDS.overlapMinPct;
  const pMax = opt.pocDiffMaxAtr ?? DEFAULT_THRESHOLDS.pocDiffMaxAtr;
  return {
    source, nWindows: diffs.length,
    mean_poc_diff_atr: +mean(diffs).toFixed(4), median_poc_diff_atr: +sorted[Math.floor(sorted.length / 2)].toFixed(4),
    mean_overlap_pct: +mean(overlaps).toFixed(2), approximates_pct, rank_corr: spearman(pocT, pocV),
    verdict: (mean(diffs) <= pMax && mean(overlaps) >= oMin) ? "TPO_APPROXIMATES_VOLUME" : "TPO_DIVERGES",
  };
}

/** ATR Wilder causal (dùng cho calibration thật; không đụng engine). */
export function atrSeries(bars: { h: number; l: number; c: number }[], period = 14): number[] {
  const out = new Array(bars.length).fill(0); let a = 0;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    a = i <= period ? (a * (i - 1) + tr) / i : (a * (period - 1) + tr) / period; out[i] = a;
  }
  return out;
}
