// RESEARCH / SHADOW_ONLY / NO_DECISION. Read-only presentation measurements, never execution signals.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export interface MarketSnapshot {
  bars: OhlcBar[]; price: number; as_of: string; source: string; symbol: string; timeframe: string;
  total_bars: number; source_hash: string; indicator_lookback: number;
  indicators: { ema10: number; ema34: number; atr14: number };
}
export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
// Percentile is a descriptive rank of the latest true range in this visible window, not danger/probability.
export function rangePercentile(bars: OhlcBar[]): number | null {
  if (bars.length < 30) return null;
  const ranges = bars.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - bars[i].c), Math.abs(b.l - bars[i].c)));
  if (ranges.some((n) => !Number.isFinite(n))) return null;
  const last = ranges[ranges.length - 1];
  const lower = ranges.filter((n) => n < last).length, tied = ranges.filter((n) => n === last).length;
  return Math.round(100 * (lower + tied / 2) / ranges.length);
}
export function observedBias(market: Pick<MarketSnapshot, "indicators"> | null) {
  const fast = finite(market?.indicators.ema10), slow = finite(market?.indicators.ema34), atr = finite(market?.indicators.atr14);
  if (fast === null || slow === null || atr === null || atr <= 0) return null;
  const gap = (fast - slow) / atr;
  return { side: gap > 0 ? "UP" : gap < 0 ? "DOWN" : "FLAT", gapAtr: gap, gauge: Math.min(100, Math.abs(gap) / 2 * 100) };
}
// Local OHLC timestamps identify bar opens. Compare only bars whose closing time
// is no later than the displayed chart bar's close, including higher timeframes.
export function closedFrameCutoff(asOf: string, chartTf: string, frameTf: string): string | null {
  const minutes: Record<string, number> = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080 };
  if (!minutes[chartTf] || !minutes[frameTf]) return null;
  const timestamp = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(asOf) ? asOf : asOf.replace(" ", "T") + "Z");
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + (minutes[chartTf] - minutes[frameTf]) * 60000).toISOString().slice(0, 19);
}
export function sessionAt(iso?: string) {
  const date = iso ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : iso.replace(" ", "T") + "Z") : null;
  if (!date || !Number.isFinite(date.getTime())) return { label: "Not available", time: "—", elapsed: null };
  const h = date.getUTCHours(), minutes = h * 60 + date.getUTCMinutes();
  return { label: h >= 12 && h < 16 ? "London / New York" : h >= 7 && h < 16 ? "London" : h >= 12 && h < 21 ? "New York" : h < 8 ? "Asia" : "Off-hours", time: date.toISOString().slice(11, 16) + " UTC", elapsed: minutes / 1440 * 100 };
}
