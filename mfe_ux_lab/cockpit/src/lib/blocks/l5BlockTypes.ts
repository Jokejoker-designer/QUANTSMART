// l5BlockTypes — the L5 (Strategy Logic) primitive contract. L5 is the "brain": it READS L2 context/indicators +
// L3 algorithm scores + L4 market-context, and DECIDES a DECISION-STATE (watch / setup / ready / veto / exit-hint /
// stage). Unlike L2 (context-only), L5 MAY express an entry/exit DECISION — but only as an ADVISORY decision-state
// that flows down to L6 Zones. HARD doctrine (the absence of ports IS the enforcement):
//   • L5 emits DECISION-STATE only — NEVER order_send / lot / exact SL-TP / BUY-SELL market call. No such port exists.
//   • Output is ZONE-ONLY downstream (L6 turns a decision-state into a zone) · human decides · not live-ready.
//   • Self-calibrating logic defaults SHADOW_ONLY until OOS/WFO/era-stability pass.
//   • Every block is closed-bar / no-lookahead. Exit blocks emit a HINT, never an order.
import type { FeatureUsageRole } from "./featureRoles.ts";

// ── port types: inputs L5 consumes + the decision-states it emits. NOTE the deliberate absence of
//    ORDER / ORDER_SEND / LOT / ENTRY_PRICE / EXACT_SL / EXACT_TP / BUY / SELL — that absence IS the enforcement. ──
export type L5PortType =
  | "INDICATOR" | "CONTEXT" | "BIAS_CONTEXT" | "STRENGTH" | "CONFIDENCE" | "SCORE" | "ENUM"   // reads (L2/L3/L4)
  | "SETUP" | "TRIGGER" | "READY" | "VETO" | "STAGE" | "EXIT_HINT" | "DECISION"               // L5 decision-states (advisory)
  | "OUT";
export const L5_PORTS: L5PortType[] = ["INDICATOR", "CONTEXT", "BIAS_CONTEXT", "STRENGTH", "CONFIDENCE", "SCORE", "ENUM", "SETUP", "TRIGGER", "READY", "VETO", "STAGE", "EXIT_HINT", "DECISION", "OUT"];

export type L5Group =
  | "ENTRY_PATTERN" | "CONFIRMATION" | "VETO_STANDASIDE" | "COMBINE_ARBITRATE"
  | "STATE_MACHINE" | "EXIT_LOGIC" | "RISK_CONTEXT" | "SAFETY_OUTPUT";
export const L5_GROUPS: L5Group[] = ["ENTRY_PATTERN", "CONFIRMATION", "VETO_STANDASIDE", "COMBINE_ARBITRATE", "STATE_MACHINE", "EXIT_LOGIC", "RISK_CONTEXT", "SAFETY_OUTPUT"];

export type L5VizType = "setup_badge" | "checklist" | "veto_flag" | "stage_flow" | "exit_hint" | "gauge" | "marker" | "wire";

export interface L5Port { name: string; type: L5PortType; required: boolean; accepts?: L5PortType[] }
export interface L5OutPort { name: string; type: L5PortType; range?: "[0,1]" | "[-1,1]" | "enum" }
export interface L5Param { name: string; type: "number" | "integer" | "boolean" | "enum"; defaultValue: number; min?: number; max?: number; step?: number; label?: string }
export interface L5Safety { closedBarOnly: true; noLookahead: true; kidiSafe?: boolean; causalOwnTradesOnly?: boolean }
// authority is HARD-locked for EVERY L5 block: it may emit a decision-STATE, but never a live order / lot / exact price.
export interface L5Authority { layer: "L5"; advisoryOnly: true; emitsDecisionState: true; zoneOnlyOutput: true; noOrderSend: true; noAutoLot: true; noExactSlTp: true; humanDecides: true; notLiveReady: true }

export interface L5BlockSpec {
  blockId: string; group: L5Group; label: string; description: string;
  inputs: L5Port[]; outputs: L5OutPort[]; parameters: L5Param[];
  safety: L5Safety; authority: L5Authority; viz: L5VizType;
  usageRoles?: FeatureUsageRole[];
  selfCalibrating?: boolean;   // → default SHADOW_ONLY until OOS/WFO/era-stability pass
  note?: string;
}

// ── wiring: the numeric-context family (INDICATOR/STRENGTH/CONFIDENCE/SCORE/BIAS_CONTEXT) is interchangeable; the
//    decision-state family (SETUP/TRIGGER/READY/DECISION) interchangeable; VETO/STAGE/EXIT_HINT explicit. There is
//    NO order/lot/price port, so DECISION→ORDER / SETUP→LOT / EXIT_HINT→ORDER_SEND are structurally impossible. ──
const NUMERIC: L5PortType[] = ["INDICATOR", "STRENGTH", "CONFIDENCE", "SCORE", "BIAS_CONTEXT"];
const DECISION_FAM: L5PortType[] = ["SETUP", "TRIGGER", "READY", "DECISION"];
export function portAccepts(p: L5Port): Set<L5PortType> {
  const base = p.accepts ?? [p.type];
  const s = new Set<L5PortType>(base);
  if (base.some((t) => NUMERIC.includes(t))) for (const t of NUMERIC) s.add(t);
  if (base.some((t) => DECISION_FAM.includes(t))) for (const t of DECISION_FAM) s.add(t);
  return s;
}
export function canConnect(from: L5PortType, to: L5Port): boolean {
  if (from === "OUT") return false;   // terminal
  return portAccepts(to).has(from);
}

// ── terse factory; fills the HARD-locked authority + closed-bar/no-lookahead safety for every block ──
type Terse = {
  id: string; group: L5Group; label: string; desc: string;
  in?: Array<L5PortType | L5Port>; out: L5PortType | L5OutPort;
  params?: L5Param[]; viz: L5VizType; usageRoles?: FeatureUsageRole[];
  selfCalibrating?: boolean; kidi?: boolean; causalOwn?: boolean; note?: string;
};
const PNAME = ["a", "b", "c", "d"];
function toPort(p: L5PortType | L5Port, idx: number): L5Port {
  if (typeof p === "object") return { ...p, required: p.required ?? true };
  return { name: PNAME[idx] ?? "in" + idx, type: p, required: true };
}
export function mk(o: Terse): L5BlockSpec {
  const out: L5OutPort = typeof o.out === "string" ? { name: "out", type: o.out } : o.out;
  return {
    blockId: o.id, group: o.group, label: o.label, description: o.desc,
    inputs: (o.in ?? []).map(toPort), outputs: [out], parameters: o.params ?? [],
    safety: { closedBarOnly: true, noLookahead: true, kidiSafe: o.kidi, causalOwnTradesOnly: o.causalOwn },
    authority: { layer: "L5", advisoryOnly: true, emitsDecisionState: true, zoneOnlyOutput: true, noOrderSend: true, noAutoLot: true, noExactSlTp: true, humanDecides: true, notLiveReady: true },
    viz: o.viz, usageRoles: o.usageRoles, selfCalibrating: o.selfCalibrating, note: o.note,
  };
}
export const np = (name: string, label: string, def: number, min: number, max: number, step = 1): L5Param => ({ name, label, type: Number.isInteger(def) && step >= 1 ? "integer" : "number", defaultValue: def, min, max, step });
