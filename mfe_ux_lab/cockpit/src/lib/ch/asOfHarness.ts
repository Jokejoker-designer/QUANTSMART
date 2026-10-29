// CH-WO-0 — the NO-LOOKAHEAD test harness. The accept criterion for every CH builder: "inject T+1 future →
// output unchanged OR LookaheadError". Built on the WO-6 causal primitive `asOfHigherTf` (the exact closed-
// as-of-t map). This file is the TOOL + its self-proof (it must FLAG a deliberately-leaky builder and PASS a
// causal one); the real episode builder it guards is CH-WO-1.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "../simConfig.ts";
import { asOfHigherTf } from "../moduleTfScope.ts";
import { barTime } from "../stageWindow.ts";

export class LookaheadError extends Error {
  constructor(message: string) { super(message); this.name = "LookaheadError"; }
}

// an output item keyed to the bar index at which it becomes KNOWN (e.g. a confirmed swing's confirm_index).
export interface CausalItem { at: number }

const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const byAt = (a: CausalItem, b: CausalItem) => a.at - b.at;

// CORE invariant: a builder is causal iff its outputs for bars ≤ cutoff are identical whether or not bars
// AFTER cutoff are present. Returns true; throws LookaheadError on the first divergence (a leak).
export function assertCausal<T extends CausalItem>(
  build: (bars: OhlcBar[]) => T[], bars: OhlcBar[], cutoff: number, eq: (a: T, b: T) => boolean = deepEq,
): boolean {
  const past = build(bars.slice(0, cutoff + 1)).filter((x) => x.at <= cutoff).sort(byAt);
  const full = build(bars).filter((x) => x.at <= cutoff).sort(byAt);
  if (past.length !== full.length) throw new LookaheadError(`lookahead: count for bars ≤${cutoff} changed ${past.length}→${full.length} when future bars added`);
  for (let i = 0; i < past.length; i++) if (!eq(past[i], full[i])) throw new LookaheadError(`lookahead: output for bar ${past[i].at} changed when future bars were added`);
  return true;
}

// append `n` synthetic FUTURE bars (extreme spike, timestamps continuing the cadence) — the "inject T+1".
export function appendSyntheticFuture(bars: OhlcBar[], n = 1): OhlcBar[] {
  if (bars.length < 2) return bars.slice();
  const last = bars[bars.length - 1], prev = bars[bars.length - 2];
  const dt = barTime(last) - barTime(prev);                 // inter-bar delta in ms
  const spike = last.c * 1.5 + 1000;                        // wildly different → maximises leak detection
  const out = bars.slice();
  for (let i = 1; i <= n; i++) {
    const t = new Date(barTime(last) + dt * i).toISOString().replace(".000Z", "Z");
    out.push({ t, o: spike, h: spike * 1.01, l: spike * 0.99, c: spike } as unknown as OhlcBar);
  }
  return out;
}

// smoke that the injected future leaves past outputs untouched (the generic accept test for any CH builder).
export function noLookaheadSmoke<T extends CausalItem>(build: (bars: OhlcBar[]) => T[], bars: OhlcBar[], cutoff?: number): boolean {
  const cut = cutoff ?? Math.max(1, bars.length - 4);
  return assertCausal(build, appendSyntheticFuture(bars, 2), cut);
}

// asOf-specific smoke built directly on asOfHigherTf: a higher-TF bar injected AFTER all design decisions
// must NOT change any past design bar's as-of higher-bar index. (Ties the harness to the WO-6 primitive.)
export function asOfHigherTfSmoke(designBars: OhlcBar[], higherBars: OhlcBar[], designTf: Timeframe, higherTf: Timeframe): boolean {
  const future = appendSyntheticFuture(higherBars, 1);
  const base = asOfHigherTf(designBars, higherBars, designTf, higherTf);
  const withFuture = asOfHigherTf(designBars, future, designTf, higherTf);
  for (let i = 0; i < designBars.length; i++) {
    if (base[i] !== withFuture[i]) throw new LookaheadError(`asOf[${i}] (design bar) changed ${base[i]}→${withFuture[i]} when a FUTURE higher bar was added`);
  }
  return true;
}
