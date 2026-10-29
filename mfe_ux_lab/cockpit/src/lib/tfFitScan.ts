// tfFitScan — "which TF does this card actually fit?" — the HONEST, data-driven way to let a strategy find
// its appropriate design_tf: run the SAME card at each candidate TF (M5/M15/H1/H4) through the REAL engine
// with walk-forward, then recommend the TF that is OOS-positive AND era-stable AND verdict ≥ FRAGILE.
// It is ADVISORY/SHADOW: it NEVER auto-changes the card's declared design_tf — the user decides. This is
// self-calibration of the TF gated by OOS + era-stability (so it can't curve-fit to one lucky in-sample TF).
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { runRealisticBacktest } from "./realisticSimRun.ts";
import { honestyVerdict, type TrustLevel } from "./simHonesty.ts";

export type TfCandidate = "M5" | "M15" | "H1" | "H4";
export const TF_CANDIDATES: TfCandidate[] = ["M5", "M15", "H1", "H4"];   // M1 = over-trade spam; D1 = too few

export interface TfFitRow {
  tf: TfCandidate; ran: boolean; trades: number;
  oosNetR: number; oosPosFrac: number; oosVerdict: string;   // walk-forward
  eraNetR: [number, number]; eraStable: boolean;             // first-third vs last-third of folds (same sign + posFrac≥0.5)
  verdict: TrustLevel; recommendedHere: boolean;
}
export interface TfFitResult {
  card_id: string; declaredTf: string;
  rows: TfFitRow[]; recommendedTf: TfCandidate | null;
  note: string; source: "measured";
}
export interface TfFitOptions { capital?: number; riskPct?: number; folds?: number }

const RANK: Record<TrustLevel, number> = { NO_EDGE_AFTER_COST: 0, FRAGILE_EDGE: 1, CONDITIONAL_EDGE: 2, ROBUST_IN_SIM: 3 };

function evalTf(card: Record<string, unknown>, tf: TfCandidate, bars: OhlcBar[] | null | undefined, opts: TfFitOptions): TfFitRow {
  const zero: TfFitRow = { tf, ran: false, trades: 0, oosNetR: 0, oosPosFrac: 0, oosVerdict: "NOT_RUN", eraNetR: [0, 0], eraStable: false, verdict: "NO_EDGE_AFTER_COST", recommendedHere: false };
  if (!bars || bars.length < 300) return zero;
  const cardAtTf = { ...card, design_tf: tf };   // override the design_tf for this candidate
  const bt = runRealisticBacktest(bars, cardAtTf, { symbol: "XAUUSD", withWalkForward: true, walkForwardFolds: opts.folds ?? 6, capital: opts.capital, riskPct: opts.riskPct });
  const wf = bt.walkForward;
  const folds = wf ? wf.folds.filter((f) => f.n >= 5) : [];
  const k = folds.length;
  const oosNetR = +folds.reduce((s, f) => s + f.netR, 0).toFixed(2);
  const oosPosFrac = wf ? wf.positiveFraction : 0;
  // era-stability from the SAME folds (no extra runs): first third vs last third must agree in sign.
  const era1 = +folds.slice(0, Math.max(1, Math.floor(k / 3))).reduce((s, f) => s + f.netR, 0).toFixed(2);
  const era2 = +folds.slice(Math.ceil((k * 2) / 3)).reduce((s, f) => s + f.netR, 0).toFixed(2);
  const eraStable = k >= 3 && (era1 > 0) === (era2 > 0) && oosPosFrac >= 0.5;
  const verdict = honestyVerdict(bt.analytics, wf, bt.calibration?.level ?? "FULLY_PROVISIONAL").trust;
  return { tf, ran: true, trades: bt.analytics.n, oosNetR, oosPosFrac, oosVerdict: wf?.verdict ?? "NOT_RUN", eraNetR: [era1, era2], eraStable, verdict, recommendedHere: false };
}

// PURE: the recommendation gate — OOS-positive AND era-stable AND verdict ≥ FRAGILE; else null (no recommend).
export function recommendTf(rows: TfFitRow[]): TfCandidate | null {
  const elig = rows.filter((r) => r.ran && r.oosNetR > 0 && r.oosPosFrac >= 0.6 && r.eraStable && RANK[r.verdict] >= 1);
  if (!elig.length) return null;
  elig.sort((a, b) => b.oosPosFrac - a.oosPosFrac || b.oosNetR - a.oosNetR);
  return elig[0].tf;
}

export function runTfFit(card: Record<string, unknown>, barsByTf: Partial<Record<TfCandidate, OhlcBar[] | null>>, opts: TfFitOptions = {}): TfFitResult {
  const declaredTf = typeof card?.design_tf === "string" ? card.design_tf : "(inferred)";
  const rows = TF_CANDIDATES.map((tf) => evalTf(card, tf, barsByTf[tf], opts));
  const rec = recommendTf(rows);
  rows.forEach((r) => { r.recommendedHere = r.tf === rec; });
  return {
    card_id: typeof card?.id === "string" ? card.id : "card", declaredTf, rows, recommendedTf: rec, source: "measured",
    note: rec
      ? `Gợi-ý ${rec}: OOS dương + era-stable + verdict≥FRAGILE. ADVISORY/SHADOW — design_tf khai-báo của card KHÔNG đổi tự-động; bạn chốt.`
      : "Không TF nào đạt (OOS dương + era-stable). Giữ design_tf khai-báo. Đây là kết-quả thành-thật, không ép.",
  };
}
