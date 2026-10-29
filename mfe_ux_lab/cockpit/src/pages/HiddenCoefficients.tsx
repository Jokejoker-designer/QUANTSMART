// Read-only config inventory and a separate, explicitly labelled Shadow profile editor.
import { useMemo, useState } from "react";
import "./cotrade.css";
import "./coefficients.css";
import { TK } from "../components/ui/Ui.tsx";
import { Glyph } from "../components/ui/Glyph.tsx";
import { buildCoefficientInventory, coefSummary, type CoefKind } from "../lib/hiddenCoefficients.ts";
import { TriggerCoefTuner } from "../components/TriggerCoefTuner.tsx";
import { PerformanceCurvesPanel } from "../components/PerformanceCurvesPanel.tsx";

const KIND_META: Record<CoefKind, { label: string; color: string; tone: "warn" | "danger" | "safe" | "info" }> = {
  PROVISIONAL: { label: "Not calibrated to the broker", color: TK.orange, tone: "warn" },
  FIXED_MAGIC: { label: "Preset value; not optimized", color: TK.yellow, tone: "warn" },
  GOLD_TUNED: { label: "Gold-specific configuration", color: TK.red, tone: "danger" },
  GATE: { label: "Validation threshold", color: TK.blue, tone: "info" },
  SELF_CALIBRATING: { label: "Calculated from data", color: TK.green, tone: "safe" },
  USER_TUNABLE: { label: "Editable in the Shadow profile", color: TK.cyan, tone: "info" },
};

export function HiddenCoefficients() {
  const coefs = useMemo(buildCoefficientInventory, []);
  const sum = useMemo(() => coefSummary(coefs), [coefs]);
  const groups = useMemo(() => Array.from(new Set(coefs.map((c) => c.group))), [coefs]);
  const [filter, setFilter] = useState<CoefKind | "ALL">("ALL");
  const [feedback, setFeedback] = useState("");
  const exported = () =>
    JSON.stringify(
      { generated: new Date().toISOString(), authority: "SHADOW_ONLY", summary: sum, coefficients: coefs },
      null,
      2,
    );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported());
      setFeedback("Inventory JSON copied.");
    } catch {
      setFeedback("Clipboard access failed. Use Export JSON to download the file.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exported()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hidden_coefficients.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const shown = filter === "ALL" ? coefs : coefs.filter((c) => c.kind === filter);

  return (
    <div className="coefficients-page">
      <header className="coeff-page-heading">
        <div>
          <h1>
            <Glyph name="digits" size={20} />
            Hidden Coefficients
          </h1>
          <p>
            {sum.total} coefficients · {sum.live} from configuration · {sum.total - sum.live} mirrored from source
          </p>
        </div>
        <div className="coeff-actions">
          <button className="research-button" onClick={copy}>
            <Glyph name="clipboard" size={14} />
            Copy JSON
          </button>
          <button className="research-button" onClick={download}>
            <Glyph name="export" size={14} />
            Export JSON
          </button>
        </div>
      </header>

      <section className="coef-section" aria-label="Coefficient filters">
        <div className="coef-filterbar">
          <button className="coef-filter tone-info" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>
            <span className="coef-kind-square" />
            ALL
            <span className="coef-count">{sum.total}</span>
          </button>
          {(Object.keys(KIND_META) as CoefKind[]).map((kind) => (
            <button
              key={kind}
              className={`coef-filter tone-${KIND_META[kind].tone}`}
              title={KIND_META[kind].label}
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
            >
              <span className="coef-kind-square" />
              {kind.replace(/_/g, " ")}
              <span className="coef-count">{sum.byKind[kind]}</span>
            </button>
          ))}
        </div>
        <div className="coef-notice">
          <Glyph name="warning" size={15} />
          <span>
            {sum.byKind.PROVISIONAL + sum.byKind.FIXED_MAGIC + sum.byKind.GOLD_TUNED}/{sum.total} coefficients are not data-optimized or remain asset-dependent. {sum.goldTuned} gold-specific coefficients need review when changing assets.
          </span>
        </div>
        {feedback && (
          <p role="status" className="coef-feedback">
            {feedback}
          </p>
        )}
      </section>

      <TriggerCoefTuner />
      <PerformanceCurvesPanel collapsible />

      <div className="coef-section-header">
        <h2>AUDIT INVENTORY</h2>
        <span className="coef-meta">Read-only configuration inventory; profile overrides are shown separately.</span>
      </div>

      {groups.map((group) => {
        const rows = shown.filter((c) => c.group === group);
        if (!rows.length) return null;
        return (
          <section className="coef-section" key={group}>
            <div className="coef-section-header">
              <h2>{group}</h2>
              <span className="coef-count">{rows.length}</span>
            </div>
            <div className="coef-table-wrap">
              <table className="coef-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th style={{ textAlign: "right" }}>Value</th>
                    <th>Type</th>
                    <th>Used by</th>
                    <th>Source</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.name}>
                      <td style={{ color: "#F8FAFC", fontWeight: 500 }}>{c.name}</td>
                      <td className="coef-number">{c.value}</td>
                      <td>
                        <span className={`coef-kind tone-${KIND_META[c.kind].tone}`} title={KIND_META[c.kind].label}>
                          <span className="coef-kind-square" />
                          {c.kind.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="coef-muted">{c.usedIn}</td>
                      <td>
                        <span className={`coef-source ${c.live ? "safe" : ""}`}>{c.live ? "CONFIG" : "MIRROR"}</span>
                      </td>
                      <td className="coef-muted">{c.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
