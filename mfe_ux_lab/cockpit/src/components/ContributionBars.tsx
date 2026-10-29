// ContributionBars — the L2 signature viz for WEIGHTS: at the selected bar, each feature's SIGNED weighted
// contribution wᵢ·fᵢ/Σw as a centered bar (positive → right in its color, negative → left in red), then the
// composite. Drag a weight and the bar + composite reshape live. Context only, never an order.
import type { L2Contribution } from "../lib/blocks/l2Eval.ts";

export function ContributionBars({ contributions, composite, atIndex, onWeight }: { contributions: L2Contribution[]; composite: number[]; atIndex?: number; onWeight?: (key: string, w: number) => void }) {
  const i = atIndex ?? (composite.length ? composite.length - 1 : 0);
  const rows = contributions.map((c) => ({ key: c.key, label: c.label, color: c.color, val: isFinite(c.contrib[i]) ? c.contrib[i] : 0, weight: c.weight }));
  const comp = composite.length && isFinite(composite[i]) ? composite[i] : 0;
  const max = Math.max(0.05, ...rows.map((r) => Math.abs(r.val)), Math.abs(comp));
  const half = (v: number) => `${(Math.abs(v) / max) * 50}%`;   // % of half-width

  return (
    <div>
      <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 5 }}>Contribution Bars <span style={{ color: "var(--mfe-muted)" }}>Contribution breakdown at the selected bar</span></div>
      {rows.map((r) => (
        <div key={r.key} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: r.color, flexShrink: 0 }} />
            <span style={{ color: "var(--mfe-text2)" }}>{r.label}</span>
            <span className="pmut" style={{ fontSize: 9 }}>×{r.weight.toFixed(2)}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)", color: r.val >= 0 ? r.color : "#f7768e" }}>{r.val >= 0 ? "+" : ""}{r.val.toFixed(3)}</span>
          </div>
          <div style={{ position: "relative", height: 9, background: "var(--mfe-s3)", borderRadius: 4, margin: "2px 0" }}>
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#3a4452" }} />
            {r.val >= 0
              ? <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: half(r.val), background: r.color, borderRadius: "0 4px 4px 0" }} />
              : <div style={{ position: "absolute", right: "50%", top: 0, bottom: 0, width: half(r.val), background: "#f7768e", borderRadius: "4px 0 0 4px" }} />}
          </div>
          {onWeight && <input type="range" min={0} max={3} step={0.05} value={r.weight} onChange={(e) => onWeight(r.key, parseFloat(e.target.value))} style={{ width: "100%", height: 12 }} />}
        </div>
      ))}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--mfe-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800 }}>
          <span style={{ color: "#e7eef6" }}>Composite</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)", color: comp >= 0 ? "#37c0ff" : "#f7768e" }}>{comp >= 0 ? "+" : ""}{comp.toFixed(3)}</span>
        </div>
        <div style={{ position: "relative", height: 11, background: "var(--mfe-s3)", borderRadius: 5, marginTop: 3 }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#3a4452" }} />
          {comp >= 0
            ? <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: half(comp), background: "#37c0ff", borderRadius: "0 5px 5px 0" }} />
            : <div style={{ position: "absolute", right: "50%", top: 0, bottom: 0, width: half(comp), background: "#f7768e", borderRadius: "5px 0 0 5px" }} />}
        </div>
      </div>
    </div>
  );
}
