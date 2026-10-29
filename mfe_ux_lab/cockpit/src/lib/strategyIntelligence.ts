// Evidence-backed explanation model for Strategy Lab. Pure derivation only:
// no engine calls, no promotion authority and no invented edge claims.
import type { RunStatus, RunWindow } from "./cardRunStore.ts";
import type { SavedBeast } from "./cardBeastV2/beastStore.ts";
import { censusOf } from "./cardBeastV2/moduleRoleCensus.ts";

export interface IntelligenceCard {
  id: string; name: string; modules: string[]; archetype?: string; algo?: string; gate?: string;
  score?: number; layers?: number; design_tf?: string;
  artifact?: { artifact_id?: string; parent_ids?: string[] };
}
export type IntelligenceLane = "SETUP" | "GUARD" | "CONFIRM" | "EXIT" | "CONTEXT" | "INFRA" | "UNKNOWN";
export interface CustomModuleExplanation { id: string; name: string; lane: IntelligenceLane; explanation: string; status?: string }
export interface IntelligenceModule {
  id: string; name: string; lane: IntelligenceLane; mechanism: string; explanation: string;
  source: "ENGINE_CENSUS" | "CUSTOM_REGISTRY" | "UNMAPPED"; status?: string;
}
export interface BeastLink { id: string; name: string; relation: "MEMBER" | "EXPORTED_FROM"; roles: string[]; evidenceStatus?: string }
export interface StrategyIntelligence {
  card: IntelligenceCard;
  structuralState: "TRACEABLE" | "PARTIAL_UNMAPPED" | "BLOCKED_NO_SETUP" | "BLOCKED_EMPTY";
  structuralReason: string;
  lanes: Record<IntelligenceLane, IntelligenceModule[]>;
  unknownIds: string[];
  run: RunStatus;
  windows: RunWindow[];
  beastLinks: BeastLink[];
}

const EMPTY_LANES = (): Record<IntelligenceLane, IntelligenceModule[]> => ({ SETUP: [], GUARD: [], CONFIRM: [], EXIT: [], CONTEXT: [], INFRA: [], UNKNOWN: [] });

const BUILTIN_INFRA_GUARD_CONTEXT: Record<string, { lane: IntelligenceLane; mechanism: string; explanation: string }> = {
  data_quality: { lane: "GUARD", mechanism: "SAFETY_GATE", explanation: "L0 data integrity & post-gap guard before signal evaluation." },
  kidi_guard: { lane: "GUARD", mechanism: "SAFETY_GATE", explanation: "L0 KIDI numeric anomaly and microstructure sanity check." },
  no_lookahead: { lane: "GUARD", mechanism: "SAFETY_GATE", explanation: "L0 strict causal bar indexing; blocks future bar leakage." },
  synthetic_vol_guard: { lane: "GUARD", mechanism: "SAFETY_GATE", explanation: "L0 synthetic volatility spike & thin-liquidity guard." },
  authority_guard: { lane: "GUARD", mechanism: "SAFETY_GATE", explanation: "L0 advisory-only governance lock (ORDER_SEND forbidden)." },
  observation_zone: { lane: "CONTEXT", mechanism: "ZONE_PROJECTION", explanation: "L6 structural ATR observation band projected on chart." },
  risk_zone: { lane: "CONTEXT", mechanism: "ZONE_PROJECTION", explanation: "L6 risk & stop-cluster band projected on chart." },
  invalidation_zone: { lane: "CONTEXT", mechanism: "ZONE_PROJECTION", explanation: "L6 structural invalidation boundary projected on chart." },
  confirmation_zone: { lane: "CONTEXT", mechanism: "ZONE_PROJECTION", explanation: "L6 confirmation reaction band projected on chart." },
  avoid_zone: { lane: "CONTEXT", mechanism: "ZONE_PROJECTION", explanation: "L6 hostile / avoid zone projected on chart." },
  reentry_zone: { lane: "CONTEXT", mechanism: "ZONE_PROJECTION", explanation: "L6 pullback re-entry band projected on chart." },
};

function laneFromCensus(role: string, mechanism: string): IntelligenceLane {
  if (role === "ATTACKER" || role === "FALLBACK" || mechanism === "TRIGGER_VOTE" || mechanism === "FALLBACK_VOTE") return "SETUP";
  if (role === "GUARD") return "GUARD";
  if (role === "CONFIRMATION") return "CONFIRM";
  if (role === "EXIT_SENTINEL") return "EXIT";
  if (role === "SCOUT" || mechanism === "CONTEXT_STATE") return "CONTEXT";
  if (role === "NONE") return "INFRA";
  return "UNKNOWN";
}

function relationToBeast(card: IntelligenceCard, beast: SavedBeast): BeastLink | null {
  const memberships = (beast.members || []).filter((m) => m.card_id === card.id);
  if (memberships.length) return { id: beast.id, name: beast.name, relation: "MEMBER", roles: [...new Set(memberships.map((m) => m.role))], evidenceStatus: beast.evidence?.identity?.status };
  const beastArtifactId = beast.artifact?.artifact_id;
  if (beastArtifactId && (card.artifact?.parent_ids || []).includes(beastArtifactId)) return { id: beast.id, name: beast.name, relation: "EXPORTED_FROM", roles: [], evidenceStatus: beast.evidence?.identity?.status };
  return null;
}

export function buildStrategyIntelligence(args: { card: IntelligenceCard; customModules?: CustomModuleExplanation[]; beasts?: SavedBeast[]; run: RunStatus }): StrategyIntelligence {
  const customById = new Map((args.customModules || []).map((m) => [m.id, m]));
  const lanes = EMPTY_LANES(); const unknownIds: string[] = [];
  for (const id of args.card.modules || []) {
    const known = censusOf(id);
    if (known) {
      const lane = laneFromCensus(known.role, known.mechanism);
      lanes[lane].push({ id, name: id.replace(/_/g, " "), lane, mechanism: known.mechanism, explanation: known.note, source: "ENGINE_CENSUS" });
      continue;
    }
    const builtin = BUILTIN_INFRA_GUARD_CONTEXT[id];
    if (builtin) {
      lanes[builtin.lane].push({ id, name: id.replace(/_/g, " "), lane: builtin.lane, mechanism: builtin.mechanism, explanation: builtin.explanation, source: "ENGINE_CENSUS" });
      continue;
    }
    const custom = customById.get(id);
    if (custom) {
      lanes[custom.lane].push({ id, name: custom.name, lane: custom.lane, mechanism: custom.lane, explanation: custom.explanation, source: "CUSTOM_REGISTRY", status: custom.status });
      continue;
    }
    unknownIds.push(id);
    lanes.UNKNOWN.push({ id, name: id, lane: "UNKNOWN", mechanism: "UNMAPPED", explanation: "Module not found in the engine census or custom registries.", source: "UNMAPPED" });
  }
  let structuralState: StrategyIntelligence["structuralState"] = "TRACEABLE";
  let structuralReason = "Candidate setup trigger present and all modules map to explicit engine mechanisms.";
  if (!args.card.modules?.length) { structuralState = "BLOCKED_EMPTY"; structuralReason = "Card contains no modules to evaluate."; }
  else if (!lanes.SETUP.length) { structuralState = "BLOCKED_NO_SETUP"; structuralReason = "No ATTACKER/TRIGGER module found; guards, confirmations, or scoring formulas cannot generate entry candidates alone."; }
  else if (unknownIds.length) { structuralState = "PARTIAL_UNMAPPED"; structuralReason = `${unknownIds.length} module(s) have unmapped mechanisms and cannot yet be marked fully traceable.`; }
  const order = ["Y10", "M6", "M1"] as const;
  const windows = order.map((stage) => args.run.record?.windows[stage]).filter((w): w is RunWindow => !!w);
  const beastLinks = (args.beasts || []).map((b) => relationToBeast(args.card, b)).filter((b): b is BeastLink => !!b);
  return { card: args.card, structuralState, structuralReason, lanes, unknownIds, run: args.run, windows, beastLinks };
}
