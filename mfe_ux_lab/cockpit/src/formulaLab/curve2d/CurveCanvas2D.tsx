import { resizeCanvasBacking } from "../../core/observeElementSize.ts";
import { useEffect, useRef } from "react";
import { useElementSize } from "../../core/useElementSize";
import { makePlot, px, py, dataX, dataY, niceTicks, type Plot } from "../core/canvasCoords";
import type { CurveResult } from "./core/curveTypes";
import { CURVE_REGIONS, REGION_STYLE_COLOR } from "./core/curveRegionRules";
import { slopeAt, curvatureAt, nearestCurveIndex } from "./core/curveGeometry";
import type { DensityCell } from "./core/densityGrid";
import type { MarginalBin } from "./core/marginalHistogram";

export interface HoverInfo { x: number; y: number; slope: number; curvature: number; angle: number; distance: number; barIndex?: number; }

export function CurveCanvas2D({
  result, xRange, yRange, xLabel, yLabel, curveLabel,
  selected, onSelect, onHover, currentBar, showRegions, snapToGrid,
  densityGrid, showDensity, densityOpacity = 1, xHistogram, yHistogram,
  xHistogramOOS, yHistogramOOS, binFilter, onBinClick,
}: {
  result: CurveResult;
  xRange: [number, number];
  yRange: [number, number];
  xLabel: string;
  yLabel: string;
  curveLabel: string;
  selected: { x: number; y: number } | null;
  onSelect: (p: { x: number; y: number }) => void;
  onHover: (h: HoverInfo | null) => void;
  currentBar: number | null;
  showRegions: boolean;
  snapToGrid: boolean;
  densityGrid?: DensityCell[][];
  showDensity?: boolean;
  densityOpacity?: number;
  xHistogram?: MarginalBin[] | null;   // X-axis marginal density (overlay only · not output · not a signal)
  yHistogram?: MarginalBin[] | null;   // Y-axis marginal density
  xHistogramOOS?: MarginalBin[] | null;   // Phase 4 — OOS (held-out) X density overlaid for drift comparison
  yHistogramOOS?: MarginalBin[] | null;
  binFilter?: { axis: "x" | "y"; lo: number; hi: number } | null;   // Phase 4 — active bin filter
  onBinClick?: (axis: "x" | "y", range: [number, number]) => void;  // Phase 4 — click a histogram bin
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<Plot | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = size.dpr;
    resizeCanvasBacking(canvas, size.width, size.height, dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = size.width, H = size.height;
    const plot = makePlot(W, H, xRange, yRange, { l: 52, r: 20, t: 18, b: 40 });
    plotRef.current = plot;
    ctx.clearRect(0, 0, W, H);

    // Layer 2 — grid
    ctx.strokeStyle = "rgba(90,130,170,0.12)";
    ctx.lineWidth = 1;
    const xticks = niceTicks(xRange[0], xRange[1], 8);
    const yticks = niceTicks(yRange[0], yRange[1], 6);
    for (const t of xticks) { ctx.beginPath(); ctx.moveTo(px(plot, t), plot.pad.t); ctx.lineTo(px(plot, t), H - plot.pad.b); ctx.stroke(); }
    for (const t of yticks) { ctx.beginPath(); ctx.moveTo(plot.pad.l, py(plot, t)); ctx.lineTo(W - plot.pad.r, py(plot, t)); ctx.stroke(); }

    // Density Heatmap overlay — sample density only, NOT formula output.
    // Light, never obscures curve/dots. Drawn under regions & data.
    if (showDensity && densityGrid) {
      for (const row of densityGrid) {
        for (const cell of row) {
          if (cell.count === 0) continue;
          const alpha = (0.08 + 0.32 * cell.density) * densityOpacity;
          ctx.fillStyle = `rgba(0, 215, 255, ${alpha})`;
          const x0 = px(plot, cell.xMin), x1 = px(plot, cell.xMax);
          const y0 = py(plot, cell.yMax), y1 = py(plot, cell.yMin);
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
    }

    // Marginal histograms — 1D sample density along the X / Y axis. Faint overlay, drawn UNDER the curve/dots.
    // Density only (count of replay samples per bin) — NOT formula output, NOT a signal/zone.
    if (xHistogram && xHistogram.length) {
      const HH = 34, bottom = H - plot.pad.b;
      for (const b of xHistogram) { if (b.count === 0) continue; const x0 = px(plot, b.min), x1 = px(plot, b.max), h = b.density * HH; ctx.fillStyle = "rgba(0,215,255,0.18)"; ctx.fillRect(x0, bottom - h, Math.max(0.5, x1 - x0 - 0.4), h); }
      if (xHistogramOOS) for (const b of xHistogramOOS) { if (b.count === 0) continue; const x0 = px(plot, b.min), x1 = px(plot, b.max), h = b.density * HH; ctx.fillStyle = "rgba(224,162,78,0.34)"; ctx.fillRect(x0, bottom - h, Math.max(0.5, x1 - x0 - 0.4), h); }
      if (binFilter && binFilter.axis === "x") { const x0 = px(plot, binFilter.lo), x1 = px(plot, binFilter.hi); ctx.strokeStyle = "#34d3e0"; ctx.lineWidth = 1.2; ctx.strokeRect(x0, bottom - HH, x1 - x0, HH); }
    }
    if (yHistogram && yHistogram.length) {
      const HW = 34, left = plot.pad.l;
      for (const b of yHistogram) { if (b.count === 0) continue; const y0 = py(plot, b.max), y1 = py(plot, b.min), w = b.density * HW; ctx.fillStyle = "rgba(0,215,255,0.18)"; ctx.fillRect(left, y0, w, Math.max(0.5, y1 - y0 - 0.4)); }
      if (yHistogramOOS) for (const b of yHistogramOOS) { if (b.count === 0) continue; const y0 = py(plot, b.max), y1 = py(plot, b.min), w = b.density * HW; ctx.fillStyle = "rgba(224,162,78,0.34)"; ctx.fillRect(left, y0, w, Math.max(0.5, y1 - y0 - 0.4)); }
      if (binFilter && binFilter.axis === "y") { const y0 = py(plot, binFilter.hi), y1 = py(plot, binFilter.lo); ctx.strokeStyle = "#34d3e0"; ctx.lineWidth = 1.2; ctx.strokeRect(left, y0, HW, y1 - y0); }
    }

    // Layer 4 — region boxes + diagonal boundaries (drawn under data)
    const hasX0 = xRange[0] <= 0 && xRange[1] >= 0;
    const hasY0 = yRange[0] <= 0 && yRange[1] >= 0;
    if (showRegions && hasX0 && hasY0) {
      const X0 = px(plot, 0), Y0 = py(plot, 0);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      const corners = [
        [px(plot, xRange[1]), py(plot, yRange[1])],
        [px(plot, xRange[0]), py(plot, yRange[1])],
        [px(plot, xRange[0]), py(plot, yRange[0])],
        [px(plot, xRange[1]), py(plot, yRange[0])],
      ];
      const colors = ["#3fb6a8", "#e0ad4e", "#e0556a", "#e0ad4e"];
      corners.forEach((c, i) => { ctx.strokeStyle = colors[i] + "66"; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(c[0], c[1]); ctx.stroke(); });
      ctx.setLineDash([]);
      // region label boxes near each quadrant corner
      ctx.font = "11px monospace";
      const place = (r: typeof CURVE_REGIONS[number], cx: number, cy: number, anchorRight: boolean) => {
        const col = REGION_STYLE_COLOR[r.style];
        const bw = 150, bh = 40;
        const bx = anchorRight ? cx - bw - 8 : cx + 8;
        const by = cy < Y0 ? cy + 8 : cy - bh - 8;
        ctx.strokeStyle = col + "99"; ctx.fillStyle = col + "12";
        ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = col; ctx.fillText(r.label, bx + 8, by + 15);
        ctx.fillStyle = "#9fb6cc"; ctx.font = "10px monospace";
        ctx.fillText(r.description, bx + 8, by + 30); ctx.font = "11px monospace";
      };
      place(CURVE_REGIONS[0], px(plot, xRange[1]), py(plot, yRange[1]), true);
      place(CURVE_REGIONS[1], px(plot, xRange[0]), py(plot, yRange[1]), false);
      place(CURVE_REGIONS[2], px(plot, xRange[0]), py(plot, yRange[0]), false);
      place(CURVE_REGIONS[3], px(plot, xRange[1]), py(plot, yRange[0]), true);
    }

    // Layer 3 — axes through origin + ticks + numbers + labels
    ctx.fillStyle = "#6f8197"; ctx.font = "10px monospace";
    for (const t of xticks) ctx.fillText(t.toFixed(1), px(plot, t) - 8, H - plot.pad.b + 14);
    for (const t of yticks) ctx.fillText(t.toFixed(1), 6, py(plot, t) + 3);
    ctx.strokeStyle = "rgba(190,205,225,0.5)"; ctx.lineWidth = 1.4;
    if (hasX0) { const X0 = px(plot, 0); ctx.beginPath(); ctx.moveTo(X0, plot.pad.t); ctx.lineTo(X0, H - plot.pad.b); ctx.stroke(); }
    if (hasY0) { const Y0 = py(plot, 0); ctx.beginPath(); ctx.moveTo(plot.pad.l, Y0); ctx.lineTo(W - plot.pad.r, Y0); ctx.stroke(); }
    ctx.fillStyle = "#3fb6a8"; ctx.font = "11px monospace";
    ctx.fillText(`Y · ${yLabel}`, plot.pad.l + 2, plot.pad.t + 2);
    const xt = `X · ${xLabel}`;
    ctx.fillStyle = "#34d3e0";
    ctx.fillText(xt, W - plot.pad.r - ctx.measureText(xt).width, (hasY0 ? py(plot, 0) : H - plot.pad.b) - 6);

    // Layer 5 — replay sample dots (neutral gray; no output color-encoding). Phase 4: bin-filter highlights in-range.
    for (const p of result.samplePoints) {
      const isCurrent = currentBar != null && p.barIndex === currentBar;
      const v = binFilter ? (binFilter.axis === "x" ? p.x : p.y) : 0;
      const inFilter = !binFilter || (Number.isFinite(v) && v >= binFilter.lo && v < binFilter.hi);
      ctx.fillStyle = isCurrent ? "#34d3e0" : !binFilter ? "rgba(150,165,185,0.55)" : inFilter ? "rgba(52,211,224,0.85)" : "rgba(120,135,155,0.13)";
      ctx.beginPath(); ctx.arc(px(plot, p.x), py(plot, p.y), isCurrent ? 4 : (binFilter && inFilter ? 3 : 2.2), 0, Math.PI * 2); ctx.fill();
    }

    // Layer 6 — formula / empirical curve (cyan)
    ctx.strokeStyle = "#34d3e0"; ctx.lineWidth = 2; ctx.beginPath();
    let started = false;
    for (const p of result.curve) {
      if (!Number.isFinite(p.y)) { started = false; continue; }
      const X = px(plot, p.x), Y = py(plot, p.y);
      if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    // Layer 7 — zero crossings (yellow)
    ctx.fillStyle = "#f0c543";
    for (const z of result.zeroCrossings) {
      ctx.beginPath(); ctx.arc(px(plot, z.x), py(plot, z.y), 4, 0, Math.PI * 2); ctx.fill();
    }

    // Layer 8 — selected point + callout
    if (selected) {
      const i = nearestCurveIndex(result.curve, selected.x);
      const cp = result.curve[i];
      const sx = px(plot, selected.x), sy = py(plot, selected.y);
      ctx.fillStyle = "#34d3e0"; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.stroke();
      const s = cp ? slopeAt(result.curve, i) : 0;
      const tag = `(${selected.x.toFixed(2)}, ${selected.y.toFixed(2)})  Slope: ${s.toFixed(2)}`;
      ctx.font = "10px monospace"; const tw = ctx.measureText(tag).width + 12;
      ctx.fillStyle = "rgba(10,18,28,0.9)"; ctx.strokeStyle = "rgba(52,211,224,0.5)";
      ctx.fillRect(sx + 10, sy - 26, tw, 18); ctx.strokeRect(sx + 10, sy - 26, tw, 18);
      ctx.fillStyle = "#cfe0f0"; ctx.fillText(tag, sx + 16, sy - 14);
    }

    // (legend moved to the right inspector panel — see CurveLegend)

    // minimap (bottom-right)
    const mmW = 110, mmH = 50, mmX = W - plot.pad.r - mmW, mmY = H - plot.pad.b - mmH - 4;
    ctx.fillStyle = "rgba(8,14,22,0.7)"; ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = "rgba(90,130,170,0.25)"; ctx.strokeRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = "#34d3e0"; ctx.lineWidth = 1; ctx.beginPath();
    const fin2 = result.curve.filter((p) => Number.isFinite(p.y));
    const yyMin = Math.min(...fin2.map((p) => p.y), -0.01), yyMax = Math.max(...fin2.map((p) => p.y), 0.01);
    let st = false;
    for (const p of result.curve) {
      if (!Number.isFinite(p.y)) { st = false; continue; }
      const X = mmX + ((p.x - xRange[0]) / (xRange[1] - xRange[0] || 1)) * mmW;
      const Y = mmY + mmH - ((p.y - yyMin) / (yyMax - yyMin || 1)) * mmH;
      if (!st) { ctx.moveTo(X, Y); st = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  }, [result, xRange, yRange, selected, size, xLabel, yLabel, curveLabel, currentBar, showRegions, showDensity, densityGrid, densityOpacity, xHistogram, yHistogram, xHistogramOOS, yHistogramOOS, binFilter]);

  function toData(e: React.MouseEvent) {
    const plot = plotRef.current; const canvas = canvasRef.current;
    if (!plot || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let x = dataX(plot, e.clientX - rect.left), y = dataY(plot, e.clientY - rect.top);
    if (snapToGrid) {
      const tx = niceTicks(xRange[0], xRange[1], 8); const ty = niceTicks(yRange[0], yRange[1], 6);
      const step = (arr: number[]) => (arr.length > 1 ? arr[1] - arr[0] : 1);
      x = Math.round(x / step(tx)) * step(tx); y = Math.round(y / step(ty)) * step(ty);
    }
    return { x, y };
  }

  return (
    <div
      ref={ref}
      className="fl-canvas-host"
      onClick={(e) => {
        const plot = plotRef.current, canvas = canvasRef.current;
        if (plot && canvas && onBinClick) {   // Phase 4 — click inside a histogram strip picks a bin (else select a point)
          const rect = canvas.getBoundingClientRect();
          const pxx = e.clientX - rect.left, pyy = e.clientY - rect.top, Hh = size.height;
          if (xHistogram && pyy >= Hh - plot.pad.b - 34 && pyy <= Hh - plot.pad.b) {
            const dx = dataX(plot, pxx); const b = xHistogram.find((bn) => dx >= bn.min && dx < bn.max);
            if (b) { onBinClick("x", [b.min, b.max]); return; }
          }
          if (yHistogram && pxx >= plot.pad.l && pxx <= plot.pad.l + 34) {
            const dy = dataY(plot, pyy); const b = yHistogram.find((bn) => dy >= bn.min && dy < bn.max);
            if (b) { onBinClick("y", [b.min, b.max]); return; }
          }
        }
        const d = toData(e); if (d) onSelect(d);
      }}
      onMouseMove={(e) => {
        const d = toData(e); if (!d) return;
        const i = nearestCurveIndex(result.curve, d.x);
        onHover({
          x: d.x, y: d.y,
          slope: slopeAt(result.curve, i),
          curvature: curvatureAt(result.curve, i),
          angle: (Math.atan2(d.y, d.x) * 180) / Math.PI,
          distance: Math.hypot(d.x, d.y),
        });
      }}
      onMouseLeave={() => onHover(null)}
    >
      <canvas ref={canvasRef} role="img" aria-label={`Coordinate curve: ${yLabel} vs ${xLabel}`} />
    </div>
  );
}
