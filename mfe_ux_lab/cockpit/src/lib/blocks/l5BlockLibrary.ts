// l5BlockLibrary — the L5 (Strategy Logic) palette: 56 decision-state blocks across 8 groups. L5 is the "brain":
// reads L2 context / L3 score / L4 market-context and emits a DECISION-STATE (setup → confirm → ready → veto →
// stage → exit-hint). Every block authority is HARD-locked: advisory · decision-state only · ZONE-ONLY downstream ·
// NO order_send / lot / exact SL-TP · human decides · not live-ready. Exit blocks emit a HINT, never an order.
import { type L5BlockSpec, type L5Group, mk, np } from "./l5BlockTypes.ts";

export const L5_BLOCKS: L5BlockSpec[] = [
  // ───────── 1 · ENTRY PATTERN (setup detectors → SETUP candidate, NOT an order) ─────────
  mk({ id: "trend_pullback", group: "ENTRY_PATTERN", label: "Trend Pullback", desc: "Hồi về trong xu hướng rồi tiếp diễn — SETUP ứng-viên (chưa vào lệnh)", in: ["BIAS_CONTEXT", "INDICATOR"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "sweep_reclaim", group: "ENTRY_PATTERN", label: "Sweep + Reclaim", desc: "Quét thanh-khoản rồi lấy lại mức — SETUP", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "range_fade", group: "ENTRY_PATTERN", label: "Range Fade", desc: "Fade biên trên/dưới của range — SETUP", in: ["CONTEXT", "INDICATOR"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "breakout_retest", group: "ENTRY_PATTERN", label: "Breakout Retest", desc: "Phá vỡ mức rồi retest giữ — SETUP", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "failed_break_fade", group: "ENTRY_PATTERN", label: "Failed-Break Fade", desc: "Phá hụt (đóng lại trong biên) → fade ngược — SETUP", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "mean_reversion", group: "ENTRY_PATTERN", label: "Mean Reversion", desc: "Quá xa trung-bình → kỳ-vọng hồi — SETUP", in: ["INDICATOR"], out: "SETUP", params: [np("z", "Ngưỡng z", 2, 1, 4, 0.1)], viz: "setup_badge", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "momentum_continuation", group: "ENTRY_PATTERN", label: "Momentum Continuation", desc: "Động-lượng còn mạnh → tiếp diễn — SETUP", in: ["INDICATOR", "BIAS_CONTEXT"], out: "SETUP", viz: "setup_badge", usageRoles: ["TIMING_TRIGGER", "BIAS_TREND"] }),
  mk({ id: "double_tap", group: "ENTRY_PATTERN", label: "Double-Tap", desc: "Chạm 2 lần cùng vùng (đáy/đỉnh đôi) — SETUP", in: ["INDICATOR", "CONTEXT"], out: "SETUP", viz: "setup_badge" }),
  mk({ id: "sr_bounce", group: "ENTRY_PATTERN", label: "S/R Bounce", desc: "Bật từ hỗ-trợ/kháng-cự causal — SETUP", in: ["CONTEXT", "INDICATOR"], out: "SETUP", viz: "setup_badge" }),

  // ───────── 2 · CONFIRMATION (gate a SETUP into READY — quality filters) ─────────
  mk({ id: "mtf_align_gate", group: "CONFIRMATION", label: "MTF Align Gate", desc: "TF lớn đồng-thuận mới cho SETUP thành READY (asOf)", in: [{ name: "setup", type: "SETUP", required: true }, { name: "htf", type: "CONTEXT", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "momentum_confirm", group: "CONFIRMATION", label: "Momentum Confirm", desc: "Động-lượng cùng hướng mới xác-nhận", in: [{ name: "setup", type: "SETUP", required: true }, { name: "mom", type: "INDICATOR", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "structure_confirm", group: "CONFIRMATION", label: "Structure Confirm", desc: "Cấu-trúc HH/HL (hoặc LH/LL) xác-nhận SETUP", in: [{ name: "setup", type: "SETUP", required: true }, { name: "struct", type: "CONTEXT", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "close_confirm", group: "CONFIRMATION", label: "Confirm-on-Close", desc: "Chỉ chốt SETUP khi nến ĐÃ ĐÓNG (no forming, no repaint)", in: ["SETUP"], out: "READY", viz: "checklist" }),
  mk({ id: "persist_confirm", group: "CONFIRMATION", label: "Persist Confirm", desc: "Giữ N nến mới công-nhận (chống nhấp-nháy)", in: ["SETUP"], out: "READY", params: [np("N", "Số nến", 2, 1, 20)], viz: "checklist" }),
  mk({ id: "retest_confirm", group: "CONFIRMATION", label: "Retest Confirm", desc: "Chờ giá retest mức rồi giữ mới READY", in: [{ name: "setup", type: "SETUP", required: true }, { name: "level", type: "INDICATOR", required: true }], out: "READY", viz: "checklist", usageRoles: ["CONFIRMATION_QUALITY"] }),
  mk({ id: "confidence_confirm", group: "CONFIRMATION", label: "Confidence Confirm", desc: "Độ-tin ngữ-cảnh ≥ ngưỡng mới READY (self-calib)", in: [{ name: "setup", type: "SETUP", required: true }, { name: "conf", type: "CONFIDENCE", required: true }], out: "READY", params: [np("t", "Ngưỡng", 0.55, 0, 1, 0.01)], viz: "checklist", selfCalibrating: true, note: "Shadow until the required OOS, walk-forward and era-stability checks." }),

  // ───────── 3 · VETO / STAND-ASIDE (block entry → VETO) ─────────
  mk({ id: "no_trade_chop", group: "VETO_STANDASIDE", label: "No-Trade Chop", desc: "Veto khi thị-trường chop (EMA-gap nhỏ / ADX thấp)", in: ["CONTEXT"], out: "VETO", viz: "veto_flag", usageRoles: ["FILTER_CONTEXT"] }),
  mk({ id: "overextended_veto", group: "VETO_STANDASIDE", label: "Overextended Veto", desc: "Veto khi giá quá căng so mean/ATR (đu đỉnh)", in: ["INDICATOR"], out: "VETO", params: [np("z", "z-cap", 2.5, 1, 5, 0.1)], viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "against_htf_veto", group: "VETO_STANDASIDE", label: "Against-HTF Veto", desc: "Veto khi SETUP ngược xu-hướng TF lớn (asOf)", in: [{ name: "setup", type: "SETUP", required: true }, { name: "htf", type: "BIAS_CONTEXT", required: true }], out: "VETO", viz: "veto_flag", usageRoles: ["FILTER_CONTEXT"] }),
  mk({ id: "news_avoid_veto", group: "VETO_STANDASIDE", label: "News-Avoid Veto", desc: "Veto trong cửa-sổ tin (NFP/CPI proxy — cần lịch)", in: ["CONTEXT"], out: "VETO", viz: "veto_flag", note: "Recurring calendar proxy, not a live event feed." }),
  mk({ id: "low_confidence_veto", group: "VETO_STANDASIDE", label: "Low-Confidence Veto", desc: "Veto khi độ-tin ngữ-cảnh dưới ngưỡng", in: ["CONFIDENCE"], out: "VETO", params: [np("t", "Ngưỡng", 0.4, 0, 1, 0.01)], viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "conflict_veto", group: "VETO_STANDASIDE", label: "Conflict Veto", desc: "Veto khi các tín-hiệu mâu-thuẫn nhau (đứng ngoài)", in: ["CONTEXT"], out: "VETO", viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "dead_hour_veto", group: "VETO_STANDASIDE", label: "Dead-Hour Veto", desc: "Veto giờ thanh-khoản chết (22–2 UTC · gold-tuned)", out: "VETO", viz: "veto_flag", note: "GOLD-TUNED · sai cho crypto/index" }),
  mk({ id: "danger_spread_veto", group: "VETO_STANDASIDE", label: "Danger / Spread Veto", desc: "Veto khi spread/danger cao (môi-trường xấu để vào)", in: ["STRENGTH"], out: "VETO", params: [np("t", "Danger-cap", 0.6, 0, 1, 0.01)], viz: "veto_flag", usageRoles: ["RISK_DANGER"] }),

  // ───────── 4 · COMBINE / ARBITRATE (merge many logic blocks → DECISION) ─────────
  mk({ id: "and_all", group: "COMBINE_ARBITRATE", label: "AND-All", desc: "Chỉ DECISION khi TẤT-CẢ điều-kiện đủ", in: [{ name: "in", type: "READY", required: true, accepts: ["READY", "SETUP", "TRIGGER"] }], out: "DECISION", viz: "wire" }),
  mk({ id: "or_any", group: "COMBINE_ARBITRATE", label: "OR-Any", desc: "DECISION khi MỘT điều-kiện đủ", in: [{ name: "in", type: "READY", required: true, accepts: ["READY", "SETUP", "TRIGGER"] }], out: "DECISION", viz: "wire" }),
  mk({ id: "priority_select", group: "COMBINE_ARBITRATE", label: "Priority Select", desc: "Chọn theo thứ-tự ưu-tiên (setup nào ưu-tiên hơn)", in: ["READY"], out: "DECISION", viz: "wire" }),
  mk({ id: "veto_override", group: "COMBINE_ARBITRATE", label: "Veto Override", desc: "Bất-kỳ VETO nào cũng THẮNG — dừng lệnh (an-toàn > cơ-hội)", in: [{ name: "decision", type: "DECISION", required: true }, { name: "veto", type: "VETO", required: true }], out: "DECISION", viz: "wire" }),
  mk({ id: "weighted_vote", group: "COMBINE_ARBITRATE", label: "Weighted Vote", desc: "Bỏ phiếu có trọng-số (advisory — trọng-số user tune / self-calib)", in: ["READY"], out: "DECISION", viz: "gauge", selfCalibrating: true, note: "User-selected or Shadow-calibrated weight; inspect the saved profile." }),
  mk({ id: "first_fire", group: "COMBINE_ARBITRATE", label: "First-Fire", desc: "SETUP nào fire trước thì theo (one-at-a-time)", in: ["TRIGGER"], out: "DECISION", viz: "wire" }),
  mk({ id: "k_of_n", group: "COMBINE_ARBITRATE", label: "K-of-N", desc: "Cần K trong N điều-kiện đủ mới DECISION", in: ["READY"], out: "DECISION", params: [np("k", "K", 2, 1, 8)], viz: "checklist" }),

  // ───────── 5 · STATE MACHINE (stage the setup lifecycle → STAGE) ─────────
  mk({ id: "watch_arm_trigger", group: "STATE_MACHINE", label: "Watch→Arm→Trigger", desc: "Máy-trạng-thái: watching → armed → triggered → ready-zone", in: [{ name: "setup", type: "SETUP", required: true }, { name: "ctx", type: "CONTEXT", required: false }], out: "STAGE", viz: "stage_flow", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "arm_on_context", group: "STATE_MACHINE", label: "Arm-on-Context", desc: "Chỉ ARM khi ngữ-cảnh hợp (regime/session)", in: [{ name: "stage", type: "STAGE", required: true }, { name: "ctx", type: "CONTEXT", required: true }], out: "STAGE", viz: "stage_flow" }),
  mk({ id: "trigger_on_event", group: "STATE_MACHINE", label: "Trigger-on-Event", desc: "Chuyển sang TRIGGERED khi có sự-kiện (reclaim/break)", in: [{ name: "stage", type: "STAGE", required: true }, { name: "ev", type: "INDICATOR", required: true }], out: "TRIGGER", viz: "stage_flow", usageRoles: ["TIMING_TRIGGER"] }),
  mk({ id: "invalidate_reset", group: "STATE_MACHINE", label: "Invalidate-Reset", desc: "Reset máy-trạng-thái khi thesis hỏng (quá mức huỷ)", in: [{ name: "stage", type: "STAGE", required: true }, { name: "inval", type: "INDICATOR", required: true }], out: "STAGE", viz: "stage_flow" }),
  mk({ id: "cooldown_state", group: "STATE_MACHINE", label: "Cooldown", desc: "Nghỉ N nến sau một lệnh (chống over-trade)", in: ["STAGE"], out: "STAGE", params: [np("N", "Số nến", 5, 0, 100)], viz: "stage_flow" }),
  mk({ id: "one_position_lock", group: "STATE_MACHINE", label: "One-Position Lock", desc: "Khoá: chỉ 1 vị-thế cùng lúc (không chồng lệnh)", in: ["STAGE"], out: "STAGE", viz: "stage_flow" }),

  // ───────── 6 · EXIT LOGIC (exit HINT only — never an order) ─────────
  mk({ id: "thesis_weakening", group: "EXIT_LOGIC", label: "Thesis Weakening", desc: "Luận-điểm yếu dần → GỢI-Ý thoát (hint, không phải lệnh)", in: ["CONTEXT"], out: "EXIT_HINT", viz: "exit_hint", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "target_reached_hint", group: "EXIT_LOGIC", label: "Target-Reached Hint", desc: "Chạm mức cấu-trúc đối-diện → hint chốt", in: ["INDICATOR"], out: "EXIT_HINT", viz: "exit_hint" }),
  mk({ id: "time_stop_hint", group: "EXIT_LOGIC", label: "Time-Stop Hint", desc: "Giữ quá N nến chưa chạy → hint thoát", in: ["STAGE"], out: "EXIT_HINT", params: [np("N", "Số nến", 28, 1, 200)], viz: "exit_hint" }),
  mk({ id: "trailing_hint", group: "EXIT_LOGIC", label: "Trailing Hint", desc: "Gợi-ý dời mức bảo-vệ theo cấu-trúc (advisory, không exact price)", in: ["INDICATOR"], out: "EXIT_HINT", viz: "exit_hint" }),
  mk({ id: "structure_break_exit", group: "EXIT_LOGIC", label: "Structure-Break Exit", desc: "Gãy cấu-trúc giữ vị-thế → hint thoát", in: ["CONTEXT"], out: "EXIT_HINT", viz: "exit_hint", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "regime_flip_exit", group: "EXIT_LOGIC", label: "Regime-Flip Exit", desc: "Regime lật ngược vị-thế → hint thoát", in: ["CONTEXT"], out: "EXIT_HINT", viz: "exit_hint", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "breakeven_hint", group: "EXIT_LOGIC", label: "Breakeven Hint", desc: "Đạt R nhất-định → hint dời về hoà-vốn (advisory)", in: ["STRENGTH"], out: "EXIT_HINT", params: [np("r", "R kích-hoạt", 1, 0.2, 5, 0.1)], viz: "exit_hint" }),
  mk({ id: "partial_scale_hint", group: "EXIT_LOGIC", label: "Partial-Scale Hint", desc: "Gợi-ý chốt một phần tại mốc (advisory, không auto-lot)", in: ["INDICATOR"], out: "EXIT_HINT", viz: "exit_hint" }),

  // ───────── 7 · RISK CONTEXT (advisory sizing/risk hints — NO exact SL/TP/lot) ─────────
  mk({ id: "confidence_scale_hint", group: "RISK_CONTEXT", label: "Confidence-Scale Hint", desc: "Gợi-ý cỡ tương-đối theo độ-tin [0,1] (advisory — KHÔNG lot chính-xác)", in: ["CONFIDENCE"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "regime_risk_downgrade", group: "RISK_CONTEXT", label: "Regime-Risk Downgrade", desc: "Hạ mức risk tương-đối khi regime xấu/vol cao", in: ["CONTEXT"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["REGIME_VOL", "RISK_DANGER"] }),
  mk({ id: "danger_aware_standdown", group: "RISK_CONTEXT", label: "Danger-Aware Stand-Down", desc: "Đứng ngoài khi danger cao (context, không đảo hướng)", in: ["STRENGTH"], out: "CONTEXT", viz: "gauge", usageRoles: ["RISK_DANGER"] }),
  mk({ id: "session_risk_context", group: "RISK_CONTEXT", label: "Session-Risk Context", desc: "Ngữ-cảnh risk theo phiên (overlap thấp · Á/rollover cao)", out: "CONTEXT", viz: "gauge", usageRoles: ["FILTER_CONTEXT"] }),
  mk({ id: "volatility_adjust_hint", group: "RISK_CONTEXT", label: "Volatility-Adjust Hint", desc: "Gợi-ý điều-chỉnh tương-đối theo ATR-percentile (advisory)", in: ["INDICATOR"], out: { name: "out", type: "STRENGTH", range: "[0,1]" }, viz: "gauge", usageRoles: ["REGIME_VOL"] }),

  // ───────── 8 · SAFETY / OUTPUT (governance — mandatory, terminal) ─────────
  mk({ id: "authority_lock_l5", group: "SAFETY_OUTPUT", label: "Authority Lock", desc: "Khoá: advisory · zone-only · KHÔNG order_send/lot/SL-TP chính-xác", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "no_lookahead_seal_l5", group: "SAFETY_OUTPUT", label: "No-Lookahead Seal", desc: "Niêm-phong quyết-định as-of-t (cấm dùng nến tương-lai)", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "zone_only_output", group: "SAFETY_OUTPUT", label: "Zone-Only Output", desc: "Ép đầu-ra L5 chảy xuống L6 dưới dạng VÙNG — không phải lệnh", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "no_order_guard", group: "SAFETY_OUTPUT", label: "No-Order Guard", desc: "Chặn mọi đường tới order_send/auto-lot ở tầng logic", in: ["DECISION"], out: "OUT", viz: "wire" }),
  mk({ id: "human_decides_note", group: "SAFETY_OUTPUT", label: "Human-Decides Note", desc: "Nhãn: đây là ĐỀ-XUẤT, người quyết vào/thoát", in: ["DECISION"], out: "OUT", viz: "setup_badge" }),
  mk({ id: "decision_trace", group: "SAFETY_OUTPUT", label: "Decision Trace", desc: "Ghi VÌ-SAO quyết-định (setup→confirm→veto) cho explainability", in: ["DECISION"], out: "OUT", viz: "wire" }),
];
