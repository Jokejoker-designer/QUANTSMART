/**
 * geometryMetrics.ts — global geometry summary from a response grid.
 *
 * All metrics are APPROXIMATE (finite-difference). Extrema are detected by local
 * neighbour comparison; saddles by mixed-curvature sign. Risk levels are coarse
 * heuristics, never claims of trading edge.
 */
import type { ResponseGrid, GeometrySummary, ExtremaPoint } from "./coordinateTypes";
import { cellGeometry } from "./finiteDifference";

const FLAT_SLOPE = 0.1;
const SATURATION = 0.98; // |z| within 2% of max magnitude

function risk(ratio: number): "LOW" | "MEDIUM" | "HIGH" {
  if (ratio > 0.25) return "HIGH";
  if (ratio > 0.08) return "MEDIUM";
  return "LOW";
}

export function computeGeometrySummary(g: ResponseGrid): GeometrySummary {
  const at = (ix: number, iy: number) => g.z[iy * g.nx + ix];

  let gMax: ExtremaPoint | null = null;
  let gMin: ExtremaPoint | null = null;
  const extrema: ExtremaPoint[] = [];

  let slopeSum = 0;
  let curvSum = 0;
  let flat = 0;
  let saturated = 0;
  let finiteCells = 0;
  const maxMag = Math.max(Math.abs(g.zMin), Math.abs(g.zMax), 1e-9);

  for (let iy = 0; iy < g.ny; iy++) {
    for (let ix = 0; ix < g.nx; ix++) {
      const z = at(ix, iy);
      if (!Number.isFinite(z)) continue;
      finiteCells++;
      const cg = cellGeometry(g, ix, iy);
      slopeSum += cg.slope;
      curvSum += cg.curvature;
      if (cg.slope < FLAT_SLOPE) flat++;
      if (Math.abs(z) >= SATURATION * maxMag) saturated++;

      if (!gMax || z > gMax.z) gMax = { type: "GLOBAL_MAX", x: g.xs[ix], y: g.ys[iy], z };
      if (!gMin || z < gMin.z) gMin = { type: "GLOBAL_MIN", x: g.xs[ix], y: g.ys[iy], z };

      // local extrema (interior only)
      if (ix > 0 && ix < g.nx - 1 && iy > 0 && iy < g.ny - 1) {
        const nb = [at(ix - 1, iy), at(ix + 1, iy), at(ix, iy - 1), at(ix, iy + 1)];
        if (nb.every(Number.isFinite)) {
          if (nb.every((v) => z > v)) extrema.push({ type: "LOCAL_MAX", x: g.xs[ix], y: g.ys[iy], z });
          else if (nb.every((v) => z < v)) extrema.push({ type: "LOCAL_MIN", x: g.xs[ix], y: g.ys[iy], z });
          else {
            const dxx = nb[0] + nb[1] - 2 * z;
            const dyy = nb[2] + nb[3] - 2 * z;
            if (dxx * dyy < -1e-6) extrema.push({ type: "SADDLE", x: g.xs[ix], y: g.ys[iy], z });
          }
        }
      }
    }
  }

  const denom = finiteCells || 1;
  const wallRatio = g.wallCount / (g.nx * g.ny);
  if (gMax) extrema.unshift(gMax);
  if (gMin) extrema.unshift(gMin);

  return {
    outputMin: g.zMin,
    outputMax: g.zMax,
    globalMax: gMax,
    globalMin: gMin,
    extrema: extrema.slice(0, 24),
    avgAbsSlope: slopeSum / denom,
    curvatureMean: curvSum / denom,
    flatZoneCoverage: flat / denom,
    saturationCoverage: saturated / denom,
    singularityRisk: risk(wallRatio),
    discontinuityRisk: risk(1 - finiteCells / (g.nx * g.ny)),
    extrapolationRisk: risk(saturated / denom),
  };
}
