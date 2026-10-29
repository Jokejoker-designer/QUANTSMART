// PeriodSelector — pick the backtest window: All / a Year / a Month. Drives the design_tf slice so
// every realistic panel below reflects exactly the chosen range.
import type { CSSProperties } from "react";
import { TK } from "./ui/Ui.tsx";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { periodYears, periodMonths, periodLabel, PERIOD_MONTHS, type Period } from "../lib/simPeriod.ts";

const sel: CSSProperties = { background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 7, padding: "4px 8px", fontSize: 11.5, fontWeight: 700 };

export function PeriodSelector({ bars, period, onChange, barsLabel }: { bars: OhlcBar[] | null; period: Period; onChange: (p: Period) => void; barsLabel?: string }) {
  const years = periodYears(bars);
  const months = period.year ? periodMonths(bars, period.year) : [];
  const defYear = period.year || years[years.length - 1] || "";

  return (
    <div className="pc" style={{ borderColor: "#1c4a5b", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 12px" }}>
      <span style={{ fontWeight: 800, color: TK.cyan, fontSize: 12.5 }}> Evaluation period</span>
      <div style={{ display: "inline-flex", border: "1px solid var(--mfe-border)", borderRadius: 7, overflow: "hidden" }}>
        {([["all", "All history"], ["year", "By year"], ["month", "By month"]] as const).map(([g, lbl], i) => (
          <button key={g} onClick={() => onChange(g === "all" ? { granularity: "all" } : g === "year" ? { granularity: "year", year: defYear } : { granularity: "month", year: defYear, month: (periodMonths(bars, defYear)[0] || "01") })}
            style={{ background: period.granularity === g ? "rgba(37,183,255,.18)" : "transparent", color: period.granularity === g ? TK.cyan : "var(--mfe-text2)", border: "none", borderLeft: i ? "1px solid var(--mfe-border)" : "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: "4px 10px" }}>{lbl}</button>
        ))}
      </div>
      {period.granularity !== "all" && (
        <select style={sel} value={period.year} onChange={(e) => onChange({ ...period, year: e.target.value, ...(period.granularity === "month" ? { month: periodMonths(bars, e.target.value)[0] || "01" } : {}) })}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
      {period.granularity === "month" && (
        <select style={sel} value={period.month} onChange={(e) => onChange({ ...period, month: e.target.value })}>
          {months.map((m) => <option key={m} value={m}>{PERIOD_MONTHS[+m] || m}</option>)}
        </select>
      )}
      <span className="pmut psm" style={{ marginLeft: "auto" }}>Current period: <b style={{ color: "var(--mfe-text2)" }}>{periodLabel(period)}</b>{barsLabel ? " · " + barsLabel : ""}</span>
    </div>
  );
}
