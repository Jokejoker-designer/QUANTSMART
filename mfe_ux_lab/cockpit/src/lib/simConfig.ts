// simConfig — single source of truth for the REALISTIC market simulator (P0).
// All cost numbers are PROVISIONAL until calibrated against broker tick/spec data.
// Modeled / advisory / research-only. No order path. No profit promise.

export type Timeframe = "M1" | "M5" | "M15" | "H1" | "H4" | "D1";
export type SizingMode = "FIXED_R" | "PERCENT_EQUITY";
export type SimulatorMode = "LEGACY_SIM" | "REALISTIC_SIM";
export type CostScenario = "LOW_COST" | "BASE_COST" | "STRESS_COST";

export interface SimulatorCostConfig {
  spread: {
    overlap: number;
    single: number;
    asia: number;
    rollover: number;
    newsMult: number;
    status: "PROVISIONAL" | "CALIBRATED" | "NOT_AVAILABLE";
  };
  commissionRT_per_lot_usd: number;
  slippage: {
    baseTicks: number;
    atrK: number;
    slPenaltyTicks: number;
    seed: number;
    status: "PROVISIONAL" | "CALIBRATED" | "NOT_AVAILABLE";
  };
  swap: {                                  // P2: overnight financing (gold ~negative both sides, ×3 Wed)
    longUsdPerLotNight: number;
    shortUsdPerLotNight: number;
    wedX3: boolean;
    status: "PROVISIONAL" | "CALIBRATED" | "NOT_AVAILABLE";
  };
}

export interface SimulatorRiskConfig {
  sizingMode: SizingMode;
  fixedRValue: number;
  initialEquity: number;
  riskPctEquity: number;
  maxDemoLot?: number;
}

export interface SimulatorDisciplineConfig {
  cooldownBars: Record<Timeframe, number>;
  maxTradesPerDay: Record<Timeframe, number>;
  onePositionAtATime: boolean;
}

export interface SimulatorRealismConfig {
  simulatorMode: SimulatorMode;
  designTf: Timeframe;
  executionTf: Timeframe;
  entryOnNextOpen: true;
  cost: SimulatorCostConfig;
  risk: SimulatorRiskConfig;
  discipline: SimulatorDisciplineConfig;
  seed: number;
  version: string;
  minStopAtrK?: number;   // HARD mode: floor every stop at k×ATR (a broker won't honor a sub-floor stop) → kills the
                          // "$1 structure-stop → +37R" artifact. undefined/0 = no floor (NORMAL). Affects GROSS R too.
}

export const SIM_VERSION = "realistic-sim-p0";

export const DEFAULT_REALISTIC_SIM_CONFIG: SimulatorRealismConfig = {
  simulatorMode: "REALISTIC_SIM",
  designTf: "H1",
  executionTf: "H1",
  entryOnNextOpen: true,
  seed: 42,
  version: SIM_VERSION,
  cost: {
    spread: { overlap: 0.15, single: 0.20, asia: 0.30, rollover: 0.90, newsMult: 5, status: "PROVISIONAL" },
    commissionRT_per_lot_usd: 7,
    slippage: { baseTicks: 1, atrK: 0.05, slPenaltyTicks: 2, seed: 42, status: "PROVISIONAL" },
    swap: { longUsdPerLotNight: -7, shortUsdPerLotNight: -4, wedX3: true, status: "PROVISIONAL" },
  },
  risk: {
    sizingMode: "PERCENT_EQUITY",
    fixedRValue: 1,
    initialEquity: 10000,
    riskPctEquity: 0.75,
  },
  discipline: {
    cooldownBars: { M1: 20, M5: 3, M15: 2, H1: 1, H4: 0, D1: 0 },
    maxTradesPerDay: { M1: 8, M5: 8, M15: 6, H1: 5, H4: 3, D1: 1 },
    onePositionAtATime: true,
  },
};

// Cost-scenario multipliers applied to spread + slippage (commission held fixed).
export const COST_SCENARIO_MULT: Record<CostScenario, number> = {
  LOW_COST: 0.5,
  BASE_COST: 1.0,
  STRESS_COST: 2.0,
};

// deep clone so callers can mutate a per-run config without touching the default
export function cloneSimConfig(cfg: SimulatorRealismConfig = DEFAULT_REALISTIC_SIM_CONFIG): SimulatorRealismConfig {
  return JSON.parse(JSON.stringify(cfg));
}

// HARD mode — a deliberately HARSH broker (expose curve-fit / tight-stop cards). Cranks spread / slippage (esp.
// stop-loss slippage) / commission / swap, and FLOORS the stop at 0.6·ATR. GROSS R is recomputed against the
// floored stop (no more $1-stop +37R) and NET drops further from the harsher costs. Modeled · still not live-ready.
export function makeHardConfig(base: SimulatorRealismConfig = DEFAULT_REALISTIC_SIM_CONFIG): SimulatorRealismConfig {
  const c = cloneSimConfig(base);
  c.cost.spread = { ...c.cost.spread, overlap: +(c.cost.spread.overlap * 2.5).toFixed(3), single: +(c.cost.spread.single * 2.5).toFixed(3), asia: +(c.cost.spread.asia * 2.5).toFixed(3), rollover: +(c.cost.spread.rollover * 2.5).toFixed(3), newsMult: c.cost.spread.newsMult * 2 };
  c.cost.commissionRT_per_lot_usd = +(c.cost.commissionRT_per_lot_usd * 1.5).toFixed(2);
  c.cost.slippage = { ...c.cost.slippage, baseTicks: c.cost.slippage.baseTicks * 3, atrK: +(c.cost.slippage.atrK * 2).toFixed(3), slPenaltyTicks: c.cost.slippage.slPenaltyTicks * 3 };
  c.cost.swap = { ...c.cost.swap, longUsdPerLotNight: +(c.cost.swap.longUsdPerLotNight * 1.5).toFixed(2), shortUsdPerLotNight: +(c.cost.swap.shortUsdPerLotNight * 1.5).toFixed(2) };
  c.minStopAtrK = 0.6;
  c.version = base.version + "-HARD";
  return c;
}

// deterministic FNV-1a hash of any config (for the run manifest)
export function configHash(obj: unknown): string {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}
