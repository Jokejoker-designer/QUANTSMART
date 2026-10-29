// simMonteCarlo — bootstrap the trade sequence to get a DISTRIBUTION of net R and max drawdown (P2).
// One backtest is one lucky/unlucky ordering; the distribution answers "how bad is the 1-in-20 DD".
// Pure post-process on per-trade net R — no re-run. Seeded.
import { makeRng } from "./simCostModel.ts";

export interface MonteCarloResult {
  runs: number;
  finalR: { p5: number; p50: number; p95: number; mean: number };
  maxDD: { median: number; p05Worst: number; worst: number };   // DD values are ≤ 0
  probNegative: number;          // P(final net R < 0)
  probDDworseThanObserved: number;
  observedFinalR: number;
  observedMaxDD: number;
  riskOfRuinR: number;           // ruin threshold used
  probRuin: number;              // P(running equity ≤ -riskOfRuinR at any point)
}

function ddOf(seq: number[]): number { let peak = 0, cum = 0, dd = 0; for (const r of seq) { cum += r; if (cum > peak) peak = cum; if (cum - peak < dd) dd = cum - peak; } return dd; }
function minCum(seq: number[]): number { let cum = 0, m = 0; for (const r of seq) { cum += r; if (cum < m) m = cum; } return m; }
function quantile(sorted: number[], p: number): number { if (!sorted.length) return 0; return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))]; }

export function monteCarlo(netRs: number[], opts: { runs?: number; seed?: number; ruinR?: number } = {}): MonteCarloResult | null {
  const n = netRs.length; if (n < 10) return null;
  const runs = opts.runs ?? 1000; const rng = makeRng(opts.seed ?? 42);
  const ruinR = opts.ruinR ?? Math.max(10, Math.abs(ddOf(netRs)) * 1.5);
  const observedFinalR = +netRs.reduce((a, b) => a + b, 0).toFixed(2);
  const observedMaxDD = +ddOf(netRs).toFixed(2);

  const finals: number[] = [], dds: number[] = []; let neg = 0, ddWorse = 0, ruin = 0;
  for (let k = 0; k < runs; k++) {
    const seq: number[] = new Array(n); let sum = 0;
    for (let i = 0; i < n; i++) { const r = netRs[(rng() * n) | 0]; seq[i] = r; sum += r; }   // bootstrap w/ replacement
    finals.push(sum); const dd = ddOf(seq); dds.push(dd);
    if (sum < 0) neg++;
    if (dd < observedMaxDD) ddWorse++;
    if (minCum(seq) <= -ruinR) ruin++;
  }
  finals.sort((a, b) => a - b); dds.sort((a, b) => a - b);  // dds ascending: most negative first
  return {
    runs,
    finalR: { p5: +quantile(finals, 0.05).toFixed(2), p50: +quantile(finals, 0.5).toFixed(2), p95: +quantile(finals, 0.95).toFixed(2), mean: +(finals.reduce((a, b) => a + b, 0) / runs).toFixed(2) },
    maxDD: { median: +quantile(dds, 0.5).toFixed(2), p05Worst: +quantile(dds, 0.05).toFixed(2), worst: +dds[0].toFixed(2) },
    probNegative: +(neg / runs).toFixed(3),
    probDDworseThanObserved: +(ddWorse / runs).toFixed(3),
    observedFinalR, observedMaxDD,
    riskOfRuinR: +ruinR.toFixed(1), probRuin: +(ruin / runs).toFixed(3),
  };
}
