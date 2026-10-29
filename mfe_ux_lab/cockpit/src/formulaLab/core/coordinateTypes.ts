/**
 * coordinateTypes.ts — data contracts for the KIDI Formula Coordinate Lab.
 *
 * The lab does NOT invent data. It receives a formula (AST + text) and variable
 * series from QuantLab / L3, evaluates the formula as geometry, and exposes
 * shape / sensitivity / singularity / no-lookahead diagnostics.
 *
 * Nothing here is a trade signal. Z is a modeled formula output, not an entry.
 */

export type AxisTransform =
  | "RAW"
  | "ZSCORE"
  | "PERCENTILE"
  | "RANK"
  | "LOG"
  | "NORMALIZE";

export type VariableLayer = "L1" | "L2" | "L3_AST_NODE";

export type VariableSemantic =
  | "TREND"
  | "MOMENTUM"
  | "VOLATILITY"
  | "RISK"
  | "QUALITY"
  | "CONTEXT"
  | "FORMULA_OUTPUT";

export interface VariableSafety {
  noLookahead: boolean;
  finite: boolean;
  causalSafe: boolean;
}

export interface VariableSpec {
  id: string;
  displayName: string;
  layer: VariableLayer;
  series: number[];
  defaultRange: [number, number];
  defaultTransform: AxisTransform;
  semantic?: VariableSemantic;
  safety: VariableSafety;
}

export interface ReplayBar {
  timestamp: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

// ---- Formula AST (self-contained; QuantFormulaAst alias) --------------------

export type FormulaNode =
  | { kind: "num"; value: number }
  | { kind: "const"; name: "pi" | "e" }
  | { kind: "var"; id: string }
  | { kind: "weight"; id: string; value: number } // tunable constant (weight sweep)
  | { kind: "unary"; op: "neg"; arg: FormulaNode }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "pow"; a: FormulaNode; b: FormulaNode }
  | {
      kind: "call";
      fn:
        | "tanh" | "sigmoid" | "sin" | "cos" | "abs" | "sqrt" | "log" | "exp"
        | "min" | "max" | "clamp" | "gate";
      args: FormulaNode[];
    };

export type QuantFormulaAst = FormulaNode;

export interface FormulaCoordinateInput {
  formulaId: string;
  formulaName: string;
  formulaAst: QuantFormulaAst;
  formulaText: string;
  variables: VariableSpec[];
  replayBars?: ReplayBar[];
  selectedBarIndex?: number;
  /** ids that are rolling/time-series ⇒ grid surface is approximate */
  rollingVarIds?: string[];
  safety: {
    kidiSafe: boolean;
    noLookahead: boolean;
    finiteOutput: boolean;
  };
}

// ---- KIDI walls ------------------------------------------------------------

export type WallState =
  | "KIDI_DIV_WALL"
  | "DOMAIN_WALL_LOG"
  | "DOMAIN_WALL_SQRT"
  | "EXP_OVERFLOW_WALL"
  | "ROLLING_STD_ZERO_WALL"
  | "NAN_INF_SEAL"
  | "LOOKAHEAD_FAIL"
  | "HTF_FORMING_BAR"
  | "ORACLE_LABEL_LEAK";

export interface EvalResult {
  value: number; // sealed (NaN) when a hard wall fires
  wall: WallState | null;
}

// ---- Outputs ---------------------------------------------------------------

export interface ResponseGrid {
  nx: number;
  ny: number;
  xs: number[];
  ys: number[];
  /** row-major: z[iy * nx + ix] */
  z: Float64Array;
  zMin: number;
  zMax: number;
  finiteCount: number;
  wallCount: number;
  wallsHit: WallState[];
  approx: boolean;
  approxReason?: string;
}

export type CoordinateRegime =
  | "BULLISH_CONTEXT"
  | "NEUTRAL"
  | "FRAGILE"
  | "RISK_ZONE";

export interface CoordinateSamplePoint {
  index: number;
  timestamp?: string;
  x: number;
  y: number;
  z: number;
  regime: CoordinateRegime;
  wall: WallState | null;
}

export interface ExtremaPoint {
  type: "GLOBAL_MAX" | "LOCAL_MAX" | "GLOBAL_MIN" | "LOCAL_MIN" | "SADDLE";
  x: number;
  y: number;
  z: number;
}

export interface GeometrySummary {
  outputMin: number;
  outputMax: number;
  globalMax: ExtremaPoint | null;
  globalMin: ExtremaPoint | null;
  extrema: ExtremaPoint[];
  avgAbsSlope: number;
  curvatureMean: number;
  flatZoneCoverage: number; // 0..1
  saturationCoverage: number; // 0..1
  singularityRisk: "LOW" | "MEDIUM" | "HIGH";
  discontinuityRisk: "LOW" | "MEDIUM" | "HIGH";
  extrapolationRisk: "LOW" | "MEDIUM" | "HIGH";
}

export interface CoordinateSafetyStatus {
  kidiSafe: boolean; // no hard wall left unlabeled
  wallHandled: boolean; // walls were encountered but labeled
  noLookaheadPass: boolean;
  finiteOutputPass: boolean;
  approxSurface: boolean;
  exportable: boolean; // false ⇒ must not render-as-valid / export
  shadowOnly: true;
  noOrderSend: true;
  walls: WallState[];
  notes: string[];
}

export interface FormulaCoordinateResult {
  responseGrid: ResponseGrid;
  samplePoints: CoordinateSamplePoint[];
  geometrySummary: GeometrySummary;
  safetyStatus: CoordinateSafetyStatus;
}

export interface AxisSelection {
  xVarId: string;
  yVarId: string;
  xTransform: AxisTransform;
  yTransform: AxisTransform;
  xRange: [number, number];
  yRange: [number, number];
  nx: number;
  ny: number;
}
