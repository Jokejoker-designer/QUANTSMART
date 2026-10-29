// simTruthContract — declares HOW TRUE each simulation result is (P-1 Truth Foundation).
// M1 OHLC is the best long-history master clock, NOT absolute execution truth.
// Tick bid/ask is the only absolute execution truth. Every run must declare its truth level.

export type DataTruthLevel =
  | "TICK_BID_ASK"
  | "M1_BID_ASK"
  | "M1_MID_OHLC"
  | "M1_UNKNOWN_PRICE_BASIS"
  | "HTF_OHLC_ONLY";

export type PathTruthLevel =
  | "TICK_PATH_EXACT"
  | "M1_PATH_APPROX"
  | "M1_AMBIGUOUS"
  | "HTF_HEURISTIC"
  | "UNKNOWN";

export type CostTruthLevel =
  | "TICK_CALIBRATED"
  | "BROKER_SPEC_CALIBRATED"
  | "PROVISIONAL"
  | "NOT_AVAILABLE";

export type ExecutionTruthLevel =
  | "BROKER_REPLAY"
  | "MODELED_NEXT_OPEN"
  | "MODELED_BAR_CLOSE_LEGACY"
  | "UNKNOWN";

export interface SimulatorTruthContract {
  dataTruth: DataTruthLevel;
  pathTruth: PathTruthLevel;
  costTruth: CostTruthLevel;
  executionTruth: ExecutionTruthLevel;
  priceBasis: "BID" | "ASK" | "MID" | "UNKNOWN";
  timezoneStatus: "VERIFIED" | "PROVISIONAL" | "UNKNOWN";
  brokerTimeOffset?: string;
  warnings: string[];
}

export interface TruthContractInput {
  dataTruth: DataTruthLevel;
  priceBasis: "BID" | "ASK" | "MID" | "UNKNOWN";
  timezoneStatus: "VERIFIED" | "PROVISIONAL" | "UNKNOWN";
  costStatus: "PROVISIONAL" | "CALIBRATED" | "NOT_AVAILABLE";
  // P0 resolves exits on design-TF (HTF) OHLC bars, NOT on the M1 path → HTF_HEURISTIC.
  pathTruth?: PathTruthLevel;
  executionTruth?: ExecutionTruthLevel;
  brokerTimeOffset?: string;
}

export function buildTruthContract(inp: TruthContractInput): SimulatorTruthContract {
  const warnings: string[] = [];
  const costTruth: CostTruthLevel =
    inp.costStatus === "CALIBRATED" ? "BROKER_SPEC_CALIBRATED"
    : inp.costStatus === "NOT_AVAILABLE" ? "NOT_AVAILABLE"
    : "PROVISIONAL";
  const pathTruth = inp.pathTruth ?? "HTF_HEURISTIC";
  const executionTruth = inp.executionTruth ?? "MODELED_NEXT_OPEN";

  if (inp.priceBasis === "UNKNOWN") warnings.push("Price basis is unknown. Execution/cost modeling is provisional.");
  if (costTruth === "PROVISIONAL") warnings.push("Cost model is PROVISIONAL — requires broker tick/spec calibration.");
  if (pathTruth === "HTF_HEURISTIC") warnings.push("Exit path resolved on design-TF OHLC (heuristic). Tick required for exact fill. M1 intrabar path deferred to P1.");
  if (inp.timezoneStatus !== "VERIFIED") warnings.push("Timezone/session boundary is " + inp.timezoneStatus + ".");

  return {
    dataTruth: inp.dataTruth,
    pathTruth,
    costTruth,
    executionTruth,
    priceBasis: inp.priceBasis,
    timezoneStatus: inp.timezoneStatus,
    brokerTimeOffset: inp.brokerTimeOffset,
    warnings,
  };
}

// plain-language one-liners for the UI truth surface
export const TRUTH_LABEL: Record<string, string> = {
  HTF_HEURISTIC: "M1 APPROX PATH — exit on HTF OHLC, tick required for exact fill",
  M1_PATH_APPROX: "M1 APPROX PATH",
  TICK_PATH_EXACT: "TICK EXACT PATH",
  PROVISIONAL: "PROVISIONAL COST",
  BROKER_SPEC_CALIBRATED: "BROKER-SPEC COST",
  TICK_CALIBRATED: "TICK-CALIBRATED COST",
  MODELED_NEXT_OPEN: "MODELED NEXT-OPEN FILL",
  MODELED_BAR_CLOSE_LEGACY: "LEGACY BAR-CLOSE FILL (mild lookahead)",
};
