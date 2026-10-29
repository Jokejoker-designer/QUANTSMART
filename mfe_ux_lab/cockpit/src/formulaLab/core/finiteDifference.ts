/**
 * finiteDifference.ts — finite-difference geometry over a response grid.
 *
 * MVP geometry is APPROXIMATE (finite-difference, not analytic). Every helper
 * returns finite numbers: when a neighbour is non-finite (a sealed wall cell) we
 * fall back to a one-sided difference or 0 so slope/curvature never propagate NaN.
 */
import type { ResponseGrid } from "./coordinateTypes";

function at(g: ResponseGrid, ix: number, iy: number): number {
  const cx = Math.max(0, Math.min(g.nx - 1, ix));
  const cy = Math.max(0, Math.min(g.ny - 1, iy));
  return g.z[cy * g.nx + cx];
}

function safeDelta(plus: number, minus: number, center: number, h: number): number {
  const dh = h || 1;
  if (Number.isFinite(plus) && Number.isFinite(minus)) return (plus - minus) / (2 * dh);
  if (Number.isFinite(plus) && Number.isFinite(center)) return (plus - center) / dh;
  if (Number.isFinite(center) && Number.isFinite(minus)) return (center - minus) / dh;
  return 0;
}

export interface CellGeometry {
  dzdx: number;
  dzdy: number;
  gradient: number; // |∇z|
  slope: number; // alias of gradient magnitude
  curvature: number; // ∂²z/∂x² + ∂²z/∂y² (approx)
}

export function cellGeometry(g: ResponseGrid, ix: number, iy: number): CellGeometry {
  const hx = g.nx > 1 ? (g.xs[g.nx - 1] - g.xs[0]) / (g.nx - 1) : 1;
  const hy = g.ny > 1 ? (g.ys[g.ny - 1] - g.ys[0]) / (g.ny - 1) : 1;
  const c = at(g, ix, iy);
  const xp = at(g, ix + 1, iy);
  const xm = at(g, ix - 1, iy);
  const yp = at(g, ix, iy + 1);
  const ym = at(g, ix, iy - 1);

  const dzdx = safeDelta(xp, xm, c, hx);
  const dzdy = safeDelta(yp, ym, c, hy);

  const d2x = Number.isFinite(xp) && Number.isFinite(xm) && Number.isFinite(c)
    ? (xp - 2 * c + xm) / (hx * hx) : 0;
  const d2y = Number.isFinite(yp) && Number.isFinite(ym) && Number.isFinite(c)
    ? (yp - 2 * c + ym) / (hy * hy) : 0;

  const gradient = Math.hypot(dzdx, dzdy);
  const curvature = d2x + d2y;
  return {
    dzdx: finite(dzdx),
    dzdy: finite(dzdy),
    gradient: finite(gradient),
    slope: finite(gradient),
    curvature: finite(curvature),
  };
}

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

/** Slope/curvature of a 1-D sampled curve (slice preview). */
export function curveDerivatives(xs: number[], zs: number[], i: number): { slope: number; curvature: number } {
  const n = xs.length;
  const c = zs[i];
  const p = zs[Math.min(n - 1, i + 1)];
  const m = zs[Math.max(0, i - 1)];
  const h = n > 1 ? (xs[n - 1] - xs[0]) / (n - 1) : 1;
  const slope = safeDelta(p, m, c, h);
  const curvature = Number.isFinite(p) && Number.isFinite(m) && Number.isFinite(c)
    ? (p - 2 * c + m) / (h * h) : 0;
  return { slope: finite(slope), curvature: finite(curvature) };
}

/** Indices where a 1-D curve crosses zero (for slice/coordinate markers). */
export function zeroCrossings(xs: number[], zs: number[]): { x: number; type: "UPWARD" | "DOWNWARD" }[] {
  const out: { x: number; type: "UPWARD" | "DOWNWARD" }[] = [];
  for (let i = 1; i < zs.length; i++) {
    const a = zs[i - 1];
    const b = zs[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const t = a === b ? 0 : a / (a - b);
      out.push({ x: xs[i - 1] + t * (xs[i] - xs[i - 1]), type: b >= a ? "UPWARD" : "DOWNWARD" });
    }
  }
  return out;
}
