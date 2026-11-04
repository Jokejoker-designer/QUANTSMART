import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export interface ConfirmedPricePivot {
  i: number;
  price: number;
  dir: "high" | "low";
  confirmIndex: number;
}

/** Symmetric price pivots can first be displayed at the confirming candle close. */
export function confirmedPricePivots(bars: OhlcBar[], strength = 3): ConfirmedPricePivot[] {
  if (!Number.isInteger(strength) || strength < 1) throw new Error("INVALID_PIVOT_STRENGTH");
  const result: ConfirmedPricePivot[] = [];
  for (let i = strength; i < bars.length - strength; i++) {
    let high = true;
    let low = true;
    for (let distance = 1; distance <= strength; distance++) {
      if (bars[i].h < bars[i - distance].h || bars[i].h < bars[i + distance].h) high = false;
      if (bars[i].l > bars[i - distance].l || bars[i].l > bars[i + distance].l) low = false;
    }
    if (high) result.push({ i, price: bars[i].h, dir: "high", confirmIndex: i + strength });
    else if (low) result.push({ i, price: bars[i].l, dir: "low", confirmIndex: i + strength });
  }
  return result;
}

export function pivotsAvailableAt(pivots: ConfirmedPricePivot[], revealedIndex: number) {
  return pivots.filter(pivot => pivot.confirmIndex <= revealedIndex);
}
