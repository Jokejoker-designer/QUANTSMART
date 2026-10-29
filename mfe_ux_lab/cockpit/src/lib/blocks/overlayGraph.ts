// overlayGraph — build a price-overlay FROM SCRATCH out of raw L1 primitive blocks. Each "line" is a tiny L1 chain:
//   SOURCE (close/high/low/(h+l)/2)  →  WINDOW/SMOOTH block (Raw/SMA/EMA/Roll Max/Roll Min, period)  →  optional
//   BAND offset (± Roll Std or ± ATR × mult).  These map 1:1 to existing L1 blocks (source_*, sma, ema, roll_max,
//   roll_min, roll_std, atr, add/sub/scale), so the user composes a real L1 graph that EMITS price-scale series →
//   drawn as lines/bands on the chart. Causal, no-lookahead. CONTEXT/reference only — never an order/zone/entry.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { IndicatorOverlay } from "./stdIndicators.ts";
import { emaArr, smaArr, stdArr, hiArr, loArr, atrArr } from "./stdIndicators.ts";

export type LineBase = "close" | "high" | "low" | "hl2";
export type LineOp = "raw" | "sma" | "ema" | "rmax" | "rmin";
export type BandRef = "none" | "std" | "atr";
export interface OverlayLineSpec {
  id: string; name: string; color: string;
  base: LineBase; op: LineOp; period: number;     // SOURCE → WINDOW block
  band: BandRef; bandN: number; bandMult: number;  // optional ± Std/ATR band
}

export const LINE_COLORS = ["#37c0ff", "#e3b341", "#21d07a", "#a371f7", "#f7768e", "#5ad1c4"];
export const BASE_LABEL: Record<LineBase, string> = { close: "Close", high: "High", low: "Low", hl2: "(H+L)/2" };
export const OP_LABEL: Record<LineOp, string> = { raw: "Raw", sma: "SMA", ema: "EMA", rmax: "Roll Max", rmin: "Roll Min" };
export const BAND_LABEL: Record<BandRef, string> = { none: "No band", std: "± Roll Std", atr: "± ATR" };
export const BASES: LineBase[] = ["close", "high", "low", "hl2"];
export const OPS: LineOp[] = ["raw", "sma", "ema", "rmax", "rmin"];
export const BANDS: BandRef[] = ["none", "std", "atr"];

export function baseSeries(bars: OhlcBar[], base: LineBase): number[] {
  switch (base) { case "high": return bars.map((b) => b.h); case "low": return bars.map((b) => b.l); case "hl2": return bars.map((b) => (b.h + b.l) / 2); default: return bars.map((b) => b.c); }
}
export function applyOp(s: number[], op: LineOp, period: number): number[] {
  const n = Math.max(1, Math.round(period));
  switch (op) { case "sma": return smaArr(s, n); case "ema": return emaArr(s, n); case "rmax": return hiArr(s, n); case "rmin": return loArr(s, n); default: return s.slice(); }
}

// the L1-block recipe string for a line — so the UI can show "what blocks this is made of".
export function lineRecipe(l: OverlayLineSpec): string {
  const src = BASE_LABEL[l.base], mid = l.op === "raw" ? src : `${OP_LABEL[l.op]}(${src}, ${Math.round(l.period)})`;
  if (l.band === "none") return mid;
  const off = l.band === "atr" ? `ATR(${Math.round(l.bandN)})` : `Roll Std(${src}, ${Math.round(l.bandN)})`;
  return `${mid} ± ${l.bandMult}·${off}`;
}

export function computeOverlay(bars: OhlcBar[], lines: OverlayLineSpec[]): IndicatorOverlay {
  const outLines: { name: string; color: string; series: number[] }[] = [];
  const bandList: { upper: number[]; lower: number[]; mid?: number[]; color: string }[] = [];
  for (const l of lines) {
    const mid = applyOp(baseSeries(bars, l.base), l.op, l.period);
    if (l.band === "none") { outLines.push({ name: l.name, color: l.color, series: mid }); continue; }
    const off = l.band === "atr" ? atrArr(bars, Math.max(1, Math.round(l.bandN))) : stdArr(baseSeries(bars, l.base), Math.max(1, Math.round(l.bandN)));
    bandList.push({ mid, upper: mid.map((m, i) => m + l.bandMult * off[i]), lower: mid.map((m, i) => m - l.bandMult * off[i]), color: l.color });
  }
  return { lines: outLines.length ? outLines : undefined, bandList: bandList.length ? bandList : undefined };
}

export function newLine(i: number): OverlayLineSpec {
  return { id: "ln_" + Date.now().toString(36) + i, name: "Line " + (i + 1), color: LINE_COLORS[i % LINE_COLORS.length], base: "close", op: "ema", period: 20, band: "none", bandN: 20, bandMult: 2 };
}
