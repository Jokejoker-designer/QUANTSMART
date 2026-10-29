// blockTypes — the formal L1 primitive-block contract (L1PrimitiveBlockSpec). A block is a SMALL, typed,
// CAUSAL transform that reads upstream value-series (or the closed OHLC stream) and emits ONE number per bar.
// Blocks clip into a feature graph (node-graph or FSM). HARD invariants enforced by this contract:
//   • causal · closedBarOnly · canReadFuture:false  (value at bar i uses only data ≤ i)
//   • authority: L1 may emit a FEATURE (measurement) ONLY — never pattern/zone/signal/order
//   • port-typed wiring (a compiler blocks STREAM_OHLC→AND, BOOL→Normalize, STATE→Ratio, …)
//   • safe-math (division KIDI-guarded); scale-free encouraged for multi-market reuse
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";

// ── port types: what flows on a wire (the type-checker uses these to block nonsense connections) ──
export type L1PortType =
  | "PRICE"          // a price level (subtype of NUMBER)
  | "NUMBER"         // an unbounded scalar measurement
  | "RATIO_0_1"      // a bounded [0,1] measurement
  | "BOOL"           // 0/1 truth
  | "STREAM_OHLC"    // the closed design-tf candle stream (read by source/anatomy blocks)
  | "STREAM_NUMBER"  // a numeric series (e.g. M1 path proxy)
  | "ENUM"           // a small labelled code
  | "STATE"          // an FSM state token
  | "FEATURE_OUTPUT"; // terminal L1 output (a measurement) — cannot feed back into logic

// ── 9 official groups (output+guard merged into SAFETY_OUTPUT; no tactical Guard role at L1) ──
export type L1Group =
  | "SOURCE" | "CANDLE_ANATOMY" | "ROLLING_WINDOW" | "NORMALIZE" | "SMOOTH_LAG_MOMENTUM"
  | "MATH" | "LOGIC_CONNECTOR" | "FSM_STATE" | "SAFETY_OUTPUT";

export const L1_GROUPS: L1Group[] = ["SOURCE", "CANDLE_ANATOMY", "ROLLING_WINDOW", "NORMALIZE", "SMOOTH_LAG_MOMENTUM", "MATH", "LOGIC_CONNECTOR", "FSM_STATE", "SAFETY_OUTPUT"];

// how the block draws its live preview so a user SEES what it does.
export type VizType = "candle" | "chart" | "oscillator" | "gauge" | "histogram" | "curve" | "ribbon" | "fsm" | "wire" | "badge";
// which of the 3 bar-graph viz layers a block belongs to (raw measurement / normalized contribution / fsm activation).
export type VizMode = "RAW" | "NORMALIZED" | "FSM";

export interface L1Port { name: string; type: L1PortType; required: boolean; accepts?: L1PortType[] }
export interface L1OutPort { name: string; type: L1PortType; scaleFree?: boolean; range?: "[0,1]" | "[-1,1]" | "unbounded" }
export interface L1Param { name: string; type: "number" | "integer" | "boolean" | "enum"; defaultValue: number; min?: number; max?: number; step?: number; label?: string }
export interface L1Safety { causal: true; closedBarOnly: true; kidiGuardRequired?: boolean; noLookaheadSealRequired?: boolean; canReadFuture: false }
export interface L1Authority { layer: "L1"; canEmitFeature: boolean; canEmitPattern: false; canEmitZone: false; canEmitSignal: false; canOrderSend: false }

// inputs[k] = the full value-series of the k-th NON-STREAM_OHLC input port (only indices ≤ i are valid to read;
// STREAM_OHLC ports are served implicitly by ctx.bars and DO NOT consume an inputs slot).
export interface BlockEvalCtx { bars: OhlcBar[]; i: number; params: Record<string, number>; inputs: number[][] }
export type BlockCompute = (ctx: BlockEvalCtx) => number;

export interface L1PrimitiveBlockSpec {
  blockId: string;
  group: L1Group;
  label: string;
  description: string;
  inputs: L1Port[];
  outputs: L1OutPort[];
  parameters: L1Param[];
  safety: L1Safety;
  authority: L1Authority;
  // ── runtime/UI extensions (needed to EXECUTE + DRAW; not part of the abstract authority contract) ──
  viz: VizType;
  vizMode: VizMode;
  compute?: BlockCompute;     // present for evaluatable blocks; absent for pure FSM control nodes (graph runtime handles)
  provisional?: boolean;      // e.g. volume / m1_subbar — may be NOT_AVAILABLE; never synthesise as measured evidence
  note?: string;              // caveat surfaced in the UI (availability, APPROX_PATH, …)
}

// ── safe-math helpers (shared) — KIDI-guarded division: |denominator| ≈ 0 → 0 (never NaN/Inf) ──
export const EPS = 1e-9;
export const safeDiv = (a: number, b: number): number => (Math.abs(b) < EPS ? 0 : a / b);
export const clampN = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const at = (s: number[] | undefined, i: number): number => (s && i >= 0 && i < s.length && isFinite(s[i]) ? s[i] : 0);
export const win = (s: number[] | undefined, i: number, n: number): number[] => (s ? s.slice(Math.max(0, i - n + 1), i + 1) : []);
export const P = (ctx: BlockEvalCtx, key: string, def: number): number => { const v = ctx.params?.[key]; return typeof v === "number" && isFinite(v) ? v : def; };

// ── port-type wiring rules: the numeric family is interchangeable; everything else must match (or be an
//    explicit `accepts` set). This blocks STREAM_OHLC→AND, BOOL→Normalize, STATE→Ratio, numeric→AND, etc. ──
const NUMERIC: L1PortType[] = ["PRICE", "NUMBER", "RATIO_0_1", "STREAM_NUMBER"];
export function portAccepts(p: L1Port): Set<L1PortType> {
  const base = p.accepts ?? [p.type];
  const s = new Set<L1PortType>(base);
  if (base.some((t) => NUMERIC.includes(t))) for (const t of NUMERIC) s.add(t);
  return s;
}
export function canConnect(from: L1PortType, to: L1Port): boolean {
  if (from === "FEATURE_OUTPUT") return false;   // terminal — no feedback into logic
  return portAccepts(to).has(from);
}
export const numericArity = (b: L1PrimitiveBlockSpec): number => b.inputs.filter((p) => p.type !== "STREAM_OHLC").length;

// ── terse factory so the ~70 block defs stay readable while producing the full contract ──
type Terse = {
  id: string; group: L1Group; label: string; desc: string;
  in?: Array<L1PortType | L1Port>; out: L1PortType | L1OutPort;
  params?: L1Param[]; viz: VizType; vizMode: VizMode; scaleFree?: boolean; range?: "[0,1]" | "[-1,1]" | "unbounded";
  compute?: BlockCompute; kidi?: boolean; seal?: boolean; emit?: boolean; provisional?: boolean; note?: string;
};
const PNAME = ["a", "b", "c", "d"];
function toPort(p: L1PortType | L1Port, idx: number): L1Port {
  if (typeof p === "object") return { ...p, required: p.required ?? true };
  return { name: p === "STREAM_OHLC" ? "ohlc" : (PNAME[idx] ?? "in" + idx), type: p, required: p !== "STREAM_OHLC" };
}
export function mk(o: Terse): L1PrimitiveBlockSpec {
  const out: L1OutPort = typeof o.out === "string" ? { name: "out", type: o.out, scaleFree: o.scaleFree, range: o.range } : o.out;
  return {
    blockId: o.id, group: o.group, label: o.label, description: o.desc,
    inputs: (o.in ?? []).map(toPort), outputs: [out], parameters: o.params ?? [],
    safety: { causal: true, closedBarOnly: true, canReadFuture: false, kidiGuardRequired: o.kidi, noLookaheadSealRequired: o.seal },
    authority: { layer: "L1", canEmitFeature: !!o.emit, canEmitPattern: false, canEmitZone: false, canEmitSignal: false, canOrderSend: false },
    viz: o.viz, vizMode: o.vizMode, compute: o.compute, provisional: o.provisional, note: o.note,
  };
}
export const np = (name: string, label: string, def: number, min: number, max: number, step = 1): L1Param => ({ name, label, type: Number.isInteger(def) && step >= 1 ? "integer" : "number", defaultValue: def, min, max, step });
