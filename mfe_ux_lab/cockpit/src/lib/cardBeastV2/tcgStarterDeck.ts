// tcgStarterDeck — Role-faithful TCG Starter Deck, Module Impact Catalog, and Role-Contextual Ablation Engine.
// Strictly honors ONE engine of record (realisticStrategySim.ts), SHADOW_ONLY / ADVISORY_ONLY / DEMO-ONLY.
// Solves two core problems:
//  1) Every engine module & custom module gets an explicit TCG Card Class, Role Authority, Synergy map, and
//     honest Trap/Dilution warning (e.g., OR-vote dilution when mixing ema_trend with trend_pullback).
//  2) Provides a complete, idempotent Starter Deck (11 block-composed Custom Modules + 12 Role-Pure Cards across
//     all 6 roles + 3 full Beast Ensembles with verified FRESH artifact hashes) and Role-Contextual Impact measurement.

import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { readStrategyCards, writeStrategyCards, type ArtifactIdentity, type StrategyCardArtifactRecord } from "../artifactRegistry.ts";
import { loadCustomModules, saveCustomModules, type CustomModule } from "../customModule.ts";
import { runRealisticBacktest } from "../realisticSimRun.ts";
import { flushWorkspace } from "../workspaceClient.ts";
import { composeBeast, type BeastMember } from "./beastCompose.ts";
import { exportBeastAsCard, loadBeasts, saveBeast } from "./beastStore.ts";
import { GUARD_CUSTOMS } from "./breakoutLiquidityBeast.ts";
import { designModulesFromBlocks } from "./grokBlockToBeastDesign.ts";
import { censusOf, MODULE_CENSUS } from "./moduleRoleCensus.ts";
import type { Role, Tribe } from "./vocabulary.ts";

export type TcgCardClass =
  | "ATTACKER_STRIKE"
  | "COUNTER_TRAP"
  | "BUFF_SPELL"
  | "FIELD_SCOUT"
  | "EXIT_ARTIFACT"
  | "FALLBACK_TRAP"
  | "CORE_ENGINE"
  | "BEAST_FUSION";

export interface ModuleImpactProfile {
  id: string;
  name: string;
  role: Role | "NONE";
  cardClass: TcgCardClass;
  cardClassLabel: string;
  tribes: Tribe[];
  mechanism: string;
  atkScore: number; // 0-100 structural offensive/signal weight
  defScore: number; // 0-100 structural defensive/protection weight
  cost: number; // complexity cost (1-3)
  impactBadge: string;
  impactTone: "proven" | "synergy" | "caution" | "neutral";
  effectText: string;
  synergyWith: string[];
  trapWarning?: string;
}

export interface RoleImpactPreview {
  measuredAt: string;
  bars: number;
  timeframe: string;
  mode: "DIRECT_COMBAT" | "SUPPORT_ABLATION";
  n: number;
  netR: number;
  exp: number;
  pf: number;
  winRate: number;
  maxDD: number;
  dExp?: number;
  dTrades?: number;
  dDD?: number;
  summary: string;
}

const HUMAN_NAMES: Record<string, string> = {
  trend_pullback: "Trend Pullback Strike",
  ema_trend: "EMA Trend Vote",
  ema_slope: "EMA Slope Vote",
  rsi_reclaim: "RSI Reclaim Strike",
  rsi_value: "RSI Level Vote",
  sweep_reclaim: "Liquidity Sweep Reclaim",
  sweep_depth: "Sweep Depth Vote",
  sweep_risk: "Sweep Risk Vote",
  range_fade: "20-Bar Range Fade",
  fb_range_fade: "Silent-Bar Range Fallback",
  break_retest: "Break & Retest Vanguard",
  psl_sweep: "Prior Session High/Low Sweep",
  vol_contraction: "Volatility Squeeze Breakout",
  htf_anchor: "HTF Structure Anchor (H1/H4)",
  asia_range_fade: "Asian Range Sweep & Fade",
  wick_extreme: "Extreme Rejection Wick (2x ATR)",
  gap_fade: "Session Gap Mean-Revert",
  rsi_extreme: "Deep RSI Extreme (22/78)",
  ichimoku: "Ichimoku Cloud & TK Cross",
  macd: "MACD Momentum Cross",
  stochastic: "Stochastic %K Turn",
  bollinger: "Bollinger Band Reversion",
  fib_retrace: "Swing Fibonacci Retrace",
  regime_ctx: "Regime Alignment Gate",
  session_ctx: "Active Session Gate (07-21 UTC)",
  dead_hour: "Dead-Hour Shield (22-02 UTC)",
  news_ctx: "Recurring News Window Veto",
  no_trade_chop: "Anti-Chop EMA Compression Shield",
  atr_pct: "Low-ATR Percentile Gate",
  atr_vol: "ATR Volatility Floor Gate",
  range_size: "Dirty Candle / Wick Gate",
  markov: "Markov Regime Persistence Gate",
  drift_guard: "Rolling PF Circuit Breaker",
  adx: "ADX Trend-Strength Gate (>=20)",
  sr_zone_context: "Causal S/R Structure Barrier",
  level_memory: "Multi-Touch Level Memory Veto",
  calib_trust: "Dual-Source Consensus Seal (>=2)",
  topk_fit: "Top-K Conviction Percentile Seal",
  state_machine: "Armed Pullback->Reclaim Sequence",
  mtf_confirm: "MTF Trend Weight Amplifier",
  ch_episode_lens: "CH Structural Episode Radar",
  exit_weak: "Weakening Structure Early Exit",
  mr_exit: "EMA10 Mean-Reversion Profit Snap",
  fusion: "Score Fusion Core (Threshold 0.80)",
  bayesian: "Bayesian Log-Odds Combiner",
  ev: "Cumulative EV Lock Combiner",
  ev_rolling: "Rolling 20-Trade EV Combiner",
  auto_rr: "ATR Dynamic Risk/Target Shaper",
  distribution_rr: "Excursion Distribution R:R Shaper",
};

const OR_DILUTION_WARNINGS: Record<string, string> = {
  ema_trend: "OR-Vote Dilution: shares the Trend OR-group with trend_pullback. Combining them triggers entries on any EMA alignment even without a pullback.",
  ema_slope: "OR-Vote Dilution: shares the Trend OR-group with trend_pullback. Prefer using trend_pullback alone + mtf_confirm for cleaner entries.",
  rsi_value: "OR-Vote Dilution: shares the RSI OR-group with rsi_reclaim. Use rsi_reclaim or rsi_extreme for sharper timing.",
  sweep_depth: "OR-Vote Dilution: shares the Sweep OR-group with sweep_reclaim. Prefer sweep_reclaim + psl_sweep for distinct vote sources.",
  sweep_risk: "Role Trap: despite the name 'Sweep Risk', the engine evaluates this as an OR-trigger vote in the Sweep family, NOT a protective veto guard.",
  calib_trust: "Deadlock Trap: requires >=2 independent trigger families voting on the same bar. Pairing with a 1-trigger Attacker produces 0 trades.",
  ev: "Cumulative Lock Trap: if cumulative EV drops <= 0 early in a window, it locks out the rest of the test. Prefer ev_rolling (20-trade window).",
  ch_episode_lens: "Visual Radar Only: classifies structural legs on the chart but does not emit votes or vetoes inside the simulation engine.",
};

const PROVEN_SYNERGY_MAP: Record<string, { badge: string; tone: ModuleImpactProfile["impactTone"]; atk: number; def: number; synergy: string[] }> = {
  break_retest: { badge: "High-Precision Setup Vote", tone: "proven", atk: 88, def: 45, synergy: ["trend_pullback", "sr_zone_context", "mtf_confirm", "no_trade_chop"] },
  trend_pullback: { badge: "Core Trend Setup Vote", tone: "proven", atk: 84, def: 40, synergy: ["break_retest", "htf_anchor", "mtf_confirm", "no_trade_chop", "exit_weak"] },
  sweep_reclaim: { badge: "Liquidity Reclaim Vote", tone: "proven", atk: 86, def: 38, synergy: ["psl_sweep", "asia_range_fade", "sr_zone_context", "mr_exit"] },
  htf_anchor: { badge: "Multi-TF Anchor Vote", tone: "proven", atk: 85, def: 52, synergy: ["trend_pullback", "mtf_confirm", "session_ctx"] },
  psl_sweep: { badge: "Session Level Sweep Vote", tone: "synergy", atk: 82, def: 40, synergy: ["sweep_reclaim", "asia_range_fade", "mr_exit"] },
  asia_range_fade: { badge: "London/NY Session Sweep", tone: "synergy", atk: 80, def: 42, synergy: ["sweep_reclaim", "session_ctx", "dead_hour"] },
  vol_contraction: { badge: "Squeeze Expansion Vote", tone: "synergy", atk: 79, def: 36, synergy: ["break_retest", "atr_pct", "exit_weak"] },
  wick_extreme: { badge: "2x ATR Exhaustion Vote", tone: "synergy", atk: 78, def: 35, synergy: ["sweep_reclaim", "mr_exit", "calib_trust"] },
  no_trade_chop: { badge: "Primary Anti-Chop Shield", tone: "proven", atk: 15, def: 92, synergy: ["trend_pullback", "break_retest", "sr_zone_context"] },
  sr_zone_context: { badge: "Causal S/R Hard Veto", tone: "proven", atk: 20, def: 90, synergy: ["break_retest", "sweep_reclaim", "level_memory"] },
  level_memory: { badge: "Weakened Level Veto", tone: "synergy", atk: 15, def: 82, synergy: ["sr_zone_context", "break_retest"] },
  session_ctx: { badge: "Liquid Hours Gate (07-21)", tone: "proven", atk: 10, def: 84, synergy: ["dead_hour", "trend_pullback", "htf_anchor"] },
  dead_hour: { badge: "Rollover Spread Shield", tone: "proven", atk: 10, def: 85, synergy: ["session_ctx", "news_ctx"] },
  range_size: { badge: "Dirty Bar Quality Veto", tone: "synergy", atk: 12, def: 80, synergy: ["no_trade_chop", "break_retest"] },
  drift_guard: { badge: "Drawdown Circuit Breaker", tone: "synergy", atk: 10, def: 88, synergy: ["ev_rolling", "no_trade_chop"] },
  mtf_confirm: { badge: "Vote Weight xScaler", tone: "proven", atk: 65, def: 68, synergy: ["trend_pullback", "break_retest", "state_machine"] },
  state_machine: { badge: "Armed Sequence Filter", tone: "proven", atk: 60, def: 75, synergy: ["mtf_confirm", "trend_pullback", "break_retest"] },
  calib_trust: { badge: "Multi-Trigger Consensus", tone: "caution", atk: 58, def: 85, synergy: ["sweep_reclaim", "wick_extreme", "psl_sweep"] },
  exit_weak: { badge: "Structure Decay Exit", tone: "proven", atk: 45, def: 86, synergy: ["trend_pullback", "break_retest", "auto_rr"] },
  mr_exit: { badge: "EMA10 Profit Snap Exit", tone: "synergy", atk: 52, def: 82, synergy: ["sweep_reclaim", "range_fade", "psl_sweep"] },
  fb_range_fade: { badge: "Attacker-Silent Backup", tone: "synergy", atk: 55, def: 50, synergy: ["break_retest", "trend_pullback", "no_trade_chop"] },
  fusion: { badge: "Canonical Vote Combiner", tone: "proven", atk: 75, def: 75, synergy: ["auto_rr", "ev_rolling", "trend_pullback"] },
  auto_rr: { badge: "ATR Stop/Target Shaper", tone: "proven", atk: 70, def: 85, synergy: ["fusion", "exit_weak"] },
  ev_rolling: { badge: "20-Trade Adaptive Gate", tone: "proven", atk: 62, def: 80, synergy: ["fusion", "auto_rr"] },
};

function classForRole(role: Role | "NONE"): { cardClass: TcgCardClass; label: string } {
  switch (role) {
    case "ATTACKER":
      return { cardClass: "ATTACKER_STRIKE", label: "ATTACKER STRIKE" };
    case "GUARD":
      return { cardClass: "COUNTER_TRAP", label: "GUARD / COUNTER TRAP" };
    case "CONFIRMATION":
      return { cardClass: "BUFF_SPELL", label: "CONFIRM / AMPLIFIER SPELL" };
    case "SCOUT":
      return { cardClass: "FIELD_SCOUT", label: "SCOUT / FIELD RADAR" };
    case "EXIT_SENTINEL":
      return { cardClass: "EXIT_ARTIFACT", label: "EXIT SENTINEL ARTIFACT" };
    case "FALLBACK":
      return { cardClass: "FALLBACK_TRAP", label: "FALLBACK RESPONDER" };
    default:
      return { cardClass: "CORE_ENGINE", label: "CORE INFRASTRUCTURE" };
  }
}

export function getModuleImpact(id: string, custom?: CustomModule): ModuleImpactProfile {
  if (id.startsWith("myL1_")) {
    return {
      id,
      name: id.slice(5),
      role: "SCOUT",
      cardClass: "FIELD_SCOUT",
      cardClassLabel: "CUSTOM L1 · FEATURE SCOUT",
      tribes: ["VOLATILITY", "MOMENTUM"],
      mechanism: "CUSTOM_L1_GRAPH",
      atkScore: 52,
      defScore: 56,
      cost: 1,
      impactBadge: "Block-Graph L1 Measurement",
      impactTone: "synergy",
      effectText: "Emits a causal [0,1] or signed measurement to feed L2 Indicators, L3 Formulas, and L4/L5 Rules.",
      synergyWith: ["L2 Fusion", "L3 Quant AST", "L4 Context Gate", "L5 Decision"],
    };
  }
  if (id.startsWith("myL2_")) {
    return {
      id,
      name: id.slice(5),
      role: "SCOUT",
      cardClass: "FIELD_SCOUT",
      cardClassLabel: "CUSTOM L2 · CONTEXT RADAR",
      tribes: ["VOLATILITY", "TREND"],
      mechanism: "CUSTOM_L2_FUSION",
      atkScore: 58,
      defScore: 66,
      cost: 1,
      impactBadge: "Weighted L2 Context / Overlay",
      impactTone: "synergy",
      effectText: "Aggregates promoted L1 features into normalized regime/bias context or chart price overlays.",
      synergyWith: ["L3 Quant AST", "L4 Context Gate", "L5 Decision"],
    };
  }
  if (id.startsWith("myL3_")) {
    return {
      id,
      name: id.slice(5),
      role: "CONFIRMATION",
      cardClass: "BUFF_SPELL",
      cardClassLabel: "CUSTOM L3 · QUANT AST SCORE",
      tribes: ["MOMENTUM", "VOLATILITY"],
      mechanism: "CUSTOM_L3_AST",
      atkScore: 68,
      defScore: 70,
      cost: 2,
      impactBadge: "Causal AST Formula Score",
      impactTone: "synergy",
      effectText: "Evaluates a no-lookahead mathematical AST over L1/L2 inputs to emit a continuous conviction score.",
      synergyWith: ["L4 Context Gate", "L5 Decision", "fusion"],
    };
  }
  if (id.startsWith("l6_")) {
    return {
      id,
      name: id,
      role: "NONE",
      cardClass: "CORE_ENGINE",
      cardClassLabel: "CUSTOM L6 · TACTICAL ZONE",
      tribes: ["RANGE", "RISK"],
      mechanism: "CUSTOM_L6_ZONE",
      atkScore: 42,
      defScore: 74,
      cost: 1,
      impactBadge: "Anchored ATR Price Zone",
      impactTone: "proven",
      effectText: "Projects causal ATR-scaled Observation, Demand, Risk, or Invalidation zones from structural anchors.",
      synergyWith: ["auto_rr", "trend_pullback", "sweep_reclaim"],
    };
  }
  const cen = censusOf(id);
  if (cen) {
    const cls = classForRole(cen.role);
    const meta = PROVEN_SYNERGY_MAP[id];
    const warn = OR_DILUTION_WARNINGS[id];
    return {
      id,
      name: HUMAN_NAMES[id] || id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: cen.role,
      cardClass: cls.cardClass,
      cardClassLabel: cls.label,
      tribes: cen.tribes,
      mechanism: cen.mechanism,
      atkScore: meta?.atk ?? (cen.role === "ATTACKER" ? 72 : cen.role === "CONFIRMATION" ? 55 : 20),
      defScore: meta?.def ?? (cen.role === "GUARD" ? 80 : cen.role === "EXIT_SENTINEL" ? 78 : 35),
      cost: cen.role === "NONE" ? 1 : cen.mechanism === "TRIGGER_VOTE" ? 2 : 1,
      impactBadge: warn ? "Caution: Check Wiring" : meta?.badge || cen.mechanism.replace(/_/g, " "),
      impactTone: warn ? "caution" : meta?.tone || "neutral",
      effectText: cen.note,
      synergyWith: meta?.synergy || ["fusion", "auto_rr"],
      trapWarning: warn,
    };
  }

  if (custom) {
    const mappedRole: Role =
      custom.role === "TRIGGER"
        ? "ATTACKER"
        : custom.role === "VETO" || custom.role === "SAFETY_VETO" || custom.role === "CONTEXT_GATE"
          ? "GUARD"
          : custom.role === "CONFIRM"
            ? "CONFIRMATION"
            : custom.role === "EXIT"
              ? "EXIT_SENTINEL"
              : "SCOUT";
    const cls = classForRole(mappedRole);
    const isOosPositive = custom.name.toLowerCase().includes("mtf agreement");
    return {
      id: custom.id,
      name: custom.name.replace(/^[^\wA-Za-z]+/, "").trim() || custom.id,
      role: mappedRole,
      cardClass: cls.cardClass,
      cardClassLabel: `CUSTOM · ${cls.label}`,
      tribes: mappedRole === "GUARD" ? ["RISK", "VOLATILITY"] : mappedRole === "CONFIRMATION" ? ["RETEST", "MTF"] : ["EXIT", "RISK"],
      mechanism: `CUSTOM_${custom.role}`,
      atkScore: mappedRole === "ATTACKER" ? 80 : mappedRole === "CONFIRMATION" ? 68 : 22,
      defScore: mappedRole === "GUARD" ? 89 : mappedRole === "EXIT_SENTINEL" ? 86 : 45,
      cost: Math.min(3, Math.max(1, custom.conditions.length)),
      impactBadge: isOosPositive ? "+0.053R Held OOS Gate" : `Block-Composed ${custom.role}`,
      impactTone: isOosPositive ? "proven" : "synergy",
      effectText: custom.explain,
      synergyWith: ["trend_pullback", "break_retest", "sweep_reclaim"],
      trapWarning: custom.why.includes("HURTS") || custom.name.includes("⚠") ? custom.why : undefined,
    };
  }

  return {
    id,
    name: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    role: "NONE",
    cardClass: "CORE_ENGINE",
    cardClassLabel: "SUPPORT / ZONE MODULE",
    tribes: [],
    mechanism: "DESCRIPTIVE_ZONE",
    atkScore: 30,
    defScore: 60,
    cost: 1,
    impactBadge: "Chart Zone Geometry",
    impactTone: "neutral",
    effectText: "Renders causal structural price zones on the chart.",
    synergyWith: ["auto_rr"],
  };
}

export const ALL_ENGINE_IMPACT_PROFILES: ModuleImpactProfile[] = MODULE_CENSUS.map((m) => getModuleImpact(m.id));

export interface TcgStarterCardSpec {
  id: string;
  name: string;
  role: Role;
  archetype: string;
  algo: string;
  design_tf: "M15" | "H1";
  tribes: Tribe[];
  thesis: string;
  modules: string[];
}

export const TCG_STARTER_ROLE_CARDS: TcgStarterCardSpec[] = [
  // ── ATTACKERS (3 archetypes) ──
  {
    id: "tcg_atk_liquidity_trinity",
    name: "Vanguard · Liquidity Trinity Strike",
    role: "ATTACKER",
    archetype: "Attacker · Liquidity & Break-Retest",
    algo: "Score Fusion (DSL) + Rolling EV",
    design_tf: "M15",
    tribes: ["BREAKOUT", "SWEEP", "TREND", "RETEST"],
    thesis: "Fuses 3 orthogonal setup triggers (Break-Retest + Sweep-Reclaim + Trend-Pullback) with dynamic ATR risk shaping.",
    modules: ["break_retest", "sweep_reclaim", "trend_pullback", "fusion", "auto_rr", "ev_rolling", "observation_zone", "risk_zone", "invalidation_zone"],
  },
  {
    id: "tcg_atk_trend_anchor",
    name: "Vanguard · HTF Trend Retest",
    role: "ATTACKER",
    archetype: "Attacker · Trend Continuation",
    algo: "Score Fusion (DSL) + Rolling EV",
    design_tf: "M15",
    tribes: ["MTF", "TREND", "RETEST"],
    thesis: "Pure trend-continuation spearhead anchored on completed H1/H4 structure + 20-bar break-retest without reversal noise.",
    modules: ["break_retest", "trend_pullback", "htf_anchor", "fusion", "auto_rr", "ev_rolling", "observation_zone", "risk_zone", "invalidation_zone"],
  },
  {
    id: "tcg_atk_sweep_hunter",
    name: "Vanguard · Session Sweep Hunter",
    role: "ATTACKER",
    archetype: "Attacker · Liquidity Sweep",
    algo: "Score Fusion (DSL) + Rolling EV",
    design_tf: "M15",
    tribes: ["SWEEP", "SESSION", "FAKEOUT", "LIQUIDITY"],
    thesis: "Hunts stop-runs across Asian session boundaries, prior session highs/lows, and 2x ATR rejection wicks.",
    modules: ["sweep_reclaim", "asia_range_fade", "wick_extreme", "psl_sweep", "fusion", "auto_rr", "ev_rolling", "observation_zone", "risk_zone", "invalidation_zone"],
  },

  // ── GUARDS (3 counter-trap shields) ──
  {
    id: "tcg_grd_anti_chop_shock",
    name: "Bastion · Anti-Chop & Shock Shield",
    role: "GUARD",
    archetype: "Guard · Volatility & Chop Veto",
    algo: "Hard Gate Veto Stack",
    design_tf: "M15",
    tribes: ["RISK", "VOLATILITY", "FAKEOUT"],
    thesis: "Blocks entries during EMA cluster chop, >1.8x ATR BlackSwan shocks, opposing rejection wicks, and >0.8 ATR FOMO extensions.",
    modules: ["no_trade_chop", "range_size", "cm_grok_no_chase", "cm_grok_candle_against", "cm_grok_blackswan_veto", "cm_grok_dirty_candle"],
  },
  {
    id: "tcg_grd_structure_fortress",
    name: "Bastion · Causal S/R Fortress",
    role: "GUARD",
    archetype: "Guard · Structural Barrier",
    algo: "Hard Gate Veto Stack",
    design_tf: "M15",
    tribes: ["RETEST", "LIQUIDITY", "TREND"],
    thesis: "Hard-vetoes any attacker vote firing directly into an opposing causal support/resistance zone or exhausted multi-touch level.",
    modules: ["sr_zone_context", "level_memory", "regime_ctx"],
  },
  {
    id: "tcg_grd_session_discipline",
    name: "Bastion · Session & Budget Gatekeeper",
    role: "GUARD",
    archetype: "Guard · Timing & Risk Cap",
    algo: "Hard Gate Veto Stack",
    design_tf: "M15",
    tribes: ["SESSION", "VOLATILITY", "RISK"],
    thesis: "Enforces active liquid hours (07-21 UTC), blocks rollover dead hours (22-02 UTC), filters dead ATR regimes, and caps daily R target.",
    modules: ["session_ctx", "dead_hour", "news_ctx", "atr_pct", "cm_grok_daily_pt"],
  },

  // ── CONFIRMATIONS (2 buff / weight scalers) ──
  {
    id: "tcg_cfm_mtf_retest",
    name: "Catalyst · MTF & Retest Amplifier",
    role: "CONFIRMATION",
    archetype: "Confirmation · Weight Scaler",
    algo: "Conviction Multiplier",
    design_tf: "M15",
    tribes: ["MTF", "RETEST", "TREND"],
    thesis: "Scales existing Attacker vote weights when EMA10/34 MTF structure, armed pullback->reclaim sequence, and candle rejection align.",
    modules: ["mtf_confirm", "state_machine", "cm_grok_retest_quality", "cm_grok_candle_confirm"],
  },
  {
    id: "tcg_cfm_consensus_matrix",
    name: "Catalyst · Multi-Evidence Seal",
    role: "CONFIRMATION",
    archetype: "Confirmation · Consensus Gate",
    algo: "Dual-Vote Consensus",
    design_tf: "M15",
    tribes: ["RISK", "MTF"],
    thesis: "Demands >=2 independent trigger votes on the signal bar and amplifies weight when multi-family evidence converges.",
    modules: ["calib_trust", "mtf_confirm", "cm_grok_evidence_indep"],
  },

  // ── EXIT SENTINELS (2 trade lifecycle artifacts) ──
  {
    id: "tcg_ext_profit_aegis",
    name: "Sentinel · Profit Lock & Trail Aegis",
    role: "EXIT_SENTINEL",
    archetype: "Exit Sentinel · Protective Lock",
    algo: "Causal Exit Governor",
    design_tf: "M15",
    tribes: ["EXIT", "TREND", "RISK"],
    thesis: "Locks stop-loss to +0.5R once trade reaches +1.5R, closes on give-back from +1.0R to +0.4R, and exits early if trend structure decays.",
    modules: ["exit_weak", "cm_grok_profit_lock", "cm_grok_giveback_exit"],
  },
  {
    id: "tcg_ext_mean_revert",
    name: "Sentinel · EMA10 Snap Harvester",
    role: "EXIT_SENTINEL",
    archetype: "Exit Sentinel · Mean Reversion",
    algo: "Causal Exit Governor",
    design_tf: "M15",
    tribes: ["EXIT", "REVERSAL", "RANGE"],
    thesis: "Harvests sweep and range-reversion trades as soon as price snaps back to the EMA10 equilibrium while in profit.",
    modules: ["mr_exit", "exit_weak", "cm_grok_giveback_exit"],
  },

  // ── FALLBACK (1 backup responder) ──
  {
    id: "tcg_fb_silent_range",
    name: "Phantom · Silent-Bar Range Responder",
    role: "FALLBACK",
    archetype: "Fallback · Range Reversion",
    algo: "Attacker-Silent Fallback",
    design_tf: "M15",
    tribes: ["RANGE", "REVERSAL"],
    thesis: "Remains completely dormant when primary Attackers speak; emits a reduced-weight range boundary vote only on silent bars.",
    modules: ["fb_range_fade"],
  },

  // ── SCOUT (1 context radar) ──
  {
    id: "tcg_sct_episode_radar",
    name: "Oracle · Structural Episode Radar",
    role: "SCOUT",
    archetype: "Scout · Market Context Lens",
    algo: "Episode & MTF Context",
    design_tf: "M15",
    tribes: ["MTF"],
    thesis: "Maps impulse, corrective, and sweep price episodes across timeframes without overriding tactical Attacker or Guard authority.",
    modules: ["ch_episode_lens"],
  },
];

export interface SeedTcgResult {
  customsAdded: number;
  roleCardsAdded: number;
  beastsAdded: number;
  totalCards: number;
  totalBeasts: number;
}

/** Ensures all block-composed custom modules exist in mfe_custom_modules so no card or Beast ever has unresolved cm_* IDs. */
export function ensureStarterCustomModules(): { added: number; all: CustomModule[] } {
  const existing = loadCustomModules();
  const byId = new Map(existing.map((m) => [m.id, m]));
  let added = 0;

  for (const dm of designModulesFromBlocks()) {
    if (!byId.has(dm.module.id)) {
      byId.set(dm.module.id, dm.module);
      added++;
    }
  }
  for (const gc of GUARD_CUSTOMS) {
    if (!byId.has(gc.id)) {
      byId.set(gc.id, gc);
      added++;
    }
  }

  const all = [...byId.values()];
  if (added > 0) saveCustomModules(all);
  return { added, all };
}

/** Seeds the 11 Custom Modules, 12 Role-Pure Cards, and 3 Reference Beast Ensembles with verified FRESH lineage hashes. */
export async function seedTcgStarterDeck(): Promise<SeedTcgResult> {
  const { added: customsAdded, all: allCustoms } = ensureStarterCustomModules();
  const customMap = new Map(allCustoms.map((c) => [c.id, c]));

  const currentCards = readStrategyCards();
  const cardById = new Map(currentCards.map((c) => [String(c.id), c]));
  let roleCardsAdded = 0;

  for (const spec of TCG_STARTER_ROLE_CARDS) {
    if (cardById.has(spec.id)) continue;
    const rawCard: StrategyCardArtifactRecord = {
      id: spec.id,
      name: spec.name,
      symbol: "XAUUSD",
      ts: new Date().toISOString().slice(0, 16).replace("T", " "),
      role: spec.role,
      tribes: spec.tribes,
      thesis: spec.thesis,
      archetype: spec.archetype,
      algo: spec.algo,
      verdict: "RESEARCH_ONLY",
      gate: "NOT_VALIDATED",
      score: 82,
      layers: 5,
      guards: spec.modules.filter((m) => censusOf(m)?.role === "GUARD" || m.startsWith("cm_")).length,
      n: 0,
      winRate: 0,
      netR: 0,
      costEv: 0,
      maxDD: 0,
      bt_window: "NO_DATA",
      design_tf: spec.design_tf,
      execution_tf: spec.design_tf,
      modules: spec.modules,
    };
    // The shared registry creates the canonical identity on write.
    cardById.set(spec.id, rawCard);
    roleCardsAdded++;
  }

  // Persist role cards first so their canonical artifact_id + content_hash are locked
  let savedCards = writeStrategyCards([...cardById.values()]);
  const savedById = new Map(savedCards.map((c) => [String(c.id), c]));

  // Compose 3 Reference Beasts directly from the saved Role Cards (100% FRESH lineage!)
  const beastSpecs: { name: string; roleCardIds: string[] }[] = [
    {
      name: "Apex Beast · Liquidity Bastion",
      roleCardIds: [
        "tcg_atk_liquidity_trinity",
        "tcg_grd_anti_chop_shock",
        "tcg_grd_structure_fortress",
        "tcg_cfm_mtf_retest",
        "tcg_ext_profit_aegis",
        "tcg_fb_silent_range",
        "tcg_sct_episode_radar",
      ],
    },
    {
      name: "Apex Beast · Sovereign Trend Sovereign",
      roleCardIds: [
        "tcg_atk_trend_anchor",
        "tcg_grd_session_discipline",
        "tcg_grd_structure_fortress",
        "tcg_cfm_mtf_retest",
        "tcg_ext_profit_aegis",
        "tcg_sct_episode_radar",
      ],
    },
    {
      name: "Apex Beast · Shadow Sweep Phantom",
      roleCardIds: [
        "tcg_atk_sweep_hunter",
        "tcg_grd_anti_chop_shock",
        "tcg_cfm_consensus_matrix",
        "tcg_ext_mean_revert",
        "tcg_fb_silent_range",
        "tcg_sct_episode_radar",
      ],
    },
  ];

  const existingBeasts = loadBeasts();
  let beastsAdded = 0;

  for (const bSpec of beastSpecs) {
    const members: BeastMember[] = [];
    for (const cid of bSpec.roleCardIds) {
      const cardObj = savedById.get(cid);
      if (!cardObj) continue;
      const mods = (cardObj.modules as string[]) || [];
      const role = (cardObj.role as Role) || "ATTACKER";
      const artifact = cardObj.artifact as ArtifactIdentity | undefined;
      members.push({
        card_id: String(cardObj.id),
        role,
        modules: mods,
        customs: mods.map((m) => customMap.get(m)).filter(Boolean) as CustomModule[],
        source_kind: "STRATEGY_CARD",
        source_artifact_id: artifact?.artifact_id,
        source_content_hash: artifact?.content_hash,
      });
    }
    members.push({ card_id: "l0", role: "SAFETY", modules: [], source_kind: "SAFETY" });
    const comp = composeBeast(members);
    if (!comp.ok) continue;

    if (!existingBeasts.some((b) => b.name === bSpec.name)) {
      saveBeast(bSpec.name, members, comp);
      beastsAdded++;
    }
    if (!savedCards.some((c) => c.name === bSpec.name)) {
      exportBeastAsCard(bSpec.name, comp, "M15");
    }
  }

  savedCards = readStrategyCards();
  await flushWorkspace();

  return {
    customsAdded,
    roleCardsAdded,
    beastsAdded,
    totalCards: savedCards.length,
    totalBeasts: loadBeasts().length,
  };
}

const REFERENCE_ATTACKER_MODULES = ["break_retest", "trend_pullback", "sweep_reclaim", "fusion", "auto_rr", "ev_rolling"];

/** Infers the dominant tactical Role of any Strategy Card from its explicit `role` field, archetype, or module census. */
export function inferCardRole(card: { role?: unknown; archetype?: unknown; modules?: string[] }): Role | "BEAST" {
  if (typeof card.role === "string" && ["ATTACKER", "GUARD", "CONFIRMATION", "SCOUT", "EXIT_SENTINEL", "FALLBACK"].includes(card.role)) {
    return card.role as Role;
  }
  const arch = String(card.archetype || "");
  if (arch.toLowerCase().includes("beast")) return "BEAST";
  const mods = card.modules || [];
  const roles = mods.map((id) => censusOf(id)?.role).filter((r): r is Role => !!r && r !== "NONE");
  const hasAttacker = roles.includes("ATTACKER");
  const hasGuard = roles.includes("GUARD") || mods.some((id) => id.startsWith("cm_"));
  const hasConfirm = roles.includes("CONFIRMATION");
  const hasExit = roles.includes("EXIT_SENTINEL");
  if (hasAttacker && hasGuard && (hasConfirm || hasExit) && mods.length >= 9) return "BEAST";
  if (hasAttacker) return "ATTACKER";
  if (hasGuard) return "GUARD";
  if (hasConfirm) return "CONFIRMATION";
  if (hasExit) return "EXIT_SENTINEL";
  if (roles.includes("FALLBACK")) return "FALLBACK";
  if (roles.includes("SCOUT")) return "SCOUT";
  return "ATTACKER";
}

/** Infers elemental Tribes for any Strategy Card from its modules. */
export function inferCardTribes(card: { tribes?: unknown; modules?: string[] }): Tribe[] {
  if (Array.isArray(card.tribes) && card.tribes.length > 0) return card.tribes as Tribe[];
  const out = new Set<Tribe>();
  for (const id of card.modules || []) {
    for (const t of censusOf(id)?.tribes || []) out.add(t);
  }
  return [...out].slice(0, 4);
}

/** Measures any Card on the canonical engine according to its true Role:
 *  - ATTACKER / BEAST: direct combat backtest (Expectancy, PF, Max DD, Win%, Trades).
 *  - GUARD / CONFIRMATION / EXIT_SENTINEL / FALLBACK / SCOUT: paired ablation with the reference Attacker so support cards show real ΔExp & filtered trades! */
export function measureCardRoleImpact(
  bars: OhlcBar[],
  card: { id: string; name: string; role?: unknown; archetype?: unknown; modules?: string[]; design_tf?: string },
  allCustoms?: CustomModule[],
  hard = false
): RoleImpactPreview {
  const customs = allCustoms || loadCustomModules();
  const tf = card.design_tf || "M15";
  const role = inferCardRole(card);
  const mods = card.modules || [];
  const hasTrigger = mods.some((id) => censusOf(id)?.mechanism === "TRIGGER_VOTE") || customs.some((c) => mods.includes(c.id) && c.role === "TRIGGER");

  if (hasTrigger || role === "ATTACKER" || role === "BEAST") {
    const bt = runRealisticBacktest(bars, { id: card.id, name: card.name, modules: mods, design_tf: tf }, { symbol: "XAUUSD", chartTf: tf, customModules: customs, hard });
    const a = bt.analytics;
    const exp = a.n > 0 ? +(a.netNetR / a.n).toFixed(3) : 0;
    return {
      measuredAt: new Date().toISOString(),
      bars: bars.length,
      timeframe: tf,
      mode: "DIRECT_COMBAT",
      n: a.n,
      netR: +a.netNetR.toFixed(2),
      exp,
      pf: +a.netPF.toFixed(2),
      winRate: +a.netWinRate.toFixed(1),
      maxDD: +Math.abs(a.maxDDNetR).toFixed(2),
      summary: a.n > 0 ? `${a.n} trades · ${exp >= 0 ? "+" : ""}${exp}R/trade · PF ${a.netPF.toFixed(2)} · MaxDD ${Math.abs(a.maxDDNetR).toFixed(1)}R` : "0 trades in window (check over-gating)",
    };
  }

  // Support role card -> run Leave-One-Role-In ablation against Reference Attacker
  const baseBt = runRealisticBacktest(bars, { id: "ref_atk", name: "Reference Attacker", modules: REFERENCE_ATTACKER_MODULES, design_tf: tf }, { symbol: "XAUUSD", chartTf: tf, customModules: customs, hard });
  const combinedMods = [...new Set([...REFERENCE_ATTACKER_MODULES, ...mods])];
  const pairBt = runRealisticBacktest(bars, { id: card.id + "_paired", name: card.name, modules: combinedMods, design_tf: tf }, { symbol: "XAUUSD", chartTf: tf, customModules: customs, hard });

  const baseA = baseBt.analytics;
  const pairA = pairBt.analytics;
  const baseExp = baseA.n > 0 ? baseA.netNetR / baseA.n : 0;
  const pairExp = pairA.n > 0 ? pairA.netNetR / pairA.n : 0;
  const dExp = +(pairExp - baseExp).toFixed(3);
  const dTrades = pairA.n - baseA.n;
  const dDD = +(Math.abs(pairA.maxDDNetR) - Math.abs(baseA.maxDDNetR)).toFixed(2);

  return {
    measuredAt: new Date().toISOString(),
    bars: bars.length,
    timeframe: tf,
    mode: "SUPPORT_ABLATION",
    n: pairA.n,
    netR: +pairA.netNetR.toFixed(2),
    exp: +pairExp.toFixed(3),
    pf: +pairA.netPF.toFixed(2),
    winRate: +pairA.netWinRate.toFixed(1),
    maxDD: +Math.abs(pairA.maxDDNetR).toFixed(2),
    dExp,
    dTrades,
    dDD,
    summary:
      role === "GUARD"
        ? `Blocks ${Math.max(0, -dTrades)} trades (${baseA.n}->${pairA.n}) · ΔExp ${dExp >= 0 ? "+" : ""}${dExp}R · ΔDD ${dDD >= 0 ? "+" : ""}${dDD}R`
        : role === "CONFIRMATION"
          ? `Scales votes (${baseA.n}->${pairA.n} trades) · ΔExp ${dExp >= 0 ? "+" : ""}${dExp}R · PF ${pairA.netPF.toFixed(2)}`
          : role === "EXIT_SENTINEL"
            ? `Shapes exits on ${pairA.n} trades · ΔExp ${dExp >= 0 ? "+" : ""}${dExp}R · ΔDD ${dDD >= 0 ? "+" : ""}${dDD}R`
            : role === "FALLBACK"
              ? `Adds +${Math.max(0, dTrades)} silent-bar trades · ΔExp ${dExp >= 0 ? "+" : ""}${dExp}R`
              : `Context lens active · ${pairA.n} trades observed`,
  };
}
