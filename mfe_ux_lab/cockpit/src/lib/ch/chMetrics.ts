// CH-WO-0 — the LOCKED metric formulas. Locking them now stops a future "metric giả để pass". Each is pure
// + unit-tested on synthetic. Thresholds are the binding gates from the WO plan / HARD STOPS.
//   EraStability = 1 − JSD(P,Q) ≥ 0.70   (cluster-distribution histograms across two eras)
//   Cross-era Generalization = ARI ≥ 0.80 (held-out re-clustering vs train assignment)
//   Intra-cluster variance + Entropy      (degenerate single-cluster detector)
//   Outcome-Correlation                   (claimable ONLY: OOS, ≥2 eras, BH-FDR, non-circular source)
// See price-era-shift-guard, c3d0-labels-outcome-circular-ingestion-blocked.

export const ERA_STABILITY_MIN = 0.70;
export const CROSS_ERA_MIN = 0.80;

const comb2 = (x: number) => (x * (x - 1)) / 2;

// ── EraStability = 1 − JSD (Jensen-Shannon divergence, log2 → bounded [0,1]) ──
function normalize(h: number[]): number[] { const s = h.reduce((a, b) => a + Math.max(0, b), 0); return s > 0 ? h.map((x) => Math.max(0, x) / s) : h.map(() => 0); }
function klLog2(p: number[], m: number[]): number { let s = 0; for (let i = 0; i < p.length; i++) { if (p[i] > 0 && m[i] > 0) s += p[i] * Math.log2(p[i] / m[i]); } return s; }
export function jsd(histA: number[], histB: number[]): number {
  const len = Math.max(histA.length, histB.length);
  const P = normalize(Array.from({ length: len }, (_, i) => histA[i] ?? 0));
  const Q = normalize(Array.from({ length: len }, (_, i) => histB[i] ?? 0));
  const M = P.map((p, i) => (p + Q[i]) / 2);
  const d = 0.5 * klLog2(P, M) + 0.5 * klLog2(Q, M);
  return Math.min(1, Math.max(0, +d.toFixed(6)));   // clamp tiny fp drift into [0,1]
}
export function eraStability(histA: number[], histB: number[]): number { return +(1 - jsd(histA, histB)).toFixed(6); }
export function eraStablePass(histA: number[], histB: number[]): boolean { return eraStability(histA, histB) >= ERA_STABILITY_MIN; }

// ── Cross-era Generalization = Adjusted Rand Index (1 = identical partition, ~0 = chance, <0 = worse) ──
export function adjustedRandIndex(labelsA: (string | number)[], labelsB: (string | number)[]): number {
  const n = labelsA.length;
  if (n < 2 || labelsB.length !== n) return 0;
  const rows = new Map<string, Map<string, number>>(), rowSum = new Map<string, number>(), colSum = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const a = String(labelsA[i]), b = String(labelsB[i]);
    if (!rows.has(a)) rows.set(a, new Map());
    const r = rows.get(a)!; r.set(b, (r.get(b) ?? 0) + 1);
    rowSum.set(a, (rowSum.get(a) ?? 0) + 1); colSum.set(b, (colSum.get(b) ?? 0) + 1);
  }
  let sumComb = 0; rows.forEach((r) => r.forEach((nij) => { sumComb += comb2(nij); }));
  let ai = 0; rowSum.forEach((v) => { ai += comb2(v); });
  let bj = 0; colSum.forEach((v) => { bj += comb2(v); });
  const expected = (ai * bj) / comb2(n), maxIndex = 0.5 * (ai + bj);
  if (maxIndex - expected === 0) return 1;   // both partitions trivial / identical
  return +((sumComb - expected) / (maxIndex - expected)).toFixed(6);
}
export function crossEraPass(labelsA: (string | number)[], labelsB: (string | number)[]): boolean { return adjustedRandIndex(labelsA, labelsB) >= CROSS_ERA_MIN; }

// ── Intra-cluster variance (size-weighted mean within-cluster squared distance to centroid) ──
export function intraClusterVariance(vectors: number[][], labels: (string | number)[]): number {
  const groups = new Map<string, number[]>();
  labels.forEach((l, i) => { const k = String(l); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(i); });
  let totW = 0, acc = 0;
  groups.forEach((idx) => {
    if (!idx.length) return;
    const dim = vectors[idx[0]].length;
    const centroid = new Array(dim).fill(0);
    idx.forEach((i) => vectors[i].forEach((v, d) => { centroid[d] += v / idx.length; }));
    let msd = 0; idx.forEach((i) => { let s = 0; for (let d = 0; d < dim; d++) { const e = vectors[i][d] - centroid[d]; s += e * e; } msd += s / idx.length; });
    acc += msd * idx.length; totW += idx.length;
  });
  return totW ? +(acc / totW).toFixed(6) : 0;
}

// ── Shannon entropy of a cluster-size distribution (bits). Single cluster → 0 (degenerate detector) ──
export function shannonEntropy(counts: number[]): number {
  const p = normalize(counts); let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return +h.toFixed(6);
}
export function normalizedEntropy(counts: number[]): number {
  const k = counts.filter((c) => c > 0).length;
  return k <= 1 ? 0 : +(shannonEntropy(counts) / Math.log2(k)).toFixed(6);   // 1 = perfectly even, 0 = degenerate
}

// ── Benjamini-Hochberg FDR (multiple-comparison correction for the Outcome-Correlation claims) ──
export interface FdrResult { significant: boolean[]; threshold: number; k: number }
export function benjaminiHochberg(pvalues: number[], q = 0.05): FdrResult {
  const m = pvalues.length;
  const order = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let k = 0, threshold = 0;
  for (let rank = 1; rank <= m; rank++) { if (order[rank - 1].p <= (rank / m) * q) { k = rank; threshold = (rank / m) * q; } }
  const significant = new Array(m).fill(false);
  for (let rank = 1; rank <= k; rank++) significant[order[rank - 1].i] = true;
  return { significant, threshold, k };
}

// ── Outcome-Correlation gate (manager §2.3 + risk #1: anti-C3D0). Claim ONLY if all hold ──
export interface OutcomeCorrInput {
  oosSampleN: number; minN: number;
  eras: number;                       // number of distinct eras the effect was measured in
  pvalue: number; allPvalues: number[]; q?: number;   // FDR over the family of tested correlations
  effectSize: number;                 // signed; must be positive (helpful) to claim
  clusterSourceDistinctFromOutcome: boolean;   // FALSE = circular (C3D0) → auto-reject
}
export interface OutcomeCorrVerdict { claim: boolean; reasons: string[] }
export function outcomeCorrelationGate(inp: OutcomeCorrInput): OutcomeCorrVerdict {
  const reasons: string[] = [];
  if (!inp.clusterSourceDistinctFromOutcome) reasons.push("CIRCULAR_C3D0: cluster source = outcome source — rejected");
  if (inp.oosSampleN < inp.minN) reasons.push(`THIN_OOS: n=${inp.oosSampleN} < minN=${inp.minN}`);
  if (inp.eras < 2) reasons.push(`SINGLE_ERA: eras=${inp.eras} < 2`);
  if (inp.effectSize <= 0) reasons.push("NON_POSITIVE_EFFECT");
  const fdr = benjaminiHochberg(inp.allPvalues, inp.q ?? 0.05);
  const idx = inp.allPvalues.indexOf(inp.pvalue);
  const survives = idx >= 0 ? fdr.significant[idx] : inp.pvalue <= fdr.threshold;
  if (!survives) reasons.push(`FDR_FAIL: p=${inp.pvalue} not significant at BH-FDR threshold ${fdr.threshold.toFixed(4)}`);
  return { claim: reasons.length === 0, reasons };
}
