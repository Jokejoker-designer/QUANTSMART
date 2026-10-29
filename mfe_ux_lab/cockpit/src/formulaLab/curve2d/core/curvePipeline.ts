/**
 * curvePipeline.ts — orchestrate one Curve2D evaluation:
 * mapped axes → samples (causal) → curve (formula slice / empirical) → geometry → safety.
 */
import type { FormulaNode } from "../../core/coordinateTypes";
import type { WeightEnv, Env } from "../../core/formulaSurfaceEvaluator";
import type { CurveAxisSource, CurveAxisMapping, CurveResult, CurveSafety } from "./curveTypes";
import {
  applyCurveTransform, buildCurveSamplePoints, buildFormulaCurve, buildEmpiricalCurve,
  detectCurveMode, FORMULA_OUTPUT_ID,
} from "./curveBuild";
import { computeCurveGeometry } from "./curveGeometry";

function median(xs: number[]): number {
  const f = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!f.length) return 0;
  const m = Math.floor(f.length / 2);
  return f.length % 2 ? f[m] : (f[m - 1] + f[m]) / 2;
}

export interface CurveComputeInput {
  ast: FormulaNode;
  /** all real variables (NOT the formula-output pseudo-source) */
  variables: CurveAxisSource[];
  /** the formula-output pseudo-source (Y = signal) */
  formulaOutput: CurveAxisSource;
  weights: WeightEnv;
  selectedBarIndex?: number;
  timestamps: string[];
  prices?: number[];
}

export function computeCurveResult(input: CurveComputeInput, mapping: CurveAxisMapping): CurveResult {
  const all = [...input.variables, input.formulaOutput];
  const xSrc = all.find((v) => v.id === mapping.x.sourceId) ?? all[0];
  const ySrc = all.find((v) => v.id === mapping.y.sourceId) ?? input.formulaOutput;

  const xMap = applyCurveTransform(xSrc.series, mapping.x.transform);
  const yMap = applyCurveTransform(ySrc.series, mapping.y.transform);

  const samplePoints = buildCurveSamplePoints({
    xMapped: xMap.mapped,
    yMapped: yMap.mapped,
    timestamps: input.timestamps,
    prices: input.prices,
    selectedBarIndex: input.selectedBarIndex,
  });

  const yIsFormula = ySrc.id === FORMULA_OUTPUT_ID;
  const curveMode = detectCurveMode(input.ast, xSrc.id, yIsFormula);

  // held env: non-X real variables at selected bar (fallback median)
  const heldEnv: Env = {};
  for (const v of input.variables) {
    if (v.id === xSrc.id) continue;
    const at = input.selectedBarIndex != null ? v.series[input.selectedBarIndex] : undefined;
    heldEnv[v.id] = at != null && Number.isFinite(at) ? at : median(v.series);
  }

  const curve = yIsFormula
    ? buildFormulaCurve({
        ast: input.ast, xSourceId: xSrc.id, xRange: mapping.x.range, steps: 240,
        heldEnv, weights: input.weights,
      })
    : buildEmpiricalCurve(samplePoints, 64);

  const geometry = computeCurveGeometry(curve, samplePoints, !yIsFormula);

  // safety
  const walls = new Set<string>();
  if (xMap.wall) walls.add(xMap.wall);
  if (yMap.wall) walls.add(yMap.wall);
  for (const p of curve) if (!Number.isFinite(p.y)) { walls.add("NAN_INF_SEAL"); break; }

  const noLookaheadPass = xSrc.safety.noLookahead && xSrc.safety.causalSafe && ySrc.safety.noLookahead && ySrc.safety.causalSafe;
  const finiteOutputPass = curve.some((p) => Number.isFinite(p.y));
  const kidiSafe = finiteOutputPass;
  if (!noLookaheadPass) walls.add("LOOKAHEAD_FAIL");

  const notes: string[] = [];
  if (curveMode === "APPROX_SLICE_CURVE") notes.push("APPROX SLICE · Non-X variables held fixed.");
  if (curveMode === "EMPIRICAL_REPLAY_CURVE") notes.push("EMPIRICAL CURVE · Replay samples only.");
  if (!noLookaheadPass) notes.push("No-lookahead failed: a used source is not causal-safe.");
  if (!finiteOutputPass) notes.push("Finite-output failed: curve has no finite points.");

  const safety: CurveSafety = {
    kidiSafe,
    noLookaheadPass,
    finiteOutputPass,
    curveMode,
    exportable: kidiSafe && noLookaheadPass && finiteOutputPass,
    walls: Array.from(walls),
    notes,
  };

  return { samplePoints, curve, curveMode, geometry, zeroCrossings: geometry.zeroCrossings, safety };
}
