// simTimeframe — TF binding, session classification (broker GMT+3), next-open fill (P0).
// design_tf (where the card thinks) is strictly separated from chart display TF.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "./simConfig.ts";

export const TF_MINUTES: Record<Timeframe, number> = { M1: 1, M5: 5, M15: 15, H1: 60, H4: 240, D1: 1440 };
export const ALL_TFS: Timeframe[] = ["M1", "M5", "M15", "H1", "H4", "D1"];
export function isTimeframe(x: string): x is Timeframe { return (ALL_TFS as string[]).includes(x); }

export interface ParsedBarTime { y: number; mo: number; d: number; h: number; mi: number; dow: number; dateKey: string; ok: boolean }
export function parseBarTime(iso: string): ParsedBarTime {
  const m = (iso || "").match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return { y: 0, mo: 0, d: 0, h: 0, mi: 0, dow: 0, dateKey: "", ok: false };
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { y, mo, d, h, mi, dow, dateKey: `${m[1]}-${m[2]}-${m[3]}`, ok: true };
}

// Sim tapes are UTC0. Broker midnight (rollover) = 00:00 GMT+3 = 21:00 UTC.
export type Session = "overlap" | "single" | "asia" | "rollover";
export function classifySession(h: number, mi: number): Session {
  if (h === 21 && mi < 6) return "rollover";      // broker 00:00 GMT+3 → spread spike
  if (h >= 13 && h < 16) return "overlap";         // London/NY overlap
  if ((h >= 7 && h < 13) || (h >= 16 && h < 21)) return "single"; // London or NY single
  return "asia";                                   // thin (Asia / late)
}
export const SESSION_LABEL: Record<Session, string> = {
  overlap: "London/NY overlap", single: "London/NY single", asia: "Asia (thin)", rollover: "Rollover (GMT+3 00:00)",
};

// recurring economic-calendar proxy (structural, not a live feed) — same as legacy engine
export function newsWindow(iso: string): boolean {
  const p = parseBarTime(iso); if (!p.ok) return false;
  const firstDow = new Date(Date.UTC(p.y, p.mo - 1, 1)).getUTCDay();
  const firstFri = 1 + ((5 - firstDow + 7) % 7);
  const isNFP = p.d === firstFri && p.h >= 12 && p.h < 15;
  const isCPI = p.d >= 10 && p.d <= 15 && p.dow >= 1 && p.dow <= 5 && p.h >= 12 && p.h < 14;
  return isNFP || isCPI;
}

// ── TF binding: a card thinks on its design_tf; execution_tf == design_tf in P0 ──
export interface StrategyCardRuntimeConfig { card_id: string; design_tf: Timeframe; allowed_execution_tf: Timeframe }
export function inferDesignTf(card: any): Timeframe {
  if (card && typeof card.design_tf === "string" && isTimeframe(card.design_tf)) return card.design_tf;
  const txt = `${card?.archetype || ""} ${(card?.modules || []).join(" ")}`.toLowerCase();
  if (/scalp|m1\b|tick/.test(txt)) return "M5";
  if (/range_fade|range fade/.test(txt)) return "M15";
  if (/swing|h4|daily/.test(txt)) return "H4";
  return "H1"; // default matches DEFAULT_REALISTIC_SIM_CONFIG
}
// execution_tf = the timeframe the ENTRY triggers on (≤ design_tf). DECLARED on the card wins, but it is clamped to
// ≤ design_tf (a finer or equal trigger grid). Default = design_tf → P0 behavior (decide+fill on design_tf) UNCHANGED.
export function resolveExecutionTf(card: any, design: Timeframe): Timeframe {
  const e = card?.execution_tf;
  if (typeof e === "string" && isTimeframe(e) && TF_MINUTES[e] <= TF_MINUTES[design]) return e;
  return design;
}
export function getCardRuntimeConfig(card: any): StrategyCardRuntimeConfig {
  const design = inferDesignTf(card);
  return { card_id: card?.id || "unknown", design_tf: design, allowed_execution_tf: resolveExecutionTf(card, design) };
}

// ── next-open fill: decision after bar i closes, fill at OPEN of bar i+1 ──
export interface FillCandidate { fillIndex: number; fillOpen: number; fillTime: string }
export function getNextOpenFill(signalBarIndex: number, bars: OhlcBar[]): FillCandidate | null {
  const j = signalBarIndex + 1;
  if (j >= bars.length) return null;            // no next bar → no fill (no lookahead, no fabrication)
  const nb = bars[j];
  return { fillIndex: j, fillOpen: nb.o, fillTime: nb.t };
}
