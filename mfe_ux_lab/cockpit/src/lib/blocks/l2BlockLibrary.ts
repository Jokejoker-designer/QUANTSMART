// l2BlockLibrary — the L2 (Indicator/Context) palette: 56 port-typed blocks across 10 groups. Applies the
// manager's 5 corrections: Emit "Bias" → Emit Bias Context (directional context, not entry); Raw Ref LIMITED;
// Higher-TF blocks carry asOf; Safety/Output = exactly 8 blocks; self-calibrating blocks default SHADOW_ONLY.
// Every block authority is HARD-locked (advisory · no entry/exit/zone/order · not live-ready). L2 reads L1.
import { type L2BlockSpec, type L2Group, mk, np } from "./l2BlockTypes.ts";

export const L2_BLOCKS: L2BlockSpec[] = [
  // ───────── 1 · FEATURE INPUT (kéo L1 feature vào) ─────────
  mk({ id: "feature_ref", group: "FEATURE_INPUT", label: "Feature Ref", desc: "Select a promoted L1 feature as input", out: "FEATURE", viz: "wire" }),
  mk({ id: "feature_bus", group: "FEATURE_INPUT", label: "Feature Bus", desc: "Group L1 features into an array for fusion", out: "FEATURE_ARRAY", viz: "wire" }),
  mk({ id: "raw_ref", group: "FEATURE_INPUT", label: "Raw Ref", desc: "Use close/ATR/source trace/context normalization only. Reuse an existing L1 Feature Ref instead of reimplementing its measurement in L2.", out: "FEATURE", viz: "wire", rawRefLimited: true, note: "Limited: does not recreate the upstream L1 measurement." }),
  mk({ id: "htf_feature", group: "FEATURE_INPUT", label: "Higher-TF Feature", desc: "Higher-timeframe feature from completed candles only; carries source_tf and asOfTimestamp", out: "HTF_FEATURE", viz: "wire", asOf: true, note: "asOf closed-bar · no-lookahead" }),
  mk({ id: "lag_feature", group: "FEATURE_INPUT", label: "Lag Feature", desc: "Feature value k bars ago", in: ["FEATURE"], out: "FEATURE", params: [np("k", "Bars", 1, 1, 100)], viz: "oscillator" }),
  mk({ id: "feature_pack", group: "FEATURE_INPUT", label: "Feature Pack", desc: "Bundle related features, such as trend or volatility, into an array", out: "FEATURE_ARRAY", viz: "wire" }),

  // ───────── 2 · FUSION (ghép feature CÓ TRỌNG SỐ — weightSource bắt buộc) ─────────
  mk({ id: "weighted_sum", group: "FUSION", label: "Weighted Sum", desc: "Weighted feature sum with user-configured coefficients", in: ["FEATURE_ARRAY"], out: "INDICATOR", weightSource: "USER_WEIGHTED", viz: "contribution_bars", usageRoles: ["BIAS_TREND"] }),
  mk({ id: "weighted_average", group: "FUSION", label: "Weighted Average", desc: "Weighted mean normalized to [0,1]", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "USER_WEIGHTED", viz: "contribution_bars" }),
  mk({ id: "vote_count", group: "FUSION", label: "Vote Count", desc: "Count features above a threshold", in: ["FEATURE_ARRAY"], out: "STRENGTH", params: [np("t", "Threshold", 0.5, 0, 1, 0.01)], weightSource: "FIXED", viz: "oscillator", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "and_fusion", group: "FUSION", label: "AND-Fusion", desc: "Geometric mean: all features must be high", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "FIXED", viz: "oscillator" }),
  mk({ id: "or_fusion", group: "FUSION", label: "OR-Fusion", desc: "Maximum: one high feature is sufficient", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "FIXED", viz: "oscillator" }),
  mk({ id: "weakest_link", group: "FUSION", label: "Weakest-Link", desc: "Minimum: the weakest input determines the output", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "FIXED", viz: "oscillator" }),
  mk({ id: "confidence_weighted", group: "FUSION", label: "Confidence-Weighted", desc: "Weights follow each feature's calibrated reliability", in: ["FEATURE_ARRAY"], out: "INDICATOR", weightSource: "SELF_CALIBRATING", selfCalibrating: true, viz: "contribution_bars", note: "Shadow until the required OOS, walk-forward and era-stability checks." }),

  // ───────── 3 · REGIME / STATE CLASSIFIER (→ CONTEXT, viz regime ribbon) ─────────
  mk({ id: "trend_regime", group: "REGIME_CLASSIFIER", label: "Trend Regime", desc: "UP / RANGE / DOWN from slope and strength", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["BIAS_TREND", "REGIME_VOL"] }),
  mk({ id: "volatility_regime", group: "REGIME_CLASSIFIER", label: "Volatility Regime", desc: "LOW / NORMAL / HIGH from ATR percentile", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["REGIME_VOL", "RISK_DANGER"] }),
  mk({ id: "quiet_shock", group: "REGIME_CLASSIFIER", label: "Quiet / Shock", desc: "Calm versus shock state", in: ["FEATURE"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["REGIME_VOL", "RISK_DANGER"] }),
  mk({ id: "trend_vs_range", group: "REGIME_CLASSIFIER", label: "Trend vs Range", desc: "Trend versus range context (ADX-like)", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["REGIME_VOL"] }),
  mk({ id: "momentum_state", group: "REGIME_CLASSIFIER", label: "Momentum State", desc: "ACCELERATING / FADING / REVERSING", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["TIMING_TRIGGER", "BIAS_TREND"] }),
  mk({ id: "session_regime", group: "REGIME_CLASSIFIER", label: "Session Regime", desc: "Asia / Europe / US session context from the completed candle's time", out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["FILTER_CONTEXT"] }),

  // ───────── 4 · TREND / MOMENTUM CONTEXT ─────────
  mk({ id: "trend_direction", group: "TREND_MOMENTUM", label: "Trend Direction", desc: "−1/0/+1 — directional context only · NOT entry signal", in: ["INDICATOR"], out: { name: "out", type: "BIAS_CONTEXT", range: "[-1,1]" }, viz: "regime_ribbon", usageRoles: ["BIAS_TREND"], note: "directional context only · not entry" }),
  mk({ id: "trend_strength", group: "TREND_MOMENTUM", label: "Trend Strength", desc: "Trend strength in [0,1]", in: ["INDICATOR"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["BIAS_TREND"] }),
  mk({ id: "momentum", group: "TREND_MOMENTUM", label: "Momentum", desc: "Rate of change of a feature", in: ["FEATURE"], out: "INDICATOR", params: [np("k", "Bars", 5, 1, 100)], viz: "oscillator", usageRoles: ["TIMING_TRIGGER", "BIAS_TREND"] }),
  mk({ id: "acceleration", group: "TREND_MOMENTUM", label: "Acceleration", desc: "Second derivative: acceleration or deceleration", in: ["INDICATOR"], out: "INDICATOR", viz: "oscillator", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "pullback_in_trend", group: "TREND_MOMENTUM", label: "Pullback-in-Trend", desc: "Pullback depth within a trend", in: ["FEATURE", "CONTEXT"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["TIMING_TRIGGER", "CONFIRMATION_QUALITY"] }),

  // ───────── 5 · NORMALIZE / CALIBRATE (self-calibrating → SHADOW) ─────────
  mk({ id: "adaptive_zscore", group: "NORMALIZE_CALIBRATE", label: "Adaptive Z-Score", desc: "Regime-specific calibrated z-score", in: ["FEATURE"], out: "INDICATOR", params: [np("N", "Window", 50, 10, 500)], viz: "oscillator", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),
  mk({ id: "percentile_in_history", group: "NORMALIZE_CALIBRATE", label: "Percentile-in-History", desc: "Deterministic percentile position relative to history, in [0,1]", in: ["FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, params: [np("N", "Window", 100, 20, 1000)], viz: "gauge" }),
  mk({ id: "adaptive_threshold", group: "NORMALIZE_CALIBRATE", label: "Adaptive Threshold", desc: "Calibrated threshold adapts to volatility", in: ["FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "oscillator", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),
  mk({ id: "regime_relative_scale", group: "NORMALIZE_CALIBRATE", label: "Regime-Relative Scale", desc: "Calibrated normalization for the current regime", in: ["FEATURE", "CONTEXT"], out: "INDICATOR", viz: "oscillator", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),
  mk({ id: "robust_scale", group: "NORMALIZE_CALIBRATE", label: "Robust Scale (MAD)", desc: "Deterministic median/MAD normalization for outlier robustness", in: ["FEATURE"], out: "INDICATOR", params: [np("N", "Window", 50, 10, 500)], viz: "oscillator" }),

  // ───────── 6 · RELATIONSHIP / DIVERGENCE ─────────
  mk({ id: "divergence", group: "RELATIONSHIP", label: "Divergence", desc: "Divergence between rising price and weakening momentum", in: ["FEATURE", "FEATURE"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "marker", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "rolling_correlation", group: "RELATIONSHIP", label: "Rolling Correlation", desc: "N-bar correlation between two features", in: ["FEATURE", "FEATURE"], out: "INDICATOR", params: [np("N", "Window", 50, 10, 500)], viz: "oscillator" }),
  mk({ id: "indicator_ratio", group: "RELATIONSHIP", label: "Indicator Ratio", desc: "Ratio of two indicators with a numerical guard", in: ["INDICATOR", "INDICATOR"], out: "INDICATOR", viz: "wire", kidi: true }),
  mk({ id: "spread", group: "RELATIONSHIP", label: "Spread", desc: "Difference between two indicators", in: ["INDICATOR", "INDICATOR"], out: "INDICATOR", viz: "oscillator" }),
  mk({ id: "confirmation", group: "RELATIONSHIP", label: "Confirmation", desc: "Agreement between two features, in [0,1]", in: ["FEATURE", "FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "lead_lag", group: "RELATIONSHIP", label: "Lead / Lag", desc: "Lead/lag relationship at the selected lag", in: ["FEATURE", "FEATURE"], out: "INDICATOR", params: [np("maxLag", "Maximum lag", 10, 1, 60)], viz: "oscillator" }),

  // ───────── 7 · MULTI-TIMEFRAME (asOf) ─────────
  mk({ id: "htf_regime", group: "MULTI_TF", label: "HTF Regime", desc: "Higher-timeframe regime from completed candles only", in: ["HTF_FEATURE"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", asOf: true, usageRoles: ["REGIME_VOL", "BIAS_TREND"] }),
  mk({ id: "tf_agreement", group: "MULTI_TF", label: "TF Agreement", desc: "Lower/higher-timeframe agreement, in [0,1], evaluated as of the observation", in: ["FEATURE", "HTF_FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "heatmap", asOf: true, usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "confluence_score", group: "MULTI_TF", label: "Confluence Score", desc: "Multi-timeframe confluence score in [0,1], evaluated as of the observation", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "heatmap", asOf: true, usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "tf_cascade", group: "MULTI_TF", label: "TF Cascade", desc: "D1 → H4 → H1 agreement using completed observations", in: ["FEATURE_ARRAY"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", asOf: true, usageRoles: ["BIAS_TREND", "REGIME_VOL"] }),

  // ───────── 8 · STABILIZE / CONFIRM ─────────
  mk({ id: "persistence_gate", group: "STABILIZE", label: "Persistence Gate", desc: "Require N bars of context persistence", in: ["CONTEXT"], out: { name: "out", type: "CONTEXT", range: "enum" }, params: [np("N", "Bars", 3, 1, 50)], viz: "regime_ribbon" }),
  mk({ id: "hysteresis_regime", group: "STABILIZE", label: "Hysteresis Regime", desc: "Hysteretic regime state to reduce flicker", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, params: [np("on", "On above", 0.7, 0, 1, 0.01), np("off", "Off below", 0.3, 0, 1, 0.01)], viz: "regime_ribbon" }),
  mk({ id: "confirm_on_close", group: "STABILIZE", label: "Confirm-on-Close", desc: "Finalize context on candle close only", in: ["CONTEXT"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon" }),
  mk({ id: "debounce", group: "STABILIZE", label: "Debounce", desc: "Suppress short-lived state changes", in: ["CONTEXT"], out: { name: "out", type: "CONTEXT", range: "enum" }, params: [np("N", "Bars", 2, 1, 30)], viz: "regime_ribbon" }),
  mk({ id: "smooth_context", group: "STABILIZE", label: "Smooth Context", desc: "EMA smoothing of the indicator", in: ["INDICATOR"], out: "INDICATOR", params: [np("p", "Period", 5, 2, 100)], viz: "oscillator" }),

  // ───────── 9 · QUALITY / RELIABILITY ─────────
  mk({ id: "context_confidence", group: "QUALITY", label: "Context Confidence", desc: "Context confidence in [0,1]; not a win probability", in: ["CONTEXT"], out: { name: "out", type: "CONFIDENCE", range: "[0,1]" }, viz: "gauge", note: "confidence ≠ win probability" }),
  mk({ id: "conflict_detector", group: "QUALITY", label: "Conflict Detector", desc: "Conflicting features reduce confidence", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "heatmap", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "stability_score", group: "QUALITY", label: "Stability Score", desc: "Regime stability in [0,1]", in: ["INDICATOR"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge" }),
  mk({ id: "data_sufficiency_gate", group: "QUALITY", label: "Data-Sufficiency Gate", desc: "Check whether enough history is available", in: ["FEATURE"], out: "BOOL", viz: "badge" }),

  // ───────── 10 · SAFETY / OUTPUT (đúng 8 block) ─────────
  mk({ id: "emit_indicator", group: "SAFETY_OUTPUT", label: "Emit Indicator", desc: "Emit a numeric indicator value", in: ["INDICATOR"], out: "OUT", viz: "oscillator" }),
  mk({ id: "emit_context", group: "SAFETY_OUTPUT", label: "Emit Context", desc: "Emit regime/context with strength", in: ["CONTEXT"], out: "OUT", viz: "regime_ribbon" }),
  mk({ id: "emit_bias_context", group: "SAFETY_OUTPUT", label: "Emit Bias Context", desc: "Emit context bias −1 / 0 / +1; not an entry signal", in: ["BIAS_CONTEXT"], out: "OUT", viz: "regime_ribbon", note: "directional context only · not entry signal" }),
  mk({ id: "map_label", group: "SAFETY_OUTPUT", label: "Map-Label", desc: "Attach a display label to the regime", in: ["CONTEXT"], out: "OUT", viz: "badge" }),
  mk({ id: "kidi_guard", group: "SAFETY_OUTPUT", label: "KIDI Guard", desc: "Guard division by zero and singular values", in: ["INDICATOR"], out: "INDICATOR", viz: "badge", kidi: true }),
  mk({ id: "naninf_guard", group: "SAFETY_OUTPUT", label: "NaN/Inf Guard", desc: "Guard non-finite values", in: ["INDICATOR"], out: "INDICATOR", viz: "badge", nanGuard: true }),
  mk({ id: "nolookahead_seal", group: "SAFETY_OUTPUT", label: "No-Lookahead Seal", desc: "Required causal/as-of seal before emitting output", in: ["INDICATOR"], out: "INDICATOR", viz: "badge", note: "required before Emit" }),
  mk({ id: "debug_trace", group: "SAFETY_OUTPUT", label: "Debug Trace", desc: "Diagnostic log/trace; excluded from the numeric output", in: ["INDICATOR"], out: "TRACE", viz: "badge", note: "Trace only; not part of the output." }),
];

export const L2_BLOCKS_BY_ID: Record<string, L2BlockSpec> = Object.fromEntries(L2_BLOCKS.map((b) => [b.blockId, b]));
export function l2BlocksByGroup(g: L2Group): L2BlockSpec[] { return L2_BLOCKS.filter((b) => b.group === g); }
export function l2BlockSummary() {
  const byGroup: Record<string, number> = {}; let selfCal = 0, asOf = 0, fusion = 0;
  for (const b of L2_BLOCKS) { byGroup[b.group] = (byGroup[b.group] || 0) + 1; if (b.selfCalibrating) selfCal++; if (b.asOf) asOf++; if (b.weightSource) fusion++; }
  return { total: L2_BLOCKS.length, byGroup, selfCalibrating: selfCal, asOf, weighted: fusion };
}
