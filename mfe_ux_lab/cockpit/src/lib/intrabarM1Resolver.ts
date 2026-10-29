// intrabarM1Resolver — resolve SL vs TP order using M1 bars after entry (P1).
// M1 path is APPROXIMATE, not tick-exact: if one M1 candle touches BOTH SL and TP we cannot know
// the true order → AMBIGUOUS_SAME_M1. Never silently assume. Default policy = MARK_AMBIGUOUS.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export type IntrabarOutcome =
  | "TP_FIRST" | "SL_FIRST" | "AMBIGUOUS_SAME_M1" | "NO_TOUCH" | "GAP_THROUGH_SL" | "GAP_THROUGH_TP";

export type AmbiguityPolicy =
  | "MARK_AMBIGUOUS" | "CONSERVATIVE_STOP_FIRST" | "OPTIMISTIC_TP_FIRST" | "EXCLUDE_AMBIGUOUS" | "TICK_REQUIRED";

export interface IntrabarResolveResult {
  outcome: IntrabarOutcome;
  exitTime?: string;
  exitPrice?: number;        // realized exit under the policy (for AMBIGUOUS: stop-first unless OPTIMISTIC)
  ambiguous: boolean;
  ambiguityPolicy: AmbiguityPolicy;
  m1BarsScanned: number;
  warnings: string[];
}

// scan the M1 children of ONE design bar (in order); return the first decisive outcome.
export function resolveIntrabarM1(
  dir: "BUY" | "SELL", sl: number, tp: number, m1Bars: OhlcBar[], policy: AmbiguityPolicy = "MARK_AMBIGUOUS",
): IntrabarResolveResult {
  const warnings: string[] = []; let scanned = 0;
  const base: IntrabarResolveResult = { outcome: "NO_TOUCH", ambiguous: false, ambiguityPolicy: policy, m1BarsScanned: 0, warnings };
  for (const b of m1Bars) {
    scanned++;
    // gap-through at the open (price jumped past a level before any intrabar travel)
    if (dir === "BUY") {
      if (b.o <= sl) return { ...base, outcome: "GAP_THROUGH_SL", exitTime: b.t, exitPrice: b.o, m1BarsScanned: scanned, warnings: [...warnings, "gap-through SL"] };
      if (b.o >= tp) return { ...base, outcome: "GAP_THROUGH_TP", exitTime: b.t, exitPrice: b.o, m1BarsScanned: scanned, warnings: [...warnings, "gap-through TP"] };
    } else {
      if (b.o >= sl) return { ...base, outcome: "GAP_THROUGH_SL", exitTime: b.t, exitPrice: b.o, m1BarsScanned: scanned, warnings: [...warnings, "gap-through SL"] };
      if (b.o <= tp) return { ...base, outcome: "GAP_THROUGH_TP", exitTime: b.t, exitPrice: b.o, m1BarsScanned: scanned, warnings: [...warnings, "gap-through TP"] };
    }
    const slHit = dir === "BUY" ? b.l <= sl : b.h >= sl;
    const tpHit = dir === "BUY" ? b.h >= tp : b.l <= tp;
    if (slHit && tpHit) {
      const optimistic = policy === "OPTIMISTIC_TP_FIRST";
      return { outcome: "AMBIGUOUS_SAME_M1", exitTime: b.t, exitPrice: optimistic ? tp : sl, ambiguous: true, ambiguityPolicy: policy, m1BarsScanned: scanned, warnings: [...warnings, "SL & TP in one M1 candle — order unknown, tick required"] };
    }
    if (slHit) return { ...base, outcome: "SL_FIRST", exitTime: b.t, exitPrice: sl, m1BarsScanned: scanned };
    if (tpHit) return { ...base, outcome: "TP_FIRST", exitTime: b.t, exitPrice: tp, m1BarsScanned: scanned };
  }
  return { ...base, m1BarsScanned: scanned };
}
