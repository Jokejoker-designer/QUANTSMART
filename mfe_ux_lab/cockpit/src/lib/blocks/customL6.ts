// customL6 — persistence cho L6 ZONE do user dựng. Một zone = ANCHOR (swing/POC/evidence/L5-state) + ROLE
// (quan-sát/rủi-ro/cầu/huỷ) + OFFSET/WIDTH theo ATR → một DẢI GIÁ để vẽ. L6 = zone-only · advisory · KHÔNG vào lệnh
// (vắng mọi field order = enforcement). Distinct với customL1/L2/L3 (đo) và customModule L4/L5 (rule).
export type ZoneRole = "OBSERVE" | "RISK" | "DEMAND" | "INVALIDATE";
export const ZONE_ROLES: ZoneRole[] = ["OBSERVE", "RISK", "DEMAND", "INVALIDATE"];
export const ZONE_ROLE_LABEL: Record<ZoneRole, string> = { OBSERVE: "Observation", RISK: "Risk", DEMAND: "Demand", INVALIDATE: "Invalidation" };
export type ZoneAnchor = "swing_high" | "swing_low" | "poc" | "evidence" | "l5_state" | "price";
export const ZONE_ANCHORS: ZoneAnchor[] = ["swing_high", "swing_low", "poc", "evidence", "l5_state", "price"];

export interface CustomL6Zone {
  id: string; name: string; explain: string;
  anchor: ZoneAnchor;
  anchorRef?: string;      // id evidence L1/L2/L3 hoặc id module L5-state khi anchor = evidence/l5_state
  role: ZoneRole;
  offsetAtr: number;       // dịch tâm vùng theo ATR (± )
  widthAtr: number;        // bề rộng nửa-dải theo ATR (>0)
  status: "SHADOW";
  createdAt: string;
}

export interface L6Validation { ok: boolean; errors: string[]; warnings: string[] }
export function validateL6Zone(d: Partial<CustomL6Zone>): L6Validation {
  const errors: string[] = [], warnings: string[] = [];
  if (!d.name || d.name.trim().length < 2) errors.push("Zone name must contain at least 2 characters");
  if (!d.explain || d.explain.trim().length < 8) errors.push("Explain the zone in at least 8 characters");
  if (!d.anchor || !ZONE_ANCHORS.includes(d.anchor)) errors.push("Unknown anchor; supported values: " + ZONE_ANCHORS.join("/"));
  if (!d.role || !ZONE_ROLES.includes(d.role)) errors.push("Unknown role; supported values: " + ZONE_ROLES.join("/"));
  if ((d.anchor === "evidence" || d.anchor === "l5_state") && !d.anchorRef) errors.push("Evidence/l5_state anchors require anchorRef with an existing module ID");
  if (typeof d.widthAtr !== "number" || !(d.widthAtr > 0)) errors.push("widthAtr must be a number greater than zero");
  if (typeof d.offsetAtr !== "number" || isNaN(d.offsetAtr)) errors.push("offsetAtr must be numeric");
  // KHÔNG cho field order/lot/SL-TP lọt vào (vắng field = enforcement)
  for (const k of ["order_send", "lot", "risk_pct", "sl", "tp", "direction"]) if (k in (d as Record<string, unknown>)) warnings.push(`Discarded field '${k}': L6 draws zones and does not place orders`);
  return { ok: errors.length === 0, errors, warnings };
}

const KEY = "mfe_custom_l6";
let _mem: CustomL6Zone[] | null = null;
export function loadCustomL6(): CustomL6Zone[] {
  if (_mem) return _mem;
  try { const raw = localStorage.getItem(KEY); _mem = raw ? (JSON.parse(raw) as CustomL6Zone[]) : []; } catch { _mem = []; }
  return _mem!;
}
export function saveCustomL6(list: CustomL6Zone[]): void { _mem = list; try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* mem-only */ } }
export function deleteCustomL6(id: string): CustomL6Zone[] { const list = loadCustomL6().filter((z) => z.id !== id); saveCustomL6(list); return list; }

// Refresh after an explicit portable-definition import.
export function reloadCustomL6() { _mem = null; return loadCustomL6(); }
