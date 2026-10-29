// simAblation — leave-one-out ablation on the WALK-FORWARD (OOS) net result. For each module, run the
// card WITH vs WITHOUT it across OOS folds; the delta = that module's real marginal contribution to
// NET OOS. Answers "does this module actually help, or is it decorative / harmful?" — the honest gate
// before believing any module (classic indicators included). OOS-only (no in-sample curve-fit).
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { cloneSimConfig, DEFAULT_REALISTIC_SIM_CONFIG, type SimulatorRealismConfig } from "./simConfig.ts";
import { getCardRuntimeConfig } from "./simTimeframe.ts";
import { getSymbolSpec } from "./symbolSpec.ts";
import { walkForward } from "./simWalkForward.ts";
import { classicFlags, anyClassicTrigger } from "./classicIndicators.ts";
import type { CustomModule } from "./customModule.ts";

// L0 governance + L6 zones don't affect the realistic backtest → not ablatable strategy modules.
const NON_ABLATABLE = new Set(["data_quality", "kidi_guard", "no_lookahead", "synthetic_vol_guard", "authority_guard", "observation_zone", "confirmation_zone", "risk_zone", "invalidation_zone", "avoid_zone", "dynamic_zone"]);

// TRIGGER modules = the ones that CREATE entry setups (mirror realisticStrategySim lines 119-122 + classic triggers).
// When a card has NO trigger, the engine falls back to a built-in EMA(10/34)-cross strategy (realisticStrategySim
// ~L234). So removing the LAST trigger doesn't measure "card minus module" — it silently swaps in a DIFFERENT
// default strategy → the "without" R is that fallback's number, NOT a faithful ablation. We must flag this.
const TRIGGER_IDS = ["trend_pullback", "ema_trend", "ema_slope", "rsi_reclaim", "rsi_value", "sweep_reclaim", "sweep_depth", "sweep_risk", "range_fade"];
function hasNativeTrigger(modules: string[]): boolean { const h = (x: string) => modules.includes(x); return TRIGGER_IDS.some(h) || anyClassicTrigger(classicFlags((id) => modules.includes(id))); }

// CORE_TRIGGER = removing it collapses entries to ~0 (it's the setup creator) → NOT "harmful".
// SOLE_TRIGGER = removing it leaves NO trigger → the engine runs its default EMA-cross fallback → the "without"
//   number is a DIFFERENT strategy, so the Δ is NOT a faithful marginal contribution (can't measure it solo).
export type AblationVerdict = "HELPS" | "NEUTRAL" | "HURTS" | "CORE_TRIGGER" | "SOLE_TRIGGER";
export interface AblationRow { id: string; withoutOosR: number; deltaR: number; withoutPosFrac: number; withoutTrades: number; verdict: AblationVerdict; soleTrigger: boolean }
export interface AblationResult {
  designTf: string; folds: number;
  baselineOosR: number; baselinePosFrac: number; baselineTrades: number;
  baselineHasEdge: boolean;        // base OOS>0 AND ≥50% folds positive — else "contributions" are just less-loss
  baselineHasTrigger: boolean;     // false → the card itself has no trigger → baseline IS already the EMA-cross fallback
  rows: AblationRow[];
  ablatable: number;
  note: string;
}

export interface AblationOptions { folds?: number; capital?: number; riskPct?: number; customModules?: CustomModule[]; cfg?: SimulatorRealismConfig }

function oosOf(bars: OhlcBar[], modules: string[], autoRR: boolean, ctx: Parameters<typeof walkForward>[3]): { oosR: number; posFrac: number; trades: number } {
  const wf = walkForward(bars, modules, autoRR, ctx);
  const valid = wf.folds.filter((f) => f.n >= 5);
  const oosR = +valid.reduce((s, f) => s + f.netR, 0).toFixed(2);
  const trades = wf.folds.reduce((s, f) => s + f.n, 0);   // total OOS trades across all folds
  return { oosR, posFrac: wf.positiveFraction, trades };
}

export function runAblation(designBars: OhlcBar[], card: any, opts: AblationOptions = {}): AblationResult {
  const designTf = getCardRuntimeConfig(card).design_tf;
  const spec = getSymbolSpec("XAUUSD");
  const cfg = opts.cfg ? cloneSimConfig(opts.cfg) : cloneSimConfig(DEFAULT_REALISTIC_SIM_CONFIG);
  cfg.designTf = designTf; cfg.executionTf = designTf;
  if (opts.capital != null && opts.capital > 0) { cfg.risk.initialEquity = opts.capital; cfg.risk.sizingMode = "PERCENT_EQUITY"; }
  if (opts.riskPct != null && opts.riskPct > 0) cfg.risk.riskPctEquity = opts.riskPct;
  const folds = opts.folds ?? 5;
  const mods: string[] = Array.isArray(card?.modules) ? card.modules : [];
  const cmods = (opts.customModules || []).filter((m) => mods.includes(m.id));
  const ctx = (m: string[]): Parameters<typeof walkForward>[3] => ({ cfg, spec, designTf, cardId: card?.id || "card", symbol: "XAUUSD", folds, customModules: cmods });

  // trigger THẬT của card = built-in (chuỗi module) HOẶC custom L5 role=TRIGGER. Engine (realisticStrategySim) dùng
  // đúng logic này để chặn EMA-default; ablation phải ĐỒNG BỘ, nếu không cảnh báo/verdict sai với card dùng custom trigger.
  const anyTrigger = (ids: string[]) => hasNativeTrigger(ids) || cmods.some((m) => m.role === "TRIGGER" && ids.includes(m.id));
  const base = oosOf(designBars, mods, mods.includes("auto_rr"), ctx(mods));
  const baselineHasEdge = base.oosR > 0 && base.posFrac >= 0.5;
  const baselineHasTrigger = anyTrigger(mods);
  const ablatable = mods.filter((m) => !NON_ABLATABLE.has(m));
  const rows: AblationRow[] = ablatable.map((mi) => {
    const without = mods.filter((x) => x !== mi);
    const w = oosOf(designBars, without, without.includes("auto_rr"), ctx(without));
    const deltaR = +(base.oosR - w.oosR).toFixed(2);                         // base − without = mi's contribution
    const sig = Math.abs(deltaR) > Math.max(2, 0.05 * Math.abs(base.oosR));
    // trigger-collapse: removing this module kills (nearly) all entries → it's the setup creator, NOT "harmful".
    const collapsed = base.trades > 0 && w.trades <= Math.max(0, Math.floor(base.trades * 0.02));
    // sole-trigger: the card HAD a trigger but removing this one leaves none → "without" is the engine's default
    // EMA-cross fallback (a DIFFERENT strategy), so Δ is NOT a faithful contribution. Can't ablate the only trigger.
    const soleTrigger = baselineHasTrigger && !anyTrigger(without);
    const verdict: AblationVerdict = collapsed ? "CORE_TRIGGER" : soleTrigger ? "SOLE_TRIGGER" : !sig ? "NEUTRAL" : deltaR > 0 ? "HELPS" : "HURTS";
    return { id: mi, withoutOosR: w.oosR, deltaR, withoutPosFrac: w.posFrac, withoutTrades: w.trades, verdict, soleTrigger };
  }).sort((a, b) => b.deltaR - a.deltaR);

  const note = "Leave-one-out trên NET OOS (walk-forward " + folds + " fold). Δ = baseline − bỏ-module. "
    + "HELPS = bỏ thì tệ hơn (có ích); HURTS = bỏ thì tốt hơn (hại); NEUTRAL = decorative; "
    + "CORE_TRIGGER = bỏ thì card gần như KHÔNG còn lệnh (module tạo setup — KHÔNG phải 'hại'). "
    + "SOLE_TRIGGER = đây là trigger DUY NHẤT — bỏ nó thì engine chạy chiến lược MẶC ĐỊNH (EMA cross) khác hẳn, nên số 'nếu bỏ' KHÔNG phải 'card thiếu module' và Δ KHÔNG đo được; cần card có ≥2 trigger để so. "
    + "⚠ Δ KHÔNG cộng tuyến-tính — bỏ nhiều module cùng lúc PHẢI re-run walk-forward (module có tương-tác). Modeled — không phải lời-hứa lời."
    + (baselineHasEdge ? "" : " ⚠ Baseline KHÔNG có edge (OOS≤0 hoặc <50% fold dương) → 'đóng-góp' chỉ là BỚT-THUA, không đáng tin để promote.")
    + (baselineHasTrigger ? "" : " ⚠ Card KHÔNG có module trigger → baseline đang chạy chiến lược MẶC ĐỊNH EMA cross, không phải setup riêng của card.");

  return {
    designTf, folds, baselineOosR: base.oosR, baselinePosFrac: base.posFrac, baselineTrades: base.trades, baselineHasEdge, baselineHasTrigger,
    rows, ablatable: ablatable.length, note,
  };
}
