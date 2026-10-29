/** canvasCoords.ts — pure pixel/data coordinate mapping for the 2D canvases. */
export interface Plot {
  w: number;
  h: number;
  pad: { l: number; r: number; t: number; b: number };
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function makePlot(
  w: number,
  h: number,
  xRange: [number, number],
  yRange: [number, number],
  pad = { l: 48, r: 16, t: 16, b: 36 },
): Plot {
  return { w, h, pad, xMin: xRange[0], xMax: xRange[1], yMin: yRange[0], yMax: yRange[1] };
}

export function px(p: Plot, x: number): number {
  const span = p.xMax - p.xMin || 1;
  return p.pad.l + ((x - p.xMin) / span) * (p.w - p.pad.l - p.pad.r);
}
export function py(p: Plot, y: number): number {
  const span = p.yMax - p.yMin || 1;
  return p.h - p.pad.b - ((y - p.yMin) / span) * (p.h - p.pad.t - p.pad.b);
}
/** inverse: pixel → data */
export function dataX(p: Plot, sx: number): number {
  const span = p.xMax - p.xMin || 1;
  return p.xMin + ((sx - p.pad.l) / (p.w - p.pad.l - p.pad.r)) * span;
}
export function dataY(p: Plot, sy: number): number {
  const span = p.yMax - p.yMin || 1;
  return p.yMin + ((p.h - p.pad.b - sy) / (p.h - p.pad.t - p.pad.b)) * span;
}

export function niceTicks(min: number, max: number, count = 6): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let t = start; t <= max + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}
