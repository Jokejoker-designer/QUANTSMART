// featureGraph — wires L1 blocks into an executable feature. A node = one block instance (params + which
// upstream node feeds each NON-STREAM_OHLC input port, by index). evalGraph runs the whole graph bar-by-bar
// and returns the OUTPUT node's value-series — the L1 feature. validateGraph enforces the port-type rules +
// authority (output must be a FEATURE_OUTPUT emit) BEFORE anything runs. Causality is inherited from blocks.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { BLOCKS_BY_ID } from "./blockLibrary.ts";
import { canConnect, numericArity, type L1PrimitiveBlockSpec } from "./blockTypes.ts";

export interface FeatureNode { id: string; blockId: string; params?: Record<string, number>; inputs: (string | null)[]; x?: number; y?: number }
export interface FeatureGraph { id: string; name: string; description?: string; nodes: FeatureNode[]; output: string }

export interface GraphValidation { ok: boolean; errors: string[]; warnings: string[] }

// type-check + authority-check the wiring before any compute runs.
export function validateGraph(g: FeatureGraph): GraphValidation {
  const errors: string[] = [], warnings: string[] = [];
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  if (!byId.has(g.output)) errors.push(`output node "${g.output}" không tồn tại`);
  for (const n of g.nodes) {
    const block = BLOCKS_BY_ID[n.blockId];
    if (!block) { errors.push(`node ${n.id}: block "${n.blockId}" không có trong palette`); continue; }
    const ports = block.inputs.filter((p) => p.type !== "STREAM_OHLC");   // ctx.inputs aligns to these
    if (n.inputs.length !== ports.length) errors.push(`node ${n.id} (${block.blockId}): cần ${ports.length} input, có ${n.inputs.length}`);
    ports.forEach((port, k) => {
      const upId = n.inputs[k];
      if (!upId) { if (port.required) errors.push(`node ${n.id}: port "${port.name}" bắt buộc nhưng chưa nối`); return; }
      const up = byId.get(upId);
      if (!up) { errors.push(`node ${n.id}: input "${port.name}" nối tới node "${upId}" không tồn tại`); return; }
      const upBlock = BLOCKS_BY_ID[up.blockId];
      if (upBlock && !canConnect(upBlock.outputs[0].type, port)) errors.push(`node ${n.id}: SAI KIỂU — ${upBlock.outputs[0].type} (${upBlock.blockId}) → port "${port.name}" nhận ${[port.type, ...(port.accepts ?? [])].join("/")}`);
    });
  }
  // authority: the feature must terminate in an emitting block.
  const outBlock = BLOCKS_BY_ID[byId.get(g.output)?.blockId ?? ""];
  if (outBlock && !outBlock.authority.canEmitFeature) errors.push(`output node phải là block emit (Emit Feature / Map-Label), đang là ${outBlock.blockId}`);
  // a node with no compute on the evaluable path is a runtime gap (pure FSM control not yet executable).
  for (const n of g.nodes) { const b = BLOCKS_BY_ID[n.blockId]; if (b && !b.compute && b.group === "FSM_STATE") warnings.push(`node ${n.id} (${b.blockId}) là FSM control chưa có runtime — preview sẽ bằng 0`); }
  // cycle check
  try { topoOrder(g); } catch (e) { errors.push((e as Error).message); }
  return { ok: errors.length === 0, errors, warnings };
}

function topoOrder(g: FeatureGraph): FeatureNode[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const order: FeatureNode[] = [], seen = new Set<string>(), inProg = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    if (inProg.has(id)) throw new Error(`graph có CHU TRÌNH tại node "${id}" — L1 phải là DAG (không lặp ngược)`);
    const n = byId.get(id); if (!n) return;
    inProg.add(id);
    for (const up of n.inputs) if (up) visit(up);
    inProg.delete(id); seen.add(id); order.push(n);
  };
  for (const n of g.nodes) visit(n.id);
  return order;
}

// run the graph over `bars`. Each node computes its own full value-series (memoised) so downstream
// window/lag blocks can read upstream history causally. Returns a per-node series resolver.
function buildResolver(g: FeatureGraph, bars: OhlcBar[]): (id: string) => number[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number[]>();
  const computeSeries = (id: string): number[] => {
    const cached = memo.get(id); if (cached) return cached;
    const node = byId.get(id);
    const out = new Array(bars.length).fill(0);
    memo.set(id, out);   // seed before recursion so a cycle yields zeros instead of stack-overflow
    if (!node) return out;
    const block: L1PrimitiveBlockSpec | undefined = BLOCKS_BY_ID[node.blockId];
    const inputSeries = node.inputs.map((up) => (up ? computeSeries(up) : new Array(bars.length).fill(0)));
    if (block?.compute) for (let i = 0; i < bars.length; i++) out[i] = block.compute({ bars, i, params: node.params ?? {}, inputs: inputSeries });
    return out;
  };
  return computeSeries;
}

// the OUTPUT node's value-series (the L1 feature).
export function evalGraph(g: FeatureGraph, bars: OhlcBar[]): number[] { return buildResolver(g, bars)(g.output); }

// every node's value-series — for per-block previews + the 3-layer bar graph.
export function evalGraphAll(g: FeatureGraph, bars: OhlcBar[]): Record<string, number[]> {
  const resolve = buildResolver(g, bars);
  const out: Record<string, number[]> = {};
  for (const n of g.nodes) out[n.id] = resolve(n.id);
  return out;
}

// the latest feature value (last closed bar) + the whole series, for preview panels.
export function evalGraphLatest(g: FeatureGraph, bars: OhlcBar[]): { value: number; series: number[] } {
  const series = evalGraph(g, bars);
  return { value: series.length ? series[series.length - 1] : 0, series };
}

// derive the numeric-input arity a node needs (for the UI to render input ports).
export function nodeArity(blockId: string): number { const b = BLOCKS_BY_ID[blockId]; return b ? numericArity(b) : 0; }
