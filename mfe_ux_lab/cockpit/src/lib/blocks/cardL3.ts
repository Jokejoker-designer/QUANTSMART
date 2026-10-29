// cardL3 — the eligibility gate + binding store for putting a validated L3 score onto a Strategy Card role slot.
// HARD RULE: only a module whose QL-8 validation verdict is EDGE_OOS_QUALIFIED may be bound. CONDITIONAL_EDGE /
// NULL_EDGE / INSUFFICIENT / not-yet-validated are shown but BLOCKED with an honest reason — you cannot put an
// unproven (curve-fit-risk) score on the card as active evidence. Binding is an explicit user action, persisted.
import type { CustomL3Module } from "./customL3.ts";

export interface L3Eligibility { eligible: boolean; verdict: string; reason: string; color: string }

export function l3CardEligibility(m: CustomL3Module): L3Eligibility {
  const v = m.validationReport;
  if (!v) return { eligible: false, verdict: "NOT_RUN", reason: "Chưa chạy validation QL-8 — sang Passport bấm ▶ Chạy validation.", color: "#8b949e" };
  switch (v.overall) {
    case "EDGE_OOS_QUALIFIED": return { eligible: true, verdict: "EDGE · OOS QUALIFIED", reason: "Đủ điều kiện gắn card (vượt null + OOS + walk-forward).", color: "#3fb950" };
    case "CONDITIONAL_EDGE": return { eligible: false, verdict: "CONDITIONAL", reason: "Vượt null nhưng OOS/walk-forward chưa ổn định ở mọi cửa sổ.", color: "#e3b341" };
    case "NULL_EDGE": return { eligible: false, verdict: "NULL_EDGE", reason: "Không phân biệt được với nhiễu (curve-fit risk) — KHÔNG được gắn card.", color: "#f7768e" };
    default: return { eligible: false, verdict: "INSUFFICIENT", reason: "Mẫu hiệu dụng chưa đủ để kết luận.", color: "#8b949e" };
  }
}

const KEY = "mfe_l3_card";
export type L3Binding = Record<string, string | null>;   // role → moduleId
export function loadL3Card(): L3Binding { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
export function saveL3Card(b: L3Binding) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* mem-only */ } }
