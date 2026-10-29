// realisticSimAnalytics — GROSS vs NET reporting + cost-scenario sensitivity (P0).
// Entries do NOT depend on cost (cost applied post-decision), so LOW/BASE/STRESS scenarios are
// computed by rescaling each trade's stored cost components — no need to re-run the sim.
import type { RealisticTradeResult, RealisticSimResult } from "./realisticStrategySim.ts";
import { rescaleCostR } from "./simCostModel.ts";
import { COST_SCENARIO_MULT, type CostScenario } from "./simConfig.ts";
import { monteCarlo, type MonteCarloResult } from "./simMonteCarlo.ts";

export interface Bucket { n: number; grossWins: number; netWins: number; grossR: number; netR: number }
function bucket(trades: RealisticTradeResult[], key: (t: RealisticTradeResult) => string | number) {
  const m: Record<string, Bucket> = {};
  trades.forEach((t) => { const k = String(key(t)); (m[k] ||= { n: 0, grossWins: 0, netWins: 0, grossR: 0, netR: 0 }); m[k].n++; if (t.grossR > 0) m[k].grossWins++; if (t.netR > 0) m[k].netWins++; m[k].grossR += t.grossR; m[k].netR += t.netR; });
  return m;
}
function pf(trades: RealisticTradeResult[], pick: (t: RealisticTradeResult) => number): number {
  const win = trades.filter((t) => pick(t) > 0).reduce((s, t) => s + pick(t), 0);
  const loss = -trades.filter((t) => pick(t) < 0).reduce((s, t) => s + pick(t), 0);
  return loss ? +(win / loss).toFixed(3) : win > 0 ? 999 : 0;
}

export interface ScenarioResult { scenario: CostScenario; netR: number; netPF: number; avgCostR: number }
export interface RealisticAnalytics {
  n: number;
  grossNetR: number;
  netNetR: number;
  grossPF: number;
  netPF: number;
  grossWinRate: number;
  netWinRate: number;
  avgCostR: number;
  breakevenCostR: number;
  costDragR: number;
  tradesPerDay: number;
  maxTradesPerDayBreaches: number;
  signals_seen: number;
  signals_blocked_by_cooldown: number;
  signals_blocked_by_daily_cap: number;
  signals_blocked_by_existing_position: number;
  actual_trades_taken: number;
  ambiguous_intrabar_count: number;
  grossEquity: number[];
  netEquity: number[];
  maxDDGrossR: number;
  maxDDNetR: number;
  byYear: Record<string, Bucket>;
  byHour: Record<string, Bucket>;
  byMonth: Record<string, Bucket>;
  byDir: Record<string, Bucket>;
  scenarios: ScenarioResult[];
  costFragile: boolean;
  finalEquity: number;
  initialEquity: number;
  // ── P1: M1 intrabar ambiguity scenarios ──
  m1Resolution: boolean;
  ambiguousCount: number;
  ambiguousRate: number;
  ambiguityScenarios: {
    netPF_mark_ambiguous: number;
    netPF_conservative_stop_first: number;
    netPF_optimistic_tp_first: number;
    netPF_excluding_ambiguous: number;
  };
  pathFragilityStatus: "STABLE" | "PATH_FRAGILE";
  // ── P2: swap, weekend exposure, Monte-Carlo ──
  swapCostRtotal: number;
  weekendHeldCount: number;
  monteCarlo: MonteCarloResult | null;
  // ── Funding mode: $-denominated outcome on a user-chosen capital (+ ruin = blew the account) ──
  funding: {
    initialEquity: number; finalEquity: number; profitUsd: number; returnPct: number;
    peakEquity: number; maxDDUsd: number; maxDDPct: number; sizingMode: string;
    ruined: boolean; ruinAt: string; ruinTradeIndex: number; equityUsd: number[];
  };
}

function ddOf(series: number[]): number { let peak = 0, dd = 0, cum = 0; for (const r of series) { cum += r; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); } return +dd.toFixed(2); }

export function analyzeRealistic(sim: RealisticSimResult, initialEquity: number): RealisticAnalytics {
  const t = sim.trades, n = t.length;
  const grossNetR = +t.reduce((s, x) => s + x.grossR, 0).toFixed(2);
  const netNetR = +t.reduce((s, x) => s + x.netR, 0).toFixed(2);
  const avgCostR = n ? +(t.reduce((s, x) => s + x.costR, 0) / n).toFixed(4) : 0;
  const grossWinRate = n ? +(t.filter((x) => x.grossR > 0).length / n * 100).toFixed(1) : 0;
  const netWinRate = n ? +(t.filter((x) => x.netR > 0).length / n * 100).toFixed(1) : 0;

  const days = new Set(t.map((x) => x.signal_time.slice(0, 10))).size || 1;
  let gcum = 0, ncum = 0;
  const grossEquity = t.map((x) => +(gcum += x.grossR).toFixed(2));
  const netEquity = t.map((x) => +(ncum += x.netR).toFixed(2));

  // cost-scenario sensitivity (rescale stored cost components — entries unchanged)
  const scenarios: ScenarioResult[] = (["LOW_COST", "BASE_COST", "STRESS_COST"] as CostScenario[]).map((sc) => {
    const mult = COST_SCENARIO_MULT[sc];
    const reTrades = t.map((x) => ({ netR: x.grossR - rescaleCostR(x.costBreakdown, mult) }));
    const netR = +reTrades.reduce((s, x) => s + x.netR, 0).toFixed(2);
    const win = reTrades.filter((x) => x.netR > 0).reduce((s, x) => s + x.netR, 0);
    const loss = -reTrades.filter((x) => x.netR < 0).reduce((s, x) => s + x.netR, 0);
    const netPF = loss ? +(win / loss).toFixed(3) : win > 0 ? 999 : 0;
    const avgC = n ? +(t.reduce((s, x) => s + rescaleCostR(x.costBreakdown, mult), 0) / n).toFixed(4) : 0;
    return { scenario: sc, netR, netPF, avgCostR: avgC };
  });
  const base = scenarios.find((s) => s.scenario === "BASE_COST"), stress = scenarios.find((s) => s.scenario === "STRESS_COST"), low = scenarios.find((s) => s.scenario === "LOW_COST");
  const costFragile = !!(low && low.netPF > 1 && ((base && base.netPF <= 1) || (stress && stress.netPF <= 1)));

  // ── P1: M1 intrabar ambiguity scenarios (post-process stored stop-first / tp-first per trade) ──
  const pfFromNet = (nets: number[]) => { const w = nets.filter((x) => x > 0).reduce((s, x) => s + x, 0), l = -nets.filter((x) => x < 0).reduce((s, x) => s + x, 0); return l ? +(w / l).toFixed(3) : w > 0 ? 999 : 0; };
  const netMark = t.map((x) => x.netR);
  const netStop = t.map((x) => x.grossR_stopFirst - x.costR);
  const netTp = t.map((x) => x.grossR_tpFirst - x.costR);
  const netExcl = t.filter((x) => !x.ambiguous).map((x) => x.netR);
  const pfStop = pfFromNet(netStop), pfTp = pfFromNet(netTp);
  const ambiguousCount = sim.ambiguous_intrabar_count;
  const ambiguityScenarios = {
    netPF_mark_ambiguous: pfFromNet(netMark),
    netPF_conservative_stop_first: pfStop,
    netPF_optimistic_tp_first: pfTp,
    netPF_excluding_ambiguous: pfFromNet(netExcl),
  };
  const pathFragilityStatus: "STABLE" | "PATH_FRAGILE" = (pfStop < 999 && pfTp < 999 && Math.abs(pfStop - pfTp) > 0.15) ? "PATH_FRAGILE" : "STABLE";

  return {
    n, grossNetR, netNetR,
    grossPF: pf(t, (x) => x.grossR), netPF: pf(t, (x) => x.netR),
    grossWinRate, netWinRate, avgCostR,
    breakevenCostR: n ? +(grossNetR / n).toFixed(4) : 0,   // max cost/trade before edge → 0
    costDragR: +(grossNetR - netNetR).toFixed(2),
    tradesPerDay: +(n / days).toFixed(2),
    maxTradesPerDayBreaches: sim.max_trades_per_day_breaches,
    signals_seen: sim.signals_seen,
    signals_blocked_by_cooldown: sim.signals_blocked_by_cooldown,
    signals_blocked_by_daily_cap: sim.signals_blocked_by_daily_cap,
    signals_blocked_by_existing_position: sim.signals_blocked_by_existing_position,
    actual_trades_taken: sim.actual_trades_taken,
    ambiguous_intrabar_count: sim.ambiguous_intrabar_count,
    grossEquity, netEquity, maxDDGrossR: ddOf(t.map((x) => x.grossR)), maxDDNetR: ddOf(t.map((x) => x.netR)),
    byYear: bucket(t, (x) => x.year), byHour: bucket(t, (x) => x.hour), byMonth: bucket(t, (x) => x.month), byDir: bucket(t, (x) => x.dir),
    scenarios, costFragile,
    finalEquity: sim.final_equity, initialEquity,
    m1Resolution: sim.m1_resolution, ambiguousCount, ambiguousRate: n ? +(ambiguousCount / n).toFixed(3) : 0,
    ambiguityScenarios, pathFragilityStatus,
    swapCostRtotal: +t.reduce((s, x) => s + (x.costBreakdown.swapCostR || 0), 0).toFixed(3),
    weekendHeldCount: t.filter((x) => x.costBreakdown.weekendHeld).length,
    monteCarlo: monteCarlo(netMark, { seed: 4242 }),
    funding: (() => {
      const equityUsd = t.map((x) => x.equityAfter);
      const finalEquity = sim.final_equity;
      let peak = initialEquity, ddUsd = 0, ddPct = 0;
      for (const e of equityUsd) { if (e > peak) peak = e; const d = e - peak; if (d < ddUsd) ddUsd = d; const dp = peak > 0 ? d / peak : 0; if (dp < ddPct) ddPct = dp; }
      return {
        initialEquity, finalEquity, profitUsd: +(finalEquity - initialEquity).toFixed(2),
        returnPct: initialEquity ? +((finalEquity / initialEquity - 1) * 100).toFixed(2) : 0,
        peakEquity: +peak.toFixed(2), maxDDUsd: +ddUsd.toFixed(2), maxDDPct: +(ddPct * 100).toFixed(2),
        sizingMode: t[0]?.sizingMode || "FIXED_R",
        ruined: sim.ruined, ruinAt: sim.ruin_time, ruinTradeIndex: sim.ruin_trade_index, equityUsd,
      };
    })(),
  };
}
