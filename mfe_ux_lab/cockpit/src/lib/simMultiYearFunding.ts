// simMultiYearFunding — run a funded strategy YEAR BY YEAR. Two modes:
//   "cumulative" — equity carries over year→year (one journey; ruin in any year stops the whole journey)
//   "per_year"   — each year starts fresh with the same capital (which years the strategy works)
// Runs on the design_tf tape split by calendar year. Modeled · ruin = real failure, no faked recovery.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { cloneSimConfig } from "./simConfig.ts";
import { getCardRuntimeConfig } from "./simTimeframe.ts";
import { getSymbolSpec } from "./symbolSpec.ts";
import { runRealisticSim } from "./realisticStrategySim.ts";
import { analyzeRealistic } from "./realisticSimAnalytics.ts";

export interface YearFunding { year: string; startEquity: number; endEquity: number; profitUsd: number; returnPct: number; trades: number; maxDDPct: number; ruined: boolean; ruinAt?: string }
export interface MultiYearFundingResult {
  mode: "cumulative" | "per_year";
  capital: number; riskPct: number;
  rows: YearFunding[];
  finalEquity: number; totalReturnPct: number; totalProfitUsd: number;   // cumulative journey
  blown: boolean; blownYear?: string;
  avgReturnPct: number; positiveYears: number; ruinedYears: number; totalYears: number;   // per-year stats
  bestYear?: YearFunding; worstYear?: YearFunding;
}

export interface MultiYearFundingOptions { capital: number; riskPct: number; mode: "cumulative" | "per_year"; symbol?: string }

export function multiYearFunding(designBars: OhlcBar[], card: any, opts: MultiYearFundingOptions): MultiYearFundingResult {
  const designTf = getCardRuntimeConfig(card).design_tf;
  const spec = getSymbolSpec(opts.symbol || "XAUUSD");
  const autoRR = !!(card?.modules && card.modules.includes("auto_rr"));
  const modules: string[] = Array.isArray(card?.modules) ? card.modules : [];

  const byYear: Record<string, OhlcBar[]> = {};
  for (const b of designBars) { const y = (b.t || "").slice(0, 4); if (y) (byYear[y] ||= []).push(b); }
  const years = Object.keys(byYear).sort();

  const rows: YearFunding[] = []; let running = opts.capital; let blown = false; let blownYear: string | undefined;
  for (const y of years) {
    const seg = byYear[y]; if (seg.length < 60) continue;
    if (blown) break;                                  // cumulative journey already blown → stop
    const start = opts.mode === "cumulative" ? running : opts.capital;
    const cfg = cloneSimConfig(); cfg.risk.initialEquity = start; cfg.risk.sizingMode = "PERCENT_EQUITY"; cfg.risk.riskPctEquity = opts.riskPct; cfg.designTf = designTf; cfg.executionTf = designTf;
    const sim = runRealisticSim(seg, modules, autoRR, { cfg, spec, designTf, cardId: card?.id || "card", symbol: opts.symbol || "XAUUSD" });
    const f = analyzeRealistic(sim, start).funding;
    rows.push({ year: y, startEquity: +start.toFixed(2), endEquity: f.finalEquity, profitUsd: f.profitUsd, returnPct: f.returnPct, trades: sim.actual_trades_taken, maxDDPct: f.maxDDPct, ruined: f.ruined, ruinAt: f.ruinAt });
    if (opts.mode === "cumulative") { running = f.finalEquity; if (f.ruined) { blown = true; blownYear = y; } }
  }

  const finalEquity = opts.mode === "cumulative" ? (rows.length ? rows[rows.length - 1].endEquity : opts.capital) : opts.capital;
  const totalReturnPct = opts.mode === "cumulative" && opts.capital ? +((finalEquity / opts.capital - 1) * 100).toFixed(2) : 0;
  const ret = rows.map((r) => r.returnPct);
  const sorted = [...rows].sort((a, b) => b.returnPct - a.returnPct);
  return {
    mode: opts.mode, capital: opts.capital, riskPct: opts.riskPct, rows,
    finalEquity, totalReturnPct, totalProfitUsd: +(finalEquity - opts.capital).toFixed(2),
    blown, blownYear,
    avgReturnPct: ret.length ? +(ret.reduce((a, b) => a + b, 0) / ret.length).toFixed(2) : 0,
    positiveYears: rows.filter((r) => r.returnPct > 0).length,
    ruinedYears: rows.filter((r) => r.ruined).length,
    totalYears: rows.length,
    bestYear: sorted[0], worstYear: sorted[sorted.length - 1],
  };
}
