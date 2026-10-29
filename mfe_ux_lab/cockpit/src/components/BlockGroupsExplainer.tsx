// BlockGroupsExplainer — "hiểu dòng chảy" của 9 nhóm block L1, từ NGUỒN (OHLC thô) tới AN TOÀN·XUẤT.
// Giải thích toàn bộ pipeline một feature đi qua: mỗi nhóm làm gì, tại sao tồn tại, ví dụ block thật.
// Presentation thuần — số block đếm từ blockLibrary thật, không hứa edge, advisory · zone-only.
// Tiếng Việt không gạch nối giữa các âm tiết (quy tắc viết của dự án).
import { useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph, type GlyphName } from "./ui/Glyph.tsx";
import { L1_GROUPS, type L1Group } from "../lib/blocks/blockTypes.ts";
import { BLOCKS } from "../lib/blocks/blockLibrary.ts";

interface GroupDoc { label: string; icon: string; color: string; what: string; why: string; example: string }

// mô tả 9 nhóm theo ĐÚNG thứ tự dòng chảy L1_GROUPS (nguồn → an toàn·xuất)
const DOCS: Record<L1Group, GroupDoc> = {
  SOURCE: {
    label: "Source", icon: "seedling", color: "#7aa2ff",
    what: "Read the bar's open, high, low and close, with volume only when a source supplies it.",
    why: "The source defines which observations are available. Without input data, downstream measurements are unavailable.",
    example: "price_close · price_open · high · low · volume",
  },
  CANDLE_ANATOMY: {
    label: "Candle anatomy", icon: "candle", color: "#5ad1c4",
    what: "Measure one candle's body, wicks, range and ratios. These are fixed geometric definitions.",
    why: "Single-bar geometry has no tunable weight. Its interpretation depends on downstream context and validation.",
    example: "body · upper_wick · body_ratio · close_location (CLV)",
  },
  ROLLING_WINDOW: {
    label: "Rolling window", icon: "window", color: "#9d8bff",
    what: "Aggregate a recent window using extremes, means, dispersion or percentile rank.",
    why: "Rolling measurements place the current observation relative to a defined historical window.",
    example: "rolling_high · rolling_low · sma · stddev · percentile_rank",
  },
  NORMALIZE: {
    label: "Normalization", icon: "ruler", color: "#ffb454",
    what: "Convert raw quantities to normalized measurements such as ATR ratios, z-scores or bounded values.",
    why: "Normalization makes magnitudes more comparable across price levels. Cross-asset applicability still requires validation.",
    example: "atr_normalize · zscore · ratio_0_1",
  },
  SMOOTH_LAG_MOMENTUM: {
    label: "Smoothing, lag and momentum", icon: "wave", color: "#6fb3ff",
    what: "Smooth a series or measure its changes, slope and momentum.",
    why: "Smoothing suppresses short-term variation at the cost of period-dependent lag.",
    example: "ema · slope · rate_of_change · momentum",
  },
  MATH: {
    label: "Math", icon: "calc", color: "#8b98a8",
    what: "Compose arithmetic expressions using sums, differences, products, ratios, extrema and absolute values.",
    why: "Combine measurements into expressions, such as price-to-EMA distance divided by ATR.",
    example: "add · subtract · divide · min · max · abs",
  },
  LOGIC_CONNECTOR: {
    label: "Logic", icon: "link", color: "#f78c6c",
    what: "Evaluate comparisons, boolean logic and explicit conditions.",
    why: "Logic converts measurements into rule states. It does not establish the performance of a strategy using those rules.",
    example: "and · or · not · greater_than · threshold",
  },
  FSM_STATE: {
    label: "State machine", icon: "gear", color: "#c792ea",
    what: "A finite state machine tracks a defined sequence rather than evaluating every bar independently.",
    why: "Stateful logic can represent break, retest and hold sequences. Inspect its transitions and reset behavior.",
    example: "watch_arm_trigger · sequence_gate · state_latch",
  },
  SAFETY_OUTPUT: {
    label: "Safety and outputs", icon: "lock", color: "#21d07a",
    what: "Validate causal access and numeric outputs before exporting a feature.",
    why: "Source and numeric guards reject invalid values under their registered contracts. They are not certification of the entire system.",
    example: "no_lookahead_seal · clamp · safe_output",
  },
};

const countInGroup = (g: L1Group) => BLOCKS.filter((b) => b.group === g).length;

export function BlockGroupsExplainer({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState<L1Group | null>(L1_GROUPS[0]);
  const total = BLOCKS.length;
  return (
    <div style={{ border: "1px solid var(--mfe-border)", borderRadius: 10, background: "var(--mfe-s2)", padding: "14px 16px", margin: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#e7eef6" }}><Glyph name="book" size={14} /> Feature flow through the block groups</span>
        <span style={{ fontSize: 11, color: TK.muted }}>{total} blocks, from observations to validated outputs</span>
        {onClose && <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", color: TK.text2, border: "1px solid var(--mfe-border)", borderRadius: 6, padding: "3px 9px", fontSize: 11, cursor: "pointer" }}>Close</button>}
      </div>
      <div style={{ fontSize: 11.5, color: TK.text2, marginBottom: 10 }}>
        A feature reads source data, transforms it and emits a typed output. Open a group to inspect its role and limitations.
      </div>

      {/* thanh dòng chảy — bấm chọn nhóm */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {L1_GROUPS.map((g, i) => {
          const d = DOCS[g]; const active = open === g;
          return (
            <span key={g} style={{ display: "inline-flex", alignItems: "center" }}>
              <button onClick={() => setOpen(active ? null : g)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, background: active ? d.color + "22" : "var(--mfe-s3)", color: active ? d.color : TK.text2, border: `1px solid ${active ? d.color : "var(--mfe-border)"}`, borderRadius: 8, padding: "5px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                <span><Glyph name={d.icon as GlyphName} size={13} /></span> {i + 1}. {d.label} <span style={{ opacity: 0.7, fontSize: 10 }}>{countInGroup(g)}</span>
              </button>
              {i < L1_GROUPS.length - 1 && <span style={{ color: TK.muted, margin: "0 2px", fontSize: 13 }}>→</span>}
            </span>
          );
        })}
      </div>

      {/* chi tiết nhóm đang mở */}
      {open && (() => {
        const d = DOCS[open];
        return (
          <div style={{ border: "1px solid " + (d.color), background: "var(--mfe-s3)", borderRadius: 4, padding: "11px 14px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: d.color, marginBottom: 6 }}><Glyph name={d.icon as GlyphName} size={14} /> {d.label} <span style={{ fontSize: 11, color: TK.muted, fontWeight: 600 }}>· {countInGroup(open)} block</span></div>
            <div style={{ fontSize: 12.5, color: TK.text, marginBottom: 7, lineHeight: 1.5 }}><b style={{ color: TK.text2 }}>Purpose:</b> {d.what}</div>
            <div style={{ fontSize: 12.5, color: TK.text, marginBottom: 7, lineHeight: 1.5 }}><b style={{ color: TK.text2 }}>Rationale:</b> {d.why}</div>
            <div style={{ fontSize: 11.5, color: TK.text2 }}><b>Example blocks:</b> <span style={{ fontFamily: "var(--mfe-mono)", color: d.color }}>{d.example}</span></div>
          </div>
        );
      })()}
    </div>
  );
}
