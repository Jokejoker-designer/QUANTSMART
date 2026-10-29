// breakoutLiquidityBeast — Beast thử nghiệm "Breakout-Liquidity" (WO: BREAKOUT_LIQUIDITY_BEAST_ABLATION_V1)
// SHADOW_ONLY / ADVISORY_ONLY / MEASUREMENT_ONLY — advisory · zone-only · KHÔNG order/SL-TP số/risk-sizing.
//
// THÁO Ý TƯỞNG từ MFE_BEAST_5_CARD_MODULAR_PACKAGE_V1 (Breakout-Retest / Sweep-Reclaim / Fakeout-Guard /
// MTF-Scout / Exit-Sentinel) — KHÔNG import một dòng code nào của package. Mọi vai map vào MODULE ĐÃ CÓ của
// engine of record; score/R/PF đến từ realisticStrategySim qua runBeastArm/runRealisticBacktest, không có engine 2.
//
// MAP vai (sketch WO → enforcement thật của cardBeastV2, lệch nào ghi rõ):
//   ATTACKER  "Breakout-Retest + Sweep-Reclaim": break_retest + trend_pullback + sweep_reclaim (hybrid FUSED
//             qua fusion → 1 setup root, không SPLIT_REQUIRED; sweep_reclaim KHÔNG thể vào FALLBACK vì role đó
//             chỉ nhận fb_* — enforcement chống smuggling đang làm đúng việc)
//   FALLBACK  "Liquidity Fallback": fb_range_fade (module fallback hợp lệ duy nhất — chỉ nói khi attacker im lặng)
//   GUARD     "Fakeout-Guard": no_trade_chop + 2 custom VETO block-composed đã có (🎣 No-Chase extAtr>0.8 ·
//             🚫🕯️ Candle-Against candleAlign==−1). wick_extreme của sketch là TRIGGER_VOTE → không thể làm guard
//             (role-filter sẽ DROP đúng thiết kế) — ý "chặn nến kiệt sức" được 🚫🕯️ cover ở dạng veto.
//   GUARD     "Structure-Guard": sr_zone_context + level_memory — realistic engine uses both as HARD VETO.
//   SCOUT     "Episode observer": ch_episode_lens (CONTEXT_STATE, does not veto or create candidates).
//   CONFIRMATION: mtf_confirm (WEIGHT_SCALER — đúng quyền, không tự tạo tín hiệu)
//   EXIT_SENTINEL: exit_weak (đúng sketch)
//
// KHÔNG HỨA EDGE: kết quả ablation là mô tả SHADOW trên tape; beast > attacker-alone (nếu có) là quan sát cần
// confirm — mọi claim dự đoán phải qua signal_material_gate.py (track Python). Setup output = zone advisory
// (cardZones sẵn có) — không mức giá cụ thể, không sizing.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { runRealisticBacktest } from "../realisticSimRun.ts";
import { compareCardSummary, type CompareCardSummary } from "../microscopeComputed.ts";
import { MODULE_PRESETS, loadCustomModules, saveCustomModules, type CustomModule } from "../customModule.ts";
import { SYNERGY_BUDGET } from "./budget.ts";
import { composeBeast, type BeastMember } from "./beastCompose.ts";
import { exportBeastAsCard, loadBeasts, saveBeast } from "./beastStore.ts";
import { readStrategyCards } from "../artifactRegistry.ts";

export const CAN_EMIT_ORDER = false as const;   // khóa cứng: beast này không bao giờ có quyền lệnh

// ── materialize 2 custom VETO từ preset F5 đã có (block thật, không logic mới) ──
function presetByLabel(label: string, slug: string): CustomModule {
  const p = MODULE_PRESETS.find((x) => x.label === label);
  if (!p) throw new Error("Missing preset: " + label);
  return { id: "cm_blb_" + slug, createdAt: "beast", status: "SHADOW", ...(p.draft as Omit<CustomModule, "id" | "createdAt" | "status">) };
}
export const GUARD_CUSTOMS: CustomModule[] = [
  presetByLabel("🎣 No-Chase Guard (owner · anti-FOMO breakout)", "no_chase"),
  presetByLabel("🚫🕯️ Candle-Against Veto (L1 · block-composed)", "candle_against"),
];

export const BREAKOUT_LIQUIDITY_BEAST = {
  attacker: { card_id: "Breakout-Retest+Sweep", role: "ATTACKER" as const, modules: ["break_retest", "trend_pullback", "sweep_reclaim", "fusion", "auto_rr"] },
  fallback: { card_id: "Liquidity-Fallback", role: "FALLBACK" as const, modules: ["fb_range_fade"] },
  guard: { card_id: "Fakeout-Guard", role: "GUARD" as const, modules: ["no_trade_chop", ...GUARD_CUSTOMS.map((c) => c.id)], customs: GUARD_CUSTOMS },
  structureGuard: { card_id: "Structure-Guard", role: "GUARD" as const, modules: ["sr_zone_context", "level_memory"] },
  scout: { card_id: "Episode-Observer", role: "SCOUT" as const, modules: ["ch_episode_lens"] },
  confirmation: { card_id: "MTF-Confirm", role: "CONFIRMATION" as const, modules: ["mtf_confirm"] },
  exit: { card_id: "Exit-Sentinel", role: "EXIT_SENTINEL" as const, modules: ["exit_weak"] },
};

export function beastMembers(): BeastMember[] {
  const B = BREAKOUT_LIQUIDITY_BEAST;
  return [
    { card_id: B.attacker.card_id, role: B.attacker.role, modules: B.attacker.modules },
    { card_id: B.fallback.card_id, role: B.fallback.role, modules: B.fallback.modules },
    { card_id: B.guard.card_id, role: B.guard.role, modules: B.guard.modules, customs: B.guard.customs },
    { card_id: B.structureGuard.card_id, role: B.structureGuard.role, modules: B.structureGuard.modules },
    { card_id: B.scout.card_id, role: B.scout.role, modules: B.scout.modules },
    { card_id: B.confirmation.card_id, role: B.confirmation.role, modules: B.confirmation.modules },
    { card_id: B.exit.card_id, role: B.exit.role, modules: B.exit.modules },
    { card_id: "l0", role: "SAFETY", modules: [] },
  ];
}

// ── ABLATION §12: A / A+C / A+C+D / A+C+D+E / FULL / B-alone — cùng tape, cùng cut train/held (pattern f4) ──
export type ArmName = "A_alone" | "A_C" | "A_C_D" | "A_C_D_E" | "FULL" | "B_fallback_alone";
const B = BREAKOUT_LIQUIDITY_BEAST;
const ARM_DEF: Record<ArmName, { modules: string[]; customs: CustomModule[] }> = {
  A_alone: { modules: B.attacker.modules, customs: [] },
  A_C: { modules: [...B.attacker.modules, "no_trade_chop", ...GUARD_CUSTOMS.map((c) => c.id)], customs: GUARD_CUSTOMS },
  A_C_D: { modules: [...B.attacker.modules, "no_trade_chop", ...GUARD_CUSTOMS.map((c) => c.id), ...B.structureGuard.modules, ...B.scout.modules, ...B.confirmation.modules], customs: GUARD_CUSTOMS },
  A_C_D_E: { modules: [...B.attacker.modules, "no_trade_chop", ...GUARD_CUSTOMS.map((c) => c.id), ...B.structureGuard.modules, ...B.scout.modules, ...B.confirmation.modules, ...B.exit.modules], customs: GUARD_CUSTOMS },
  FULL: { modules: [...B.attacker.modules, ...B.fallback.modules, "no_trade_chop", ...GUARD_CUSTOMS.map((c) => c.id), ...B.structureGuard.modules, ...B.scout.modules, ...B.confirmation.modules, ...B.exit.modules], customs: GUARD_CUSTOMS },
  B_fallback_alone: { modules: [...B.fallback.modules, "fusion", "auto_rr"], customs: [] },   // fb đứng một mình = 0 lệnh (invariant)
};

/** Nhãn synergy TRUNG THỰC cho một bước thêm-vai (dExp per-trade, 2 cửa sổ):
 *  mẫu mỏng → INSUFFICIENT_EVIDENCE (không large-N mirage) · dưới ngưỡng cả 2 → REDUNDANT ·
 *  cải thiện CẢ 2 (≥ EFFECT_THRESHOLD_R) → COMPLEMENTARY · xấu CẢ 2 → HARMFUL · lệch dấu/1 cửa sổ → INSUFFICIENT. */
export function stepSynergy(dExpTrain: number, dExpHeld: number, nTrain: number, nHeld: number): string {
  if (nTrain < SYNERGY_BUDGET.MIN_TRADES_PER_ARM || nHeld < 10) return "INSUFFICIENT_EVIDENCE";
  const th = SYNERGY_BUDGET.EFFECT_THRESHOLD_R;
  if (Math.abs(dExpTrain) < th && Math.abs(dExpHeld) < th) return "REDUNDANT";
  if (dExpTrain >= th && dExpHeld >= th) return "COMPLEMENTARY";
  if (dExpTrain <= -th && dExpHeld <= -th) return "HARMFUL";
  return "INSUFFICIENT_EVIDENCE";   // chỉ tốt/xấu một cửa sổ → KHÔNG kết luận (bài học sole-trigger/large-N)
}

export interface ArmResult { name: ArmName; train: CompareCardSummary; held: CompareCardSummary }
export interface AblationStep { name: string; dExpTrain: number; dExpHeld: number; synergy: string }
export interface AblationResult { arms: ArmResult[]; steps: AblationStep[]; armModules: (n: ArmName) => string[] }

function runArm(bars: OhlcBar[], name: ArmName): CompareCardSummary {
  const d = ARM_DEF[name];
  // engine of record — metrics từ analytics engine qua compareCardSummary (lib snapshot-guarded), không tự tính lại
  const bt = runRealisticBacktest(bars, { id: "blb_" + name, name: "blb_" + name, modules: d.modules, design_tf: "M15" }, { symbol: "XAUUSD", chartTf: "M15", customModules: d.customs });
  return compareCardSummary(bt);
}

// ── MFE_TREND_RETEST_BEAST_V1 (WO BEAST_EXPORT_TO_LIBRARY_V1) — luận đề MẠCH LẠC trend-continuation qua retest,
// module cùng tribe cộng hưởng, KHÔNG trộn reversal vào beast trend. Toàn bộ id đã có trong census. ──
export const TREND_RETEST_BEAST_V1 = {
  attacker: { card_id: "Trend-Retest", role: "ATTACKER" as const, modules: ["break_retest", "trend_pullback", "fusion", "auto_rr"] },
  guard: { card_id: "Chop+DirtyEntry-Guard", role: "GUARD" as const, modules: ["no_trade_chop", "range_size"] },
  confirmation: { card_id: "MTF+Sequence-Confirm", role: "CONFIRMATION" as const, modules: ["mtf_confirm", "state_machine"] },
  structureGuard: { card_id: "SR-Structure-Guard", role: "GUARD" as const, modules: ["sr_zone_context"] },
  scout: { card_id: "Episode-Observer", role: "SCOUT" as const, modules: ["ch_episode_lens"] },
  exit: { card_id: "Exit-Sentinel", role: "EXIT_SENTINEL" as const, modules: ["exit_weak"] },
};
export function trendRetestMembers(): BeastMember[] {
  const T = TREND_RETEST_BEAST_V1;
  return [
    { card_id: T.attacker.card_id, role: T.attacker.role, modules: T.attacker.modules },
    { card_id: T.guard.card_id, role: T.guard.role, modules: T.guard.modules },
    { card_id: T.structureGuard.card_id, role: T.structureGuard.role, modules: T.structureGuard.modules },
    { card_id: T.confirmation.card_id, role: T.confirmation.role, modules: T.confirmation.modules },
    { card_id: T.scout.card_id, role: T.scout.role, modules: T.scout.modules },
    { card_id: T.exit.card_id, role: T.exit.role, modules: T.exit.modules },
    { card_id: "l0", role: "SAFETY", modules: [] },
  ];
}

/** Seed 2 beast mẫu vào Strategy Library (IDEMPOTENT — dedupe theo tên; chạy lại không tạo trùng).
 *  Card ra đời với HONEST ZEROS + bt_window NO_DATA + WATCH_ONLY (exportBeastAsCard lo việc này) —
 *  KHÔNG cấy bất kỳ số PF/netR nào từ ablation; số thật chỉ sinh khi owner tự chạy Microscope Y10 (+HARD). */
export function seedBeastsToLibrary(): { exported: string[]; skipped: string[]; errors: string[] } {
  const out = { exported: [] as string[], skipped: [] as string[], errors: [] as string[] };
  try {
    const curCustoms = loadCustomModules();
    const byId = new Map(curCustoms.map((c) => [c.id, c]));
    let changed = false;
    for (const gc of GUARD_CUSTOMS) if (!byId.has(gc.id)) { byId.set(gc.id, gc); changed = true; }
    if (changed) saveCustomModules([...byId.values()]);
  } catch { /* ignore in isolated test shims */ }
  const existing: { name?: string }[] = readStrategyCards();
  const seeds: { name: string; members: BeastMember[] }[] = [
    { name: "🐲 Breakout-Liquidity Beast (FULL)", members: beastMembers() },
    { name: "🐲 MFE_TREND_RETEST_BEAST_V1", members: trendRetestMembers() },
  ];
  const koho = loadBeasts();   // Kho Beast (mfe_beasts) — để 2 beast HIỆN NGAY dạng deck board trong BeastLab
  for (const s of seeds) {
    if (existing.some((c) => c.name === s.name)) { out.skipped.push(s.name); continue; }
    const comp = composeBeast(s.members);
    if (!comp.ok) { out.errors.push(`${s.name}: ${comp.errors.join("; ")}`); continue; }   // preflight FAIL → KHÔNG export beast lỗi
    // (a) hiện trong Kho Beast (deck board) — idempotent theo tên · (b) export vào Library cho Microscope backtest
    if (!koho.some((b) => b.name === s.name)) saveBeast(s.name, s.members, comp);
    const r = exportBeastAsCard(s.name, comp);
    if (r.ok) out.exported.push(s.name); else out.errors.push(`${s.name}: ${r.note}`);
  }
  return out;
}

export function runAblation(bars: OhlcBar[]): AblationResult {
  const cut = Math.floor(bars.length * 0.7);
  const train = bars.slice(0, cut), held = bars.slice(cut);
  const order: ArmName[] = ["A_alone", "A_C", "A_C_D", "A_C_D_E", "FULL", "B_fallback_alone"];
  const arms: ArmResult[] = order.map((name) => ({ name, train: runArm(train, name), held: runArm(held, name) }));
  // synergy từng BƯỚC thêm-vai (so với arm liền trước trong thang A→full)
  const ladder: [string, ArmName, ArmName][] = [["+Guard(C)", "A_alone", "A_C"], ["+Scout/Confirm(D)", "A_C", "A_C_D"], ["+Exit(E)", "A_C_D", "A_C_D_E"], ["+Fallback(B)→FULL", "A_C_D_E", "FULL"]];
  const steps: AblationStep[] = ladder.map(([label, prev, next]) => {
    const p = arms.find((a) => a.name === prev)!, q = arms.find((a) => a.name === next)!;
    const dTr = +(((q.train.exp ?? 0) - (p.train.exp ?? 0))).toFixed(4);
    const dHo = +(((q.held.exp ?? 0) - (p.held.exp ?? 0))).toFixed(4);
    return { name: label, dExpTrain: dTr, dExpHeld: dHo, synergy: stepSynergy(dTr, dHo, q.train.n, q.held.n) };
  });
  return { arms, steps, armModules: (n: ArmName) => ARM_DEF[n].modules };
}
