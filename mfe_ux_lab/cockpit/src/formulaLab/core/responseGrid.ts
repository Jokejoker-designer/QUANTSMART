/**
 * responseGrid.ts — evaluate Z = f(X, Y, held...) across an X/Y grid.
 *
 * Deterministic: the same AST + axis + held env + weights always produces the
 * same grid. If the formula uses rolling/time-series variables, the surface is
 * APPROXIMATE because non-axis variables are held at the selected bar / median.
 */
import type { FormulaNode, ResponseGrid, WallState } from "./coordinateTypes";
import { evalFormula, type Env, type WeightEnv } from "./formulaSurfaceEvaluator";

export interface GridAxis {
  xVarId: string;
  yVarId: string;
  xRange: [number, number];
  yRange: [number, number];
  nx: number;
  ny: number;
}

function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [a];
  const step = (b - a) / (n - 1);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = a + i * step;
  return out;
}

export function evaluateResponseGrid(
  ast: FormulaNode,
  axis: GridAxis,
  heldEnv: Env,
  weights: WeightEnv = {},
  opts: { approx?: boolean; approxReason?: string } = {},
): ResponseGrid {
  const nx = Math.max(2, Math.floor(axis.nx));
  const ny = Math.max(2, Math.floor(axis.ny));
  const xs = linspace(axis.xRange[0], axis.xRange[1], nx);
  const ys = linspace(axis.yRange[0], axis.yRange[1], ny);
  const z = new Float64Array(nx * ny);

  let zMin = Infinity;
  let zMax = -Infinity;
  let finiteCount = 0;
  let wallCount = 0;
  const wallsHit = new Set<WallState>();

  const env: Env = { ...heldEnv };
  for (let iy = 0; iy < ny; iy++) {
    env[axis.yVarId] = ys[iy];
    for (let ix = 0; ix < nx; ix++) {
      env[axis.xVarId] = xs[ix];
      const r = evalFormula(ast, env, weights);
      z[iy * nx + ix] = r.value;
      if (r.wall) { wallCount++; wallsHit.add(r.wall); }
      if (Number.isFinite(r.value)) {
        finiteCount++;
        if (r.value < zMin) zMin = r.value;
        if (r.value > zMax) zMax = r.value;
      }
    }
  }

  if (!Number.isFinite(zMin)) { zMin = 0; zMax = 0; }

  return {
    nx,
    ny,
    xs,
    ys,
    z,
    zMin,
    zMax,
    finiteCount,
    wallCount,
    wallsHit: Array.from(wallsHit),
    approx: opts.approx ?? false,
    approxReason: opts.approxReason,
  };
}
