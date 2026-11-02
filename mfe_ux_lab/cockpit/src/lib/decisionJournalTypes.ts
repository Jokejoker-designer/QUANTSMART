export type ObservationStatus =
  | "CLOSED_MODELED"
  | "POLICY_BLOCKED"
  | "OPEN_AT_END"
  | "UNFILLED_END_OF_DATA"
  | "PLAN_REJECTED"
  | "NO_FILL_RECORDED";
export interface MissingEvidence {
  field: string;
  reason: string;
  fallbackUsed: false;
}
interface ObservationBase {
  observationId: string;
  identityKind: "SIGNAL_OBSERVATION";
  signalTime: string;
  direction: "BUY" | "SELL";
  barIndex: number;
  trace: {
    id: string;
    type: string;
    at: string | null;
    barIndex: number;
    reason: string;
  }[];

  missing: MissingEvidence[];
}
export type DecisionOutcome = {
  tradeId: string;
  signalTime: string;
  fillTime: string;
  exitTime: string | null;
  entryIndex: number;
  exitIndex: number;
  netR: number;
  grossR: number;
  costR: number;
  exitClassification: string;
  excursions: {
    window: string;
    bounds: string;
    bars: number;
    maxFavorablePrice: number | null;
    maxAdversePrice: number | null;
    mfeR: null;
    maeR: null;
    missing: MissingEvidence[];
  };
};
export type DecisionObservation = ObservationBase &
  (
    | { status: "CLOSED_MODELED"; outcome: DecisionOutcome }
    | { status: Exclude<ObservationStatus, "CLOSED_MODELED">; outcome: null }
  );

export interface DecisionJournal {
  entryEvaluation?: {
    coverage: "CAPTURED_DESIGN_BAR_BRANCHES" | "NOT_CAPTURED";
    policy: "FIRST_REACHED_TERMINAL_BRANCH_PER_DESIGN_BAR";
    summary: {
      warmupBars: number;
      recordedBars: number;
      unobservedBars: number;
      abstentions: number;
      vetoes: number;
      planRejections: number;
      modeledEntries: number;
    } | null;
    reasons: { code: string; outcome: string; count: number }[];
    records: (import("./realisticStrategySim.ts").EntryEvaluation & {
      evaluationId: string;
    })[];
    limitations: string[];
  };
  schema: "quantsmart.decision-journal/1";
  authority: "SHADOW_ONLY";
  decision: "NO_DECISION";
  live_apply_allowed: false;
  scope: "OBSERVED_CANONICAL_SIGNALS_ONLY";
  structuralSetupLifecycle: "NOT_IMPLEMENTED";
  runId: string;
  definitionHash: string;
  engineHash: string;
  configHash: string;
  source: {
    id: string;
    hash: string;
    symbol: string;
    timeframe: string;
    from: string;
    to: string;
    bars: number;
  };
  summary: {
    signals: number;
    closed: number;
    policyBlocked: number;
    openAtEnd: number;
    noFill: number;
    unjoinedTrades: number;
  };
  records: DecisionObservation[];
  limitations: string[];
  evidenceRecord?: { id: string; recordedAt: string };
}
export interface SavedDecisionEvidence {
  id: string;
  recordedAt: string;
  cardId: string;
  runId: string;
  source: DecisionJournal["source"];
  summary: DecisionJournal["summary"];
}
