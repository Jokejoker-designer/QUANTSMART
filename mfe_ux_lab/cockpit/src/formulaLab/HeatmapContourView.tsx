import { resizeCanvasBacking } from "../core/observeElementSize.ts";
import { useEffect, useRef } from "react";
import type { FormulaCoordinateResult, AxisSelection } from "./core/coordinateTypes";
import { useElementSize } from "../core/useElementSize";
import { makePlot, px, py, niceTicks } from "./core/canvasCoords";
import { colorForZ } from "./core/colorScales";
import { marchingSquares, contourLevels } from "./core/contourMarchingSquares";

export function HeatmapContourView({
  result,
  axis,
  opacity,
  showContours,
  showGrid,
  showSamples = false,
  showZeroContour = true,
}: {
  result: FormulaCoordinateResult;
  axis: AxisSelection;
  opacity: number;
  showContours: boolean;
  showGrid: boolean;
  showSamples?: boolean;
  showZeroContour?: boolean;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = size.dpr;
    resizeCanvasBacking(canvas, size.width, size.height, dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = result.responseGrid;
    const plot = makePlot(size.width, size.height, axis.xRange, axis.yRange);
    ctx.clearRect(0, 0, size.width, size.height);

    const cw = (px(plot, g.xs[1] ?? g.xs[0] + 1) - px(plot, g.xs[0])) + 1.5;
    const ch = (py(plot, g.ys[0]) - py(plot, g.ys[1] ?? g.ys[0] + 1)) + 1.5;
    for (let iy = 0; iy < g.ny; iy++) {
      for (let ix = 0; ix < g.nx; ix++) {
        ctx.fillStyle = colorForZ(g.z[iy * g.nx + ix], g.zMin, g.zMax, opacity);
        ctx.fillRect(px(plot, g.xs[ix]) - cw / 2, py(plot, g.ys[iy]) - ch / 2, cw, ch);
      }
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(90,130,170,0.14)";
      ctx.lineWidth = 1;
      for (const t of niceTicks(axis.xRange[0], axis.xRange[1])) {
        const X = px(plot, t); ctx.beginPath(); ctx.moveTo(X, plot.pad.t); ctx.lineTo(X, size.height - plot.pad.b); ctx.stroke();
      }
      for (const t of niceTicks(axis.yRange[0], axis.yRange[1])) {
        const Y = py(plot, t); ctx.beginPath(); ctx.moveTo(plot.pad.l, Y); ctx.lineTo(size.width - plot.pad.r, Y); ctx.stroke();
      }
    }

    if (showContours) {
      ctx.strokeStyle = "rgba(220,235,250,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const s of marchingSquares(g, contourLevels(g.zMin, g.zMax, 9))) {
        ctx.moveTo(px(plot, s.x1), py(plot, s.y1));
        ctx.lineTo(px(plot, s.x2), py(plot, s.y2));
      }
      ctx.stroke();
    }

    // zero-output contour (Z = 0) — highlighted, the boundary of sign change
    if (showZeroContour && g.zMin < 0 && g.zMax > 0) {
      ctx.strokeStyle = "#f0c543";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const s of marchingSquares(g, [0])) {
        ctx.moveTo(px(plot, s.x1), py(plot, s.y1));
        ctx.lineTo(px(plot, s.x2), py(plot, s.y2));
      }
      ctx.stroke();
    }

    // replay sample dots — historical samples, NOT trade entries (neutral gray)
    if (showSamples) {
      ctx.fillStyle = "rgba(220,228,238,0.55)";
      for (const p of result.samplePoints) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        ctx.beginPath(); ctx.arc(px(plot, p.x), py(plot, p.y), 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.fillStyle = "#6f8197";
    ctx.font = "10px monospace";
    for (const t of niceTicks(axis.xRange[0], axis.xRange[1])) ctx.fillText(t.toFixed(1), px(plot, t) - 8, size.height - plot.pad.b + 14);
    for (const t of niceTicks(axis.yRange[0], axis.yRange[1])) ctx.fillText(t.toFixed(1), 6, py(plot, t) + 3);
  }, [result, axis, opacity, showContours, showGrid, showSamples, showZeroContour, size]);

  return (
    <div ref={ref} className="fl-canvas-host">
      <canvas ref={canvasRef} role="img" aria-label="Formula output heatmap (top view)" />
    </div>
  );
}
