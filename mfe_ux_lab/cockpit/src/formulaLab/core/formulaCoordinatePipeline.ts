/**
 * formulaCoordinatePipeline.ts — orchestrate one Formula Coordinate evaluation:
 * response grid + replay sample projection + geometry summary + safety status.
 */
import type {
  FormulaCoordinateInput,
  FormulaCoordinateResult,
  AxisSelection,
} from "./coordinateTypes";
import type { WeightEnv } from "./formulaSurfaceEvaluator";
import { evaluateResponseGrid } from "./responseGrid";
import { projectSamples } from "./sampleProjection";
import { computeGeometrySummary } from "./geometryMetrics";
import { computeSafetyStatus } from "./coordinateSafety";
import { transformSeries } from "./axisMapping";

function median(xs: number[]): number {
  const f = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!f.length) return 0;
  const mid = Math.floor(f.length / 2);
  return f.length % 2 ? f[mid] : (f[mid - 1] + f[mid]) / 2;
}

/** Hold non-axis variables at the selected bar (fallback: median). */
export function buildHeldEnv(
  input: FormulaCoordinateInput,
  axisVarIds: string[],
): Record<string, number> {
  const env: Record<string, number> = {};
  const bar = input.selectedBarIndex;
  for (const variable of input.variables) {
    if (axisVarIds.includes(variable.id)) continue;
    const atBar = bar != null ? variable.series[bar] : undefined;
    env[variable.id] = atBar != null && Number.isFinite(atBar) ? atBar : median(variable.series);
  }
  return env;
}

export function computeFormulaCoordinateResult(
  input: FormulaCoordinateInput,
  axis: AxisSelection,
  weights: WeightEnv = {},
): FormulaCoordinateResult {
  const axisVarIds = [axis.xVarId, axis.yVarId];
  const heldEnv = buildHeldEnv(input, axisVarIds);

  const rolling = new Set(input.rollingVarIds ?? []);
  const approx = axisVarIds.some((id) => rolling.has(id)) || input.variables.some((v) => rolling.has(v.id));
  const approxReason = approx
    ? "Approx surface: rolling/time-series formula. Non-axis variables are held at selected bar / median / preset."
    : undefined;

  const grid = evaluateResponseGrid(
    input.formulaAst,
    {
      xVarId: axis.xVarId,
      yVarId: axis.yVarId,
      xRange: axis.xRange,
      yRange: axis.yRange,
      nx: axis.nx,
      ny: axis.ny,
    },
    heldEnv,
    weights,
    { approx, approxReason },
  );

  // mapped (axis space) + raw series for projection
  const mappedSeries: Record<string, number[]> = {};
  const rawSeries: Record<string, number[]> = {};
  for (const variable of input.variables) {
    rawSeries[variable.id] = variable.series;
  }
  const xVar = input.variables.find((v) => v.id === axis.xVarId);
  const yVar = input.variables.find((v) => v.id === axis.yVarId);
  mappedSeries[axis.xVarId] = xVar ? transformSeries(xVar.series, axis.xTransform).mapped : [];
  mappedSeries[axis.yVarId] = yVar ? transformSeries(yVar.series, axis.yTransform).mapped : [];

  const samplePoints = projectSamples({
    ast: input.formulaAst,
    xVarId: axis.xVarId,
    yVarId: axis.yVarId,
    mappedSeries,
    rawSeries,
    weights,
    selectedBarIndex: input.selectedBarIndex,
    timestamps: input.replayBars?.map((b) => b.timestamp),
  });

  const geometrySummary = computeGeometrySummary(grid);
  const safetyStatus = computeSafetyStatus(input, grid, axisVarIds);

  return { responseGrid: grid, samplePoints, geometrySummary, safetyStatus };
}
