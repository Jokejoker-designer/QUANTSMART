// TfFitPanel — runs the card at M5/M15/H1/H4 and shows which TF it actually fits (OOS + era-stable),
// recommending the best ONE. ADVISORY/SHADOW: it never changes the card's declared design_tf — the user
// decides. Heavy (4 walk-forward runs) → button-triggered. "suitability ≠ promise".
import { useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import { runTfFit, TF_CANDIDATES, type TfFitResult, type TfCandidate } from "../lib/tfFitScan.ts";

const VCOL: Record<string, string> = { ROBUST_IN_SIM: TK.green, CONDITIONAL_EDGE: TK.yellow, FRAGILE_EDGE: TK.orange, NO_EDGE_AFTER_COST: TK.red };

export function TfFitPanel({ card }: { card: { id?: string; name?: string; modules?: string[]; design_tf?: string }; capital?: number; riskPct?: number }) {
  const [res, setRes] = useState<TfFitResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan() {
    if (!card) return;
    setBusy(true);
    try {
      const barsByTf: Partial<Record<TfCandidate, import("../adapters/loadOhlcReplayChart.ts").OhlcBar[] | null>> = {};
      // includeExt=false → clean historical tape (same as Microscope engine-of-record); avoids live-backfill starvation.
      for (const tf of TF_CANDIDATES) { const d = await loadSimOhlc(tf, false); barsByTf[tf] = d?.bars || null; }
      setRes(runTfFit(card as Record<string, unknown>, barsByTf, {}));
    } finally { setBusy(false); }
  }

  return (
    <div className="pc" style={{ borderColor: "#43306a" }}>
      <div className="pc-h violet"> Timeframe comparison: OOS and chronological stability <span className="mut">Compare design timeframes in research</span></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button className="ms-csv" style={{ background: busy ? "#6e40c9" : "#1f6feb" }} disabled={busy || !card} onClick={scan}>{busy ? "Evaluating four timeframes…" : "Compare M5, M15, H1 and H4"}</button>
        <span className="pmut psm">Runs the Card with each explicit timeframe override and compares walk-forward and chronological stability.</span>
      </div>

      {res && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead><tr style={{ color: "var(--mfe-muted)", fontSize: 9.5, textTransform: "uppercase" }}>
                <th style={{ textAlign: "left", padding: "3px 7px" }}>TF</th><th style={{ textAlign: "right" }}>Trades</th><th style={{ textAlign: "right" }}>OOS netR</th><th style={{ textAlign: "right" }}>% fold+</th><th style={{ textAlign: "right" }}>Era1 / Era2</th><th style={{ textAlign: "center" }}>Era-stable</th><th style={{ textAlign: "center" }}>Verdict</th>
              </tr></thead>
              <tbody>{res.rows.map((r) => (
                <tr key={r.tf} style={{ borderTop: "1px solid #14202c", background: r.recommendedHere ? "rgba(33,208,122,.10)" : r.tf === res.declaredTf ? "rgba(37,183,255,.06)" : undefined }}>
                  <td style={{ padding: "3px 7px", fontWeight: 700, color: r.recommendedHere ? TK.green : "var(--mfe-text)" }}>{r.recommendedHere ? "★ " : r.tf === res.declaredTf ? "● " : ""}{r.tf}{r.tf === res.declaredTf ? "declared" : ""}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)" }}>{r.ran ? r.trades : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: r.oosNetR >= 0 ? TK.green : TK.red }}>{r.ran ? (r.oosNetR >= 0 ? "+" : "") + r.oosNetR + "R" : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: r.oosPosFrac >= 0.6 ? TK.green : TK.muted }}>{r.ran ? Math.round(r.oosPosFrac * 100) + "%" : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", fontSize: 10.5, color: TK.text2 }}>{r.ran ? `${r.eraNetR[0]}/${r.eraNetR[1]}` : "—"}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: r.eraStable ? TK.green : TK.muted }}>{r.ran ? (r.eraStable ? "✓" : "✗") : "—"}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: VCOL[r.verdict] || TK.muted, fontSize: 10 }}>{r.ran ? r.verdict.replace("_AFTER_COST", "").replace("_EDGE", "").replace("_IN_SIM", "") : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, padding: "8px 11px", borderRadius: 8, background: res.recommendedTf ? "rgba(33,208,122,.08)" : "rgba(99,117,138,.08)", border: "1px solid " + (res.recommendedTf ? "#1c5b3c" : TK.border) }}>
            {res.recommendedTf
              ? <span style={{ fontSize: 12.5, color: TK.green, fontWeight: 700 }}>Candidate: <b>{res.recommendedTf}</b> {res.recommendedTf === res.declaredTf ? "matches the declared timeframe" : `declared timeframe:${res.declaredTf})`}</span>
              : <span style={{ fontSize: 12.5, color: TK.orange, fontWeight: 700 }}>No timeframe met the stated OOS and stability requirements. The saved design timeframe is unchanged.</span>}
            <div className="pmut psm" style={{ marginTop: 3, fontStyle: "italic" }}>{res.note}</div>
          </div>
        </>
      )}
      <div className="pfoot" style={{ marginTop: 6 }}>A suggestion requires positive OOS performance, sufficient positive folds and chronological stability. The Card's timeframe never changes automatically.</div>
    </div>
  );
}
