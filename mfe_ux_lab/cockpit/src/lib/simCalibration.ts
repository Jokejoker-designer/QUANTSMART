// Broker cost/spec calibration is independent of execution-path precision.
// The OHLC/M1 engine does not execute bid/ask ticks, regardless of availability metadata.
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
  hasTickBidAsk?: boolean;          // availability metadata only; never proof of executed tick replay
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

  // This bundle calibrates broker inputs. Neither OHLC facade consumes a tick
  // bid/ask path, so availability metadata cannot certify execution precision.
  const pathExact = false;
  if (input.hasTickBidAsk) notes.push("Tick availability was reported, but this simulator did not execute a bid/ask tick path. Path remains approximate.");
  else notes.push("No executed bid/ask tick path. OHLC/M1 ordering remains approximate.");
  const timezoneVerified = input.brokerTimeOffsetHours != null;

  const anyCost = spreadCalibrated || commissionCalibrated || swapCalibrated || specCalibrated;
  const level: CalibrationLevel = anyCost ? "PARTIALLY_CALIBRATED" : "FULLY_PROVISIONAL";

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
  return { level, specCalibrated, spreadCalibrated, commissionCalibrated, swapCalibrated, pathExact: false, timezoneVerified: false, source: "none", notes: [anyCost ? "No new broker input; saved configuration has partial cost calibration. Execution-path precision is reported separately." : "No broker feed — costs are provisional. Execution-path precision is reported separately."] };
}
