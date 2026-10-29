/**
 * axisMapping.ts — map a variable series into axis coordinate space.
 *
 * Transforms: RAW / ZSCORE / PERCENTILE / RANK / LOG / NORMALIZE. Unsafe maps
 * (zero std, non-positive log, zero range) are labelled with a KIDI wall and the
 * affected samples are sealed (NaN) rather than silently distorted.
 */
import type { AxisTransform, WallState } from "./coordinateTypes";

export interface MappedSeries {
  mapped: number[];
  wall: WallState | null;
  range: [number, number];
}

function mean(xs: number[]): number {
  let s = 0;
  let n = 0;
  for (const v of xs) if (Number.isFinite(v)) { s += v; n++; }
  return n ? s / n : 0;
}

function std(xs: number[], m: number): number {
  let s = 0;
  let n = 0;
  for (const v of xs) if (Number.isFinite(v)) { s += (v - m) ** 2; n++; }
  return n ? Math.sqrt(s / n) : 0;
}

function finiteExtent(xs: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of xs) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) return [0, 1];
  return [lo, hi];
}

export function transformSeries(series: number[], transform: AxisTransform): MappedSeries {
  const n = series.length;
  switch (transform) {
    case "RAW": {
      const mapped = series.slice();
      return { mapped, wall: null, range: finiteExtent(mapped) };
    }
    case "ZSCORE": {
      const m = mean(series);
      const sd = std(series, m);
      if (sd < 1e-12) {
        return { mapped: series.map(() => NaN), wall: "ROLLING_STD_ZERO_WALL", range: [-3, 3] };
      }
      const mapped = series.map((v) => (Number.isFinite(v) ? (v - m) / sd : NaN));
      return { mapped, wall: null, range: [-3, 3] };
    }
    case "NORMALIZE": {
      const [lo, hi] = finiteExtent(series);
      if (hi - lo < 1e-12) {
        return { mapped: series.map(() => NaN), wall: "KIDI_DIV_WALL", range: [0, 1] };
      }
      const mapped = series.map((v) => (Number.isFinite(v) ? (v - lo) / (hi - lo) : NaN));
      return { mapped, wall: null, range: [0, 1] };
    }
    case "LOG": {
      let wall: WallState | null = null;
      const mapped = series.map((v) => {
        if (!Number.isFinite(v) || v <= 0) { wall = "DOMAIN_WALL_LOG"; return NaN; }
        return Math.log(v);
      });
      return { mapped, wall, range: finiteExtent(mapped) };
    }
    case "RANK": {
      const idx = series.map((v, i) => [v, i] as [number, number]).filter(([v]) => Number.isFinite(v));
      idx.sort((a, b) => a[0] - b[0]);
      const mapped = new Array<number>(n).fill(NaN);
      idx.forEach(([, i], r) => { mapped[i] = idx.length > 1 ? r / (idx.length - 1) : 0; });
      return { mapped, wall: null, range: [0, 1] };
    }
    case "PERCENTILE": {
      const finite = series.filter(Number.isFinite).slice().sort((a, b) => a - b);
      const mapped = series.map((v) => {
        if (!Number.isFinite(v) || finite.length === 0) return NaN;
        let lo = 0;
        while (lo < finite.length && finite[lo] < v) lo++;
        return (lo / finite.length) * 100;
      });
      return { mapped, wall: null, range: [0, 100] };
    }
  }
}
