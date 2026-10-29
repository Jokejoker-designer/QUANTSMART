// resampleM1 — M1 master clock → M5/M15/H1/H4/D1 from the SAME M1 stream (P1).
// Only CLOSED higher-TF bars are signal-eligible. Gaps are tagged, never hidden.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { TF_MINUTES, parseBarTime, classifySession, SESSION_LABEL } from "./simTimeframe.ts";

export type ResampleTf = "M5" | "M15" | "H1" | "H4" | "D1";

export interface ResampledBar extends OhlcBar {
  sourceStartTime: string;
  sourceEndTime: string;
  sourceM1Count: number;
  expectedM1Count: number;
  complete: boolean;
  hasGap: boolean;
  sessionTag?: string;
  rolloverTag?: boolean;
  weekendGapTag?: boolean;
}

export interface ResampleResult {
  targetTf: ResampleTf;
  bars: ResampledBar[];
  completeBars: number;
  incompleteBars: number;
  gapBars: number;
  warnings: string[];
  m1ByBar: OhlcBar[][];     // M1 children per resampled bar (aligned to bars) — for intrabar resolution
}

function epochMin(iso: string): number { const p = parseBarTime(iso); return p.ok ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 60000 : NaN; }
function isoFromMin(min: number): string { return new Date(min * 60000).toISOString().slice(0, 16); }

export function resampleM1(m1: OhlcBar[], targetTf: ResampleTf): ResampleResult {
  const M = TF_MINUTES[targetTf];
  const bars: ResampledBar[] = []; const m1ByBar: OhlcBar[][] = []; const warnings: string[] = [];
  if (!m1 || !m1.length) return { targetTf, bars, completeBars: 0, incompleteBars: 0, gapBars: 0, warnings: ["no M1 bars"], m1ByBar };

  const lastMin = epochMin(m1[m1.length - 1].t);
  let curKey: number | null = null; let group: OhlcBar[] = []; let prevEndMin = NaN; let idx = 0;
  let completeBars = 0, incompleteBars = 0, gapBars = 0;

  const flush = () => {
    if (!group.length || curKey == null) return;
    const o = group[0].o; let hi = group[0].h, lo = group[0].l; for (const g of group) { if (g.h > hi) hi = g.h; if (g.l < lo) lo = g.l; }
    const close = group[group.length - 1].c;
    const startMin = curKey * M, endMin = (curKey + 1) * M;
    const complete = (endMin - 1) <= lastMin;
    const hasGap = group.length < expected(M, targetTf);
    const p = parseBarTime(group[0].t);
    const session = classifySession(p.h, p.mi);
    const weekendGap = !isNaN(prevEndMin) && (startMin - prevEndMin) > 1440;   // >1 day since prev bar
    const bar: ResampledBar = {
      i: idx++, o, h: hi, l: lo, c: close, r: "N", t: isoFromMin(startMin),
      sourceStartTime: group[0].t, sourceEndTime: group[group.length - 1].t,
      sourceM1Count: group.length, expectedM1Count: expected(M, targetTf),
      complete, hasGap, sessionTag: SESSION_LABEL[session], rolloverTag: p.h === 21, weekendGapTag: weekendGap,
    };
    bars.push(bar); m1ByBar.push(group);
    if (complete) completeBars++; else incompleteBars++;
    if (hasGap) gapBars++;
    prevEndMin = endMin;
  };

  for (const b of m1) {
    const mm = epochMin(b.t); if (isNaN(mm)) continue;
    const key = Math.floor(mm / M);
    if (key !== curKey) { flush(); curKey = key; group = []; }
    group.push(b);
  }
  flush();

  if (incompleteBars) warnings.push(incompleteBars + " incomplete (forming) bar(s) — not signal-eligible.");
  if (gapBars) warnings.push(gapBars + " bar(s) with missing M1 minutes (gap-tagged).");
  return { targetTf, bars, completeBars, incompleteBars, gapBars, warnings, m1ByBar };
}

// expected M1 minutes per higher-TF bar (gold trades ~23h/day so D1 is never "full" — use a tolerant expectation)
function expected(M: number, tf: ResampleTf): number { return tf === "D1" ? 1380 : M; }

// signal-eligible = closed bars only
export function completeBarsOnly(r: ResampleResult): { bars: ResampledBar[]; m1ByBar: OhlcBar[][] } {
  const bars: ResampledBar[] = []; const m1ByBar: OhlcBar[][] = [];
  r.bars.forEach((b, i) => { if (b.complete) { bars.push({ ...b, i: bars.length }); m1ByBar.push(r.m1ByBar[i]); } });
  return { bars, m1ByBar };
}
