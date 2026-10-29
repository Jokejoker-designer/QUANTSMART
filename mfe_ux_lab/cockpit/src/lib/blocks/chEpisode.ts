// chEpisode — the CH Episode Lens engine: read the recent multi-bar structure and label which "episode" the market
// is in (running up/down, expanding, contracting, pulling back, ranging). Fully CAUSAL — every value at bar i uses
// only bars[0..i]. This is an APPROXIMATION of the (still manager-gated) Candle-Hierarchy episode concept; it is
// CONTEXT/advisory only — never an entry/zone/order. Segments group contiguous same-state bars into episodes.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { atrArr, smaArr } from "./stdIndicators.ts";

export type EpisodeState = "RUN_UP" | "RUN_DOWN" | "EXPANSION" | "CONTRACTION" | "PULLBACK" | "RANGE";
export const EPISODE_STATES: EpisodeState[] = ["RUN_UP", "RUN_DOWN", "EXPANSION", "CONTRACTION", "PULLBACK", "RANGE"];
export const EPISODE_META: Record<EpisodeState, { code: number; label: string; color: string; icon: string; note: string }> = {
  RUN_UP: { code: 0, label: "Upward run", color: "#21d07a", icon: "↑", note: "Accumulated positive body direction" },
  RUN_DOWN: { code: 1, label: "Downward run", color: "#f7768e", icon: "↓", note: "Accumulated negative body direction" },
  EXPANSION: { code: 2, label: "Volatility expansion", color: "#e3b341", icon: "⤢", note: "Expansion relative to the stated baseline" },
  CONTRACTION: { code: 3, label: "Contraction", color: "#58a6ff", icon: "⤡", note: "Volatility compression" },
  PULLBACK: { code: 4, label: "Pullback", color: "#a371f7", icon: "↩", note: "Recent movement against the longer run" },
  RANGE: { code: 5, label: "Range", color: "#5b6b7d", icon: "↔", note: "No resolved directional or expansion classification" },
};

export interface EpisodeSeg { id: number; state: EpisodeState; start: number; end: number; len: number; dir: number }
export interface EpisodeResult { score: number[]; state: EpisodeState[]; segments: EpisodeSeg[] }

export function computeEpisodes(bars: OhlcBar[], window = 20): EpisodeResult {
  const n = bars.length;
  const atr = atrArr(bars, 14), atrLong = smaArr(atr, 50);
  const score: number[] = new Array(n).fill(0);
  const state: EpisodeState[] = new Array(n).fill("RANGE");
  for (let i = 0; i < n; i++) {
    const W = Math.min(window, i + 1), half = Math.max(1, Math.floor(W / 2));
    let run = 0, runHalf = 0;
    for (let j = i - W + 1; j <= i; j++) run += bars[j].c - bars[j].o;
    for (let j = i - half + 1; j <= i; j++) runHalf += bars[j].c - bars[j].o;
    const denom = atr[i] * W * 0.5 + 1e-9;
    const s = Math.max(-1, Math.min(1, run / denom));
    score[i] = s;
    const exp = atrLong[i] > 1e-9 ? atr[i] / atrLong[i] : 1;
    let st: EpisodeState;
    if (Math.abs(s) >= 0.45) st = s > 0 ? "RUN_UP" : "RUN_DOWN";
    else if (Math.abs(s) >= 0.2 && runHalf !== 0 && Math.sign(runHalf) !== Math.sign(run)) st = "PULLBACK";
    else if (exp >= 1.25) st = "EXPANSION";
    else if (exp <= 0.8) st = "CONTRACTION";
    else st = "RANGE";
    state[i] = st;
  }
  const segments: EpisodeSeg[] = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0 || state[i] !== state[i - 1]) segments.push({ id: id++, state: state[i], start: i, end: i, len: 1, dir: state[i] === "RUN_UP" ? 1 : state[i] === "RUN_DOWN" ? -1 : 0 });
    else { const seg = segments[segments.length - 1]; seg.end = i; seg.len = i - seg.start + 1; }
  }
  return { score, state, segments };
}
