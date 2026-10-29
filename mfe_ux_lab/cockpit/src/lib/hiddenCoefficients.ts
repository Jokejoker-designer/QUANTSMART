// hiddenCoefficients — ONE place that surfaces every hidden coefficient / magic number that silently drives
// the system's decisions. Values are pulled LIVE from the real config objects where they're importable (so
// they can't drift); the rest are MIRRORED from inline constants in the engines (flagged live:false with a
// file pointer so a reviewer can verify). Each is tagged by kind so the honest status is visible at a glance:
//   PROVISIONAL      — not calibrated to a real broker (cost) — labeled provisional in code
//   FIXED_MAGIC      — hand-picked constant, NOT optimized on data, NOT self-learned
//   GOLD_TUNED       — a FIXED_MAGIC whose value is specific to gold/FX (wrong for crypto/index)
//   GATE             — a threshold of a validation gate (a measuring stick, not an alpha param)
//   SELF_CALIBRATING — derived from data at runtime (the honest ones)
import { DEFAULT_REALISTIC_SIM_CONFIG as C, COST_SCENARIO_MULT } from "./simConfig.ts";
import { DEFAULT_THRESHOLDS } from "./ch/segmentEpisodeBuilder.ts";
import { DEFAULT_SWING_CONFIG } from "./ch/confirmedSwing.ts";
import { ERA_STABILITY_MIN, CROSS_ERA_MIN } from "./ch/chMetrics.ts";
import { SIM_CAPS } from "./ch/similaritySearch.ts";
import { STAGE_DAYS } from "./stageWindow.ts";

export type CoefKind = "PROVISIONAL" | "FIXED_MAGIC" | "GOLD_TUNED" | "GATE" | "SELF_CALIBRATING" | "USER_TUNABLE";
export interface Coef {
  group: string; name: string; value: string | number; kind: CoefKind;
  usedIn: string;          // module/feature it drives
  live: boolean;           // true = pulled from a config object (in sync); false = mirrored from inline code
  note?: string;
}

export function buildCoefficientInventory(): Coef[] {
  const sp = C.cost.spread, sl = C.cost.slippage, sw = C.cost.swap, rk = C.risk, dc = C.discipline;
  const c: Coef[] = [
    // ── COST (simConfig — all PROVISIONAL, gold-scaled) ──
    { group: "Execution costs", name: "spread.overlap", value: sp.overlap, kind: "PROVISIONAL", usedIn: "simCostModel", live: true, note: "Price-unit assumption, configured for gold." },
    { group: "Execution costs", name: "spread.single", value: sp.single, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "spread.asia", value: sp.asia, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "spread.rollover", value: sp.rollover, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "spread.newsMult", value: sp.newsMult, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "commissionRT_per_lot_usd", value: C.cost.commissionRT_per_lot_usd, kind: "PROVISIONAL", usedIn: "simCostModel", live: true, note: "Round-trip currency per lot" },
    { group: "Execution costs", name: "slippage.baseTicks", value: sl.baseTicks, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "slippage.atrK", value: sl.atrK, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "slippage.slPenaltyTicks", value: sl.slPenaltyTicks, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "swap.longUsdPerLotNight", value: sw.longUsdPerLotNight, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "swap.shortUsdPerLotNight", value: sw.shortUsdPerLotNight, kind: "PROVISIONAL", usedIn: "simCostModel", live: true },
    { group: "Execution costs", name: "costScenario LOW/BASE/STRESS", value: `${COST_SCENARIO_MULT.LOW_COST} / ${COST_SCENARIO_MULT.BASE_COST} / ${COST_SCENARIO_MULT.STRESS_COST}`, kind: "PROVISIONAL", usedIn: "Cost sensitivity", live: true },
    // ── RISK / DISCIPLINE ──
    { group: "Capital and discipline assumptions", name: "risk.riskPctEquity", value: rk.riskPctEquity, kind: "FIXED_MAGIC", usedIn: "sizing %-equity", live: true, note: "User-configured assumption" },
    { group: "Capital and discipline assumptions", name: "risk.initialEquity", value: rk.initialEquity, kind: "FIXED_MAGIC", usedIn: "funding", live: true, note: "User-configured assumption" },
    { group: "Capital and discipline assumptions", name: "cooldownBars (M1..D1)", value: `${dc.cooldownBars.M1}/${dc.cooldownBars.M5}/${dc.cooldownBars.M15}/${dc.cooldownBars.H1}/${dc.cooldownBars.H4}/${dc.cooldownBars.D1}`, kind: "FIXED_MAGIC", usedIn: "discipline", live: true },
    { group: "Capital and discipline assumptions", name: "maxTradesPerDay (M1..D1)", value: `${dc.maxTradesPerDay.M1}/${dc.maxTradesPerDay.M5}/${dc.maxTradesPerDay.M15}/${dc.maxTradesPerDay.H1}/${dc.maxTradesPerDay.H4}/${dc.maxTradesPerDay.D1}`, kind: "FIXED_MAGIC", usedIn: "discipline", live: true },
    // ── ENTRY / EXIT (mirrored from realisticStrategySim / strategySim) ──
    { group: "Entry and exit assumptions", name: "MINRR", value: 1.3, kind: "FIXED_MAGIC", usedIn: "auto_rr filter", live: false, note: "realisticStrategySim" },
    { group: "Entry and exit assumptions", name: "TPCAP", value: "4R", kind: "FIXED_MAGIC", usedIn: "fixed TP cap", live: false },
    { group: "Entry and exit assumptions", name: "MAXHOLD (time-stop)", value: "28 bars", kind: "FIXED_MAGIC", usedIn: "exit", live: false },
    { group: "Entry and exit assumptions", name: "EMA fast/slow", value: "10 / 34", kind: "FIXED_MAGIC", usedIn: "trend/regime", live: false },
    { group: "Entry and exit assumptions", name: "RSI period + levels", value: "14 · 35/65", kind: "FIXED_MAGIC", usedIn: "rsi_reclaim", live: false },
    { group: "Entry and exit assumptions", name: "ATR period", value: 14, kind: "FIXED_MAGIC", usedIn: "ATR / sizing", live: false },
    { group: "Entry and exit assumptions", name: "sweep lookback", value: "20 bars", kind: "FIXED_MAGIC", usedIn: "sweep_reclaim", live: false },
    // ── COMBINE (the most suspect — hand-picked reliabilities) ──
    { group: "Combination algorithms", name: "Fusion absolute-score threshold", value: 0.8, kind: "USER_TUNABLE", usedIn: "score_fusion", live: false, note: "User-selected or Shadow-calibrated profile" },
    { group: "Combination algorithms", name: "bayesian cutoffs", value: "0.52 / 0.48", kind: "USER_TUNABLE", usedIn: "bayesian", live: false, note: "User-selected or Shadow-calibrated profile" },
    { group: "Combination algorithms", name: "vote w/rel trend", value: "1.0 / 0.55", kind: "USER_TUNABLE", usedIn: "trigger weight", live: false, note: "Shadow calibration from hit rate, or an explicit user override" },
    { group: "Combination algorithms", name: "vote w/rel rsi", value: "0.8 / 0.53", kind: "USER_TUNABLE", usedIn: "trigger weight", live: false, note: "Shadow calibration or user override" },
    { group: "Combination algorithms", name: "vote w/rel sweep", value: "0.9 / 0.54", kind: "USER_TUNABLE", usedIn: "trigger weight", live: false, note: "Shadow calibration or user override" },
    { group: "Combination algorithms", name: "vote w/rel range", value: "0.7 / 0.52", kind: "USER_TUNABLE", usedIn: "trigger weight", live: false, note: "Shadow calibration or user override" },
    // ── GATES / FILTERS ──
    { group: "Context filters", name: "Chop-filter threshold", value: "EMAgap < 0.15·ATR", kind: "FIXED_MAGIC", usedIn: "no_trade_chop", live: false },
    { group: "Context filters", name: "Volatility-filter threshold", value: "ATR < 0.65·ATR_slow", kind: "FIXED_MAGIC", usedIn: "atr_vol", live: false },
    { group: "Context filters", name: "range/wick", value: "adv 0.55 · range 3.0·ATR", kind: "FIXED_MAGIC", usedIn: "range_size", live: false },
    { group: "Context filters", name: "topk_fit percentile", value: "top 40%", kind: "FIXED_MAGIC", usedIn: "topk_fit", live: false },
    { group: "Context filters", name: "markov persist", value: "≥4 / >5(range)", kind: "FIXED_MAGIC", usedIn: "markov", live: false },
    { group: "Context filters", name: "state_machine", value: "belowRun≥2 · armedAge>4", kind: "FIXED_MAGIC", usedIn: "state_machine", live: false },
    { group: "Context filters", name: "level_memory touches", value: "≥3", kind: "FIXED_MAGIC", usedIn: "level_memory", live: false },
    { group: "Context filters", name: "exit_weak RSI", value: "42 / 58", kind: "FIXED_MAGIC", usedIn: "exit_weak", live: false },
    { group: "Context filters", name: "Rolling drawdown guard window and PF", value: "15 trades · PF<0.6", kind: "FIXED_MAGIC", usedIn: "drift_guard", live: false },
    // ── GIỜ (gold/FX-tuned) ──
    { group: "Gold-specific session assumptions", name: "session_ctx", value: "7–21 UTC", kind: "GOLD_TUNED", usedIn: "session gate", live: false, note: "Not suitable for a continuous crypto market without review; exchange sessions differ." },
    { group: "Gold-specific session assumptions", name: "dead_hour", value: "22–2 UTC", kind: "GOLD_TUNED", usedIn: "dead_hour gate", live: false, note: "SAI cho crypto/index" },
    { group: "Gold-specific session assumptions", name: "session spread tiers", value: "Asia/Eu/US (UTC)", kind: "GOLD_TUNED", usedIn: "simCostModel", live: false },
    // ── SELF-CALIBRATING (the honest few) ──
    { group: "Data-derived estimates", name: "distribution_rr", value: "SL=p90 MAE · TP=p75 MFE · at least 20 observations", kind: "SELF_CALIBRATING", usedIn: "distribution_rr", live: false, note: "Uses the Card’s own completed historical trades." },
    // ── CH engine thresholds (descriptive lens, CH_AUTH_1) ──
    { group: "CH engine (lens)", name: "swing W (left/right)", value: `${DEFAULT_SWING_CONFIG.lookback_left}/${DEFAULT_SWING_CONFIG.lookback_right}`, kind: "FIXED_MAGIC", usedIn: "confirmed_swing", live: true },
    { group: "CH engine (lens)", name: "impulse_body", value: DEFAULT_THRESHOLDS.impulse_body, kind: "FIXED_MAGIC", usedIn: "episode classify", live: true, note: "Registered null-check threshold, not fitted to the test result." },
    { group: "CH engine (lens)", name: "impulse_range", value: DEFAULT_THRESHOLDS.impulse_range, kind: "FIXED_MAGIC", usedIn: "episode classify", live: true },
    { group: "CH engine (lens)", name: "range_small", value: DEFAULT_THRESHOLDS.range_small, kind: "FIXED_MAGIC", usedIn: "episode classify", live: true },
    { group: "CH engine (lens)", name: "corrective_body", value: DEFAULT_THRESHOLDS.corrective_body, kind: "FIXED_MAGIC", usedIn: "episode classify", live: true },
    { group: "CH engine (lens)", name: "sweep_pierce_atr", value: DEFAULT_THRESHOLDS.sweep_pierce_atr, kind: "FIXED_MAGIC", usedIn: "episode classify", live: true },
    { group: "CH engine (lens)", name: "SIM_CAPS macro/seg/cluster/candle", value: `${SIM_CAPS.macro}/${SIM_CAPS.segment}/${SIM_CAPS.cluster}/${SIM_CAPS.candle}`, kind: "FIXED_MAGIC", usedIn: "similarity search", live: true },
    // ── GATES (measuring sticks) ──
    { group: "Validation thresholds", name: "ERA_STABILITY_MIN", value: ERA_STABILITY_MIN, kind: "GATE", usedIn: "era-stability gate", live: true },
    { group: "Validation thresholds", name: "CROSS_ERA_MIN (ARI)", value: CROSS_ERA_MIN, kind: "GATE", usedIn: "cluster gate", live: true },
    { group: "Validation thresholds", name: "null-gate minRatio", value: 4, kind: "GATE", usedIn: "nullRelativeStability", live: false },
    { group: "Validation thresholds", name: "hard-probe floor · margin", value: "ARI 0.80 · lift 0.10", kind: "GATE", usedIn: "hardClusterProbe", live: false },
    { group: "Validation thresholds", name: "honesty MINRR / sample gates", value: "n≥100 · PF cutoffs", kind: "GATE", usedIn: "MetricValidityGate", live: false },
    // ── CASCADE windows ──
    { group: "Cascade", name: "Research window duration, days", value: `${STAGE_DAYS.Y10} / ${STAGE_DAYS.M6} / ${STAGE_DAYS.M1}`, kind: "FIXED_MAGIC", usedIn: "stage windows", live: true },
    { group: "Cascade", name: "sim seed", value: C.seed, kind: "FIXED_MAGIC", usedIn: "deterministic RNG", live: true },
  ];
  return c;
}

export interface CoefSummary { total: number; byKind: Record<CoefKind, number>; provisional: number; goldTuned: number; selfCalib: number; live: number }
export function coefSummary(coefs: Coef[]): CoefSummary {
  const byKind = { PROVISIONAL: 0, FIXED_MAGIC: 0, GOLD_TUNED: 0, GATE: 0, SELF_CALIBRATING: 0, USER_TUNABLE: 0 } as Record<CoefKind, number>;
  let live = 0;
  for (const c of coefs) { byKind[c.kind]++; if (c.live) live++; }
  return { total: coefs.length, byKind, provisional: byKind.PROVISIONAL, goldTuned: byKind.GOLD_TUNED, selfCalib: byKind.SELF_CALIBRATING, live };
}
