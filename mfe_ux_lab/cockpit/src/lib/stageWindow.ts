// stageWindow — the FORCED multi-layer test cascade: 10 năm (Y10) → 6 tháng (M6) → 1 tháng (M1).
// ONE engine (realistic) on three DISJOINT, time-ordered windows of the card's design_tf tape, anchored at
// the tape's LAST bar. The last 1 month is HELD OUT as a forward/live test (never seen by Y10 or M6); the 6
// months BEFORE it are the recent OOS validation; the 10 years BEFORE that are the long-term train base. So
// the order is MANDATORY (anti-cherry-pick) AND the windows don't overlap → M1 is a true out-of-sample
// forward holdout, not data already inside Y10. Pure + shared by Strategy Lab + Microscope.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export type Stage = "Y10" | "M6" | "M1";
export const STAGES: Stage[] = ["Y10", "M6", "M1"];
export const STAGE_LABEL: Record<Stage, string> = { Y10: "10Y Base", M6: "6M OOS", M1: "1M Forward" };
export const STAGE_SHORT: Record<Stage, string> = { Y10: "Y10", M6: "M6", M1: "M1" };
// window LENGTHS (days). Kept for display.
export const STAGE_DAYS: Record<Stage, number> = { Y10: 3652, M6: 183, M1: 31 };
// DISJOINT chain (days back from anchor=last bar): window = (anchor−offset−length , anchor−offset].
//   M1 : (anchor−31 , anchor]            ← last month — FORWARD/LIVE holdout
//   M6 : (anchor−214 , anchor−31]        ← the 6 months BEFORE the last month (leaves the last month out)
//   Y10: (anchor−3866 , anchor−214]      ← the 10 years BEFORE that — long-term TRAIN base
export const STAGE_WINDOW: Record<Stage, { offsetDays: number; lengthDays: number }> = {
  M1: { offsetDays: 0, lengthDays: 31 },
  M6: { offsetDays: 31, lengthDays: 183 },
  Y10: { offsetDays: 214, lengthDays: 3652 },
};
// which feed each window is meant to run on: Y10/M6 = historical REPLAY tape, M1 = LIVE forward month.
export const STAGE_SOURCE: Record<Stage, "Replay" | "Live"> = { Y10: "Replay", M6: "Replay", M1: "Live" };

// the EXACT date range a stage actually covers on a given tape (first→last bar of the sliced window).
// Use this to LABEL the window so the user never confuses which period a result came from.
export interface StageRange { from: string; to: string; n: number }
export function stageDateRange(bars: OhlcBar[] | null | undefined, stage: Stage): StageRange | null {
  const seg = sliceForStage(bars, stage);
  if (!seg.length) return null;
  const d = (t: unknown) => String(t).replace("T", " ").slice(0, 16);   // "YYYY-MM-DD HH:mm"
  return { from: d(seg[0].t), to: d(seg[seg.length - 1].t), n: seg.length };
}

export const STAGE_HINT: Record<Stage, string> = {
  Y10: "Long-term train base — 10 years prior to the recent 6-month OOS window (walk-forward + multi-regime). Must survive here first.",
  M6: "OOS Validation — 6 months immediately preceding the 1-month forward holdout. Tests whether the 10-year edge persists.",
  M1: "Forward / Live holdout — the final 1 month of unseen data (excluded from Y10 and M6). Small sample forward verification.",
};

// parse a bar timestamp to epoch ms (treat naïve strings as UTC).
export function barTime(b: OhlcBar): number {
  const s = String((b as { t?: unknown }).t ?? "").replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
}

// slice the LAST `days` of bars (by timestamp, from the final bar backwards). Unparseable stamps → return all.
export function sliceLastDays(bars: OhlcBar[] | null | undefined, days: number): OhlcBar[] {
  if (!bars || !bars.length) return [];
  const end = barTime(bars[bars.length - 1]);
  if (!isFinite(end)) return bars.slice();
  const cut = end - days * 24 * 3600 * 1000;
  return bars.filter((b) => { const t = barTime(b); return !isFinite(t) || t >= cut; });
}

// the DISJOINT window for a stage: (start, end] where end = anchor−offset, start = end−length. The half-open
// (start, end] makes adjacent windows perfectly non-overlapping (the boundary bar belongs to the OLDER window).
export function sliceForStage(bars: OhlcBar[] | null | undefined, stage: Stage): OhlcBar[] {
  if (!bars || !bars.length) return [];
  const anchor = barTime(bars[bars.length - 1]);
  if (!isFinite(anchor)) return bars.slice();
  const w = STAGE_WINDOW[stage], DAY = 24 * 3600 * 1000;
  const end = anchor - w.offsetDays * DAY, start = end - w.lengthDays * DAY;
  return bars.filter((b) => { const t = barTime(b); return isFinite(t) && t > start && t <= end; });
}

// ── the FORCED-ORDER gate (pure) ──
// maxStage = highest unlocked index (0 = only Y10 unlocked). A stage is reachable only if its index ≤ maxStage.
export function stageIndex(s: Stage): number { return STAGES.indexOf(s); }
export function stageUnlocked(target: Stage, maxStage: number): boolean { return stageIndex(target) <= maxStage; }
export function nextStage(s: Stage): Stage | null { const i = stageIndex(s); return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null; }
// advancing is allowed ONLY from the current frontier (stage index === maxStage) and only when its result is ready.
export function canAdvance(stage: Stage, maxStage: number, ready: boolean): boolean {
  return ready && stageIndex(stage) === maxStage && maxStage < STAGES.length - 1;
}
