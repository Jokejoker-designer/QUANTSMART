// featureExplain — Plain-English explanations for blocks + whole features. `explainBlock` gives ONE clear
// param-aware sentence for ANY block (used in the Inspector); `explainFeature` aggregates those per-block
// sentences (in topo order, with the wired input labels) + a compact formula — so the module's mechanism is
// just the sum of its blocks' explanations + the tuned params. Pure description; no numbers fabricated.
import { BLOCKS_BY_ID } from "./blockLibrary.ts";
import type { FeatureGraph, FeatureNode } from "./featureGraph.ts";

const pnum = (params: Record<string, number> | undefined, key: string, def: number) => { const v = params?.[key]; return typeof v === "number" ? v : def; };

// One plain-English explanation for a block, given its params + (optional) the labels of what feeds it. Falls back
// to the block's own description so EVERY block always has a clean explanation.
export function explainBlock(blockId: string, params?: Record<string, number>, ins: string[] = ["input", "input B", "input C"]): string {
  const b = BLOCKS_BY_ID[blockId]; if (!b) return blockId;
  const [a = "?", c = "?", d = "?"] = ins;
  const P = (k: string, def: number) => pnum(params, k, def);
  switch (blockId) {
    case "div_atr": return `${a} ÷ ATR(${P("p", 14)}) — volatility normalization for cross-market comparison`;
    case "div_price": return `${a} / price × 10000 — basis points`;
    case "ratio": return `${a} ÷ ${c} (safe division; near-zero denominator produces zero)`;
    case "diff": case "sub": return `${a} − ${c}`;
    case "add": return `${a} + ${c}`;
    case "mul": return `${a} × ${c}`;
    case "ema": return `EMA of ${a} with period ${P("p", 10)} (larger periods are smoother and lag more)`;
    case "sma": return `Mean over ${P("p", 10)} bars of ${a}`;
    case "roll_max": return `Maximum over ${P("N", 20)} recent bars of ${a}`;
    case "roll_min": return `Minimum over ${P("N", 20)} recent bars of ${a}`;
    case "roll_mean": return `Mean over ${P("N", 20)} bars of ${a}`;
    case "roll_median": return `Median over ${P("N", 20)} bars of ${a}`;
    case "roll_std": return `Standard deviation over ${P("N", 20)} bars of ${a} (volatility measure)`;
    case "roll_range": return `Range (maximum − minimum) over ${P("N", 20)} bars of ${a}`;
    case "roll_sum": return `Sum over ${P("N", 20)} bars of ${a}`;
    case "percent_rank": return `Percentile rank of ${a} over ${P("N", 50)} bars, relative to history (0–1)`;
    case "zscore": return `Z-score of ${a} over ${P("N", 50)} bars`;
    case "minmax": return `Scale ${a} to [0,1] over ${P("N", 50)} bars`;
    case "count_above": return `Count bars where ${a} > ${P("t", 0)} over ${P("N", 20)} bars`;
    case "reg_slope": return `Regression slope over ${P("N", 20)} bars of ${a}`;
    case "path_length": return `Sum of absolute changes over ${P("N", 20)} bars of ${a} (path length)`;
    case "lag": return `${a} of ${P("k", 1)} bars ago`;
    case "delta": return `${a} minus its value ${P("k", 1)} bars ago`;
    case "roc": return `Percentage change in ${a} over ${P("k", 1)} bars`;
    case "slope": return `Slope of ${a} relative to the previous bar`;
    case "neg": return `Negate ${a}`;
    case "abs": return `Absolute value |${a}|`;
    case "sign": return `Sign of ${a} (−1/0/1)`;
    case "sqrt": return `Square root √|${a}|`;
    case "pow": return `${a} to the power ${P("e", 2)}`;
    case "clamp": return `Clamp ${a} to [${P("lo", 0)}, ${P("hi", 1)}]`;
    case "clamp_out": return `Clamp ${a} to [0,1]`;
    case "scale": return `${a} × ${P("k", 1)}`;
    case "offset": return `${a} + ${P("c", 0)}`;
    case "min2": return `Minimum of ${a} and ${c}`;
    case "max2": return `Maximum of ${a} and ${c}`;
    case "threshold": return `1 if ${a} > ${P("t", 0)}; otherwise 0`;
    case "between": return `1 if ${P("lo", 0)} ≤ ${a} ≤ ${P("hi", 1)}; otherwise 0`;
    case "gt": return `${a} > ${c} (true/false)`;
    case "lt": return `${a} < ${c} (true/false)`;
    case "and": return `${a} AND ${c} (both true)`;
    case "or": return `${a} OR ${c} (either true)`;
    case "not": return `NOT ${a}`;
    case "xor": return `${a} differs from ${c}`;
    case "if_else": return `If ${a} is true, use ${c}; otherwise use ${d}`;
    case "cross_above": return `1 on the bar where ${a} crosses above ${c}`;
    case "cross_below": return `1 on the bar where ${a} crosses below ${c}`;
    case "hysteresis": return `Turn on when ${a} > ${P("on", 0.7)}; turn off below ${P("off", 0.3)} (hysteresis prevents threshold flicker)`;
    case "since_event": return `Bars since the most recent ${a} event`;
    case "emit_feature": return `Emit ${a} as the final feature value`;
    case "map_label": return `Attach a descriptive label to ${a} (display only)`;
    case "nan_guard": return `Guard invalid values in ${a} (NaN/Inf → 0)`;
    case "kidi_guard": return `KIDI guard for ${a} (near-zero denominator → SINGULAR)`;
    case "nolookahead_seal": return `Apply a no-lookahead seal to ${a}`;
    case "swing_high": return `Pivot high confirmed after ${P("W", 3)} bars without lookahead`;
    case "const_value": return `Constant ${P("v", 1)}`;
    default: return b.inputs.some((p) => p.type === "STREAM_OHLC") ? `Read ${b.label} from the bar` : b.description;
  }
}

function topo(g: FeatureGraph): FeatureNode[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out: FeatureNode[] = [], seen = new Set<string>();
  const visit = (id: string, stack: Set<string>) => {
    if (seen.has(id) || stack.has(id)) return; stack.add(id);
    const n = byId.get(id); if (!n) return;
    for (const up of n.inputs) if (up) visit(up, stack);
    stack.delete(id); seen.add(id); out.push(n);
  };
  for (const n of g.nodes) visit(n.id, new Set());
  return out;
}

// compact formula expression for the output node (recursive, parenthesised).
function exprOf(id: string, byId: Map<string, FeatureNode>, stack = new Set<string>()): string {
  const n = byId.get(id); if (!n || stack.has(id)) return "?";
  const b = BLOCKS_BY_ID[n.blockId]; if (!b) return id;
  stack.add(id);
  const e = n.inputs.map((up) => (up ? exprOf(up, byId, stack) : "?"));
  stack.delete(id);
  const [a = "?", c = "?", d = "?"] = e, P = (k: string, def: number) => pnum(n.params, k, def);
  switch (n.blockId) {
    case "emit_feature": case "nolookahead_seal": case "nan_guard": case "map_label": return a;
    case "div_atr": return `${a}÷ATR`;
    case "ratio": case "div": return `${a}÷${c}`;
    case "mul": return `${a}×${c}`;
    case "sub": case "diff": return `(${a}−${c})`;
    case "add": return `(${a}+${c})`;
    case "clamp_out": return `clamp01(${a})`;
    case "clamp": return `clamp(${a})`;
    case "neg": return `−${a}`;
    case "scale": return `${a}×${P("k", 1)}`;
    case "offset": return `(${a}+${P("c", 0)})`;
    case "percent_rank": return `pct(${a})`;
    case "ema": return `EMA(${a})`;
    case "if_else": return `(${a}?${c}:${d})`;
    case "threshold": return `(${a}>${P("t", 0)})`;
    case "const_value": return `${P("v", 1)}`;
    default: return b.inputs.some((p) => p.type === "STREAM_OHLC") || b.inputs.length === 0 ? b.label : `${b.label}(${e.join(",")})`;
  }
}

export interface FeatureExplanation { steps: { id: string; label: string; text: string }[]; formula: string; outType: string; outRange?: string; blockCount: number }

export function explainFeature(g: FeatureGraph): FeatureExplanation {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const steps = topo(g).map((n) => {
    const ins = n.inputs.map((up) => (up ? (BLOCKS_BY_ID[byId.get(up)?.blockId ?? ""]?.label ?? up) : "?"));
    return { id: n.id, label: BLOCKS_BY_ID[n.blockId]?.label ?? n.blockId, text: explainBlock(n.blockId, n.params, ins) };
  });
  const outBlock = BLOCKS_BY_ID[byId.get(g.output)?.blockId ?? ""];
  return { steps, formula: exprOf(g.output, byId), outType: outBlock?.outputs[0].type ?? "—", outRange: outBlock?.outputs[0].range, blockCount: g.nodes.length };
}
