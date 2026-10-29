// blockDemo — shared "run a single block on real bars for preview" helper. Feeds each block sensible demo
// inputs derived from the candles (close · EMA(close) · close-location · boolean(clv>.5)) so every block shows
// what it computes. Used by the Block Gallery + the per-block Playground (adjust params → see the effect live).
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { L1PrimitiveBlockSpec } from "./blockTypes.ts";

export interface BaseSeries { closeS: number[]; emaS: number[]; clvS: number[]; boolS: number[] }

export function baseSeriesFrom(bars: OhlcBar[]): BaseSeries {
  const closeS = bars.map((b) => b.c);
  const k = 2 / 11; let e = closeS[0] ?? 0;
  const emaS = closeS.map((v, i) => (i === 0 ? (e = v) : (e = v * k + e * (1 - k))));
  const clvS = bars.map((b) => { const r = b.h - b.l || 1e-9; return Math.min(1, Math.max(0, (b.c - b.l) / r)); });
  const boolS = clvS.map((v) => (v > 0.5 ? 1 : 0));
  return { closeS, emaS, clvS, boolS };
}

export const defaultParams = (b: L1PrimitiveBlockSpec): Record<string, number> => Object.fromEntries(b.parameters.map((p) => [p.name, p.defaultValue]));

// compute a block's value-series on `bars` with `params`; null for pure control nodes (no compute).
export function computeBlockSeries(b: L1PrimitiveBlockSpec, bars: OhlcBar[], base: BaseSeries, params: Record<string, number>): number[] | null {
  if (!b.compute) return null;
  const ports = b.inputs.filter((p) => p.type !== "STREAM_OHLC");
  const inputs = ports.map((p, k) => (p.type === "BOOL" ? base.boolS : k === 0 ? base.closeS : k === 1 ? base.emaS : base.clvS));
  const s = new Array(bars.length).fill(0);
  try { for (let i = 0; i < bars.length; i++) s[i] = b.compute!({ bars, i, params, inputs }); } catch { /* leave zeros */ }
  return s;
}
