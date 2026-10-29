// cardTriggerDiagnosis — WHY do different cards backtest almost identically? Because the engine
// (realisticStrategySim.ts:319) falls back to a DEFAULT EMA10×EMA34 cross when a card has NO real trigger module.
// So every trigger-less card runs the SAME entries → the same result. This mirrors the engine's exact trigger
// condition (read-only; does NOT change the engine) so the UI can flag: FALLBACK (identical) / SOLE / MULTI.
// Keep these lists IN SYNC with realisticStrategySim.ts hasTrend/hasRsi/hasSweep/hasRange + classicIndicators.ts.

// each family fires as ONE trigger source (engine ORs the ids within a family).
export const TRIGGER_FAMILIES: { family: string; label: string; modules: string[] }[] = [
  { family: "trend", label: "Trend Pullback", modules: ["trend_pullback", "ema_trend", "ema_slope"] },
  { family: "rsi", label: "RSI Reclaim", modules: ["rsi_reclaim", "rsi_value"] },
  { family: "sweep", label: "Sweep Reclaim", modules: ["sweep_reclaim", "sweep_depth", "sweep_risk"] },
  { family: "range", label: "Range Fade", modules: ["range_fade"] },
  { family: "psl", label: "PSL Sweep", modules: ["psl_sweep"] },
  { family: "volc", label: "Vol Contraction", modules: ["vol_contraction"] },
  { family: "htfa", label: "HTF Anchor", modules: ["htf_anchor"] },
  { family: "asia", label: "Asia-Range Fade", modules: ["asia_range_fade"] },
  { family: "wickx", label: "Wick Extreme", modules: ["wick_extreme"] },
  { family: "gap", label: "Gap Fade", modules: ["gap_fade"] },
  { family: "rsix", label: "RSI Extreme", modules: ["rsi_extreme"] },
  { family: "bretest", label: "Break & Retest", modules: ["break_retest"] },
];
// each classic indicator is its OWN trigger source (classicEntryVotes pushes per-indicator).
export const CLASSIC_TRIGGERS: { family: string; label: string; module: string }[] = [
  { family: "ichimoku", label: "Ichimoku", module: "ichimoku" },
  { family: "macd", label: "MACD", module: "macd" },
  { family: "stochastic", label: "Stochastic", module: "stochastic" },
  { family: "bollinger", label: "Bollinger", module: "bollinger" },
  { family: "fib", label: "Fib retrace", module: "fib_retrace" },
];
// REAL engine non-trigger ids — from the module role census (ONE source of truth; F1 fixed the earlier guessed
// names like "session_filter"/"exit_weakening" which don't exist — real ids are session_ctx/exit_weak/…).
import { ENGINE_NON_TRIGGER_IDS } from "./cardBeastV2/moduleRoleCensus.ts";
const KNOWN_NON_TRIGGER = new Set(ENGINE_NON_TRIGGER_IDS);

export type TriggerVerdict = "NO_TRIGGER_FALLBACK" | "SOLE_TRIGGER" | "MULTI_TRIGGER" | "CUSTOM_UNCERTAIN";
export interface TriggerDiagnosis {
  triggers: { family: string; label: string }[];   // distinct trigger sources present
  count: number;                                    // number of distinct trigger sources
  verdict: TriggerVerdict;
  fallbackActive: boolean;                          // true = runs the shared EMA-cross default (→ identical to other fallback cards)
  customModules: string[];                          // unknown ids that could be custom triggers
  note: string;
}

export function diagnoseCardTriggers(modules: string[]): TriggerDiagnosis {
  const set = new Set((modules || []).map((m) => String(m)));
  const has = (id: string) => set.has(id);
  const triggers: { family: string; label: string }[] = [];
  for (const f of TRIGGER_FAMILIES) if (f.modules.some(has)) triggers.push({ family: f.family, label: f.label });
  for (const c of CLASSIC_TRIGGERS) if (has(c.module)) triggers.push({ family: c.family, label: c.label });

  const known = new Set([...TRIGGER_FAMILIES.flatMap((f) => f.modules), ...CLASSIC_TRIGGERS.map((c) => c.module), ...KNOWN_NON_TRIGGER]);
  const customModules = [...set].filter((m) => !known.has(m));

  const count = triggers.length;
  let verdict: TriggerVerdict;
  let fallbackActive = false;
  if (count === 0 && customModules.length > 0) {
    verdict = "CUSTOM_UNCERTAIN";
    fallbackActive = false;   // a custom module MIGHT be a trigger → can't be sure it's the fallback
  } else if (count === 0) {
    verdict = "NO_TRIGGER_FALLBACK"; fallbackActive = true;
  } else if (count === 1) {
    verdict = "SOLE_TRIGGER";
  } else {
    verdict = "MULTI_TRIGGER";
  }

  const note = fallbackActive
    ? "No trigger module: the simulator uses the shared EMA10×EMA34 crossover. Cards with this fallback use the same entry rule. Add at least one trigger to test a different entry hypothesis."
    : verdict === "SOLE_TRIGGER"
      ? `One trigger (${triggers[0].label}). This differs from the fallback entry rule. Removing the sole trigger changes the baseline, so trigger ablation requires at least two sources.`
      : verdict === "CUSTOM_UNCERTAIN"
        ? `No built-in trigger was identified. Inspect the custom modules (${customModules.join(", ")}) to determine whether they provide entry triggers.`
        : `${count} trigger sources (${triggers.map((t) => t.label).join(", ")}). Distinct sources do not by themselves establish an edge.`;
  return { triggers, count, verdict, fallbackActive, customModules, note };
}

export const TRIGGER_VERDICT_COLOR: Record<TriggerVerdict, string> = {
  NO_TRIGGER_FALLBACK: "#FF4D4D", SOLE_TRIGGER: "#F4C542", MULTI_TRIGGER: "#21D07A", CUSTOM_UNCERTAIN: "#8295aa",
};
export const TRIGGER_VERDICT_LABEL: Record<TriggerVerdict, string> = {
  NO_TRIGGER_FALLBACK: "FALLBACK EMA-cross", SOLE_TRIGGER: "1 trigger", MULTI_TRIGGER: "multi-trigger", CUSTOM_UNCERTAIN: "custom?",
};

// ── FUSION-DEADLOCK LINT (trap đo được 2026-07-02): fusion threshold = 0.8; một vote đơn có w < 0.8 KHÔNG BAO
// GIỜ qua ngưỡng → card 1-trigger yếu + fusion = 0 lệnh vĩnh viễn (range_fade/bollinger/stochastic đã dính).
// Trọng số theo family (mirror TC defaults + classicEntryVotes):
export const TRIGGER_FAMILY_WEIGHT: Record<string, number> = {
  trend: 1.0, rsi: 0.8, sweep: 0.9, range: 0.7, psl: 0.9, volc: 1.0, htfa: 1.0,
  asia: 0.9, wickx: 0.9, gap: 0.9, rsix: 0.8,
  ichimoku: 1.0, macd: 0.8, stochastic: 0.7, bollinger: 0.7, fib: 0.7,
};
const FUSION_THRESHOLD = 0.8;
/** true = card này sẽ 0 lệnh vĩnh viễn: có fusion nhưng KHÔNG một trigger đơn nào đủ w ≥ 0.8 và chỉ có 1 nguồn. */
export function fusionDeadlock(modules: string[]): { deadlocked: boolean; note: string } {
  const set = new Set(modules || []);
  if (!set.has("fusion")) return { deadlocked: false, note: "" };
  const d = diagnoseCardTriggers(modules);
  if (d.count === 0) return { deadlocked: false, note: "" };   // fallback case — đã có verdict riêng
  const maxW = Math.max(...d.triggers.map((t) => TRIGGER_FAMILY_WEIGHT[t.family] ?? 0.7));
  const sumW = d.triggers.reduce((s, t) => s + (TRIGGER_FAMILY_WEIGHT[t.family] ?? 0.7), 0);
  if (d.count === 1 && maxW < FUSION_THRESHOLD) {
    return { deadlocked: true, note: `FUSION-DEADLOCK: ${d.triggers[0].label} weight ${maxW} is below the 0.8 fusion threshold. This sole source cannot pass. Remove fusion or add a compatible trigger/mtf_confirm.` };
  }
  if (d.count > 1 && sumW < FUSION_THRESHOLD) {
    return { deadlocked: true, note: `FUSION-DEADLOCK: maximum combined weight ${sumW.toFixed(2)} is below 0.8 and cannot pass the threshold.` };
  }
  return { deadlocked: false, note: "" };
}
