// l6BlockLibrary — L6 Zone-Block Kit: catalog CURATED. anchor-block = 6 (đúng 6 ZoneAnchor l6Eval hỗ trợ, KHÔNG anchor
// mới) · role-block = 4 (đúng 4 ZoneRole) · recipe-block = 5 preset (anchor+role+offset+width sẵn). Tổng 15. KHÔNG phồng.
// Compile XUỐNG CustomL6Zone cũ (l6Compile) → byte-identical với zone nhập-tay.
import type { L6AnchorBlock, L6RoleBlock, L6RecipeBlock, L6BlockSpec } from "./l6BlockTypes.ts";

export const L6_ANCHOR_BLOCKS: L6AnchorBlock[] = [
  { blockId: "l6a_swing_high", kind: "anchor", group: "ANCHOR", label: "Swing High", description: "Prior 20-bar swing high reference", anchor: "swing_high", needsRef: false, port: "ANCHOR" },
  { blockId: "l6a_swing_low", kind: "anchor", group: "ANCHOR", label: "Swing Low", description: "Prior 20-bar swing low reference", anchor: "swing_low", needsRef: false, port: "ANCHOR" },
  { blockId: "l6a_poc", kind: "anchor", group: "ANCHOR", label: "Price-occupancy POC", description: "Highest concentration in the configured price histogram", anchor: "poc", needsRef: false, port: "ANCHOR" },
  { blockId: "l6a_evidence", kind: "anchor", group: "ANCHOR", label: "Evidence Level", description: "Anchor to an existing L1, L2 or L3 evidence ID", anchor: "evidence", needsRef: true, port: "ANCHOR" },
  { blockId: "l6a_l5_state", kind: "anchor", group: "ANCHOR", label: "L5 state", description: "Anchor to an existing L5 decision definition", anchor: "l5_state", needsRef: true, port: "ANCHOR" },
  { blockId: "l6a_price", kind: "anchor", group: "ANCHOR", label: "Close price", description: "Anchor to the evaluated bar close", anchor: "price", needsRef: false, port: "ANCHOR" },
];

export const L6_ROLE_BLOCKS: L6RoleBlock[] = [
  { blockId: "l6r_observe", kind: "role", group: "ROLE", label: "Observation", description: "Reference band for observing price reactions", role: "OBSERVE", port: "ROLE" },
  { blockId: "l6r_risk", kind: "role", group: "ROLE", label: "Risk", description: "Reference risk band", role: "RISK", port: "ROLE" },
  { blockId: "l6r_demand", kind: "role", group: "ROLE", label: "Demand", description: "Demand reference band", role: "DEMAND", port: "ROLE" },
  { blockId: "l6r_invalidate", kind: "role", group: "ROLE", label: "Invalidation", description: "Reference band invalidating the modeled thesis", role: "INVALIDATE", port: "ROLE" },
];

// recipe-block = preset ghép sẵn anchor+role+offset+width (một bấm ra zone hoàn chỉnh). Vẫn compile xuống CustomL6Zone.
export const L6_RECIPE_BLOCKS: L6RecipeBlock[] = [
  { blockId: "l6z_demand", kind: "recipe", group: "RECIPE", label: "Demand Zone", description: "Demand around swing low", anchor: "swing_low", role: "DEMAND", offsetAtr: 0, widthAtr: 0.5, port: "ZONE" },
  { blockId: "l6z_supply", kind: "recipe", group: "RECIPE", label: "Supply Zone", description: "Supply/resistance around swing high", anchor: "swing_high", role: "RISK", offsetAtr: 0, widthAtr: 0.5, port: "ZONE" },
  { blockId: "l6z_risk", kind: "recipe", group: "RECIPE", label: "Risk Zone", description: "Risk above swing high", anchor: "swing_high", role: "RISK", offsetAtr: 0.3, widthAtr: 0.4, port: "ZONE" },
  { blockId: "l6z_invalidation", kind: "recipe", group: "RECIPE", label: "Invalidation", description: "Invalidation below swing low", anchor: "swing_low", role: "INVALIDATE", offsetAtr: -0.5, widthAtr: 0.3, port: "ZONE" },
  { blockId: "l6z_poc_magnet", kind: "recipe", group: "RECIPE", label: "POC Magnet", description: "Observation around the POC", anchor: "poc", role: "OBSERVE", offsetAtr: 0, widthAtr: 0.5, port: "ZONE" },
];

export const L6_BLOCKS: L6BlockSpec[] = [...L6_ANCHOR_BLOCKS, ...L6_ROLE_BLOCKS, ...L6_RECIPE_BLOCKS];
export const L6_ANCHOR_BY_ID: Record<string, L6AnchorBlock> = Object.fromEntries(L6_ANCHOR_BLOCKS.map((b) => [b.blockId, b]));
export const L6_ROLE_BY_ID: Record<string, L6RoleBlock> = Object.fromEntries(L6_ROLE_BLOCKS.map((b) => [b.blockId, b]));
export const L6_RECIPE_BY_ID: Record<string, L6RecipeBlock> = Object.fromEntries(L6_RECIPE_BLOCKS.map((b) => [b.blockId, b]));
export const L6_ANCHOR_BY_KEY: Record<string, L6AnchorBlock> = Object.fromEntries(L6_ANCHOR_BLOCKS.map((b) => [b.anchor, b]));
export const L6_ROLE_BY_KEY: Record<string, L6RoleBlock> = Object.fromEntries(L6_ROLE_BLOCKS.map((b) => [b.role, b]));
