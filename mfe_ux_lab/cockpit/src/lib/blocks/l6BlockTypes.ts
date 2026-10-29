// l6BlockTypes — L6 Zone-Block contract. Block chỉ GÓI + đặt tên cái đã có: anchor-block = 1 ZoneAnchor (trong 6 anchor
// l6Eval hỗ trợ) · role-block = 1 ZoneRole (4) · recipe-block = preset anchor+role+offset+width. KHÔNG anchor/logic mới
// (fib/round-number/session-hi-lo = anchorLevel MỚI → out-of-scope, WO riêng). Port-typed cho Pha C: ANCHOR/ROLE chỉ
// ghép thành ZONE. Compile XUỐNG CustomL6Zone cũ (l6Compile) → byte-identical. Zone-only · advisory · no order.
import type { ZoneAnchor, ZoneRole } from "./customL6.ts";
import { ACCENT } from "./palette.ts";

export type L6PortType = "ANCHOR" | "ROLE" | "ZONE";
export const L6_PORTS: L6PortType[] = ["ANCHOR", "ROLE", "ZONE"];

export type L6Group = "ANCHOR" | "ROLE" | "RECIPE";
export const L6_GROUPS: L6Group[] = ["ANCHOR", "ROLE", "RECIPE"];
export const L6_GROUP_LABEL: Record<L6Group, string> = { ANCHOR: "Anchor (neo)", ROLE: "Vai trò", RECIPE: "Recipe zone (preset)" };
export const L6_GROUP_COLOR: Record<L6Group, string> = { ANCHOR: ACCENT.cyan, ROLE: ACCENT.purple, RECIPE: ACCENT.teal };

export interface L6AnchorBlock { blockId: string; kind: "anchor"; group: "ANCHOR"; label: string; description: string; anchor: ZoneAnchor; needsRef: boolean; port: "ANCHOR" }
export interface L6RoleBlock { blockId: string; kind: "role"; group: "ROLE"; label: string; description: string; role: ZoneRole; port: "ROLE" }
export interface L6RecipeBlock { blockId: string; kind: "recipe"; group: "RECIPE"; label: string; description: string; anchor: ZoneAnchor; role: ZoneRole; offsetAtr: number; widthAtr: number; port: "ZONE" }
export type L6BlockSpec = L6AnchorBlock | L6RoleBlock | L6RecipeBlock;

export const l6Authority = { layer: "L6" as const, advisoryOnly: true as const, zoneOnly: true as const, noOrderSend: true as const, noEntry: true as const };
