// featureTemplates — the 3 starter L1 builds so a user never begins from a blank canvas (manager proposal 7):
//   1 · SINGLE_CANDLE   → wick_rejection_strength   (body/wick/close-location)
//   2 · ROLLING_WINDOW  → range_expansion_score     (N-bar range ÷ ATR → percentile)
//   3 · FSM             → pullback_pressure          (EMA distance → clamped score + a hysteresis STATE ribbon)
// Each is a real, validate-able, evaluable FeatureGraph (template 3's "state" is a hysteresis proxy until the
// full FSM runtime lands). Also: vizLayer buckets a graph's nodes into the 3 bar-graph layers (proposal 6).
import type { FeatureGraph, FeatureNode } from "./featureGraph.ts";
import { BLOCKS_BY_ID } from "./blockLibrary.ts";
import type { VizMode } from "./blockTypes.ts";

const n = (id: string, blockId: string, inputs: (string | null)[], params?: Record<string, number>): FeatureNode => ({ id, blockId, inputs, params });

export type TemplateFamily = "SINGLE_CANDLE" | "ROLLING_WINDOW" | "FSM" | "BUILTIN" | "CUSTOM";
export interface FeatureTemplate { key: string; family: TemplateFamily; title: string; subtitle: string; graph: FeatureGraph; fsmStateNode?: string }

// ── 1 · Single Candle: wick_rejection_strength = lower_wick_ratio × close_location × (1 − body_ratio) ──
const WICK_REJECTION: FeatureGraph = {
  id: "wick_rejection_strength", name: "Wick Rejection Strength",
  description: "Wick rejection score from wick size, close location and body size, bounded to 0–1.",
  nodes: [
    n("lw", "lower_wick_ratio", []),
    n("cl", "clv", []),
    n("br", "body_ratio", []),
    n("one", "const_value", [], { v: 1 }),
    n("inv_body", "sub", ["one", "br"]),       // 1 − body_ratio
    n("m1", "mul", ["lw", "cl"]),              // lower_wick_ratio × close_location
    n("m2", "mul", ["m1", "inv_body"]),        // × (1 − body_ratio)
    n("out", "emit_feature", ["m2"]),
  ],
  output: "out",
};

// ── 2 · Rolling Window: range_expansion_score = percentile( range ÷ ATR , 50 bars ) ──
const RANGE_EXPANSION: FeatureGraph = {
  id: "range_expansion_score", name: "Range Expansion Score",
  description: "Current bar expansion relative to a 50-bar ATR-normalized reference.",
  nodes: [
    n("rng", "range", []),
    n("norm", "div_atr", ["rng"], { p: 14 }),
    n("rank", "percent_rank", ["norm"], { N: 50 }),
    n("out", "emit_feature", ["rank"]),
  ],
  output: "out",
};

// ── 3 · FSM Feature Extractor: pullback_pressure — distance below EMA (÷ATR), clamped → [0,1]; the hysteresis
//        node "state" is the FSM-activation ribbon (IDLE↔IN_PULLBACK) shown under the chart. ──
const PULLBACK_PRESSURE: FeatureGraph = {
  id: "pullback_pressure", name: "Pullback Pressure (FSM)",
  description: "Pullback distance below the EMA in ATR units, with a hysteretic context state.",
  nodes: [
    n("c", "close", []),
    n("e", "ema", ["c"], { p: 20 }),
    n("d", "sub", ["c", "e"]),                 // close − ema
    n("nd", "div_atr", ["d"], { p: 14 }),      // (close − ema) / ATR  (signed)
    n("below", "neg", ["nd"]),                 // dương khi giá DƯỚI ema (đang hồi)
    n("clip", "clamp", ["below"], { lo: 0, hi: 3 }),
    n("score", "scale", ["clip"], { k: 0.3333 }),
    n("cl", "clamp_out", ["score"]),
    n("state", "hysteresis", ["cl"], { on: 0.3, off: 0.1 }),   // FSM activation ribbon (not on output path)
    n("out", "emit_feature", ["cl"]),
  ],
  output: "out",
};

export const FEATURE_TEMPLATES: FeatureTemplate[] = [
  { key: "wick_rejection_strength", family: "SINGLE_CANDLE", title: "Wick Rejection Strength", subtitle: "Single Candle · body/wick/close-location", graph: WICK_REJECTION },
  { key: "range_expansion_score", family: "ROLLING_WINDOW", title: "Range Expansion Score", subtitle: "Rolling Window · range ÷ ATR → percentile", graph: RANGE_EXPANSION },
  { key: "pullback_pressure", family: "FSM", title: "Pullback Pressure", subtitle: "FSM · EMA distance + IN_PULLBACK state", graph: PULLBACK_PRESSURE, fsmStateNode: "state" },
];
export const TEMPLATE_BY_KEY: Record<string, FeatureTemplate> = Object.fromEntries(FEATURE_TEMPLATES.map((t) => [t.key, t]));

// ── the 5 BUILT-IN L1 features (the existing Canvas "Features" lane) rebuilt from primitives, so a user can
//    open one and CUSTOMISE it (clone & tweak) instead of starting blank. RSI is the proof the kit can
//    reconstruct a real indicator from blocks. All causal · output a single measurement. ──
const EMA_SLOPE: FeatureGraph = {
  id: "ema_slope", name: "EMA Slope", description: "EMA20 slope normalized by ATR.",
  nodes: [n("c", "close", []), n("e", "ema", ["c"], { p: 20 }), n("s", "slope", ["e"]), n("norm", "div_atr", ["s"], { p: 14 }), n("out", "emit_feature", ["norm"])],
  output: "out",
};
const ATR_PCT: FeatureGraph = {
  id: "atr_percentile", name: "ATR Percentile", description: "ATR14 percentile within a 100-bar window.",
  nodes: [n("tr", "true_range", []), n("atr", "roll_mean", ["tr"], { N: 14 }), n("rank", "percent_rank", ["atr"], { N: 100 }), n("out", "emit_feature", ["rank"])],
  output: "out",
};
const RANGE_WICK: FeatureGraph = {
  id: "range_wick", name: "Range / Wick", description: "Current range divided by ATR.",
  nodes: [n("rng", "range", []), n("norm", "div_atr", ["rng"], { p: 14 }), n("out", "emit_feature", ["norm"])],
  output: "out",
};
const SWEEP_DEPTH: FeatureGraph = {
  id: "sweep_depth", name: "Sweep Depth", description: "Sweep below the prior 20-bar low in ATR units.",
  nodes: [n("lo", "low", []), n("lg", "lag", ["lo"], { k: 1 }), n("pm", "roll_min", ["lg"], { N: 20 }), n("d", "sub", ["pm", "lo"]), n("nd", "div_atr", ["d"], { p: 14 }), n("cl", "clamp", ["nd"], { lo: 0, hi: 5 }), n("out", "emit_feature", ["cl"])],
  output: "out",
};
const RSI_VALUE: FeatureGraph = {
  id: "rsi_value", name: "RSI Value", description: "RSI14 reconstructed from primitive gain/loss blocks and scaled to 0–1.",
  nodes: [
    n("c", "close", []), n("ch", "delta", ["c"], { k: 1 }),
    n("gain", "clamp", ["ch"], { lo: 0, hi: 1e6 }), n("chn", "neg", ["ch"]), n("loss", "clamp", ["chn"], { lo: 0, hi: 1e6 }),
    n("ag", "roll_mean", ["gain"], { N: 14 }), n("al", "roll_mean", ["loss"], { N: 14 }),
    n("rs", "ratio", ["ag", "al"]), n("onep", "offset", ["rs"], { c: 1 }), n("h100", "const_value", [], { v: 100 }),
    n("frac", "ratio", ["h100", "onep"]), n("rsi", "sub", ["h100", "frac"]), n("rsi01", "scale", ["rsi"], { k: 0.01 }),
    n("out", "emit_feature", ["rsi01"]),
  ],
  output: "out",
};
export const BASE_FEATURES: FeatureTemplate[] = [
  { key: "ema_slope", family: "BUILTIN", title: "EMA Slope", subtitle: "Built-in L1 · close → EMA → slope / ATR", graph: EMA_SLOPE },
  { key: "rsi_value", family: "BUILTIN", title: "RSI Value", subtitle: "Built-in L1 · RSI(14) from blocks", graph: RSI_VALUE },
  { key: "atr_percentile", family: "BUILTIN", title: "ATR Percentile", subtitle: "Built-in L1 · ATR percentile", graph: ATR_PCT },
  { key: "range_wick", family: "BUILTIN", title: "Range / Wick", subtitle: "Built-in L1 · range / ATR", graph: RANGE_WICK },
  { key: "sweep_depth", family: "BUILTIN", title: "Sweep Depth", subtitle: "Built-in L1 · downside sweep depth", graph: SWEEP_DEPTH },
];

// ── proposal 6: bucket a graph's nodes into the 3 bar-graph viz layers (Raw / Normalized / FSM activation) ──
export function vizLayer(g: FeatureGraph): Record<VizMode, FeatureNode[]> {
  const out: Record<VizMode, FeatureNode[]> = { RAW: [], NORMALIZED: [], FSM: [] };
  for (const node of g.nodes) { const b = BLOCKS_BY_ID[node.blockId]; if (b) out[b.vizMode].push(node); }
  return out;
}
