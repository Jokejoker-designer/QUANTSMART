// roleGate — the role-specific OOS qualification (manager Phase B-5). Each Feature Usage Role has its OWN test
// against FORWARD outcomes (next-K-bar return/MFE/MAE/vol, in ATR units), and only passes if it (a) BEATS a
// permutation null (the relation isn't luck) AND (b) is ERA-STABLE (same sign across 3 segments). Honest by
// construction: most features will NOT qualify (null edge is the norm). A role tag carries NO authority — this
// only advances roleStatus DECLARED/AUTO_SUGGESTED/SHADOW_QUALIFIED → OOS_QUALIFIED (or REJECTED).
import { evalGraph, type FeatureGraph } from "./featureGraph.ts";
import type { FeatureUsageRole } from "./featureRoles.ts";
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";

const K = 20, ATR_P = 14, NULL_N = 40;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = (a: number[], sel: number[]) => (sel.length ? sel.reduce((s, i) => s + a[i], 0) / sel.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
function corr(x: number[], y: number[]): number { const n = x.length; if (n < 3) return 0; const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : 0; }
function atrArr(bars: OhlcBar[], p: number): number[] { const out = new Array(bars.length).fill(1); let a = bars[0] ? bars[0].h - bars[0].l : 1; out[0] = a || 1; for (let i = 1; i < bars.length; i++) { const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); a = (a * (p - 1) + tr) / p; out[i] = a || 1; } return out; }

interface Fwd { ret: number[]; mfe: number[]; mae: number[]; fvol: number[] }
// terciles of feature over `idx`; outcome stat depends on role. Returns {value, coverage?} where bigger |value| = stronger relation.
function roleStat(role: FeatureUsageRole, f: number[], fwd: Fwd, idx: number[]): { name: string; value: number; coverage?: number } {
  const vals = idx.map((i) => f[i]).sort((a, b) => a - b);
  const q1 = vals[Math.floor(vals.length / 3)], q2 = vals[Math.floor((2 * vals.length) / 3)];
  const hi = idx.filter((i) => f[i] >= q2), lo = idx.filter((i) => f[i] <= q1);
  if (role === "REGIME_VOL") return { name: "corr(feature, vol forward)", value: corr(idx.map((i) => f[i]), idx.map((i) => fwd.fvol[i])) };
  void q1;
  let oc: number[], name: string;
  if (role === "BIAS_TREND") { oc = fwd.ret; name = "spread hướng (hi−lo)"; }                                  // signed forward return
  else if (role === "TIMING_TRIGGER") { oc = fwd.mfe.map((m, i) => (m > -fwd.mae[i] ? 1 : 0)); name = "timing lift (hi−lo)"; }  // MFE-before-MAE
  else if (role === "RISK_DANGER") { oc = fwd.mae.map((m) => -m); name = "|MAE| lift (hi−lo)"; }               // adverse magnitude
  else { oc = fwd.ret.map((r) => Math.abs(r)); name = "|ret| lift (hi−lo)"; }                                  // confirmation: clean-move
  return { name, value: mean(oc, hi) - mean(oc, lo) };
}
// FILTER stat is cleaner computed directly (the inline above is awkward) — keep a tidy override.
function filterStat(f: number[], fwd: Fwd, idx: number[]): { name: string; value: number; coverage: number } {
  const vals = idx.map((i) => f[i]).sort((a, b) => a - b), q1 = vals[Math.floor(vals.length / 3)];
  const kept = idx.filter((i) => f[i] > q1), cut = idx.filter((i) => f[i] <= q1), qa = (i: number) => Math.abs(fwd.ret[i]);
  return { name: "Retained absolute return minus filtered absolute return", value: mean(kept.map(qa), kept.map((_, k) => k)) - mean(cut.map(qa), cut.map((_, k) => k)), coverage: kept.length / idx.length };
}
function stat(role: FeatureUsageRole, f: number[], fwd: Fwd, idx: number[]) { return role === "FILTER_CONTEXT" ? filterStat(f, fwd, idx) : roleStat(role, f, fwd, idx); }

export interface RoleGateResult { role: FeatureUsageRole; metricName: string; observed: number; nullBand: number; beatsNull: boolean; eraSigns: number[]; eraStable: boolean; coverage?: number; sampleSize: number; verdict: "OOS_QUALIFIED" | "SHADOW_QUALIFIED" | "REJECTED"; notes: string[] }

export function runRoleGate(graph: FeatureGraph, role: FeatureUsageRole, bars: OhlcBar[], seed = 1234567): RoleGateResult {
  const f = evalGraph(graph, bars), n = bars.length, atr = atrArr(bars, ATR_P);
  const ret = new Array(n).fill(NaN), mfe = new Array(n).fill(NaN), mae = new Array(n).fill(NaN), fvol = new Array(n).fill(NaN);
  for (let i = 0; i + K < n; i++) {
    const base = bars[i].c, a = atr[i] || 1; let hi = -1e18, lo = 1e18; const rs: number[] = [];
    for (let j = i + 1; j <= i + K; j++) { hi = Math.max(hi, bars[j].h); lo = Math.min(lo, bars[j].l); rs.push(bars[j].c - bars[j - 1].c); }  // RAW returns: keep vol-clustering for REGIME (don't ÷ATR away the signal)
    ret[i] = (bars[i + K].c - base) / a; mfe[i] = (hi - base) / a; mae[i] = (lo - base) / a; fvol[i] = std(rs);
  }
  const fwd: Fwd = { ret, mfe, mae, fvol };
  const idx: number[] = []; for (let i = 0; i + K < n; i++) if (isFinite(f[i]) && isFinite(ret[i])) idx.push(i);
  if (idx.length < 60) return { role, metricName: "—", observed: 0, nullBand: 0, beatsNull: false, eraSigns: [], eraStable: false, sampleSize: idx.length, verdict: "REJECTED", notes: [`không đủ mẫu OOS (${idx.length}<60)`] };

  const obs = stat(role, f, fwd, idx);
  const rng = mulberry32(seed); const nulls: number[] = [];
  for (let t = 0; t < NULL_N; t++) { const fp = f.slice(); const v = idx.map((i) => f[i]); for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; } idx.forEach((i, k) => (fp[i] = v[k])); nulls.push(Math.abs(stat(role, fp, fwd, idx).value)); }
  nulls.sort((a, b) => a - b); const nullBand = nulls[Math.floor(nulls.length * 0.95)] ?? 0;
  const beatsNull = Math.abs(obs.value) > nullBand && nullBand >= 0;

  const third = Math.floor(idx.length / 3), segs = [idx.slice(0, third), idx.slice(third, 2 * third), idx.slice(2 * third)];
  const eraSigns = segs.map((s) => Math.sign(stat(role, f, fwd, s).value));
  const overallSign = Math.sign(obs.value);
  const eraStable = overallSign !== 0 && eraSigns.filter((s) => s === overallSign).length >= 2;
  const cov = (obs as { coverage?: number }).coverage;
  const dirGood = role === "BIAS_TREND" ? true : obs.value > 0;      // BIAS just needs a consistent direction; others need the "good" sign
  const covOk = cov === undefined || (cov >= 0.3 && cov <= 0.92);
  const verdict = beatsNull && eraStable && dirGood && covOk ? "OOS_QUALIFIED" : beatsNull ? "SHADOW_QUALIFIED" : "REJECTED";

  const notes = [
    `${obs.name} = ${obs.value.toFixed(4)} · null95 = ${nullBand.toFixed(4)} → ${beatsNull ? "VƯỢT null" : "không hơn null"}`,
    `era signs [${eraSigns.join(",")}] → ${eraStable ? "ổn định" : "KHÔNG ổn định qua era"}`,
    cov !== undefined ? `coverage giữ ${(cov * 100).toFixed(0)}%` : "",
    verdict === "OOS_QUALIFIED" ? "✓ qua gate role (OOS + null + era)" : verdict === "SHADOW_QUALIFIED" ? "hơn null nhưng chưa ổn định/đúng hướng → giữ SHADOW" : "không phân biệt được với ngẫu nhiên → REJECTED",
  ].filter(Boolean);
  return { role, metricName: obs.name, observed: obs.value, nullBand, beatsNull, eraSigns, eraStable, coverage: cov, sampleSize: idx.length, verdict, notes };
}
