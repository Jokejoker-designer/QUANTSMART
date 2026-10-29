// AblationPanel — leave-one-out ablation on NET OOS (walk-forward). Shows each module's REAL marginal
// contribution so the user keeps what helps and drops decorative/harmful modules. Heavy (≈(modules+1)×
// folds engine runs) → button-triggered. Modeled · advisory.
import { useEffect, useState } from "react";
import { runResearchAnalysis } from "../lib/researchJobs.ts";
import { TK } from "./ui/Ui.tsx";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { runAblation, type AblationResult } from "../lib/simAblation.ts";
import type { CustomModule } from "../lib/customModule.ts";

export function AblationPanel({ designBars, card, capital, riskPct, customModules }: {
  designBars: OhlcBar[] | null; card: any; capital: number; riskPct: number; customModules?: CustomModule[];
}) {
  const [res, setRes] = useState<AblationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{setRes(null);setError("");},[designBars,card,capital,riskPct]);
  const ablatable = Array.isArray(card?.modules) ? card.modules.length : 0;
  async function run() {
    if (!designBars || designBars.length < 300 || !card) return;
    setRunning(true);
    setError("");try { setRes(await runResearchAnalysis<AblationResult>("ablation", designBars, card, { capital, riskPct, customModules })); } catch(error) { setError((error as Error).message); } finally { setRunning(false); }
  }
  const vCol = (v: string) => v === "HELPS" ? TK.green : v === "HURTS" ? TK.red : v === "CORE_TRIGGER" ? TK.cyan : v === "SOLE_TRIGGER" ? TK.orange : TK.muted;
  const vLabel = (v: string) => v === "CORE_TRIGGER" ? "CORE/TRIGGER" : v === "SOLE_TRIGGER" ? "SOLE TRIGGER" : v;
  const noContrib = (v: string) => v === "CORE_TRIGGER" || v === "SOLE_TRIGGER";   // Δ not a faithful contribution

  return (
    <div className="pc" style={{ borderColor: "#43306a" }}>
      {error && <p role="alert" className="product-message error">Research analysis failed: {error}</p>}
      <div className="pc-h violet"> Module ablation <span className="mut">leave-one-out · walk-forward · modeled</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="ms-csv" style={{ background: running ? "#6e40c9" : "#1f6feb" }} disabled={running || !designBars} onClick={run}>{running ? "Running" + (ablatable + 1) + "× walk-forward…" : "Run ablation"}</button>
        {res && <span className="pflag" style={{ margin: 0, background: res.baselineOosR >= 0 ? "rgba(33,208,122,.14)" : "rgba(255,77,77,.14)", color: res.baselineOosR >= 0 ? TK.green : TK.red, border: "1px solid " + (res.baselineOosR >= 0 ? TK.green : TK.red) }}>baseline OOS {res.baselineOosR >= 0 ? "+" : ""}{res.baselineOosR}R · {(res.baselinePosFrac * 100).toFixed(0)}% fold+ · {res.baselineTrades} trades</span>}
        <span className="pmut psm">Delta compares the baseline with the reduced composition. HELPS means removing it worsens the result.</span>
      </div>
      {res && !res.baselineHasEdge && (
        <div style={{ margin: "0 0 8px", padding: "7px 10px", borderRadius: 8, lineHeight: 1.5, fontSize: 11.5, color: "#ffc88f", background: "rgba(255,138,42,.08)", border: "1px solid #5a3a18" }}>
          ⚠ <b>The baseline has no measured edge</b> (OOS {res.baselineOosR}R · {(res.baselinePosFrac * 100).toFixed(0)}% positive folds). Its component contribution may only represent <b>reduced losses</b>, which is not grounds for promotion. Removing a harmful component requires a separate rerun <b>re-run</b> to confirm the result.
        </div>
      )}
      {res && !res.baselineHasTrigger && (
        <div style={{ margin: "0 0 8px", padding: "7px 10px", borderRadius: 8, lineHeight: 1.5, fontSize: 11.5, color: "#ffc88f", background: "rgba(255,138,42,.08)", border: "1px solid #5a3a18" }}>
          ⚠ <b>This Card has no explicit trigger</b> and the baseline uses the engine's <b>default EMA crossover</b> instead of a Card-specific setup. Add an explicit trigger before publication.
        </div>
      )}
      {res && res.rows.some((r) => r.verdict === "SOLE_TRIGGER") && (
        <div style={{ margin: "0 0 8px", padding: "7px 10px", borderRadius: 8, lineHeight: 1.5, fontSize: 11.5, color: "#ffd9a8", background: "rgba(255,138,42,.06)", border: "1px solid #4a3520" }}>
          ⚠ <b style={{ color: TK.orange }}>SOLE TRIGGER</b>: removing the only trigger changes the run into the engine's <b>default EMA-cross</b>. The reduced OOS result marked <span style={{ fontFamily: "var(--mfe-mono)" }}>ᵈᵉᶠ</span>therefore belongs to a different strategy, <b>not</b> not the same strategy with a marginal component removed. Use at least two independent triggers for this comparison.
        </div>
      )}
      {res && (
        <div style={{ overflowX: "auto" }}>
          <div className="pmut psm" style={{ marginBottom: 6 }}> Δ <b>Contributions are not additive</b> . Removing several components requires a new run. <span style={{ color: TK.cyan }}>CORE/TRIGGER</span> means removal leaves no candidates, not that the component is harmful.</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead><tr style={{ color: "var(--mfe-muted)", fontSize: 9.5, textTransform: "uppercase" }}><th style={{ textAlign: "left", padding: "3px 7px" }}>Module</th><th style={{ textAlign: "right" }}>OOS R without module</th><th style={{ textAlign: "right" }}>Trades without module</th><th style={{ textAlign: "right" }}>Contribution delta</th><th style={{ textAlign: "center" }}>Verdict</th></tr></thead>
            <tbody>{res.rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #14202c" }}>
                <td style={{ padding: "3px 7px", fontWeight: 700, color: "var(--mfe-text2)" }}>{r.id}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: r.verdict === "SOLE_TRIGGER" ? TK.orange : r.withoutOosR >= 0 ? TK.green : TK.red }} title={r.verdict === "SOLE_TRIGGER" ? "The default EMA crossover is a different strategy, not a marginal ablation of this Card." : undefined}>{r.withoutOosR >= 0 ? "+" : ""}{r.withoutOosR}R{r.verdict === "SOLE_TRIGGER" ? " ᵈᵉᶠ" : ""}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: r.withoutTrades === 0 ? TK.cyan : "var(--mfe-muted)", fontWeight: r.withoutTrades === 0 ? 800 : 400 }}>{r.withoutTrades}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", fontWeight: 800, color: vCol(r.verdict) }}>{noContrib(r.verdict) ? "—" : (r.deltaR >= 0 ? "+" : "") + r.deltaR + "R"}</td>
                <td style={{ textAlign: "center", fontWeight: 800, color: vCol(r.verdict) }}>{vLabel(r.verdict)}</td>
              </tr>
            ))}{res.rows.length === 0 && <tr><td colSpan={5} className="pmut psm" style={{ padding: 6 }}>No strategy modules are available for ablation.</td></tr>}</tbody>
          </table>
          <div className="pfoot" style={{ marginTop: 6 }}>{res.note}</div>
        </div>
      )}
      {!res && <div className="pmut psm">Remove each module and compare net OOS results. Read the complete window, sample count and trigger-baseline limitations before changing the composition.</div>}
    </div>
  );
}
