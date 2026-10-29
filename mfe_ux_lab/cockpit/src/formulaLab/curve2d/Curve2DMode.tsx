import { useEffect, useMemo, useRef, useState } from "react";
import type { FormulaNode } from "../core/coordinateTypes";
import type { WeightEnv } from "../core/formulaSurfaceEvaluator";
import type { CurveAxisSource, CurveAxisMapping, CurveTransform } from "./core/curveTypes";
import { computeFormulaSeries, applyCurveTransform, defaultFormulaOutputSource, FORMULA_OUTPUT_ID } from "./core/curveBuild";
import { computeCurveResult } from "./core/curvePipeline";
import { CurveCanvas2D, type HoverInfo } from "./CurveCanvas2D";
import { CurveAxisMappingPanel, CurveSourcePanel } from "./CurveAxisMappingPanel";
import { CurveInspector } from "./CurveInspector";
import { CurveLegend } from "./CurveLegend";
import { CurveReplayScrub } from "./CurveReplayScrub";
import { WeightSweepPanel } from "../WeightSweepPanel";
import { weightContributions } from "../core/weightSweep";
import { buildDensityGrid, classifyDensity, densityCellAt, densityTotal } from "./core/densityGrid";
import { buildMarginalHistogram, binAt, totalCount } from "./core/marginalHistogram";

const MODE_BADGE: Record<string, string> = {
  EXACT_FORMULA_CURVE: "EXACT CURVE",
  APPROX_SLICE_CURVE: "APPROX SLICE",
  EMPIRICAL_REPLAY_CURVE: "EMPIRICAL CURVE",
};

export function Curve2DMode({
  variables, ast, weights, onWeight, timestamps, prices, selectedBarIndex,
}: {
  variables: CurveAxisSource[];
  ast: FormulaNode;
  weights: WeightEnv;
  onWeight?: (id: string, value: number) => void;
  timestamps: string[];
  prices?: number[];
  selectedBarIndex?: number;
}) {
  const formulaOutput = useMemo(
    () => defaultFormulaOutputSource(computeFormulaSeries(ast, variables, weights).series),
    [ast, variables, weights],
  );
  const sources = useMemo(() => [...variables, formulaOutput], [variables, formulaOutput]);

  const [mapping, setMapping] = useState<CurveAxisMapping>(() => {
    const x = variables[0];
    return {
      x: { sourceId: x.id, transform: "RAW", range: applyCurveTransform(x.series, "RAW").range },
      y: { sourceId: FORMULA_OUTPUT_ID, transform: "RAW", range: formulaOutput.defaultRange },
      curveMode: "APPROX_SLICE_CURVE",
    };
  });

  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [currentBar, setCurrentBar] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showRegions, setShowRegions] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showDensity, setShowDensity] = useState(false); // Density Heatmap OFF by default
  const [showXHist, setShowXHist] = useState(false);      // X marginal histogram OFF by default
  const [showYHist, setShowYHist] = useState(false);      // Y marginal histogram OFF by default
  const [showOOS, setShowOOS] = useState(false);          // Phase 4 — compare in-sample vs OOS distribution
  const [oosSplit, setOosSplit] = useState(0.7);          // in-sample fraction (causal: earlier bars = in-sample)
  const [binFilter, setBinFilter] = useState<{ axis: "x" | "y"; lo: number; hi: number } | null>(null);   // Phase 4 — click-a-bin filter

  const result = useMemo(
    () => computeCurveResult({ ast, variables, formulaOutput, weights, selectedBarIndex, timestamps, prices }, mapping),
    [ast, variables, formulaOutput, weights, selectedBarIndex, timestamps, prices, mapping],
  );

  const contributions = useMemo(() => {
    if (Object.keys(weights).length === 0) return [];
    const envs: Record<string, number>[] = [];
    const n = variables[0]?.series.length ?? 0;
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 48))) {
      const env: Record<string, number> = {};
      for (const v of variables) env[v.id] = v.series[i];
      envs.push(env);
    }
    return weightContributions(ast, envs, weights);
  }, [ast, variables, weights]);

  const densityGrid = useMemo(
    () => buildDensityGrid({
      points: result.samplePoints,
      xRange: mapping.x.range,
      yRange: mapping.y.range,
      cols: 32, rows: 24,
    }),
    [result.samplePoints, mapping.x.range, mapping.y.range],
  );
  // marginal histograms (1D X/Y sample density) — built only when toggled on. Phase 4: causal in-sample/OOS split
  // (earlier bars = in-sample, later = held-out OOS) so you can SEE distribution drift.
  const splitIdx = showOOS ? Math.floor(result.samplePoints.length * oosSplit) : result.samplePoints.length;
  const inPts = showOOS ? result.samplePoints.slice(0, splitIdx) : result.samplePoints;
  const oosPts = showOOS ? result.samplePoints.slice(splitIdx) : [];
  const xHist = showXHist ? buildMarginalHistogram(inPts.map((p) => p.x), mapping.x.range, 28) : null;
  const xHistOOS = showXHist && showOOS ? buildMarginalHistogram(oosPts.map((p) => p.x), mapping.x.range, 28) : null;
  const yHist = showYHist ? buildMarginalHistogram(inPts.map((p) => p.y), mapping.y.range, 24) : null;
  const yHistOOS = showYHist && showOOS ? buildMarginalHistogram(oosPts.map((p) => p.y), mapping.y.range, 24) : null;
  const xBin = (xHist && selected) ? binAt(xHist, selected.x) : null;
  const yBin = (yHist && selected) ? binAt(yHist, selected.y) : null;
  // Phase 4 — click a histogram bin to filter: highlight samples in range + dim the replay strip outside it
  function onBinClick(axis: "x" | "y", range: [number, number]) {
    setBinFilter((f) => (f && f.axis === axis && Math.abs(f.lo - range[0]) < 1e-9 && Math.abs(f.hi - range[1]) < 1e-9) ? null : { axis, lo: range[0], hi: range[1] });
  }
  const filterCount = binFilter ? result.samplePoints.filter((p) => { const v = binFilter.axis === "x" ? p.x : p.y; return Number.isFinite(v) && v >= binFilter.lo && v < binFilter.hi; }).length : 0;
  const densityCell = selected ? densityCellAt(densityGrid, selected.x, selected.y, mapping.x.range, mapping.y.range) : null;
  const densityStatus = densityCell ? classifyDensity(densityCell) : null;
  const densityCoverage = densityCell ? (densityCell.count / Math.max(densityTotal(densityGrid), 1)) * 100 : 0;

  // replay play loop
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) { if (timer.current) window.clearInterval(timer.current); return; }
    timer.current = window.setInterval(() => {
      setCurrentBar((c) => {
        const n = result.samplePoints.length;
        const next = (c ?? -1) + 1;
        return next >= n ? 0 : next;
      });
    }, 400 / speed);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, speed, result.samplePoints.length]);

  // when scrubbing, sync the selected point to the current sample
  useEffect(() => {
    if (currentBar == null) return;
    const p = result.samplePoints.find((s) => s.barIndex === currentBar);
    if (p) setSelected({ x: p.x, y: p.y });
  }, [currentBar, result.samplePoints]);

  function applyMapping(patch: { axis: "x" | "y"; sourceId?: string; transform?: CurveTransform }) {
    setMapping((m) => {
      const axis = { ...m[patch.axis] };
      if (patch.sourceId) axis.sourceId = patch.sourceId;
      if (patch.transform) axis.transform = patch.transform;
      const src = sources.find((s) => s.id === axis.sourceId);
      if (src) axis.range = applyCurveTransform(src.series, axis.transform).range;
      return { ...m, [patch.axis]: axis };
    });
  }
  function swap() {
    setMapping((m) => ({ ...m, x: m.y, y: m.x }));
  }

  const xSrc = sources.find((s) => s.id === mapping.x.sourceId);
  const ySrc = sources.find((s) => s.id === mapping.y.sourceId);
  const cursor = hover ?? (selected ? { ...selected, slope: 0, curvature: 0, angle: (Math.atan2(selected.y, selected.x) * 180) / Math.PI, distance: Math.hypot(selected.x, selected.y) } : null);

  return (
    <div className="fl-body">
      <aside className="fl-col fl-left">
        <CurveSourcePanel sources={sources} mapping={mapping} />
        <CurveAxisMappingPanel sources={sources} mapping={mapping} onMapping={applyMapping} onSwap={swap} />
        {onWeight && Object.keys(weights).length > 0 && (
          <WeightSweepPanel weights={weights} contributions={contributions} onWeight={onWeight} />
        )}
        <div className="fl-section">
          <h4>Layers / Overlays</h4>
          <label className="fl-toggle"><span>Region I–IV overlay</span>
            <input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} /></label>
          <label className="fl-toggle"><span>Density Heatmap</span>
            <input type="checkbox" checked={showDensity} onChange={(e) => setShowDensity(e.target.checked)} /></label>
          <label className="fl-toggle"><span>X marginal histogram</span>
            <input type="checkbox" checked={showXHist} onChange={(e) => setShowXHist(e.target.checked)} /></label>
          <label className="fl-toggle"><span>Y marginal histogram</span>
            <input type="checkbox" checked={showYHist} onChange={(e) => setShowYHist(e.target.checked)} /></label>
          <label className="fl-toggle"><span>Compare in-sample vs OOS</span>
            <input type="checkbox" checked={showOOS} onChange={(e) => setShowOOS(e.target.checked)} /></label>
          <label className="fl-toggle"><span>Snap to grid</span>
            <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} /></label>
          {(showXHist || showYHist) && (
            <>
              <div className="fl-note">Marginal histogram · sample density per X/Y bin · not formula output · not a signal. <b>Click a bin on the chart</b> to filter.</div>
              {binFilter && (
                <div className="fl-stat-row"><span className="k">bin filter</span>
                  <span className="v">{binFilter.axis.toUpperCase()} [{binFilter.lo.toFixed(2)}, {binFilter.hi.toFixed(2)}] · {filterCount} pts
                    <button className="fl-tab" style={{ marginLeft: 6, padding: "1px 6px" }} onClick={() => setBinFilter(null)}>✕</button></span></div>
              )}
              {showOOS && (
                <>
                  <div className="fl-slider"><span style={{ fontSize: 11, color: "var(--fl-muted)" }}>in-sample</span>
                    <input type="range" min={0.3} max={0.9} step={0.05} value={oosSplit} onChange={(e) => setOosSplit(Number(e.target.value))} />
                    <span className="val">{Math.round(oosSplit * 100)}%</span></div>
                  <div className="fl-note" style={{ display: "flex", gap: 12 }}>
                    <span style={{ color: "#34d3e0" }}>■ in-sample ({inPts.length})</span>
                    <span style={{ color: "#e0a24e" }}>■ OOS ({oosPts.length})</span>
                  </div>
                  <div className="fl-note">If OOS bars don't match in-sample, the input distribution drifted — the formula's "nice" region may be in-sample-only.</div>
                </>
              )}
              {xBin && <div className="fl-stat-row"><span className="k">X-bin samples</span><span className="v">{xBin.count}{xHist ? ` · ${((xBin.count / Math.max(1, totalCount(xHist))) * 100).toFixed(1)}%` : ""}</span></div>}
              {yBin && <div className="fl-stat-row"><span className="k">Y-bin samples</span><span className="v">{yBin.count}{yHist ? ` · ${((yBin.count / Math.max(1, totalCount(yHist))) * 100).toFixed(1)}%` : ""}</span></div>}
              {((xBin && xBin.count < 3) || (yBin && yBin.count < 3)) && <div className="fl-warn"> Low sample density near selected point — this curve region is under-observed.</div>}
            </>
          )}
          {showDensity && (
            <>
              <div className="fl-note">Density Heatmap · sample density only · not formula output.</div>
              {densityCell && (
                <>
                  <div className="fl-stat-row"><span className="k">local density</span><span className="v">{(densityCell.density).toFixed(2)}</span></div>
                  <div className="fl-stat-row"><span className="k">bin count</span><span className="v">{densityCell.count} samples</span></div>
                  <div className="fl-stat-row"><span className="k">region coverage</span><span className="v">{densityCoverage.toFixed(1)}%</span></div>
                  <div className="fl-stat-row"><span className="k">density status</span><span className="v">{densityStatus}</span></div>
                  {densityStatus === "LOW_SAMPLE" && (
                    <div className="fl-warn"> Low sample density near selected point. This region is under-observed.</div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      <section className="fl-center">
        <div className="fl-canvas-wrap">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div className="fl-note" style={{ margin: 0 }}>
              Coordinate Map · Y = {ySrc?.displayName ?? "?"} vs X = {xSrc?.displayName ?? "?"}
            </div>
            <span className={`chip ${result.curveMode === "EXACT_FORMULA_CURVE" ? "pass" : "warn"}`} style={{ marginLeft: "auto" }}>
              {MODE_BADGE[result.curveMode]}
            </span>
          </div>
          {result.curveMode === "APPROX_SLICE_CURVE" && <div className="fl-warn">APPROX SLICE · Non-X variables held fixed.</div>}
          {result.curveMode === "EMPIRICAL_REPLAY_CURVE" && <div className="fl-warn">EMPIRICAL CURVE · Replay samples only.</div>}
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <CurveCanvas2D
              result={result}
              xRange={mapping.x.range}
              yRange={mapping.y.range}
              xLabel={xSrc?.displayName ?? "X"}
              yLabel={ySrc?.displayName ?? "Y"}
              curveLabel={ySrc?.id === FORMULA_OUTPUT_ID ? "signal" : (ySrc?.displayName ?? "Y")}
              selected={selected}
              onSelect={(p) => { setSelected(p); }}
              onHover={setHover}
              currentBar={currentBar}
              showRegions={showRegions}
              snapToGrid={snapToGrid}
              densityGrid={densityGrid}
              showDensity={showDensity}
              xHistogram={xHist}
              yHistogram={yHist}
              xHistogramOOS={xHistOOS}
              yHistogramOOS={yHistOOS}
              binFilter={binFilter}
              onBinClick={onBinClick}
            />
          </div>
          {/* cursor status strip (like the reference) */}
          <div className="mono" style={{ display: "flex", gap: 20, fontSize: 11, color: "var(--fl-muted)", padding: "8px 2px 0" }}>
            <span>Cursor: (X: {cursor ? cursor.x.toFixed(2) : "—"}, Y: {cursor ? cursor.y.toFixed(2) : "—"})</span>
            <span>Slope: {cursor ? cursor.slope.toFixed(2) : "—"}</span>
            <span>Curvature: {cursor ? cursor.curvature.toFixed(2) : "—"}</span>
            <span>Angle: {cursor ? cursor.angle.toFixed(1) : "—"}°</span>
            <span>Distance to Origin: {cursor ? cursor.distance.toFixed(2) : "—"}</span>
          </div>
        </div>
        <div className="fl-bottom">
          <CurveReplayScrub
            samplePoints={result.samplePoints}
            current={currentBar}
            onCurrent={setCurrentBar}
            playing={playing}
            onPlaying={setPlaying}
            speed={speed}
            onSpeed={setSpeed}
            outputLabel={ySrc?.id === FORMULA_OUTPUT_ID ? "L3 formula output" : (ySrc?.displayName ?? "Y")}
            binFilter={binFilter}
          />
          <div className="fl-note" style={{ marginTop: 6, opacity: 0.8 }}>Replay bars and histograms visualize formula output and sample density only · no entry · no order.</div>
        </div>
      </section>

      <aside className="fl-col fl-right">
        <CurveInspector result={result} selected={selected} />
        <CurveLegend curveLabel={ySrc?.id === FORMULA_OUTPUT_ID ? "signal" : (ySrc?.displayName ?? "Y")} />
      </aside>
    </div>
  );
}
