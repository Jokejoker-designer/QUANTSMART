// l2BlockLibrary — the L2 (Indicator/Context) palette: 56 port-typed blocks across 10 groups. Applies the
// manager's 5 corrections: Emit "Bias" → Emit Bias Context (directional context, not entry); Raw Ref LIMITED;
// Higher-TF blocks carry asOf; Safety/Output = exactly 8 blocks; self-calibrating blocks default SHADOW_ONLY.
// Every block authority is HARD-locked (advisory · no entry/exit/zone/order · not live-ready). L2 reads L1.
import { type L2BlockSpec, type L2Group, mk, np } from "./l2BlockTypes.ts";

export const L2_BLOCKS: L2BlockSpec[] = [
  // ───────── 1 · FEATURE INPUT (kéo L1 feature vào) ─────────
  mk({ id: "feature_ref", group: "FEATURE_INPUT", label: "Feature Ref", desc: "Chọn 1 feature L1 (đã promoted) làm đầu vào", out: "FEATURE", viz: "wire" }),
  mk({ id: "feature_bus", group: "FEATURE_INPUT", label: "Feature Bus", desc: "Gom nhiều feature L1 thành 1 mảng cho fusion", out: "FEATURE_ARRAY", viz: "wire" }),
  mk({ id: "raw_ref", group: "FEATURE_INPUT", label: "Raw Ref", desc: "CHỈ close/ATR/source trace/context-normalize. Nếu đã có feature L1 tương ứng PHẢI dùng Feature Ref. L2 KHÔNG được tái đo thay L1.", out: "FEATURE", viz: "wire", rawRefLimited: true, note: "Limited: does not recreate the upstream L1 measurement." }),
  mk({ id: "htf_feature", group: "FEATURE_INPUT", label: "Higher-TF Feature", desc: "Feature ở khung lớn hơn — bắt buộc asOf nến ĐÃ ĐÓNG (source_tf · asOfTimestamp · no forming HTF candle)", out: "HTF_FEATURE", viz: "wire", asOf: true, note: "asOf closed-bar · no-lookahead" }),
  mk({ id: "lag_feature", group: "FEATURE_INPUT", label: "Lag Feature", desc: "Feature của k nến trước (so biến thiên)", in: ["FEATURE"], out: "FEATURE", params: [np("k", "Số nến", 1, 1, 100)], viz: "oscillator" }),
  mk({ id: "feature_pack", group: "FEATURE_INPUT", label: "Feature Pack", desc: "Bó feature theo chủ đề (trend/vol) thành mảng", out: "FEATURE_ARRAY", viz: "wire" }),

  // ───────── 2 · FUSION (ghép feature CÓ TRỌNG SỐ — weightSource bắt buộc) ─────────
  mk({ id: "weighted_sum", group: "FUSION", label: "Weighted Sum", desc: "Σ wᵢ·featureᵢ — chỉ báo tổng hợp, hệ số do user kéo", in: ["FEATURE_ARRAY"], out: "INDICATOR", weightSource: "USER_WEIGHTED", viz: "contribution_bars", usageRoles: ["BIAS_TREND"] }),
  mk({ id: "weighted_average", group: "FUSION", label: "Weighted Average", desc: "Trung bình có trọng số (chuẩn hóa [0,1])", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "USER_WEIGHTED", viz: "contribution_bars" }),
  mk({ id: "vote_count", group: "FUSION", label: "Vote Count", desc: "Đếm feature vượt ngưỡng (đồng thuận)", in: ["FEATURE_ARRAY"], out: "STRENGTH", params: [np("t", "Ngưỡng", 0.5, 0, 1, 0.01)], weightSource: "FIXED", viz: "oscillator", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "and_fusion", group: "FUSION", label: "AND-Fusion", desc: "Tất cả feature phải cao mới cao (geo-mean)", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "FIXED", viz: "oscillator" }),
  mk({ id: "or_fusion", group: "FUSION", label: "OR-Fusion", desc: "Một feature cao là cao (max)", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "FIXED", viz: "oscillator" }),
  mk({ id: "weakest_link", group: "FUSION", label: "Weakest-Link", desc: "Mắt xích yếu nhất (min)", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, weightSource: "FIXED", viz: "oscillator" }),
  mk({ id: "confidence_weighted", group: "FUSION", label: "Confidence-Weighted", desc: "Trọng số theo độ tin từng feature (tự hiệu chỉnh)", in: ["FEATURE_ARRAY"], out: "INDICATOR", weightSource: "SELF_CALIBRATING", selfCalibrating: true, viz: "contribution_bars", note: "Shadow until the required OOS, walk-forward and era-stability checks." }),

  // ───────── 3 · REGIME / STATE CLASSIFIER (→ CONTEXT, viz regime ribbon) ─────────
  mk({ id: "trend_regime", group: "REGIME_CLASSIFIER", label: "Trend Regime", desc: "UP / RANGE / DOWN từ slope + strength", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["BIAS_TREND", "REGIME_VOL"] }),
  mk({ id: "volatility_regime", group: "REGIME_CLASSIFIER", label: "Volatility Regime", desc: "LOW / NORMAL / HIGH từ ATR percentile", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["REGIME_VOL", "RISK_DANGER"] }),
  mk({ id: "quiet_shock", group: "REGIME_CLASSIFIER", label: "Quiet / Shock", desc: "Êm vs sốc", in: ["FEATURE"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["REGIME_VOL", "RISK_DANGER"] }),
  mk({ id: "trend_vs_range", group: "REGIME_CLASSIFIER", label: "Trend vs Range", desc: "Xu hướng hay đi ngang (ADX-like)", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["REGIME_VOL"] }),
  mk({ id: "momentum_state", group: "REGIME_CLASSIFIER", label: "Momentum State", desc: "ACCELERATING / FADING / REVERSING", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["TIMING_TRIGGER", "BIAS_TREND"] }),
  mk({ id: "session_regime", group: "REGIME_CLASSIFIER", label: "Session Regime", desc: "Á / Âu / Mỹ (ngữ cảnh phiên, từ giờ nến đã đóng)", out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", usageRoles: ["FILTER_CONTEXT"] }),

  // ───────── 4 · TREND / MOMENTUM CONTEXT ─────────
  mk({ id: "trend_direction", group: "TREND_MOMENTUM", label: "Trend Direction", desc: "−1/0/+1 — directional context only · NOT entry signal", in: ["INDICATOR"], out: { name: "out", type: "BIAS_CONTEXT", range: "[-1,1]" }, viz: "regime_ribbon", usageRoles: ["BIAS_TREND"], note: "directional context only · not entry" }),
  mk({ id: "trend_strength", group: "TREND_MOMENTUM", label: "Trend Strength", desc: "Độ mạnh xu hướng [0,1]", in: ["INDICATOR"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["BIAS_TREND"] }),
  mk({ id: "momentum", group: "TREND_MOMENTUM", label: "Momentum", desc: "Tốc độ đổi của feature", in: ["FEATURE"], out: "INDICATOR", params: [np("k", "Số nến", 5, 1, 100)], viz: "oscillator", usageRoles: ["TIMING_TRIGGER", "BIAS_TREND"] }),
  mk({ id: "acceleration", group: "TREND_MOMENTUM", label: "Acceleration", desc: "Đạo hàm 2 (đang tăng/giảm tốc)", in: ["INDICATOR"], out: "INDICATOR", viz: "oscillator", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "pullback_in_trend", group: "TREND_MOMENTUM", label: "Pullback-in-Trend", desc: "Đang hồi trong xu hướng bao sâu", in: ["FEATURE", "CONTEXT"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["TIMING_TRIGGER", "CONFIRMATION_QUALITY"] }),

  // ───────── 5 · NORMALIZE / CALIBRATE (self-calibrating → SHADOW) ─────────
  mk({ id: "adaptive_zscore", group: "NORMALIZE_CALIBRATE", label: "Adaptive Z-Score", desc: "Z-score theo từng regime (tự hiệu chỉnh)", in: ["FEATURE"], out: "INDICATOR", params: [np("N", "Cửa sổ", 50, 10, 500)], viz: "oscillator", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),
  mk({ id: "percentile_in_history", group: "NORMALIZE_CALIBRATE", label: "Percentile-in-History", desc: "Đang đứng phân vị nào so lịch sử (0–1, deterministic)", in: ["FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, params: [np("N", "Cửa sổ", 100, 20, 1000)], viz: "gauge" }),
  mk({ id: "adaptive_threshold", group: "NORMALIZE_CALIBRATE", label: "Adaptive Threshold", desc: "Ngưỡng tự co theo vol (tự hiệu chỉnh)", in: ["FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "oscillator", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),
  mk({ id: "regime_relative_scale", group: "NORMALIZE_CALIBRATE", label: "Regime-Relative Scale", desc: "Chuẩn theo regime hiện tại (tự hiệu chỉnh)", in: ["FEATURE", "CONTEXT"], out: "INDICATOR", viz: "oscillator", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),
  mk({ id: "robust_scale", group: "NORMALIZE_CALIBRATE", label: "Robust Scale (MAD)", desc: "Chuẩn bằng trung vị/MAD, chống outlier (deterministic)", in: ["FEATURE"], out: "INDICATOR", params: [np("N", "Cửa sổ", 50, 10, 500)], viz: "oscillator" }),

  // ───────── 6 · RELATIONSHIP / DIVERGENCE ─────────
  mk({ id: "divergence", group: "RELATIONSHIP", label: "Divergence", desc: "Giá lên mà động lượng yếu đi (phân kỳ)", in: ["FEATURE", "FEATURE"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "marker", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "rolling_correlation", group: "RELATIONSHIP", label: "Rolling Correlation", desc: "Tương quan N nến của 2 feature", in: ["FEATURE", "FEATURE"], out: "INDICATOR", params: [np("N", "Cửa sổ", 50, 10, 500)], viz: "oscillator" }),
  mk({ id: "indicator_ratio", group: "RELATIONSHIP", label: "Indicator Ratio", desc: "Tỷ số 2 chỉ báo — qua KIDI guard", in: ["INDICATOR", "INDICATOR"], out: "INDICATOR", viz: "wire", kidi: true }),
  mk({ id: "spread", group: "RELATIONSHIP", label: "Spread", desc: "Hiệu 2 chỉ báo", in: ["INDICATOR", "INDICATOR"], out: "INDICATOR", viz: "oscillator" }),
  mk({ id: "confirmation", group: "RELATIONSHIP", label: "Confirmation", desc: "2 feature có đồng thuận không [0,1]", in: ["FEATURE", "FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "lead_lag", group: "RELATIONSHIP", label: "Lead / Lag", desc: "Cái nào dẫn cái nào (độ trễ tối ưu)", in: ["FEATURE", "FEATURE"], out: "INDICATOR", params: [np("maxLag", "Trễ tối đa", 10, 1, 60)], viz: "oscillator" }),

  // ───────── 7 · MULTI-TIMEFRAME (asOf) ─────────
  mk({ id: "htf_regime", group: "MULTI_TF", label: "HTF Regime", desc: "Regime ở TF lớn (asOf nến đã đóng)", in: ["HTF_FEATURE"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", asOf: true, usageRoles: ["REGIME_VOL", "BIAS_TREND"] }),
  mk({ id: "tf_agreement", group: "MULTI_TF", label: "TF Agreement", desc: "TF nhỏ có khớp TF lớn không [0,1] (asOf)", in: ["FEATURE", "HTF_FEATURE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "heatmap", asOf: true, usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "confluence_score", group: "MULTI_TF", label: "Confluence Score", desc: "Điểm hợp lưu nhiều TF [0,1] (asOf)", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "heatmap", asOf: true, usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "tf_cascade", group: "MULTI_TF", label: "TF Cascade", desc: "D1→H4→H1 thống nhất (asOf)", in: ["FEATURE_ARRAY"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon", asOf: true, usageRoles: ["BIAS_TREND", "REGIME_VOL"] }),

  // ───────── 8 · STABILIZE / CONFIRM ─────────
  mk({ id: "persistence_gate", group: "STABILIZE", label: "Persistence Gate", desc: "Giữ N nến mới công nhận context", in: ["CONTEXT"], out: { name: "out", type: "CONTEXT", range: "enum" }, params: [np("N", "Số nến", 3, 1, 50)], viz: "regime_ribbon" }),
  mk({ id: "hysteresis_regime", group: "STABILIZE", label: "Hysteresis Regime", desc: "Regime dính (chống flip-flop)", in: ["INDICATOR"], out: { name: "out", type: "CONTEXT", range: "enum" }, params: [np("on", "Bật >", 0.7, 0, 1, 0.01), np("off", "Tắt <", 0.3, 0, 1, 0.01)], viz: "regime_ribbon" }),
  mk({ id: "confirm_on_close", group: "STABILIZE", label: "Confirm-on-Close", desc: "Chỉ chốt context khi nến đóng (no forming)", in: ["CONTEXT"], out: { name: "out", type: "CONTEXT", range: "enum" }, viz: "regime_ribbon" }),
  mk({ id: "debounce", group: "STABILIZE", label: "Debounce", desc: "Bỏ nhấp nháy ngắn", in: ["CONTEXT"], out: { name: "out", type: "CONTEXT", range: "enum" }, params: [np("N", "Số nến", 2, 1, 30)], viz: "regime_ribbon" }),
  mk({ id: "smooth_context", group: "STABILIZE", label: "Smooth Context", desc: "EMA của chỉ báo (làm mượt)", in: ["INDICATOR"], out: "INDICATOR", params: [np("p", "Period", 5, 2, 100)], viz: "oscillator" }),

  // ───────── 9 · QUALITY / RELIABILITY ─────────
  mk({ id: "context_confidence", group: "QUALITY", label: "Context Confidence", desc: "Độ tin của ngữ cảnh hiện tại [0,1] — KHÔNG phải win probability", in: ["CONTEXT"], out: { name: "out", type: "CONFIDENCE", range: "[0,1]" }, viz: "gauge", note: "confidence ≠ win probability" }),
  mk({ id: "conflict_detector", group: "QUALITY", label: "Conflict Detector", desc: "Các feature mâu thuẫn ⇒ tin thấp", in: ["FEATURE_ARRAY"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "heatmap", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "stability_score", group: "QUALITY", label: "Stability Score", desc: "Regime ổn định cỡ nào [0,1]", in: ["INDICATOR"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge" }),
  mk({ id: "data_sufficiency_gate", group: "QUALITY", label: "Data-Sufficiency Gate", desc: "Đủ lịch sử để tin chưa", in: ["FEATURE"], out: "BOOL", viz: "badge" }),

  // ───────── 10 · SAFETY / OUTPUT (đúng 8 block) ─────────
  mk({ id: "emit_indicator", group: "SAFETY_OUTPUT", label: "Emit Indicator", desc: "Xuất 1 con số chỉ báo", in: ["INDICATOR"], out: "OUT", viz: "oscillator" }),
  mk({ id: "emit_context", group: "SAFETY_OUTPUT", label: "Emit Context", desc: "Xuất regime/context + độ mạnh", in: ["CONTEXT"], out: "OUT", viz: "regime_ribbon" }),
  mk({ id: "emit_bias_context", group: "SAFETY_OUTPUT", label: "Emit Bias Context", desc: "Xuất bias ngữ cảnh −1/0/+1 — directional context only · NOT entry signal", in: ["BIAS_CONTEXT"], out: "OUT", viz: "regime_ribbon", note: "directional context only · not entry signal" }),
  mk({ id: "map_label", group: "SAFETY_OUTPUT", label: "Map-Label", desc: "Gắn nhãn regime để hiển thị", in: ["CONTEXT"], out: "OUT", viz: "badge" }),
  mk({ id: "kidi_guard", group: "SAFETY_OUTPUT", label: "KIDI Guard", desc: "Chống chia 0 / singular", in: ["INDICATOR"], out: "INDICATOR", viz: "badge", kidi: true }),
  mk({ id: "naninf_guard", group: "SAFETY_OUTPUT", label: "NaN/Inf Guard", desc: "Chống số hỏng", in: ["INDICATOR"], out: "INDICATOR", viz: "badge", nanGuard: true }),
  mk({ id: "nolookahead_seal", group: "SAFETY_OUTPUT", label: "No-Lookahead Seal", desc: "Niêm phong causal/asOf — BẮT BUỘC trước Emit Output", in: ["INDICATOR"], out: "INDICATOR", viz: "badge", note: "required before Emit" }),
  mk({ id: "debug_trace", group: "SAFETY_OUTPUT", label: "Debug Trace", desc: "Log/trace để soi — KHÔNG vào output", in: ["INDICATOR"], out: "TRACE", viz: "badge", note: "Trace only; not part of the output." }),
];

export const L2_BLOCKS_BY_ID: Record<string, L2BlockSpec> = Object.fromEntries(L2_BLOCKS.map((b) => [b.blockId, b]));
export function l2BlocksByGroup(g: L2Group): L2BlockSpec[] { return L2_BLOCKS.filter((b) => b.group === g); }
export function l2BlockSummary() {
  const byGroup: Record<string, number> = {}; let selfCal = 0, asOf = 0, fusion = 0;
  for (const b of L2_BLOCKS) { byGroup[b.group] = (byGroup[b.group] || 0) + 1; if (b.selfCalibrating) selfCal++; if (b.asOf) asOf++; if (b.weightSource) fusion++; }
  return { total: L2_BLOCKS.length, byGroup, selfCalibrating: selfCal, asOf, weighted: fusion };
}
