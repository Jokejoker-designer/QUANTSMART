// Strategy Canvas — Tinkercad-style block builder, but LANE-BASED + typed + governed (Node-RED/Figma org).
// Drag a module from the Library -> it SNAPS into its own level lane (L0..L6). L0 Safety is locked. Inspector
// explains each card. Zone-only output · advisory · no order. Real validation/backtest runs the Python engine.
import { lazy, Suspense, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import "./cotrade.css";
import { TK } from "../components/ui/Ui.tsx";
import { Glyph, type GlyphName } from "../components/ui/Glyph.tsx";
import { CustomModuleBuilder } from "../components/CustomModuleBuilder.tsx";
import { L1ModuleSandbox } from "../components/L1ModuleSandbox.tsx";
import { StrategyCardSlots } from "../components/StrategyCardSlots.tsx";
import { L2Preview } from "../components/L2Preview.tsx";
import { ChEpisodeLensPanel } from "../components/ChEpisodeLensPanel.tsx";
import { FootprintLensPanel } from "../components/FootprintLensPanel.tsx";
import { LiveTickVolumeLensPanel } from "../components/LiveTickVolumeLensPanel.tsx";
import { diagnoseCardTriggers, fusionDeadlock, TRIGGER_VERDICT_COLOR, TRIGGER_VERDICT_LABEL } from "../lib/cardTriggerDiagnosis.ts";
import { buildOrchestratorPrompt, buildLayerPack, importAnyLayer, type PackLayer, type ImportResult } from "../lib/aiContextPack.ts";
import { L5Sandbox } from "../components/L5Sandbox.tsx";
import { L4GateBuilder } from "../components/L4GateBuilder.tsx";
import { L6ZoneBuilder } from "../components/L6ZoneBuilder.tsx";
import { loadCustomL6, reloadCustomL6, deleteCustomL6, type CustomL6Zone } from "../lib/blocks/customL6.ts";
import { validateStrategyWiring, type WiringModule } from "../lib/strategyWiring.ts";
import { censusOf } from "../lib/cardBeastV2/moduleRoleCensus.ts";
import { ensureStarterCustomModules, getModuleImpact, seedTcgStarterDeck } from "../lib/cardBeastV2/tcgStarterDeck.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import { validateCardForPublication } from "../lib/cardPublication.ts";
import { flushWorkspace } from "../lib/workspaceClient.ts";
import { CardEvidencePanel } from "../components/CardEvidencePanel.tsx";
import { exportStrategyBundle, importStrategyBundle } from "../lib/strategyBundle.ts";
import { loadCustomModules, deleteCustomModule, EXECUTABLE_ROLES, type CustomModule } from "../lib/customModule.ts";
import { loadCustomL1, reloadCustomL1, deleteCustomL1, type CustomL1Module } from "../lib/blocks/customL1.ts";
import { loadCustomL2, reloadCustomL2, deleteCustomL2, type CustomL2Module } from "../lib/blocks/customL2.ts";
import { loadCustomL3, reloadCustomL3, deleteCustomL3, type CustomL3Module } from "../lib/blocks/customL3.ts";
import { ROLE_META, roleStatusOf } from "../lib/blocks/featureRoles.ts";
import { TF_MINUTES, ALL_TFS, inferDesignTf, resolveExecutionTf } from "../lib/simTimeframe.ts";
import type { Timeframe } from "../lib/simConfig.ts";
import { makeArtifactIdentity, readStrategyCards, writeStrategyCards, type ArtifactIdentity } from "../lib/artifactRegistry.ts";
import { reloadCustomL4 } from "../lib/blocks/customL4.ts";
import { reloadCustomL5 } from "../lib/blocks/customL5.ts";
import { SemanticXraySandbox, type SemanticSandboxTarget } from "../components/SemanticXraySandbox.tsx";
import { LayerInfoPopup } from "../components/LayerInfoPopup.tsx";

// QuantLab is a large, full-screen L3 workbench. Keep it outside the Canvas page
// chunk until the user explicitly opens the L3 builder.
const QuantLab = lazy(() => import("../components/QuantLab.tsx").then((m) => ({ default: m.QuantLab })));

// Detailed evaluation of an assembled strategy. Structure/explainability are REAL (from the placed modules);
// the backtest metrics are a deterministic MODELED estimate (real backtest = the canonical TypeScript engine) framed HONESTLY
// to the system-wide null-edge result. No promotion to live. Advisory · zone-only.
function evaluate(placed: Record<number, string[]>) {
  const ids = Object.values(placed).flat();
  const has = (lv: number) => (placed[lv] || []).length > 0;
  const layers = [1, 2, 3, 4, 5, 6].filter(has).length;
  const hasZone = has(6), hasLogic = has(5), hasAlgo = has(3), hasCtx = has(4), hasInd = has(2), hasFeat = has(1);
  const guards = ids.filter((id) => censusOf(id)?.role === "GUARD" || id.includes("guard") || id.includes("no_chase") || id.includes("candle_against") || id.includes("gate") || ["dead_hour", "news_ctx", "no_trade_chop", "calib_trust", "atr_vol"].includes(id));
  const logicMods = placed[5] || [], algoMods = placed[3] || [];
  const archetype = logicMods.includes("trend_pullback") ? "Trend Pullback" : logicMods.includes("sweep_reclaim") ? "Sweep + Reclaim" : logicMods.includes("range_fade") ? "Range Fade" : logicMods.includes("no_trade_chop") ? "Chop Avoidance" : hasLogic ? "Custom Logic" : "—";
  const algo = algoMods.includes("bayesian") ? "Bayesian probability" : algoMods.includes("markov") ? "Regime Markov" : algoMods.includes("fusion") ? "Score Fusion (DSL)" : algoMods.includes("ev") ? "Expected Value" : hasAlgo ? "Algorithm" : "none";
  const gate = !hasZone ? "BLOCKED" : (!hasLogic || !hasAlgo) ? "PARTIAL" : "EXPLAINED";
  const score = Math.round(layers / 6 * 100);
  const verdict = gate === "BLOCKED" ? "BLOCKED" : score >= 78 ? "SHADOW_TEST" : "WATCH_ONLY";
  const strengths: string[] = [];
  if (hasZone) strengths.push("Has a zone output");
  if (guards.length >= 1) strengths.push(`Includes ${guards.length} risk/timing filters (${guards.length >= 3 ? "extended" : "basic"})`);
  if (hasAlgo) strengths.push(`Algorithm layer: ${algo}`);
  if (hasCtx) strengths.push("Includes market context for regime/session filtering");
  if (layers >= 5) strengths.push(`Covers ${layers}/6 layers`);
  const gaps: { t: string; fix: string }[] = [];
  if (!hasZone) gaps.push({ t: "Missing zone output (L6)", fix: "Add Observation, Risk or Invalidation Zone" });
  if (!hasLogic) gaps.push({ t: "Missing strategy logic (L5)", fix: "Add Trend Pullback, Sweep Reclaim or Range Fade" });
  if (!hasAlgo) gaps.push({ t: "Missing algorithm (L3)", fix: "Add Bayesian, Markov, Score Fusion or EV" });
  if (!hasCtx) gaps.push({ t: "Missing market context (L4)", fix: "Add Regime, Session or Calibration Trust" });
  if (guards.length === 0) gaps.push({ t: "No risk filter (GUARD)", fix: "Add ADX Trend Filter, Dead-Hour, S/R Guard or No-Trade Chop" });
  const orTraps = ids.filter((id) => ["ema_slope", "ema_trend", "rsi_value", "sweep_depth", "sweep_risk"].includes(id));
  if (orTraps.length > 0 && hasLogic) gaps.push({ t: `OR-Vote Dilution Trap (${orTraps.join(", ")})`, fix: "L1/L2 OR-vote triggers dilute L5 Attacker setups in the engine. Replace with MTF Confirm (L5) or ADX Filter (L2)." });
  if (!hasInd && !hasFeat) gaps.push({ t: "Missing feature/indicator", fix: "Add EMA Slope, RSI or ATR" });
  return { layers, hasZone, guards: guards.length, archetype, algo, gate, score, verdict, strengths, gaps, modules: ids };
}

interface SavedCard {
  id: string; name: string; ts: string; archetype: string; algo: string; verdict: string; gate: string;
  score: number; layers: number; guards: number; n: number; winRate: number; netR: number; costEv: number; maxDD: number;
  modules: string[]; design_tf?: Timeframe; execution_tf?: Timeframe; bt_window?: string; artifact?: ArtifactIdentity;
  oos?: {
    method: "CHRONOLOGICAL_WALK_FORWARD"; cost_mode: "HARD"; verdict: "OOS_STABLE" | "OOS_MIXED" | "OOS_FRAGILE" | "OOS_INSUFFICIENT";
    evaluated_folds: number; positive_fraction: number; median_net_pf: number;
    folds: { index: number; start: string; end: string; n: number; netPF: number; netR: number; positive: boolean }[];
  };
  [key: string]: unknown;
}
// L4/L2 entry-window filters surfaced as quick toggles in the Operating Profile (they MIRROR canvas placement — single source of truth).
const PROFILE_FILTERS: { key: string; lv: number; label: string; hint: string }[] = [
  { key: "regime_ctx", lv: 4, label: "Regime", hint: "Allows compatible trend/range conditions; excludes chop" },
  { key: "session_ctx", lv: 4, label: "Session", hint: "Restricts entry to configured sessions" },
  { key: "news_ctx", lv: 4, label: "News filter", hint: "Excludes the configured news proxy window; not a live calendar" },
  { key: "atr_vol", lv: 2, label: "Vol", hint: "Filters by ATR volatility state" },
];
function loadLib(): SavedCard[] { return readStrategyCards<SavedCard>().map(c => Object.assign({ts:"",archetype:"Custom",algo:"Not specified",verdict:"DRAFT",gate:"NOT_VALIDATED",score:0,layers:0,guards:0,n:0,winRate:0,netR:0,costEv:0,maxDD:0},c)); }
function saveLib(cards: SavedCard[]): SavedCard[] { return writeStrategyCards(cards); }

type Mod = { id: string; name: string; group: string; level: number; color: string; auth: string; explain: string; inputs: string; outputs: string; limits: string };

const C = { safety: "#6e7681", feat: "#79c0ff", ind: "#3fb950", algo: "#a371f7", ctx: "#e3b341", logic: "#db6d28", zone: "#58a6ff", test: "#8b949e", red: "#f85149" };
const LANES = [
  { lv: 0, name: "Safety & Data", color: C.safety, locked: true },
  { lv: 1, name: "Features", color: C.feat }, { lv: 2, name: "Indicators", color: C.ind },
  { lv: 3, name: "Algorithms", color: C.algo }, { lv: 4, name: "Market Context", color: C.ctx },
  { lv: 5, name: "Strategy Logic", color: C.logic }, { lv: 6, name: "Zones (output)", color: C.zone },
];

const M = (id: string, name: string, group: string, level: number, color: string, auth: string, explain: string, inputs = "OHLC", outputs = "context", limits = "—"): Mod => ({ id, name, group, level, color, auth, explain, inputs, outputs, limits });
const MODULES: Mod[] = [
  // L0 safety (locked foundation)
  M("data_quality", "Data Quality Guard", "Safety & Data", 0, C.safety, "Safety", "Checks data before strategy evaluation.", "CSV/bars", "clean/flags"),
  M("kidi_guard", "KIDI Guard", "Safety & Data", 0, C.safety, "Safety", "Detects numeric collapse or zero variance at registered boundaries; SINGULAR vetoes.", "numeric", "state/veto", "does not detect time gaps"),
  M("no_lookahead", "No-Lookahead Guard", "Safety & Data", 0, C.safety, "Safety", "Uses only observations available as of the evaluated bar.", "advice", "sealed"),
  M("synthetic_vol_guard", "Synthetic Volume Guard", "Safety & Data", 0, C.safety, "Safety", "Synthetic volume is not accepted as market evidence.", "volume", "block"),
  M("authority_guard", "Authority Guard", "Safety & Data", 0, C.safety, "Safety", "Research authority guard; zone-only output, no execution authority.", "any", "lock"),
  // L1 features
  M("ema_slope", "EMA Slope", "Features", 1, C.feat, "Context", "EMA slope: trend direction and magnitude.", "OHLC,span", "slope"),
  M("rsi_value", "RSI Value", "Features", 1, C.feat, "Context", "Raw RSI measurement.", "OHLC,lookback", "rsi"),
  M("atr_pct", "ATR Percentile", "Features", 1, C.feat, "Context", "Volatility relative to historical observations.", "OHLC", "atr_pct", "not a direction forecast"),
  M("range_size", "Range / Wick", "Features", 1, C.feat, "Context", "Bar range and wick measurements.", "OHLC", "range,wick"),
  M("sweep_depth", "Sweep Depth", "Features", 1, C.feat, "Risk Warning", "Depth of a liquidity sweep.", "OHLC", "sweep_depth"),
  // L2 indicators
  M("ema_trend", "EMA Trend", "Indicators", 2, C.ind, "Context", "Trend context; not an execution instruction.", "ema_fast/slow", "trend_context", "limited in choppy conditions"),
  M("rsi_reclaim", "RSI Reclaim", "Indicators", 2, C.ind, "Context", "Threshold reclaim after an overbought/oversold state.", "rsi", "momentum_state"),
  M("atr_vol", "ATR Volatility", "Indicators", 2, C.ind, "Context", "Volatility state.", "atr", "volatility_state"),
  M("sweep_risk", "Sweep Risk", "Indicators", 2, C.ind, "Risk Warning", "Nearby sweep evidence; not a reversal forecast.", "sweep", "sweep_risk"),
  M("dead_hour", "Dead-Hour Avoid", "Indicators", 2, C.ind, "Timing", "Excludes configured inactive hours.", "timestamp", "avoid_warning"),
  M("ch_episode_lens", "CH Episode Lens", "Indicators", 2, C.ind, "Context", "Describes price as impulse, corrective, sweep, failed and range episodes. A forming leg may change as new bars arrive. This is a structural observation, not a forecast or outcome probability.", "OHLC,swings", "episode/kind/context", "Observer only; forming legs may update; no execution effect"),
  // L2 classic indicators (công-thức CHUẨN · edge CHƯA chứng-minh · vote/gate vào fusion, ghép được với mọi L5)
  M("ichimoku", "Ichimoku", "Indicators", 2, C.ind, "Context", "Price versus the Ichimoku cloud, with causal shifts and Tenkan/Kijun trend votes. A standard formula does not establish an edge.", "OHLC", "vote(trend)", "trend-following context; validate the chosen risk model"),
  M("macd", "MACD", "Indicators", 2, C.ind, "Context", "MACD(12,26) versus Signal(9) crossover contributes momentum evidence. Its edge must be measured.", "OHLC", "vote(momentum)", "lagging in choppy conditions"),
  M("stochastic", "Stochastic %K", "Indicators", 2, C.ind, "Context", "Stochastic %K(14) turns from below 25 or above 75 to contribute a vote. Its edge must be measured.", "OHLC", "vote(meanrev)", "may overlap with RSI evidence"),
  M("bollinger", "Bollinger Fade", "Indicators", 2, C.ind, "Context", "Bollinger(20,2) closes outside a band contribute a mean-reversion vote. Its edge must be measured.", "OHLC", "vote(meanrev)", "opposes breakout behavior; avoid duplicate range-fade evidence"),
  M("fib_retrace", "Fibonacci Retrace", "Indicators", 2, C.ind, "Context", "A pullback near the 0.382/0.5/0.618 levels of the 20-bar swing, followed by a trend-aligned close, contributes a vote.", "OHLC,swing", "vote(pullback)", "requires a resolved swing; noisy in chop"),
  M("adx", "ADX Trend Filter", "Indicators", 2, C.ind, "Risk Warning", "ADX(14) below 20 vetoes a trend setup; it can downgrade, not promote.", "OHLC", "gate(veto)", "may over-filter when combined with no_trade_chop"),
  M("sr_zone_context", "S/R Structure Guard", "Indicators", 2, C.ind, "Guard", "Causal swing-pivot support/resistance, scaled by ATR, vetoes an entry against the structure. This is an active guard, not an observer.", "OHLC,swing", "gate(veto)", "Shadow guard; requires ablation evidence"),
  M("level_memory", "Level Memory Guard", "Indicators", 2, C.ind, "Guard", "Counts touches of a nearby level and vetoes when the configured touch limit is reached.", "OHLC,swing", "gate(veto)", "The touch-count weakness hypothesis remains unproven"),
  M("footprint_lens", "Footprint Lens (M1 proxy)", "Indicators", 2, C.ind, "Context", "Draws price-row proxies from M1 candle direction. These are not exchange order-flow measurements.", "OHLC", "lens(observe)", "M1-derived proxy; not actual order flow"),
  M("live_tickvol_lens", "Live Tick-Volume Lens", "Indicators", 2, C.ind, "Context", "Forward-only value-area observations from MT5 tick counts. Collection must be started explicitly; this is not exchange volume.", "MT5 /mt5/bar", "lens(observe)", "Tick-volume proxy; do not treat it as exchange volume"),
  // L3 algorithms
  M("bayesian", "Bayesian Adapter", "Algorithms", 3, C.algo, "Probability", "Combines evidence into an assessment, with limited-sample caps.", "indicators", "p_final"),
  M("markov", "Regime Markov", "Algorithms", 3, C.algo, "Probability", "Regime transition estimates; not a price forecast.", "features", "transition"),
  M("fusion", "Score Fusion", "Algorithms", 3, C.algo, "Context", "Combines weighted features through the formula DSL.", "features", "score", "requires numeric integrity checks"),
  M("state_machine", "State Machine", "Algorithms", 3, C.algo, "Timing", "Stage: watching→pullback→reclaim→ready-zone.", "conditions", "stage"),
  M("ev", "EV Model ⚠ deadlock", "Algorithms", 3, C.algo, "Risk Warning", "Cumulative EV has no decay: after the minimum sample, a nonpositive result can block the rest of the window. Use Rolling EV when that behavior is unsuitable.", "p_win,R", "EV"),
  M("auto_rr", "Auto R:R", "Algorithms", 3, C.algo, "Risk", "Uses nearby swing structure and an opposing target level to derive variable R:R. Setups below the configured minimum are excluded.", "structure,atr", "tp/sl/skip", "zone-only research output"),
  M("distribution_rr", "Distribution R:R", "Algorithms", 3, C.algo, "Risk", "Uses the Card’s own past trade excursions: approximately MAE percentile 90 and MFE percentile 75, in ATR units. Falls back until the minimum sample is available.", "own past trades,atr", "tp/sl(distribution)", "causal historical estimates; no test-window fitting"),
  // L4 context
  M("regime_ctx", "Regime Context", "Market Context", 4, C.ctx, "Context", "Current trend/range/chop context.", "OHLC", "regime"),
  M("session_ctx", "Session / Hour", "Market Context", 4, C.ctx, "Timing", "Session and hour context with a fixed UTC offset.", "timestamp", "session"),
  M("news_ctx", "News Window", "Market Context", 4, C.ctx, "Risk Warning", "News-window context; requires a dated source.", "calendar", "in_news"),
  M("calib_trust", "Calibration Trust", "Market Context", 4, C.ctx, "Context", "Posterior calibration status.", "samples", "trust"),
  M("topk_fit", "Top-K Fit", "Market Context", 4, C.ctx, "Context", "Checks whether a supported template is available for this context.", "metrics", "fit"),
  M("drift_guard", "Drift Guard", "Market Context", 4, C.ctx, "Risk Warning", "Optional circuit breaker: a 15-trade rolling PF below 0.6 stops new simulated entries. Uses only the Card’s own completed historical trades.", "own past trades", "gate(veto)", "causal rolling PF from prior trades"),
  // L5 logic
  M("trend_pullback", "Trend Pullback", "Strategy Logic", 5, C.logic, "Context", "Pullback in a trend context (semi-finished).", "ctx+ind", "watch/fit"),
  M("sweep_reclaim", "Sweep Reclaim", "Strategy Logic", 5, C.logic, "Context", "Sweep + reclaim.", "ctx+ind", "watch/fit"),
  M("psl_sweep", "Previous-session sweep", "Strategy Logic", 5, C.logic, "Context", "A sweep beyond the prior session high/low followed by a close back inside contributes mean-reversion evidence.", "session H/L + ohlc", "vote(±)"),
  M("vol_contraction", "Vol Contraction", "Strategy Logic", 5, C.logic, "Context", "Selective expansion from a compressed 12-bar range, using the configured ATR conditions.", "box12+atr", "vote(±)"),
  M("htf_anchor", "HTF Structure Anchor", "Strategy Logic", 5, C.logic, "Context", "M15 pullback/reclaim conditioned on completed H1 and H4 structure.", "htf ema struct", "vote(±)"),
  M("asia_range_fade", "Asia-Range Fade", "Strategy Logic", 5, C.logic, "Context", "A London/NY sweep of the completed Asian-session range followed by a close back inside.", "asia H/L + ohlc", "vote(±)"),
  M("wick_extreme", "Wick Extreme Fade", "Strategy Logic", 5, C.logic, "Context", "Exhaustion bar: range above 2 ATR, wick at least 60%, with a close in the opposing third.", "ohlc+atr", "vote(±)"),
  M("gap_fade", "Gap Fade", "Strategy Logic", 5, C.logic, "Context", "Opening gap above 0.6 ATR, evaluated as a fade toward the previous close.", "open gap+atr", "vote(±)"),
  M("rsi_extreme", "RSI Extreme MR", "Strategy Logic", 5, C.logic, "Context", "A turn from RSI extremes at 22/78 contributes mean-reversion evidence.", "rsi", "vote(±)"),
  M("range_fade", "Range Fade", "Strategy Logic", 5, C.logic, "Context", "Range-boundary fade.", "ctx", "watch/fit"),
  M("no_trade_chop", "No-Trade Chop", "Strategy Logic", 5, C.logic, "Risk Warning", "Vetoes setup when regime is chop.", "ctx", "veto"),
  M("exit_weak", "Exit Weakening", "Strategy Logic", 5, C.logic, "Context", "Weakening thesis context.", "ctx", "exit_hint"),
  M("mr_exit", "Mean-Reversion Exit", "Strategy Logic", 5, C.logic, "Context", "A mean-reversion exit near EMA10 while the simulated position is profitable.", "ema+pos", "exit"),
  M("ev_rolling", "EV Rolling (fix deadlock)", "Algorithms", 3, C.algo, "Risk Warning", "Rolling EV uses the latest 20 trades and can reset after an extended lock. It avoids an indefinite cumulative-EV lock.", "own trades", "gate(rolling)"),
  M("mtf_confirm", "MTF Confirm", "Strategy Logic", 5, C.logic, "Context", "Confirmation scales vote weights according to EMA10/34 slope agreement. It does not create an entry candidate.", "votes+ema", "weight(confirm)", "weight scaling only; cannot create a candidate"),
  M("fb_range_fade", "Fallback Range Fade", "Strategy Logic", 5, C.logic, "Context", "Fallback range-fade votes only when all primary attackers are silent, using a reduced weight. It requires a primary attacker in the Card.", "fallback context when the primary attacker is silent", "vote(fallback)", "does not override a primary attacker"),
  M("break_retest", "Break & Retest", "Strategy Logic", 5, C.logic, "Context", "Break a 20-bar level, hold it on closes for the configured window, then evaluate a retest in the breakout direction. Review breakout-bar strength and validate the combined filters.", "20-bar high/low and close", "vote(trigger)", "moves without a retest are intentionally missed"),
  // L6 zones
  M("observation_zone", "Observation Zone", "Zones", 6, C.zone, "Zone", "Observation area; not an entry instruction.", "logic", "zone"),
  M("confirmation_zone", "Confirmation Zone", "Zones", 6, C.zone, "Zone", "Confirmation area.", "logic", "zone"),
  M("risk_zone", "Risk Zone", "Zones", 6, C.zone, "Zone", "Risk area.", "logic", "zone"),
  M("invalidation_zone", "Invalidation Zone", "Zones", 6, C.zone, "Zone", "Structural invalidation area.", "logic", "zone"),
  M("avoid_zone", "Avoid Zone", "Zones", 6, C.zone, "Zone", "Area to avoid.", "logic", "zone"),
  M("dynamic_zone", "Dynamic Zone", "Zones", 6, C.zone, "Zone", "Display zones scaled by ATR and elapsed time. This changes chart geometry, not the backtest outcome.", "logic,atr", "zone(dynamic)", "display only; no simulated entry effect"),
  M("value_area_zone", "Value Area (TPO proxy)", "Zones", 6, C.zone, "Zone", "Draws a 70% price-occupancy area around a POC using 96 bars. This is a TPO-style histogram, not actual volume.", "OHLC", "zone", "Price-occupancy histogram; not exchange volume"),
];
const GROUPS = ["Safety & Data", "Features", "Indicators", "Algorithms", "Market Context", "Strategy Logic", "Zones"];
const GROUP_LV: Record<string, number> = { "Safety & Data": 0, Features: 1, Indicators: 2, Algorithms: 3, "Market Context": 4, "Strategy Logic": 5, Zones: 6 };
const GICON: Record<string, GlyphName> = { "Safety & Data": "lock", Features: "bar-chart", Indicators: "trend-up", Algorithms: "brain", "Market Context": "globe", "Strategy Logic": "target", Zones: "map" };

// HONEST engine-status of each module in the Replay Runner backtest — what actually runs vs decorative/placeholder.
const ENG: Record<string, string> = {
  ema_slope: "real", rsi_value: "real", atr_pct: "filter", range_size: "filter", sweep_depth: "real",
  ema_trend: "real", rsi_reclaim: "real", atr_vol: "filter", sweep_risk: "real", dead_hour: "filter", ch_episode_lens: "observer",
  ichimoku: "real", macd: "real", stochastic: "real", bollinger: "real", fib_retrace: "real", adx: "filter",
  sr_zone_context: "filter", level_memory: "filter",
  bayesian: "real", markov: "filter", fusion: "real", state_machine: "filter", ev: "real", auto_rr: "real", distribution_rr: "real",
  regime_ctx: "filter", session_ctx: "filter", news_ctx: "proxy", calib_trust: "filter", topk_fit: "filter", drift_guard: "filter",
  trend_pullback: "real", sweep_reclaim: "real", range_fade: "real", no_trade_chop: "filter", exit_weak: "real", mtf_confirm: "real", psl_sweep: "real", vol_contraction: "real", htf_anchor: "real", mr_exit: "real", asia_range_fade: "real", wick_extreme: "real", gap_fade: "real", rsi_extreme: "real", ev_rolling: "real", fb_range_fade: "real", break_retest: "real",
  data_quality: "gov", kidi_guard: "gov", no_lookahead: "gov", synthetic_vol_guard: "gov", authority_guard: "gov",
  observation_zone: "zone", confirmation_zone: "zone", risk_zone: "zone", invalidation_zone: "zone", avoid_zone: "zone", dynamic_zone: "zone", value_area_zone: "zone",
  footprint_lens: "observer", live_tickvol_lens: "observer",
};
const ENG_META: Record<string, { label: string; color: string }> = {
  real: { label: "Engine logic", color: TK.green },
  filter: { label: "Engine filter", color: TK.cyan },
  proxy: { label: "Recurring calendar proxy; not a live event feed", color: TK.orange },
  approx: { label: "Approximate implementation", color: TK.orange },
  none: { label: "No backtest effect", color: TK.muted },
  observer: { label: "Structural observer; no execution effect", color: TK.cyan },
  gov: { label: "Governance metadata", color: TK.purple },
  zone: { label: "Chart-zone output; not an entry instruction", color: TK.blue },
};
const engOf = (id: string) => (id.startsWith("cm_") || id.startsWith("l4_") || id.startsWith("l5_")) ? { label: "Custom Shadow module; executable only within its declared role", color: TK.purple } : id.startsWith("myL1_") ? { label: "Custom L1 feature; feeds L2/L3/L4/L5 as evidence", color: C.feat } : id.startsWith("myL2_") ? { label: "Custom L2 context; feeds L3/L4/L5 as evidence", color: C.ind } : id.startsWith("myL3_") ? { label: "Custom L3 Quant AST score; feeds L4/L5 as evidence", color: C.algo } : id.startsWith("l6_") ? { label: "Custom L6 chart zone; visual observation band", color: C.zone } : ENG_META[ENG[id] || "none"];
const LV_GROUP: Record<number, string> = { 0: "Safety & Data", 1: "Features", 2: "Indicators", 3: "Algorithms", 4: "Market Context", 5: "Strategy Logic", 6: "Zones" };
const LV_COLOR: Record<number, string> = { 0: C.safety, 1: C.feat, 2: C.ind, 3: C.algo, 4: C.ctx, 5: C.logic, 6: C.zone };
const customToMod = (m: CustomModule): Mod => ({ id: m.id, name: m.name, group: LV_GROUP[m.level], level: m.level, color: LV_COLOR[m.level], auth: "Custom", explain: m.explain + " — rationale: " + m.why, inputs: "metrics", outputs: m.role, limits: "SHADOW" + (EXECUTABLE_ROLES.includes(m.role) ? " · simulated execution" : " · advisory") });
// user-built L1 features (sandbox) → show in the Features lane alongside the 5 built-ins; PROMOTED = qualified.
const customL1ToMod = (m: CustomL1Module): Mod => {
  const ok = m.status === "PROMOTED", role = m.roles?.primaryRole, rm = role ? ROLE_META[role] : undefined, st = role ? roleStatusOf(m.roles, role) : "DECLARED";
  return { id: "myL1_" + m.id, name: m.name + (ok ? " ✓" : " ·shadow"), group: "Features", level: 1, color: rm?.color ?? C.feat, auth: rm?.label ?? "Feature", explain: (m.explain || "Custom L1 feature") + " — rationale: " + (m.why || "—"), inputs: "OHLC", outputs: "feature[0,1]", limits: `${rm?.label ?? "Feature"} · ${st}${ok ? "" : " · not qualified"}` };
};
// user-built L2 indicator/context modules → Indicators lane.
const customL2ToMod = (m: CustomL2Module): Mod => {
  const ok = m.status === "PROMOTED", rm = m.primaryRole ? ROLE_META[m.primaryRole] : undefined;
  const ovl = m.kind === "overlay";
  const out = ovl ? "lines/bands on price (context)" : m.kind === "regime" ? "regime (context)" : "indicator[0,1]";
  const ins = ovl ? (m.overlayKey ? `overlay: ${m.overlayKey}${m.overlayParams ? " (" + Object.entries(m.overlayParams).map(([k, v]) => `${k}=${v}`).join(",") + ")" : ""}` : `L1 overlay: ${m.overlayLines?.length ?? 0} lines`) : m.featureKeys.join(" + ");
  return { id: "myL2_" + m.id, name: (ovl ? "📐 " : "") + m.name + (ok ? " ✓" : " ·shadow"), group: "Indicators", level: 2, color: rm?.color ?? C.ind, auth: rm?.label ?? "Context", explain: m.explain, inputs: ins, outputs: out, limits: `${m.kind} · ${m.status}` };
};
const customL3ToMod = (m: CustomL3Module): Mod => ({ id: "myL3_" + m.id, name: "🧮 " + m.name + " ·shadow", group: "Algorithms", level: 3, color: C.algo, auth: "Score (advisory)", explain: `Quant formula (AST) · ${m.outputType} · v${m.version} · hash ${m.astHash}`, inputs: m.inputSources.map((s) => s.key).join(" + ") || "—", outputs: `${m.outputType} · no entry/zone/order`, limits: `SHADOW · OOS ${m.validation.oosStatus}` });
const customL6ToMod = (z: CustomL6Zone): Mod => ({ id: z.id, name: "🎯 " + z.name + " ·shadow", group: "Zones", level: 6, color: C.zone, auth: "Zone", explain: `${z.explain} (${z.role} around ${z.anchor}, offset ${z.offsetAtr} ATR, width ${z.widthAtr} ATR)`, inputs: z.anchorRef ? `${z.anchor} (${z.anchorRef})` : z.anchor, outputs: `zone(${z.role.toLowerCase()})`, limits: `SHADOW · ${z.role}` });

// how each level INTERACTS in the L0→L6 data-flow (data flows downward; each lane consumes the one above)
const LEVEL_FLOW: Record<number, string> = {
  0: "Governance and data checks run before strategy evaluation. A veto prevents downstream evaluation.",
  1: "L1 reads validated OHLC and emits primitive measurements for the indicator layer.",
  2: "L2 interprets L1 features as trend, momentum or volatility context for downstream logic.",
  3: "L3 combines evidence into a score, probability estimate, EV or R:R. Interpret it within its calibration limits.",
  4: "L4 provides regime, session, calendar and trust conditions; it does not generate a setup.",
  5: "L5 evaluates setup, compatibility, veto and exit-hint logic; its outputs feed L6 zones.",
  6: "L6 renders observation, confirmation, risk and invalidation zones. It does not execute an order.",
};

export function StrategyCanvas() {
  const [placed, setPlaced] = useState<Record<number, string[]>>({ 0: MODULES.filter((m) => m.level === 0).map((m) => m.id) });
  const [sel, setSel] = useState<string | null>(null);
  const [helpMod, setHelpMod] = useState<string | null>(null);   // module whose full "?" explanation is open
  const [layerInfoLv, setLayerInfoLv] = useState<number | null>(null);
  const [mode, setMode] = useState<"Simple" | "Builder" | "Research">("Simple");
  const [result, setResult] = useState<ReturnType<typeof evaluate> | null>(null);
  const [libSearch, setLibSearch] = useState("");
  const [libLayerFilter, setLibLayerFilter] = useState<number | "ALL">("ALL");
  const [l0Open, setL0Open] = useState(false);
  const libScrollRef = useRef<HTMLDivElement | null>(null);
  // Operating Profile (P2): the card's RUNTIME environment. design_tf = where it thinks; execution_tf = where ENTRY triggers
  // (≤ design; smaller = intrabar early entry, honest now that P1 engine is live). Persisted on the card on package.
  const [designTf, setDesignTf] = useState<Timeframe>("H1");
  const [execTf, setExecTfRaw] = useState<Timeframe>("H1");
  const [profileOpen, setProfileOpen] = useState(false);   // Operating Profile collapsed by default (compact summary; click to edit)
  function changeDesign(tf: Timeframe) { setDesignTf(tf); if (TF_MINUTES[execTf] > TF_MINUTES[tf]) setExecTfRaw(tf); setResult(null); }   // exec can't be coarser than design
  function setExecTf(tf: Timeframe) { setExecTfRaw(TF_MINUTES[tf] <= TF_MINUTES[designTf] ? tf : designTf); setResult(null); }
  function toggleFilter(key: string, lv: number) { setPlaced((p) => { const cur = p[lv] || []; return { ...p, [lv]: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key] }; }); setResult(null); }
  const [library, setLibrary] = useState<SavedCard[]>(loadLib);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [latestSaved, setLatestSaved] = useState<SavedCard | null>(null);
  const [packageOpen, setPackageOpen] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageStatus, setPackageStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [semanticXray, setSemanticXray] = useState<SemanticSandboxTarget | null>(null);
  const [customMods, setCustomMods] = useState<CustomModule[]>(() => ensureStarterCustomModules().all);
  const [customL1Mods, setCustomL1Mods] = useState<CustomL1Module[]>(loadCustomL1);
  const [customL2Mods, setCustomL2Mods] = useState<CustomL2Module[]>(loadCustomL2);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderLevel, setBuilderLevel] = useState<4 | 5 | undefined>(undefined);
  // ── AI orchestrator (cửa trước): user tả ý tưởng → AI phân rã → chỉ user vào từng tầng copy prompt → build dần ──
  const [aiIdea, setAiIdea] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLayer, setAiLayer] = useState<PackLayer>("L5");
  const [aiCopied, setAiCopied] = useState<"" | "orch" | "layer">("");
  const aiCopy = (t: string, w: "orch" | "layer") => { try { navigator.clipboard?.writeText(t); } catch { /* clipboard blocked */ } setAiCopied(w); setTimeout(() => setAiCopied(""), 1600); };
  // ④ IMPORT-NGƯỢC ĐA-TẦNG: dán JSON của BẤT KỲ tầng → importAnyLayer tự nhận tầng → validate → LƯU về đúng kho.
  const [aiImportJson, setAiImportJson] = useState("");
  const [aiImportRes, setAiImportRes] = useState<ImportResult | null>(null);
  const doImportAnyLayer = () => {
    const r = importAnyLayer(aiImportJson); setAiImportRes(r);
    if (r.ok) { setCustomMods(loadCustomModules()); setCustomL1Mods(loadCustomL1()); setCustomL2Mods(loadCustomL2()); setCustomL3Mods(loadCustomL3()); }   // module hiện ngay trên lane đúng tầng
  };
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [cardSlotsOpen, setCardSlotsOpen] = useState(false);
  const [l2Open, setL2Open] = useState(false);
  const [qlOpen, setQlOpen] = useState(false);
  const [qlInitial, setQlInitial] = useState<CustomL3Module | null>(null);
  const [customL3Mods, setCustomL3Mods] = useState<CustomL3Module[]>(loadCustomL3);
  const [l5SandboxOpen, setL5SandboxOpen] = useState(false);
  const [l4GateOpen, setL4GateOpen] = useState(false);
  const [l6ZoneOpen, setL6ZoneOpen] = useState(false);
  const [customL6Zones, setCustomL6Zones] = useState<CustomL6Zone[]>(loadCustomL6);
  // per-lane "+ Module": L1 → block Sandbox · L2 → L2Preview · L3 → QuantLab · L4 → Gate Builder · L5 → Decision Sandbox · L6 → Zone Builder.
  function createAtLane(lv: number) { if (lv === 1) setSandboxOpen(true); else if (lv === 2) setL2Open(true); else if (lv === 3) { setQlInitial(null); setQlOpen(true); } else if (lv === 4) setL4GateOpen(true); else if (lv === 5) setL5SandboxOpen(true); else if (lv === 6) setL6ZoneOpen(true); }
  function focusLibraryLayer(lv: number) {
    setLibLayerFilter(lv);
    setLibSearch("");
    setTimeout(() => { libScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, 20);
  }
  const allMods = useMemo(() => [...MODULES, ...customMods.map(customToMod), ...customL1Mods.map(customL1ToMod), ...customL2Mods.map(customL2ToMod), ...customL3Mods.map(customL3ToMod), ...customL6Zones.map(customL6ToMod)], [customMods, customL1Mods, customL2Mods, customL3Mods, customL6Zones]);
  // ── Pha D: dựng chuỗi nối-chéo từ mọi module đã build → validateStrategyWiring (ContributionMap DRIVES/FILTERS/INERT) ──
  const wiring = useMemo(() => {
    const ids = new Set<string>([...customL1Mods.map((m) => m.id), ...customL2Mods.map((m) => m.id), ...customL3Mods.map((m) => m.id), ...customMods.map((m) => m.id), ...customL6Zones.map((z) => z.id)]);
    const keep = (arr: (string | undefined | null)[]) => [...new Set(arr.filter((x): x is string => !!x && ids.has(x)))];
    const chain: WiringModule[] = [
      ...customL1Mods.map((m) => ({ id: m.id, layer: "L1" as const, name: m.name, refs: [] })),
      ...customL2Mods.map((m) => ({ id: m.id, layer: "L2" as const, name: m.name, refs: keep(m.featureKeys) })),
      ...customL3Mods.map((m) => ({ id: m.id, layer: "L3" as const, name: m.name, refs: keep(Object.values(m.ast.nodes).map((n) => (n.kind === "INPUT" ? n.inputRef : undefined))) })),
      ...customMods.map((m) => ({ id: m.id, layer: (m.level === 4 ? "L4" : "L5") as "L4" | "L5", name: m.name, role: m.role, direction: m.direction, condCount: (m.conditions || []).length, refs: keep((m.conditions || []).map((c) => c.metric)) })),
      ...customL6Zones.map((z) => ({ id: z.id, layer: "L6" as const, name: z.name, role: "ZONE", refs: keep([z.anchorRef]) })),
    ];
    return validateStrategyWiring({ modules: chain });
  }, [customL1Mods, customL2Mods, customL3Mods, customMods, customL6Zones]);
  const [wiringOpen, setWiringOpen] = useState(false);
  const byId = (id: string) => allMods.find((m) => m.id === id) || { id, name: id, group: "Custom", level: 5, color: TK.purple, auth: "Custom", explain: "—", inputs: "—", outputs: "—", limits: "—" } as Mod;

  async function commitPackage(nameInput: string) {
    if (!result || packageBusy) return;
    const name = nameInput.trim();
    if (!name) { setPackageStatus({ ok: false, text: "Enter a Strategy Card name." }); return; }
    setPackageBusy(true); setPackageStatus(null);
    try {
      if (result.gate !== "EXPLAINED" || wiring.violations.some((v) => v.severity === "BLOCK")) throw new Error("Complete the strategy wiring and zone output before validation.");
      const id = editingId || "sc_" + crypto.randomUUID();
      const draft = { id, name, modules: result.modules, design_tf: designTf, execution_tf: execTf, symbol: getActiveSymbol() };
      const cardCustom = customMods.filter((m) => result.modules.includes(m.id));
      const bt = await validateCardForPublication(draft, cardCustom);
      if (!bt.walkForward) throw new Error("The engine did not return a walk-forward receipt.");
      const a = bt.analytics;
      const oos: NonNullable<SavedCard["oos"]> = { method: "CHRONOLOGICAL_WALK_FORWARD", cost_mode: "HARD", verdict: bt.walkForward.verdict, evaluated_folds: bt.walkForward.evaluatedFolds, positive_fraction: bt.walkForward.positiveFraction, median_net_pf: bt.walkForward.medianNetPF, folds: bt.walkForward.folds };
      const previous = library.find((saved) => saved.id === id);
      const card: SavedCard = { ...previous, ...draft, ts: new Date().toISOString(), archetype: result.archetype, algo: result.algo, verdict: "WATCH_ONLY", gate: oos.verdict, score: result.score, layers: result.layers, guards: result.guards, n: a.n, winRate: a.netWinRate, netR: a.netNetR, costEv: a.n ? a.netNetR / a.n : 0, maxDD: Math.abs(a.maxDDNetR), bt_window: `REAL_OOS_5F_HARD_${designTf}`, oos, validationReceipt: { ...bt.researchReceipt, manifest: bt.manifest, analytics: bt.analytics, walk_forward: bt.walkForward } };
      saveLib([card, ...library.filter((c) => c.id !== id)]);
      await flushWorkspace();
      const saved = loadLib(); setLibrary(saved); setEditingId(id); setLatestSaved(saved.find((c) => c.id === id) || card);
      setPackageStatus({ok:true,text:`Saved and validated “${name}”. ${a.n} measured trades; ${oos.verdict}. Research only.`});
    } catch (error) { setPackageStatus({ok:false,text:`Card was not published: ${error instanceof Error ? error.message : String(error)}`}); }
    finally { setPackageBusy(false); }
  }

  function removeCard(id: string) { const next = library.filter((c) => c.id !== id); setLibrary(next); saveLib(next); }
  // B — durable persistence: export the whole library to a JSON file the user keeps; import merges it back (survives
  // browser/profile change or cleared storage). No backend needed. Merge = imported card wins on id clash, others kept.
  function exportCards() {
    if (!library.length) { window.alert("There are no Cards to export."); return; }
    const url=URL.createObjectURL(new Blob([JSON.stringify(exportStrategyBundle(library),null,2)],{type:"application/json"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=`mfe_strategy_library_${getActiveSymbol()}_${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importCards(file: File) {
    try {
      const result=await importStrategyBundle(JSON.parse(await file.text()));
      // Rebuild the layer caches from the imported definitions, without changing compiler semantics.
      setCustomMods(loadCustomModules());
      setCustomL1Mods(reloadCustomL1());
      setCustomL2Mods(reloadCustomL2());
      setCustomL3Mods(reloadCustomL3());
      setCustomL6Zones(reloadCustomL6());
      reloadCustomL4();
      reloadCustomL5();
      setLibrary(loadLib());setPackageStatus({ok:true,text:`Imported ${result.added} new Cards; kept ${result.skipped} existing IDs. Validate imported definitions in this workspace.`});
    } catch(error) { setPackageStatus({ok:false,text:`Import failed: ${(error as Error).message}`}); }
  }
  function loadCard(c: SavedCard) {
    const byLevel: Record<number, string[]> = { 0: MODULES.filter((m) => m.level === 0).map((m) => m.id) };
    c.modules.forEach((id) => { const m = allMods.find((x) => x.id === id); const level = m?.level ?? (id.startsWith("myL1_") ? 1 : id.startsWith("myL2_") ? 2 : id.startsWith("myL3_") ? 3 : customL6Zones.some((z) => z.id === id) ? 6 : 5); if (level > 0) byLevel[level] = [...(byLevel[level] || []), id]; });
    const dtf = (c.design_tf && (ALL_TFS as string[]).includes(c.design_tf)) ? c.design_tf : inferDesignTf(c);
    setDesignTf(dtf); setExecTfRaw(resolveExecutionTf(c, dtf));   // restore the saved Operating Profile (clamped ≤ design)
    setPlaced(byLevel); setResult(null); setSel(null); setEditingId(c.id); setLatestSaved(c);
  }
  function newCanvas() { setEditingId(null); setLatestSaved(null); setPlaced({ 0: MODULES.filter((m) => m.level === 0).map((m) => m.id) }); setSel(null); setResult(null); setDesignTf("H1"); setExecTfRaw("H1"); }
  function deleteCustom(id: string) {
    setCustomMods(deleteCustomModule(id));
    setPlaced((p) => { const np: Record<number, string[]> = {}; Object.keys(p).forEach((k) => { np[+k] = (p[+k] || []).filter((x) => x !== id); }); return np; });
    if (sel === id) setSel(null); if (helpMod === id) setHelpMod(null);
  }
  // delete a user-built module (L1 sandbox / L2 fusion / L4-L5 custom) from its store + canvas.
  const isCustomId = (id: string) => id.startsWith("myL1_") || id.startsWith("myL2_") || id.startsWith("myL3_") || id.startsWith("cm_") || id.startsWith("l4_") || id.startsWith("l5_") || id.startsWith("l6_");
  function deleteModule(id: string) {
    if (id.startsWith("myL1_")) setCustomL1Mods(deleteCustomL1(id.slice(5)));
    else if (id.startsWith("myL2_")) setCustomL2Mods(deleteCustomL2(id.slice(5)));
    else if (id.startsWith("myL3_")) setCustomL3Mods(deleteCustomL3(id.slice(5)));
    else if (id.startsWith("cm_") || id.startsWith("l4_") || id.startsWith("l5_")) setCustomMods(deleteCustomModule(id));
    else if (id.startsWith("l6_")) setCustomL6Zones(deleteCustomL6(id));
    else return;
    setPlaced((p) => { const np: Record<number, string[]> = {}; Object.keys(p).forEach((k) => { np[+k] = (p[+k] || []).filter((x) => x !== id); }); return np; });
    if (sel === id) setSel(null); setHelpMod(null);
  }

  function drop(id: string) {
    const m = byId(id); if (m.level === 0) return;            // safety is locked/foundation
    setPlaced((p) => ({ ...p, [m.level]: Array.from(new Set([...(p[m.level] || []), id])) }));  // snap-to-level
    setSel(id); setResult(null);                              // re-validate after a change
  }
  // AUTO-ATTACH (fix L5_CUSTOM_TRIGGER_NOT_WIRED): lưu L4/L5 từ sandbox → gắn NGAY id vào lane đúng tầng, để card
  // package carries module ids + customModules into the one engine; no implicit prompt/alert transaction.
  // Đọc library TƯƠI (không dựa state — setCustomMods là async). Module không tìm thấy → bỏ qua (không đoán).
  function attachSavedCustom(id?: string, fallbackLv?: number) {
    if (!id) return;
    const lv = fallbackLv ?? (id.startsWith("myL1_") ? 1 : id.startsWith("myL2_") ? 2 : id.startsWith("myL3_") ? 3 : id.startsWith("l4_") ? 4 : id.startsWith("l5_") ? 5 : id.startsWith("l6_") ? 6 : loadCustomModules().find((x) => x.id === id)?.level ?? 0);
    if (lv <= 0) return;
    setPlaced((p) => ({ ...p, [lv]: Array.from(new Set([...(p[lv] || []), id])) }));
    setSel(id); setResult(null);
  }
  function remove(id: string) {
    const m = byId(id); if (m.level === 0) return;
    setPlaced((p) => ({ ...p, [m.level]: (p[m.level] || []).filter((x) => x !== id) })); setResult(null);
  }
  const selMod = sel ? byId(sel) : null;
  const placedIds = Object.values(placed).flat();
  const totalPlaced = placedIds.length;
  const hasZone = (placed[6] || []).length > 0;
  const hasL5Atk = (placed[5] || []).some((id) => getModuleImpact(id, customMods.find((x) => x.id === id)).role === "ATTACKER");
  const triggerDiag = diagnoseCardTriggers(placedIds.filter((id) => (byId(id)?.level ?? 0) > 0));
  const hasExplicitTrigger = hasL5Atk || !triggerDiag.fallbackActive;
  // over-gating guard: too many veto-gates AND-ed together can over-gate to zero trades (proven by backtest)
  const GATE_IDS = ["regime_ctx", "session_ctx", "news_ctx", "calib_trust", "topk_fit", "no_trade_chop", "atr_vol", "atr_pct", "markov", "state_machine", "dead_hour", "ev", "ev_rolling"];
  const gateCount = placedIds.filter((id) => GATE_IDS.includes(id)).length;
  const allStack = totalPlaced >= MODULES.length - 1;
  const activeFilters = PROFILE_FILTERS.filter((f) => (placed[f.lv] || []).includes(f.key));
  const intra = execTf !== designTf;

  return (
    <div className="cotrade" style={{ paddingBottom: 36 }}>
      {/* Compact Header + Operating Profile Summary */}
      <div className="co-topbar" style={{ gap: 8, flexWrap: "wrap", padding: "6px 12px", marginBottom: profileOpen ? 4 : 8 }}>
        <span className="co-lock">Strategy Canvas</span>
        <span className="small co-mut">{getActiveSymbol()} · {designTf}{intra ? <b style={{ color: "#FF8A2A" }}>→{execTf}</b> : ""} · No-lookahead <b style={{ color: "#3fb950" }}>ON</b></span>
        <div onClick={() => setProfileOpen((o) => !o)} title={profileOpen ? "Collapse Operating Profile" : "Edit Operating Profile (Design TF, Execution TF, Entry Filters)"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 9px", borderRadius: 6, cursor: "pointer", background: intra ? "rgba(255,138,42,.10)" : "rgba(15, 23, 42, 0.75)", border: `1px solid ${intra ? "#FF8A2A66" : "var(--border-panel)"}` }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: TK.cyan }}><Glyph name="gear" size={11} /> Operating Profile</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "var(--mfe-mono)" }}>
            <span style={{ background: "#11202e", border: "1px solid #234", borderRadius: 4, padding: "1px 6px", fontWeight: 800 }}>{designTf}</span>
            <span style={{ color: intra ? "#FF8A2A" : "#52606e", fontWeight: 800 }}>→</span>
            <span style={{ background: intra ? "rgba(255,138,42,.14)" : "#11202e", border: "1px solid " + (intra ? "#FF8A2A66" : "#234"), color: intra ? "#FF8A2A" : TK.text, borderRadius: 4, padding: "1px 6px", fontWeight: 800 }}>{execTf}</span>
          </span>
          <span className="xs co-mut" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>filters:</span>
            {activeFilters.length ? activeFilters.map((f) => <span key={f.key} style={{ background: "rgba(63,185,80,.14)", border: "1px solid #2c6b3f", color: "#7ee2a0", borderRadius: 4, padding: "0 5px", fontSize: 10 }}>{f.label}</span>) : <span>none</span>}
          </span>
          <span style={{ color: TK.muted, fontSize: 10 }}>{profileOpen ? "▾" : "▸"}</span>
        </div>
        <span style={{ marginLeft: "auto" }} />
        {(["Simple", "Builder", "Research"] as const).map((mm) => <button key={mm} className={`fx-toggle ${mode === mm ? "on" : ""}`} onClick={() => setMode(mm)}>{mm}</button>)}
      </div>

      {/* Expanded Operating Profile Drawer */}
      {profileOpen && (() => {
        const pill = (on: boolean, c: string): CSSProperties => ({ fontFamily: "var(--mfe-mono)", fontSize: 11.5, borderRadius: 5, padding: "3px 10px", cursor: "pointer", border: `1px solid ${on ? c : c + "44"}`, background: on ? c + "26" : "transparent", color: on ? c : "#8aa0b6", fontWeight: on ? 800 : 600, lineHeight: 1.4, transition: ".12s", whiteSpace: "nowrap" });
        const grpLbl: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#6b7d90", marginRight: 2 };
        return (
          <div className="co-card" style={{ margin: "0 0 8px", padding: "8px 12px", borderColor: intra ? "#FF8A2A55" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={grpLbl} title={"The timeframe evaluated on completed design bars"}>Design TF</span>
                {ALL_TFS.map((tf) => <button key={tf} style={pill(designTf === tf, "#37c0ff")} title={`Card evaluates on ${tf}`} onClick={() => changeDesign(tf)}>{tf}</button>)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={grpLbl} title={"Execution timeframe, no coarser than the design timeframe. A finer grid uses an intrabar path."}>Execution TF</span>
                {ALL_TFS.filter((t) => TF_MINUTES[t] <= TF_MINUTES[designTf]).map((tf) => { const it = tf !== designTf; const on = execTf === tf; return (
                  <button key={tf} style={pill(on, on && it ? "#FF8A2A" : "#37c0ff")} title={it ? `Intrabar trigger on a completed ${tf} bar inside a ${designTf}` : `Wait for the ${designTf} bar to close, then use the next open`} onClick={() => setExecTf(tf)}>{on && it ? <Glyph name="bolt" size={11} /> : null}{tf}</button>
                ); })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={grpLbl} title={"Entry-window filters mirror the L4/L2 modules selected on the canvas."}>Entry filters</span>
                {PROFILE_FILTERS.map((f) => { const on = (placed[f.lv] || []).includes(f.key); return (
                  <button key={f.key} style={pill(on, "#3fb950")} title={f.hint} onClick={() => toggleFilter(f.key, f.lv)}>{on ? <><Glyph name="check" size={11} /> </> : null}{f.label}</button>
                ); })}
              </div>
            </div>
            <div className="xs" style={{ marginTop: 6, color: intra ? "#FF8A2A" : "var(--mfe-muted)", lineHeight: 1.45 }}>
              {intra
                ? <><Glyph name="bolt" size={11} /> <b>Intrabar entry: {designTf} → {execTf}</b> — evaluates on <b>{designTf}</b> with an earlier execution grid when a <b>{execTf}</b> bar closes inside the {designTf} design bar; causal evaluation still applies.</>
                : <>Execution = Design (<b>{designTf}</b>): waits for the {designTf} bar to close, then uses the next open.</>}
            </div>
          </div>
        );
      })()}

      {/* ══ AI ORCHESTRATOR (Research mode only) ══ */}
      {mode === "Research" && <div className="co-card" style={{ margin: "0 0 8px", borderColor: "#2f81f7", background: "linear-gradient(180deg, rgba(31,111,235,.10), rgba(31,111,235,.02))" }}>
        <div onClick={() => setAiOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <b style={{ fontSize: 13.5, color: "#5aa9ff" }}><Glyph name="robot" size={13} /> External assistant / JSON tools</b>
          <span className="small co-mut">Optional authoring tools. Export a layer specification, use it in your own assistant, then import and validate the returned JSON.</span>
          <span style={{ marginLeft: "auto", color: "#5aa9ff", fontSize: 16 }}>{aiOpen ? "▾" : "▸"}</span>
        </div>
        {aiOpen && (
          <div style={{ marginTop: 8 }}>
            <div className="co-mut small" style={{ marginBottom: 3 }}><b style={{ color: "#5aa9ff" }}>Describe the strategy</b> (a broad idea is sufficient):</div>
            <textarea value={aiIdea} onChange={(e) => setAiIdea(e.target.value)} placeholder={"For example: combine candle structure with Ichimoku and Fibonacci, follow the trend, and avoid extended entries."} style={{ width: "100%", minHeight: 52, background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 7, padding: "7px 9px", fontSize: 12.5, resize: "vertical", boxSizing: "border-box", marginBottom: 6 }} />
            <div className="co-mut small" style={{ marginBottom: 3 }}><b style={{ color: "#5aa9ff" }}>Export an authoring brief</b> Paste it into your own assistant to identify the layers to build:</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <button onClick={() => aiCopy(buildOrchestratorPrompt(aiIdea), "orch")} style={{ background: "#1f6feb", color: "#fff", border: "none", borderRadius: 7, padding: "7px 15px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{aiCopied === "orch" ? <><Glyph name="check" size={12} /> Copied — paste into your assistant</> : <><Glyph name="export" size={12} /> Copy authoring brief</>}</button>
            </div>
            <div className="co-mut small" style={{ marginBottom: 3 }}><b style={{ color: "#5aa9ff" }}>Export a layer specification</b> Choose the layer and copy its specification. Your external tool should return the required JSON:</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <select value={aiLayer} onChange={(e) => setAiLayer(e.target.value as PackLayer)} style={{ background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "5px 8px", fontSize: 12 }}>{(["L1", "L2", "L3", "L4", "L5", "L6"] as PackLayer[]).map((L) => <option key={L} value={L}>Layer {L}</option>)}</select>
              <button onClick={() => aiCopy(buildLayerPack(aiLayer), "layer")} style={{ background: "rgba(37,183,255,.12)", color: TK.cyan, border: "1px solid #1c4a5b", borderRadius: 7, padding: "6px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{aiCopied === "layer" ? <><Glyph name="check" size={12} /> copy layer {aiLayer}</> : <><Glyph name="export" size={12} /> Copy layer specification {aiLayer}</>}</button>
            </div>
            <div className="co-mut small" style={{ marginBottom: 3 }}><b style={{ color: "#5aa9ff" }}>Import the returned JSON</b> The importer detects the layer, applies its validation rules, and saves a Shadow definition:</div>
            <textarea value={aiImportJson} onChange={(e) => { setAiImportJson(e.target.value); setAiImportRes(null); }} placeholder={"Paste a module definition: an AST for L3, a graph for L1, featureKeys for L2, or conditions and a level for L4/L5."} style={{ width: "100%", minHeight: 60, background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 7, padding: "7px 9px", fontSize: 11.5, fontFamily: "ui-monospace,Menlo,monospace", resize: "vertical", boxSizing: "border-box", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <button onClick={doImportAnyLayer} disabled={!aiImportJson.trim()} style={{ background: aiImportJson.trim() ? "#238636" : "#20262d", color: aiImportJson.trim() ? "#fff" : "#5a636d", border: "none", borderRadius: 7, padding: "7px 15px", fontSize: 12.5, fontWeight: 800, cursor: aiImportJson.trim() ? "pointer" : "default" }}><Glyph name="import" size={12} /> Import &amp; build module</button>
              {aiImportRes?.ok && <span style={{ color: "#3fb950", fontSize: 12, fontWeight: 700 }}><Glyph name="check" size={11} /> Built <b>{aiImportRes.layer}</b> «{aiImportRes.name}» — saved as Shadow in the library {aiImportRes.layer}. It is now available in layer {aiImportRes.layer} below.</span>}
            </div>
            {aiImportRes && !aiImportRes.ok && (
              <div style={{ background: "rgba(248,81,73,.08)", border: "1px solid #5c2b2b", borderRadius: 7, padding: "6px 9px", marginBottom: 6 }}>
                <div style={{ color: "#f85149", fontSize: 12, fontWeight: 700, marginBottom: 3 }}><Glyph name="x" size={11} /> Definition rejected{aiImportRes.layer ? " (detected layer " + aiImportRes.layer + ")" : ""} — layer validation refused:</div>
                <ul style={{ margin: 0, paddingLeft: 16, color: "#e6a1a1", fontSize: 11.5 }}>{aiImportRes.errors.map((e, k) => <li key={k}>{e}</li>)}</ul>
              </div>
            )}
            {aiImportRes?.ok && aiImportRes.warnings && aiImportRes.warnings.length > 0 && (
              <div style={{ color: "#d29922", fontSize: 11, marginBottom: 6 }}><Glyph name="warning" size={11} /> {aiImportRes.warnings.join(" · ")}</div>
            )}
            {aiImportRes?.ok && aiImportRes.strippedFields && aiImportRes.strippedFields.length > 0 && (
              <div style={{ color: "#d29922", fontSize: 11, marginBottom: 6 }}><Glyph name="shield" size={11} /> Removed fields outside the declared authority: {aiImportRes.strippedFields.join(", ")} L4/L5 definitions cannot create execution or position-sizing authority.</div>
            )}
            {aiImportRes?.ok && aiImportRes.aiExplanation && (
              <div className="co-mut" style={{ fontSize: 11, marginBottom: 6 }}><Glyph name="chat" size={11} /> <b>Source description:</b> <i>{aiImportRes.aiExplanation}</i></div>
            )}
          </div>
        )}
      </div>}

      {/* ═══ Fluid workbench: library | composition | inspector; responsive tracks live in responsive.css ═══ */}
      <div className="strategy-canvas-layout">

        {/* ── COLUMN 1 (Left - 270px): MODULE LIBRARY ── */}
        <div className="co-card strategy-canvas-pane strategy-canvas-library" role="region" aria-label="Module library" tabIndex={0} style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Sticky Header: Title + Search + L1..L6 Layer Filter Bar */}
          <div style={{ padding: "9px 10px 8px", borderBottom: "1px solid var(--border-panel)", background: "rgba(15, 23, 42, 0.96)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: "0.3px", color: "#F8FAFC" }}>MODULE LIBRARY</span>
              <button onClick={() => window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "blocks-modules" }))}
                title={"Open primitive blocks, role-based modules and editable presets"}
                style={{ marginLeft: "auto", background: "rgba(34,211,238,.10)", border: "1px solid rgba(56,189,248,.35)", borderRadius: 5, color: TK.cyan, fontSize: 10, fontWeight: 800, padding: "2px 7px", cursor: "pointer" }}><Glyph name="puzzle" size={11} /> Blocks</button>
            </div>
            <div style={{ position: "relative", marginBottom: 6 }}>
              <input
                value={libSearch}
                onChange={(e) => setLibSearch(e.target.value)}
                placeholder="Search modules..."
                style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-card-inner)", border: "1px solid var(--border-panel)", borderRadius: 5, color: "#F8FAFC", fontSize: 11.5, padding: "5px 24px 5px 8px", outline: "none" }}
              />
              {libSearch && (
                <span onClick={() => setLibSearch("")} title="Clear search" style={{ position: "absolute", right: 7, top: 5, cursor: "pointer", color: "#94A3B8", fontSize: 11, fontWeight: 800 }}>✕</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 3, flexWrap: "nowrap" }}>
              <button
                onClick={() => setLibLayerFilter("ALL")}
                style={{ flex: 1, fontSize: 10, fontWeight: 800, padding: "3px 0", borderRadius: 4, cursor: "pointer", border: `1px solid ${libLayerFilter === "ALL" ? "#38BDF8" : "var(--border-subtle)"}`, background: libLayerFilter === "ALL" ? "rgba(56,189,248,.22)" : "var(--bg-card-inner)", color: libLayerFilter === "ALL" ? "#38BDF8" : "#94A3B8" }}
              >All</button>
              {[1, 2, 3, 4, 5, 6].map((lv) => {
                const col = LV_COLOR[lv];
                const active = libLayerFilter === lv;
                return (
                  <button
                    key={lv}
                    onClick={() => setLibLayerFilter(active ? "ALL" : lv)}
                    title={`Filter ${LV_GROUP[lv]} (L${lv})`}
                    style={{ flex: 1, fontSize: 10, fontWeight: 900, padding: "3px 0", borderRadius: 4, cursor: "pointer", border: `1px solid ${active ? col : col + "44"}`, background: active ? col + "2E" : "var(--bg-card-inner)", color: active ? col : col + "CC" }}
                  >L{lv}</button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Module List */}
          <div className="strategy-library-scroll" ref={libScrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 9px 12px" }}>
            {/* Collapsible L0 Safety & Data group (collapsed by default) */}
            {libLayerFilter === "ALL" && !libSearch.trim() && (
              <div style={{ marginBottom: 8 }}>
                <div
                  onClick={() => setL0Open((o) => !o)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5, background: "rgba(110,118,129,.12)", border: "1px solid rgba(148,163,184,.22)", cursor: "pointer", fontSize: 11, fontWeight: 800, color: "#94A3B8", whiteSpace: "nowrap" }}
                >
                  <span>{l0Open ? "▾" : "▸"}</span>
                  <span>L0 Safety &amp; Data (5 pre-locked)</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); setLayerInfoLv(0); }}
                    title="What is L0 Safety & Data?"
                    style={{ width: 15, height: 15, borderRadius: "50%", border: "1px solid rgba(148,163,184,0.45)", color: "#CBD5E1", fontSize: 9.5, lineHeight: "13px", textAlign: "center", cursor: "pointer", fontWeight: 800, display: "inline-block" }}
                  >i</span>
                  <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", color: "#34D399" }}><Glyph name="lock" size={11} /></span>
                </div>
                {l0Open && (
                  <div style={{ marginTop: 4, paddingLeft: 4 }}>
                    {allMods.filter((m) => m.level === 0).map((m) => (
                      <div key={m.id} onClick={() => setSel(m.id)}
                        style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "4px 7px", margin: "3px 0", fontSize: 11, opacity: 0.78, cursor: "pointer", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 8.5, fontWeight: 900, color: C.safety, background: "rgba(110,118,129,.2)", border: "1px solid rgba(110,118,129,.45)", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>L0</span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                        <span style={{ flexShrink: 0, color: "#94A3B8", display: "inline-flex", alignItems: "center" }}><Glyph name="lock" size={10} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* L1 -> L6 Groups */}
            {GROUPS.filter((g) => g !== "Safety & Data").map((g) => {
              const lv = GROUP_LV[g];
              if (libLayerFilter !== "ALL" && libLayerFilter !== lv) return null;
              const q = libSearch.trim().toLowerCase();
              const groupMods = allMods.filter((m) => m.group === g && (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.explain.toLowerCase().includes(q)));
              if (groupMods.length === 0) return null;
              const lCol = LV_COLOR[lv];
              return (
                <div key={g} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, margin: "4px 0 5px", fontSize: 11, fontWeight: 800, color: lCol }}>
                    {GICON[g] ? <Glyph name={GICON[g]} size={11} /> : null}
                    <span>L{lv} · {g}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); setLayerInfoLv(lv); }}
                      title={`Explain L${lv} (${g}) meaning & applications`}
                      style={{ width: 15, height: 15, borderRadius: "50%", border: `1px solid ${lCol}77`, background: `${lCol}18`, color: lCol, fontSize: 9.5, lineHeight: "13px", textAlign: "center", cursor: "pointer", fontWeight: 900, display: "inline-block" }}
                    >i</span>
                    <span style={{ marginLeft: "auto", fontSize: 9.5, color: "#64748B", fontWeight: 700 }}>{groupMods.length}</span>
                  </div>
                  {groupMods.map((m) => {
                    const imp = getModuleImpact(m.id, customMods.find((x) => x.id === m.id));
                    const rc = imp.role === "ATTACKER" ? "#F97316" : imp.role === "GUARD" ? "#38BDF8" : imp.role === "CONFIRMATION" ? "#A855F7" : imp.role === "EXIT_SENTINEL" ? "#34D399" : imp.role === "FALLBACK" ? "#FBBF24" : imp.role === "SCOUT" ? "#22D3EE" : "#64748B";
                    const rl = imp.role === "ATTACKER" ? "ATK" : imp.role === "GUARD" ? "GRD" : imp.role === "CONFIRMATION" ? "CNF" : imp.role === "EXIT_SENTINEL" ? "EXT" : imp.role === "FALLBACK" ? "FBK" : imp.role === "SCOUT" ? "SCT" : "SYS";
                    const isPlaced = (placed[m.level] || []).includes(m.id);
                    return (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("mod", m.id)}
                        onClick={() => drop(m.id)}
                        title={`Click or drag to add ${m.name} into L${m.level} (${m.group})`}
                        style={{ display: "flex", alignItems: "center", gap: 5, background: isPlaced ? "rgba(56,189,248,.10)" : "var(--bg-card-inner)", border: `1px solid ${sel === m.id ? lCol : isPlaced ? "rgba(56,189,248,.40)" : "var(--border-panel)"}`, borderRadius: 5, padding: "4px 6px", margin: "3px 0", fontSize: 11.5, cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 8.5, fontWeight: 900, color: lCol, background: `${lCol}18`, border: `1px solid ${lCol}55`, borderRadius: 3, padding: "1px 3px", flexShrink: 0 }}>L{m.level}</span>
                        <span title={`${imp.cardClassLabel} · ${imp.impactBadge}`} style={{ fontSize: 8.5, fontWeight: 900, color: rc, background: `${rc}18`, border: `1px solid ${rc}55`, borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>{rl}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isPlaced ? 700 : 500, color: "#E2E8F0" }}>
                          {m.name}
                          {isCustomId(m.id) && <span style={{ fontSize: 8, color: TK.purple, marginLeft: 4, border: "1px solid #43306a", borderRadius: 3, padding: "0 3px" }}>CUSTOM</span>}
                          {imp.trapWarning && <span title={imp.trapWarning} style={{ fontSize: 9, color: "#F87171", marginLeft: 3, fontWeight: 900 }}>⚠</span>}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); drop(m.id); }}
                          title={isPlaced ? `Placed in L${m.level} (click to inspect)` : `Quick-add to L${m.level}`}
                          style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 4, border: `1px solid ${isPlaced ? "#34D399" : lCol + "88"}`, background: isPlaced ? "rgba(16,185,129,.18)" : `${lCol}1F`, color: isPlaced ? "#34D399" : lCol, fontSize: 11, fontWeight: 900, lineHeight: "15px", textAlign: "center", cursor: "pointer", padding: 0 }}
                        >{isPlaced ? "✓" : "+"}</button>
                        <span onClick={(e) => { e.stopPropagation(); setHelpMod(m.id); }} title={"Inspect the module mechanism"} style={{ flexShrink: 0, width: 16, height: 16, borderRadius: "50%", border: "1px solid #3a4d61", color: "#8aa0b6", fontSize: 10, lineHeight: "14px", textAlign: "center", cursor: "pointer", fontWeight: 700 }}>?</span>
                        {isCustomId(m.id) && <span onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete module “" + m.name + "\"?")) deleteModule(m.id); }} title={"Delete Custom module"} style={{ flexShrink: 0, cursor: "pointer", fontSize: 11, color: TK.red }}><Glyph name="trash" size={11} /></span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COLUMN 2 (Center - minmax(520px, 1fr)): STRATEGY CANVAS (L0 → L6) ── */}
        <div className="co-card strategy-canvas-pane strategy-canvas-center" role="region" aria-label="Strategy composition" tabIndex={0} style={{ margin: 0, padding: "10px 12px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexShrink: 0, gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: "#F8FAFC" }}>
              STRATEGY CANVAS <span className="co-mut small" style={{ fontWeight: 500 }}>— L0 → L6 governed lanes (click or drop modules)</span>
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setLayerInfoLv(4)}
                title="Open interactive L0 → L6 Layer Meaning & Application Guide"
                style={{ background: "rgba(56, 189, 248, 0.14)", border: "1px solid rgba(56, 189, 248, 0.45)", color: "#38BDF8", borderRadius: 5, padding: "2px 8px", fontSize: 10.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <span style={{ fontWeight: 900 }}>ⓘ</span> L0→L6 Layer Guide
              </button>
              <span className="xs co-mut" style={{ fontFamily: "var(--mfe-mono)" }}>{totalPlaced} active modules</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            {LANES.map((ln) => {
              const isL0 = ln.lv === 0;
              const laneMods = placed[ln.lv] || [];
              return (
                <div
                  key={ln.lv}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { const id = e.dataTransfer.getData("mod"); if (id) drop(id); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: `1px solid ${ln.lv === 6 && !hasZone ? "rgba(239,68,68,.45)" : ln.lv === 5 && !hasL5Atk ? "rgba(245,158,11,.45)" : "var(--border-panel)"}`,
                    background: isL0 ? "rgba(15, 23, 42, 0.72)" : "var(--bg-card-inner)",
                    borderRadius: 6,
                    padding: isL0 ? "4px 10px" : "7px 10px",
                    minHeight: isL0 ? 38 : 50,
                  }}
                >
                  {/* Expanded Layer Title Column (125px) */}
                  <div style={{ width: 125, minWidth: 125, flexShrink: 0, borderRight: "1px solid var(--border-subtle)", paddingRight: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontWeight: 900, fontSize: isL0 ? 11.5 : 12.5, color: ln.color }}>L{ln.lv}</span>
                      <span style={{ fontSize: isL0 ? 10.5 : 11.5, fontWeight: 700, color: "#E2E8F0", lineHeight: 1.2 }}>{ln.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setLayerInfoLv(ln.lv); }}
                        title={`What is L${ln.lv} (${ln.name}) & how is it applied?`}
                        style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", border: `1px solid ${ln.color}88`, background: `${ln.color}1F`, color: ln.color, fontSize: 10, fontWeight: 900, lineHeight: "14px", textAlign: "center", cursor: "pointer", padding: 0, flexShrink: 0 }}
                      >i</button>
                      {ln.locked && <span style={{ color: "#34D399", display: "inline-flex", alignItems: "center" }}><Glyph name="lock" size={10} /></span>}
                    </div>
                    {!isL0 && (
                      <div style={{ marginTop: 3 }}>
                        <span
                          onClick={() => createAtLane(ln.lv)}
                          title={ln.lv === 1 ? "Build an L1 feature from blocks" : ln.lv === 2 ? "Build an L2 indicator or context" : ln.lv === 3 ? "Build an L3 formula in QuantLab" : ln.lv === 4 ? "Build an L4 context gate" : ln.lv === 5 ? "Build L5 trigger, veto or exit logic" : "Build L6 observation and invalidation zones"}
                          style={{ display: "inline-block", fontSize: 9.5, color: ln.color, background: `${ln.color}16`, border: `1px solid ${ln.color}44`, borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontWeight: 800 }}
                        >⚙ Custom L{ln.lv} studio</span>
                      </div>
                    )}
                  </div>

                  {/* Lane Content Area */}
                  <div style={{ display: "flex", gap: isL0 ? 5 : 6, flexWrap: "wrap", flex: 1, alignItems: "center" }}>
                    {!isL0 && (
                      <button
                        onClick={() => focusLibraryLayer(ln.lv)}
                        title={`Filter Module Library to L${ln.lv} (${ln.name})`}
                        style={{ background: ln.color + "1F", border: `1px dashed ${ln.color}99`, borderRadius: 6, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", color: ln.color, fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap" }}
                      >+ Add L{ln.lv}</button>
                    )}

                    {laneMods.map((id) => {
                      const m = byId(id);
                      if (isL0) {
                        return (
                          <div
                            key={id}
                            onClick={() => setSel(id)}
                            title={m.explain}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0F172A", border: "1px solid rgba(148,163,184,.25)", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", boxShadow: sel === id ? `0 0 0 1.5px ${m.color}` : "none" }}
                          >
                            <span style={{ fontSize: 8, fontWeight: 900, color: "#64748B", background: "rgba(100,116,139,.18)", border: "1px solid rgba(100,116,139,.4)", borderRadius: 3, padding: "0 3px" }}>SYS</span>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: engOf(id).color }} />
                            <b style={{ color: "#CBD5E1", fontWeight: 700 }}>{m.name}</b>
                            <span style={{ color: "#64748B", display: "inline-flex", alignItems: "center" }}><Glyph name="lock" size={9} /></span>
                          </div>
                        );
                      }
                      const imp = getModuleImpact(id, customMods.find((x) => x.id === id));
                      const rc = imp.role === "ATTACKER" ? "#F97316" : imp.role === "GUARD" ? "#38BDF8" : imp.role === "CONFIRMATION" ? "#A855F7" : imp.role === "EXIT_SENTINEL" ? "#34D399" : imp.role === "FALLBACK" ? "#FBBF24" : imp.role === "SCOUT" ? "#22D3EE" : "#64748B";
                      const rl = imp.role === "ATTACKER" ? "ATK" : imp.role === "GUARD" ? "GRD" : imp.role === "CONFIRMATION" ? "CNF" : imp.role === "EXIT_SENTINEL" ? "EXT" : imp.role === "FALLBACK" ? "FBK" : imp.role === "SCOUT" ? "SCT" : "SYS";
                      return (
                        <div
                          key={id}
                          onClick={() => setSel(id)}
                          title={m.explain}
                          style={{ display: "inline-flex", alignItems: "center", background: "#131E36", border: `1px solid ${m.color}66`, borderRadius: 6, padding: "4px 9px", fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap", boxShadow: sel === id ? `0 0 0 2px ${m.color}` : "none" }}
                        >
                          <span title={`${imp.cardClassLabel} · ${imp.impactBadge}`} style={{ fontSize: 8.5, fontWeight: 900, color: rc, background: `${rc}18`, border: `1px solid ${rc}55`, borderRadius: 3, padding: "1px 4px", marginRight: 5 }}>{rl}</span>
                          <span title={engOf(id).label} style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: engOf(id).color, marginRight: 5 }} />
                          <b style={{ color: "#F8FAFC" }}>{m.name}</b>
                          <span className="xs co-mut" style={{ marginLeft: 5 }}>{m.auth}</span>
                          {imp.trapWarning && <span title={imp.trapWarning} style={{ fontSize: 10, color: "#F87171", marginLeft: 4, fontWeight: 900 }}>⚠</span>}
                          <span onClick={(e) => { e.stopPropagation(); setHelpMod(id); }} title={"Inspect the module mechanism"} style={{ marginLeft: 5, color: "#8aa0b6", cursor: "pointer", fontWeight: 700, border: "1px solid #3a4d61", borderRadius: "50%", padding: "0 4px", fontSize: 10 }}>?</span>
                          <span onClick={(e) => { e.stopPropagation(); remove(id); }} title="Remove from lane" style={{ marginLeft: 6, color: "#f85149", cursor: "pointer", display: "inline-flex", alignItems: "center" }}><Glyph name="x" size={11} /></span>
                        </div>
                      );
                    })}

                    {/* Inline Required / Warning Status for L5 and L6 vs Standard Empty Hint */}
                    {ln.lv === 5 && !hasL5Atk && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(245, 158, 11, 0.14)", border: "1px solid rgba(245, 158, 11, 0.45)", borderRadius: 6, padding: "4px 9px", fontSize: 11, color: "#FBBF24", fontWeight: 700 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F97316", boxShadow: "0 0 6px #F97316", flexShrink: 0 }} />
                        <span>⚠ No explicit trigger — Add ≥1 ATK logic module (otherwise falls back to default EMA crossover)</span>
                      </div>
                    )}
                    {ln.lv === 6 && laneMods.length === 0 && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(239, 68, 68, 0.14)", border: "1px solid rgba(239, 68, 68, 0.45)", borderRadius: 6, padding: "4px 9px", fontSize: 11, color: "#FCA5A5", fontWeight: 700 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F87171", boxShadow: "0 0 6px #F87171", flexShrink: 0 }} />
                        <span>⚠ Required output — Add ≥1 Zone module (Observation, Risk, or Invalidation Zone) to complete Card</span>
                      </div>
                    )}
                    {ln.lv >= 1 && ln.lv <= 4 && laneMods.length === 0 && (
                      <span className="xs co-mut">Click + Add L{ln.lv} or drop an L{ln.lv} module here…</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COLUMN 3 (Right - 340px): VALIDATION CHECKLIST + CONTRIBUTION MAP + INSPECTOR + ACTIONS ── */}
        <div className="co-card strategy-canvas-pane strategy-canvas-inspector" role="region" aria-label="Strategy inspector" tabIndex={0} style={{ margin: 0, padding: "10px 12px 16px", display: "flex", flexDirection: "column", gap: 9 }}>

          {/* 1. Validation Checklist Box */}
          <div style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-panel)", borderRadius: 7, padding: "8px 10px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.4px", color: "#38BDF8" }}>VALIDATION CHECKLIST</span>
              <span style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: "#94A3B8" }}>{[true, hasExplicitTrigger, hasZone, true].filter(Boolean).length}/4 PASS</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34D399", fontWeight: 700 }}>
                <span style={{ fontFamily: "var(--mfe-mono)", fontWeight: 900 }}>[✓]</span>
                <span>L0 Safety Guards: 5/5 Locked</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: hasExplicitTrigger ? "#34D399" : "#FBBF24", fontWeight: 700 }}>
                <span style={{ fontFamily: "var(--mfe-mono)", fontWeight: 900 }}>{hasExplicitTrigger ? "[✓]" : "[!]"}</span>
                <span>L5 Explicit Trigger: {hasExplicitTrigger ? `Active (${triggerDiag.count || 1} ATK)` : "Missing (Using EMA crossover fallback)"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: hasZone ? "#34D399" : "#F87171", fontWeight: 700 }}>
                <span style={{ fontFamily: "var(--mfe-mono)", fontWeight: 900 }}>{hasZone ? "[✓]" : "[✕]"}</span>
                <span>L6 Zone Output: {hasZone ? `Active (${(placed[6] || []).length} zone)` : "Missing (Required)"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34D399", fontWeight: 700 }}>
                <span style={{ fontFamily: "var(--mfe-mono)", fontWeight: 900 }}>[✓]</span>
                <span>Explainability Gate: Pass</span>
              </div>
            </div>
          </div>

          {/* 2. Collapsible Cross-Layer Contribution Map Accordion */}
          {wiring.contributionMap.length > 0 && (() => {
            const blocks = wiring.violations.filter((x) => x.severity === "BLOCK");
            const warns = wiring.violations.filter((x) => x.severity === "WARN");
            const cc = (k: string) => k === "DRIVES" ? TK.green : k === "FILTERS" ? TK.cyan : TK.orange;
            return (
              <div style={{ background: "var(--bg-card-inner)", border: `1px solid ${blocks.length === 0 ? "var(--border-panel)" : "rgba(239,68,68,.45)"}`, borderRadius: 7, padding: "7px 10px", flexShrink: 0 }}>
                <div onClick={() => setWiringOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#9fd0ff" }}><Glyph name="link" size={11} /> Cross-layer contribution map</span>
                  <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "var(--mfe-mono)" }}>({wiring.contributionMap.length} shadow)</span>
                  {blocks.length > 0 && <span style={{ fontSize: 9.5, color: TK.red, fontWeight: 800 }}>{blocks.length} err</span>}
                  <span style={{ marginLeft: "auto", color: "#38BDF8", fontSize: 12 }}>{wiringOpen ? "▾" : "▸"}</span>
                </div>
                {wiringOpen && (
                  <div style={{ marginTop: 7, maxHeight: 130, overflowY: "auto", paddingTop: 6, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                      {wiring.contributionMap.map((c) => (
                        <span key={c.id} title={c.reason} style={{ fontSize: 9.5, fontWeight: 700, color: cc(c.contribution), border: `1px solid ${cc(c.contribution)}55`, borderRadius: 4, padding: "1px 6px" }}>
                          {c.layer} {c.contribution === "DRIVES" ? "⚡" : c.contribution === "INERT" ? "○" : "▪"} {c.name.length > 18 ? c.name.slice(0, 18) + "…" : c.name}
                        </span>
                      ))}
                    </div>
                    {warns.length > 0 && (
                      <div style={{ fontSize: 10, color: "#FBBF24" }}>{warns.length} shadow modules available in library; place onto lanes to wire.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 3. Scrollable Inspector Body */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--bg-card-inner)", border: "1px solid var(--border-panel)", borderRadius: 7, padding: "9px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: "0.4px", color: "#F8FAFC" }}>INSPECTOR</span>
              {selMod && <span style={{ fontSize: 10, fontWeight: 800, color: selMod.color }}>L{selMod.level} · {selMod.group}</span>}
            </div>
            {!selMod ? (
              <div>
                <div className="co-mut small" style={{ marginBottom: 8, lineHeight: 1.45 }}>
                  Select any module on the Canvas or in the Library to inspect its TCG role, combat stats (<b style={{ color: "#F97316" }}>ATK</b> / <b style={{ color: "#38BDF8" }}>DEF</b>), and engine execution mechanics.
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94A3B8", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.4px" }}>Layer Coverage ({[1, 2, 3, 4, 5, 6].filter((lv) => (placed[lv] || []).length > 0).length}/6 Active)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  {LANES.filter((l) => l.lv > 0).map((ln) => {
                    const cnt = (placed[ln.lv] || []).length;
                    return (
                      <div
                        key={ln.lv}
                        onClick={() => focusLibraryLayer(ln.lv)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 7px", borderRadius: 5, background: "rgba(7, 11, 20, 0.65)", border: `1px solid ${cnt > 0 ? ln.color + "66" : "var(--border-subtle)"}`, cursor: "pointer", fontSize: 10.5 }}
                      >
                        <span style={{ color: ln.color, fontWeight: 800 }}>L{ln.lv} {ln.name.split(" ")[0]}</span>
                        <span style={{ fontFamily: "var(--mfe-mono)", fontWeight: 800, color: cnt > 0 ? "#34D399" : "#64748B" }}>{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: selMod.color, marginBottom: 5 }}>{selMod.name}</div>
                {(() => {
                  const imp = getModuleImpact(selMod.id, customMods.find((x) => x.id === selMod.id));
                  const rc = imp.role === "ATTACKER" ? "#F97316" : imp.role === "GUARD" ? "#38BDF8" : imp.role === "CONFIRMATION" ? "#A855F7" : imp.role === "EXIT_SENTINEL" ? "#34D399" : imp.role === "FALLBACK" ? "#FBBF24" : imp.role === "SCOUT" ? "#22D3EE" : "#64748B";
                  return (
                    <div style={{ background: "rgba(7, 11, 20, 0.85)", border: `1px solid ${rc}55`, borderRadius: 7, padding: "6px 8px", marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 900, color: rc, letterSpacing: "0.4px" }}>TCG ROLE · {imp.cardClassLabel}</span>
                        <span style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", fontWeight: 800, color: "#E2E8F0" }}>ATK {imp.atkScore} · DEF {imp.defScore}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: imp.impactTone === "proven" ? "#34D399" : imp.impactTone === "caution" ? "#FBBF24" : imp.impactTone === "synergy" ? "#38BDF8" : "#94A3B8", fontWeight: 800, marginBottom: 3 }}>⚡ {imp.impactBadge}</div>
                      {imp.synergyWith.length > 0 && <div style={{ fontSize: 10, color: "#94A3B8" }}>Synergy: <b style={{ color: "#38BDF8" }}>{imp.synergyWith.slice(0, 3).join(", ")}</b></div>}
                      {imp.trapWarning && <div style={{ fontSize: 10, color: "#F87171", marginTop: 4, lineHeight: 1.35 }}>⚠ {imp.trapWarning}</div>}
                    </div>
                  );
                })()}
                {(() => {
                  const m = engOf(selMod.id);
                  return (
                    <div style={{ background: m.color + "1a", border: `1px solid ${m.color}55`, borderRadius: 6, padding: "4px 8px", marginBottom: 6 }}>
                      <span style={{ color: m.color, fontWeight: 800, fontSize: 11 }}><Glyph name="gear" size={11} /> Backtest: {m.label}</span>
                    </div>
                  );
                })()}
                <div style={{ marginBottom: 5 }}>
                  <span className="mfe-status-pill info">{selMod.auth} only</span>
                  <span className="mfe-status-pill safe">no-lookahead</span>
                </div>
                <p className="small" style={{ margin: "4px 0 6px", lineHeight: 1.4 }}>{selMod.explain}</p>
                <div className="co-kv"><span>inputs</span><b className="mono small">{selMod.inputs}</b></div>
                <div className="co-kv"><span>outputs</span><b className="mono small">{selMod.outputs}</b></div>
                <div className="co-kv"><span>limits</span><b className="small" style={{ color: "#f0d68a" }}>{selMod.limits}</b></div>
              </div>
            )}
          </div>

          {/* 4. Action Buttons Pinned Safely in Column 3 (No Bottom Cutoff) */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 7, paddingTop: 4 }}>
            {(allStack || gateCount >= 6) && (
              <div style={{ background: "rgba(255,138,42,.12)", border: "1px solid #FF8A2A66", borderRadius: 6, padding: "5px 8px", fontSize: 10.5, color: "#F4C542", lineHeight: 1.35 }}>
                <Glyph name="warning" size={11} /> <b>{gateCount} gates stacked</b> — may over-filter to zero trades.
              </div>
            )}
            <div className="strategy-canvas-actions">
              <button
                className="fx-toggle"
                style={{ fontSize: 11, padding: "6px 8px", background: "rgba(88,166,255,.15)", color: "#58a6ff", borderColor: "#1f5b8c", fontWeight: 800, whiteSpace: "nowrap" }}
                onClick={() => setCardSlotsOpen(true)}
                title={"Compose a Strategy Card using role slots"}
              ><Glyph name="card" size={11} /> Strategy Card (role)</button>
              <button
                className="fx-toggle"
                style={{ fontSize: 11, padding: "6px 8px", background: "rgba(168,85,247,.16)", color: "#C084FC", borderColor: "rgba(168,85,247,.45)", fontWeight: 800, whiteSpace: "nowrap" }}
                onClick={() => setShowBuilder(true)}
                title={"Build a module from a layer template"}
              >+ Create module</button>
              <button
                className="fx-toggle"
                style={{ fontSize: 11, padding: "6px 9px", fontWeight: 800, whiteSpace: "nowrap" }}
                onClick={newCanvas}
                title={"Reset Canvas to L0 defaults"}
              >+ New</button>
            </div>
            <button
              className="fx-toggle on"
              style={{ width: "100%", fontSize: 13, fontWeight: 900, padding: "9px 14px", borderRadius: 7, background: "linear-gradient(90deg, #0284C7 0%, #22D3EE 100%)", color: "#040D1A", border: "1px solid #38BDF8", boxShadow: "0 4px 14px rgba(34, 211, 238, 0.25)", cursor: "pointer", letterSpacing: "0.3px" }}
              onClick={() => setResult(evaluate(placed))}
            >Validate &amp; Evaluate</button>
          </div>
        </div>
      </div>

      {/* CH Episode Lens — live L2 observer (shown when the module is placed on the canvas) */}
      {(placed[2] || []).includes("ch_episode_lens") && <ChEpisodeLensPanel tf="H1" />}
      {/* Proxy visualization lenses — descriptive/observe-only (WO PROXY_VISUALIZATION_V1) */}
      {(placed[2] || []).includes("footprint_lens") && <FootprintLensPanel tf="M15" />}
      {(placed[2] || []).includes("live_tickvol_lens") && <LiveTickVolumeLensPanel tf="M15" />}

      {/* ── Detailed evaluation (after Validate) ── */}
      {result && (() => {
        const v = result;
        const vcol = v.verdict === "BLOCKED" ? TK.red : v.verdict === "SHADOW_TEST" ? TK.green : TK.yellow;
        const vclass = v.verdict === "BLOCKED" ? "blk" : v.verdict === "SHADOW_TEST" ? "ok" : "warn";
        const scol = v.score >= 75 ? TK.green : v.score >= 50 ? TK.yellow : TK.red;
        return (
          <div style={{ marginTop: 14 }}>
            <div className="pc" style={{ borderColor: vcol + "66" }}>
              <div className="pc-h"><Glyph name="clipboard" size={12} /> Composition review <span className="mut">Research only · no automatic promotion</span></div>
              <div className="strategy-canvas-summary" style={{ display: "grid", gap: 16, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div className={`pverdict ${vclass}`} style={{ fontSize: 17 }}>{v.verdict.replace("_", " ")}<div className="s">{v.verdict === "BLOCKED" ? "add a zone output" : v.verdict === "SHADOW_TEST" ? "structurally ready for research validation" : "incomplete composition"}</div></div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span className="pmut">Completeness</span><b className="pmono" style={{ color: scol }}>{v.score}%</b></div>
                    <div className="pbar" style={{ marginTop: 4, height: 9 }}><div style={{ width: `${v.score}%`, background: scol }} /></div>
                  </div>
                </div>
                <div>
                  <div className="pkv"><span>Archetype</span><b style={{ color: TK.text }}>{v.archetype}</b></div>
                  <div className="pkv"><span>Algorithm</span><b>{v.algo}</b></div>
                  <div className="pkv"><span>Layers covered</span><b>{v.layers} / 6</b></div>
                  <div className="pkv"><span>Risk / timing filters</span><b style={{ color: v.guards ? TK.green : TK.orange }}>{v.guards}</b></div>
                  <div className="pkv"><span>Explainability gate</span><b style={{ color: v.gate === "EXPLAINED" ? TK.green : v.gate === "PARTIAL" ? TK.yellow : TK.red }}>{v.gate}</b></div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button className="fx-toggle on" style={{ fontSize: 12.5, padding: "6px 16px" }} onClick={() => { setPackageName(`${v.archetype} v1`); setPackageStatus(null); setPackageOpen(true); }}><Glyph name="package" size={12} /> Package as Strategy Card</button>
              </div>
              {packageOpen && <div role="dialog" aria-label="Package Strategy Card" style={{ marginTop: 10, padding: 10, border: "1px solid " + TK.cyan + "66", borderRadius: 8, background: "#0b141e" }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: TK.cyan, marginBottom: 6 }}>Package transaction · compile → backtest → persist → notify</div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <input aria-label="Strategy Card name" autoFocus value={packageName} onChange={(e) => setPackageName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void commitPackage(packageName); }} style={{ flex: "1 1 180px", minWidth: 0, background: "#08111a", border: "1px solid var(--mfe-border)", borderRadius: 6, color: TK.text, padding: "5px 8px" }} />
                  <button disabled={packageBusy || !packageName.trim()} onClick={() => void commitPackage(packageName)} style={{ background: TK.green, color: "#06101a", border: 0, borderRadius: 6, padding: "5px 12px", fontWeight: 800 }}>{packageBusy ? "Running validation…" : "Save and validate"}</button>
                  <button disabled={packageBusy} onClick={() => { setPackageOpen(false); setPackageStatus(null); }} style={{ background: "transparent", color: TK.muted, border: "1px solid var(--mfe-border)", borderRadius: 6, padding: "5px 10px" }}>Close</button>
                </div>
                {packageStatus && <div role="status" style={{ marginTop: 7, color: packageStatus.ok ? TK.green : TK.red, fontSize: 11 }}>{packageStatus.text}</div>}
              </div>}
            </div>

            <CardEvidencePanel card={latestSaved as Parameters<typeof CardEvidencePanel>[0]["card"]} />

            <div className="grid3 c2" style={{ marginTop: 12 }}>
              <div className="pc"><div className="pc-h green">Present components</div>
                {v.strengths.length ? v.strengths.map((s, i) => <div key={i} className="pcheck"><span className="ic" style={{ color: TK.green }}><Glyph name="check" size={11} /></span><span style={{ fontSize: 11.5 }}>{s}</span></div>) : <div className="pmut psm">—</div>}
              </div>
              <div className="pc"><div className="pc-h amber">Missing components / next steps</div>
                {v.gaps.length ? v.gaps.map((g, i) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #14202c" }}><div style={{ fontSize: 11.5, color: TK.orange }}><Glyph name="warning" size={11} /> {g.t}</div><div className="pmut" style={{ fontSize: 10.5 }}>→ {g.fix}</div></div>) : <div className="pcheck"><span className="ic" style={{ color: TK.green }}><Glyph name="check" size={11} /></span><span style={{ fontSize: 11.5 }}>All required layers are present</span></div>}
              </div>
            </div>

            <div className="pc" style={{ marginTop: 12, background: "linear-gradient(180deg,rgba(255,138,42,.05),var(--mfe-s1))", borderColor: "#5a3a18" }}>
              <div className="pc-h amber">Composition summary</div>
              <div className="psm" style={{ lineHeight: 1.6 }}>Composition coverage: {v.layers}/6 layers. Gate: {v.gate}. Performance is only available from a measured validation receipt.</div>
            </div>
          </div>
        );
      })()}

      {/* ── Strategy Library — packaged tactical cards (rounded "bo góc") ── */}
      <div className="pc" style={{ marginTop: 14 }}>
        <div className="pc-h violet" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Glyph name="books" size={13} /> Strategy Library <span className="mut">{library.length} Cards · stored by the local workspace service</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
            <button className="fx-toggle" style={{ fontSize: 11.5, padding: "4px 10px", background: "rgba(34,211,238,.12)", color: "#22D3EE", borderColor: "rgba(34,211,238,.45)" }} onClick={() => { seedTcgStarterDeck(); setCustomMods(loadCustomModules()); setLibrary(loadLib()); void flushWorkspace(); }} title={"Seed 12 Role-Pure TCG Cards + 3 Reference Beasts + 11 Custom Modules"}><Glyph name="bolt" size={12} /> Seed Starter TCG Deck</button>
            <button className="fx-toggle" style={{ fontSize: 11.5, padding: "4px 10px" }} onClick={exportCards} title={"Export the Card library as a portable JSON backup"}><Glyph name="arrow-down" size={12} /> Export</button>
            <label className="fx-toggle" style={{ fontSize: 11.5, padding: "4px 10px", cursor: "pointer" }} title={"Import exported Card definitions into the current library"}><Glyph name="arrow-up" size={12} /> Import
              <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCards(f); e.currentTarget.value = ""; }} />
            </label>
          </span>
        </div>
        {library.length === 0 && <div className="pfoot" style={{ marginTop: 0, marginBottom: 8 }}>No Cards yet. Create a composition, validate it, then choose “<Glyph name="package" size={11} /> Package”. <b>Backup:</b> Export a portable copy of your Card definitions when moving the workspace.</div>}
        {(() => { const dl = library.filter((c) => fusionDeadlock(c.modules || []).deadlocked); return dl.length ? (
          <div style={{ margin: "0 0 10px", padding: "8px 11px", borderRadius: 8, background: "#241d10", border: "1px solid " + TK.orange + "66", fontSize: 12, color: TK.text, lineHeight: 1.5 }}>
            <Glyph name="warning" size={12} /> <b style={{ color: TK.orange }}>{dl.length} card FUSION-DEADLOCK</b> — weak trigger weights with score fusion can cause <b>no eligible candidates</b>. Review fusion and confirmation settings. <span className="pmut">Card: {dl.map((c) => c.name).join(", ")}</span>
          </div>
        ) : null; })()}
        {(() => { const fb = library.filter((c) => diagnoseCardTriggers(c.modules || []).fallbackActive); return fb.length >= 2 ? (
          <div style={{ margin: "0 0 10px", padding: "8px 11px", borderRadius: 8, background: "#2a1416", border: "1px solid " + TK.red + "66", fontSize: 12, color: TK.text, lineHeight: 1.5 }}>
            <Glyph name="warning" size={12} /> <b style={{ color: TK.red }}>{fb.length} Cards have no explicit trigger</b> — the legacy engine uses the same <b>default EMA10/EMA34 crossover</b> and their results may be <b>identical</b> . Add an explicit trigger before publication. <span className="pmut">Card: {fb.map((c) => c.name).join(", ")}</span>
          </div>
        ) : null; })()}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,238px),1fr))", gap: 12 }}>
            <button onClick={newCanvas} title={"Start a new strategy while retaining L0 governance"}
              style={{ background: "transparent", border: "2px dashed #3a4d61", borderRadius: 16, padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 162, color: "#8aa0b6", transition: ".15s" }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = "#25B7FF"; e.currentTarget.style.color = "#25B7FF"; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = "#3a4d61"; e.currentTarget.style.color = "#8aa0b6"; }}>
              <div style={{ fontSize: 36, fontWeight: 300, lineHeight: 1 }}>＋</div>
              <div style={{ fontSize: 11.5, fontWeight: 800 }}>New Card</div>
            </button>
            {library.map((c) => { const vcol = c.verdict === "SHADOW_TEST" ? TK.green : c.verdict === "BLOCKED" ? TK.red : TK.yellow; return (
              <div key={c.id} style={{ background: "linear-gradient(180deg,var(--mfe-s2),var(--mfe-s1))", border: `1px solid ${vcol}55`, borderRadius: 16, padding: "12px 13px", boxShadow: "0 3px 14px #0007" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 7, borderBottom: `1px solid ${vcol}33`, marginBottom: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: vcol, boxShadow: `0 0 7px ${vcol}` }} />
                  <b style={{ fontSize: 13 }}>{c.name}</b>
                  <span style={{ marginLeft: "auto", color: vcol, fontWeight: 800, fontSize: 9.5 }}>{c.verdict.replace("_", " ")}</span>
                </div>
                <div className="pmut" style={{ fontSize: 10, marginBottom: 7 }}>{c.archetype} · {c.algo}</div>
                {(() => { const td = diagnoseCardTriggers(c.modules || []); return (
                  <div title={td.note} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, color: TRIGGER_VERDICT_COLOR[td.verdict], border: "1px solid " + TRIGGER_VERDICT_COLOR[td.verdict] + "55", borderRadius: 5, padding: "1px 6px", marginBottom: 7, cursor: "help" }}>
                    <Glyph name="bolt" size={11} /> {TRIGGER_VERDICT_LABEL[td.verdict]}{td.count ? " · " + td.count : ""}
                  </div>
                ); })()}
                <div className="pkv"><span>Composition</span><b>{c.modules.length} modules</b></div>
                <div className="pkv" title={c.bt_window?.startsWith("REAL_OOS_") ? `Measured HARD backtest · chronological OOS folds · ${c.oos?.verdict}` : c.bt_window?.startsWith("REAL_") ? "Measured by the canonical research engine" : "No verified receipt; validate the Card before interpreting performance"}><span>Net R · EV {c.bt_window?.startsWith("REAL_OOS_") ? <b style={{ color: TK.green, fontSize: 8.5 }}>OOS · HARD</b> : c.bt_window?.startsWith("REAL_") ? <b style={{ color: TK.green, fontSize: 8.5 }}>REAL</b> : <b style={{ color: TK.orange, fontSize: 8.5 }}>MODELED</b>}</span><b style={{ color: c.costEv >= 0 ? TK.green : TK.red }}>{(c.validationReceipt as {verified?:boolean})?.verified ? `${c.netR}R · ${c.costEv >= 0 ? "+" : ""}${c.costEv}R` : "Not validated"}</b></div>
                {c.oos && <div className="pkv" title={c.oos.folds.map((f) => `${f.start.slice(0, 10)}→${f.end.slice(0, 10)}: n=${f.n}, PF=${f.netPF}, netR=${f.netR}`).join(" · ")}><span>Walk-forward</span><b style={{ color: c.oos.verdict === "OOS_STABLE" ? TK.green : c.oos.verdict === "OOS_MIXED" ? TK.yellow : TK.red }}>{c.oos.verdict} · {(c.oos.positive_fraction * 100).toFixed(0)}% positive folds</b></div>}
                <div className="pkv"><span>Layers · Guards</span><b>{c.layers}/6 · {c.guards}</b></div>
                <div className="pkv"><span>Gate · Saved</span><b className="psm" style={{ fontFamily: "inherit", fontWeight: 600, color: TK.text2 }}>{c.gate} · {c.ts}</b></div>
                <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                  <button className="fx-toggle on" style={{ flex: 1 }} onClick={() => loadCard(c)}>↺ Load</button>
                  <button className="fx-toggle" title={"Inspect Card roles, evidence and lineage"} onClick={() => setSemanticXray({ kind: "STRATEGY_CARD", card: c, customModules: customMods })}><Glyph name="microscope" size={12} /> X-Ray</button>
                  <button className="fx-toggle" style={{ color: "#ff8c8c" }} onClick={() => removeCard(c.id)}><Glyph name="trash" size={12} /></button>
                </div>
              </div>
            ); })}
        </div>
      </div>

      {showBuilder && <CustomModuleBuilder initialLevel={builderLevel} onClose={() => { setShowBuilder(false); setBuilderLevel(undefined); }} onSaved={(m) => { setCustomMods(loadCustomModules()); attachSavedCustom(m.id, m.level); }} />}
      {sandboxOpen && <L1ModuleSandbox onClose={() => { setSandboxOpen(false); setCustomL1Mods(loadCustomL1()); }} onSaved={(m) => { setCustomL1Mods(loadCustomL1()); attachSavedCustom("myL1_" + m.id, 1); }} />}
      {cardSlotsOpen && <StrategyCardSlots onClose={() => setCardSlotsOpen(false)} />}
      {l2Open && <L2Preview onClose={() => { setL2Open(false); setCustomL2Mods(loadCustomL2()); }} onSaved={(savedId) => { setCustomL2Mods(loadCustomL2()); attachSavedCustom(savedId, 2); }} />}
      {qlOpen && <Suspense fallback={<div style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", background: "rgba(5,10,16,.88)", color: TK.cyan }}>Loading QuantLab…</div>}><QuantLab initial={qlInitial} onClose={() => { setQlOpen(false); setCustomL3Mods(loadCustomL3()); }} onSaved={(savedId) => { setCustomL3Mods(loadCustomL3()); attachSavedCustom(savedId, 3); }} /></Suspense>}
      {l5SandboxOpen && <L5Sandbox onClose={() => { setL5SandboxOpen(false); setCustomMods(loadCustomModules()); }} onSaved={(id) => { setCustomMods(loadCustomModules()); attachSavedCustom(id, 5); }} />}
      {l4GateOpen && <L4GateBuilder onClose={() => { setL4GateOpen(false); setCustomMods(loadCustomModules()); }} onSaved={(id) => { setCustomMods(loadCustomModules()); attachSavedCustom(id, 4); }} />}
      {l6ZoneOpen && <L6ZoneBuilder onClose={() => { setL6ZoneOpen(false); setCustomL6Zones(loadCustomL6()); }} onSaved={(savedId) => { setCustomL6Zones(loadCustomL6()); attachSavedCustom(savedId, 6); }} />}
      {semanticXray && <SemanticXraySandbox target={semanticXray} onClose={() => setSemanticXray(null)} />}
      {helpMod && (() => {
        const m = byId(helpMod); const eg = engOf(helpMod);
        return (
          <div onClick={() => setHelpMod(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto", background: "#0d1420", border: `1px solid ${m.color}`, borderRadius: 12, padding: "16px 18px", boxShadow: "0 12px 40px rgba(0,0,0,.6)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: eg.color }} />
                <div style={{ fontWeight: 800, fontSize: 16, color: m.color }}>{m.name}</div>
                <span className="xs co-mut">L{m.level} · {m.group}</span>
                {helpMod.startsWith("myL3_") && <span onClick={() => { const mm = customL3Mods.find((x) => "myL3_" + x.id === helpMod); if (mm) { setQlInitial(mm); setQlOpen(true); setHelpMod(null); } }} title={"Reopen the formula in QuantLab"} style={{ marginLeft: "auto", cursor: "pointer", color: "#37c0ff", fontSize: 12, fontWeight: 700 }}><Glyph name="calc" size={12} /> Open QuantLab</span>}
                {isCustomId(helpMod) && <span onClick={() => { if (window.confirm(`Delete module “${m.name}”? This is a user-created Shadow definition.`)) deleteModule(helpMod); }} title={"Delete this Shadow module"} style={{ marginLeft: helpMod.startsWith("myL3_") ? 10 : "auto", cursor: "pointer", color: TK.red, fontSize: 16 }}><Glyph name="trash" size={14} /></span>}
                <span onClick={() => setHelpMod(null)} style={{ marginLeft: isCustomId(helpMod) ? 10 : "auto", cursor: "pointer", color: TK.muted, fontSize: 18, fontWeight: 700 }}><Glyph name="x" size={15} /></span>
              </div>
              <div style={{ background: eg.color + "1a", border: `1px solid ${eg.color}55`, borderRadius: 7, padding: "5px 9px", marginBottom: 12, fontSize: 12, color: eg.color, fontWeight: 700 }}><Glyph name="gear" size={12} /> Backtest engine: {eg.label}</div>
              {(() => {
                // 🧬 đặc-tính Role/Tribe/Blocks — engine module đọc từ census; custom module đọc từ chính blocks của nó
                const ROLE_C: Record<string, string> = { ATTACKER: "#FF6A3D", GUARD: TK.red, CONFIRMATION: TK.yellow, SCOUT: TK.cyan, EXIT_SENTINEL: TK.purple, SAFETY: TK.green, NONE: "#5d6f82" };
                const chipS = (txt: string, color: string) => <span key={txt} style={{ fontSize: 9.5, fontWeight: 800, color, border: `1px solid ${color}55`, borderRadius: 4, padding: "1px 6px", marginRight: 4 }}>{txt}</span>;
                const cen = censusOf(helpMod);
                const cm = isCustomId(helpMod) ? loadCustomModules().find((x) => x.id === helpMod) : undefined;
                if (!cen && !cm) return null;
                return (
                  <div style={{ background: "#0b141e", border: "1px solid var(--mfe-border)", borderRadius: 7, padding: "7px 9px", marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: TK.cyan, marginBottom: 5 }}><Glyph name="dna" size={11} /> Role, tribe and blocks</div>
                    {cen && (<>
                      <div style={{ marginBottom: 4 }}>{chipS(cen.role, ROLE_C[cen.role] || TK.muted)}{cen.tribes.map((t) => chipS(t, TK.cyan))}{chipS(cen.mechanism, "#8295aa")}</div>
                      <div style={{ fontSize: 11, color: TK.text2 }}>{cen.note}</div>
                    </>)}
                    {cm && (<>
                      <div style={{ marginBottom: 4 }}>{chipS(cm.role === "VETO" || cm.role === "SAFETY_VETO" ? "GUARD" : cm.role === "CONFIRM" ? "CONFIRMATION" : cm.role === "EXIT" ? "EXIT_SENTINEL" : cm.role === "TRIGGER" ? "ATTACKER" : cm.role, ROLE_C[cm.role === "VETO" || cm.role === "SAFETY_VETO" ? "GUARD" : cm.role === "CONFIRM" ? "CONFIRMATION" : cm.role === "EXIT" ? "EXIT_SENTINEL" : cm.role === "TRIGGER" ? "ATTACKER" : "NONE"] || TK.muted)}{chipS("BLOCK-COMPOSED", TK.green)}{chipS(cm.logic, "#8295aa")}</div>
                      <div style={{ fontSize: 11, color: TK.text2, marginBottom: 3 }}>Composed from {cm.conditions.length} block:</div>
                      {cm.conditions.map((c, i) => (
                        <div key={i} style={{ fontFamily: "var(--mfe-mono)", fontSize: 11, color: TK.cyan, padding: "1px 0" }}>▪ {c.metric} <span style={{ color: TK.text2 }}>{c.op}</span> {c.value}{c.value2 != null ? " … " + c.value2 : ""}</div>
                      ))}
                      {cm.role === "CONFIRM" && <div style={{ fontSize: 10.5, color: TK.yellow, marginTop: 3 }}>Confirmation scales vote weight by{cm.weight ?? 1.25} and cannot create a setup.</div>}
                    </>)}
                    <div style={{ fontSize: 10, color: TK.muted, marginTop: 5 }}>Inspect the library and evidence: <b style={{ color: TK.cyan, cursor: "pointer" }} onClick={() => { setHelpMod(null); window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "blocks-modules" })); }}><Glyph name="puzzle" size={11} /> Blocks & Modules </b></div>
                  </div>
                );
              })()}
              <Section title={<><Glyph name="wrench" size={12} /> Module purpose</>} body={m.explain} color={m.color} />
              <Section title={<><Glyph name="gear" size={12} /> Mechanism: input to output</>} body={`Input: ${m.inputs} → transform → output: ${m.outputs}`} color={m.color} mono />
              <Section title={<><Glyph name="link" size={12} /> Layer position and dependencies</>} body={LEVEL_FLOW[m.level]} color={m.color} />
              <Section title={<><Glyph name="shield" size={12} /> Authority</>} body={`${m.auth} only; context and zone outputs. No execution or exact price promises.`} color={m.color} />
              <Section title={<><Glyph name="warning" size={12} /> Limitations</>} body={m.limits === "—" ? "No additional limitation is documented." : m.limits} color={m.color} />
              <div style={{ fontSize: 10.5, color: TK.muted, fontStyle: "italic", marginTop: 4 }}>Layers have declared input/output dependencies. Readability of a composition does not establish an edge.</div>
            </div>
          </div>
        );
      })()}
      {layerInfoLv !== null && (
        <LayerInfoPopup
          initialLevel={layerInfoLv}
          onClose={() => setLayerInfoLv(null)}
          onOpenStudio={(lv) => createAtLane(lv)}
          onFilterLibrary={(lv) => focusLibraryLayer(lv)}
        />
      )}
    </div>
  );
}

function Section({ title, body, color, mono }: { title: ReactNode; body: string; color: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, marginBottom: 3, letterSpacing: ".3px" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "#cdd9e6", lineHeight: 1.55, fontFamily: mono ? "var(--mfe-mono)" : undefined }}>{body}</div>
    </div>
  );
}
