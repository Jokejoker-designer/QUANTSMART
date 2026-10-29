// simCalibrationHarness — prove the simulator can DETECT a real injected edge and REJECT noise (P1).
// Don't trust any real card verdict until the instrument passes these ground-truth scenarios.
// Each scenario builds a synthetic M1 tape with a KNOWN property, runs the realistic M1 engine,
// and checks the verdict matches the expectation. Deterministic (seeded).
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { makeRng } from "./simCostModel.ts";
import { runRealisticBacktestM1 } from "./realisticSimRun.ts";
import { resampleM1, completeBarsOnly } from "./resampleM1.ts";
import { simulateCard, analyze } from "./strategySim.ts";

export type CalibScenario =
  | "NULL_RANDOM_WALK" | "COST_ONLY_EDGELESS" | "INJECTED_TREND_EDGE" | "INJECTED_MEAN_REVERSION_EDGE"
  | "SPREAD_FRAGILE_EDGE" | "PATH_AMBIGUOUS_EDGE" | "LOOKAHEAD_TRAP";

export interface CalibrationReport {
  scenario: CalibScenario;
  expected_result: string;
  actual_result: string;
  pass: boolean;
  grossPF: number;
  netPF: number;
  costFragility: boolean;
  pathFragility: string;
  trades: number;
  note: string;
}
export interface CalibrationHarnessResult { reports: CalibrationReport[]; allPass: boolean; status: "CALIBRATION_PASS" | "CALIBRATION_FAIL"; passCount: number; total: number }

const START = Date.UTC(2021, 0, 4, 0, 0);
const isoMin = (i: number) => new Date(START + i * 60000).toISOString().slice(0, 16);
function buildM1(closes: number[], wick: number | number[], gap?: (i: number) => number): OhlcBar[] {
  return closes.map((c, i) => { const base = i === 0 ? closes[0] : closes[i - 1]; const o = base + (gap ? gap(i) : 0); const w = Array.isArray(wick) ? wick[i] : wick; return { i, o: +o.toFixed(2), h: +(Math.max(o, c) + w).toFixed(2), l: +(Math.min(o, c) - w).toFixed(2), c: +c.toFixed(2), r: "N" as const, t: isoMin(i) }; });
}
function gen(n: number, fn: (i: number, rng: () => number) => number, seed: number): number[] { const rng = makeRng(seed); const o: number[] = []; for (let i = 0; i < n; i++) o.push(fn(i, rng)); return o; }

const RANGE = { id: "calib_range", modules: ["range_fade", "auto_rr"], archetype: "range" };
const TREND = { id: "calib_trend", modules: ["trend_pullback", "auto_rr"], archetype: "trend" };
const N = 60000; // ~250 H1 / ~1000 M15 bars

export function runCalibrationHarness(): CalibrationHarnessResult {
  const reports: CalibrationReport[] = [];
  const push = (scenario: CalibScenario, expected: string, a: { grossPF: number; netPF: number; costFragile: boolean; pathFragilityStatus: string; n: number }, pass: boolean, actual: string, note = "") => {
    reports.push({ scenario, expected_result: expected, actual_result: actual, pass, grossPF: a.grossPF, netPF: a.netPF, costFragility: a.costFragile, pathFragility: a.pathFragilityStatus, trades: a.n, note });
  };

  // 1. NULL_RANDOM_WALK — no stable net edge
  { let p = 1800; const a = runRealisticBacktestM1(buildM1(gen(N, (_i, rng) => (p += (rng() - 0.5) * 1.4), 21), 0.4), RANGE, {}).analytics;
    push("NULL_RANDOM_WALK", "no stable net edge (netPF≤1.25)", a, a.n === 0 || a.netPF <= 1.25, `netPF=${a.netPF} grossPF=${a.grossPF} n=${a.n}`); }

  // 2. COST_ONLY_EDGELESS — gross tilt erased by cost (netPF ≤ 1.05)
  { let p = 1800; const a = runRealisticBacktestM1(buildM1(gen(N, (_i, rng) => (p += (rng() - 0.5) * 1.4), 31), 0.4), RANGE, {}).analytics;
    push("COST_ONLY_EDGELESS", "netPF≤1.05 after cost", a, a.n === 0 || a.netPF <= 1.05, `netPF=${a.netPF} grossPF=${a.grossPF} n=${a.n}`); }

  // 3. INJECTED_TREND_EDGE — strong uptrend w/ pullbacks → trend card detects
  { const a = runRealisticBacktestM1(buildM1(gen(N, (i, rng) => 1800 + 0.006 * i + 9 * Math.sin(i / 170) + (rng() - 0.5) * 0.6, 13), 0.5), TREND, {}).analytics;
    push("INJECTED_TREND_EDGE", "grossPF≥1.25 (edge detected)", a, a.n >= 5 && a.grossPF >= 1.25, `grossPF=${a.grossPF} netPF=${a.netPF} n=${a.n}`); }

  // 4. INJECTED_MEAN_REVERSION_EDGE — oscillation → range card detects
  { const a = runRealisticBacktestM1(buildM1(gen(N, (i, rng) => 1800 + 26 * Math.sin(i / 95) + (rng() - 0.5) * 1, 14), 0.6), RANGE, {}).analytics;
    push("INJECTED_MEAN_REVERSION_EDGE", "grossPF≥1.15 when design matches", a, a.n >= 5 && a.grossPF >= 1.15, `grossPF=${a.grossPF} netPF=${a.netPF} n=${a.n}`); }

  // 5. SPREAD_FRAGILE_EDGE — small swings → gross>1 but cost kills net (COST_FRAGILE)
  { const bt = runRealisticBacktestM1(buildM1(gen(N, (i, rng) => 1800 + 2 * Math.sin(i / 95) + (rng() - 0.5) * 0.4, 15), 0.3), RANGE, {}); const a = bt.analytics;
    const stress = a.scenarios.find((s) => s.scenario === "STRESS_COST");
    push("SPREAD_FRAGILE_EDGE", "gross>1 but net fails base/stress (COST_FRAGILE)", a, a.n >= 5 && a.grossPF > 1.0 && (a.costFragile || (stress != null && stress.netPF <= 1.0)), `grossPF=${a.grossPF} netPF=${a.netPF} costFragile=${a.costFragile} stressPF=${stress?.netPF}`); }

  // 6. PATH_AMBIGUOUS_EDGE — calm base on M5 + rare huge M1 spikes straddle SL&TP → PATH_FRAGILE
  { const wick = Array.from({ length: N }, (_, i) => (i % 150 === 0 ? 5 : 0.15));
    const card = { id: "calib_amb", modules: ["range_fade", "auto_rr"], design_tf: "M5" };
    const a = runRealisticBacktestM1(buildM1(gen(N, (i, rng) => 1800 + 4 * Math.sin(i / 60) + (rng() - 0.5) * 0.4, 16), wick), card, {}).analytics;
    push("PATH_AMBIGUOUS_EDGE", "ambiguous>0 & PATH_FRAGILE", a, a.ambiguousCount > 0 && a.pathFragilityStatus === "PATH_FRAGILE", `ambig=${a.ambiguousCount} rate=${a.ambiguousRate} path=${a.pathFragilityStatus} n=${a.n}`); }

  // 7. LOOKAHEAD_TRAP — close-entry (legacy, mild lookahead) beats honest next-open under adverse gap
  { const c = gen(N, (i, rng) => 1800 + 26 * Math.sin(i / 95) + (rng() - 0.5) * 1, 14); const m1 = buildM1(c, 0.6, () => 5);
    const bt = runRealisticBacktestM1(m1, RANGE, {}); const realPF = bt.analytics.grossPF;
    const co = completeBarsOnly(resampleM1(m1, bt.designTf as "M15"));
    const legacy = analyze(simulateCard(co.bars, RANGE.modules, true).trades); const legacyPF = legacy.profitFactor;
    const a = bt.analytics; const pass = legacyPF > realPF + 1.0;
    push("LOOKAHEAD_TRAP", "close-entry(lookahead) PF >> next-open PF", a, pass, `legacyClosePF=${legacyPF} realisticNextOpenPF=${realPF}`, "next-open removes the lookahead free-lunch"); }

  const passCount = reports.filter((r) => r.pass).length;
  const allPass = passCount === reports.length;
  return { reports, allPass, status: allPass ? "CALIBRATION_PASS" : "CALIBRATION_FAIL", passCount, total: reports.length };
}
