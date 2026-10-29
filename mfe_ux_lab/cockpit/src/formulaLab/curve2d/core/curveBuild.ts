/**
 * curveBuild.ts — build the 2D curve + replay samples for Curve2D Mode.
 * Reuses the lab's transforms + safe formula evaluator. No heatmap, no Z.
 */
import type { FormulaNode } from "../../core/coordinateTypes";
import { transformSeries } from "../../core/axisMapping";
import { evalFormula, collectVarIds, type Env, type WeightEnv } from "../../core/formulaSurfaceEvaluator";
import type {
  CurveTransform, CurvePoint, CurveSamplePoint, CurveMode, CurveAxisSource,
} from "./curveTypes";

export const FORMULA_OUTPUT_ID = "__formula_output__";

export interface MappedAxis { mapped: number[]; wall: string | null; range: [number, number]; }

export function applyCurveTransform(series: number[], transform: CurveTransform): MappedAxis {
  if (transform === "CLIP") {
    const mapped = series.map((v) => (Number.isFinite(v) ? Math.max(-3, Math.min(3, v)) : NaN));
    return { mapped, wall: null, range: [-3, 3] };
  }
  return transformSeries(series, transform);
}

/** Evaluate the formula once per bar with every variable at its bar value. */
export function computeFormulaSeries(
  ast: FormulaNode,
  variables: { id: string; series: number[] }[],
  weights: WeightEnv,
): { series: number[]; wall: string | null } {
  const n = Math.max(...variables.map((v) => v.series.length), 0);
  const out = new Array<number>(n);
  let wall: string | null = null;
  for (let i = 0; i < n; i++) {
    const env: Env = {};
    for (const v of variables) env[v.id] = v.series[i];
    const r = evalFormula(ast, env, weights);
    out[i] = r.value;
    if (r.wall && !wall) wall = r.wall;
  }
  return { series: out, wall };
}

export function detectCurveMode(
  ast: FormulaNode,
  xSourceId: string,
  yIsFormulaOutput: boolean,
): CurveMode {
  if (!yIsFormulaOutput) return "EMPIRICAL_REPLAY_CURVE";
  const vars = collectVarIds(ast);
  // EXACT only when the formula resolves entirely from X.
  if (vars.size === 1 && vars.has(xSourceId)) return "EXACT_FORMULA_CURVE";
  return "APPROX_SLICE_CURVE";
}

/** Replay samples — only bars at/before selectedBarIndex (causal, no future). */
export function buildCurveSamplePoints(args: {
  xMapped: number[];
  yMapped: number[];
  timestamps: string[];
  prices?: number[];
  selectedBarIndex?: number;
}): CurveSamplePoint[] {
  const n = Math.min(args.xMapped.length, args.yMapped.length);
  const upper = Math.min(n - 1, args.selectedBarIndex ?? n - 1);
  const points: CurveSamplePoint[] = [];
  for (let i = 0; i <= upper; i++) {
    const x = args.xMapped[i];
    const y = args.yMapped[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ barIndex: i, timestamp: args.timestamps[i] ?? "", x, y, price: args.prices?.[i] });
  }
  return points;
}

/** Y = f(X | non-X held). Sweep X over the axis range. */
export function buildFormulaCurve(args: {
  ast: FormulaNode;
  xSourceId: string;
  xRange: [number, number];
  steps: number;
  heldEnv: Env;
  weights: WeightEnv;
}): CurvePoint[] {
  const [xMin, xMax] = args.xRange;
  const out: CurvePoint[] = [];
  const env: Env = { ...args.heldEnv };
  for (let i = 0; i < args.steps; i++) {
    const x = xMin + (xMax - xMin) * (i / (args.steps - 1));
    env[args.xSourceId] = x;
    const r = evalFormula(args.ast, env, args.weights);
    out.push({ x, y: r.value }); // keep non-finite as gaps; renderer skips them
  }
  return out;
}

/** Empirical curve: average Y per X-bin. */
export function buildEmpiricalCurve(points: CurveSamplePoint[], bins = 64): CurvePoint[] {
  const finite = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (finite.length === 0) return [];
  let lo = Infinity, hi = -Infinity;
  for (const p of finite) { if (p.x < lo) lo = p.x; if (p.x > hi) hi = p.x; }
  if (hi - lo < 1e-12) return [{ x: lo, y: finite.reduce((a, p) => a + p.y, 0) / finite.length }];
  const sum = new Array<number>(bins).fill(0);
  const cnt = new Array<number>(bins).fill(0);
  for (const p of finite) {
    const b = Math.max(0, Math.min(bins - 1, Math.floor(((p.x - lo) / (hi - lo)) * bins)));
    sum[b] += p.y; cnt[b]++;
  }
  const out: CurvePoint[] = [];
  for (let b = 0; b < bins; b++) {
    if (cnt[b] === 0) continue;
    out.push({ x: lo + ((b + 0.5) / bins) * (hi - lo), y: sum[b] / cnt[b] });
  }
  return out;
}

export function defaultFormulaOutputSource(series: number[]): CurveAxisSource {
  const ext = (() => {
    let lo = Infinity, hi = -Infinity;
    for (const v of series) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return Number.isFinite(lo) ? ([lo, hi] as [number, number]) : ([-1, 1] as [number, number]);
  })();
  return {
    id: FORMULA_OUTPUT_ID,
    displayName: "signal (formula output)",
    layer: "FORMULA_OUTPUT",
    series,
    defaultRange: ext,
    defaultTransform: "RAW",
    semantic: "FORMULA_OUTPUT",
    safety: { causalSafe: true, noLookahead: true, finite: true },
  };
}
