import type { CurveAxisSource, CurveAxisMapping, CurveTransform } from "./core/curveTypes";

const TRANSFORMS: CurveTransform[] = ["RAW", "ZSCORE", "PERCENTILE", "RANK", "LOG", "NORMALIZE", "CLIP"];

// Axis Mapping panel — ONLY X and Y. There is intentionally no Z-axis here.
export function CurveAxisMappingPanel({
  sources, mapping, onMapping, onSwap,
}: {
  sources: CurveAxisSource[];
  mapping: CurveAxisMapping;
  onMapping: (patch: { axis: "x" | "y"; sourceId?: string; transform?: CurveTransform }) => void;
  onSwap: () => void;
}) {
  return (
    <div className="fl-section">
      <h4>Axis Mapping · X / Y only</h4>

      <div className="fl-field">
        <label>X-axis source</label>
        <select value={mapping.x.sourceId} onChange={(e) => onMapping({ axis: "x", sourceId: e.target.value })}>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
      </div>
      <div className="fl-field">
        <label>X transform</label>
        <select value={mapping.x.transform} onChange={(e) => onMapping({ axis: "x", transform: e.target.value as CurveTransform })}>
          {TRANSFORMS.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
        </select>
      </div>

      <div className="fl-field">
        <label>Y-axis source</label>
        <select value={mapping.y.sourceId} onChange={(e) => onMapping({ axis: "y", sourceId: e.target.value })}>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
      </div>
      <div className="fl-field">
        <label>Y transform</label>
        <select value={mapping.y.transform} onChange={(e) => onMapping({ axis: "y", transform: e.target.value as CurveTransform })}>
          {TRANSFORMS.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
        </select>
      </div>

      <div className="fl-presets">
        <button onClick={onSwap}>⇄ Swap Axes</button>
      </div>
      <div className="fl-note">No Z-axis · no heatmap · no surface in 2D Curve Mode.</div>
    </div>
  );
}

export function CurveSourcePanel({ sources, mapping }: { sources: CurveAxisSource[]; mapping: CurveAxisMapping }) {
  const groups: Record<string, CurveAxisSource[]> = {};
  for (const s of sources) {
    const g = s.layer === "FORMULA_OUTPUT" ? "Formula output" : s.semantic === "PRICE" || s.semantic === "CONTEXT" ? "Price & Context" : s.layer === "L1" ? "Price & Volume" : "Indicators / Custom";
    (groups[g] ??= []).push(s);
  }
  return (
    <div className="fl-section">
      <h4>Sources &amp; Variables</h4>
      {Object.entries(groups).map(([g, items]) => (
        <div key={g} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "var(--fl-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "4px 0" }}>{g}</div>
          {items.map((s) => {
            const onAxis = s.id === mapping.x.sourceId ? "X" : s.id === mapping.y.sourceId ? "Y" : "";
            return (
              <div key={s.id} className="fl-stat-row">
                <span className="k" title={`${s.layer} · range [${s.defaultRange[0]}, ${s.defaultRange[1]}]`}>
                  {s.safety.causalSafe ? "🔒 " : ""}{s.displayName}
                </span>
                <span className="v" style={{ color: onAxis ? "var(--fl-cyan)" : "var(--fl-muted)" }}>{onAxis || s.layer}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
