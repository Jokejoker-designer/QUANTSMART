// cardBeastV2/beastStore (P4) — save composed Beasts + EXPORT a Beast as a Strategy Card so the owner can
// full-decade backtest it themselves in Microscope (Y10→M6→M1 + HARD). Export writes: (1) the Beast's custom
// modules into mfe_custom_modules (Microscope loads them), (2) a SavedCard-shaped entry into mfe_strategy_cards
// with HONEST zeros + bt_window:"NO_DATA" (chưa backtest — số thật sinh ra khi bạn chạy Microscope).
import type { ComposedBeast, BeastMember, BeastMemberSourceKind } from "./beastCompose.ts";
import { loadCustomModules, saveCustomModules } from "../customModule.ts";
import { makeArtifactIdentity, notifyArtifactChange, readStrategyCards, writeStrategyCards, type ArtifactIdentity, type StrategyCardArtifactRecord } from "../artifactRegistry.ts";
import { censusOf } from "./moduleRoleCensus.ts";
import { contentHash } from "./schemas.ts";

export interface SavedRoleEvidence {
  measured_at: string;
  timeframe: string;
  bars: number;
  cost_mode: "NORMAL" | "HARD";
  full: { n: number; exp: number | null; dd: number };
  rows: { role: string; noCandidate: boolean; dExp: number | null; dTrades: number | null; note: string }[];
  identity?: { attackerTradeShare: number | null; fallbackTakeoverRate: number | null; status: "PRIMARY_ATTACKER" | "FALLBACK_DOMINANT" | "NO_FALLBACK" | "INSUFFICIENT" };
}

export interface SavedBeast {
  id: string; name: string; ts: string;
  members: { card_id: string; role: string; modules: string[]; source_kind?: BeastMemberSourceKind; source_artifact_id?: string; source_content_hash?: string }[];
  modules: string[]; customIds: string[];
  warnings: string[];
  artifact?: ArtifactIdentity;
  evidence?: SavedRoleEvidence;
}
export type BeastLineageStatus = "FRESH" | "STALE_MEMBER" | "MISSING_CARD";
export interface BeastLineageAssessment {
  status: BeastLineageStatus;
  issues: string[];
  verified_members: number;
  legacy_module_matches: number;
}
const LS_BEASTS = "mfe_beasts";
function normalizeBeast(b: SavedBeast): SavedBeast {
  const migrationNotes: string[] = [];
  const members = (b.members || []).map((m) => {
    if (m.role === "SAFETY") return m;
    const actual = [...new Set((m.modules || []).map((id) => censusOf(id)?.role).filter((r) => r && r !== "NONE"))];
    if (actual.length === 1 && actual[0] !== m.role) {
      migrationNotes.push(`ROLE_MIGRATION ${m.card_id}: ${m.role}→${actual[0]} (engine census)`);
      return { ...m, role: actual[0] as string };
    }
    return m;
  });
  const moduleHash = contentHash({ modules: b.modules || [] });
  let artifact = b.artifact?.kind === "BEAST" && b.artifact.content_hash ? b.artifact
    : makeArtifactIdentity({ artifactId: b.id, kind: "BEAST", modules: b.modules || [], parentIds: members.filter((m) => m.role !== "SAFETY" && m.source_kind !== "TEMPLATE").map((m) => m.source_artifact_id || m.card_id), extra: { legacy: true } });
  if (!artifact.module_hash) artifact = { ...artifact, module_hash: moduleHash };
  else if (artifact.module_hash !== moduleHash) {
    artifact = makeArtifactIdentity({ artifactId: b.id, kind: "BEAST", modules: b.modules || [], parentIds: artifact.parent_ids, version: artifact.version + 1, extra: { supersedes: artifact.content_hash, reason: "MODULE_SET_CHANGED" } });
    migrationNotes.push("BEAST_IDENTITY_REFRESH: module set changed after the previous artifact was issued");
  }
  return { ...b, members, warnings: [...new Set([...(b.warnings || []), ...migrationNotes])], artifact };
}
export function loadBeasts(): SavedBeast[] { try { const a = JSON.parse(localStorage.getItem(LS_BEASTS) || "[]"); return Array.isArray(a) ? a.map(normalizeBeast) : []; } catch { return []; } }
export function saveBeasts(list: SavedBeast[]) { localStorage.setItem(LS_BEASTS, JSON.stringify(list.map(normalizeBeast))); notifyArtifactChange("BEAST"); }

export function saveBeast(name: string, members: BeastMember[], composed: ComposedBeast, evidence?: SavedRoleEvidence): SavedBeast {
  const id = "beast_" + Date.now();
  const parentIds = members
    .filter((m) => m.role !== "SAFETY" && m.source_kind !== "TEMPLATE")
    .map((m) => m.source_artifact_id || m.card_id);
  const b: SavedBeast = {
    id, name, ts: new Date().toISOString().slice(0, 16).replace("T", " "),
    members: members.map((m) => ({ card_id: m.card_id, role: m.role, modules: m.modules, source_kind: m.source_kind, source_artifact_id: m.source_artifact_id, source_content_hash: m.source_content_hash })),
    modules: composed.modules, customIds: composed.customModules.map((c) => c.id), warnings: composed.warnings,
    artifact: makeArtifactIdentity({ artifactId: id, kind: "BEAST", modules: composed.modules, parentIds, extra: { members: members.map((m) => [m.card_id, m.role, m.source_kind || "LEGACY_CARD", m.source_content_hash || "UNFROZEN"]) } }),
    evidence,
  };
  saveBeasts([b, ...loadBeasts()]);
  return b;
}

const sameModules = (a: string[], b: string[]) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
const inferredSourceKind = (m: SavedBeast["members"][number]): BeastMemberSourceKind | "LEGACY_CARD" =>
  m.source_kind || (m.role === "SAFETY" || m.card_id === "l0" ? "SAFETY" : m.card_id.startsWith("template:") ? "TEMPLATE" : "LEGACY_CARD");

/** Check every Card-backed Beast member against the current Library. Templates
 *  and L0 are explicit non-Card sources. A stale/missing Card blocks re-export. */
export function assessBeastLineage(
  beast: SavedBeast,
  cards: StrategyCardArtifactRecord[] = readStrategyCards(),
): BeastLineageAssessment {
  const issues: string[] = [];
  let verified = 0, legacyMatches = 0, stale = false, missing = false;
  for (const member of beast.members || []) {
    const kind = inferredSourceKind(member);
    if (kind === "SAFETY" || kind === "TEMPLATE") continue;
    const card = cards.find((c) => c.id === member.card_id || (!!member.source_artifact_id && c.artifact?.artifact_id === member.source_artifact_id));
    if (!card?.artifact) {
      missing = true; issues.push(`MISSING_CARD ${member.card_id}: source is no longer in Strategy Library.`); continue;
    }
    if (kind === "LEGACY_CARD") {
      if (!sameModules(member.modules, card.modules)) {
        stale = true; issues.push(`STALE_MEMBER ${member.card_id}: legacy module snapshot differs from the current Card.`);
      } else {
        legacyMatches++; issues.push(`LEGACY_MODULE_MATCH ${member.card_id}: modules match; re-save Beast to freeze the Card hash.`);
      }
      continue;
    }
    if (member.source_artifact_id !== card.artifact.artifact_id || member.source_content_hash !== card.artifact.content_hash) {
      stale = true; issues.push(`STALE_MEMBER ${member.card_id}: Card identity/hash changed after Beast save.`);
    } else verified++;
  }
  return { status: missing ? "MISSING_CARD" : stale ? "STALE_MEMBER" : "FRESH", issues, verified_members: verified, legacy_module_matches: legacyMatches };
}

/** Export the composed Beast into the Strategy Card library (+ persist its custom modules) for Microscope. */
export function exportBeastAsCard(name: string, composed: ComposedBeast, designTf = "M15"): { ok: boolean; note: string } {
  try {
    // 1) persist custom modules (dedupe by id) so Microscope's loadCustomModules() finds them
    const existing = loadCustomModules();
    const merged = [...existing];
    for (const c of composed.customModules) if (!existing.some((x) => x.id === c.id)) merged.push(c);
    saveCustomModules(merged);
    // 2) append the card (SavedCard shape of StrategyCanvas) — honest zeros until the owner backtests it
    const lib = readStrategyCards();
    const id = "sc_beast_" + Date.now();
    const sourceBeast = loadBeasts().find((b) => b.name === name);
    lib.unshift({
      id, name, ts: new Date().toISOString().slice(0, 16).replace("T", " "),
      archetype: "Beast (role-composed)", algo: "fusion", verdict: "WATCH_ONLY", gate: "SHADOW",
      score: 0, layers: 6, guards: composed.contributions.filter((c) => c.role === "GUARD").length,
      n: 0, winRate: 0, netR: 0, costEv: 0, maxDD: 0,
      modules: composed.modules, design_tf: designTf, bt_window: "NO_DATA",
      artifact: makeArtifactIdentity({ artifactId: id, kind: "STRATEGY_CARD", modules: composed.modules, parentIds: sourceBeast?.artifact ? [sourceBeast.artifact.artifact_id] : [], extra: { source: "BEAST_EXPORT" } }),
    });
    writeStrategyCards(lib);
    return { ok: true, note: `Exported "${name}" to Strategy Library (${composed.modules.length} modules · ${composed.customModules.length} custom). Open Microscope and run the Card with declared windows and costs to obtain measured results.` };
  } catch (e) { return { ok: false, note: String(e) }; }
}
