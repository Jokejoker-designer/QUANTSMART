// realisticSimRun — one-call facade the UI uses: data-reality → truth → sim → analytics → manifest.
// Keeps Microscope/StrategyLab thin and guarantees every run carries its truth contract.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { DEFAULT_REALISTIC_SIM_CONFIG, cloneSimConfig, makeHardConfig, type SimulatorRealismConfig, type SizingMode, type Timeframe } from "./simConfig.ts";
import { getCardRuntimeConfig, TF_MINUTES } from "./simTimeframe.ts";
import { getCoefProfile } from "./coefProfileStore.ts";
import type { TriggerCoefOverride } from "./coefficientCalibration.ts";
import { getSymbolSpec } from "./symbolSpec.ts";
import { analyzeDataReality } from "./simDataReality.ts";
import { buildTruthContract } from "./simTruthContract.ts";
import { runRealisticSim, groupExecByDesign, type RealisticSimResult } from "./realisticStrategySim.ts";
import { analyzeRealistic, type RealisticAnalytics } from "./realisticSimAnalytics.ts";
import { buildRunManifest, type SimRunManifest } from "./simManifest.ts";
import { resampleM1, completeBarsOnly, type ResampleTf } from "./resampleM1.ts";
import type { AmbiguityPolicy } from "./intrabarM1Resolver.ts";
import { walkForward, type WalkForwardResult } from "./simWalkForward.ts";
import { applyBrokerCalibration, readCalibrationState, type BrokerCalibrationInput, type CalibrationState } from "./simCalibration.ts";
import type { CustomModule } from "./customModule.ts";

export interface RealisticBacktestOptions {
  symbol?: string;
  chartTf?: string;                 // what the user is LOOKING at (display only)
  sizingMode?: SizingMode;
  cfg?: SimulatorRealismConfig;
  priceBasis?: "BID" | "ASK" | "MID" | "UNKNOWN";
  timezoneStatus?: "VERIFIED" | "PROVISIONAL" | "UNKNOWN";
  withWalkForward?: boolean;        // P2: re-run K OOS folds (off by default — heavy)
  walkForwardFolds?: number;
  calibration?: BrokerCalibrationInput;   // P4: lift cost/path truth toward CALIBRATED/EXACT
  capital?: number;                 // Funding mode: user-chosen starting capital ($) → %-equity sizing
  riskPct?: number;                 // risk per trade as % of equity (funding mode)
  customModules?: CustomModule[];   // user-authored modules (full library; filtered to the card's refs)
  hard?: boolean;                   // HARD mode — harsh broker (×cost spread/slippage/swap + min-stop floor)
  coef?: TriggerCoefOverride;      // trigger coefficient override (self-calib/user). ABSENT → global user profile → else DEFAULT (historical).
}
export interface ResampleQuality { targetTf: string; completeBars: number; incompleteBars: number; gapBars: number; warnings: string[] }
export interface RealisticBacktest {
  sim: RealisticSimResult;
  analytics: RealisticAnalytics;
  manifest: SimRunManifest;
  designTf: Timeframe;
  chartTf: string;
  tfBindingNote: string;
  m1Master?: boolean;                  // P1: exits resolved by M1 intrabar path
  ambiguityPolicy?: AmbiguityPolicy;
  resampleQuality?: ResampleQuality;
  walkForward?: WalkForwardResult;     // P2: OOS persistence (only when withWalkForward)
  calibration?: CalibrationState;      // P4: cost/path calibration level
  pathExact?: boolean;
  designBars?: OhlcBar[];              // the design_tf bars the sim actually ran on (M1 path: resampled from M1) — so the chart renders the SAME bars the markers index into
  intrabar?: { executionTf: Timeframe; entries: number };   // P2: intrabar entry active → exec_tf + how many entries were intrabar
}

// card: { id, modules[], archetype, design_tf? }
export function runRealisticBacktest(designBars: OhlcBar[], card: any, opts: RealisticBacktestOptions = {}): RealisticBacktest {
  const symbol = opts.symbol || "XAUUSD";
  let cfgBase = opts.cfg ? cloneSimConfig(opts.cfg) : cloneSimConfig(DEFAULT_REALISTIC_SIM_CONFIG);
  if (opts.hard) cfgBase = makeHardConfig(cfgBase);                  // HARD: crank cost + floor the stop (kills $1-stop +37R)
  const rc = getCardRuntimeConfig(card);
  const designTf = rc.design_tf;
  cfgBase.designTf = designTf; cfgBase.executionTf = designTf;       // P0: execution == design
  if (opts.sizingMode) cfgBase.risk.sizingMode = opts.sizingMode;
  if (opts.capital != null && opts.capital > 0) { cfgBase.risk.initialEquity = opts.capital; cfgBase.risk.sizingMode = "PERCENT_EQUITY"; }
  if (opts.riskPct != null && opts.riskPct > 0) cfgBase.risk.riskPctEquity = opts.riskPct;

  let spec = getSymbolSpec(symbol); let pathExact = false; let calState: CalibrationState;
  if (opts.calibration) { const b = applyBrokerCalibration(cfgBase, spec, opts.calibration); cfgBase.cost = b.cfg.cost; spec = b.spec; calState = b.state; pathExact = b.pathExact; }
  else calState = readCalibrationState(cfgBase, spec);
  const dataReality = analyzeDataReality(designBars, {
    symbol, timeframe: designTf,
    priceBasis: opts.priceBasis ?? "UNKNOWN",
    timezoneStatus: opts.timezoneStatus ?? "PROVISIONAL",
    spreadAvailable: false, volumeKind: "MISSING",
  });
  const truth = buildTruthContract({
    dataTruth: dataReality.dataTruth,
    priceBasis: dataReality.priceBasis,
    timezoneStatus: dataReality.timezoneStatus,
    costStatus: cfgBase.cost.spread.status,
    pathTruth: pathExact ? "TICK_PATH_EXACT" : "HTF_HEURISTIC",   // P0 resolves on design-TF OHLC unless tick-calibrated
    executionTruth: "MODELED_NEXT_OPEN",
    brokerTimeOffset: "+03:00 (broker GMT+3 rollover)",
  });

  const autoRR = !!(card && Array.isArray(card.modules) && card.modules.includes("auto_rr"));
  const cmods = (opts.customModules || []).filter((m) => Array.isArray(card?.modules) && card.modules.includes(m.id));
  const coef = opts.coef ?? getCoefProfile();
  const sim = runRealisticSim(designBars, Array.isArray(card?.modules) ? card.modules : [], autoRR, {
    cfg: cfgBase, spec, designTf, cardId: card?.id || "card", symbol, customModules: cmods, coef,
  });
  const analytics = analyzeRealistic(sim, cfgBase.risk.initialEquity);
  const manifest = buildRunManifest({ cfg: cfgBase, symbol, designTf, dataReality, truth, spec });

  const chartTf = opts.chartTf || designTf;
  const tfBindingNote = chartTf !== designTf
    ? `Chart TF (${chartTf}) differs from card signal TF (${designTf}). Card decisions are made ONLY on ${designTf}.`
    : `Card signal TF = chart TF = ${designTf}.`;
  const wf = opts.withWalkForward ? walkForward(designBars, Array.isArray(card?.modules) ? card.modules : [], autoRR, { cfg: cfgBase, spec, designTf, cardId: card?.id || "card", symbol, folds: opts.walkForwardFolds, customModules: cmods, coef }) : undefined;

  return { sim, analytics, manifest, designTf, chartTf, tfBindingNote, walkForward: wf, calibration: calState, pathExact, designBars };
}

// ── P1: M1-master backtest. Resample M1 → design_tf (closed bars only), run card signals on
// design_tf, resolve SL/TP order on the underlying M1 path. M1 path is APPROX, not tick-exact. ──
export interface RealisticBacktestM1Options extends RealisticBacktestOptions { ambiguityPolicy?: AmbiguityPolicy }
export function runRealisticBacktestM1(m1Bars: OhlcBar[], card: any, opts: RealisticBacktestM1Options = {}): RealisticBacktest {
  const symbol = opts.symbol || "XAUUSD";
  let cfgBase = opts.cfg ? cloneSimConfig(opts.cfg) : cloneSimConfig(DEFAULT_REALISTIC_SIM_CONFIG);
  if (opts.hard) cfgBase = makeHardConfig(cfgBase);                  // HARD parity with the design-bars facade (×cost + min-stop floor)
  const rc = getCardRuntimeConfig(card);
  const designTf = rc.design_tf;
  cfgBase.designTf = designTf; cfgBase.executionTf = designTf;
  if (opts.sizingMode) cfgBase.risk.sizingMode = opts.sizingMode;
  if (opts.capital != null && opts.capital > 0) { cfgBase.risk.initialEquity = opts.capital; cfgBase.risk.sizingMode = "PERCENT_EQUITY"; }
  if (opts.riskPct != null && opts.riskPct > 0) cfgBase.risk.riskPctEquity = opts.riskPct;
  const ambiguityPolicy: AmbiguityPolicy = opts.ambiguityPolicy ?? "MARK_AMBIGUOUS";

  // resample M1 → design_tf (closed bars only); design M1 = each bar is its own child
  let designBars: OhlcBar[]; let m1ByDesign: OhlcBar[][]; let resampleQuality: ResampleQuality;
  if (designTf === "M1") {
    designBars = m1Bars; m1ByDesign = m1Bars.map((b) => [b]);
    resampleQuality = { targetTf: "M1", completeBars: m1Bars.length, incompleteBars: 0, gapBars: 0, warnings: [] };
  } else {
    const r = resampleM1(m1Bars, designTf as ResampleTf);
    const co = completeBarsOnly(r);
    designBars = co.bars; m1ByDesign = co.m1ByBar;
    resampleQuality = { targetTf: designTf, completeBars: r.completeBars, incompleteBars: r.incompleteBars, gapBars: r.gapBars, warnings: r.warnings };
  }

  // ── P1 INTRABAR ENTRY: when the card's execution_tf is finer than design_tf, resample M1 → exec_tf and group by
  // design bar → the engine enters EARLY inside the forming design bar (causal). Only finer-than-design + resamplable.
  const execTf = rc.allowed_execution_tf;
  let execByDesign: OhlcBar[][] | undefined;
  const RESAMPLE_TFS = ["M5", "M15", "H1", "H4", "D1"];
  if (execTf !== designTf && TF_MINUTES[execTf] < TF_MINUTES[designTf]) {
    const execBars = execTf === "M1" ? m1Bars : (RESAMPLE_TFS.includes(execTf) ? completeBarsOnly(resampleM1(m1Bars, execTf as ResampleTf)).bars : null);
    if (execBars) { execByDesign = groupExecByDesign(designBars, execBars, designTf); cfgBase.executionTf = execTf; }   // executionTf label flips ONLY when intrabar is actually wired (no lying)
  }

  let spec = getSymbolSpec(symbol); let pathExact = false; let calState: CalibrationState;
  if (opts.calibration) { const b = applyBrokerCalibration(cfgBase, spec, opts.calibration); cfgBase.cost = b.cfg.cost; spec = b.spec; calState = b.state; pathExact = b.pathExact; }
  else calState = readCalibrationState(cfgBase, spec);
  const dataReality = analyzeDataReality(designBars, { symbol, timeframe: designTf, priceBasis: opts.priceBasis ?? "UNKNOWN", timezoneStatus: opts.timezoneStatus ?? "PROVISIONAL", spreadAvailable: false, volumeKind: "MISSING" });
  const truth = buildTruthContract({
    dataTruth: "M1_UNKNOWN_PRICE_BASIS", priceBasis: dataReality.priceBasis, timezoneStatus: dataReality.timezoneStatus,
    costStatus: cfgBase.cost.spread.status, pathTruth: pathExact ? "TICK_PATH_EXACT" : "M1_PATH_APPROX", executionTruth: "MODELED_NEXT_OPEN", brokerTimeOffset: "+03:00 (broker GMT+3 rollover)",
  });

  const autoRR = !!(card && Array.isArray(card.modules) && card.modules.includes("auto_rr"));
  const cmods = (opts.customModules || []).filter((m) => Array.isArray(card?.modules) && card.modules.includes(m.id));
  const coef = opts.coef ?? getCoefProfile();
  const sim = runRealisticSim(designBars, Array.isArray(card?.modules) ? card.modules : [], autoRR, {
    cfg: cfgBase, spec, designTf, cardId: card?.id || "card", symbol, m1ByDesign, execByDesign, ambiguityPolicy, customModules: cmods, coef,
  });
  const analytics = analyzeRealistic(sim, cfgBase.risk.initialEquity);
  const manifest = buildRunManifest({ cfg: cfgBase, symbol, designTf, dataReality, truth, spec });
  const chartTf = opts.chartTf || designTf;
  const tfBindingNote = `Signal TF: ${designTf} · Chart TF: ${chartTf} · Execution path: M1 under ${designTf} signal`;
  const wf = opts.withWalkForward ? walkForward(designBars, Array.isArray(card?.modules) ? card.modules : [], autoRR, { cfg: cfgBase, spec, designTf, cardId: card?.id || "card", symbol, folds: opts.walkForwardFolds, m1ByDesign, execByDesign, customModules: cmods, coef }) : undefined;
  const intrabar = execByDesign ? { executionTf: execTf, entries: sim.trades.filter((t) => (t.why || []).some((w) => /intrabar/i.test(w))).length } : undefined;

  return { sim, analytics, manifest, designTf, chartTf, tfBindingNote, m1Master: true, ambiguityPolicy, resampleQuality, walkForward: wf, calibration: calState, pathExact, designBars, intrabar };
}
