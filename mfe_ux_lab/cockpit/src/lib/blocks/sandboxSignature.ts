// sandboxSignature — P1 NỀN của viz-kit dùng chung mọi sandbox (L2/L4/L5). PURE · O(n) · causal · KHÔNG đụng engine.
// Từ một chuỗi TÍN-HIỆU (margin/composite) [+ các component] → (1) RIBBON states ON/OFF/NEUTRAL (run-length để vẽ nhẹ)
// (2) GAUGE %-ON + band (phát-hiện suy-biến) (3) CONTRIBUTION rows (component nào ĐANG BÓ/ép quyết-định).
//   • L4 gate: series = satisfaction-margin (dương=mở/âm=đóng) · components = per-condition margin → "điều-kiện nào chặn".
//   • L5 trigger: series = trigger-margin · components = setup/confirm margin.
//   • L2 indicator: series = composite (signed) · components = per-feature contribution.
// Đây là dữ-liệu cho RibbonLane/Gauge/ContributionBars — TÁCH khỏi React để test thuần + memoize được.

export type RibbonState = "ON" | "OFF" | "NEUTRAL";
export interface RibbonSeg { i0: number; i1: number; state: RibbonState }
export interface SigComponent { id: string; label: string; series: number[] }
export interface SigContribRow { id: string; label: string; bindRate: number; avgAbs: number }
export type SigBand = "GOOD" | "MID" | "DEGENERATE";
export interface SignatureResult {
  states: RibbonState[]; ribbon: RibbonSeg[];
  gauge: { onPct: number; band: SigBand; label: string };
  stats: { finiteN: number; evalN: number; min: number; max: number; mean: number; onPct: number; flat: boolean };
  contributions: SigContribRow[];
}
export interface SignatureOpts { warmup?: number; components?: SigComponent[]; onLabel?: string }

// band: một gate/trigger MỞ ~5-95% = đang phân-biệt (MID/GOOD); <5% hoặc >95% = SUY-BIẾN (chặn hết / mở hết → vô-ảnh-hưởng).
function bandOf(onPct: number, flat: boolean): SigBand { if (flat || onPct < 5 || onPct > 95) return "DEGENERATE"; return onPct >= 20 && onPct <= 80 ? "GOOD" : "MID"; }

export function computeSignature(series: number[], opts: SignatureOpts = {}): SignatureResult {
  const warmup = opts.warmup ?? 0; const components = opts.components ?? [];
  const states: RibbonState[] = series.map((v, i) => (i < warmup || !Number.isFinite(v)) ? "NEUTRAL" : v > 0 ? "ON" : v < 0 ? "OFF" : "NEUTRAL");
  // run-length ribbon (gộp các nến cùng state → vẽ nhẹ, không mỗi nến một rect)
  const ribbon: RibbonSeg[] = [];
  for (let i = 0; i < states.length; i++) { const s = states[i]; const last = ribbon[ribbon.length - 1]; if (last && last.state === s) last.i1 = i; else ribbon.push({ i0: i, i1: i, state: s }); }
  const fin = series.filter(Number.isFinite);
  const finiteN = fin.length, min = finiteN ? Math.min(...fin) : 0, max = finiteN ? Math.max(...fin) : 0, mean = finiteN ? fin.reduce((a, b) => a + b, 0) / finiteN : 0;
  const onN = states.filter((s) => s === "ON").length, evalN = states.filter((s) => s !== "NEUTRAL").length;
  const onPct = evalN ? +(onN / evalN * 100).toFixed(1) : 0;
  const flat = finiteN > 0 && max - min < 1e-9;
  // contribution: mỗi nến, component có margin NHỎ NHẤT là cái ĐANG BÓ (binding). Tính argmin MỘT LẦN/nến → O(n·C)
  // tổng (không phải O(n·C²)). bindRate = tần-suất nó bó (L4: điều-kiện chặn nhiều nhất). NaN ở bất-kỳ component → bỏ nến.
  const bindIdx = new Array<number>(series.length).fill(-1);
  for (let i = warmup; i < series.length; i++) {
    let mi = -1, mv = Infinity, allFin = true;
    for (let k = 0; k < components.length; k++) { const v = components[k].series[i]; if (!Number.isFinite(v)) { allFin = false; break; } if (v < mv) { mv = v; mi = k; } }
    if (allFin) bindIdx[i] = mi;
  }
  let evalC = 0; for (let i = warmup; i < series.length; i++) if (bindIdx[i] >= 0) evalC++;
  const contributions: SigContribRow[] = components.map((c, ci) => {
    let bind = 0, sumAbs = 0, nAbs = 0;
    for (let i = warmup; i < series.length; i++) { if (bindIdx[i] < 0) continue; if (bindIdx[i] === ci) bind++; sumAbs += Math.abs(c.series[i]); nAbs++; }
    return { id: c.id, label: c.label, bindRate: evalC ? +(bind / evalC).toFixed(3) : 0, avgAbs: nAbs ? +(sumAbs / nAbs).toFixed(4) : 0 };
  }).sort((a, b) => b.bindRate - a.bindRate);
  return { states, ribbon, gauge: { onPct, band: bandOf(onPct, flat), label: (opts.onLabel ?? "ON") + " " + onPct.toFixed(0) + "%" }, stats: { finiteN, evalN, min, max, mean, onPct, flat }, contributions };
}
