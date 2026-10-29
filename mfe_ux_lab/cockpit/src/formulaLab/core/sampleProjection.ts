/**
 * sampleProjection.ts — project historical replay bars onto the X/Y plane.
 *
 *   x[i] = X series at i,  y[i] = Y series at i,  z[i] = formula output at i.
 *
 * Dots are HISTORICAL REPLAY SAMPLES, not trade signals. Only bars at or before
 * the selected bar are used — never future bars (causal / no-lookahead).
 */
import type {
  FormulaNode,
  CoordinateSamplePoint,
  CoordinateRegime,
} from "./coordinateTypes";
import { evalFormula, type Env, type WeightEnv } from "./formulaSurfaceEvaluator";

export interface ProjectionInput {
  ast: FormulaNode;
  xVarId: string;
  yVarId: string;
  /** axis-mapped series (already transformed) keyed by variable id */
  mappedSeries: Record<string, number[]>;
  /** raw series for non-axis variables (held per bar) */
  rawSeries: Record<string, number[]>;
  weights?: WeightEnv;
  /** inclusive upper bound — no bar after this index is projected */
  selectedBarIndex?: number;
  timestamps?: string[];
}

export function classifyCoordinateRegime(p: {
  output: number;
  x: number;
  y: number;
  slope: number;
  curvature: number;
  nearDomainEdge: boolean;
}): CoordinateRegime {
  if (p.output < -0.4) return "RISK_ZONE";
  if (Math.abs(p.slope) > 0.85 || Math.abs(p.curvature) > 0.75 || p.nearDomainEdge) {
    return "FRAGILE";
  }
  if (p.output > 0.4 && p.x > 0 && p.y > 0) return "BULLISH_CONTEXT";
  return "NEUTRAL";
}

export function projectSamples(input: ProjectionInput): CoordinateSamplePoint[] {
  const xMap = input.mappedSeries[input.xVarId] ?? [];
  const yMap = input.mappedSeries[input.yVarId] ?? [];
  const n = Math.min(xMap.length, yMap.length);
  // Causal bound: never read a bar after the selected one.
  const last = input.selectedBarIndex ?? n - 1;
  const upper = Math.min(n - 1, last);

  const out: CoordinateSamplePoint[] = [];
  for (let i = 0; i <= upper; i++) {
    const x = xMap[i];
    const y = yMap[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const env: Env = {};
    // hold every non-axis variable at its own value for this bar
    for (const id of Object.keys(input.rawSeries)) {
      env[id] = input.rawSeries[id][i];
    }
    env[input.xVarId] = x;
    env[input.yVarId] = y;
    const r = evalFormula(input.ast, env, input.weights ?? {});
    const z = r.value;

    const regime = classifyCoordinateRegime({
      output: Number.isFinite(z) ? z : 0,
      x,
      y,
      slope: 0,
      curvature: 0,
      nearDomainEdge: r.wall !== null,
    });

    out.push({
      index: i,
      timestamp: input.timestamps?.[i],
      x,
      y,
      z: Number.isFinite(z) ? z : NaN,
      regime,
      wall: r.wall,
    });
  }
  return out;
}
