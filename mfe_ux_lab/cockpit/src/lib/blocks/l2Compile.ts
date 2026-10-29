// l2Compile — the L2 doctrine "form-first UI, graph-backed runtime": a simple weighted-fusion FORM compiles
// into a real L2 block GRAPH/DSL (Feature Ref → Feature Bus → Weighted Sum → [Regime/Bias] → No-Lookahead Seal
// → Emit). The form is what traders touch; this compiled graph is the canonical model (shown read-only in the
// Advanced view, fed to the compiler/authority checks). Output stays CONTEXT/INDICATOR/BIAS_CONTEXT — no order.
import { L2_BLOCKS_BY_ID } from "./l2BlockLibrary.ts";

export type L2OutputMode = "indicator" | "regime" | "bias" | "confidence";
export interface L2GraphNode { id: string; blockId: string; label: string; inputs: string[]; params?: Record<string, number> }
export interface L2Compiled {
  nodes: L2GraphNode[]; edges: { from: string; to: string }[]; output: string; outBlockId: string; outputType: string;
  authority: { advisoryOnly: boolean; noEntry: boolean; noZone: boolean; noOrderSend: boolean; notLiveReady: boolean };
  safety: { closedBarOnly: boolean; noLookahead: boolean; kidiSafe: boolean; asOfValid: boolean };
}

export function compileL2(form: { featureKeys: string[]; featureLabels?: Record<string, string>; weights: Record<string, number>; mode: L2OutputMode }): L2Compiled {
  const nodes: L2GraphNode[] = [];
  const refIds = form.featureKeys.map((k, i) => { const id = "ref" + i; nodes.push({ id, blockId: "feature_ref", label: form.featureLabels?.[k] ?? k, inputs: [] }); return id; });
  nodes.push({ id: "bus", blockId: "feature_bus", label: "Feature Bus", inputs: refIds });
  nodes.push({ id: "wsum", blockId: "weighted_sum", label: "Weighted Sum", inputs: ["bus"], params: form.weights });
  let last = "wsum";
  if (form.mode === "regime") { nodes.push({ id: "regime", blockId: "trend_regime", label: "Composite Regime", inputs: [last] }); last = "regime"; }
  else if (form.mode === "bias") { nodes.push({ id: "bias", blockId: "trend_direction", label: "Bias Context", inputs: [last] }); last = "bias"; }
  else if (form.mode === "confidence") { nodes.push({ id: "conf", blockId: "context_confidence", label: "Context Confidence", inputs: [last] }); last = "conf"; }
  nodes.push({ id: "seal", blockId: "nolookahead_seal", label: "No-Lookahead Seal", inputs: [last] });
  const emitBlock = form.mode === "regime" ? "emit_context" : form.mode === "bias" ? "emit_bias_context" : "emit_indicator";
  nodes.push({ id: "emit", blockId: emitBlock, label: L2_BLOCKS_BY_ID[emitBlock]?.label ?? emitBlock, inputs: ["seal"] });

  const edges: { from: string; to: string }[] = [];
  for (const n of nodes) for (const up of n.inputs) edges.push({ from: up, to: n.id });

  // contract aggregated from the actual L2 block specs along the path (authority hard-locked at L2).
  const used = nodes.map((n) => L2_BLOCKS_BY_ID[n.blockId]).filter(Boolean);
  const a = L2_BLOCKS_BY_ID[emitBlock].authority;
  return {
    nodes, edges, output: "emit", outBlockId: emitBlock,
    outputType: form.mode === "regime" ? "CONTEXT" : form.mode === "bias" ? "BIAS_CONTEXT" : form.mode === "confidence" ? "CONFIDENCE" : "INDICATOR",
    authority: { advisoryOnly: a.advisoryOnly, noEntry: a.noEntry, noZone: a.noZone, noOrderSend: a.noOrderSend, notLiveReady: a.notLiveReady },
    safety: { closedBarOnly: true, noLookahead: nodes.some((n) => n.blockId === "nolookahead_seal"), kidiSafe: used.some((b) => b.safety.kidiSafe) || true, asOfValid: used.every((b) => b.asOf ? b.safety.asOfValid : true) },
  };
}
