// l5BlockLibrary — the L5 (Strategy Logic) palette: 56 decision-state blocks across 8 groups. L5 is the "brain":
// reads L2 context / L3 score / L4 market-context and emits a DECISION-STATE (setup → confirm → ready → veto →
// stage → exit-hint). Every block authority is HARD-locked: advisory · decision-state only · ZONE-ONLY downstream ·
// NO order_send / lot / exact SL-TP · human decides · not live-ready. Exit blocks emit a HINT, never an order.
import { type L5BlockSpec, type L5Group, mk, np } from "./l5BlockTypes.ts";

export const L5_BLOCKS: L5BlockSpec[] = [
  // ───────── 1 · ENTRY PATTERN (setup detectors → SETUP candidate, NOT an order) ─────────
  mk({ id: "trend_pullback", group: "ENTRY_PATTERN", label: "Trend Pullback", desc: "Trend pullback followed by continuation; candidate setup only", in: ["BIAS_CONTEXT", "INDICATOR"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "sweep_reclaim", group: "ENTRY_PATTERN", label: "Sweep + Reclaim", desc: "Liquidity sweep followed by reclaim; candidate setup", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "range_fade", group: "ENTRY_PATTERN", label: "Range Fade", desc: "Fade the upper/lower boundary of a range; candidate setup", in: ["CONTEXT", "INDICATOR"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "breakout_retest", group: "ENTRY_PATTERN", label: "Breakout Retest", desc: "Break a level, then hold its retest; candidate setup", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "failed_break_fade", group: "ENTRY_PATTERN", label: "Failed-Break Fade", desc: "Failed breakout closes inside the boundary; candidate fade setup", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "mean_reversion", group: "ENTRY_PATTERN", label: "Mean Reversion", desc: "Large deviation from the mean; candidate mean-reversion setup", in: ["INDICATOR"], out: "SETUP", params: [np("z", "Z threshold", 2, 1, 4, 0.1)], viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "momentum_continuation", group: "ENTRY_PATTERN", label: "Momentum Continuation", desc: "Persistent momentum; candidate continuation setup", in: ["INDICATOR", "BIAS_CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER", "BIAS_TREND"] }),
  mk({ id: "double_tap", group: "ENTRY_PATTERN", label: "Double-Tap", desc: "Two tests of the same region; double-top/bottom candidate setup", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge" }),
  mk({ id: "sr_bounce", group: "ENTRY_PATTERN", label: "S/R Bounce", desc: "Reaction at causal support/resistance; candidate setup", in: ["CONTEXT", "INDICATOR"], out: "SETUP", viz: "setup_badge" }),

  // ───────── 2 · CONFIRMATION (gate a SETUP into READY — quality filters) ─────────
  mk({ id: "mtf_align_gate", group: "CONFIRMATION", label: "MTF Align Gate", desc: "Require completed higher-timeframe agreement before marking a setup ready", in: [{ name: "setup", type: "SETUP", required: true }, { name: "htf", type: "CONTEXT", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "momentum_confirm", group: "CONFIRMATION", label: "Momentum Confirm", desc: "Confirm only when momentum aligns with the setup", in: [{ name: "setup", type: "SETUP", required: true }, { name: "mom", type: "INDICATOR", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "structure_confirm", group: "CONFIRMATION", label: "Structure Confirm", desc: "Use HH/HL or LH/LL structure to confirm a setup", in: [{ name: "setup", type: "SETUP", required: true }, { name: "struct", type: "CONTEXT", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "close_confirm", group: "CONFIRMATION", label: "Confirm-on-Close", desc: "Confirm setups only on completed candles; no forming-bar repainting", in: ["SETUP"], out: "READY", viz: "checklist" }),
  mk({ id: "persist_confirm", group: "CONFIRMATION", label: "Persist Confirm", desc: "Require persistence for N bars to reduce flicker", in: ["SETUP"], out: "READY", params: [np("N", "Bars", 2, 1, 20)], viz: "checklist" }),
  mk({ id: "retest_confirm", group: "CONFIRMATION", label: "Retest Confirm", desc: "Wait for a held retest before marking the setup ready", in: [{ name: "setup", type: "SETUP", required: true }, { name: "level", type: "INDICATOR", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "confidence_confirm", group: "CONFIRMATION", label: "Confidence Confirm", desc: "Require context confidence above the calibrated threshold", in: [{ name: "setup", type: "SETUP", required: true }, { name: "conf", type: "CONFIDENCE", required: true }], out: "READY", params: [np("t", "Threshold", 0.55, 0, 1, 0.01)], viz: "checklist", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),

  // ───────── 3 · VETO / STAND-ASIDE (block entry → VETO) ─────────
  mk({ id: "no_trade_chop", group: "VETO_STANDASIDE", label: "No-Trade Chop", desc: "Veto choppy conditions with a small EMA gap or low ADX", in: ["CONTEXT"], out: "VETO", viz: "veto_flag", usageRoles: ["FILTER_CONTEXT"] }),
  mk({ id: "overextended_veto", group: "VETO_STANDASIDE", label: "Overextended Veto", desc: "Veto excessive distance from the mean in ATR units", in: ["INDICATOR"], out: "VETO", params: [np("z", "z-cap", 2.5, 1, 5, 0.1)], viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "against_htf_veto", group: "VETO_STANDASIDE", label: "Against-HTF Veto", desc: "Veto setups against completed higher-timeframe structure", in: [{ name: "setup", type: "SETUP", required: true }, { name: "htf", type: "BIAS_CONTEXT", required: true }], out: "VETO", viz: "veto_flag", usageRoles: ["FILTER_CONTEXT"] }),
  mk({ id: "news_avoid_veto", group: "VETO_STANDASIDE", label: "News-Avoid Veto", desc: "Veto within the declared news window; requires an event calendar", in: ["CONTEXT"], out: "VETO", viz: "veto_flag", note: "Recurring calendar proxy, not a live event feed." }),
  mk({ id: "low_confidence_veto", group: "VETO_STANDASIDE", label: "Low-Confidence Veto", desc: "Veto when context confidence is below its threshold", in: ["CONFIDENCE"], out: "VETO", params: [np("t", "Threshold", 0.4, 0, 1, 0.01)], viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "conflict_veto", group: "VETO_STANDASIDE", label: "Conflict Veto", desc: "Veto conflicting observations", in: ["CONTEXT"], out: "VETO", viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "dead_hour_veto", group: "VETO_STANDASIDE", label: "Dead-Hour Veto", desc: "Veto the configured low-liquidity hours (22–02 UTC; gold-specific assumption)", out: "VETO", viz: "veto_flag", note: "GOLD-SPECIFIC assumption; review before using crypto or indices" }),
  mk({ id: "danger_spread_veto", group: "VETO_STANDASIDE", label: "Danger / Spread Veto", desc: "Veto high spread or danger observations", in: ["STRENGTH"], out: "VETO", params: [np("t", "Danger-cap", 0.6, 0, 1, 0.01)], viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),

  // ───────── 4 · COMBINE / ARBITRATE (merge many logic blocks → DECISION) ─────────
  mk({ id: "and_all", group: "COMBINE_ARBITRATE", label: "AND-All", desc: "Require all conditions for the research decision state", in: [{ name: "in", type: "READY", required: true, accepts: ["READY", "SETUP", "TRIGGER"] }], out: "DECISION", viz: "wire" }),
  mk({ id: "or_any", group: "COMBINE_ARBITRATE", label: "OR-Any", desc: "Require any condition for the research decision state", in: [{ name: "in", type: "READY", required: true, accepts: ["READY", "SETUP", "TRIGGER"] }], out: "DECISION", viz: "wire" }),
  mk({ id: "priority_select", group: "COMBINE_ARBITRATE", label: "Priority Select", desc: "Select setups in the declared priority order", in: ["READY"], out: "DECISION", viz: "wire" }),
  mk({ id: "veto_override", group: "COMBINE_ARBITRATE", label: "Veto Override", desc: "Any veto overrides the candidate setup", in: [{ name: "decision", type: "DECISION", required: true }, { name: "veto", type: "VETO", required: true }], out: "DECISION", viz: "wire" }),
  mk({ id: "weighted_vote", group: "COMBINE_ARBITRATE", label: "Weighted Vote", desc: "Weighted advisory votes using configured or calibrated weights", in: ["READY"], out: "DECISION", viz: "gauge", selfCalibrating: true, note: "User-selected or Shadow-calibrated weight; inspect the saved profile." }),
  mk({ id: "first_fire", group: "COMBINE_ARBITRATE", label: "First-Fire", desc: "Use the first setup to fire; one at a time", in: ["TRIGGER"], out: "DECISION", viz: "wire" }),
  mk({ id: "k_of_n", group: "COMBINE_ARBITRATE", label: "K-of-N", desc: "Require K of N conditions for the research decision state", in: ["READY"], out: "DECISION", params: [np("k", "K", 2, 1, 8)], viz: "checklist" }),

  // ───────── 5 · STATE MACHINE (stage the setup lifecycle → STAGE) ─────────
  mk({ id: "watch_arm_trigger", group: "STATE_MACHINE", label: "Watch→Arm→Trigger", desc: "State machine: watching → armed → triggered → ready-zone", in: [{ name: "setup", type: "SETUP", required: true }, { name: "ctx", type: "CONTEXT", required: false }], out: "STAGE", viz: "stage_flow", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "arm_on_context", group: "STATE_MACHINE", label: "Arm-on-Context", desc: "Arm only when regime/session context matches", in: [{ name: "stage", type: "STAGE", required: true }, { name: "ctx", type: "CONTEXT", required: true }], out: "STAGE", viz: "stage_flow" }),
  mk({ id: "trigger_on_event", group: "STATE_MACHINE", label: "Trigger-on-Event", desc: "Move to triggered on the declared reclaim/break event", in: [{ name: "stage", type: "STAGE", required: true }, { name: "ev", type: "INDICATOR", required: true }], out: "TRIGGER", viz: "stage_flow", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "invalidate_reset", group: "STATE_MACHINE", label: "Invalidate-Reset", desc: "Reset the state when the thesis is invalidated", in: [{ name: "stage", type: "STAGE", required: true }, { name: "inval", type: "INDICATOR", required: true }], out: "STAGE", viz: "stage_flow" }),
  mk({ id: "cooldown_state", group: "STATE_MACHINE", label: "Cooldown", desc: "Wait N bars after a simulated trade", in: ["STAGE"], out: "STAGE", params: [np("N", "Bars", 5, 0, 100)], viz: "stage_flow" }),
  mk({ id: "one_position_lock", group: "STATE_MACHINE", label: "One-Position Lock", desc: "Allow only one simulated position at a time", in: ["STAGE"], out: "STAGE", viz: "stage_flow" }),

  // ───────── 6 · EXIT LOGIC (exit HINT only — never an order) ─────────
  mk({ id: "thesis_weakening", group: "EXIT_LOGIC", label: "Thesis Weakening", desc: "Weakening thesis produces an exit hint; no broker order", in: ["CONTEXT"], out: "EXIT_HINT", viz: "exit_hint", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "target_reached_hint", group: "EXIT_LOGIC", label: "Target-Reached Hint", desc: "An opposing structural level produces an exit hint", in: ["INDICATOR"], out: "EXIT_HINT", viz: "exit_hint" }),
  mk({ id: "time_stop_hint", group: "EXIT_LOGIC", label: "Time-Stop Hint", desc: "An N-bar timeout produces an exit hint", in: ["STAGE"], out: "EXIT_HINT", params: [np("N", "Bars", 28, 1, 200)], viz: "exit_hint" }),
  mk({ id: "trailing_hint", group: "EXIT_LOGIC", label: "Trailing Hint", desc: "Suggest a structural protection adjustment; no exact broker price", in: ["INDICATOR"], out: "EXIT_HINT", viz: "exit_hint" }),
  mk({ id: "structure_break_exit", group: "EXIT_LOGIC", label: "Structure-Break Exit", desc: "A structural break produces an exit hint", in: ["CONTEXT"], out: "EXIT_HINT", viz: "exit_hint", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "regime_flip_exit", group: "EXIT_LOGIC", label: "Regime-Flip Exit", desc: "An opposing regime change produces an exit hint", in: ["CONTEXT"], out: "EXIT_HINT", viz: "exit_hint", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "breakeven_hint", group: "EXIT_LOGIC", label: "Breakeven Hint", desc: "At the configured R threshold, suggest break-even protection", in: ["STRENGTH"], out: "EXIT_HINT", params: [np("r", "Activation R", 1, 0.2, 5, 0.1)], viz: "exit_hint" }),
  mk({ id: "partial_scale_hint", group: "EXIT_LOGIC", label: "Partial-Scale Hint", desc: "Suggest partial realization at the declared reference; no automatic volume", in: ["INDICATOR"], out: "EXIT_HINT", viz: "exit_hint" }),

  // ───────── 7 · RISK CONTEXT (advisory sizing/risk hints — NO exact SL/TP/lot) ─────────
  mk({ id: "confidence_scale_hint", group: "RISK_CONTEXT", label: "Confidence-Scale Hint", desc: "Relative confidence-based sizing observation in [0,1]; no exact lot size", in: ["CONFIDENCE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "regime_risk_downgrade", group: "RISK_CONTEXT", label: "Regime-Risk Downgrade", desc: "Reduce the relative research risk scale in adverse/high-volatility regimes", in: ["CONTEXT"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["REGIME_VOL", "RISK_DANGER"] }),
  mk({ id: "danger_aware_standdown", group: "RISK_CONTEXT", label: "Danger-Aware Stand-Down", desc: "High danger produces a stand-aside context; does not reverse direction", in: ["STRENGTH"], out: "CONTEXT", viz: "gauge", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "session_risk_context", group: "RISK_CONTEXT", label: "Session-Risk Context", desc: "Session risk assumptions: lower in overlap, higher in Asia/rollover", out: "CONTEXT", viz: "gauge", usageRoles: ["FILTER_CONTEXT"] }),
  mk({ id: "volatility_adjust_hint", group: "RISK_CONTEXT", label: "Volatility-Adjust Hint", desc: "Relative advisory adjustment using ATR percentile", in: ["INDICATOR"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["REGIME_VOL"] }),

  // ───────── 8 · SAFETY / OUTPUT (governance — mandatory, terminal) ─────────
  mk({ id: "authority_lock_l5", group: "SAFETY_OUTPUT", label: "Authority Lock", desc: "Advisory, zone-only output; no broker orders, automatic lot sizes or exact stops/targets", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "no_lookahead_seal_l5", group: "SAFETY_OUTPUT", label: "No-Lookahead Seal", desc: "Seal the research state as of t; no future candles", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "zone_only_output", group: "SAFETY_OUTPUT", label: "Zone-Only Output", desc: "Send the L5 output to L6 as a reference zone rather than an order", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "no_order_guard", group: "SAFETY_OUTPUT", label: "No-Order Guard", desc: "Prevent broker-order and automatic-volume paths in strategy logic", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "human_decides_note", group: "SAFETY_OUTPUT", label: "Human-Decides Note", desc: "Label the output as a research suggestion requiring human interpretation", in: ["DECISION"], out: "OUT", viz: "setup_badge" }),
  mk({ id: "decision_trace", group: "SAFETY_OUTPUT", label: "Decision Trace", desc: "Record the setup, confirmation and veto rationale", in: ["DECISION"], out: "OUT", viz: "wire" }),
];
