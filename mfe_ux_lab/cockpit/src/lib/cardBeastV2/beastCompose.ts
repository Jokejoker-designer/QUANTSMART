// cardBeastV2/beastCompose (P3) — Beast composition where each role GENUINELY interacts, not decoration:
//   ATTACKER contributes ONLY its trigger votes · GUARD contributes ONLY its veto gates (blocks the attacker's
//   candidates) · CONFIRMATION contributes ONLY weight/quality scaling on the attacker's votes · EXIT_SENTINEL
//   contributes ONLY exit rules (shapes the attacker's trades) · SCOUT is advisory context · SAFETY = engine L0.
// Enforcement = role FILTERING at composition: a member's modules outside its role's mechanism are DROPPED with
// a warning (no smuggling a trigger inside a "guard"). Role power is then MEASURED by leave-one-role-out on the
// ONE engine — "phát huy sức mạnh của từng role" là số đo, không phải khẩu hiệu. FALLBACK: engine chưa có
// attacker-silent semantics → refused honestly (not faked).
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { runRealisticBacktest } from "../realisticSimRun.ts";
import { censusOf } from "./moduleRoleCensus.ts";
import { beastPreflight } from "./validators.ts";
import { diagnoseCardTriggers, fusionDeadlock } from "../cardTriggerDiagnosis.ts";
import type { Role } from "./vocabulary.ts";
import type { CustomModule } from "../customModule.ts";

// which engine MECHANISMS each role may contribute (the interaction contract)
export const ROLE_MECHANISMS: Record<string, string[]> = {
  ATTACKER: ["TRIGGER_VOTE", "COMBINER", "RR_SHAPER"],
  GUARD: ["HARD_GATE"],
  CONFIRMATION: ["QUALITY_GATE_ON_VOTES", "WEIGHT_SCALER"],
  SCOUT: ["CONTEXT_STATE"],
  EXIT_SENTINEL: ["EXIT_RULE"],
  FALLBACK: ["FALLBACK_VOTE"],   // V2 2026-07-03: engine có attacker-silent semantics (fb_range_fade) — role hết trống
  SAFETY: [],
};
const ROLE_CUSTOM: Record<string, string[]> = {
  ATTACKER: ["TRIGGER"], GUARD: ["VETO", "SAFETY_VETO", "CONTEXT_GATE"], CONFIRMATION: ["CONFIRM"],
  EXIT_SENTINEL: ["EXIT"], SCOUT: [], SAFETY: [],
};

export type BeastMemberSourceKind = "STRATEGY_CARD" | "TEMPLATE" | "SAFETY";
export interface BeastMember {
  card_id: string;
  role: Role;
  modules: string[];
  customs?: CustomModule[];
  /** Frozen source identity. Strategy Card members are fail-closed if this
   *  identity no longer matches the current Library artifact. */
  source_kind?: BeastMemberSourceKind;
  source_artifact_id?: string;
  source_content_hash?: string;
}
export interface ComposedBeast {
  ok: boolean;
  modules: string[]; customModules: CustomModule[];
  contributions: { card_id: string; role: Role; used: string[]; dropped: string[] }[];
  warnings: string[]; errors: string[];
}

/** True only when a card has at least one engine mechanism that the requested role may legally contribute. */
export function cardContributesToRole(modules: string[], role: Role): boolean {
  const allowed = ROLE_MECHANISMS[role] || [];
  return (modules || []).some((id) => { const c = censusOf(id); return !!c && allowed.includes(c.mechanism); });
}

export function composeBeast(members: BeastMember[]): ComposedBeast {
  const pre = beastPreflight(members.map((m) => ({ card_id: m.card_id, role: m.role, modules: m.role === "ATTACKER" || m.role === "FALLBACK" ? m.modules : undefined })));
  const warnings = [...pre.warnings]; const errors = [...pre.errors];
  // FALLBACK (V2): engine ĐÃ có attacker-silent semantics — fb_* chỉ vote khi mọi trigger chính im lặng ở nến đó.
  // Vẫn bắt buộc có ATTACKER thật (fb đứng một mình = im lặng vĩnh viễn); chỉ nhận mechanism FALLBACK_VOTE.
  if (members.some((m) => m.role === "FALLBACK") && !members.some((m) => m.role === "ATTACKER")) {
    errors.push("FALLBACK requires a primary ATTACKER. A fallback alone produces NO_CANDIDATE.");
  }
  const modules: string[] = []; const customModules: CustomModule[] = [];
  const contributions: ComposedBeast["contributions"] = [];
  for (const m of members) {
    const allowMech = ROLE_MECHANISMS[m.role] || []; const allowCustom = ROLE_CUSTOM[m.role] || [];
    const used: string[] = []; const dropped: string[] = [];
    for (const id of m.modules || []) {
      const cen = censusOf(id);
      if (cen && allowMech.includes(cen.mechanism)) { if (!modules.includes(id)) modules.push(id); used.push(id); }
      else if (!cen && (m.customs || []).some((c) => c.id === id)) { /* custom handled below */ }
      else dropped.push(id);
    }
    for (const c of m.customs || []) {
      if (allowCustom.includes(c.role)) { customModules.push(c); if (!modules.includes(c.id)) modules.push(c.id); used.push(c.id); }
      else dropped.push(c.id + " (custom " + c.role + ")");
    }
    if (dropped.length) warnings.push(`${m.card_id} [${m.role}]: DROP ${dropped.join(", ")} — stripped because it is outside this role's authority`);
    contributions.push({ card_id: m.card_id, role: m.role, used, dropped });
  }
  // interaction LINT (measured trap 2026-07-02): calib_trust requires ≥2 agreeing vote SOURCES — composed over a
  // single-trigger attacker it blocks EVERY entry (0 trades). Surface at compose time, don't let users find out
  // after a silent dead backtest.
  const trigCount = diagnoseCardTriggers(modules).count + customModules.filter((c) => c.role === "TRIGGER").length;
  if (modules.includes("calib_trust") && trigCount < 2) {
    errors.push(`OVER-GATE: calib_trust requires at least two vote sources; this Beast has only ${trigCount} trigger source(s). Remove calib_trust or add a second source to avoid blocking every simulated trade.`);
  }
  const fd = fusionDeadlock(modules);   // trap 2: trigger yếu (w<0.8) + fusion threshold 0.8 = 0 lệnh vĩnh viễn
  if (fd.deadlocked) errors.push(fd.note);
  return { ok: errors.length === 0, modules, customModules, contributions, warnings, errors };
}

export interface ArmMetrics { n: number; netR: number; exp: number | null; dd: number }
export function runBeastArm(bars: OhlcBar[], modules: string[], customs: CustomModule[], hard = false, tf = "M15"): ArmMetrics {
  const bt = runRealisticBacktest(bars, { id: "beast", name: "beast", modules, design_tf: tf }, { symbol: "XAUUSD", chartTf: tf, customModules: customs, hard });
  const t = bt.sim.trades || []; const n = t.length;
  const netR = +t.reduce((s, x) => s + x.netR, 0).toFixed(2);
  let peak = 0, dd = 0, cum = 0; for (const x of t) { cum += x.netR; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); }
  return { n, netR, exp: n ? +(netR / n).toFixed(4) : null, dd: +dd.toFixed(2) };
}

export interface RolePowerRow { role: Role; withoutRole: ArmMetrics | { status: "NO_CANDIDATE" }; dExp: number | null; dTrades: number | null; note: string }
/** Leave-one-role-out: measure what each role ACTUALLY contributes to the full Beast. Removing the attacker →
 *  NO_CANDIDATE (invariant: never measure the engine's fallback as if it were the Beast). */
export interface BeastIdentityEvidence {
  attackerTradeShare: number | null;
  fallbackTakeoverRate: number | null;
  status: "PRIMARY_ATTACKER" | "FALLBACK_DOMINANT" | "NO_FALLBACK" | "INSUFFICIENT";
}
export function rolePowerReport(bars: OhlcBar[], members: BeastMember[], hard = false): { full: ArmMetrics; rows: RolePowerRow[]; identity: BeastIdentityEvidence } {
  const fullC = composeBeast(members);
  const full = runBeastArm(bars, fullC.modules, fullC.customModules, hard);
  const roles = [...new Set(members.map((m) => m.role))].filter((r) => r !== "SAFETY");
  const rows: RolePowerRow[] = [];
  let withoutFallback: ArmMetrics | null = null;
  for (const role of roles) {
    if (role === "ATTACKER") {
      rows.push({ role, withoutRole: { status: "NO_CANDIDATE" }, dExp: null, dTrades: null, note: "Removing the attacker leaves no candidates. A fallback strategy is not substituted." });
      continue;
    }
    const rest = members.filter((m) => m.role !== role);
    const c = composeBeast(rest);
    const m = runBeastArm(bars, c.modules, c.customModules, hard);
    if (role === "FALLBACK") withoutFallback = m;
    rows.push({
      role, withoutRole: m,
      dExp: full.exp != null && m.exp != null ? +((full.exp - m.exp)).toFixed(4) : null,
      dTrades: full.n - m.n,
      note: role === "GUARD" ? `Guard filters ${m.n - full.n} trades (${m.n}→${full.n})` : role === "CONFIRMATION" ? "Confirmation changes vote weights and therefore the fusion-selected trade set" : role === "EXIT_SENTINEL" ? "Exit changes how the same entries are closed" : role === "FALLBACK" ? `Fallback creates ${Math.max(0, full.n - m.n)} trades when the attacker has no candidate` : "context observer",
    });
  }
  const hasFallback = members.some((m) => m.role === "FALLBACK");
  const share = hasFallback && withoutFallback && full.n > 0 ? Math.max(0, Math.min(1, withoutFallback.n / full.n)) : null;
  const identity: BeastIdentityEvidence = !hasFallback
    ? { attackerTradeShare: full.n > 0 ? 1 : null, fallbackTakeoverRate: 0, status: full.n > 0 ? "NO_FALLBACK" : "INSUFFICIENT" }
    : share == null
      ? { attackerTradeShare: null, fallbackTakeoverRate: null, status: "INSUFFICIENT" }
      : { attackerTradeShare: +share.toFixed(4), fallbackTakeoverRate: +(1 - share).toFixed(4), status: 1 - share > 0.7 ? "FALLBACK_DOMINANT" : "PRIMARY_ATTACKER" };
  return { full, rows, identity };
}
