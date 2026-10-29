// simPeriod — scope a backtest to a chosen window: All / a Year / a Month. Slices the design_tf tape
// by calendar period so funding + realism panels reflect exactly the range the user picks.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export interface Period { granularity: "all" | "year" | "month"; year?: string; month?: string }   // month = "01".."12"
export const ALL_PERIOD: Period = { granularity: "all" };

export function sliceByPeriod(bars: OhlcBar[] | null, p: Period): OhlcBar[] {
  if (!bars) return [];
  if (p.granularity === "all") return bars;
  if (p.granularity === "year" && p.year) return bars.filter((b) => (b.t || "").slice(0, 4) === p.year);
  if (p.granularity === "month" && p.year && p.month) return bars.filter((b) => (b.t || "").slice(0, 4) === p.year && (b.t || "").slice(5, 7) === p.month);
  return bars;
}

export function periodYears(bars: OhlcBar[] | null): string[] {
  if (!bars) return [];
  const s = new Set<string>(); for (const b of bars) { const y = (b.t || "").slice(0, 4); if (y) s.add(y); }
  return Array.from(s).sort();
}
export function periodMonths(bars: OhlcBar[] | null, year: string): string[] {
  if (!bars || !year) return [];
  const s = new Set<string>(); for (const b of bars) { if ((b.t || "").slice(0, 4) === year) { const m = (b.t || "").slice(5, 7); if (m) s.add(m); } }
  return Array.from(s).sort();
}
const MON = ["", "Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];
export function periodLabel(p: Period): string {
  if (p.granularity === "all") return "Full history";
  if (p.granularity === "year") return "Year " + p.year;
  return (MON[+(p.month || "0")] || p.month) + "/" + p.year;
}
export { MON as PERIOD_MONTHS };
