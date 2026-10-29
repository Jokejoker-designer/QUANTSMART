// cardLiveSignal — "what is this Strategy Card deciding RIGHT NOW?" for the Home co-trade panel. Runs the card on the
// recent LIVE bars through the SAME realistic engine-of-record (runRealisticSim) that Microscope/Strategy Lab/ablation
// use — so the live decision matches the backtest exactly (one engine; the integrity audit's only gap, now closed).
// Reads the decision at the latest bar: a fresh entry on the last (or previous) bar → BUY/SELL, otherwise STAND_ASIDE.
// Returns the last few resolved (NET) shadow trades WITH their REAL entry rationale. Advisory · no order sent here ·
// DEMO-only execution is gated separately in the panel. Causal: every decision at bar i uses data ≤ i.
import { runRealisticSim } from "./realisticStrategySim.ts";
import { cloneSimConfig, DEFAULT_REALISTIC_SIM_CONFIG, type Timeframe } from "./simConfig.ts";
import { getSymbolSpec } from "./symbolSpec.ts";
import { getActiveSymbol } from "./activeSymbolStore.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export type CardSide = "BUY" | "SELL" | "STAND_ASIDE";
export interface CardLiveSignal {
  side: CardSide;
  asOf: string;             // timestamp of the latest closed bar the decision is based on
  price: number;            // latest close (suggested entry reference)
  freshBarsAgo: number | null;   // bars since the most recent entry (0 = this bar, null = none)
  totalSignals: number;     // total entries the card would have taken over the live window (activity level)
  recent: { dir: "BUY" | "SELL"; t: string; R: number; outcome: "TP" | "SL" }[];   // last resolved shadow trades (NET R)
  openShadow: { dir: "BUY" | "SELL"; entryT: string; entry: number } | null;        // a shadow position still open at the last bar
  atr: number;              // ATR(14) at the last bar — for the SL/TP suggestion
  suggestSl: number;        // suggested protective stop (per the card's RR design) · 0 when STAND_ASIDE
  suggestTp: number;        // suggested target (per the card's RR design) · 0 when STAND_ASIDE
  segs: { entryI: number; entry: number; exitI: number; exit: number; dir: "BUY" | "SELL"; outcome: "TP" | "SL"; R: number; why?: string[] }[];   // recent shadow trades WITH bar indices + REAL rationale → plot on the live chart
}

// spec is resolved PER CALL from the active symbol — getSymbolSpec is fail-closed (non-gold w/o broker spec
// → MISSING spec, money-math blocked), so switching asset can never silently price with gold's contract.

// freshWithin: how recent an entry must be to count as a LIVE actionable signal (in bars). 1 = entered on the last or
// the previous bar (covers poll cadence vs bar-close timing). designTf = the card's thesis/execution timeframe.
export function cardLiveSignal(modules: string[], autoRR: boolean, bars: OhlcBar[] | null, freshWithin = 1, designTf: Timeframe = "H1"): CardLiveSignal {
  const empty: CardLiveSignal = { side: "STAND_ASIDE", asOf: "", price: 0, freshBarsAgo: null, totalSignals: 0, recent: [], openShadow: null, atr: 0, suggestSl: 0, suggestTp: 0, segs: [] };
  if (!bars || bars.length < 60) return empty;
  const last = bars.length - 1;
  // run the REALISTIC engine-of-record on the recent bars (next-open fill, costs, discipline — same as the backtest)
  const cfg = cloneSimConfig(DEFAULT_REALISTIC_SIM_CONFIG); cfg.designTf = designTf; cfg.executionTf = designTf;
  const sym = getActiveSymbol();
  const sim = runRealisticSim(bars, Array.isArray(modules) ? modules : [], autoRR, { cfg, spec: getSymbolSpec(sym), designTf, cardId: "live", symbol: sym });
  const entryMarks = sim.markers.filter((m) => m.kind === "buy" || m.kind === "sell");
  const exitMarks = sim.markers.filter((m) => m.kind === "tp" || m.kind === "sl");
  const lastEntry = entryMarks.length ? entryMarks[entryMarks.length - 1] : null;
  const lastExitI = exitMarks.length ? exitMarks[exitMarks.length - 1].i : -1;
  const freshBarsAgo = lastEntry ? last - lastEntry.i : null;
  const fresh = lastEntry != null && freshBarsAgo != null && freshBarsAgo <= freshWithin;
  // an entry after the last exit (and not yet closed) → the card is still "in" a shadow position at the last bar
  const openEntry = lastEntry && lastEntry.i > lastExitI ? lastEntry : null;
  const dirOf = (kind: string): "BUY" | "SELL" => (kind === "buy" ? "BUY" : "SELL");
  const side: CardSide = fresh ? dirOf(lastEntry!.kind) : openEntry ? dirOf(openEntry.kind) : "STAND_ASIDE";
  const recent = sim.trades.slice(-6).reverse().map((t) => ({ dir: t.dir, t: t.fill_time, R: +t.netR.toFixed(2), outcome: t.outcome }));
  const openShadow = openEntry ? { dir: dirOf(openEntry.kind), entryT: bars[openEntry.i]?.t ?? "", entry: openEntry.price } : null;

  // ATR(14) at the last bar → SL/TP suggestion follows the card's RR DESIGN (mirror realisticStrategySim's auto_rr):
  // a card with an RR module gets structure-based levels; only a card with no RR module falls back to 1·ATR / 2·ATR.
  let s = 0, c = 0; for (let i = Math.max(1, last - 14); i <= last; i++) { s += Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); c++; }
  const atr = c ? s / c : 0, px = bars[last]?.c ?? 0, dirSign = side === "BUY" ? 1 : side === "SELL" ? -1 : 0;
  const mods = Array.isArray(modules) ? modules : [];
  const hasRR = autoRR || mods.includes("auto_rr") || mods.includes("distribution_rr");
  let suggestSl = 0, suggestTp = 0;
  if (dirSign) {
    if (hasRR) {
      const w5 = bars.slice(Math.max(0, last - 5), last + 1), w20 = bars.slice(Math.max(0, last - 20), last + 1);
      suggestSl = +(side === "BUY" ? Math.min(...w5.map((x) => x.l)) - 0.1 * atr : Math.max(...w5.map((x) => x.h)) + 0.1 * atr).toFixed(2);
      suggestTp = +(side === "BUY" ? Math.max(...w20.map((x) => x.h)) : Math.min(...w20.map((x) => x.l))).toFixed(2);
    } else { suggestSl = +(px - dirSign * atr).toFixed(2); suggestTp = +(px + dirSign * 2 * atr).toFixed(2); }
  }
  return {
    side, asOf: bars[last]?.t ?? "", price: px, freshBarsAgo, totalSignals: entryMarks.length, recent, openShadow,
    atr: +atr.toFixed(2), suggestSl, suggestTp,
    segs: sim.trades.slice(-6).map((t) => ({ entryI: t.entryI, entry: t.entry_effective, exitI: t.exitI, exit: t.exit_effective ?? t.entry_effective, dir: t.dir, outcome: t.outcome, R: +t.netR.toFixed(2), why: t.why })),
  };
}
