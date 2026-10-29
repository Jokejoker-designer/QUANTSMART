/**
 * densityGrid.ts — Density Heatmap for 2D Curve Mode.
 *
 * Density = WHERE the real replay samples concentrate on the X/Y plane.
 * This is sample density only — NOT formula output, NOT a signal, NOT an
 * entry zone. The background color encodes count/density, nothing else.
 */
export type DensityNormalize = "LOCAL_MAX" | "TOTAL_SAMPLE";

export interface DensityConfig {
  enabled: boolean;
  cols: number;
  rows: number;
  opacity: number;
  normalize: DensityNormalize;
}

export interface DensityCell {
  xBin: number;
  yBin: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  count: number;
  density: number; // 0..1
}

export type DensityStatus = "LOW_SAMPLE" | "NORMAL" | "HIGH_CLUSTER";

export function buildDensityGrid(args: {
  points: Array<{ x: number; y: number }>;
  xRange: [number, number];
  yRange: [number, number];
  cols: number;
  rows: number;
  normalize?: DensityNormalize;
}): DensityCell[][] {
  const cols = Math.max(2, Math.floor(args.cols));
  const rows = Math.max(2, Math.floor(args.rows));
  const [xMin, xMax] = args.xRange;
  const [yMin, yMax] = args.yRange;
  const dx = (xMax - xMin) / cols || 1;
  const dy = (yMax - yMin) / rows || 1;

  const grid: DensityCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: DensityCell[] = [];
    for (let c = 0; c < cols; c++) {
      line.push({
        xBin: c, yBin: r,
        xMin: xMin + c * dx, xMax: xMin + (c + 1) * dx,
        yMin: yMin + r * dy, yMax: yMin + (r + 1) * dy,
        count: 0, density: 0,
      });
    }
    grid.push(line);
  }

  let total = 0;
  for (const p of args.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const cx = Math.floor(((p.x - xMin) / (xMax - xMin || 1)) * cols);
    const cy = Math.floor(((p.y - yMin) / (yMax - yMin || 1)) * rows);
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
    grid[cy][cx].count += 1;
    total += 1;
  }

  const maxCount = Math.max(...grid.flat().map((c) => c.count), 1);
  const denom = (args.normalize ?? "LOCAL_MAX") === "TOTAL_SAMPLE" ? Math.max(total, 1) : maxCount;
  for (const cell of grid.flat()) cell.density = cell.count / denom;
  return grid;
}

export function classifyDensity(cell: DensityCell): DensityStatus {
  if (cell.count < 5) return "LOW_SAMPLE";
  if (cell.density > 0.75) return "HIGH_CLUSTER";
  return "NORMAL";
}

export function densityCellAt(
  grid: DensityCell[][],
  x: number,
  y: number,
  xRange: [number, number],
  yRange: [number, number],
): DensityCell | null {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return null;
  const cx = Math.floor(((x - xRange[0]) / (xRange[1] - xRange[0] || 1)) * cols);
  const cy = Math.floor(((y - yRange[0]) / (yRange[1] - yRange[0] || 1)) * rows);
  if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return null;
  return grid[cy][cx];
}

/** Total samples placed in the grid (for region-coverage readout). */
export function densityTotal(grid: DensityCell[][]): number {
  let t = 0;
  for (const row of grid) for (const c of row) t += c.count;
  return t;
}
