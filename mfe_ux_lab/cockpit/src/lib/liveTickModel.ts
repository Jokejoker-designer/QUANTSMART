import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
export interface LiveTick { time_msc: number; bid: number; ask: number; last: number; flags: number }
export interface LiveTickBar extends OhlcBar { tick_volume?: number; spread?: number }
export interface LiveTickFrame { cursor: string; generation: number; broker_symbol: string; ticks: LiveTick[]; bar: LiveTickBar | null; closed_bar: LiveTickBar | null; catching_up: boolean }
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function bar(v: unknown): LiveTickBar | null {
  if (!object(v) || typeof v.time !== "string" || !Number.isFinite(Date.parse(v.time)) || !finite(v.open) || !finite(v.high) || !finite(v.low) || !finite(v.close) || v.low > Math.min(v.open, v.close) || v.high < Math.max(v.open, v.close)) return null;
  return { i: 0, t: v.time, o: v.open, h: v.high, l: v.low, c: v.close, r: "N", ...(finite(v.tick_volume) ? { tick_volume: v.tick_volume } : {}), ...(finite(v.spread) ? { spread: v.spread } : {}) };
}
export function parseLiveTickFrame(value: unknown): LiveTickFrame | null {
  if (!object(value) || value.ok !== true || typeof value.cursor !== "string" || !finite(value.generation) || typeof value.broker_symbol !== "string" || !Array.isArray(value.ticks) || value.ticks.length > 8192) return null;
  const ticks: LiveTick[] = [];
  for (const tick of value.ticks) {
    if (!object(tick) || !finite(tick.time_msc) || !finite(tick.bid) || !finite(tick.ask) || !finite(tick.last) || !finite(tick.flags) || tick.bid <= 0 || tick.ask < tick.bid) return null;
    ticks.push({ time_msc: tick.time_msc, bid: tick.bid, ask: tick.ask, last: tick.last, flags: tick.flags });
  }
  const forming = bar(value.bar), closed = bar(value.closed_bar);
  if (value.bar && !forming || value.closed_bar && !closed) return null;
  return { cursor: value.cursor, generation: value.generation, broker_symbol: value.broker_symbol, ticks, bar: forming, closed_bar: closed, catching_up: value.catching_up === true };
}
// Presentation only. Never mutate the closed-bar tape consumed by research jobs.
export function withFormingBar(closed: OhlcBar[], frame: LiveTickFrame | null): OhlcBar[] {
  if (!frame?.bar || !closed.length) return closed;
  const result = closed.slice();
  for (const next of [frame.closed_bar, frame.bar]) {
    if (!next) continue;
    const tail = result[result.length - 1];
    const t = Date.parse(next.t), end = Date.parse(tail.t);
    if (t > end) result.push({ ...next, i: tail.i + 1 });
    else if (t === end && next === frame.bar) result[result.length - 1] = { ...next, i: tail.i };
  }
  return result;
}
