// simCalibration — P4. Lift cost/path TRUTH from PROVISIONAL/APPROX toward CALIBRATED/EXACT when real
// broker spec / tick data is supplied. With NO broker feed everything stays PROVISIONAL (honest).
// The infrastructure is always present; the lift only happens with real numbers — never faked.
import { cloneSimConfig, type SimulatorRealismConfig } from "./simConfig.ts";
import type { SymbolSpec } from "./symbolSpec.ts";

export interface BrokerCalibrationInput {
  source: "MT5_SYMBOL_INFO" | "MANUAL_BROKER_DOC";
  symbol: string;
  digits?: number; point?: number; tickSize?: number; tickValue?: number; contractSize?: number;
  lotStep?: number; minLot?: number; maxLot?: number;
  commissionRTPerLotUsd?: number;
  swapLongUsdPerLotNight?: number; swapShortUsdPerLotNight?: number;
  spread?: { overlap?: number; single?: number; asia?: number; rollover?: number };
  hasTickBidAsk?: boolean;          // real tick bid/ask → exact intrabar fill order
  brokerTimeOffsetHours?: number;   // verified GMT offset
}

export type CalibrationLevel = "FULLY_PROVISIONAL" | "PARTIALLY_CALIBRATED" | "FULLY_CALIBRATED";
export interface CalibrationState {
  level: CalibrationLevel;
  specCalibrated: boolean;
  spreadCalibrated: boolean;
  commissionCalibrated: boolean;
  swapCalibrated: boolean;
  pathExact: boolean;
  timezoneVerified: boolean;
  source: string;
  notes: string[];
}

export interface CalibratedBundle { cfg: SimulatorRealismConfig; spec: SymbolSpec; state: CalibrationState; pathExact: boolean }

export function applyBrokerCalibration(cfg: SimulatorRealismConfig, spec: SymbolSpec, input: BrokerCalibrationInput): CalibratedBundle {
  const c = cloneSimConfig(cfg); const s: SymbolSpec = { ...spec }; const notes: string[] = [];

  if (input.digits != null) s.digits = input.digits;
  if (input.point != null) s.point = input.point;
  if (input.tickSize != null) s.tickSize = input.tickSize;
  if (input.tickValue != null) s.tickValue = input.tickValue;
  if (input.contractSize != null) s.contractSize = input.contractSize;
  if (input.lotStep != null) s.lotStep = input.lotStep;
  if (input.minLot != null) s.minLot = input.minLot;
  if (input.maxLot != null) s.maxLot = input.maxLot;
  const specCalibrated = input.tickValue != null && input.contractSize != null;
  if (specCalibrated) { s.source = "BROKER_SPEC"; notes.push("Symbol spec from " + input.source + " → percent-equity now CALIBRATED."); }
  else notes.push("tickValue/contractSize missing → spec stays provisional.");

  let spreadCalibrated = false;
  if (input.spread) {
    if (input.spread.overlap != null) c.cost.spread.overlap = input.spread.overlap;
    if (input.spread.single != null) c.cost.spread.single = input.spread.single;
    if (input.spread.asia != null) c.cost.spread.asia = input.spread.asia;
    if (input.spread.rollover != null) c.cost.spread.rollover = input.spread.rollover;
    c.cost.spread.status = "CALIBRATED"; spreadCalibrated = true; notes.push("Spread CALIBRATED from broker feed.");
  }
  let commissionCalibrated = false;
  if (input.commissionRTPerLotUsd != null) { c.cost.commissionRT_per_lot_usd = input.commissionRTPerLotUsd; commissionCalibrated = true; notes.push("Commission CALIBRATED."); }
  let swapCalibrated = false;
  if (input.swapLongUsdPerLotNight != null || input.swapShortUsdPerLotNight != null) {
    if (input.swapLongUsdPerLotNight != null) c.cost.swap.longUsdPerLotNight = input.swapLongUsdPerLotNight;
    if (input.swapShortUsdPerLotNight != null) c.cost.swap.shortUsdPerLotNight = input.swapShortUsdPerLotNight;
    c.cost.swap.status = "CALIBRATED"; swapCalibrated = true; notes.push("Swap CALIBRATED.");
  }
  if (specCalibrated) c.cost.slippage.status = "CALIBRATED";

  const pathExact = !!input.hasTickBidAsk;
  if (pathExact) notes.push("Tick bid/ask available → intrabar fill order is EXACT (no ambiguity).");
  else notes.push("No tick bid/ask → M1 path stays APPROX; sub-M1 order remains ambiguous.");
  const timezoneVerified = input.brokerTimeOffsetHours != null;

  const allCost = spreadCalibrated && commissionCalibrated && swapCalibrated && specCalibrated;
  const anyCost = spreadCalibrated || commissionCalibrated || swapCalibrated || specCalibrated;
  const level: CalibrationLevel = allCost && pathExact ? "FULLY_CALIBRATED" : anyCost || pathExact ? "PARTIALLY_CALIBRATED" : "FULLY_PROVISIONAL";

  return { cfg: c, spec: s, pathExact, state: { level, specCalibrated, spreadCalibrated, commissionCalibrated, swapCalibrated, pathExact, timezoneVerified, source: input.source, notes } };
}

// current calibration state of a (cfg, spec) with NO broker input — reads existing statuses
export function readCalibrationState(cfg: SimulatorRealismConfig, spec: SymbolSpec): CalibrationState {
  const specCalibrated = spec.source === "BROKER_SPEC";
  const spreadCalibrated = cfg.cost.spread.status === "CALIBRATED";
  const commissionCalibrated = false;
  const swapCalibrated = cfg.cost.swap.status === "CALIBRATED";
  const anyCost = specCalibrated || spreadCalibrated || swapCalibrated;
  const level: CalibrationLevel = anyCost ? "PARTIALLY_CALIBRATED" : "FULLY_PROVISIONAL";
  return { level, specCalibrated, spreadCalibrated, commissionCalibrated, swapCalibrated, pathExact: false, timezoneVerified: false, source: "none", notes: ["No broker feed — all costs PROVISIONAL, M1 path APPROX."] };
}
