import { useElementSize } from "../core/useElementSize.ts";
import { resizeCanvasBacking } from "../core/observeElementSize.ts";
import { useCallback, useEffect, useRef } from "react";
import type { ResponseGrid } from "./core/coordinateTypes";
import { zeroCrossings, curveDerivatives } from "./core/finiteDifference";

// Extract Z = f(X, fixedY) row nearest selected.y, and Z = f(fixedX, Y) col nearest selected.x.
function nearestIndex(vals: number[], v: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < vals.length; i++) {
    const d = Math.abs(vals[i] - v);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function SliceCanvas({ xs, zs, label, mark }: { xs: number[]; zs: number[]; label: string; mark?: number }) {
  const { ref, size } = useElementSize<HTMLCanvasElement>();
  const canvasNode = useRef<HTMLCanvasElement | null>(null);
  const bindCanvas = useCallback((node: HTMLCanvasElement | null) => { canvasNode.current = node; ref(node); }, [ref]);
  useEffect(() => {
    const canvas = canvasNode.current;
    if (!canvas) return;
    const W = size.width;
    const H = size.height;
    const dpr = size.dpr;
    resizeCanvasBacking(canvas, W, H, dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const finite = zs.filter(Number.isFinite);
    const zMin = Math.min(...finite, -0.01);
    const zMax = Math.max(...finite, 0.01);
    const xMin = xs[0], xMax = xs[xs.length - 1];
    const sx = (x: number) => 6 + ((x - xMin) / (xMax - xMin || 1)) * (W - 12);
    const sy = (z: number) => H - 16 - ((z - zMin) / (zMax - zMin || 1)) * (H - 24);

    // zero line
    if (zMin < 0 && zMax > 0) {
      ctx.strokeStyle = "rgba(120,140,160,0.4)"; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(6, sy(0)); ctx.lineTo(W - 6, sy(0)); ctx.stroke(); ctx.setLineDash([]);
    }
    // curve
    ctx.strokeStyle = "#34d3e0"; ctx.lineWidth = 1.6; ctx.beginPath();
    let started = false;
    for (let i = 0; i < xs.length; i++) {
      if (!Number.isFinite(zs[i])) { started = false; continue; }
      const X = sx(xs[i]), Y = sy(zs[i]);
      if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    // zero crossings
    ctx.fillStyle = "#e0ad4e";
    for (const zc of zeroCrossings(xs, zs)) { ctx.beginPath(); ctx.arc(sx(zc.x), sy(0), 2.5, 0, Math.PI * 2); ctx.fill(); }
    // selected marker
    if (mark != null) {
      const i = nearestIndex(xs, mark);
      if (Number.isFinite(zs[i])) { ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(sx(xs[i]), sy(zs[i]), 4, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = "#6f8197"; ctx.font = "10px monospace"; ctx.fillText(label, 6, 11);
  });
  return <canvas ref={bindCanvas} style={{ width: "100%", height: 120 }} />;
}

export function SlicePreview({ grid, selected }: { grid: ResponseGrid; selected: { x: number; y: number } | null }) {
  const yi = selected ? nearestIndex(grid.ys, selected.y) : Math.floor(grid.ny / 2);
  const xi = selected ? nearestIndex(grid.xs, selected.x) : Math.floor(grid.nx / 2);

  const rowZ: number[] = [];
  for (let ix = 0; ix < grid.nx; ix++) rowZ.push(grid.z[yi * grid.nx + ix]);
  const colZ: number[] = [];
  for (let iy = 0; iy < grid.ny; iy++) colZ.push(grid.z[iy * grid.nx + xi]);

  const dX = curveDerivatives(grid.xs, rowZ, selected ? nearestIndex(grid.xs, selected.x) : Math.floor(grid.nx / 2));

  return (
    <div style={{ display: "flex", gap: 14, height: "100%" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <SliceCanvas xs={grid.xs} zs={rowZ} label={`X slice @ Y=${grid.ys[yi].toFixed(2)}`} mark={selected?.x} />
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <SliceCanvas xs={grid.ys} zs={colZ} label={`Y slice @ X=${grid.xs[xi].toFixed(2)}`} mark={selected?.y} />
      </div>
      <div style={{ minWidth: 150, fontSize: 11, color: "#6f8197", alignSelf: "center", fontFamily: "var(--fl-mono)" }}>
        <div>slope (X): {dX.slope.toFixed(3)}</div>
        <div>curvature (X): {dX.curvature.toFixed(3)}</div>
        <div>zero-cross (X): {zeroCrossings(grid.xs, rowZ).length}</div>
        <div style={{ marginTop: 6, color: "#3fb6a8" }}>Dots = historical replay samples, not trade signals.</div>
      </div>
    </div>
  );
}
