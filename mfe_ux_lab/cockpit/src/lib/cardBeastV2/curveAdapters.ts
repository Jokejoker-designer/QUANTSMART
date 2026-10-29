// cardBeastV2/curveAdapters (P3b) — data + verdicts for the two 2D risk curves, plus the PASSPORT GATE:
// 1) CALIBRATION CURVE: X = claimed reliability of each trigger family (the coef the system BELIEVES, e.g. trend
//    rel 0.55), Y = ACTUAL hit-rate of that family's trades → OVERCONFIDENT (ảo tưởng) khi claim >> thực tế.
// 2) PARAMETER CURVE: X = parameter value sweep, Y = expectancy → PLATEAU (sống ổn định) vs SHARP_PEAK (bẫy
//    overfit đỉnh nhọn) vs FLAT_NULL.
// 3) PASSPORT GATE: turn a passport's compatible cells into REAL engine gates (custom CONTEXT_GATE modules on the
//    marginal regime/hour whitelist) so a Beast trades ONLY where its passport says it belongs.
import type { RealisticTradeResult } from "../realisticStrategySim.ts";
import type { CompatibilityPassport } from "./schemas.ts";
import type { CustomModule } from "../customModule.ts";

// claimed reliability per trigger family — from the historical DEFAULT_TRIGGER_COEF + classic rel constants.
const CLAIMED_REL: { tag: string; family: string; rel: number }[] = [
  { tag: "Trend Pullback", family: "trend", rel: 0.55 },
  { tag: "RSI Reclaim", family: "rsi", rel: 0.53 },
  { tag: "Sweep Reclaim", family: "sweep", rel: 0.54 },
  { tag: "Range Fade", family: "range", rel: 0.52 },
  { tag: "EMA10 crossover", family: "emaDefault", rel: 0.52 },
  { tag: "Classic ichimoku", family: "ichimoku", rel: 0.55 },
  { tag: "Classic macd", family: "macd", rel: 0.53 },
  { tag: "Classic stochastic", family: "stochastic", rel: 0.52 },
  { tag: "Classic bollinger", family: "bollinger", rel: 0.52 },
];

export interface CalibrationPoint { family: string; claimed: number; actual: number | null; n: number; verdict: "OK" | "OVERCONFIDENT" | "UNDERCONFIDENT" | "INSUFFICIENT" }
export function calibrationCurve(trades: RealisticTradeResult[], minN = 30, tol = 0.06): CalibrationPoint[] {
  const buckets = new Map<string, { rel: number; n: number; w: number }>();
  for (const t of trades) {
    const why = (t.why || []).join(" | ");
    const fam = CLAIMED_REL.find((c) => why.includes(c.tag));
    if (!fam) continue;
    const b = buckets.get(fam.family) || buckets.set(fam.family, { rel: fam.rel, n: 0, w: 0 }).get(fam.family)!;
    b.n++; if (t.netR > 0) b.w++;
  }
  return [...buckets.entries()].map(([family, b]) => {
    const actual = b.n ? b.w / b.n : null;
    const verdict: CalibrationPoint["verdict"] = b.n < minN || actual == null ? "INSUFFICIENT"
      : b.rel - actual > tol ? "OVERCONFIDENT" : actual - b.rel > tol ? "UNDERCONFIDENT" : "OK";
    return { family, claimed: b.rel, actual: actual != null ? +actual.toFixed(3) : null, n: b.n, verdict };
  }).sort((a, b) => a.claimed - b.claimed);
}

export interface ParamPoint { value: number; expectancy: number | null; n: number }
export interface PlateauVerdict { verdict: "PLATEAU_FOUND" | "SHARP_PEAK" | "FLAT_NULL" | "INSUFFICIENT"; plateau: number[]; note: string }
/** Plateau = ≥3 consecutive values whose expectancy stays within `band` of each other AND positive. A single
 *  positive spike with negative neighbours = SHARP_PEAK (overfit trap). All ≈0/negative = FLAT_NULL (honest). */
export function plateauVerdict(points: ParamPoint[], band = 0.03, minN = 30): PlateauVerdict {
  const valid = points.filter((p) => p.expectancy != null && p.n >= minN);
  if (valid.length < 3) return { verdict: "INSUFFICIENT", plateau: [], note: "Not enough parameter points or observations." };
  let best: ParamPoint[] = [];
  for (let i = 0; i < valid.length; i++) {
    const run: ParamPoint[] = [valid[i]];
    for (let j = i + 1; j < valid.length; j++) {
      const es = [...run, valid[j]].map((p) => p.expectancy as number);
      if (Math.max(...es) - Math.min(...es) <= band && Math.min(...es) > 0) run.push(valid[j]); else break;
    }
    if (run.length > best.length) best = run;
  }
  if (best.length >= 3) return { verdict: "PLATEAU_FOUND", plateau: best.map((p) => p.value), note: `plateau ${best.length} points around expectancy ~${(best.reduce((s, p) => s + (p.expectancy as number), 0) / best.length).toFixed(3)}R; observed stable region` };
  const anyPos = valid.some((p) => (p.expectancy as number) > 0.01);
  if (anyPos) return { verdict: "SHARP_PEAK", plateau: [], note: "An isolated positive peak may be overfit. Do not select it without held-out confirmation." };
  return { verdict: "FLAT_NULL", plateau: [], note: "No measured positive region across the tested range." };
}

/** PASSPORT GATE — marginal whitelists from the passport's COMPATIBLE cells (regime + session→hour ranges),
 *  compiled to real engine gates (custom modules). Simplification: marginals, not exact cell combos — noted. */
const SESSION_HOURS: Record<string, [number, number]> = { Asia: [2, 7], London: [7, 12], London_NY_overlap: [12, 16], NY_Open: [16, 21], Asia_Late: [21, 22], Dead_Hour: [22, 2] };
export interface PassportGate { gates: CustomModule[]; regimes: string[]; sessions: string[]; note: string }
export function buildPassportGate(pp: CompatibilityPassport, tf = "M15"): PassportGate {
  const good = pp.cells.filter((c) => c.bucket["timeframe"] === tf && c.status === "COMPATIBLE");
  const regimes = [...new Set(good.map((c) => c.bucket["regime"]).filter(Boolean))];
  const sessions = [...new Set(good.map((c) => c.bucket["session"]).filter(Boolean))];
  const gates: CustomModule[] = [];
  const mk = (name: string, conditions: CustomModule["conditions"], logic: "ALL" | "ANY"): CustomModule =>
    ({ id: "pgate_" + name, level: 4, role: "CONTEXT_GATE", name: "PassportGate " + name, explain: "Restricts research evaluation to the contexts supported by the stated passport.", why: "derived from measured passport cells..", conditions, logic, status: "SHADOW", createdAt: "t" });
  if (regimes.length && regimes.length < 3) {
    const conds = regimes.map((r) => ({ metric: "regime", op: "==" as const, value: r === "TREND_UP" ? 1 : r === "TREND_DOWN" ? -1 : 0 }));
    gates.push(mk("regime", conds, "ANY"));
  }
  if (sessions.length && sessions.length < 5) {
    const conds = sessions.filter((s) => SESSION_HOURS[s] && s !== "Dead_Hour").map((s) => ({ metric: "hour", op: "between" as const, value: SESSION_HOURS[s][0], value2: SESSION_HOURS[s][1] - 1 }));
    if (conds.length) gates.push(mk("session", conds, "ANY"));
  }
  return { gates, regimes, sessions, note: gates.length ? `Marginal boundary gate from ${good.length} compatible cells; not the exact joint condition of every cell` : "Passport lacks enough compatible cells to construct a gate" };
}
