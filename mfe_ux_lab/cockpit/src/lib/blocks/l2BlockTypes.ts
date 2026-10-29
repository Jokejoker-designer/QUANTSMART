// l2BlockTypes — the L2 (Indicator/Context) primitive contract. L2 READS L1 features and interprets them into
// CONTEXT (regime/bias/strength/confidence) for L3-L5. HARD doctrine (manager PASS_WITH_MINOR_CORRECTIONS):
//   • L2 emits CONTEXT only — NEVER BUY/SELL/LONG/SHORT/entry/exit/zone/order (no such port types exist).
//   • "Bias" is "Bias Context" (directional context, NOT an entry signal). Confidence ≠ win probability.
//   • Higher-TF blocks carry an asOf closed-bar contract (no forming HTF candle).
//   • Self-calibrating blocks default SHADOW_ONLY until OOS/WFO/era-stability pass.
//   • Fusion weights must declare a source (USER_WEIGHTED / SELF_CALIBRATING / FIXED).
//   • Raw Ref is LIMITED (close/ATR/source trace/context-normalisation) — L2 must NOT re-measure (use Feature Ref).
import type { FeatureUsageRole } from "./featureRoles.ts";

// ── port types: note the DELIBERATE absence of ORDER/ZONE/ENTRY/BUY/SELL — that absence IS the enforcement ──
export type L2PortType =
  | "FEATURE" | "FEATURE_ARRAY" | "INDICATOR" | "CONTEXT" | "BIAS_CONTEXT"
  | "STRENGTH" | "CONFIDENCE" | "BOOL" | "ENUM" | "HTF_FEATURE" | "TRACE" | "OUT";
export const L2_PORTS: L2PortType[] = ["FEATURE", "FEATURE_ARRAY", "INDICATOR", "CONTEXT", "BIAS_CONTEXT", "STRENGTH", "CONFIDENCE", "BOOL", "ENUM", "HTF_FEATURE", "TRACE", "OUT"];

export type L2Group = "FEATURE_INPUT" | "FUSION" | "REGIME_CLASSIFIER" | "TREND_MOMENTUM" | "NORMALIZE_CALIBRATE" | "RELATIONSHIP" | "MULTI_TF" | "STABILIZE" | "QUALITY" | "SAFETY_OUTPUT";
export const L2_GROUPS: L2Group[] = ["FEATURE_INPUT", "FUSION", "REGIME_CLASSIFIER", "TREND_MOMENTUM", "NORMALIZE_CALIBRATE", "RELATIONSHIP", "MULTI_TF", "STABILIZE", "QUALITY", "SAFETY_OUTPUT"];

export type L2VizType = "regime_ribbon" | "contribution_bars" | "oscillator" | "gauge" | "heatmap" | "marker" | "badge" | "wire";
export type WeightSource = "USER_WEIGHTED" | "SELF_CALIBRATING" | "FIXED";

export interface L2Port { name: string; type: L2PortType; required: boolean; accepts?: L2PortType[] }
export interface L2OutPort { name: string; type: L2PortType; range?: "[0,1]" | "[-1,1]" | "enum" }
export interface L2Param { name: string; type: "number" | "integer" | "boolean" | "enum"; defaultValue: number; min?: number; max?: number; step?: number; label?: string }
export interface L2Safety { closedBarOnly: true; noLookahead: true; kidiSafe?: boolean; nanInfSafe?: boolean; asOfValid?: boolean }
// authority is HARD-locked for every L2 block: advisory context only, never a trade action.
export interface L2Authority { layer: "L2"; advisoryOnly: true; noEntry: true; noExit: true; noZone: true; noOrderSend: true; notLiveReady: true }

export interface L2BlockSpec {
  blockId: string; group: L2Group; label: string; description: string;
  inputs: L2Port[]; outputs: L2OutPort[]; parameters: L2Param[];
  safety: L2Safety; authority: L2Authority; viz: L2VizType;
  usageRoles?: FeatureUsageRole[];   // intended slot(s) — usage role, NOT authority
  selfCalibrating?: boolean;          // → default SHADOW_ONLY until OOS/WFO/era-stability pass
  weightSource?: WeightSource;        // fusion blocks must declare weight provenance
  asOf?: boolean;                     // higher-TF blocks carry the asOf closed-bar contract
  rawRefLimited?: boolean;            // Raw Ref restriction marker
  note?: string;
}

// ── port wiring: numeric-context family interchangeable; everything else exact (or explicit accepts). There is
//    NO order/zone/entry port, so CONTEXT→ORDER / BIAS_CONTEXT→BUY / INDICATOR→ZONE / FEATURE→ENTRY are
//    structurally impossible. OUT is terminal (no feedback). ──
const NUMERIC: L2PortType[] = ["FEATURE", "INDICATOR", "STRENGTH", "CONFIDENCE", "HTF_FEATURE"];
export function portAccepts(p: L2Port): Set<L2PortType> {
  const base = p.accepts ?? [p.type];
  const s = new Set<L2PortType>(base);
  if (base.some((t) => NUMERIC.includes(t))) for (const t of NUMERIC) s.add(t);
  return s;
}
export function canConnect(from: L2PortType, to: L2Port): boolean {
  if (from === "OUT") return false;   // terminal
  return portAccepts(to).has(from);
}

// ── terse factory; fills the HARD-locked authority + closed-bar/no-lookahead safety for every block ──
type Terse = {
  id: string; group: L2Group; label: string; desc: string;
  in?: Array<L2PortType | L2Port>; out: L2PortType | L2OutPort;
  params?: L2Param[]; viz: L2VizType; usageRoles?: FeatureUsageRole[];
  selfCalibrating?: boolean; weightSource?: WeightSource; asOf?: boolean; rawRefLimited?: boolean;
  kidi?: boolean; nanGuard?: boolean; note?: string;
};
const PNAME = ["a", "b", "c", "d"];
function toPort(p: L2PortType | L2Port, idx: number): L2Port {
  if (typeof p === "object") return { ...p, required: p.required ?? true };
  return { name: PNAME[idx] ?? "in" + idx, type: p, required: true };
}
export function mk(o: Terse): L2BlockSpec {
  const out: L2OutPort = typeof o.out === "string" ? { name: "out", type: o.out } : o.out;
  return {
    blockId: o.id, group: o.group, label: o.label, description: o.desc,
    inputs: (o.in ?? []).map(toPort), outputs: [out], parameters: o.params ?? [],
    safety: { closedBarOnly: true, noLookahead: true, kidiSafe: o.kidi, nanInfSafe: o.nanGuard, asOfValid: o.asOf },
    authority: { layer: "L2", advisoryOnly: true, noEntry: true, noExit: true, noZone: true, noOrderSend: true, notLiveReady: true },
    viz: o.viz, usageRoles: o.usageRoles, selfCalibrating: o.selfCalibrating, weightSource: o.weightSource, asOf: o.asOf, rawRefLimited: o.rawRefLimited, note: o.note,
  };
}
export const np = (name: string, label: string, def: number, min: number, max: number, step = 1): L2Param => ({ name, label, type: Number.isInteger(def) && step >= 1 ? "integer" : "number", defaultValue: def, min, max, step });
