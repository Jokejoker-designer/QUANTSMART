// MultiYearFundingPanel — funded strategy across years: compound (one journey) or per-year (reset).
// Runs ~11 year backtests on demand. Ruin in a compounded journey ends it (no faked recovery).
import { useEffect, useState } from "react";
import { runResearchAnalysis } from "../lib/researchJobs.ts";
import { TK } from "./ui/Ui.tsx";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { multiYearFunding, type MultiYearFundingResult } from "../lib/simMultiYearFunding.ts";

const usd = (v: number) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function MultiYearFundingPanel({ designBars, card, capital, riskPct }: { designBars: OhlcBar[] | null; card: any; capital: number; riskPct: number }) {
  const [mode, setMode] = useState<"cumulative" | "per_year">("cumulative");
  const [res, setRes] = useState<MultiYearFundingResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{setRes(null);setError("");},[designBars,card,capital,riskPct]);
  async function run(m: "cumulative" | "per_year") {
    if (!designBars || designBars.length < 200) return;
    setMode(m); setRunning(true);
    setError("");try { setRes(await runResearchAnalysis<MultiYearFundingResult>("funding", designBars, card, { capital, riskPct, mode: m })); } catch(error) { setError((error as Error).message); } finally { setRunning(false); }
  }
  const tone = res ? (res.mode === "cumulative" ? (res.blown ? TK.red : res.totalReturnPct >= 0 ? TK.green : TK.red) : (res.avgReturnPct >= 0 ? TK.green : TK.red)) : TK.text2;

  return (
    <div className="pc" style={{ borderColor: "#1c4a5b" }}>
      {error && <p role="alert" className="product-message error">Research analysis failed: {error}</p>}
      <div className="pc-h"> Multi-year funding <span className="mut">{usd(capital)} · {riskPct}% per simulated trade; compounded or annual-reset path</span></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--mfe-border)", borderRadius: 7, overflow: "hidden" }}>
          {(["cumulative", "per_year"] as const).map((m, i) => (
            <button key={m} disabled={running} onClick={() => run(m)}
              style={{ background: mode === m && res ? "rgba(37,183,255,.18)" : "transparent", color: mode === m && res ? TK.cyan : "var(--mfe-text2)", border: "none", borderLeft: i ? "1px solid var(--mfe-border)" : "none", cursor: running ? "default" : "pointer", fontSize: 11.5, fontWeight: 700, padding: "5px 11px" }}>
              {m === "cumulative" ? "Compound across years" : "Reset capital each year"}</button>
          ))}
        </div>
        {running && <span className="pmut psm"> Evaluating annual paths…</span>}
        {!designBars && <span className="pmut psm">Historical data is required.</span>}
        <span className="pmut psm" style={{ marginLeft: "auto" }}>{mode === "cumulative" ? "One path carries equity from each year into the next" : "Each year starts with the original capital"}</span>
      </div>

      {res && (
        <>
          {/* summary */}
          {res.mode === "cumulative" ? (
            res.blown ? (
              <div style={{ border: "1.5px solid " + TK.red, background: TK.red + "1c", borderRadius: 9, padding: "9px 13px", marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: TK.red }}> Capital depleted during {res.blownYear}</div>
                <div className="psm" style={{ color: "var(--mfe-text2)", marginTop: 2 }}>Compounded path from {usd(res.capital)} <b>reached zero</b> during {res.blownYear} and stopped. No later recovery is simulated.</div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {[["Initial capital", usd(res.capital), undefined], ["Final capital", usd(res.finalEquity), tone], ["Total profit / loss", (res.totalProfitUsd >= 0 ? "+" : "") + usd(res.totalProfitUsd), tone], ["Total return", (res.totalReturnPct >= 0 ? "+" : "") + res.totalReturnPct + "%", tone], ["Years", String(res.totalYears), undefined]].map(([k, v, c], i) => (
                  <div key={i} style={{ flex: 1, minWidth: 96, background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)", borderRadius: 8, padding: "7px 9px" }}>
                    <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase" }}>{k}</div><div className="pmono" style={{ fontSize: 13.5, fontWeight: 800, color: (c as string) || "var(--mfe-text)", marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {[["Average annual return", (res.avgReturnPct >= 0 ? "+" : "") + res.avgReturnPct + "%", tone], ["Profitable years", res.positiveYears + "/" + res.totalYears, TK.green], ["Years with depleted capital", String(res.ruinedYears), res.ruinedYears ? TK.red : TK.muted], ["Best year", res.bestYear ? res.bestYear.year + " (" + res.bestYear.returnPct + "%)" : "—", TK.green], ["Worst year", res.worstYear ? res.worstYear.year + " (" + res.worstYear.returnPct + "%)" : "—", TK.red]].map(([k, v, c], i) => (
                <div key={i} style={{ flex: 1, minWidth: 96, background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)", borderRadius: 8, padding: "7px 9px" }}>
                  <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase" }}>{k}</div><div className="pmono" style={{ fontSize: 12.5, fontWeight: 800, color: (c as string) || "var(--mfe-text)", marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* per-year table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead><tr style={{ color: "var(--mfe-muted)", fontSize: 9.5, textTransform: "uppercase" }}><th style={{ textAlign: "left", padding: "3px 7px" }}>Year</th><th style={{ textAlign: "right" }}>Initial capital</th><th style={{ textAlign: "right" }}>Final capital</th><th style={{ textAlign: "right" }}>Return</th><th style={{ textAlign: "right" }}>Trades</th><th style={{ textAlign: "right" }}>MaxDD</th></tr></thead>
              <tbody>{res.rows.map((r) => (
                <tr key={r.year} style={{ borderTop: "1px solid #14202c", background: r.ruined ? TK.red + "14" : undefined }}>
                  <td style={{ padding: "3px 7px", fontWeight: 700, color: "var(--mfe-text)" }}>{r.year}{r.ruined ? " 🔥" : ""}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)" }}>{usd(r.startEquity)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: r.endEquity >= r.startEquity ? TK.green : TK.red }}>{usd(r.endEquity)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: r.returnPct >= 0 ? TK.green : TK.red, fontWeight: 700 }}>{r.returnPct >= 0 ? "+" : ""}{r.returnPct}%</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: "var(--mfe-muted)" }}>{r.trades}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mfe-mono)", color: TK.red }}>{r.maxDDPct}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      <div className="pfoot" style={{ marginTop: 6 }}>Modeled percent-equity path with provisional costs and broker assumptions. Not a return promise.</div>
    </div>
  );
}
