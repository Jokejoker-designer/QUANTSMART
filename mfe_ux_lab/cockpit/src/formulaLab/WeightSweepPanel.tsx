import type { WeightContribution } from "./core/weightSweep";

export function WeightSweepPanel({
  weights,
  contributions,
  onWeight,
}: {
  weights: Record<string, number>;
  contributions: WeightContribution[];
  onWeight: (id: string, value: number) => void;
}) {
  const ids = Object.keys(weights);
  if (ids.length === 0) return null;
  const byId = new Map(contributions.map((c) => [c.id, c]));

  return (
    <div className="fl-section">
      <h4>Weight Controls · sweep</h4>
      {ids.map((id) => {
        const c = byId.get(id);
        return (
          <div key={id} style={{ marginBottom: 8 }}>
            <div className="fl-slider">
              <span style={{ fontSize: 11, width: 78, color: "var(--fl-text)" }}>{id.replace("w_", "")}</span>
              <input type="range" min={-1.5} max={1.5} step={0.05} value={weights[id]} onChange={(e) => onWeight(id, Number(e.target.value))} />
              <span className="val">{weights[id].toFixed(2)}</span>
            </div>
            <div className="fl-bar"><span style={{ width: `${c ? c.sharePct : 0}%` }} /></div>
            <div style={{ fontSize: 10, color: "var(--fl-muted)", textAlign: "right" }}>
              contribution {c ? c.sharePct.toFixed(1) : "0.0"}%
            </div>
          </div>
        );
      })}
      <div className="fl-note">Contribution is a sensitivity diagnostic, not trading attribution.</div>
    </div>
  );
}
