// simWalkForward — split the tape into sequential out-of-sample folds and check the edge PERSISTS (P2).
// These cards have no fitted params, so walk-forward = does the NET edge hold across consecutive
// time windows, or only in one lucky stretch? Each fold runs the realistic engine independently.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { SimulatorRealismConfig, Timeframe } from "./simConfig.ts";
import type { SymbolSpec } from "./symbolSpec.ts";
import { runRealisticSim } from "./realisticStrategySim.ts";
import { analyzeRealistic } from "./realisticSimAnalytics.ts";

export interface WalkForwardFold { index: number; start: string; end: string; n: number; netPF: number; netR: number; positive: boolean }
export interface WalkForwardResult {
  folds: WalkForwardFold[];
  evaluatedFolds: number;
  positiveFraction: number;
  medianNetPF: number;
  verdict: "OOS_STABLE" | "OOS_MIXED" | "OOS_FRAGILE" | "OOS_INSUFFICIENT";
}

export interface WalkForwardOptions {
  cfg: SimulatorRealismConfig; spec: SymbolSpec; designTf: Timeframe; cardId: string; symbol: string;
  folds?: number; m1ByDesign?: OhlcBar[][]; minTradesPerFold?: number; customModules?: import("./customModule.ts").CustomModule[];
  execByDesign?: OhlcBar[][];   // P1: execution_tf children per design bar → intrabar ENTRY (sliced per fold below)
  coef?: import("./coefficientCalibration.ts").TriggerCoefOverride;   // trigger coefficient override (same coef across folds)
}

export function walkForward(designBars: OhlcBar[], modules: string[], autoRR: boolean, opts: WalkForwardOptions): WalkForwardResult {
  const K = opts.folds ?? 5; const minN = opts.minTradesPerFold ?? 5;
  const len = designBars.length; const size = Math.floor(len / K);
  const folds: WalkForwardFold[] = [];
  if (size < 60) return { folds, evaluatedFolds: 0, positiveFraction: 0, medianNetPF: 0, verdict: "OOS_INSUFFICIENT" };

  for (let k = 0; k < K; k++) {
    const a = k * size, b = k === K - 1 ? len : (k + 1) * size;
    const seg = designBars.slice(a, b);
    const m1seg = opts.m1ByDesign ? opts.m1ByDesign.slice(a, b) : undefined;
    const execSeg = opts.execByDesign ? opts.execByDesign.slice(a, b) : undefined;   // align exec children to this fold's design bars
    const sim = runRealisticSim(seg, modules, autoRR, { cfg: opts.cfg, spec: opts.spec, designTf: opts.designTf, cardId: opts.cardId, symbol: opts.symbol, m1ByDesign: m1seg, execByDesign: execSeg, customModules: opts.customModules, coef: opts.coef });
    const an = analyzeRealistic(sim, opts.cfg.risk.initialEquity);
    folds.push({ index: k, start: seg[0]?.t || "", end: seg[seg.length - 1]?.t || "", n: an.n, netPF: an.netPF, netR: an.netNetR, positive: an.netPF > 1 && an.netNetR > 0 });
  }
  const valid = folds.filter((f) => f.n >= minN);
  const positiveFraction = valid.length ? +(valid.filter((f) => f.positive).length / valid.length).toFixed(3) : 0;
  const pfs = valid.map((f) => Math.min(f.netPF, 10)).sort((x, y) => x - y);
  const medianNetPF = pfs.length ? +pfs[Math.floor(pfs.length / 2)].toFixed(3) : 0;
  const verdict: WalkForwardResult["verdict"] = valid.length < 3 ? "OOS_INSUFFICIENT"
    : positiveFraction >= 0.8 ? "OOS_STABLE" : positiveFraction >= 0.5 ? "OOS_MIXED" : "OOS_FRAGILE";
  return { folds, evaluatedFolds: valid.length, positiveFraction, medianNetPF, verdict };
}
