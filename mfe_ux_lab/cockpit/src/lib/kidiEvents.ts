// kidiEvents — scan an OHLC tape for the events KIDI witnesses. Per the boundary doctrine, KIDI is a
// FLATNESS / FROZEN-FEED witness (zero-variance / range-zero), NOT a generic gap detector. We also flag
// ABNORMAL feed gaps (> a long weekend) as a secondary feed-integrity note. A BLOCK-severity KIDI event
// is exactly what makes L0 kidi_cleanliness BLOCK (→ no GOOD_FIT). Read-only · advisory · diagnostic.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export type KidiType = "FROZEN_FEED" | "RANGE_ZERO" | "DATA_GAP";
export type KidiSeverity = "WARN" | "BLOCK";
export interface KidiEvent { i: number; t: string; type: KidiType; severity: KidiSeverity; detail: string; span: number }

const EPS = 1e-9;
const DAY = 86_400_000;
const msOf = (iso: string): number => { const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : 0; };

export function kidiScan(bars: OhlcBar[]): KidiEvent[] {
  const ev: KidiEvent[] = [];
  if (!bars || bars.length < 3) return ev;

  // 1) FROZEN_FEED — runs of consecutive identical closes (zero-variance). >=5 bars = BLOCK, 3-4 = WARN.
  let runStart = 0;
  for (let i = 1; i <= bars.length; i++) {
    const frozen = i < bars.length && Math.abs(bars[i].c - bars[i - 1].c) <= EPS;
    if (!frozen) {
      const len = i - runStart;
      if (len >= 3) ev.push({ i: runStart, t: bars[runStart].t, type: "FROZEN_FEED", severity: len >= 5 ? "BLOCK" : "WARN", detail: len + " bars · same close " + bars[runStart].c.toFixed(2), span: len });
      runStart = i;
    }
  }

  // 2) RANGE_ZERO — single dead bar (high==low) that is NOT part of a frozen run (genuine flat tick).
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h - bars[i].l <= EPS && Math.abs(bars[i].c - bars[i - 1].c) > EPS) {
      ev.push({ i, t: bars[i].t, type: "RANGE_ZERO", severity: "WARN", detail: "high==low @ " + bars[i].c.toFixed(2), span: 1 });
    }
  }

  // 3) DATA_GAP — ABNORMAL missing-data gap (> 4 days; longer than a normal weekend close). Feed-integrity note.
  for (let i = 1; i < bars.length; i++) {
    const d = msOf(bars[i].t) - msOf(bars[i - 1].t);
    if (d > 4 * DAY) ev.push({ i, t: bars[i].t, type: "DATA_GAP", severity: "WARN", detail: "missing ~" + Math.round(d / DAY) + " days before this bar", span: 1 });
  }

  return ev.sort((a, b) => a.i - b.i);
}

export interface KidiSummary { total: number; frozen: number; rangeZero: number; gap: number; blocks: number }
export function kidiSummary(ev: KidiEvent[]): KidiSummary {
  return {
    total: ev.length,
    frozen: ev.filter((e) => e.type === "FROZEN_FEED").length,
    rangeZero: ev.filter((e) => e.type === "RANGE_ZERO").length,
    gap: ev.filter((e) => e.type === "DATA_GAP").length,
    blocks: ev.filter((e) => e.severity === "BLOCK").length,
  };
}
