// l4BlockLibrary — L4 Context-Block Kit: catalog CURATED, MỖI block gói 1 metric-context đã có (trong 28 METRICS) +
// op mặc-định + ngưỡng gợi-ý + nhãn đời-thường, chia 6 nhóm. KHÔNG metric/logic mới. + 1 evidence-slot (user chọn id
// L1/L2/L3). Số block = số metric-context dùng được (24) + 1 evidence-slot = 25 — KHÔNG phồng cho bằng L1(83)/L5(56).
// Compile XUỐNG conditions CONTEXT_GATE cũ (l4Compile) → byte-identical với nhập-tay metric.
import type { L4BlockSpec } from "./l4BlockTypes.ts";

export const L4_BLOCKS: L4BlockSpec[] = [
  // ── REGIME / TREND ──
  { blockId: "l4_trend_regime", group: "REGIME", label: "Trend Regime", description: "EMA10/EMA34 directional context", metric: "regime", port: "CONTEXT", defaultOp: ">", defaultValue: 0, unit: "-1/0/1", note: "Positive or negative EMA trend direction" },
  { blockId: "l4_trend_strength", group: "REGIME", label: "Trend Strength (EMA Gap)", description: "EMA10 minus EMA34, normalized by ATR", metric: "emaGapAtr", port: "CONTEXT", defaultOp: ">", defaultValue: 0.4, unit: "×ATR" },
  { blockId: "l4_price_vs_ema", group: "REGIME", label: "Price versus EMA10", description: "Close minus EMA10, divided by ATR", metric: "priceEmaAtr", port: "CONTEXT", defaultOp: ">", defaultValue: 0, unit: "×ATR" },
  { blockId: "l4_htf_align", group: "REGIME", label: "Higher-timeframe alignment", description: "Agreement across two completed higher-timeframe buckets", metric: "htfAlign", port: "CONTEXT", defaultOp: ">=", defaultValue: 1, unit: "-2..2" },
  // ── SESSION / TIME ──
  { blockId: "l4_session_overlap", group: "SESSION", label: "London/NY overlap", description: "Restricts candidates to the configured overlap session", metric: "overlap", port: "CONTEXT", defaultOp: "==", defaultValue: 1, unit: "0/1" },
  { blockId: "l4_hour_window", group: "SESSION", label: "UTC hour window", description: "Restricts the hour of day", metric: "hour", port: "CONTEXT", defaultOp: "between", defaultValue: 7, value2: 16, unit: "0-23" },
  { blockId: "l4_spread_ok", group: "SESSION", label: "Spread constraint", description: "Excludes modeled spread above the configured limit", metric: "spread", port: "CONTEXT", defaultOp: "<", defaultValue: 0.3, unit: "$" },
  { blockId: "l4_rested", group: "SESSION", label: "Minimum bars since trade", description: "Prevents an immediate simulated re-entry", metric: "barsSinceTrade", port: "CONTEXT", defaultOp: ">=", defaultValue: 5, unit: "bars" },
  // ── VOLATILITY ──
  { blockId: "l4_atr_state", group: "VOLATILITY", label: "ATR State (%)", description: "Minimum volatility condition", metric: "atrPct", port: "CONTEXT", defaultOp: ">", defaultValue: 0.5, unit: "%" },
  { blockId: "l4_vol_expanding", group: "VOLATILITY", label: "Volatility expansion", description: "Fast ATR above the slower baseline", metric: "atrRatio", port: "CONTEXT", defaultOp: ">", defaultValue: 1.1, unit: "×" },
  // ── STRUCTURE / BREAKOUT ──
  { blockId: "l4_break_high20", group: "STRUCTURE", label: "20-bar high breakout", description: "Close above the prior 20-bar high", metric: "brokeHigh20", port: "CONTEXT", defaultOp: "==", defaultValue: 1, unit: "0/1" },
  { blockId: "l4_break_low20", group: "STRUCTURE", label: "20-bar low breakout", description: "Close below the prior 20-bar low", metric: "brokeLow20", port: "CONTEXT", defaultOp: "==", defaultValue: 1, unit: "0/1" },
  { blockId: "l4_poc_distance", group: "STRUCTURE", label: "POC distance, ATR", description: "Distance from the rolling price concentration", metric: "pocDistAtr", port: "CONTEXT", defaultOp: ">", defaultValue: 0.5, unit: "×ATR" },
  { blockId: "l4_not_overextended", group: "STRUCTURE", label: "Extension constraint", description: "Excludes an excessive extension beyond the reference level", metric: "extAtr", port: "CONTEXT", defaultOp: "<", defaultValue: 1.0, unit: "×ATR" },
  // ── MOMENTUM / FLOW ──
  { blockId: "l4_rsi_zone", group: "MOMENTUM", label: "RSI interval", description: "RSI within the configured interval", metric: "rsi", port: "CONTEXT", defaultOp: "between", defaultValue: 45, value2: 65, unit: "0-100" },
  { blockId: "l4_flow_rhythm", group: "MOMENTUM", label: "Candle-direction consistency", description: "Agreement in recent candle-body direction", metric: "flowConsistency", port: "CONTEXT", defaultOp: ">", defaultValue: 0.6, unit: "0-1" },
  { blockId: "l4_candle_signal", group: "MOMENTUM", label: "L1 candle pattern present", description: "Nonzero engulfing, hammer or pin-bar observation", metric: "candleDir", port: "CONTEXT", defaultOp: "outside", defaultValue: -0.5, value2: 0.5, unit: "-1/0/1" },
  { blockId: "l4_candle_align", group: "MOMENTUM", label: "Candle versus vote direction", description: "Rejection-pattern direction agrees with the candidate", metric: "candleAlign", port: "CONTEXT", defaultOp: "==", defaultValue: 1, unit: "-1/0/1" },
  { blockId: "l4_wick_reject", group: "MOMENTUM", label: "Wick rejection", description: "Wick geometry at the selected bar", metric: "wickRatio", port: "CONTEXT", defaultOp: ">", defaultValue: 0.5, unit: "0-1" },
  { blockId: "l4_body_decisive", group: "MOMENTUM", label: "Body dominance", description: "Body size relative to total range", metric: "bodyRatio", port: "CONTEXT", defaultOp: ">", defaultValue: 0.5, unit: "0-1" },
  // ── EVIDENCE / ACCOUNT-STATE ──
  { blockId: "l4_evidence_gate", group: "EVIDENCE_GATE", label: "Evidence Gate (L1/L2/L3)", description: "Reference an existing evidence definition", metric: "", port: "EVIDENCE", defaultOp: ">", defaultValue: 0, isEvidenceSlot: true, note: "Select an L1, L2 or L3 evidence ID" },
  { blockId: "l4_vote_consensus", group: "EVIDENCE_GATE", label: "Vote agreement", description: "Minimum aligned votes during strategy evaluation", metric: "voteCount", port: "CONTEXT", defaultOp: ">=", defaultValue: 2, unit: "" },
  { blockId: "l4_no_dd_stress", group: "EVIDENCE_GATE", label: "Drawdown constraint", description: "Modeled drawdown remains within the limit", metric: "ddPct", port: "CONTEXT", defaultOp: ">", defaultValue: -5, unit: "%" },
  { blockId: "l4_loss_cap", group: "EVIDENCE_GATE", label: "Daily-loss constraint", description: "Completed daily losses remain below the limit", metric: "dayLosses", port: "CONTEXT", defaultOp: "<", defaultValue: 3, unit: "" },
  { blockId: "l4_day_pnl_ok", group: "EVIDENCE_GATE", label: "Daily-result constraint", description: "Modeled daily result remains within its configured bounds", metric: "dayPnlR", port: "CONTEXT", defaultOp: ">", defaultValue: -2, unit: "R" },
];

export const L4_BLOCK_BY_ID: Record<string, L4BlockSpec> = Object.fromEntries(L4_BLOCKS.map((b) => [b.blockId, b]));
// reverse: metric → block (để hiện tên block cho một condition nhập-tay). Evidence-slot bỏ (metric="").
export const L4_BLOCK_BY_METRIC: Record<string, L4BlockSpec> = Object.fromEntries(L4_BLOCKS.filter((b) => b.metric).map((b) => [b.metric, b]));
