/**
 * curveTypes.ts — data contracts for QuantLab 2D Curve Mode.
 *
 * 2D Curve Mode has ONLY X and Y. No Z-axis, no heatmap, no surface, no
 * color-encoded third dimension. Color is decoration / point state only.
 * Nothing here is an entry signal.
 */
import type { AxisTransform } from "../../core/coordinateTypes";

export type CurveTransform = AxisTransform | "CLIP";

export type CurveAxisLayer = "L1" | "L2" | "L3_AST_NODE" | "FORMULA_OUTPUT";

export type CurveSemantic =
  | "PRICE" | "TREND" | "MOMENTUM" | "VOLATILITY" | "RISK" | "QUALITY" | "CONTEXT" | "FORMULA_OUTPUT";

export interface CurveAxisSource {
  id: string;
  displayName: string;
  layer: CurveAxisLayer;
  series: number[];
  defaultRange: [number, number];
  defaultTransform: CurveTransform;
  semantic: CurveSemantic;
  safety: { causalSafe: boolean; noLookahead: boolean; finite: boolean };
}

export type CurveMode =
  | "EXACT_FORMULA_CURVE"
  | "APPROX_SLICE_CURVE"
  | "EMPIRICAL_REPLAY_CURVE";

export interface CurveAxisMapping {
  x: { sourceId: string; transform: CurveTransform; range: [number, number] };
  y: { sourceId: string; transform: CurveTransform; range: [number, number] };
  curveMode: CurveMode;
  holdPolicy?: { nonAxisVariables: "SELECTED_BAR" | "MEDIAN" | "PRESET"; selectedBarIndex?: number };
}

export interface CurvePoint { x: number; y: number; }

export type SampleFlag = "CURRENT" | "SELECTED" | "ZERO_CROSSING" | "OUTLIER" | "PINNED";

export interface CurveSamplePoint {
  barIndex: number;
  timestamp: string;
  x: number;
  y: number;
  price?: number;
  regime?: string;
  flags?: SampleFlag[];
}

export type CrossType = "UPWARD" | "DOWNWARD" | "TOUCH";
export interface ZeroCrossing { x: number; y: number; crossType: CrossType; }

export interface CurveGeometrySummary {
  outputRange: [number, number];
  zeroCrossings: ZeroCrossing[];
  maxY: number;
  minY: number;
  amplitude: number;
  avgSlope: number;
  curvatureAvg: number;
  smoothness: number;
  symmetry: number;
  rSquared: number | null; // empirical fit only
  flatZoneCoverage: number;
  saturationCoverage: number;
  singularityRisk: "LOW" | "MEDIUM" | "HIGH";
  discontinuityRisk: "LOW" | "MEDIUM" | "HIGH";
}

export type RegionStyle = "SAFE" | "CAUTION" | "RISK" | "INFO";
export interface CurveRegion {
  id: "I" | "II" | "III" | "IV";
  label: string;
  description: string;
  condition: string;
  style: RegionStyle;
}

export interface CurveSafety {
  kidiSafe: boolean;
  noLookaheadPass: boolean;
  finiteOutputPass: boolean;
  curveMode: CurveMode;
  exportable: boolean;
  walls: string[];
  notes: string[];
}

export interface CurveResult {
  samplePoints: CurveSamplePoint[];
  curve: CurvePoint[];
  curveMode: CurveMode;
  geometry: CurveGeometrySummary;
  zeroCrossings: ZeroCrossing[];
  safety: CurveSafety;
}
