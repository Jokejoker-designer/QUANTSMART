// cardEvidence — Bước B: REAL card-derived numbers for Home's "Evidence Independence" + "MTF Bias Stack" (so they
// reflect THE CARD, not the generic advisor — and never a relabel of the advisor's numbers). Two honest readings:
//   • cardEvidence(modules)  → groups the card's OWN modules into evidence families → independent-family count +
//     raw evidence votes + echo class. Heuristic family map (advisory) — it's the card's actual composition.
//   • cardMtfBias(...)       → runs the card's engine on EACH timeframe's recent tape → its directional lean per TF.
import { cardLiveSignal } from "./cardLiveSignal.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

// EVIDENCE families = independent directional evidence sources. Risk/Zone/Safety are NOT evidence (excluded from
// the independence count). Keyword match (advisory grouping; module ids vary so we match substrings).
const FAMILY_RULES: [RegExp, string][] = [
  [/reclaim|range_fade|breakout|trend_pullback|sweep_reclaim|pullback.*trig/, "Trigger"],
  [/rsi|ema_slope|momentum|macd|stoch/, "Momentum"],
  [/atr|volatil|bolling/, "Volatility"],
  [/liquid|sr_zone|level_mem|depth|pool|sweep_risk|sweep_depth/, "Liquidity"],
  [/ichimoku|structure|ema_stack|swing|trend_struct/, "Structure"],
  [/pressure|wick/, "Pressure"],
  [/regime|session|hour|mtf|news|context/, "Context"],
  [/auto_rr|ev_model|drift_guard|distribution_rr|position|risk/, "Risk"],
  [/avoid_zone|confirm|demand_zone|zone/, "Zone"],
  [/guard|kidi|lookahead|synthetic|authority|data_quality/, "Safety"],
];
const EVIDENCE_FAMS = new Set(["Trigger", "Momentum", "Volatility", "Liquidity", "Structure", "Pressure", "Context"]);
function familyOf(id: string): string { const s = (id || "").toLowerCase(); for (const [re, fam] of FAMILY_RULES) if (re.test(s)) return fam; return "Other"; }

export interface CardEvidence {
  rawVotes: number;          // # of directional EVIDENCE modules (guards/zones/risk excluded)
  families: string[];        // distinct EVIDENCE families the card combines
  familyCount: number;
  echoClass: string;         // INDEPENDENT (≥4) / PARTIAL_ECHO (2-3) / HIGH_ECHO (1) / NO_EVIDENCE (0)
  byFamily: Record<string, string[]>;
}
export function cardEvidence(modules: string[]): CardEvidence {
  const mods = Array.isArray(modules) ? modules : [];
  const byFamily: Record<string, string[]> = {};
  for (const m of mods) { const fam = familyOf(m); (byFamily[fam] ||= []).push(m); }
  const families = Object.keys(byFamily).filter((f) => EVIDENCE_FAMS.has(f)).sort();
  const rawVotes = families.reduce((s, f) => s + byFamily[f].length, 0);
  const familyCount = families.length;
  const echoClass = familyCount >= 4 ? "INDEPENDENT" : familyCount >= 2 ? "PARTIAL_ECHO" : familyCount === 1 ? "HIGH_ECHO" : "NO_EVIDENCE";
  return { rawVotes, families, familyCount, echoClass, byFamily };
}

// the card's directional lean per timeframe (from running its engine on each TF's recent tape). buy_pct/sell_pct =
// the card's actual BUY-vs-SELL split on that TF's recent shadow trades, nudged toward its current live side.
export interface CardMtfRow { tf: string; buy_pct: number; sell_pct: number; side: "BUY" | "SELL" | "STAND_ASIDE"; n: number }
const TF_ORD: Record<string, number> = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080 };
export function cardMtfBias(modules: string[], autoRR: boolean, barsByTf: Record<string, OhlcBar[]>): CardMtfRow[] {
  const rows: CardMtfRow[] = [];
  for (const tf of Object.keys(barsByTf)) {
    const bars = barsByTf[tf];
    if (!bars || bars.length < 30) continue;
    const sig = cardLiveSignal(modules, autoRR, bars);
    const buys = sig.recent.filter((r) => r.dir === "BUY").length, sells = sig.recent.filter((r) => r.dir === "SELL").length, tot = buys + sells;
    let buyPct = tot ? Math.round((buys / tot) * 100) : 50;
    if (sig.side === "BUY") buyPct = Math.max(buyPct, 60);
    if (sig.side === "SELL") buyPct = Math.min(buyPct, 40);
    rows.push({ tf, buy_pct: buyPct, sell_pct: 100 - buyPct, side: sig.side, n: sig.totalSignals });
  }
  rows.sort((a, b) => (TF_ORD[a.tf] || 0) - (TF_ORD[b.tf] || 0));
  return rows;
}
