// cardTaxonomy — classify a Strategy Card along 12 dimensions. EVERY dimension carries its SOURCE so
// honesty is preserved: "backtest" = measured from the real realistic run · "modules"/"config" = derived
// from composition · "manifest"/"verdict" = from truth contract + honesty engine · "heuristic" = inferred
// (not a real environment measurement) · "user" = user-assigned (no model in code). Modeled · advisory.
import type { RealisticBacktest } from "./realisticSimRun.ts";
import { honestyVerdict, type TrustLevel } from "./simHonesty.ts";

export type DimSource = "spec" | "card" | "backtest" | "modules" | "config" | "manifest" | "verdict" | "heuristic" | "user";
export interface Dim { value: string; source: DimSource; note?: string }
export interface CardClassification {
  symbol: Dim; timeframe: Dim; session: Dim; monthQuarter: Dim; regime: Dim; volatility: Dim;
  liquiditySpread: Dim; patternFamily: Dim; riskStyle: Dim; roleInBeast: Dim; truthLevel: Dim; honestyVerdict: Dim;
}

const has = (mods: string[], id: string) => mods.includes(id);
const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dominantSession(byHour: Record<string, { n: number }>): string {
  const ent = Object.entries(byHour); if (!ent.length) return "—";
  const buckets: Record<string, number> = { "Asia (thin)": 0, "London": 0, "London/NY overlap": 0, "New York": 0 };
  for (const [h, v] of ent) { const hr = +h; const k = hr < 7 || hr >= 21 ? "Asia (thin)" : hr < 13 ? "London" : hr < 16 ? "London/NY overlap" : "New York"; buckets[k] += v.n; }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
}
function bestMonthQuarter(byMonth: Record<string, { n: number; netR: number }>): string {
  const ent = Object.entries(byMonth).filter(([, v]) => v.n >= 3); if (!ent.length) return "—";
  const best = ent.sort((a, b) => b[1].netR - a[1].netR)[0]; const m = +best[0];
  return `${MON[m] || best[0]} (Q${Math.ceil(m / 3)})`;
}

// pattern family ("hệ") — from the dominant trigger/logic module. PURE (no backtest) so the Album can
// classify a card's family even before a run exists. classifyCard reuses this → single source, no drift.
export function patternFamilyOf(mods: string[]): string {
  const h = (id: string) => mods.includes(id);
  return h("trend_pullback") ? "Trend-pullback"
    : h("sweep_reclaim") ? "Sweep-reclaim"
    : h("range_fade") || h("bollinger") ? "Range-fade / mean-revert"
    : h("ichimoku") || h("macd") || h("ema_trend") ? "Trend / momentum"
    : h("fib_retrace") ? "Fibonacci pullback"
    : h("stochastic") ? "Oscillator mean-revert"
    : "Mixed / unclassified";
}

export function classifyCard(card: any, bt: RealisticBacktest): CardClassification {
  const mods: string[] = Array.isArray(card?.modules) ? card.modules : [];
  const a = bt.analytics;

  // pattern family — from the dominant trigger/logic module
  const pattern = patternFamilyOf(mods);

  // regime — heuristic from modules
  const trendish = ["trend_pullback", "ichimoku", "macd", "ema_trend", "ema_slope", "adx"].some((m) => has(mods, m));
  const rangeish = ["range_fade", "bollinger", "stochastic", "sweep_reclaim"].some((m) => has(mods, m));
  const regime = trendish && rangeish ? "Mixed" : trendish ? "Trending" : rangeish ? "Ranging / mean-revert" : "Unspecified";

  // volatility preference — heuristic from filters
  const vol = has(mods, "adx") ? "Prefers active trend (ADX-gated)"
    : has(mods, "atr_vol") || has(mods, "atr_pct") ? "Vol-filtered"
    : has(mods, "no_trade_chop") ? "Avoids chop" : "Vol-agnostic";

  // risk style — from RR modules + sizing
  const rr = has(mods, "distribution_rr") ? "Distribution R:R" : has(mods, "auto_rr") ? "Auto R:R (structure)" : "Fixed 1 ATR / TP-cap";
  const sizing = bt.manifest.risk_model.sizingMode === "PERCENT_EQUITY" ? `${bt.manifest.risk_model.riskPctEquity}%-equity` : "Fixed-R";
  const guards = ["drift_guard", "sr_zone_context", "level_memory", "no_trade_chop", "calib_trust"].filter((m) => has(mods, m)).length;
  const riskStyle = `${rr} · ${sizing}${guards ? ` · ${guards} guard${guards > 1 ? "s" : ""}` : ""}`;

  // role inside Beast — no portfolio model in code → heuristic suggestion, user-overridable
  const trust = honestyVerdict(a, bt.walkForward, bt.calibration?.level ?? "FULLY_PROVISIONAL").trust;
  const roleSuggest: Record<TrustLevel, string> = { ROBUST_IN_SIM: "Core candidate (still modeled)", CONDITIONAL_EDGE: "Satellite / watch", FRAGILE_EDGE: "Experimental", NO_EDGE_AFTER_COST: "Reject / library-only" };
  const roleInBeast: Dim = card?.role ? { value: card.role, source: "user" } : { value: roleSuggest[trust] + " (suggested)", source: "user", note: "Suggested from the research assessment; not a measured ensemble model." };

  const dominant = dominantSession(a.byHour as Record<string, { n: number }>);
  const liq = /overlap/.test(dominant) ? "Tight (overlap)" : /Asia/.test(dominant) ? "Wide (Asia thin)" : "Normal";

  return {
    symbol: { value: bt.manifest.symbol || "XAUUSD", source: "spec" },
    timeframe: { value: bt.designTf, source: "card" },
    session: { value: dominant, source: "backtest", note: "Most frequently traded session under the stated broker-time convention." },
    monthQuarter: { value: bestMonthQuarter(a.byMonth as Record<string, { n: number; netR: number }>), source: "backtest", note: "Highest measured net-result month with the minimum sample." },
    regime: { value: regime, source: "heuristic", note: "Inferred from selected modules, not an observed regime measurement." },
    volatility: { value: vol, source: "heuristic" },
    liquiditySpread: { value: liq, source: "heuristic", note: "Session-derived estimate; actual spread requires broker calibration." },
    patternFamily: { value: pattern, source: "modules" },
    riskStyle: { value: riskStyle, source: "config" },
    roleInBeast,
    truthLevel: { value: `${bt.manifest.truth_contract.costTruth} · ${bt.manifest.truth_contract.pathTruth}`, source: "manifest" },
    honestyVerdict: { value: trust, source: "verdict" },
  };
}

export const DIM_LABELS: [keyof CardClassification, string][] = [
  ["symbol", "Symbol"], ["timeframe", "Timeframe"], ["session", "Session"], ["monthQuarter", "Month / Quarter"],
  ["regime", "Regime"], ["volatility", "Volatility"], ["liquiditySpread", "Liquidity / Spread"], ["patternFamily", "Pattern family"],
  ["riskStyle", "Risk style"], ["roleInBeast", "Role inside Beast"], ["truthLevel", "Truth level"], ["honestyVerdict", "Honesty verdict"],
];
