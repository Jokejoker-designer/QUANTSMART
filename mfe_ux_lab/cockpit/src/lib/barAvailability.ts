import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { TF_MINUTES } from "./simTimeframe.ts";
import type { Timeframe } from "./simConfig.ts";

/** Naive source timestamps follow the application's UTC tape contract. */
export function barTimeMs(time: string): number {
  const normalized = time.replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(normalized) ? normalized : normalized + "Z");
}

/** A bar's H/L/C becomes available at its declared close boundary. */
export function barCloseTimes(bars: OhlcBar[], timeframe: Timeframe): number[] {
  const duration = TF_MINUTES[timeframe] * 60000;
  if (!Number.isFinite(duration)) throw new Error("INVALID_AVAILABILITY_TIMEFRAME");
  let previous = -Infinity;
  return bars.map(bar => {
    const open = barTimeMs(bar.t);
    if (!Number.isFinite(open) || open <= previous)
      throw new Error("INVALID_AVAILABILITY_TIMESTAMPS");
    previous = open;
    return open + duration;
  });
}

/** Upper-bound search includes a bar that closes exactly at the decision time. */
export function completedBarIndex(closeTimes: number[], decisionMs: number): number | null {
  if (!Number.isFinite(decisionMs)) return null;
  let left = 0;
  let right = closeTimes.length;
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    if (closeTimes[middle] <= decisionMs) left = middle + 1;
    else right = middle;
  }
  return left > 0 ? left - 1 : null;
}
