// cardOperatingContext — WO-3. The Operating Context BINDS a card template to a concrete run. It is a
// WRAPPER, never an L0→L6 logic lane (contract 01/02): symbol · design_tf (declared, else inferred) ·
// path_tf · period · session_scope · capital/riskPct · cost model · truth contract · simulator version.
// Guard #4: it is VERSIONED via context_hash over those fields, so the Album never mixes evidence
// collected in different environments (H1 London ≠ M15 Asia). Read-only · derives from the run manifest.
import { configHash, SIM_VERSION, type Timeframe } from "./simConfig.ts";
import { inferDesignTf, isTimeframe } from "./simTimeframe.ts";
import type { SimRunManifest } from "./simManifest.ts";

export type DesignTfSource = "declared" | "inferred";

export interface CardOperatingContext {
  symbol: string;
  design_tf: Timeframe;
  design_tf_source: DesignTfSource;   // declared on the card, or inferred from archetype/modules
  path_tf: "M1" | "DESIGN_TF";        // intrabar resolution stream
  period: string;                     // run window label (All / 2020 / 2020-03)
  session_scope: string;              // "ALL" until session filtering exists
  capital?: number;
  riskPct?: number;
  cost_model_key: string;             // hash of the cost model (so cost changes change the context)
  truth_contract: { costTruth: string; pathTruth: string };
  simulator_version: string;
}

// design_tf resolution — DECLARED on the card wins; else inferred (contract 02 §1).
export function designTfOf(card: { design_tf?: string } & Record<string, unknown>): { tf: Timeframe; source: DesignTfSource } {
  if (card && typeof card.design_tf === "string" && isTimeframe(card.design_tf)) return { tf: card.design_tf, source: "declared" };
  return { tf: inferDesignTf(card), source: "inferred" };
}

export interface BuildOperatingContextInput {
  card: { id?: string; design_tf?: string; archetype?: string; modules?: string[] };
  manifest?: SimRunManifest | null;
  period?: string;
  sessionScope?: string;
  capital?: number;
  riskPct?: number;
  pathM1?: boolean;                   // true when resolved on the M1 master path (runRealisticBacktestM1)
}

export function buildOperatingContext(inp: BuildOperatingContextInput): CardOperatingContext {
  const { tf, source } = designTfOf((inp.card || {}) as { design_tf?: string } & Record<string, unknown>);
  const mf = inp.manifest || null;
  return {
    symbol: mf?.symbol || "XAUUSD",
    design_tf: tf,
    design_tf_source: source,
    path_tf: inp.pathM1 ? "M1" : "DESIGN_TF",
    period: inp.period || "All",
    session_scope: inp.sessionScope || "ALL",
    capital: inp.capital ?? mf?.risk_model.initialEquity,
    riskPct: inp.riskPct ?? mf?.risk_model.riskPctEquity,
    cost_model_key: mf?.cost_model ? configHash(mf.cost_model) : "no-cost-model",
    truth_contract: { costTruth: mf?.truth_contract.costTruth ?? "UNKNOWN", pathTruth: mf?.truth_contract.pathTruth ?? "UNKNOWN" },
    simulator_version: mf?.simulator_version || SIM_VERSION,
  };
}

// context_hash (guard #4) — stable over the environment-defining fields ONLY (capital/riskPct are run
// parameters, not environment identity, so they are intentionally EXCLUDED from the hash).
export function operatingContextHash(ctx: CardOperatingContext): string {
  return configHash({
    symbol: ctx.symbol,
    design_tf: ctx.design_tf,
    session_scope: ctx.session_scope,
    period: ctx.period,
    cost_model_key: ctx.cost_model_key,
    truth: ctx.truth_contract,
    version: ctx.simulator_version,
  });
}
