// moduleTfScope — WO-6 PROTOTYPE (HIGH RISK). Per-module multi-timeframe scope: e.g. read EMA on H1
// while the card decides on M15. The ONLY hard problem is LOOKAHEAD: a higher-TF value fed into a
// lower-TF decision must use the higher bar that has ALREADY CLOSED as-of the decision time — never the
// still-forming bar that contains the decision (that bar's close is in the FUTURE relative to the decision).
//
// ⚠ THIS IS A PROTOTYPE — it is NOT wired into realisticStrategySim. Production merge is GATED on
// contract 02 §3: (1) closed-as-of-t only [this file], (2) leakage test [moduleTfScope.test.ts],
// (3) default INHERIT + explicit-tf flagged [here], (4) ablation must beat single-TF on walk-forward OOS
// [only checkable once wired — deferred]. Default tf = INHERIT (card design_tf); higher-tf is opt-in.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { TF_MINUTES, parseBarTime } from "./simTimeframe.ts";
import type { Timeframe } from "./simConfig.ts";
import { resampleM1, completeBarsOnly, type ResampleTf } from "./resampleM1.ts";

// metadata on a MODULE (not a draggable module itself, per contract 02). Default INHERIT.
export interface ModuleTfScope { module_id: string; tf: Timeframe | "INHERIT" }

export function resolveModuleTf(scope: ModuleTfScope, designTf: Timeframe): Timeframe {
  return scope.tf === "INHERIT" ? designTf : scope.tf;
}
// a per-module TF must be ≥ design_tf (reading a LOWER tf = sub-bar, a different & disallowed problem here).
export function isValidScope(scope: ModuleTfScope, designTf: Timeframe): boolean {
  return scope.tf === "INHERIT" || TF_MINUTES[scope.tf] >= TF_MINUTES[designTf];
}

const openMin = (b: OhlcBar): number => { const p = parseBarTime(b.t); return p.ok ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 60000 : NaN; };

// ── THE causal primitive ──
// For each design bar i, the index into `higherBars` of the LAST higher bar that has CLOSED by the time
// design bar i closes (its decision time). Higher bar j is closed-as-of i iff openMin(j)+Hm ≤ openMin(i)+Dm.
// Two-pointer, monotonic → O(n+m), and purely causal (depends only on higher bars with close ≤ decision).
export function asOfHigherTf(designBars: OhlcBar[], higherBars: OhlcBar[], designTf: Timeframe, higherTf: Timeframe): number[] {
  const Dm = TF_MINUTES[designTf], Hm = TF_MINUTES[higherTf];
  const hOpen = higherBars.map(openMin);
  const out: number[] = new Array(designBars.length).fill(-1);
  let j = -1;
  for (let i = 0; i < designBars.length; i++) {
    const decision = openMin(designBars[i]) + Dm;               // design bar i's CLOSE = decision time
    while (j + 1 < higherBars.length && hOpen[j + 1] + Hm <= decision) j++;   // advance past every CLOSED higher bar
    out[i] = j;
  }
  return out;
}

// the higher-TF bar that CONTAINS design bar i's open (the still-FORMING bar at decision time). Using THIS
// bar's close would LEAK the future — exposed only so the leakage test can prove asOfHigherTf avoids it.
export function containingHigherTf(designBars: OhlcBar[], higherBars: OhlcBar[], higherTf: Timeframe): number[] {
  const Hm = TF_MINUTES[higherTf];
  const hOpen = higherBars.map(openMin);
  const out: number[] = new Array(designBars.length).fill(-1);
  let j = 0;
  for (let i = 0; i < designBars.length; i++) {
    const d = openMin(designBars[i]);
    while (j + 1 < higherBars.length && hOpen[j + 1] <= d) j++;   // last higher bar whose open ≤ design open
    out[i] = hOpen[j] <= d && d < hOpen[j] + Hm ? j : -1;
  }
  return out;
}

// map a causal higher-TF series (one value per higher bar) onto the design bars via the as-of map.
export function higherTfValueAsOf(higherVals: number[], asOf: number[]): number[] {
  return asOf.map((j) => (j >= 0 ? higherVals[j] : NaN));
}

// causal EMA on closes (value at i uses only closes ≤ i) — sample higher-TF feature for the prototype.
export function emaCausal(closes: number[], period: number): number[] {
  const k = 2 / (period + 1); const out: number[] = []; let e = closes[0] ?? 0;
  for (let i = 0; i < closes.length; i++) { e = i === 0 ? (closes[0] ?? 0) : closes[i] * k + e * (1 - k); out.push(+e.toFixed(5)); }
  return out;
}

// Build the prototype context from the M1 master (REUSES resampleM1 — no duplicate resample, contract 02 §1).
export interface TfScopeContext {
  designTf: Timeframe; higherTf: Timeframe;
  designBars: OhlcBar[]; higherBars: OhlcBar[];
  asOf: number[];                 // per design bar → last closed higher bar index
  higherEma: number[];            // per design bar → higher-TF EMA as-of (causal, NaN before warmup)
}
export function buildTfScopeContext(m1Bars: OhlcBar[], designTf: Timeframe, higherTf: Timeframe, emaPeriod = 20): TfScopeContext {
  const designBars = designTf === "M1" ? m1Bars : completeBarsOnly(resampleM1(m1Bars, designTf as ResampleTf)).bars;
  const higherBars = higherTf === "M1" ? m1Bars : completeBarsOnly(resampleM1(m1Bars, higherTf as ResampleTf)).bars;
  const asOf = asOfHigherTf(designBars, higherBars, designTf, higherTf);
  const hEma = emaCausal(higherBars.map((b) => b.c), emaPeriod);
  return { designTf, higherTf, designBars, higherBars, asOf, higherEma: higherTfValueAsOf(hEma, asOf) };
}
