// quantValidation — QL-8 validation backend. Given a CAUSAL score series (the L3 formula output) and the bars, it
// measures whether the score actually PREDICTS forward returns, honestly: Information Coefficient (corr of score
// at bar i vs the next-h-bar return), an OUT-OF-SAMPLE split (earlier = in-sample, later = unseen), WALK-FORWARD
// era stability (sign-consistency across consecutive eras), and a PERMUTATION NULL (shuffle the outcome → the real
// IC must beat the 95th-percentile null = anti-curve-fit gate). The label = raw forward price return — independent
// of the feature source, so this is NOT the C3D0 circular-label trap. Verdict is honest: NULL_EDGE if it can't beat
// noise. This runs on the available SIM sample — a real statistical test, not a guarantee of live performance.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";

export interface ValidationConfig { horizon: number; oosFrac: number; eras: number; permutations: number; minSample: number; icThreshold: number; seed: number }
export const DEFAULT_VALIDATION: ValidationConfig = { horizon: 5, oosFrac: 0.3, eras: 4, permutations: 300, minSample: 150, icThreshold: 0.03, seed: 12345 };

export interface EraResult { label: string; ic: number; n: number; sign: number }
export interface ValidationReport {
  horizon: number;
  sample: { eff: number; require: number; ok: boolean };
  realIC: number;
  oos: { isIC: number; oosIC: number; threshold: number; pass: boolean };
  walkForward: { eras: EraResult[]; stability: number; meanIC: number; status: "PASS" | "PARTIAL" | "FAIL" };
  permutation: { realIC: number; nullP95: number; pValue: number; beatsNull: boolean; perms: number };
  monteCarlo: { p05: number; p25: number; p50: number; p75: number; p95: number; activeN: number; risk: "ROBUST" | "ACCEPTABLE" | "ELEVATED" | "UNKNOWN" };
  // RISK-FILTER lens — cho score kiểu RISK-VETO (không phải alpha): nến score CAO có downside xấu hơn score THẤP không?
  riskFilter: { hiTailP05: number; loTailP05: number; hiLossRate: number; loLossRate: number; hiMean: number; loMean: number; hiN: number; loN: number; usefulFilter: boolean };
  overall: "EDGE_OOS_QUALIFIED" | "CONDITIONAL_EDGE" | "NULL_EDGE" | "INSUFFICIENT";
  notes: string[];
  ranAt: string;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function pearson(a: number[], b: number[]): number {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < a.length; i++) if (isFinite(a[i]) && isFinite(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  const n = xs.length; if (n < 3) return 0;
  const mx = mean(xs), my = mean(ys); let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; cov += dx * dy; vx += dx * dx; vy += dy * dy; }
  return vx > 1e-12 && vy > 1e-12 ? cov / Math.sqrt(vx * vy) : 0;
}
export function forwardReturn(bars: OhlcBar[], h: number): number[] {
  return bars.map((b, i) => (i + h < bars.length && b.c ? (bars[i + h].c - b.c) / b.c : NaN));
}
function mulberry32(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export function runValidation(score: number[], bars: OhlcBar[], cfgIn?: Partial<ValidationConfig>): ValidationReport {
  const cfg = { ...DEFAULT_VALIDATION, ...cfgIn };
  const fr = forwardReturn(bars, cfg.horizon);
  const S: number[] = [], F: number[] = [];
  for (let i = 0; i < bars.length; i++) if (i + cfg.horizon < bars.length && isFinite(score[i]) && isFinite(fr[i])) { S.push(score[i]); F.push(fr[i]); }
  const eff = S.length, notes: string[] = [];
  const realIC = pearson(S, F);

  // OOS split — earlier = in-sample, later = out-of-sample (unseen)
  const sp = Math.floor((1 - cfg.oosFrac) * eff);
  const isIC = pearson(S.slice(0, sp), F.slice(0, sp)), oosIC = pearson(S.slice(sp), F.slice(sp));
  const oosPass = eff >= cfg.minSample && Math.abs(oosIC) >= cfg.icThreshold && Math.sign(oosIC) === Math.sign(isIC) && Math.sign(isIC) === Math.sign(realIC);

  // Walk-forward era stability
  const eras: EraResult[] = [];
  const per = Math.floor(eff / cfg.eras);
  for (let e = 0; e < cfg.eras && per > 5; e++) { const a = e * per, b = e === cfg.eras - 1 ? eff : a + per; const ic = pearson(S.slice(a, b), F.slice(a, b)); eras.push({ label: `era ${e + 1}`, ic, n: b - a, sign: Math.sign(ic) }); }
  const overallSign = Math.sign(realIC);
  const stability = eras.length ? eras.filter((e) => e.sign === overallSign && overallSign !== 0).length / eras.length : 0;
  const meanIC = mean(eras.map((e) => e.ic));
  const wfStatus: "PASS" | "PARTIAL" | "FAIL" = stability >= 0.75 && Math.abs(meanIC) >= cfg.icThreshold ? "PASS" : stability >= 0.5 ? "PARTIAL" : "FAIL";

  // Permutation null — shuffle the outcome, the real |IC| must beat the 95th percentile
  const rng = mulberry32(cfg.seed); const nulls: number[] = [];
  for (let p = 0; p < cfg.permutations; p++) { const Fp = F.slice(); for (let i = Fp.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [Fp[i], Fp[j]] = [Fp[j], Fp[i]]; } nulls.push(Math.abs(pearson(S, Fp))); }
  nulls.sort((a, b) => a - b);
  const nullP95 = nulls[Math.floor(0.95 * (nulls.length - 1))] ?? 0;
  const pValue = nulls.filter((v) => v >= Math.abs(realIC)).length / Math.max(1, nulls.length);
  const beatsNull = Math.abs(realIC) > nullP95;

  // Monte-Carlo — bootstrap-resample the realized returns of "active" bars (score above its median). This resamples
  // the SAME returns (no new info) to estimate path/sequence-risk dispersion, not new edge.
  const thr = median(S); const active = F.filter((_, i) => S[i] > thr);
  let mc: ValidationReport["monteCarlo"];
  if (active.length < 20) mc = { p05: 0, p25: 0, p50: 0, p75: 0, p95: 0, activeN: active.length, risk: "UNKNOWN" };
  else {
    const rng2 = mulberry32(cfg.seed + 7), tot: number[] = [], B = Math.min(1500, cfg.permutations * 4);
    for (let b = 0; b < B; b++) { let s2 = 0; for (let k = 0; k < active.length; k++) s2 += active[Math.floor(rng2() * active.length)]; tot.push(s2); }
    tot.sort((a, b) => a - b);
    const pc = (p: number) => tot[Math.floor(p * (tot.length - 1))];
    const p05 = pc(0.05), p50 = pc(0.5);
    const risk = p05 >= 0 ? "ROBUST" : p05 > -Math.abs(p50) ? "ACCEPTABLE" : "ELEVATED";
    mc = { p05, p25: pc(0.25), p50, p75: pc(0.75), p95: pc(0.95), activeN: active.length, risk };
  }

  // RISK-FILTER lens — câu hỏi cho một RISK-VETO score (không phải alpha): CHẶN nến score CAO có tránh outcome xấu
  // không? So forward-return nến score-CAO (≥ p70) vs score-THẤP (≤ p30): tail p05 + loss-rate. Nhóm CAO xấu hơn rõ →
  // score là risk-filter HỮU ÍCH dù IC≈0. (Đọc-chỉ, không đổi verdict alpha — chỉ thêm góc nhìn đúng cho risk-veto.)
  const Ssort = S.slice().sort((a, b) => a - b);
  const p70 = Ssort[Math.floor(0.7 * (Ssort.length - 1))] ?? 0, p30 = Ssort[Math.floor(0.3 * (Ssort.length - 1))] ?? 0;
  const hiF = F.filter((_, i) => S[i] >= p70), loF = F.filter((_, i) => S[i] <= p30);
  const pct5 = (a: number[]) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(0.05 * (s.length - 1))]; };
  const lossRate = (a: number[]) => (a.length ? a.filter((x) => x < 0).length / a.length : NaN);
  // usefulFilter = KHÁC BIỆT RÕ (không phải chênh nhiễu): tail nến score-cao xấu hơn ≥0.4% return, HOẶC loss-rate cao hơn ≥6đ%.
  const rf = { hiTailP05: pct5(hiF), loTailP05: pct5(loF), hiLossRate: lossRate(hiF), loLossRate: lossRate(loF), hiMean: mean(hiF), loMean: mean(loF), hiN: hiF.length, loN: loF.length, usefulFilter: hiF.length >= 20 && loF.length >= 20 && ((pct5(loF) - pct5(hiF)) > 0.004 || (lossRate(hiF) - lossRate(loF)) > 0.06) };

  let overall: ValidationReport["overall"];
  if (eff < cfg.minSample) { overall = "INSUFFICIENT"; notes.push(`Effective sample ${eff} is below the minimum ${cfg.minSample}; insufficient for a conclusion.`); }
  else if (!beatsNull) { overall = "NULL_EDGE"; notes.push("Does not exceed the 95th-percentile permutation null. This alpha test cannot distinguish it from noise; using it as a profit signal carries curve-fitting risk."); }
  else if (oosPass && wfStatus === "PASS") overall = "EDGE_OOS_QUALIFIED";
  else { overall = "CONDITIONAL_EDGE"; notes.push("Above null, but OOS/walk-forward results are not stable in every window."); }
  if (rf.usefulFilter) notes.push(`Risk-filter view: high-score candles have worse downside than low-score candles (p05 tail ${(rf.hiTailP05 * 100).toFixed(2)}% vs ${(rf.loTailP05 * 100).toFixed(2)}% · loss-rate ${(rf.hiLossRate * 100).toFixed(0)}% vs ${(rf.loLossRate * 100).toFixed(0)}%). For a risk-veto hypothesis, excluding high-score candles may improve downside even when forward-return IC is near zero. Evaluate MAE, tails and loss rate separately from alpha IC.`);
  notes.push("Label is the raw forward return, independent of the feature source. This avoids circular labels. Statistics on the simulated H1 sample do not establish live performance.");
  return { horizon: cfg.horizon, sample: { eff, require: cfg.minSample, ok: eff >= cfg.minSample }, realIC, oos: { isIC, oosIC, threshold: cfg.icThreshold, pass: oosPass }, walkForward: { eras, stability, meanIC, status: wfStatus }, permutation: { realIC, nullP95, pValue, beatsNull, perms: cfg.permutations }, monteCarlo: mc, riskFilter: rf, overall, notes, ranAt: new Date().toISOString() };
}
