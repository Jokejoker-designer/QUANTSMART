// Surface3D — the QuantLab 3D Surface Lab renderer. Uses the vendored Three.js global (public/vendor/three.min.js)
// + the ported spherical orbit camera. The surface is the EMPIRICAL bin grid (mean formula score per (X,Y) cell) —
// height + colour = score, same honest data as the 2D heatmap (no extrapolation). Drag = rotate, wheel = zoom.
// Falls back to a readable message if WebGL/THREE is unavailable. Viz-only — no order/zone/signal.
import { useEffect, useRef, useState } from "react";
import { cameraPosition, clampElevation, presetCamera, type SphericalCamera, type CameraPreset } from "../lib/coord/camera.ts";
import { loadThreeGlobal } from "../lib/loadThreeGlobal.ts";

function heat(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, isFinite(t) ? t : 0));
  const s = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  const x = t * 4, i = Math.min(3, Math.floor(x)), f = x - i, a = s[i], b = s[i + 1];
  return [(a[0] + (b[0] - a[0]) * f) / 255, (a[1] + (b[1] - a[1]) * f) / 255, (a[2] + (b[2] - a[2]) * f) / 255];
}

export function Surface3D({ values, res, vmin, vmax, xLabel, yLabel, zLabel, preset, height = 320 }: { values: (number | null)[]; res: number; vmin: number; vmax: number; xLabel: string; yLabel: string; zLabel: string; preset: CameraPreset; height?: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [threeReady, setThreeReady] = useState(() => typeof window !== "undefined" && typeof window.THREE !== "undefined");
  const cam = useRef<SphericalCamera>(presetCamera("iso", [0, 1.4, 0], 17));

  useEffect(() => {
    if (threeReady) return;
    let active = true;
    loadThreeGlobal()
      .then(() => { if (active) { setErr(null); setThreeReady(true); } })
      .catch(() => { if (active) setErr("The local Three.js renderer could not be loaded."); });
    return () => { active = false; };
  }, [threeReady]);

  useEffect(() => { cam.current = presetCamera(preset, [0, 1.4, 0], cam.current.radius); }, [preset]);

  useEffect(() => {
    if (!threeReady) return;
    const el = mount.current; if (!el) return;
    if (typeof THREE === "undefined") { setErr("The local Three.js renderer has not loaded."); return; }
    let renderer: any, raf = 0;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setErr("WebGL is unavailable in this browser."); return; }
    const w0 = el.clientWidth || 560, h0 = el.clientHeight || height;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w0, h0); renderer.setClearColor(0x0b0f15, 1);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w0 / h0, 0.1, 200);

    // build the surface mesh from the bin grid
    const span = 10, hScale = 4.2, R = res, N = R * R;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const tOf = (v: number) => (v - vmin) / ((vmax - vmin) || 1);
    for (let cy = 0; cy < R; cy++) for (let cx = 0; cx < R; cx++) {
      const idx = cy * R + cx, v = values[idx]; const t = v == null ? 0 : tOf(v);
      pos[idx * 3] = (cx / (R - 1) - 0.5) * span; pos[idx * 3 + 1] = t * hScale; pos[idx * 3 + 2] = (cy / (R - 1) - 0.5) * span;
      const c = v == null ? [0.13, 0.16, 0.2] : heat(t); col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2];
    }
    const indices: number[] = [];
    for (let cy = 0; cy < R - 1; cy++) for (let cx = 0; cx < R - 1; cx++) {
      const a = cy * R + cx, b = a + 1, c = a + R, d = c + 1;
      if (values[a] == null || values[b] == null || values[c] == null || values[d] == null) continue;
      indices.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(indices); geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b0f15, wireframe: true, transparent: true, opacity: 0.18 })); scene.add(wire);
    // axes box
    const ax = new THREE.Box3(new THREE.Vector3(-span / 2, 0, -span / 2), new THREE.Vector3(span / 2, hScale, span / 2));
    scene.add(new THREE.Box3Helper(ax, new THREE.Color(0x2a3340)));

    const apply = () => { const p = cameraPosition(cam.current); camera.position.set(p[0], p[1], p[2]); camera.lookAt(cam.current.target[0], cam.current.target[1], cam.current.target[2]); };
    apply();
    const loop = () => { raf = requestAnimationFrame(loop); renderer.render(scene, camera); };
    loop();
    const ro = new ResizeObserver(() => { const w2 = el.clientWidth, h2 = el.clientHeight; if (w2 && h2) { renderer.setSize(w2, h2); camera.aspect = w2 / h2; camera.updateProjectionMatrix(); } });
    ro.observe(el);

    // interaction
    let dragging = false, lx = 0, ly = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const move = (e: PointerEvent) => { if (!dragging) return; cam.current.azimuth -= (e.clientX - lx) * 0.01; cam.current.elevation = clampElevation(cam.current.elevation + (e.clientY - ly) * 0.01); lx = e.clientX; ly = e.clientY; apply(); };
    const up = () => { dragging = false; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); cam.current.radius = Math.max(7, Math.min(48, cam.current.radius * (1 + e.deltaY * 0.0012))); apply(); };
    const cv = renderer.domElement as HTMLCanvasElement;
    cv.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); cv.addEventListener("wheel", wheel, { passive: false });

    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); cv.removeEventListener("wheel", wheel); geo.dispose(); renderer.dispose(); if (cv.parentNode) cv.parentNode.removeChild(cv); };
  }, [values, res, vmin, vmax, height, threeReady]);

  if (err) return <div style={{ height: "100%", minHeight: height, display: "flex", alignItems: "center", justifyContent: "center", color: "#e3b341", fontSize: 12, textAlign: "center", padding: 16 }}>⚠ {err}<br />The 3D surface requires WebGL. Use the 2D heatmap instead.</div>;
  if (!threeReady) return <div style={{ height: "100%", minHeight: height, display: "flex", alignItems: "center", justifyContent: "center", color: "#9fd0ff", fontSize: 12 }}>Loading 3D surface…</div>;
  return <div style={{ position: "relative", width: "100%", height: "100%" }}><div ref={mount} style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden", cursor: "grab" }} /><div style={{ position: "absolute", left: 8, top: 6, fontSize: 10, color: "#9fd0ff", pointerEvents: "none" }}>3D surface · Z={zLabel} · X={xLabel} · Y={yLabel} Drag to rotate; scroll to zoom</div></div>;
}
