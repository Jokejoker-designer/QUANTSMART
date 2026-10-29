import { resizeCanvasBacking } from "../core/observeElementSize.ts";
import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import type { FormulaCoordinateResult } from "./core/coordinateTypes";
import { colorAt, normalizeZ } from "./core/colorScales";
import { marchingSquares, contourLevels } from "./core/contourMarchingSquares";
import {
  presetCamera,
  cameraPosition,
  clampElevation,
  type SphericalCamera,
  type CameraPreset,
} from "./core/camera";
import { surfaceRenderMode } from "./core/weightSweep";
import { niceTicks } from "./core/canvasCoords";
import { useElementSize } from "../core/useElementSize";

export interface SurfaceLayers {
  surface: boolean;
  contourFloor: boolean;
  samplePoints: boolean;
  slicePlane: boolean;
  extrema: boolean;
}

const S = 10; // half-extent in scene units
const SZ = 6;

// A camera-facing text label drawn from a canvas texture (no font dependency).
function makeTextSprite(text: string, color = "#9fb6cc", scale = 1): any {
  const pad = 8;
  const fontPx = 44;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontPx}px monospace`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontPx + pad * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${fontPx}px monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set((w / h) * 1.4 * scale, 1.4 * scale, 1);
  return spr;
}

export function SurfaceMap3D({
  result,
  preset,
  layers,
  selected,
  xLabel,
  yLabel,
}: {
  result: FormulaCoordinateResult;
  preset: CameraPreset;
  layers: SurfaceLayers;
  selected: { x: number; y: number } | null;
  xLabel: string;
  yLabel: string;
}) {
  // Self-measure the host so the renderer always fills it (no gray gaps, no
  // dependency on a parent size that can jitter while scrolling/zooming).
  const { ref: hostRef, size } = useElementSize<HTMLDivElement>();
  const sizeRef = useRef(size); sizeRef.current = size;
  const width = size.width;
  const height = size.height;
  const mountRef = useRef<HTMLDivElement>(null);
  const three = useRef<any>({});
  const cam = useRef<SphericalCamera>(presetCamera("iso", [0, 0, 0], 34));
  const [fallback, setFallback] = useState(false);
  const fallbackCanvas = useRef<HTMLCanvasElement>(null);

  // map grid coords → scene coords
  const g = result.responseGrid;
  const xMid = (g.xs[0] + g.xs[g.nx - 1]) / 2;
  const yMid = (g.ys[0] + g.ys[g.ny - 1]) / 2;
  const xHalf = (g.xs[g.nx - 1] - g.xs[0]) / 2 || 1;
  const yHalf = (g.ys[g.ny - 1] - g.ys[0]) / 2 || 1;
  // Unified Z range over BOTH the grid and the replay samples, so projected
  // sample points (evaluated at real per-bar values) never escape the box.
  let zLo = g.zMin;
  let zHi = g.zMax;
  for (const p of result.samplePoints) {
    if (Number.isFinite(p.z)) { if (p.z < zLo) zLo = p.z; if (p.z > zHi) zHi = p.z; }
  }
  const zMid = (zLo + zHi) / 2;
  const zHalf = (zHi - zLo) / 2 || 1;
  const clampS = (v: number) => Math.max(-S, Math.min(S, v));
  const mapX = (x: number) => clampS(((x - xMid) / xHalf) * S);
  const mapZ = (y: number) => clampS(((y - yMid) / yHalf) * S);
  // clamp to the box as a final guard (defensive against extreme outliers)
  const mapY = (z: number) => {
    if (!Number.isFinite(z)) return -SZ;
    return Math.max(-SZ, Math.min(SZ, ((z - zMid) / zHalf) * SZ));
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: any;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      if (!renderer.getContext || !renderer.getContext()) throw new Error("no ctx");
    } catch {
      setFallback(true);
      return;
    }
    const dpr = sizeRef.current.dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(sizeRef.current.width, sizeRef.current.height);
    renderer.setClearColor(0x0a121c, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    const groups: Record<string, any> = {};
    for (const k of ["surface", "contourFloor", "samplePoints", "slicePlane", "extrema", "axes"]) {
      groups[k] = new THREE.Group();
      scene.add(groups[k]);
    }
    three.current = { renderer, scene, camera, groups };
    buildScene();
    applyLayers();

    let dragging: "orbit" | "pan" | null = null;
    let lx = 0, ly = 0;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => { dragging = e.shiftKey || e.button === 2 ? "pan" : "orbit"; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); e.preventDefault(); };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      const c = cam.current;
      if (dragging === "orbit") { c.azimuth -= dx * 0.01; c.elevation = clampElevation(c.elevation + dy * 0.01); }
      else { const ps = c.radius * 0.0016; c.target = [c.target[0] - dx * ps, c.target[1] + dy * ps, c.target[2]]; }
    };
    const onUp = (e: PointerEvent) => { dragging = null; try { el.releasePointerCapture(e.pointerId); } catch {} };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.current.radius = Math.max(10, Math.min(90, cam.current.radius * (1 + Math.sign(e.deltaY) * 0.08))); };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    const onCtx = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", onCtx);

    let raf = 0;
    const loop = () => {
      const p = cameraPosition(cam.current);
      camera.position.set(p[0], p[1], p[2]);
      camera.lookAt(cam.current.target[0], cam.current.target[1], cam.current.target[2]);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onCtx);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      three.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rebuild when result changes
  useEffect(() => { if (three.current.scene) { buildScene(); applyLayers(); } if (fallback) drawFallback(); /* eslint-disable-next-line */ }, [result, selected]);
  useEffect(() => { const t = three.current; if (t.renderer) { t.renderer.setPixelRatio(size.dpr); t.renderer.setSize(sizeRef.current.width, sizeRef.current.height); t.camera.aspect = width / height; t.camera.updateProjectionMatrix(); } if (fallback) drawFallback(); /* eslint-disable-next-line */ }, [width, height, size.dpr, fallback]);
  useEffect(() => { applyLayers(); /* eslint-disable-next-line */ }, [layers]);
  useEffect(() => { cam.current = presetCamera(preset, [0, 0, 0], cam.current.radius); /* eslint-disable-next-line */ }, [preset]);

  function clear(grp: any) { while (grp.children.length) { const c = grp.children.pop(); c.geometry?.dispose?.(); c.material?.map?.dispose?.(); c.material?.dispose?.(); } }

  function buildScene() {
    const t = three.current;
    if (!t.scene) return;

    // surface mesh with vertex colors
    clear(t.groups.surface);
    const positions: number[] = [];
    const colors: number[] = [];
    for (let iy = 0; iy < g.ny; iy++) {
      for (let ix = 0; ix < g.nx; ix++) {
        const z = g.z[iy * g.nx + ix];
        positions.push(mapX(g.xs[ix]), mapY(z), mapZ(g.ys[iy]));
        const c = colorAt(normalizeZ(z, g.zMin, g.zMax));
        colors.push(c.r / 255, c.g / 255, c.b / 255);
      }
    }
    const indices: number[] = [];
    for (let iy = 0; iy < g.ny - 1; iy++) {
      for (let ix = 0; ix < g.nx - 1; ix++) {
        const a = iy * g.nx + ix, b = a + 1, c = a + g.nx, d = c + 1;
        indices.push(a, c, d, a, d, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    t.groups.surface.add(mesh);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x0a121c, transparent: true, opacity: 0.15 }));
    t.groups.surface.add(wire);

    // ---- fixed labelled axis frame (anchored coordinate system) ----
    clear(t.groups.axes);
    const box = new THREE.Box3(new THREE.Vector3(-S, -SZ, -S), new THREE.Vector3(S, SZ, S));
    t.groups.axes.add(new THREE.Box3Helper(box, new THREE.Color(0x22405a)));

    const line = (pts: number[], color: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    };
    // axis lines on the back-bottom edges: X (cyan), Z-depth=Y data (teal), Y-up=output (amber)
    t.groups.axes.add(line([-S, -SZ, -S, S, -SZ, -S], 0x34d3e0)); // X along front-bottom
    t.groups.axes.add(line([-S, -SZ, -S, -S, -SZ, S], 0x3fb6a8)); // data-Y along left-bottom
    t.groups.axes.add(line([-S, -SZ, -S, -S, SZ, -S], 0xe0ad4e)); // output along back-left vertical

    // ticks + numeric labels
    const tick = (pos: [number, number, number], txt: string, color: string) => {
      const s = makeTextSprite(txt, color, 0.62);
      s.position.set(pos[0], pos[1], pos[2]);
      t.groups.axes.add(s);
    };
    for (const tx of niceTicks(g.xs[0], g.xs[g.nx - 1], 6)) tick([mapX(tx), -SZ - 0.7, -S], tx.toFixed(1), "#7fb6d6");
    for (const ty of niceTicks(g.ys[0], g.ys[g.ny - 1], 6)) tick([-S, -SZ - 0.7, mapZ(ty)], ty.toFixed(0), "#6fc6b8");
    for (const tz of niceTicks(zLo, zHi, 5)) tick([-S - 0.9, mapY(tz), -S], tz.toFixed(1), "#e0ad4e");

    // axis titles
    const titleX = makeTextSprite(`X · ${xLabel}`, "#34d3e0", 0.9); titleX.position.set(0, -SZ - 1.9, -S); t.groups.axes.add(titleX);
    const titleY = makeTextSprite(`Y · ${yLabel}`, "#3fb6a8", 0.9); titleY.position.set(-S, -SZ - 1.9, 0); t.groups.axes.add(titleY);
    const titleZ = makeTextSprite("Z · output", "#e0ad4e", 0.9); titleZ.position.set(-S - 2.4, 0, -S); t.groups.axes.add(titleZ);

    // contour floor
    clear(t.groups.contourFloor);
    const fpts: number[] = [];
    for (const s of marchingSquares(g, contourLevels(g.zMin, g.zMax, 9))) {
      fpts.push(mapX(s.x1), -SZ, mapZ(s.y1), mapX(s.x2), -SZ, mapZ(s.y2));
    }
    if (fpts.length) {
      const fg = new THREE.BufferGeometry();
      fg.setAttribute("position", new THREE.Float32BufferAttribute(fpts, 3));
      t.groups.contourFloor.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: 0x4ad0e0, transparent: true, opacity: 0.5 })));
    }

    // sample points
    clear(t.groups.samplePoints);
    const spts: number[] = [];
    for (const p of result.samplePoints) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
      spts.push(mapX(p.x), mapY(p.z) + 0.05, mapZ(p.y));
    }
    if (spts.length) {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.Float32BufferAttribute(spts, 3));
      t.groups.samplePoints.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xcfe0f0, size: 0.18 })));
    }

    // extrema markers
    clear(t.groups.extrema);
    for (const e of result.geometrySummary.extrema) {
      const col = e.type.includes("MAX") ? 0xe8d260 : e.type.includes("MIN") ? 0x4aa3ff : 0xb070ff;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshBasicMaterial({ color: col }));
      m.position.set(mapX(e.x), mapY(e.z), mapZ(e.y));
      t.groups.extrema.add(m);
    }

    // slice plane at selected x
    clear(t.groups.slicePlane);
    if (selected) {
      const planeX = mapX(selected.x);
      const pg = new THREE.PlaneGeometry(2 * S, 2 * SZ);
      const pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x9a7ff0, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
      pm.rotation.y = Math.PI / 2;
      pm.position.set(planeX, 0, 0);
      t.groups.slicePlane.add(pm);
    }
  }

  function applyLayers() {
    const t = three.current;
    if (!t.groups) return;
    t.groups.surface.visible = layers.surface;
    t.groups.contourFloor.visible = layers.contourFloor;
    t.groups.samplePoints.visible = layers.samplePoints;
    t.groups.slicePlane.visible = layers.slicePlane;
    t.groups.extrema.visible = layers.extrema;
  }

  // ---- canvas fallback (isometric wireframe) ----
  function drawFallback() {
    const canvas = fallbackCanvas.current;
    if (!canvas) return;
    const dpr = sizeRef.current.dpr;
    resizeCanvasBacking(canvas, width, height, dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2, cy = height / 2 + 30, sc = Math.min(width, height) / (S * 3.2);
    const iso = (X: number, Y: number, Z: number) => ({ x: cx + (X - Z) * 0.7 * sc, y: cy + ((X + Z) * 0.35 - Y) * sc });
    const step = Math.max(1, Math.floor(g.nx / 36));
    ctx.lineWidth = 1;
    for (let iy = 0; iy < g.ny - step; iy += step) {
      for (let ix = 0; ix < g.nx - step; ix += step) {
        const z = g.z[iy * g.nx + ix];
        const a = iso(mapX(g.xs[ix]), mapY(z), mapZ(g.ys[iy]));
        const b = iso(mapX(g.xs[ix + step]), mapY(g.z[iy * g.nx + ix + step]), mapZ(g.ys[iy]));
        const c = iso(mapX(g.xs[ix]), mapY(g.z[(iy + step) * g.nx + ix]), mapZ(g.ys[iy + step]));
        const col = colorAt(normalizeZ(z, g.zMin, g.zMax));
        ctx.strokeStyle = `rgba(${col.r},${col.g},${col.b},0.8)`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
    }
    ctx.fillStyle = "#6f8197"; ctx.font = "11px monospace";
    ctx.fillText("Canvas projection fallback (WebGL unavailable)", 12, 18);
  }

  if (fallback) {
    return (
      <div ref={hostRef} className="fl-canvas-host">
        <div className="fl-fallback">
          <div>3D mode: <b>{surfaceRenderMode(false)}</b></div>
          <canvas ref={fallbackCanvas} style={{ width, height }} role="img" aria-label="3D surface canvas fallback" />
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="fl-canvas-host" style={{ position: "relative" }}>
      <div
        ref={mountRef}
        style={{ position: "absolute", inset: 0 }}
        role="img"
        aria-label="3D formula response surface. Drag to orbit, wheel to zoom."
      />
    </div>
  );
}
