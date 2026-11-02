import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import {
  runRealisticSim,
  entryIndicatorSeries,
} from "./realisticStrategySim.ts";
import { cloneSimConfig, type Timeframe } from "./simConfig.ts";
import { getCardRuntimeConfig } from "./simTimeframe.ts";
import { getSymbolSpec } from "./symbolSpec.ts";
import {
  loadCustomModules,
  validateModule,
  evalExitCustom,
  METRICS,
} from "./customModule.ts";
import {
  customMetricSeries,
  resolveCustomMetrics,
} from "./customMetricBridge.ts";
import { getCoefProfile } from "./coefProfileStore.ts";
import { strategyCloseRule } from "./strategyCloseRule.ts";
import { diagnoseCardTriggers } from "./cardTriggerDiagnosis.ts";
import { loadCustomL6, validateL6Zone } from "./blocks/customL6.ts";
import {
  DEFINITION_KEYS,
  prepareDefinitionImport,
} from "./portableDefinitions.ts";

const supported = new Set([
  "data_quality",
  "kidi_guard",
  "no_lookahead",
  "authority_guard",
  "trend_pullback",
  "ema_trend",
  "ema_slope",
  "rsi_reclaim",
  "rsi_value",
  "sweep_reclaim",
  "sweep_depth",
  "sweep_risk",
  "range_fade",
  "psl_sweep",
  "vol_contraction",
  "htf_anchor",
  "asia_range_fade",
  "wick_extreme",
  "gap_fade",
  "rsi_extreme",
  "fb_range_fade",
  "break_retest",
  "fusion",
  "bayesian",
  "regime_ctx",
  "markov",
  "state_machine",
  "session_ctx",
  "dead_hour",
  "no_trade_chop",
  "atr_vol",
  "atr_pct",
  "calib_trust",
  "range_size",
  "mtf_confirm",
  "sr_zone_context",
  "level_memory",
  "auto_rr",
  "exit_weak",
  "mr_exit",
  "ichimoku",
  "macd",
  "stochastic",
  "bollinger",
  "observation_zone",
  "confirmation_zone",
  "risk_zone",
  "invalidation_zone",
  "avoid_zone",
  "dynamic_zone",
]);
const unavailableMetrics = new Set([
  "ddPct",
  "dayLosses",
  "dayPnlR",
  "barsSinceTrade",
  "spread",
  "maxR",
]);
export interface DemoCardDefinition {
  id: string;
  name: string;
  symbol: string;
  design_tf: Timeframe;
  execution_tf: Timeframe;
  modules: string[];
}
export interface DemoOwnedPosition {
  side: "BUY" | "SELL";
  entry: number;
  openedAt: string;
  risk: number;
  sl: number;
  tp: number;
}
export type DemoDecision =
  | { kind: "WAIT"; reason: string; signalTime: string }
  | {
      kind: "OPEN";
      side: "BUY" | "SELL";
      sl: number;
      tp: number;
      risk: number;
      why: string[];
      signalTime: string;
    }
  | { kind: "CLOSE"; reason: string; signalTime: string };
export function evaluateDemoCard(input: {
  card: DemoCardDefinition;
  bars: OhlcBar[];
  bid: number;
  ask: number;
  nowMs: number;
  position: DemoOwnedPosition | null;
}): DemoDecision {
  const { card, bars, bid, ask, nowMs, position } = input,
    rc = getCardRuntimeConfig(card),
    tf = rc.design_tf;
  if (
    !card.id ||
    !card.name ||
    !card.symbol ||
    !Array.isArray(card.modules) ||
    rc.allowed_execution_tf !== tf
  )
    throw Error("DEMO_DESIGN_CLOSE_ONLY");
  const definitions = Object.fromEntries(
    DEFINITION_KEYS.map((key) => [
      key,
      JSON.parse(localStorage.getItem(key) || "[]"),
    ]),
  );
  prepareDefinitionImport(definitions, {});
  if (bars.length < 120 || bars.length > 5000)
    throw Error("DEMO_REQUIRES_120_TO_5000_CLOSED_BARS");
  const step = { M1: 1, M5: 5, M15: 15, H1: 60, H4: 240, D1: 1440 }[tf] * 60000;
  const times = bars.map((b) =>
    Date.parse(b.t.endsWith("Z") ? b.t : b.t + "Z"),
  );
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (
      ![b.o, b.h, b.l, b.c, times[i]].every(Number.isFinite) ||
      b.l <= 0 ||
      b.h < Math.max(b.o, b.c) ||
      b.l > Math.min(b.o, b.c) ||
      (i > 0 && times[i] <= times[i - 1])
    )
      throw Error("DEMO_INVALID_CLOSED_TAPE");
  }
  const last = bars[bars.length - 1];
  const signalMs = times[times.length - 1] + step,
    signalTime = new Date(signalMs).toISOString();
  if (signalMs > nowMs || nowMs - signalMs > Math.min(30000, step))
    throw Error("DEMO_CLOSED_BAR_NOT_FRESH");
  if (
    times.length >= 2 &&
    times[times.length - 1] - times[times.length - 2] !== step
  )
    throw Error("DEMO_RECENT_BAR_GAP");
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask < bid)
    throw Error("DEMO_INVALID_QUOTE");
  const all = loadCustomModules(),
    custom = all.filter((m) => card.modules.includes(m.id));
  const catalog = new Set(METRICS.map((m) => m.key));
  const refs = custom.flatMap((m) => m.conditions.map((c) => c.metric));
  const resolved = resolveCustomMetrics(refs, catalog, bars);
  for (const m of custom) {
    if (!validateModule(m, new Set(Object.keys(resolved))).ok)
      throw Error("DEMO_INVALID_CUSTOM_MODULE: " + m.id);
    if (m.role === "EXIT" && m.exitAction && m.exitAction !== "CLOSE")
      throw Error("DEMO_PROTECTIVE_STOP_MUTATION_UNSUPPORTED: " + m.id);
    for (const c of m.conditions)
      if (unavailableMetrics.has(c.metric))
        throw Error("DEMO_ACCOUNT_METRIC_UNSUPPORTED: " + c.metric);
  }
  for (const ref of refs) {
    if (
      !catalog.has(ref) &&
      (!resolved[ref] || !Number.isFinite(resolved[ref][bars.length - 1]))
    )
      throw Error("DEMO_MISSING_OR_UNAVAILABLE_INPUT: " + ref);
  }
  for (const id of card.modules) {
    if (
      supported.has(id) ||
      id === "synthetic_vol_guard" ||
      id === "fib_retrace" ||
      id === "adx" ||
      id === "value_area_zone" ||
      custom.some((m) => m.id === id)
    )
      continue;
    const zone = loadCustomL6().find(
      (z) => z.id === id || `myL6_${z.id}` === id,
    );
    if (zone) {
      if (!validateL6Zone(zone).ok) throw Error("DEMO_INVALID_ZONE");
      continue;
    }
    const series = customMetricSeries(id.replace(/^myL[123]_/, ""), bars);
    if (!series) throw Error("DEMO_UNSUPPORTED_MODULE: " + id);
    if (!Number.isFinite(series[bars.length - 1]))
      throw Error("DEMO_UNAVAILABLE_MEASUREMENT: " + id);
  }
  if (
    !diagnoseCardTriggers(card.modules).count &&
    !custom.some((m) => m.role === "TRIGGER")
  )
    throw Error("DEMO_EXPLICIT_TRIGGER_REQUIRED");
  const cfg = cloneSimConfig();
  cfg.designTf = tf;
  cfg.executionTf = tf;
  const ind = entryIndicatorSeries(bars),
    i = bars.length - 1,
    a = ind.atr14[i];
  if (!(a > 0)) throw Error("DEMO_ATR_UNAVAILABLE");
  if (position) {
    const entryTime = Date.parse(position.openedAt);
    let entryIndex = -1;
    for (let k = 0; k < times.length; k++)
      if (times[k] <= entryTime) entryIndex = k;
    if (entryIndex < 0) throw Error("DEMO_POSITION_HISTORY_WINDOW_EXCEEDED");
    const held = bars.length - 1 - entryIndex;
    const extra = Object.fromEntries(
      Object.entries(resolved).map(([key, value]) => [key, value[i]]),
    );
    const ce = evalExitCustom(
      {
        heldBars: Math.max(0, held),
        rMultiple:
          (position.side === "BUY"
            ? last.c - position.entry
            : position.entry - last.c) / position.risk,
        rsi: ind.rsi14[i],
        regime: Math.sign(ind.ema10[i] - ind.ema34[i]),
        priceEmaAtr: (last.c - ind.ema10[i]) / a,
        emaGapAtr: (ind.ema10[i] - ind.ema34[i]) / a,
        atrPct: (a / last.c) * 100,
        atrRatio: a / (ind.atr100[i] || a),
        wickRatio:
          last.h - last.l > 0
            ? 1 - Math.abs(last.c - last.o) / (last.h - last.l)
            : 0,
        bodyRatio:
          last.h - last.l > 0
            ? Math.abs(last.c - last.o) / (last.h - last.l)
            : 0,
        price: last.c,
        ...extra,
      },
      custom,
    );
    const reason = strategyCloseRule({
      modules: card.modules,
      held: Math.max(0, held),
      side: position.side,
      price: last.c,
      entry: position.entry,
      ema10: ind.ema10[i],
      ema34: ind.ema34[i],
      rsi: ind.rsi14[i],
      customClose: ce.close,
    });
    return reason
      ? { kind: "CLOSE", reason, signalTime }
      : {
          kind: "WAIT",
          reason: "Owned position remains open; broker SL/TP active",
          signalTime,
        };
  }
  let candidate: DemoDecision = {
    kind: "WAIT",
    reason: "Card trigger or gate has no eligible candidate",
    signalTime,
  };
  // Each side is evaluated at its executable quote. No forming H/L/C or synthetic candle enters the evaluator.
  for (const side of ["BUY", "SELL"] as const) {
    runRealisticSim(bars, card.modules, card.modules.includes("auto_rr"), {
      cfg,
      spec: getSymbolSpec(card.symbol),
      designTf: tf,
      cardId: card.id,
      symbol: card.symbol,
      customModules: custom,
      coef: getCoefProfile(),
      researchIntervention: { collectOnly: true },
      closedBarProbe: {
        price: side === "BUY" ? ask : bid,
        onCandidate: (c) => {
          if (c.dir === side)
            candidate = {
              kind: "OPEN",
              side,
              sl: c.sl,
              tp: c.tp,
              risk: c.risk,
              why: c.why,
              signalTime: c.signalTime,
            };
        },
      },
    });
  }
  return candidate;
}
