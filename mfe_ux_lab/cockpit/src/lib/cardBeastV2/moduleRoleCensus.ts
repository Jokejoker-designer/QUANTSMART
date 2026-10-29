// cardBeastV2/moduleRoleCensus (F1) — the SINGLE source of truth mapping every module id the realistic engine
// actually consumes → structural Role + Tribes + mechanism. This is the fix for "modules lộn xộn, role chỉ toàn
// attacker": the roles mostly EXISTED but were never classified, so Beast formation couldn't find its guards/
// confirmations. Classification is from ENGINE SEMANTICS (each entry cites the mechanism), not from names.
// Census exposes the honest gap report (FALLBACK=0, EXIT thin…). Keep IN SYNC with realisticStrategySim.ts.
import type { Role, Tribe } from "./vocabulary.ts";

export type Mechanism = "TRIGGER_VOTE" | "HARD_GATE" | "QUALITY_GATE_ON_VOTES" | "WEIGHT_SCALER" | "CONTEXT_STATE" | "EXIT_RULE" | "RR_SHAPER" | "COMBINER" | "FALLBACK_VOTE";
export interface ModuleCensusEntry {
  id: string;
  role: Role | "NONE";              // NONE = card infrastructure (combiner / RR shaper) — no role authority
  tribes: Tribe[];
  mechanism: Mechanism;
  note: string;                     // what the ENGINE actually does with it
}

export const MODULE_CENSUS: ModuleCensusEntry[] = [
  // ── ATTACKER-capable triggers (create candidate votes) ──
  { id: "trend_pullback", role: "ATTACKER", tribes: ["TREND", "RETEST"], mechanism: "TRIGGER_VOTE", note: "EMA10 pullback followed by a trend-aligned close" },
  { id: "ema_trend", role: "ATTACKER", tribes: ["TREND"], mechanism: "TRIGGER_VOTE", note: "Trend family, combined with trend_pullback using OR" },
  { id: "ema_slope", role: "ATTACKER", tribes: ["TREND", "MOMENTUM"], mechanism: "TRIGGER_VOTE", note: "trend family (OR)" },
  { id: "rsi_reclaim", role: "ATTACKER", tribes: ["REVERSAL", "MOMENTUM"], mechanism: "TRIGGER_VOTE", note: "RSI reclaim across 35 or 65" },
  { id: "rsi_value", role: "ATTACKER", tribes: ["REVERSAL", "MOMENTUM"], mechanism: "TRIGGER_VOTE", note: "rsi family (OR)" },
  { id: "sweep_reclaim", role: "ATTACKER", tribes: ["SWEEP", "LIQUIDITY"], mechanism: "TRIGGER_VOTE", note: "Sweep beyond a prior 20-bar extreme followed by a close back inside" },
  { id: "sweep_depth", role: "ATTACKER", tribes: ["SWEEP", "LIQUIDITY"], mechanism: "TRIGGER_VOTE", note: "sweep family (OR)" },
  { id: "sweep_risk", role: "ATTACKER", tribes: ["SWEEP", "FAKEOUT"], mechanism: "TRIGGER_VOTE", note: "sweep family (OR)" },
  { id: "range_fade", role: "ATTACKER", tribes: ["RANGE", "REVERSAL"], mechanism: "TRIGGER_VOTE", note: "Fade of the 20-bar range boundary" },
  { id: "fb_range_fade", role: "FALLBACK", tribes: ["RANGE", "REVERSAL"], mechanism: "FALLBACK_VOTE", note: "Fallback range-fade votes only when every primary attacker is silent, with reduced weight. It cannot produce candidates by itself" },
  { id: "break_retest", role: "ATTACKER", tribes: ["BREAKOUT", "RETEST"], mechanism: "TRIGGER_VOTE", note: "Break a 20-bar level, hold on closes within 0.25 ATR for up to twelve bars, then retest. Uses candle geometry; no volume is fabricated" },
  { id: "psl_sweep", role: "ATTACKER", tribes: ["SWEEP", "LIQUIDITY", "REVERSAL"], mechanism: "TRIGGER_VOTE", note: "Sweep of the previous session high/low followed by a close back inside" },
  { id: "vol_contraction", role: "ATTACKER", tribes: ["VOLATILITY", "BREAKOUT"], mechanism: "TRIGGER_VOTE", note: "Expansion from a compressed 12-bar range under the configured ATR conditions" },
  { id: "htf_anchor", role: "ATTACKER", tribes: ["MTF", "TREND", "RETEST"], mechanism: "TRIGGER_VOTE", note: "M15 pullback/reclaim conditioned on completed H1 and H4 structure" },
  { id: "asia_range_fade", role: "ATTACKER", tribes: ["SWEEP", "SESSION", "RANGE"], mechanism: "TRIGGER_VOTE", note: "London/NY sweep and reclaim of the completed Asian-session range" },
  { id: "wick_extreme", role: "ATTACKER", tribes: ["FAKEOUT", "REVERSAL", "VOLATILITY"], mechanism: "TRIGGER_VOTE", note: "Range above 2 ATR, wick at least 60%, and an opposing close location" },
  { id: "gap_fade", role: "ATTACKER", tribes: ["REVERSAL", "LIQUIDITY"], mechanism: "TRIGGER_VOTE", note: "Gap above 0.6 ATR, evaluated as a fade toward the previous close" },
  { id: "rsi_extreme", role: "ATTACKER", tribes: ["REVERSAL", "MOMENTUM"], mechanism: "TRIGGER_VOTE", note: "RSI turn from 22/78 extremes, distinct from the reclaim thresholds" },
  { id: "ichimoku", role: "ATTACKER", tribes: ["TREND", "MTF"], mechanism: "TRIGGER_VOTE", note: "classic: cloud + tenkan/kijun" },
  { id: "macd", role: "ATTACKER", tribes: ["MOMENTUM", "TREND"], mechanism: "TRIGGER_VOTE", note: "classic: MACD cross" },
  { id: "stochastic", role: "ATTACKER", tribes: ["REVERSAL", "MOMENTUM"], mechanism: "TRIGGER_VOTE", note: "Oscillator reversal context" },
  { id: "bollinger", role: "ATTACKER", tribes: ["RANGE", "VOLATILITY"], mechanism: "TRIGGER_VOTE", note: "Bollinger mean-reversion context" },
  { id: "fib_retrace", role: "ATTACKER", tribes: ["RETEST", "TREND"], mechanism: "TRIGGER_VOTE", note: "Pullback to a swing Fibonacci reference" },

  // ── GUARD (hard veto gates — adverse conditions block the entry) ──
  { id: "regime_ctx", role: "GUARD", tribes: ["TREND", "MTF"], mechanism: "HARD_GATE", note: "Vetoes a vote opposing the modeled regime" },
  { id: "session_ctx", role: "GUARD", tribes: ["SESSION"], mechanism: "HARD_GATE", note: "Vetoes outside 07:00–21:00 UTC" },
  { id: "dead_hour", role: "GUARD", tribes: ["SESSION"], mechanism: "HARD_GATE", note: "veto 22–02 UTC" },
  { id: "news_ctx", role: "GUARD", tribes: ["SESSION", "RISK"], mechanism: "HARD_GATE", note: "Vetoes within the recurring news proxy window" },
  { id: "no_trade_chop", role: "GUARD", tribes: ["RANGE", "RISK"], mechanism: "HARD_GATE", note: "veto khi EMA10≈EMA34 (chop)" },
  { id: "atr_pct", role: "GUARD", tribes: ["VOLATILITY"], mechanism: "HARD_GATE", note: "Vetoes ATR below 0.65 times its slow reference" },
  { id: "atr_vol", role: "GUARD", tribes: ["VOLATILITY"], mechanism: "HARD_GATE", note: "Low-volatility veto, combined with atr_pct using OR" },
  { id: "range_size", role: "GUARD", tribes: ["VOLATILITY", "FAKEOUT"], mechanism: "HARD_GATE", note: "Candle-quality veto under the configured wick/range conditions" },
  { id: "markov", role: "GUARD", tribes: ["TREND", "MOMENTUM"], mechanism: "HARD_GATE", note: "Veto based on modeled regime persistence" },
  { id: "drift_guard", role: "GUARD", tribes: ["RISK"], mechanism: "HARD_GATE", note: "Circuit breaker using the Card’s rolling historical PF" },
  { id: "adx", role: "GUARD", tribes: ["TREND", "MOMENTUM"], mechanism: "HARD_GATE", note: "ADX trend-strength gate; not a trigger" },

  // ── CONFIRMATION (quality/consensus on EXISTING votes — cannot create a candidate) ──
  { id: "calib_trust", role: "CONFIRMATION", tribes: ["RISK", "MTF"], mechanism: "QUALITY_GATE_ON_VOTES", note: "Requires at least two aligned votes" },
  { id: "topk_fit", role: "CONFIRMATION", tribes: ["MOMENTUM"], mechanism: "QUALITY_GATE_ON_VOTES", note: "Requires the configured recent conviction percentile" },
  { id: "state_machine", role: "CONFIRMATION", tribes: ["RETEST", "TREND"], mechanism: "QUALITY_GATE_ON_VOTES", note: "Armed-state sequence: pullback followed by reclaim" },
  { id: "mtf_confirm", role: "CONFIRMATION", tribes: ["MTF", "TREND"], mechanism: "WEIGHT_SCALER", note: "Scales existing vote weights from EMA10/34 agreement; never creates a vote" },

  // ── STRUCTURE GUARDS: the realistic engine uses both as hard vetoes; they are NOT advisory scouts. ──
  { id: "sr_zone_context", role: "GUARD", tribes: ["RETEST", "LIQUIDITY"], mechanism: "HARD_GATE", note: "Vetoes against causal support/resistance structure" },
  { id: "level_memory", role: "GUARD", tribes: ["LIQUIDITY"], mechanism: "HARD_GATE", note: "Vetoes a repeatedly tested reference level" },
  // ── SCOUT (context state — no veto, no candidate) ──
  { id: "ch_episode_lens", role: "SCOUT", tribes: ["MTF"], mechanism: "CONTEXT_STATE", note: "Descriptive episode overlay; no engine action" },

  // ── EXIT_SENTINEL ──
  { id: "exit_weak", role: "EXIT_SENTINEL", tribes: ["EXIT", "TREND"], mechanism: "EXIT_RULE", note: "Early simulated exit on weakening structure" },
  { id: "mr_exit", role: "EXIT_SENTINEL", tribes: ["EXIT", "REVERSAL", "RANGE"], mechanism: "EXIT_RULE", note: "Mean-reversion exit near EMA10 while profitable" },

  // ── card infrastructure (NO role authority) ──
  { id: "fusion", role: "NONE", tribes: [], mechanism: "COMBINER", note: "Weighted vote combination and fusion threshold" },
  { id: "bayesian", role: "NONE", tribes: [], mechanism: "COMBINER", note: "Reliability-weighted log odds" },
  { id: "ev", role: "NONE", tribes: [], mechanism: "COMBINER", note: "Cumulative EV can lock the rest of a window after a nonpositive estimate. This behavior differs from rolling EV and can materially reduce long-window coverage" },
  { id: "ev_rolling", role: "NONE", tribes: ["RISK"], mechanism: "COMBINER", note: "Rolling EV from twenty completed trades, with the configured lock reset" },
  { id: "auto_rr", role: "NONE", tribes: ["RISK", "EXIT"], mechanism: "RR_SHAPER", note: "ATR-based modeled protective and target zones" },
  { id: "distribution_rr", role: "NONE", tribes: ["RISK", "EXIT"], mechanism: "RR_SHAPER", note: "R:R from the Card’s own historical excursion distribution" },
];

const BY_ID = new Map(MODULE_CENSUS.map((m) => [m.id, m]));
export function censusOf(id: string): ModuleCensusEntry | undefined { return BY_ID.get(id); }

/** All engine ids that are NOT triggers (feeds cardTriggerDiagnosis — one source of truth, real ids). */
export const ENGINE_NON_TRIGGER_IDS: string[] = MODULE_CENSUS.filter((m) => m.mechanism !== "TRIGGER_VOTE").map((m) => m.id);

export interface RoleCensusReport {
  counts: Record<string, number>;
  byRole: Record<string, string[]>;
  gaps: { role: string; count: number; verdict: "EMPTY" | "THIN" | "OK" }[];
  beastFeasible: boolean;           // 1 ATTACKER + ≥1 GUARD (+ SAFETY = engine L0, always on) đủ đội hình tối thiểu
}
export function roleCensus(): RoleCensusReport {
  const byRole: Record<string, string[]> = {};
  for (const m of MODULE_CENSUS) (byRole[m.role] ||= []).push(m.id);
  const counts = Object.fromEntries(Object.entries(byRole).map(([r, ids]) => [r, ids.length]));
  const need: [string, number][] = [["ATTACKER", 2], ["GUARD", 2], ["CONFIRMATION", 2], ["SCOUT", 1], ["EXIT_SENTINEL", 1], ["FALLBACK", 1]];
  const gaps = need.map(([role, min]) => {
    const n = (byRole[role] || []).length;
    return { role, count: n, verdict: (n === 0 ? "EMPTY" : n < min ? "THIN" : "OK") as "EMPTY" | "THIN" | "OK" };
  });
  return { counts, byRole, gaps, beastFeasible: (byRole["ATTACKER"] || []).length >= 1 && (byRole["GUARD"] || []).length >= 1 };
}

// ── HARD RULE (owner 2026-07-02): EVERY module must be BUILT FROM BLOCKS. A module imported from the old
// QTQ/MFE systems is only accepted if it can be DECOMPOSED into L1/L2/L5 blocks that recombine — no monolithic
// hard module. The compiler classifies role from the block graph; the user never self-grants authority.
export const BLOCK_COMPOSITION_RULE = "MODULES_MUST_BE_BUILT_FROM_BLOCKS — legacy imports must decompose into reusable L1 feature, L2 indicator and L5 logic blocks; monolithic modules are not accepted." as const;

/** Import candidates surveyed from the OLD QTQ + MFE systems (2026-07-02) — fill the thin roles. Every entry is
 *  a CANDIDATE only: it enters the system exclusively via block decomposition + compiler classification. */
export interface ImportCandidate {
  source: string;                    // file in the old system
  proposed_role: Role;
  tribes: Tribe[];
  block_decomposition: string;       // which L1/L2/L5 blocks it decomposes into
  status: "CANDIDATE_REQUIRES_BLOCK_DECOMPOSITION" | "BLOCK_COMPOSED_AS_PRESET" | "MEASURED_NO_EDGE_SHADOW_ONLY";
}
export const IMPORT_CANDIDATES: ImportCandidate[] = [
  // GUARD reinforcements
  { source: "mfe_observers/blackswan_warning.py + QTQ blackswan footprint (AUC 0.644 leading shock witness)", proposed_role: "GUARD", tribes: ["VOLATILITY", "RISK"], block_decomposition: "blocks atrRatio + priceEmaAtr (ANY) → L5 VETO — shipped as preset '🦢 BlackSwan Guard'", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "mfe_observers/candle_pattern_warnings.py", proposed_role: "GUARD", tribes: ["FAKEOUT", "REVERSAL"], block_decomposition: "wickRatio block (introduced in F3) → preset '🕯 Candle Pattern Guard'", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "mfe_observers/danger_scale.py", proposed_role: "GUARD", tribes: ["RISK"], block_decomposition: "F4: blocks atrRatio>2.2 + wickRatio>0.85 + priceEmaAtr ±3 (ANY) → preset '☠️ Danger Scale Guard' (higher thresholds than BlackSwan)", status: "BLOCK_COMPOSED_AS_PRESET" },
  // CONFIRMATION reinforcements
  { source: "QTQ retest_quality (self-calibrating)", proposed_role: "CONFIRMATION", tribes: ["RETEST", "LIQUIDITY"], block_decomposition: "blocks priceEmaAtr + wickRatio → preset '🔍 Retest Quality' (custom CONFIRM weight-authority F3)", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "mfe_observers/evidence_independence_v2.py", proposed_role: "CONFIRMATION", tribes: ["RISK", "MTF"], block_decomposition: "block voteCount → preset '🧬 Evidence Independence' (CONFIRM weight)", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "QTQ CF-rhythm (self-calibrating)", proposed_role: "CONFIRMATION", tribes: ["MOMENTUM"], block_decomposition: "F4: flowConsistency block (body consistency over 8 bars) → preset '🎼 CF-Rhythm Confirm' (CONFIRM weight 1.2)", status: "BLOCK_COMPOSED_AS_PRESET" },
  // SCOUT reinforcements
  { source: "QTQ mtf agreement (self-calibrating)", proposed_role: "SCOUT", tribes: ["MTF"], block_decomposition: "F4: htfAlign block (4× and 16× structure using causal htfStructureDirs) → preset '🧭 MTF Agreement Gate' (CONTEXT_GATE)", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "mfe_observers/price_concentration.py", proposed_role: "SCOUT", tribes: ["LIQUIDITY", "RANGE"], block_decomposition: "F4: pocDistAtr block (96-bar histogram, 0.25 ATR bins) → preset '🎯 Price Concentration Gate' (CONTEXT_GATE)", status: "BLOCK_COMPOSED_AS_PRESET" },
  // EXIT_SENTINEL reinforcement (the thinnest real role)
  { source: "mfe_observers/smart_trailing.py", proposed_role: "EXIT_SENTINEL", tribes: ["EXIT", "TREND"], block_decomposition: "blocks maxR + rMultiple (ALL, give-back) → L5 EXIT — shipped as preset '🪂 Smart Trailing'. Measured train −0.008 / held +0.012; unconfirmed because the sign reverses", status: "BLOCK_COMPOSED_AS_PRESET" },
  // ── F3: MFE_Trade_Management_Lab_Package (owner: "chọn bộ hiệu quả nhất") — Lab chosen over MFE-old (đơn giản hơn) & QTQ (runtime-coupled, DROP). Effectiveness MEASURED on the ONE engine, 40k M15, train/held ──
  { source: "trade_management/sl_trailing_card.py (Lab)", proposed_role: "EXIT_SENTINEL", tribes: ["EXIT", "RISK"], block_decomposition: "Protective zone trailing: give-back is available; a structural hybrid requires a position-aware exit block that is not yet available", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "trade_management/trade_lifecycle_governor.py (Lab)", proposed_role: "EXIT_SENTINEL", tribes: ["EXIT", "RISK"], block_decomposition: "blocks heldBars + rMultiple → preset '⏱ Time-Stop'. Measured train +0.013 / held −0.017; unconfirmed, Shadow only", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "trade_management/daily_risk_budget_card.py (Lab)", proposed_role: "GUARD", tribes: ["RISK", "SESSION"], block_decomposition: "dayLosses block → preset 'Stop after 3 daily losses'", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "trade_management/daily_profit_target_card.py (Lab)", proposed_role: "GUARD", tribes: ["RISK"], block_decomposition: "block dayPnlR → preset '🎯 Daily Profit Target'", status: "BLOCK_COMPOSED_AS_PRESET" },
  { source: "trade_management/pid_controller.py + pid_*_cards (Lab)", proposed_role: "EXIT_SENTINEL", tribes: ["EXIT", "RISK"], block_decomposition: "Stateful controller requires error/integral/derivative primitives. The discrete ladder approximation measured harm on the trend attacker: train −0.046 / held −0.122 and deeper drawdown; no preset is shipped", status: "MEASURED_NO_EDGE_SHADOW_ONLY" },
  { source: "trade_management/tp_trailing_card.py + rr_policy_card.py (Lab)", proposed_role: "EXIT_SENTINEL", tribes: ["EXIT", "RISK"], block_decomposition: "F4 protective-only interpretation: tp_trailing uses a stepped LOCK_SL (preset '🪜 TP-Trailing Stop Ladder', maxR≥2→lock +1R, combined with Smart SL Lock); rr_policy applies a cost constraint (preset '💰 RR Cost Guard', VETO atrPct<0.04). Does not modify TP; target-zone authority is not enabled", status: "BLOCK_COMPOSED_AS_PRESET" },
];
// roll_dice_offset_card (Lab) REJECTED: offset ngẫu-nhiên xung-đột doctrine tái-lập/kiểm-chứng (determinism) — không đưa vào census.

/** Build role-pure card compositions from the census (for Beast formation tests / suggestions). */
export function roleCards(): { role: Role; card_id: string; modules: string[] }[] {
  return [
    { role: "ATTACKER", card_id: "atk_trend", modules: ["trend_pullback", "fusion", "auto_rr"] },
    { role: "GUARD", card_id: "grd_chop_session", modules: ["no_trade_chop", "dead_hour", "news_ctx"] },
    { role: "GUARD", card_id: "grd_structure", modules: ["sr_zone_context", "level_memory"] },
    { role: "CONFIRMATION", card_id: "cfm_mtf", modules: ["mtf_confirm", "calib_trust"] },
    { role: "SCOUT", card_id: "sct_episode", modules: ["ch_episode_lens"] },
    { role: "EXIT_SENTINEL", card_id: "ext_weak", modules: ["exit_weak"] },
    { role: "SAFETY", card_id: "l0_safety", modules: [] },   // L0 safety is engine-level, always on
  ];
}
