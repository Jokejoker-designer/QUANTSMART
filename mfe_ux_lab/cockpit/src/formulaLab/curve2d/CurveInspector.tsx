import { useState } from "react";
import type { CurveResult } from "./core/curveTypes";
import { CURVE_REGIONS, REGION_STYLE_COLOR, regionForPoint } from "./core/curveRegionRules";
import { slopeAt, curvatureAt, nearestCurveIndex } from "./core/curveGeometry";

function Row({ k, v }: { k: string; v: string | number }) {
  return <div className="fl-stat-row"><span className="k">{k}</span><span className="v">{v}</span></div>;
}
const f = (n: number | null | undefined, d = 3) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(d));

export function CurveInspector({
  result, selected,
}: {
  result: CurveResult;
  selected: { x: number; y: number } | null;
}) {
  const [tab, setTab] = useState<"geom" | "regimes" | "alerts">("geom");
  const gm = result.geometry;
  const i = selected ? nearestCurveIndex(result.curve, selected.x) : -1;
  const slope = i >= 0 ? slopeAt(result.curve, i) : 0;
  const curv = i >= 0 ? curvatureAt(result.curve, i) : 0;

  return (
    <>
      <div className="fl-section">
        <h4>Inspector — Selected Element</h4>
        <div className="fl-presets" style={{ marginBottom: 8 }}>
          {(["geom", "regimes", "alerts"] as const).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "geom" ? "Geometry" : t === "regimes" ? "Regimes" : "Alerts"}
            </button>
          ))}
        </div>
      </div>

      {tab === "geom" && (
        <>
          <div className="fl-section">
            <h4>Selected point</h4>
            {selected ? (
              <>
                <Row k="X" v={f(selected.x)} />
                <Row k="Y" v={f(selected.y)} />
                <Row k="slope" v={f(slope)} />
                <Row k="curvature" v={f(curv)} />
                <Row k="gradient" v={f(Math.abs(slope))} />
                <Row k="angle°" v={f((Math.atan2(selected.y, selected.x) * 180) / Math.PI, 1)} />
                <Row k="distance to origin" v={f(Math.hypot(selected.x, selected.y))} />
                <Row k="region" v={regionForPoint(selected.x, selected.y)} />
              </>
            ) : <div className="fl-note">Click the curve/sample to inspect.</div>}
          </div>
          <div className="fl-section">
            <h4>Shape metrics</h4>
            <Row k="output range" v={`${f(gm.outputRange[0])} … ${f(gm.outputRange[1])}`} />
            <Row k="max Y" v={f(gm.maxY)} />
            <Row k="min Y" v={f(gm.minY)} />
            <Row k="amplitude" v={f(gm.amplitude)} />
            <Row k="avg slope" v={f(gm.avgSlope)} />
            <Row k="curvature avg" v={f(gm.curvatureAvg)} />
            <Row k="symmetry" v={f(gm.symmetry, 2)} />
            <Row k="smoothness" v={f(gm.smoothness, 2)} />
            <Row k="R² fit" v={gm.rSquared == null ? "— (formula)" : f(gm.rSquared, 3)} />
            <Row k="zero crossings" v={gm.zeroCrossings.length} />
            <Row k="flat-zone" v={`${(gm.flatZoneCoverage * 100).toFixed(0)}%`} />
            <Row k="saturation" v={`${(gm.saturationCoverage * 100).toFixed(0)}%`} />
          </div>
        </>
      )}

      {tab === "regimes" && (
        <div className="fl-section">
          <h4>Context regions · not entry zones</h4>
          {CURVE_REGIONS.map((r) => (
            <div key={r.id} className="fl-stat-row">
              <span className="k"><span style={{ color: REGION_STYLE_COLOR[r.style] }}>{r.label}</span> · {r.condition}</span>
              <span className="v" style={{ fontSize: 10 }}>{r.description}</span>
            </div>
          ))}
          <div className="fl-warn">Safe/Caution/Risk = geometry region labels only. Not trading edge.</div>
        </div>
      )}

      {tab === "alerts" && (
        <div className="fl-section">
          <h4>Alerts · safety</h4>
          <div className="fl-presets" style={{ marginBottom: 8 }}>
            <span className={`chip ${result.safety.kidiSafe ? "pass" : "fail"}`}>{result.safety.kidiSafe ? "KIDI SAFE" : "KIDI FAIL"}</span>
            <span className={`chip ${result.safety.noLookaheadPass ? "pass" : "fail"}`}>NO-LOOKAHEAD {result.safety.noLookaheadPass ? "PASS" : "FAIL"}</span>
          </div>
          {gm.singularityRisk !== "LOW" && <div className="fl-warn">Singularity risk: {gm.singularityRisk}</div>}
          {gm.discontinuityRisk !== "LOW" && <div className="fl-warn">Discontinuity risk: {gm.discontinuityRisk}</div>}
          {result.safety.walls.length > 0 && <div className="fl-note">Walls: {result.safety.walls.join(", ")}</div>}
          {result.safety.notes.map((n, k) => <div className="fl-note" key={k}>• {n}</div>)}
          {!result.safety.exportable && <div className="fl-warn"> NON-exportable: not safe to render-as-valid or export.</div>}
        </div>
      )}
    </>
  );
}
