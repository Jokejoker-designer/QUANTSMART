// Legend for 2D Curve Mode — moved out of the canvas into the right panel.
// Safe/Caution/Risk are geometry region labels only — not trading edge.
export function CurveLegend({ curveLabel }: { curveLabel: string }) {
  const items: Array<{ color: string; label: string; shape?: "line" | "dot" }> = [
    { color: "#34d3e0", label: `Formula Curve (${curveLabel})`, shape: "line" },
    { color: "#f0c543", label: "Zero Crossing", shape: "dot" },
    { color: "#ffffff", label: "Selected Points", shape: "dot" },
    { color: "rgba(150,165,185,0.8)", label: "Market Samples (Replay)", shape: "dot" },
    { color: "#3fb6a8", label: "Safe Regime" },
    { color: "#e0ad4e", label: "Caution Regime" },
    { color: "#e0556a", label: "Risk Regime" },
  ];
  return (
    <div className="fl-section">
      <h4>Legend</h4>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0", fontSize: 12 }}>
          <span style={{ display: "inline-flex", width: 14, justifyContent: "center" }}>
            {it.shape === "line" ? (
              <span style={{ width: 14, height: 2, borderRadius: 2, background: it.color }} />
            ) : it.shape === "dot" ? (
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color }} />
            ) : (
              <span style={{ width: 12, height: 8, borderRadius: 2, border: `1px solid ${it.color}`, background: `${it.color}22` }} />
            )}
          </span>
          <span style={{ color: "var(--fl-text)" }}>{it.label}</span>
        </div>
      ))}
      <div className="fl-note">Safe / Caution / Risk = geometry region labels only. Not trading edge.</div>
    </div>
  );
}
