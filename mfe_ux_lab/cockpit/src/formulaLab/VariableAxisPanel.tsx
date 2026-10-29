import type { AxisSelection, AxisTransform, VariableSpec } from "./core/coordinateTypes";

const TRANSFORMS: AxisTransform[] = ["RAW", "ZSCORE", "PERCENTILE", "RANK", "LOG", "NORMALIZE"];

export function VariableAxisPanel({
  variables,
  axis,
  onAxis,
  gridN,
  onGridN,
  formulaText,
}: {
  variables: VariableSpec[];
  axis: AxisSelection;
  onAxis: (patch: Partial<AxisSelection>) => void;
  gridN: number;
  onGridN: (n: number) => void;
  formulaText: string;
}) {
  return (
    <div className="fl-section">
      <h4>Variables &amp; Axes</h4>

      <div className="fl-field">
        <label>X-axis source</label>
        <select value={axis.xVarId} onChange={(e) => onAxis({ xVarId: e.target.value })}>
          {variables.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
        </select>
      </div>
      <div className="fl-row">
        <div className="fl-field">
          <label>X transform</label>
          <select value={axis.xTransform} onChange={(e) => onAxis({ xTransform: e.target.value as AxisTransform })}>
            {TRANSFORMS.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
          </select>
        </div>
        <div className="fl-field">
          <label>X range</label>
          <div className="fl-row">
            <input type="number" value={axis.xRange[0]} onChange={(e) => onAxis({ xRange: [Number(e.target.value), axis.xRange[1]] })} />
            <input type="number" value={axis.xRange[1]} onChange={(e) => onAxis({ xRange: [axis.xRange[0], Number(e.target.value)] })} />
          </div>
        </div>
      </div>

      <div className="fl-field">
        <label>Y-axis source</label>
        <select value={axis.yVarId} onChange={(e) => onAxis({ yVarId: e.target.value })}>
          {variables.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
        </select>
      </div>
      <div className="fl-row">
        <div className="fl-field">
          <label>Y transform</label>
          <select value={axis.yTransform} onChange={(e) => onAxis({ yTransform: e.target.value as AxisTransform })}>
            {TRANSFORMS.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
          </select>
        </div>
        <div className="fl-field">
          <label>Y range</label>
          <div className="fl-row">
            <input type="number" value={axis.yRange[0]} onChange={(e) => onAxis({ yRange: [Number(e.target.value), axis.yRange[1]] })} />
            <input type="number" value={axis.yRange[1]} onChange={(e) => onAxis({ yRange: [axis.yRange[0], Number(e.target.value)] })} />
          </div>
        </div>
      </div>

      <div className="fl-field">
        <label>Z-axis output</label>
        <input type="text" value={formulaText} readOnly title={formulaText} />
      </div>

      <div className="fl-slider">
        <span style={{ fontSize: 11, color: "var(--fl-muted)" }}>grid</span>
        <input type="range" min={11} max={81} step={2} value={gridN} onChange={(e) => onGridN(Number(e.target.value))} />
        <span className="val">{gridN}×{gridN}</span>
      </div>
    </div>
  );
}
