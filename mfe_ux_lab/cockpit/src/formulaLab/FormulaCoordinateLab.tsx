import { lazy, Suspense, useMemo, useState } from "react";
import "./formulaLab.css";
import { useElementSize } from "../core/useElementSize";
import type { AxisSelection, FormulaCoordinateInput } from "./core/coordinateTypes";
import { makeDemoInput } from "./core/demoFormula";
import { computeFormulaCoordinateResult } from "./core/formulaCoordinatePipeline";
import { collectWeights } from "./core/formulaSurfaceEvaluator";
import { weightContributions } from "./core/weightSweep";
import { transformSeries } from "./core/axisMapping";
import type { CameraPreset } from "./core/camera";
import { HeatmapContourView } from "./HeatmapContourView";
import type { SurfaceLayers } from "./SurfaceMap3D";
import { SlicePreview } from "./SlicePreview";
import { FormulaGeometryInspector } from "./FormulaGeometryInspector";
import { VariableAxisPanel } from "./VariableAxisPanel";
import { LayerTogglePanel } from "./LayerTogglePanel";
import { WeightSweepPanel } from "./WeightSweepPanel";
import { Curve2DMode } from "./curve2d/Curve2DMode";
import type { CurveAxisSource } from "./curve2d/core/curveTypes";

// Three.js is 85% of the former Coordinate Lab chunk. Load the renderer only
// after the user selects 3D; 2D Curve and Heatmap stay lightweight.
const SurfaceMap3D = lazy(() => import("./SurfaceMap3D").then((m) => ({ default: m.SurfaceMap3D })));

type View = "2d" | "3d" | "heatmap";
const PRESETS: CameraPreset[] = ["iso", "front", "top", "side"];

export function FormulaCoordinateLab({ input: inputProp }: { input?: FormulaCoordinateInput } = {}) {
  const input = useMemo(() => inputProp ?? makeDemoInput(), [inputProp]);
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(collectWeights(input.formulaAst)),
  );
  const [gridN, setGridN] = useState(41);
  const [view, setView] = useState<View>("2d");
  const [preset, setPreset] = useState<CameraPreset>("iso");
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [colorByRegime, setColorByRegime] = useState(false);
  const [opacity, setOpacity] = useState(0.92);

  const [axisBase, setAxisBase] = useState<Omit<AxisSelection, "nx" | "ny">>(() => {
    const v0 = input.variables[0], v1 = input.variables[1] ?? input.variables[0];
    const rng = (v?: typeof v0): [number, number] => (v ? transformSeries(v.series, v.defaultTransform).range : [-1, 1]);
    return {
      xVarId: v0?.id ?? "x", yVarId: v1?.id ?? "y",
      xTransform: v0?.defaultTransform ?? "RAW", yTransform: v1?.defaultTransform ?? "RAW",
      xRange: rng(v0), yRange: rng(v1),
    };
  });
  const axis: AxisSelection = { ...axisBase, nx: gridN, ny: gridN };

  // Keep axis transform + range consistent with the selected variable so the
  // mapped sample series always lands inside the plotted range (no fly-out).
  function applyAxisPatch(patch: Partial<AxisSelection>) {
    setAxisBase((a) => {
      const next = { ...a, ...patch };
      const xv = input.variables.find((v) => v.id === next.xVarId);
      const yv = input.variables.find((v) => v.id === next.yVarId);
      // adopt the variable's default transform when the variable changes
      if (patch.xVarId && !patch.xTransform && xv) next.xTransform = xv.defaultTransform;
      if (patch.yVarId && !patch.yTransform && yv) next.yTransform = yv.defaultTransform;
      // derive the range from the (variable, transform) pair unless the user typed one
      if ((patch.xVarId || patch.xTransform) && xv && !patch.xRange) {
        next.xRange = transformSeries(xv.series, next.xTransform).range;
      }
      if ((patch.yVarId || patch.yTransform) && yv && !patch.yRange) {
        next.yRange = transformSeries(yv.series, next.yTransform).range;
      }
      return next;
    });
  }

  const [surfaceLayers, setSurfaceLayers] = useState<SurfaceLayers>({
    surface: true, contourFloor: true, samplePoints: true, slicePlane: true, extrema: true,
  });
  const [heatGrid, setHeatGrid] = useState(true);
  const [heatContours, setHeatContours] = useState(true);
  const [heatSamples, setHeatSamples] = useState(false);
  const [heatZero, setHeatZero] = useState(true);

  const result = useMemo(
    () => computeFormulaCoordinateResult(input, axis, weights),
    [input, axis, weights],
  );

  const contributions = useMemo(() => {
    const envs: Record<string, number>[] = [];
    const n = input.variables[0]?.series.length ?? 0;
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 48))) {
      const env: Record<string, number> = {};
      for (const v of input.variables) env[v.id] = v.series[i];
      envs.push(env);
    }
    return weightContributions(input.formulaAst, envs, weights);
  }, [input, weights]);

  const { ref: areaRef, size: areaSize } = useElementSize<HTMLDivElement>();
  const ss = result.safetyStatus;
  const xLabel = input.variables.find((v) => v.id === axis.xVarId)?.displayName ?? axis.xVarId;
  const yLabel = input.variables.find((v) => v.id === axis.yVarId)?.displayName ?? axis.yVarId;

  // VariableSpec → CurveAxisSource for the 2D Curve Mode (X/Y only).
  const curveSources: CurveAxisSource[] = useMemo(
    () => input.variables.map((v) => ({
      id: v.id,
      displayName: v.displayName,
      layer: v.layer,
      series: v.series,
      defaultRange: v.defaultRange,
      defaultTransform: v.defaultTransform,
      semantic: v.semantic ?? "CONTEXT",
      safety: { causalSafe: v.safety.causalSafe, noLookahead: v.safety.noLookahead, finite: v.safety.finite },
    })),
    [input],
  );

  return (
    <div className="fl-root">
      <header className="fl-header">
        <div className="fl-brand"><b>QUANTSMART</b> · Coordinate Lab</div>
        <div className="fl-tabs">
          {(["2d", "3d", "heatmap"] as View[]).map((v) => (
            <button key={v} className={`fl-tab ${view === v ? "active" : ""}`} onClick={() => setView(v)}>
              {v === "2d" ? "2D Curve" : v === "3d" ? "3D Surface Lab" : "Heatmap / Contour"}
            </button>
          ))}
        </div>
        <div className="fl-badges">
          <span className="chip advisory">ADVISORY ONLY</span>
          <span className="chip noorder">NO ORDER SEND</span>
          <span className="chip shadow">SHADOW ONLY</span>
          <span className={`chip ${ss.kidiSafe ? "pass" : "fail"}`}>{ss.kidiSafe ? "KIDI SAFE" : "KIDI FAIL"}</span>
          <span className={`chip ${ss.noLookaheadPass ? "pass" : "fail"}`}>NO-LOOKAHEAD {ss.noLookaheadPass ? "PASS" : "FAIL"}</span>
        </div>
      </header>

      {view === "2d" ? (
        <Curve2DMode
          variables={curveSources}
          ast={input.formulaAst}
          weights={weights}
          onWeight={(id, value) => setWeights((w) => ({ ...w, [id]: value }))}
          timestamps={input.replayBars?.map((b) => b.timestamp) ?? []}
          selectedBarIndex={input.selectedBarIndex}
        />
      ) : (
      <div className="fl-body">
        <aside className="fl-col fl-left">
          <VariableAxisPanel
            variables={input.variables}
            axis={axis}
            onAxis={applyAxisPatch}
            gridN={gridN}
            onGridN={setGridN}
            formulaText={input.formulaText}
          />
          <WeightSweepPanel
            weights={weights}
            contributions={contributions}
            onWeight={(id, value) => setWeights((w) => ({ ...w, [id]: value }))}
          />
          {view === "3d" && (
            <LayerTogglePanel
              title="Layers &amp; Overlays"
              items={[
                { id: "surface", label: "Surface", on: surfaceLayers.surface },
                { id: "contourFloor", label: "Contour projection", on: surfaceLayers.contourFloor },
                { id: "samplePoints", label: "Sample points", on: surfaceLayers.samplePoints },
                { id: "slicePlane", label: "Slice plane", on: surfaceLayers.slicePlane },
                { id: "extrema", label: "Extrema markers", on: surfaceLayers.extrema },
              ]}
              onToggle={(id, on) => setSurfaceLayers((l) => ({ ...l, [id]: on }))}
            />
          )}
          {view === "heatmap" && (
            <LayerTogglePanel
              title="Layers &amp; Overlays"
              items={[
                { id: "contours", label: "Contour lines", on: heatContours },
                { id: "zero", label: "Zero-output contour", on: heatZero },
                { id: "samples", label: "Replay sample dots", on: heatSamples },
                { id: "grid", label: "Grid lines", on: heatGrid },
              ]}
              onToggle={(id, on) => {
                if (id === "contours") setHeatContours(on);
                else if (id === "zero") setHeatZero(on);
                else if (id === "samples") setHeatSamples(on);
                else setHeatGrid(on);
              }}
            />
          )}
          {view === "heatmap" && (
            <div className="fl-slider"><span style={{ fontSize: 11, color: "var(--fl-muted)" }}>opacity</span>
              <input type="range" min={0.2} max={1} step={0.02} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
              <span className="val">{opacity.toFixed(2)}</span></div>
          )}
        </aside>

        <section className="fl-center">
          <div className="fl-canvas-wrap">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div className="fl-note" style={{ margin: 0 }}>
                {view === "3d" ? "3D response surface · modeled output · no entry · no order"
                  : "Formula output heatmap · not entry zone · advisory only"}
              </div>
              {view === "heatmap" && (
                <span className={`chip ${result.responseGrid.approx ? "warn" : "pass"}`} style={{ marginLeft: "auto" }}>
                  {result.responseGrid.approx ? "APPROX HEATMAP" : "EXACT HEATMAP"}
                </span>
              )}
              {view === "3d" && (
                <div className="fl-presets" style={{ marginLeft: "auto" }}>
                  {PRESETS.map((p) => (
                    <button key={p} className={preset === p ? "active" : ""} onClick={() => setPreset(p)}>{p.toUpperCase()}</button>
                  ))}
                </div>
              )}
            </div>
            {ss.approxSurface && (
              <div className="fl-warn"> Approx surface: rolling/time-series formula. Non-axis variables are held at selected bar / median / preset.</div>
            )}
            <div ref={areaRef} style={{ flex: 1, display: "flex", minHeight: 0 }}>
              {view === "heatmap" && (
                <HeatmapContourView result={result} axis={axis} opacity={opacity} showContours={heatContours}
                  showGrid={heatGrid} showSamples={heatSamples} showZeroContour={heatZero} />
              )}
              {view === "3d" && (
                <Suspense fallback={<div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--fl-muted)", fontSize: 12 }}>Loading 3D renderer…</div>}>
                  <SurfaceMap3D result={result} preset={preset} layers={surfaceLayers}
                    selected={selected} xLabel={xLabel} yLabel={yLabel} />
                </Suspense>
              )}
            </div>
          </div>
          <div className="fl-bottom">
            <div className="fl-note" style={{ marginTop: 0 }}>Slice &amp; Projection Previews — Dots = historical replay samples, not trade signals.</div>
            <div style={{ height: 118 }}>
              <SlicePreview grid={result.responseGrid} selected={selected} />
            </div>
          </div>
        </section>

        <aside className="fl-col fl-right">
          <FormulaGeometryInspector result={result} selected={selected} />
        </aside>
      </div>
      )}

      <footer className="fl-footer">
        Coordinate / Surface exploration for modeled formulas only · no entry · no order.
      </footer>
    </div>
  );
}
