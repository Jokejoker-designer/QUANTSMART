// l6Eval — hàm CHUNG cho L6 zone (dùng bởi CẢ L6ZoneBuilder lẫn adapter Coordinate Lab → maxErr 0 by construction).
// Tính causal: ATR, mức anchor (swing/POC/evidence/L5-state/price), và chuỗi TÂM vùng (center) = tín-hiệu liên tục.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { customMetricSeries } from "../customMetricBridge.ts";
import type { CustomL6Zone, ZoneAnchor } from "./customL6.ts";

export function atrOf(bars: OhlcBar[], i: number, p = 14): number {
  if (i <= 0) return bars[0] ? bars[0].h - bars[0].l : 1;
  let a = bars[0].h - bars[0].l;
  for (let j = 1; j <= i; j++) { const tr = Math.max(bars[j].h - bars[j].l, Math.abs(bars[j].h - bars[j - 1].c), Math.abs(bars[j].l - bars[j - 1].c)); a = (a * (p - 1) + tr) / p; }
  return a || 1;
}
export function anchorLevel(bars: OhlcBar[], i: number, anchor: ZoneAnchor, ref?: string): number {
  const w = bars.slice(Math.max(0, i - 20), i + 1);
  if (anchor === "swing_high") return Math.max(...w.map((b) => b.h));
  if (anchor === "swing_low") return Math.min(...w.map((b) => b.l));
  if (anchor === "poc") { const lo = Math.min(...w.map((b) => b.l)), hi = Math.max(...w.map((b) => b.h)); return (lo + hi) / 2; }
  if ((anchor === "evidence" || anchor === "l5_state") && ref) { const s = customMetricSeries(ref, bars); if (s && isFinite(s[i])) return bars[i].c + s[i] * atrOf(bars, i); }
  return bars[i].c;
}
// chuỗi TÂM vùng (center) = anchorLevel + offset*ATR — tín-hiệu liên tục pre-threshold cho Coordinate Lab.
export function zoneCenterSeries(z: Pick<CustomL6Zone, "anchor" | "anchorRef" | "offsetAtr">, bars: OhlcBar[]): number[] {
  return bars.map((_, i) => anchorLevel(bars, i, z.anchor, z.anchorRef) + z.offsetAtr * atrOf(bars, i));
}
