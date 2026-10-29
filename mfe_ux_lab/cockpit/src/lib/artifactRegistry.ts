// artifactRegistry — one browser-side identity/lineage spine for Card, Beast and Passport artifacts.
// This is storage plumbing only: SHADOW_ONLY / NO_DECISION / no execution authority.
import { CBV2_SCHEMA_VERSION, contentHash } from "./cardBeastV2/schemas.ts";
import { strategyDefinitionHash } from "./strategyIdentity.ts";
import { getActiveSymbol } from "./activeSymbolStore.ts";
import { getCardRuntimeConfig } from "./simTimeframe.ts";

export const ARTIFACTS_CHANGED_EVENT = "mfe-artifacts-changed";
export const CARDS_CHANGED_EVENT = "mfe-cards-changed";
export const BEASTS_CHANGED_EVENT = "mfe-beasts-changed";

export type ArtifactKind = "STRATEGY_CARD" | "BEAST" | "COMPATIBILITY_PASSPORT";
export interface ArtifactIdentity {
  artifact_id: string;
  kind: ArtifactKind;
  schema_version: number;
  version: number;
  content_hash: string;
  /** Hash of the executable module set. Lets the registry detect a card/Beast
   *  whose modules were edited while an old artifact identity was retained. */
  module_hash: string;
  runtime_hash?: string;
  created_at: string;
  parent_ids: string[];
  authority: "SHADOW_ONLY";
  decision: "NO_DECISION";
}

export interface StrategyCardArtifactRecord {
  id: string;
  name: string;
  modules: string[];
  design_tf?: string;
  execution_tf?: string;
  symbol?: string;
  artifact?: ArtifactIdentity;
  [key: string]: unknown;
}

export interface StoredPassportArtifact {
  artifact: ArtifactIdentity;
  source_artifact_id: string;
  source_kind: "STRATEGY_CARD" | "BEAST";
  source_content_hash: string;
  passport: unknown;
}

export type ArtifactFreshness = "FRESH" | "STALE_SOURCE" | "MISSING_SOURCE";
export interface ResolvedPassportArtifact {
  stored: StoredPassportArtifact;
  freshness: ArtifactFreshness;
  reason: string;
}

const LS_CARDS = "mfe_strategy_cards";
const LS_PASSPORTS = "mfe_compatibility_passports";

function canStore(): boolean { return typeof localStorage !== "undefined"; }
export function notifyArtifactChange(kind: ArtifactKind) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(ARTIFACTS_CHANGED_EVENT, { detail: { kind } }));
    if (kind === "STRATEGY_CARD") window.dispatchEvent(new CustomEvent(CARDS_CHANGED_EVENT));
    if (kind === "BEAST") window.dispatchEvent(new CustomEvent(BEASTS_CHANGED_EVENT));
  } catch { /* non-browser test/runtime */ }
}

export function makeArtifactIdentity(args: {
  artifactId: string;
  kind: ArtifactKind;
  modules?: string[];
  parentIds?: string[];
  version?: number;
  extra?: unknown;
}): ArtifactIdentity {
  const modules = args.modules || [];
  return {
    artifact_id: args.artifactId,
    kind: args.kind,
    schema_version: CBV2_SCHEMA_VERSION,
    version: args.version ?? 1,
    content_hash: contentHash({ modules, extra: { kind: args.kind, parents: args.parentIds || [], payload: args.extra ?? null } }),
    module_hash: contentHash({ modules }),
    created_at: new Date().toISOString(),
    parent_ids: [...new Set(args.parentIds || [])],
    authority: "SHADOW_ONLY",
    decision: "NO_DECISION",
  };
}

export function normalizeStrategyCard<T extends StrategyCardArtifactRecord>(card: T): T {
  const config=getCardRuntimeConfig(card);
  card={...card,symbol:card.symbol||"XAUUSD",design_tf:config.design_tf,execution_tf:config.allowed_execution_tf};
  const moduleHash = contentHash({ modules: card.modules || [] });
  const runtimeHash = strategyDefinitionHash(card);
  if (card.artifact?.kind === "STRATEGY_CARD" && card.artifact.content_hash) {
    // One-time migration establishes the module baseline. Every later write can
    // now detect silent module mutation and issue a new version/hash.
    if (!card.artifact.module_hash || !card.artifact.runtime_hash) return { ...card, artifact: { ...makeArtifactIdentity({artifactId:card.id,kind:"STRATEGY_CARD",modules:card.modules,version:(card.artifact.version||1)+1,parentIds:card.artifact.parent_ids,extra:{runtime:runtimeHash,supersedes:card.artifact.content_hash,reason:"RUNTIME_IDENTITY_MIGRATION"}}), runtime_hash:runtimeHash } };
    if (card.artifact.module_hash === moduleHash && card.artifact.runtime_hash === runtimeHash) return card;
    return {
      ...card,
      artifact: { ...makeArtifactIdentity({
        artifactId: card.id, kind: "STRATEGY_CARD", modules: card.modules || [],
        parentIds: card.artifact.parent_ids, version: card.artifact.version + 1,
        extra: { runtime: runtimeHash, supersedes: card.artifact.content_hash, reason: "EXECUTABLE_CONTEXT_CHANGED" },
      }), runtime_hash: runtimeHash },
    };
  }
  return {
    ...card,
    artifact: { ...makeArtifactIdentity({ artifactId: card.id, kind: "STRATEGY_CARD", modules: card.modules || [], extra: { runtime: runtimeHash, legacy: true } }), runtime_hash: runtimeHash },
  };
}

export function readStrategyCards<T extends StrategyCardArtifactRecord = StrategyCardArtifactRecord>(): T[] {
  if (!canStore()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_CARDS) || "[]");
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === "string" && Array.isArray(c.modules) && (c.symbol || "XAUUSD") === getActiveSymbol()).map((c) => normalizeStrategyCard(c)) : [];
  } catch { return []; }
}

export function writeStrategyCards<T extends StrategyCardArtifactRecord>(cards: T[]): T[] {
  const normalized = cards.map((c) => normalizeStrategyCard({ ...c, symbol: c.symbol || getActiveSymbol() }));
  if (!canStore()) return normalized;
  const existing = JSON.parse(localStorage.getItem(LS_CARDS) || "[]");
  const retained = Array.isArray(existing) ? existing.filter((c) => c && (c.symbol || "XAUUSD") !== getActiveSymbol() && !normalized.some((next) => next.id === c.id)) : [];
  localStorage.setItem(LS_CARDS, JSON.stringify([...normalized, ...retained]));
  notifyArtifactChange("STRATEGY_CARD");
  return normalized;
}

export function upsertStrategyCard<T extends StrategyCardArtifactRecord>(card: T): T[] {
  const current = readStrategyCards<T>();
  return writeStrategyCards([normalizeStrategyCard(card), ...current.filter((c) => c.id !== card.id)]);
}

export function readPassportArtifacts(): StoredPassportArtifact[] {
  if (!canStore()) return [];
  try { const parsed = JSON.parse(localStorage.getItem(LS_PASSPORTS) || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

/** Resolve persisted Passports against the current Card/Beast identity set.
 *  Consumers must not use STALE/MISSING artifacts as current compatibility. */
export function resolvePassportArtifacts(
  sourceIdentities: ArtifactIdentity[],
  stored = readPassportArtifacts(),
): ResolvedPassportArtifact[] {
  const byId = new Map(sourceIdentities.map((x) => [x.artifact_id, x]));
  return stored.map((p) => {
    const source = byId.get(p.source_artifact_id);
    if (!source) return { stored: p, freshness: "MISSING_SOURCE", reason: `Source ${p.source_artifact_id} is not present.` };
    if (source.kind !== p.source_kind || source.content_hash !== p.source_content_hash) {
      return { stored: p, freshness: "STALE_SOURCE", reason: `Source identity changed after Passport ${p.artifact.artifact_id} was built.` };
    }
    return { stored: p, freshness: "FRESH", reason: "Source identity and content hash match." };
  });
}

export function readFreshPassportArtifacts(sourceIdentities: ArtifactIdentity[]): StoredPassportArtifact[] {
  return resolvePassportArtifacts(sourceIdentities).filter((x) => x.freshness === "FRESH").map((x) => x.stored);
}

export function savePassportArtifact(args: {
  source: { id: string; kind: "STRATEGY_CARD" | "BEAST"; modules: string[]; artifact?: ArtifactIdentity };
  passport: unknown;
  passportHash: string;
}): StoredPassportArtifact {
  const sourceIdentity = args.source.artifact || makeArtifactIdentity({ artifactId: args.source.id, kind: args.source.kind, modules: args.source.modules });
  const id = `passport_${args.source.id}_${args.passportHash}`;
  const stored: StoredPassportArtifact = {
    artifact: makeArtifactIdentity({ artifactId: id, kind: "COMPATIBILITY_PASSPORT", parentIds: [sourceIdentity.artifact_id], extra: { passport_hash: args.passportHash } }),
    source_artifact_id: sourceIdentity.artifact_id,
    source_kind: args.source.kind,
    source_content_hash: sourceIdentity.content_hash,
    passport: args.passport,
  };
  const next = [stored, ...readPassportArtifacts().filter((p) => p.artifact.artifact_id !== id && p.source_artifact_id !== sourceIdentity.artifact_id)];
  if (canStore()) localStorage.setItem(LS_PASSPORTS, JSON.stringify(next));
  notifyArtifactChange("COMPATIBILITY_PASSPORT");
  return stored;
}

export function subscribeArtifactChanges(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ARTIFACTS_CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(ARTIFACTS_CHANGED_EVENT, listener); window.removeEventListener("storage", listener); };
}
