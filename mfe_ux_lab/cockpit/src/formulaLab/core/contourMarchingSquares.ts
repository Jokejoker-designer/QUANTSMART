/**
 * contourMarchingSquares.ts — iso-line extraction over a response grid.
 *
 * Classic marching squares. Flat grids (all cells equal, or no level crossing)
 * yield zero segments rather than throwing. Sealed (non-finite) cells are
 * treated as "no crossing" so walls never produce phantom contours.
 */
import type { ResponseGrid } from "./coordinateTypes";

export interface ContourSegment {
  level: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function contourLevels(zMin: number, zMax: number, count: number): number[] {
  if (!Number.isFinite(zMin) || !Number.isFinite(zMax) || zMax - zMin < 1e-9) return [];
  const out: number[] = [];
  for (let i = 1; i <= count; i++) out.push(zMin + ((zMax - zMin) * i) / (count + 1));
  return out;
}

function interp(x1: number, z1: number, x2: number, z2: number, level: number): number {
  if (z1 === z2) return x1;
  return x1 + ((level - z1) / (z2 - z1)) * (x2 - x1);
}

export function marchingSquares(g: ResponseGrid, levels: number[]): ContourSegment[] {
  const segs: ContourSegment[] = [];
  const at = (ix: number, iy: number) => g.z[iy * g.nx + ix];

  for (const level of levels) {
    for (let iy = 0; iy < g.ny - 1; iy++) {
      for (let ix = 0; ix < g.nx - 1; ix++) {
        const tl = at(ix, iy + 1);
        const tr = at(ix + 1, iy + 1);
        const br = at(ix + 1, iy);
        const bl = at(ix, iy);
        if (![tl, tr, br, bl].every(Number.isFinite)) continue;

        const x0 = g.xs[ix];
        const x1 = g.xs[ix + 1];
        const y0 = g.ys[iy];
        const y1 = g.ys[iy + 1];

        let code = 0;
        if (bl > level) code |= 1;
        if (br > level) code |= 2;
        if (tr > level) code |= 4;
        if (tl > level) code |= 8;
        if (code === 0 || code === 15) continue;

        // edge crossings
        const bottom = () => ({ x: interp(x0, bl, x1, br, level), y: y0 });
        const top = () => ({ x: interp(x0, tl, x1, tr, level), y: y1 });
        const left = () => ({ x: x0, y: interp(y0, bl, y1, tl, level) });
        const right = () => ({ x: x1, y: interp(y0, br, y1, tr, level) });

        const push = (a: { x: number; y: number }, b: { x: number; y: number }) =>
          segs.push({ level, x1: a.x, y1: a.y, x2: b.x, y2: b.y });

        switch (code) {
          case 1: case 14: push(left(), bottom()); break;
          case 2: case 13: push(bottom(), right()); break;
          case 3: case 12: push(left(), right()); break;
          case 4: case 11: push(top(), right()); break;
          case 6: case 9: push(bottom(), top()); break;
          case 7: case 8: push(left(), top()); break;
          case 5: push(left(), top()); push(bottom(), right()); break;
          case 10: push(left(), bottom()); push(top(), right()); break;
        }
      }
    }
  }
  return segs;
}
