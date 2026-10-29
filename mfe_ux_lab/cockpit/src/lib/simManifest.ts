// simManifest — provenance for every realistic run (P0 + P-1 truth foundation).
// Includes the truth contract, data-reality report and symbol spec so no result can pretend
// to be more true than it is. Config-hashed for reproducibility.
import type { SimulatorCostConfig, SimulatorRiskConfig, SimulatorDisciplineConfig, SimulatorRealismConfig, Timeframe } from "./simConfig.ts";
import { configHash, SIM_VERSION } from "./simConfig.ts";
import type { DataRealityReport } from "./simDataReality.ts";
import type { SimulatorTruthContract } from "./simTruthContract.ts";
import type { SymbolSpec } from "./symbolSpec.ts";

export interface SimRunManifest {
  run_id: string;
  created_at: string;
  simulator_version: string;
  simulator_mode: "LEGACY_SIM" | "REALISTIC_SIM";
  symbol: string;
  design_tf: Timeframe;
  data_range: { start: string; end: string; bars: number };
  data_reality: DataRealityReport;
  truth_contract: SimulatorTruthContract;
  symbol_spec: SymbolSpec;
  cost_model: SimulatorCostConfig;
  risk_model: SimulatorRiskConfig;
  discipline_model: SimulatorDisciplineConfig;
  seed: number;
  config_hash: string;
  warnings: string[];
}

export interface BuildManifestInput {
  cfg: SimulatorRealismConfig;
  symbol: string;
  designTf: Timeframe;
  dataReality: DataRealityReport;
  truth: SimulatorTruthContract;
  spec: SymbolSpec;
}

export function buildRunManifest(inp: BuildManifestInput): SimRunManifest {
  const { cfg, dataReality, truth, spec } = inp;
  const warnings = Array.from(new Set([...(dataReality.warnings || []), ...(truth.warnings || [])]));
  const hashSource = { cost: cfg.cost, risk: cfg.risk, discipline: cfg.discipline, seed: cfg.seed, designTf: inp.designTf, version: cfg.version };
  return {
    run_id: `run_${Date.now()}_${configHash(hashSource)}`,
    created_at: new Date().toISOString(),
    simulator_version: cfg.version || SIM_VERSION,
    simulator_mode: cfg.simulatorMode,
    symbol: inp.symbol,
    design_tf: inp.designTf,
    data_range: { start: dataReality.start, end: dataReality.end, bars: dataReality.bars },
    data_reality: dataReality,
    truth_contract: truth,
    symbol_spec: spec,
    cost_model: cfg.cost,
    risk_model: cfg.risk,
    discipline_model: cfg.discipline,
    seed: cfg.seed,
    config_hash: configHash(hashSource),
    warnings,
  };
}
