// CardRunStatusPanel — Strategy Lab reader of the Microscope cascade run record.
import { TK, InfoTip } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { runStatus, type RunWindow } from "../lib/cardRunStore.ts";
import { STAGES, STAGE_LABEL, STAGE_DAYS, type Stage } from "../lib/stageWindow.ts";

function spanYears(from: string, to: string): number {
  const a = Date.parse(from.replace(" ", "T") + "Z");
  const b = Date.parse(to.replace(" ", "T") + "Z");
  return isFinite(a) && isFinite(b) ? (b - a) / (365.25 * 86400000) : 0;
}

type LibCard = { id: string; name?: string; modules?: string[]; archetype?: string; design_tf?: string };

const STATE_META: Record<string, { label: string; tone: "info" | "warn" | "danger" | "safe" }> = {
  NONE: { label: "Not Run", tone: "info" },
  PARTIAL: { label: "In Progress", tone: "warn" },
  STALE: { label: "Card Modified — Re-run Needed", tone: "danger" },
  FRESH: { label: "Completed Y10 · M6 · M1", tone: "safe" },
};

function goMicroscope(cardId: string) {
  try {
    localStorage.setItem("mfe_microscope_preselect", cardId);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "microscope" }));
}

function WinRow({ w }: { w: RunWindow }) {
  const pos = w.netR >= 0;
  return (
    <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#F8FAFC" }}>
        {STAGE_LABEL[w.stage]}{" "}
        <span style={{ fontSize: 10, color: w.source === "Live" ? TK.green : TK.blue }}>{w.source}</span>
      </td>
      <td style={{ fontSize: 11, color: "#94A3B8", fontFamily: "var(--mfe-mono)" }}>
        {w.from} → {w.to}
        {(() => {
          const y = spanYears(w.from, w.to);
          const reqY = STAGE_DAYS[w.stage] / 365.25;
          return y < reqY * 0.85 ? (
            <span
              title={`Window requests ~${reqY.toFixed(0)}y but tape only reaches ~${y.toFixed(1)}y`}
              style={{ color: TK.orange, marginLeft: 5, cursor: "help" }}
            >
              <Glyph name="warning" size={9} /> {y.toFixed(1)}y
            </span>
          ) : null;
        })()}
      </td>
      <td style={{ textAlign: "center", fontFamily: "var(--mfe-mono)", color: w.n < 1000 ? TK.orange : "#CBD5E1", fontSize: 11.5 }}>
        {w.n.toLocaleString()}
      </td>
      <td style={{ textAlign: "center", fontFamily: "var(--mfe-mono)", color: "#F8FAFC" }}>
        {w.trades}
        {w.driftBlocked ? (
          <span title={`drift_guard halted ${w.driftBlocked} trades (PF < 0.6 circuit breaker)`} style={{ color: TK.orange, marginLeft: 3, cursor: "help" }}>
            <Glyph name="bolt" size={10} />
          </span>
        ) : null}
        {w.ruined ? (
          <span title={`RUINED at ${w.ruinTime || "?"} — engine stopped trading for the rest of the window`} style={{ color: TK.red, marginLeft: 3, cursor: "help" }}>
            <Glyph name="skull" size={10} />
          </span>
        ) : null}
      </td>
      <td style={{ textAlign: "center", fontFamily: "var(--mfe-mono)", color: w.winRate >= 50 ? TK.green : TK.yellow }}>
        {w.winRate}%
      </td>
      <td style={{ textAlign: "center", fontFamily: "var(--mfe-mono)", color: pos ? TK.green : TK.red, fontWeight: 700 }}>
        {pos ? "+" : ""}
        {w.netR}R
      </td>
      <td style={{ textAlign: "center", fontFamily: "var(--mfe-mono)", color: w.netPF >= 1 ? TK.green : TK.red }}>
        {w.netPF}
      </td>
      <td style={{ textAlign: "center", fontFamily: "var(--mfe-mono)", color: TK.red }}>{w.maxDD}R</td>
      <td style={{ textAlign: "center" }}>
        <span
          className={`mfe-status-pill ${
            w.verdict.includes("ROBUST") ? "safe" : w.verdict.includes("NO_EDGE") ? "danger" : w.verdict === "—" ? "info" : "warn"
          }`}
        >
          {w.verdict.replace("_AFTER_COST", "").replace("_EDGE", "").replace("_IN_SIM", "")}
        </span>
      </td>
    </tr>
  );
}

export function CardRunStatusPanel({ card }: { card: LibCard | null }) {
  if (!card) return null;
  const st = runStatus(card);
  const meta = STATE_META[st.state];
  const rec = st.record;
  const btnLabel =
    st.state === "FRESH"
      ? "↻ Re-run in Microscope"
      : st.state === "PARTIAL"
        ? `▶ Continue ${STAGE_LABEL[st.missing[0]]} in Microscope`
        : st.state === "STALE"
          ? "▶ Re-run in Microscope (Modified)"
          : "▶ Run in Microscope (Y10 → M6 → M1)";

  const hardFlags =
    rec && st.state !== "STALE"
      ? STAGES.map((s) => rec.windows[s]?.hard).filter((_, i) => rec.windows[STAGES[i]])
      : [];
  const anyHard = hardFlags.some((h) => h === true);
  const allHard = hardFlags.length > 0 && hardFlags.every((h) => h === true);
  const mode = hardFlags.length === 0 ? null : allHard ? "HARD" : anyHard ? "MIXED" : "NORMAL";

  return (
    <div className="co-card">
      <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "#F8FAFC", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Glyph name="link" size={13} color={TK.cyan} />
        <span>SYNCED MICROSCOPE RESULTS</span>
        <span className={`mfe-status-pill ${meta.tone}`}>{meta.label}</span>
        {mode && (
          <span
            className={`mfe-status-pill ${mode === "HARD" ? "danger" : mode === "MIXED" ? "warn" : "info"}`}
            title={
              mode === "HARD"
                ? "Simulated on HARD Broker (1.5× cost + min stop floor)"
                : mode === "MIXED"
                  ? "Mixed Normal/HARD windows — re-run under a single broker mode"
                  : "Simulated on Normal Broker"
            }
          >
            {mode === "HARD" ? "HARD Broker" : mode === "MIXED" ? "Mixed Mode" : "Normal Broker"}
          </span>
        )}
        <InfoTip title="Microscope Cascade Sync">
          Displays the exact Y10 / M6 / M1 cascade windows recorded by the realistic simulation engine in Microscope.
        </InfoTip>
        <button className="fx-toggle on" style={{ marginLeft: "auto", fontSize: 11.5, padding: "5px 13px" }} onClick={() => goMicroscope(card.id)}>
          {btnLabel}
        </button>
      </h3>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "#94A3B8", fontSize: 10, textTransform: "uppercase" }}>
              <th style={{ textAlign: "left", padding: "5px 8px" }}>Window · Source</th>
              <th style={{ textAlign: "left" }}>Date Range</th>
              <th>Bars</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>Net R</th>
              <th>PF</th>
              <th>Max DD</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s: Stage) => {
              const stored = rec?.windows[s];
              const w = st.state !== "STALE" && stored?.verified ? stored : undefined;
              return w ? (
                <WinRow key={s} w={w} />
              ) : (
                <tr key={s} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "#94A3B8" }}>
                    {STAGE_LABEL[s]}{" "}
                    <span style={{ fontSize: 10, color: "#64748B", fontWeight: 500 }}>
                      <Glyph name="tape" size={9} /> source from receipt
                    </span>
                  </td>
                  <td colSpan={8} className="co-mut small" style={{ fontStyle: "italic" }}>
                    — Not run yet · execute in Microscope to populate
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {st.state !== "STALE" &&
        STAGES.some((s) => rec?.windows[s]?.ruined) &&
        (() => {
          const rw = STAGES.map((s) => rec?.windows[s]).find((w) => w?.ruined);
          return (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--status-danger-bg)",
                border: "1px solid var(--status-danger-border)",
                fontSize: 11.5,
                color: "var(--status-danger-text)",
                lineHeight: 1.5,
              }}
            >
              <Glyph name="skull" size={12} /> <b>CAPITAL RUINED in {rw ? STAGE_LABEL[rw.stage] : ""}</b> at <b>{rw?.ruinTime || "?"}</b> — compounding equity hit 0 and the engine halted trading for the remainder of the window. Reduce <b>% Risk / Trade</b> in Microscope or refine the card.
            </div>
          );
        })()}

      {st.state !== "STALE" && STAGES.some((s) => (rec?.windows[s]?.driftBlocked ?? 0) > 0) && (
        <div
          style={{
            marginTop: 8,
            padding: "7px 10px",
            borderRadius: 6,
            background: "var(--status-warn-bg)",
            border: "1px solid var(--status-warn-border)",
            fontSize: 11,
            color: "var(--status-warn-text)",
          }}
        >
          <Glyph name="bolt" size={11} /> <b>drift_guard circuit breaker tripped</b> in{" "}
          {STAGES.filter((s) => (rec?.windows[s]?.driftBlocked ?? 0) > 0)
            .map((s) => `${STAGE_LABEL[s]} (${rec!.windows[s]!.driftBlocked} blocked)`)
            .join(" · ")}
          . Rolling PF dropped below 0.6, halting further entries.
        </div>
      )}
    </div>
  );
}
