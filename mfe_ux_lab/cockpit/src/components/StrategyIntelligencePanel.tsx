import type { IntelligenceLane, StrategyIntelligence } from "../lib/strategyIntelligence.ts";

const STATE_TONE: Record<StrategyIntelligence["structuralState"], "safe" | "warn" | "danger"> = {
  TRACEABLE: "safe",
  PARTIAL_UNMAPPED: "warn",
  BLOCKED_NO_SETUP: "danger",
  BLOCKED_EMPTY: "danger",
};
const RUN_TONE: Record<string, "safe" | "warn" | "danger" | "info"> = {
  FRESH: "safe",
  PARTIAL: "warn",
  STALE: "danger",
  NONE: "info",
};
const LANE_META: { lane: IntelligenceLane; label: string; empty: string }[] = [
  { lane: "SETUP", label: "Setup candidates", empty: "No trigger or attacker" },
  { lane: "GUARD", label: "Veto and protection", empty: "No guard" },
  { lane: "CONFIRM", label: "Confirmation", empty: "No confirmation component" },
  { lane: "EXIT", label: "Exit logic", empty: "Uses default exit rules" },
  { lane: "CONTEXT", label: "Context & zones", empty: "No context observer" },
  { lane: "INFRA", label: "Combination and R:R", empty: "No custom combination or R:R component" },
];
const fmt = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "—");

export function StrategyIntelligencePanel({ model }: { model: StrategyIntelligence | null }) {
  if (!model) {
    return (
      <div className="co-card strategy-intelligence-panel" style={{ margin: 0 }}>
        <h3>Strategy Intelligence</h3>
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            border: "1px dashed var(--border-panel)",
            background: "var(--bg-card-inner)",
          }}
        >
          <b style={{ color: "#F8FAFC", fontSize: 12.5 }}>No Strategy Card selected</b>
          <div className="co-mut small" style={{ marginTop: 5, lineHeight: 1.55 }}>
            Create a Card in Canvas. This panel reads its actual composition, saved cascade evidence and ensemble lineage.
          </div>
        </div>
      </div>
    );
  }

  const c = model.card;
  const stateTone = STATE_TONE[model.structuralState];
  const runTone = RUN_TONE[model.run.state] || "info";

  return (
    <div className="co-card strategy-intelligence-panel" style={{ margin: 0 }}>
      <h3>Strategy Intelligence</h3>

      <div
        style={{
          border: "1px solid var(--border-panel)",
          borderRadius: 6,
          padding: "10px 12px",
          background: "var(--bg-card-inner)",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <b style={{ color: "#F8FAFC", fontSize: 13 }}>{c.name}</b>
          <span className={`mfe-status-pill ${stateTone}`}>{model.structuralState}</span>
        </div>
        <div className="co-mut" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 6 }}>
          {model.structuralReason}
        </div>
        <div className="co-mut" style={{ fontSize: 11, marginTop: 6 }}>
          Canvas gate: <b style={{ color: "var(--accent-purple)" }}>{c.gate || "RESEARCH_DRAFT"}</b> · Archetype:{" "}
          <b style={{ color: "#F8FAFC" }}>{c.archetype || "Research"}</b> · Design TF:{" "}
          <b style={{ color: "var(--accent-sky)" }}>{c.design_tf || "H1"}</b>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ color: "var(--accent-sky)", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          Card mechanism
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {LANE_META.map(({ lane, label, empty }) => {
            const modules = model.lanes[lane];
            return (
              <div
                key={lane}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-card-inner)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                  <span style={{ color: "#CBD5E1", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
                  <span style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: "var(--accent-sky)" }}>{modules.length}</span>
                </div>
                {!modules.length ? (
                  <div style={{ color: "#64748B", fontSize: 10.5 }}>{empty}</div>
                ) : (
                  modules.map((m) => (
                    <div key={m.id} title={`${m.mechanism} · ${m.source}`} style={{ marginTop: 5, fontSize: 11, lineHeight: 1.4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent-sky)", flexShrink: 0 }} />
                        <b style={{ color: "#F8FAFC", textTransform: "capitalize" }}>{m.name}</b>
                        {m.status && <span className="mfe-status-pill warn" style={{ fontSize: 9, padding: "1px 6px" }}>{m.status}</span>}
                      </div>
                      <div className="co-mut" style={{ fontSize: 10.5, paddingLeft: 11 }}>{m.explanation}</div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
        {model.lanes.UNKNOWN.length > 0 && (
          <div style={{ marginTop: 8, color: "var(--status-danger-text)", fontSize: 11 }}>
            Unmapped: {model.unknownIds.join(", ")}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: "var(--accent-purple)", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Cascade evidence
          </span>
          <span className={`mfe-status-pill ${runTone}`}>{model.run.state}</span>
        </div>
        {!model.windows.length ? (
          <div className="co-mut" style={{ fontSize: 11, marginTop: 6 }}>
            The research cascade is incomplete. This is a structural explanation, <b>not evidence of an edge</b>.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {model.windows.map((w) => (
              <div
                key={w.stage}
                style={{
                  background: "var(--bg-card-inner)",
                  border: "1px solid var(--border-panel)",
                  borderRadius: 6,
                  padding: "6px 9px",
                  fontSize: 11,
                }}
              >
                <b style={{ color: "var(--accent-sky)" }}>{w.stage}</b> · n={w.trades} · PF {fmt(w.netPF)} ·{" "}
                <span style={{ color: w.netR >= 0 ? "var(--status-safe-text)" : "var(--status-danger-text)", fontWeight: 700 }}>
                  {w.netR >= 0 ? "+" : ""}
                  {fmt(w.netR)}R
                </span>
                <div className="co-mut" style={{ fontSize: 10 }}>
                  {w.verdict || "NO_VERDICT"} · {w.from} → {w.to}
                </div>
              </div>
            ))}
          </div>
        )}
        {model.run.missing.length > 0 && (
          <div style={{ color: "var(--status-warn-text)", fontSize: 10.5, marginTop: 5 }}>
            Missing cascade stages: {model.run.missing.join(" → ")}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
        <div style={{ color: "var(--accent-cyan)", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Beast lineage
        </div>
        {!model.beastLinks.length ? (
          <div className="co-mut" style={{ fontSize: 11, marginTop: 4 }}>
            This Card is not a saved ensemble member or an ensemble export.
          </div>
        ) : (
          model.beastLinks.map((b) => (
            <div
              key={`${b.id}:${b.relation}`}
              style={{
                marginTop: 6,
                padding: "6px 9px",
                borderRadius: 6,
                background: "var(--bg-card-inner)",
                border: "1px solid var(--border-panel)",
                fontSize: 11,
              }}
            >
              <b style={{ color: "#F8FAFC" }}>{b.name}</b>
              <div className="co-mut">
                {b.relation === "MEMBER" ? `Member role ${b.roles.join("/")}` : "Strategy Card exported from this ensemble"}
                {b.evidenceStatus ? ` · identity ${b.evidenceStatus}` : " · Role evidence not available"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
