// grokBlockToBeastDesign — full pipeline: BLOCK recipes → CustomModule → Strategy cards (per role) → Beast → Library.
// Authority: SHADOW_ONLY / ADVISORY_ONLY / DEMO · no order_send · no lot/SL-TP numbers · Microscope uses same engine.
//
// Design intent (honest):
//   Build COMPLETE beasts from the system's own block-compose + role census machinery, then measure with
//   runRealisticBacktest (identical to Microscope). No edge promise — numbers are descriptive SHADOW evidence.
import { compileL5, type L5Recipe } from "../blocks/l5Compile.ts";
import { MODULE_PRESETS, loadCustomModules, saveCustomModules, validateModule, type CustomModule } from "../customModule.ts";
import { composeBeast, type BeastMember } from "./beastCompose.ts";
import { exportBeastAsCard, loadBeasts, saveBeast, type SavedBeast } from "./beastStore.ts";
import { readStrategyCards } from "../artifactRegistry.ts";

export const DESIGN_AUTHORITY = {
  advisory_only: true,
  order_send_allowed: false,
  auto_trade_allowed: false,
  status: "SHADOW_ONLY",
  live_apply_allowed: false,
} as const;

// ── 1) BLOCK → MODULE (L5 recipes + proven presets) ──────────────────────────
// Each recipe cites L5 block ids from l5BlockLibrary (graph-backed) and metrics from the fixed catalog.

const L5_RECIPES: L5Recipe[] = [
  {
    name: "BLK · No-Chase Extension Veto",
    explain: "Veto entry when price already extended >0.8 ATR past 20-bar level (anti-FOMO chase).",
    why: "Chasing extension forces wide stops and gets wicked by retests; stand aside and let retest modules fire cleanly.",
    terminal: "VETO",
    veto: [{ blockId: "overextended_veto", metric: "extAtr", op: ">", value: 0.8 }],
  },
  {
    name: "BLK · Candle-Against Veto",
    explain: "Veto when candle pattern rejects AGAINST the vote direction (candleAlign == -1).",
    why: "Entering long into a shooting-star/engulfing-down fights the evidence on the signal bar.",
    terminal: "VETO",
    veto: [{ blockId: "conflict_veto", metric: "candleAlign", op: "==", value: -1 }],
  },
  {
    name: "BLK · Candle Rejection Confirm",
    explain: "Scale vote weight when candle rejection ALIGNS with the vote (candleAlign == 1).",
    why: "Independent confirmation: level + rejection candle tell the same story; CONFIRM never creates a vote.",
    terminal: "TRIGGER", // compileL5 maps TRIGGER for setup; we override role post-compile for CONFIRM below
    direction: "REGIME",
    setup: [{ blockId: "retest_confirm", metric: "candleAlign", op: "==", value: 1 }],
    weight: 1.2,
    reliability: 0.55,
  },
  {
    name: "BLK · Give-back Smart Trailing Exit",
    explain: "Close when trade reached ≥+1R then gave back to ≤+0.4R.",
    why: "Protect open profit instead of letting winners evaporate — discipline exit, not edge claim.",
    terminal: "EXIT",
    exit: [
      { blockId: "trailing_hint", metric: "maxR", op: ">=", value: 1.0 },
      { blockId: "thesis_weakening", metric: "rMultiple", op: "<=", value: 0.4 },
    ],
    exitAction: "CLOSE",
  },
  {
    name: "BLK · Profit Lock +0.5R",
    explain: "Once maxR ≥ +1.5R, protectively lock SL to +0.5R (never widen).",
    why: "Protective-only trail of open profit; SHADOW discipline tool.",
    terminal: "EXIT",
    exit: [{ blockId: "trailing_hint", metric: "maxR", op: ">=", value: 1.5 }],
    exitAction: "LOCK_SL",
    lockR: 0.5,
  },
  {
    name: "BLK · BlackSwan Shock Veto",
    explain: "Veto on shock footprint: ATR>1.8× baseline OR price stretched beyond ±2.5 ATR from EMA10.",
    why: "Vol/shock regime is risk-first — stand aside before direction games.",
    terminal: "VETO",
    veto: [
      { blockId: "danger_spread_veto", metric: "atrRatio", op: ">", value: 1.8 },
      { blockId: "overextended_veto", metric: "priceEmaAtr", op: "outside", value: -2.5, value2: 2.5 },
    ],
  },
];

export interface DesignedModule {
  id: string;
  source: "L5_RECIPE" | "PRESET";
  recipeName: string;
  module: CustomModule;
  blockGraph?: string[];
  validationOk: boolean;
  validationErrors: string[];
}

function presetModule(label: string, idSuffix: string): DesignedModule | null {
  const p = MODULE_PRESETS.find((x) => x.label === label);
  if (!p) return null;
  const module: CustomModule = {
    id: "cm_grok_" + idSuffix,
    createdAt: "2026-07-19T00:00:00Z",
    status: "SHADOW",
    level: (p.draft.level as CustomModule["level"]) ?? 5,
    role: p.draft.role as CustomModule["role"],
    name: (p.draft.name as string) || label,
    explain: p.draft.explain as string,
    why: p.draft.why as string,
    conditions: (p.draft.conditions as CustomModule["conditions"]) || [],
    logic: (p.draft.logic as "ALL" | "ANY") || "ALL",
    direction: p.draft.direction as CustomModule["direction"],
    weight: p.draft.weight as number | undefined,
    reliability: p.draft.reliability as number | undefined,
    exitAction: p.draft.exitAction as CustomModule["exitAction"],
    lockR: p.draft.lockR as number | undefined,
  };
  const v = validateModule(module);
  return { id: module.id, source: "PRESET", recipeName: label, module, validationOk: v.ok, validationErrors: v.errors };
}

/** Compile all block recipes + select high-value presets into SHADOW custom modules. */
export function designModulesFromBlocks(): DesignedModule[] {
  const out: DesignedModule[] = [];

  for (const recipe of L5_RECIPES) {
    const compiled = compileL5(recipe);
    // Fix CONFIRM recipe: compileL5 forces TRIGGER for setup-style — remap candle-align confirm to CONFIRM role.
    let mod = compiled.module;
    if (recipe.name.includes("Candle Rejection Confirm")) {
      mod = {
        ...mod,
        id: "cm_grok_candle_confirm",
        role: "CONFIRM",
        direction: undefined,
        weight: recipe.weight ?? 1.2,
        reliability: undefined,
        name: "Candle rejection confirm (block)",
      };
    } else {
      mod = { ...mod, id: "cm_grok_" + recipe.name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40).toLowerCase() };
    }
    // OR-logic for multi-metric shock veto (ANY of the shock conditions)
    if (recipe.name.includes("BlackSwan")) {
      mod = { ...mod, logic: "ANY", id: "cm_grok_blackswan_veto" };
    }
    if (recipe.name.includes("No-Chase")) mod = { ...mod, id: "cm_grok_no_chase" };
    if (recipe.name.includes("Candle-Against")) mod = { ...mod, id: "cm_grok_candle_against" };
    if (recipe.name.includes("Give-back")) mod = { ...mod, id: "cm_grok_giveback_exit" };
    if (recipe.name.includes("Profit Lock")) mod = { ...mod, id: "cm_grok_profit_lock" };

    const v = validateModule(mod);
    out.push({
      id: mod.id,
      source: "L5_RECIPE",
      recipeName: recipe.name,
      module: mod,
      blockGraph: compiled.graph.nodes.map((n) => n.blockId),
      validationOk: v.ok,
      validationErrors: v.errors,
    });
  }

  // Proven presets (already block-composed in MODULE_PRESETS)
  for (const [label, suf] of [
    ["🧭 MTF Agreement Gate (QTQ · block-composed)", "mtf_agreement_gate"],
    ["🔍 Retest Quality (QTQ · CONFIRM)", "retest_quality"],
    ["🧬 Evidence Independence (MFE · CONFIRM)", "evidence_indep"],
    ["🕯 Candle Pattern Guard (MFE · block-composed)", "dirty_candle"],
    ["🎯 Daily Profit Target (Lab · block-composed)", "daily_pt"],
  ] as const) {
    const m = presetModule(label, suf);
    if (m) out.push(m);
  }

  return out;
}

// ── 2) MODULE → STRATEGY (role-aligned cards) ────────────────────────────────
// A "strategy" here is a role-faithful card: modules legal for that role + optional customs.

export interface DesignedStrategy {
  card_id: string;
  name: string;
  role: BeastMember["role"];
  thesis: string;
  engineModules: string[];
  customIds: string[];
}

export function designStrategies(mods: DesignedModule[]): DesignedStrategy[] {
  const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
  const id = (...keys: string[]) => keys.filter((k) => byId[k]).map((k) => k);

  return [
    // ── BEAST A strategies ──
    {
      card_id: "str_A_attacker_liquidity",
      name: "Strategy · Liquidity Attacker (break+sweep+pullback)",
      role: "ATTACKER",
      thesis: "Hybrid fused attacker: break-retest + sweep-reclaim + trend-pullback → one setup root (fusion).",
      engineModules: ["break_retest", "sweep_reclaim", "trend_pullback", "fusion", "auto_rr", "ev_rolling"],
      customIds: [],
    },
    {
      card_id: "str_A_guard_discipline",
      name: "Strategy · Discipline Guard stack",
      role: "GUARD",
      thesis: "Hard gates: chop + dirty entry + no-chase + candle-against + blackswan + dirty wick.",
      engineModules: ["no_trade_chop", "range_size"],
      customIds: id("cm_grok_no_chase", "cm_grok_candle_against", "cm_grok_blackswan_veto", "cm_grok_dirty_candle"),
    },
    {
      card_id: "str_A_structure_guard",
      name: "Strategy · Structure Guard (S/R + level memory)",
      role: "GUARD",
      thesis: "Engine hard veto at causal S/R and weakened levels.",
      engineModules: ["sr_zone_context", "level_memory"],
      customIds: [],
    },
    {
      card_id: "str_A_confirm_quality",
      name: "Strategy · Quality Confirmation",
      role: "CONFIRMATION",
      thesis: "MTF weight scaler + armed state machine + candle/retest/evidence confirms (weight only).",
      engineModules: ["mtf_confirm", "state_machine"],
      customIds: id("cm_grok_candle_confirm", "cm_grok_retest_quality", "cm_grok_evidence_indep"),
    },
    {
      card_id: "str_A_fallback",
      name: "Strategy · Liquidity Fallback",
      role: "FALLBACK",
      thesis: "fb_range_fade only speaks when ALL primary attackers silent on the bar.",
      engineModules: ["fb_range_fade"],
      customIds: [],
    },
    {
      card_id: "str_A_scout",
      name: "Strategy · Episode Scout",
      role: "SCOUT",
      thesis: "CH episode lens — context only, no veto, no candidate.",
      engineModules: ["ch_episode_lens"],
      customIds: [],
    },
    {
      card_id: "str_A_exit",
      name: "Strategy · Exit Sentinel + path discipline",
      role: "EXIT_SENTINEL",
      thesis: "Structure-weak exit + give-back close + profit lock.",
      engineModules: ["exit_weak"],
      customIds: id("cm_grok_giveback_exit", "cm_grok_profit_lock"),
    },

    // ── BEAST B strategies (session trend) ──
    {
      card_id: "str_B_attacker_trend",
      name: "Strategy · Trend Retest Attacker",
      role: "ATTACKER",
      thesis: "Clean trend-continuation tribe only — no reverse mix-in.",
      engineModules: ["break_retest", "trend_pullback", "htf_anchor", "fusion", "auto_rr", "ev_rolling"],
      customIds: [],
    },
    {
      card_id: "str_B_guard_session",
      name: "Strategy · Session + Vol Guard",
      role: "GUARD",
      thesis: "Session window + dead hour + chop + ATR vol + daily profit stop.",
      engineModules: ["session_ctx", "dead_hour", "no_trade_chop", "atr_pct", "range_size"],
      customIds: id("cm_grok_daily_pt", "cm_grok_no_chase"),
    },
    {
      card_id: "str_B_confirm",
      name: "Strategy · MTF + Sequence Confirm",
      role: "CONFIRMATION",
      thesis: "mtf_confirm + state_machine + MTF agreement gate as confirm weight path.",
      engineModules: ["mtf_confirm", "state_machine"],
      customIds: id("cm_grok_retest_quality"),
    },
    {
      card_id: "str_B_structure",
      name: "Strategy · SR Structure Guard B",
      role: "GUARD",
      thesis: "S/R causal veto only.",
      engineModules: ["sr_zone_context"],
      customIds: [],
    },
    {
      card_id: "str_B_scout",
      name: "Strategy · Episode Scout B",
      role: "SCOUT",
      thesis: "Episode observer.",
      engineModules: ["ch_episode_lens"],
      customIds: [],
    },
    {
      card_id: "str_B_exit",
      name: "Strategy · Exit + Lock B",
      role: "EXIT_SENTINEL",
      thesis: "exit_weak + profit lock ladder.",
      engineModules: ["exit_weak"],
      customIds: id("cm_grok_profit_lock", "cm_grok_giveback_exit"),
    },

    // ── BEAST C strategies (sweep / mean-revert flavored) ──
    {
      card_id: "str_C_attacker_sweep",
      name: "Strategy · Sweep + Session Fade Attacker",
      role: "ATTACKER",
      thesis: "Liquidity hunt: sweep_reclaim + asia_range_fade + wick_extreme fused.",
      engineModules: ["sweep_reclaim", "asia_range_fade", "wick_extreme", "psl_sweep", "fusion", "auto_rr", "ev_rolling"],
      customIds: [],
    },
    {
      card_id: "str_C_guard",
      name: "Strategy · Shock + Chop Guard C",
      role: "GUARD",
      thesis: "Chop + blackswan + dirty candle + news proxy.",
      engineModules: ["no_trade_chop", "news_ctx", "range_size"],
      customIds: id("cm_grok_blackswan_veto", "cm_grok_dirty_candle", "cm_grok_candle_against"),
    },
    {
      card_id: "str_C_confirm",
      name: "Strategy · Multi-evidence Confirm C",
      role: "CONFIRMATION",
      thesis: "calib_trust needs ≥2 triggers (this attacker has 4) + evidence independence.",
      engineModules: ["calib_trust", "mtf_confirm"],
      customIds: id("cm_grok_evidence_indep", "cm_grok_candle_confirm"),
    },
    {
      card_id: "str_C_fallback",
      name: "Strategy · Range Fallback C",
      role: "FALLBACK",
      thesis: "fb_range_fade when attackers silent.",
      engineModules: ["fb_range_fade"],
      customIds: [],
    },
    {
      card_id: "str_C_scout",
      name: "Strategy · Episode Scout C",
      role: "SCOUT",
      thesis: "Episode observer.",
      engineModules: ["ch_episode_lens"],
      customIds: [],
    },
    {
      card_id: "str_C_exit",
      name: "Strategy · MR Exit + give-back",
      role: "EXIT_SENTINEL",
      thesis: "Mean-reversion exit to mid + give-back close.",
      engineModules: ["mr_exit", "exit_weak"],
      customIds: id("cm_grok_giveback_exit"),
    },
  ];
}

// ── 3) STRATEGY → BEAST (role roster) ────────────────────────────────────────

export interface DesignedBeast {
  name: string;
  code: string;
  intent: string;
  strategyIds: string[];
  members: BeastMember[];
}

function strategiesToMembers(
  strategies: DesignedStrategy[],
  mods: DesignedModule[],
  ids: string[],
): BeastMember[] {
  const byCard = Object.fromEntries(strategies.map((s) => [s.card_id, s]));
  const modById = Object.fromEntries(mods.map((m) => [m.id, m.module]));
  const members: BeastMember[] = [];
  for (const id of ids) {
    const s = byCard[id];
    if (!s) throw new Error("missing strategy " + id);
    const customs = s.customIds.map((cid) => modById[cid]).filter(Boolean) as CustomModule[];
    members.push({
      card_id: s.card_id,
      role: s.role,
      modules: [...s.engineModules, ...s.customIds],
      customs,
      source_kind: "STRATEGY_CARD",
    });
  }
  members.push({ card_id: "l0", role: "SAFETY", modules: [], source_kind: "SAFETY" });
  return members;
}

export function designBeasts(strategies: DesignedStrategy[], mods: DesignedModule[]): DesignedBeast[] {
  return [
    {
      name: "🐲 Grok Liquidity Discipline Beast",
      code: "GROK_LIQ_DISC",
      intent: "Break/sweep/pullback attacker + heavy discipline guards + quality confirms + fallback + path exits. Primary test beast.",
      strategyIds: [
        "str_A_attacker_liquidity",
        "str_A_guard_discipline",
        "str_A_structure_guard",
        "str_A_confirm_quality",
        "str_A_fallback",
        "str_A_scout",
        "str_A_exit",
      ],
      members: strategiesToMembers(strategies, mods, [
        "str_A_attacker_liquidity",
        "str_A_guard_discipline",
        "str_A_structure_guard",
        "str_A_confirm_quality",
        "str_A_fallback",
        "str_A_scout",
        "str_A_exit",
      ]),
    },
    {
      name: "🐲 Grok Session Trend Beast",
      code: "GROK_SESS_TREND",
      intent: "Trend retest + HTF anchor; session/vol guards; MTF confirm; protective exits. Contrast tribe.",
      strategyIds: [
        "str_B_attacker_trend",
        "str_B_guard_session",
        "str_B_structure",
        "str_B_confirm",
        "str_B_scout",
        "str_B_exit",
      ],
      members: strategiesToMembers(strategies, mods, [
        "str_B_attacker_trend",
        "str_B_guard_session",
        "str_B_structure",
        "str_B_confirm",
        "str_B_scout",
        "str_B_exit",
      ]),
    },
    {
      name: "🐲 Grok Sweep Fade Beast",
      code: "GROK_SWEEP_FADE",
      intent: "Sweep/asia/wick/psl attacker + shock guards + multi-evidence confirm + fb fallback + MR exit.",
      strategyIds: [
        "str_C_attacker_sweep",
        "str_C_guard",
        "str_C_confirm",
        "str_C_fallback",
        "str_C_scout",
        "str_C_exit",
      ],
      members: strategiesToMembers(strategies, mods, [
        "str_C_attacker_sweep",
        "str_C_guard",
        "str_C_confirm",
        "str_C_fallback",
        "str_C_scout",
        "str_C_exit",
      ]),
    },
  ];
}

// ── 4) SEED to Kho Beast + Strategy Library (idempotent by name) ─────────────

export function seedDesignedBeasts(beasts: DesignedBeast[]): {
  exported: string[];
  skipped: string[];
  errors: string[];
  composed: { name: string; ok: boolean; modules: string[]; warnings: string[]; errors: string[] }[];
} {
  const out = {
    exported: [] as string[],
    skipped: [] as string[],
    errors: [] as string[],
    composed: [] as { name: string; ok: boolean; modules: string[]; warnings: string[]; errors: string[] }[],
  };
  const existing = readStrategyCards() as { name?: string }[];
  const koho = loadBeasts();

  for (const b of beasts) {
    const comp = composeBeast(b.members);
    out.composed.push({
      name: b.name,
      ok: comp.ok,
      modules: comp.modules,
      warnings: comp.warnings,
      errors: comp.errors,
    });
    if (!comp.ok) {
      out.errors.push(`${b.name}: ${comp.errors.join("; ")}`);
      continue;
    }
    if (existing.some((c) => c.name === b.name)) {
      out.skipped.push(b.name);
      continue;
    }
    if (!koho.some((x: SavedBeast) => x.name === b.name)) {
      saveBeast(b.name, b.members, comp);
    }
    const r = exportBeastAsCard(b.name, comp, "M15");
    if (r.ok) out.exported.push(b.name);
    else out.errors.push(`${b.name}: ${r.note}`);
  }
  return out;
}

/** One-shot design pipeline summary (no market run). */
export function runDesignPipeline() {
  const modules = designModulesFromBlocks();
  try {
    const cur = loadCustomModules();
    const byId = new Map(cur.map((c) => [c.id, c]));
    let changed = false;
    for (const dm of modules) if (dm.validationOk && !byId.has(dm.module.id)) { byId.set(dm.module.id, dm.module); changed = true; }
    if (changed) saveCustomModules([...byId.values()]);
  } catch { /* ignore in isolated test shims */ }
  const strategies = designStrategies(modules);
  const beasts = designBeasts(strategies, modules);
  const seed = seedDesignedBeasts(beasts);
  return { modules, strategies, beasts, seed, authority: DESIGN_AUTHORITY };
}
