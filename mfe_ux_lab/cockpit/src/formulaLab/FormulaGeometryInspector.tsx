import type { FormulaCoordinateResult } from "./core/coordinateTypes";
import { cellGeometry } from "./core/finiteDifference";

function nearest(vals: number[], v: number): number {
  let b = 0, bd = Infinity;
  for (let i = 0; i < vals.length; i++) { const d = Math.abs(vals[i] - v); if (d < bd) { bd = d; b = i; } }
  return b;
}

function Row({ k, v }: { k: string; v: string | number }) {
  return <div className="fl-stat-row"><span className="k">{k}</span><span className="v">{v}</span></div>;
}

export function FormulaGeometryInspector({
  result,
  selected,
}: {
  result: FormulaCoordinateResult;
  selected: { x: number; y: number } | null;
}) {
  const g = result.responseGrid;
  const gm = result.geometrySummary;
  const ss = result.safetyStatus;

  let sel = null as null | { x: number; y: number; z: number; slope: number; curvature: number; gradient: number };
  if (selected) {
    const ix = nearest(g.xs, selected.x);
    const iy = nearest(g.ys, selected.y);
    const cg = cellGeometry(g, ix, iy);
    const z = g.z[iy * g.nx + ix];
    sel = { x: g.xs[ix], y: g.ys[iy], z, slope: cg.slope, curvature: cg.curvature, gradient: cg.gradient };
  }

  const fmt = (n: number | undefined) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(3));

  return (
    <>
      <div className="fl-section">
        <h4>Formula Geometry Inspector</h4>
        <div className="fl-presets" style={{ marginBottom: 8 }}>
          <span className={`chip ${ss.kidiSafe ? "pass" : "fail"}`}>{ss.kidiSafe ? "KIDI SAFE" : "KIDI FAIL"}</span>
          <span className={`chip ${ss.noLookaheadPass ? "pass" : "fail"}`}>NO-LOOKAHEAD {ss.noLookaheadPass ? "PASS" : "FAIL"}</span>
        </div>
        <div className="fl-presets" style={{ marginBottom: 8 }}>
          <span className={`chip ${ss.finiteOutputPass ? "pass" : "fail"}`}>FINITE {ss.finiteOutputPass ? "PASS" : "FAIL"}</span>
          <span className={`chip ${ss.approxSurface ? "warn" : "pass"}`}>{ss.approxSurface ? "APPROX SURFACE" : "EXACT SURFACE"}</span>
        </div>
      </div>

      <div className="fl-section">
        <h4>Selected point</h4>
        {sel ? (
          <>
            <Row k="X" v={fmt(sel.x)} />
            <Row k="Y" v={fmt(sel.y)} />
            <Row k="Z / output" v={fmt(sel.z)} />
            <Row k="slope |∇z|" v={fmt(sel.slope)} />
            <Row k="curvature" v={fmt(sel.curvature)} />
            <Row k="gradient" v={fmt(sel.gradient)} />
            <Row k="distance to origin" v={fmt(Math.hypot(sel.x, sel.y))} />
            <Row k="angle°" v={fmt((Math.atan2(sel.y, sel.x) * 180) / Math.PI)} />
          </>
        ) : (
          <div className="fl-note">Click the map to inspect a point.</div>
        )}
      </div>

      <div className="fl-section">
        <h4>Global geometry · approx</h4>
        <Row k="output range" v={`${fmt(gm.outputMin)} … ${fmt(gm.outputMax)}`} />
        <Row k="global max" v={gm.globalMax ? `(${fmt(gm.globalMax.x)}, ${fmt(gm.globalMax.y)}) → ${fmt(gm.globalMax.z)}` : "—"} />
        <Row k="global min" v={gm.globalMin ? `(${fmt(gm.globalMin.x)}, ${fmt(gm.globalMin.y)}) → ${fmt(gm.globalMin.z)}` : "—"} />
        <Row k="avg |slope|" v={fmt(gm.avgAbsSlope)} />
        <Row k="curvature mean" v={fmt(gm.curvatureMean)} />
        <Row k="flat-zone coverage" v={`${(gm.flatZoneCoverage * 100).toFixed(0)}%`} />
        <Row k="saturation coverage" v={`${(gm.saturationCoverage * 100).toFixed(0)}%`} />
        <Row k="singularity risk" v={gm.singularityRisk} />
        <Row k="discontinuity risk" v={gm.discontinuityRisk} />
        <Row k="extrapolation risk" v={gm.extrapolationRisk} />
      </div>

      <div className="fl-section">
        <h4>Regime notes</h4>
        <div className="fl-warn">Regime labels are heuristic geometry labels. They are not proven trading edge.</div>
        {ss.walls.length > 0 && (
          <div className="fl-note">Walls: {ss.walls.join(", ")}</div>
        )}
        {ss.notes.map((n, i) => <div className="fl-note" key={i}>• {n}</div>)}
        {!ss.exportable && <div className="fl-warn"> NON-exportable: not safe to render-as-valid or export.</div>}
      </div>
    </>
  );
}
