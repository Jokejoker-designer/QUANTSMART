// CH-WO-0 — the confirmed_swing rule (risk #4: pivots must have RIGHT-bar confirmation, else lookahead).
// A pivot at bar k is a local CLOSE extreme over [k-lookback_left, k+lookback_right]; it is only KNOWN —
// and only usable — at `confirm_index = k + lookback_right + confirmation_delay_bars` (every confirming bar
// has CLOSED). This generalises structureContext.computeSwingLevels (the symmetric W=left=right, delay=0
// case) to asymmetric windows + an explicit settle delay. DESCRIPTIVE geometry only — never predictive.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";

export interface ConfirmedSwingConfig {
  lookback_left: number;          // bars to the LEFT that must be lower/higher
  lookback_right: number;         // bars to the RIGHT that must be lower/higher (the no-lookahead cost)
  confirmation_delay_bars: number; // extra settle bars after the right window before the pivot is "usable"
}
export const DEFAULT_SWING_CONFIG: ConfirmedSwingConfig = { lookback_left: 5, lookback_right: 5, confirmation_delay_bars: 0 };

export interface ConfirmedSwing {
  k: number;                      // the pivot bar index
  price: number;                  // the pivot's high (for a high) / low (for a low)
  kind: "high" | "low";
  confirm_index: number;          // FIRST bar index at which this pivot is known (causal cutoff)
}

// detect confirmed swings over the CLOSE series (continuous-market opens carry prior close → close pivots
// are the stable choice, matching computeSwingLevels). Recorded level price = the bar's high/low.
export function confirmedSwings(bars: OhlcBar[], cfg: ConfirmedSwingConfig = DEFAULT_SWING_CONFIG): ConfirmedSwing[] {
  const { lookback_left: L, lookback_right: R, confirmation_delay_bars: D } = cfg;
  const out: ConfirmedSwing[] = []; const n = bars.length; const c = bars.map((b) => b.c);
  for (let k = L; k < n - R; k++) {
    let isHigh = true, isLow = true;
    for (let j = k - L; j <= k + R; j++) { if (j === k) continue; if (c[j] >= c[k]) isHigh = false; if (c[j] <= c[k]) isLow = false; }
    const confirm = k + R + D;
    if (isHigh) out.push({ k, price: bars[k].h, kind: "high", confirm_index: confirm });
    if (isLow) out.push({ k, price: bars[k].l, kind: "low", confirm_index: confirm });
  }
  return out;
}

// CAUSAL query: the swings KNOWN as-of bar i (confirm_index ≤ i). This is the only sanctioned way for an
// AsOf episode builder to read swings — a pivot whose confirmation is in the future is invisible here.
export function swingsAsOf(swings: ConfirmedSwing[], i: number): ConfirmedSwing[] {
  return swings.filter((s) => s.confirm_index <= i);
}

// the as-of cutoff a pivot imposes: a decision at bar i may use pivot k only if i ≥ confirm_index.
export function isConfirmedBy(swing: ConfirmedSwing, i: number): boolean {
  return swing.confirm_index <= i;
}
