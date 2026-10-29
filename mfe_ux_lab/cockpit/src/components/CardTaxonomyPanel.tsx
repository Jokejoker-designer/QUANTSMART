// CardTaxonomyPanel — classify the selected Strategy Card along 12 dimensions, each tagged with its
// SOURCE (measured-from-backtest / derived / heuristic / user-assigned) so nothing claims more certainty
// than it has. Modeled · advisory.
import { TK } from "./ui/Ui.tsx";
import type { RealisticBacktest } from "../lib/realisticSimRun.ts";
import { classifyCard, DIM_LABELS, type DimSource } from "../lib/cardTaxonomy.ts";

const SRC_COLOR: Record<DimSource, string> = { backtest: TK.green, modules: TK.cyan, config: TK.cyan, manifest: TK.cyan, verdict: TK.cyan, heuristic: TK.orange, user: TK.purple, spec: TK.text2, card: TK.text2 };
const SRC_LABEL: Record<DimSource, string> = { backtest: "measured backtest", modules: "module-derived", config: "configuration", manifest: "manifest", verdict: "verdict", heuristic: "heuristic", user: "user-assigned", spec: "spec", card: "card" };

export function CardTaxonomyPanel({ bt, card }: { bt: RealisticBacktest; card: any }) {
  const c = classifyCard(card, bt);
  return (
    <div className="pc" style={{ borderColor: "#1c4a5b" }}>
      <div className="pc-h"> Card classification <span className="mut">Twelve dimensions with measured, derived or assigned provenance</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {DIM_LABELS.map(([k, label]) => { const d = c[k]; const col = SRC_COLOR[d.source]; return (
          <div key={k} title={d.note || ""} style={{ background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)", borderColor: col, borderRadius: 4, padding: "6px 9px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
              <span className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</span>
              <span style={{ fontSize: 8.5, color: col, border: "1px solid " + col + "66", borderRadius: 3, padding: "0 4px" }}>{SRC_LABEL[d.source]}</span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: d.source === "heuristic" ? TK.orange : "var(--mfe-text)", marginTop: 2, wordBreak: "break-word" }}>{d.value}</div>
            {d.note && <div className="pmut" style={{ fontSize: 9, marginTop: 1, fontStyle: "italic" }}>{d.note}</div>}
          </div>
        ); })}
      </div>
      <div className="pfoot" style={{ marginTop: 7 }}>
        <span style={{ color: TK.green }}>Measured backtest</span> · <span style={{ color: TK.cyan }}>Derived from modules or configuration</span> · <span style={{ color: TK.orange }}>Heuristic, not a measured environment classification</span> · <span style={{ color: TK.purple }}>User-assigned</span> — modeled · advisory.
      </div>
    </div>
  );
}
