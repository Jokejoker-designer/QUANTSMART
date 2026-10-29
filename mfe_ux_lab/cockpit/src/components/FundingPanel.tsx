// FundingPanel — funding mode. The user funds a strategy with an arbitrary capital ($); the realistic
// engine sizes by %-equity on that capital and reports the $ outcome. If equity hits ≤ 0 mid-backtest
// the account is BLOWN → the run is a FAILURE (no faked recovery). Modeled · not a profit promise.
import { TK } from "./ui/Ui.tsx";
import type { RealisticAnalytics } from "../lib/realisticSimAnalytics.ts";

const usd = (v: number) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function FundingPanel({ capital, onCapital, riskPct, onRiskPct, analytics, calibrated }: {
  capital: number; onCapital: (v: number) => void; riskPct: number; onRiskPct: (v: number) => void;
  analytics: RealisticAnalytics | null; calibrated?: boolean;
}) {
  const fnd = analytics?.funding;
  const ruined = !!fnd?.ruined;
  const profit = fnd?.profitUsd ?? 0;
  const tone = ruined ? TK.red : profit >= 0 ? TK.green : TK.red;

  const Inp = ({ label, val, on, step, min, suffix }: { label: string; val: number; on: (v: number) => void; step: number; min: number; suffix?: string }) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="pmut psm">{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input type="number" value={val} step={step} min={min} onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n) && n >= min) on(n); }}
          style={{ width: 110, background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 7, padding: "5px 8px", fontSize: 13, fontWeight: 700, fontFamily: "var(--mfe-mono)" }} />
        {suffix && <span className="pmut psm">{suffix}</span>}
      </span>
    </label>
  );
  const Stat = ({ k, v, c }: { k: string; v: string; c?: string }) => (
    <div style={{ flex: 1, minWidth: 110, background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)", borderRadius: 8, padding: "7px 10px" }}>
      <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}>{k}</div>
      <div className="pmono" style={{ fontSize: 14, fontWeight: 800, color: c || "var(--mfe-text)", marginTop: 2 }}>{v}</div>
    </div>
  );

  return (
    <div className="pc" style={{ borderColor: tone, background: `linear-gradient(180deg, ${tone}10, var(--mfe-s1))` }}>
      <div className="pc-h" style={{ color: tone }}> Funding assumptions <span className="mut">Modeled capital and percent-equity assumptions</span></div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
        <Inp label={"Initial capital"} val={capital} on={onCapital} step={1000} min={100} suffix="USD" />
        <Inp label={"Risk per simulated trade"} val={riskPct} on={onRiskPct} step={0.25} min={0.05} suffix="% equity" />
        <span className="pmut psm" style={{ paddingBottom: 6 }}>Each simulated trade risks {riskPct}% of the current modeled balance, with compounding</span>
      </div>

      {ruined ? (
        <div style={{ border: "1.5px solid " + TK.red, background: TK.red + "1c", borderRadius: 9, padding: "10px 14px" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: TK.red }}> MODELED CAPITAL DEPLETED</div>
          <div className="psm" style={{ marginTop: 3, color: "var(--mfe-text2)" }}>The modeled account reached zero at <b className="pmono">{fnd?.ruinAt || "—"}</b> (trade <b>{fnd?.ruinTradeIndex}</b>), so the simulator <b>stopped taking trades</b>. Capital {usd(capital)} with risk {riskPct}% per simulated trade <b>did not survive this path</b> qua backtest.</div>
          <div className="pfoot" style={{ marginTop: 5, color: TK.orange }}>. This failure remains in the result; no synthetic recovery is added.</div>
        </div>
      ) : fnd ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat k={"Initial capital"} v={usd(fnd.initialEquity)} />
          <Stat k={"Final capital"} v={usd(fnd.finalEquity)} c={tone} />
          <Stat k={"Profit / loss"} v={(profit >= 0 ? "+" : "") + usd(profit)} c={tone} />
          <Stat k="Return" v={(fnd.returnPct >= 0 ? "+" : "") + fnd.returnPct + "%"} c={tone} />
          <Stat k={"Peak equity"} v={usd(fnd.peakEquity)} />
          <Stat k={"Maximum drawdown"} v={usd(fnd.maxDDUsd) + " (" + fnd.maxDDPct + "%)"} c={TK.red} />
        </div>
      ) : <div className="pmut psm">Select a Card to evaluate modeled funding.</div>}

      <div className="pfoot" style={{ marginTop: 7 }}>
        Modeled amounts are {calibrated ? "based on a calibrated broker specification" : <b style={{ color: TK.orange }}>provisional because the broker specification is not calibrated</b>} . Costs remain subject to the receipt assumptions. Research only.
      </div>
    </div>
  );
}
