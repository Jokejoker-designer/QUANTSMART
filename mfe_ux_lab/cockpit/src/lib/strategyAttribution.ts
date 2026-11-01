import {barTime} from "./stageWindow.ts";
// Conditional event-study controls. Every arm calls the canonical simulator.
// No live authority, no significance/promotion claim and no in-sample parameter fitting.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import {
  runRealisticSim,
  type RealisticSimOptions,
  type RealisticTradeResult,
} from "./realisticStrategySim.ts";
import { cloneSimConfig, makeHardConfig, type Timeframe } from "./simConfig.ts";
import { getSymbolSpec, assertSpecUsableForMoney } from "./symbolSpec.ts";
import { applyBrokerCalibration } from "./simCalibration.ts";
import { getCardRuntimeConfig, TF_MINUTES } from "./simTimeframe.ts";
import { getCoefProfile } from "./coefProfileStore.ts";
import { makeRng } from "./simCostModel.ts";
import { TRIGGER_FAMILIES, CLASSIC_TRIGGERS } from "./cardTriggerDiagnosis.ts";
import {
  runRealisticBacktest,
  type RealisticBacktestOptions,
} from "./realisticSimRun.ts";
const allowed = new Set([
  ...TRIGGER_FAMILIES.flatMap((f) => f.modules),
  ...CLASSIC_TRIGGERS.map((t) => t.module),
  "data_quality",
  "kidi_guard",
  "no_lookahead",
  "synthetic_vol_guard",
  "authority_guard",
  "regime_ctx",
  "session_ctx",
  "dead_hour",
  "news_ctx",
  "no_trade_chop",
  "atr_vol",
  "atr_pct",
  "auto_rr",
  "mr_exit",
  "exit_weak",
]);
interface Card {
  id?: string;
  symbol?: string;
  design_tf?: Timeframe;
  execution_tf?: Timeframe;
  modules: string[];
}
interface Parameters extends RealisticBacktestOptions {
  seeds?: number;
  maxEvents?: number;
}
interface Candidate {
  signalI: number;
  dir: "BUY" | "SELL";
  entryI: number;
  risk: number;
  regime: number;
}
const average = (x: number[]) =>
  x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
function describe(trades: RealisticTradeResult[]) {
  return {
    events: trades.length,
    meanNetBps: average(
      trades.map(
        (t) => ((t.netR * t.costBreakdown.riskPrice) / t.entry_mid) * 10000,
      ),
    ),
    meanNetR: average(trades.map((t) => t.netR)),
    meanHeldBars: average(trades.map((t) => t.exitI - t.entryI + 1)),
  };
}
export function runStrategyAttribution(
  bars: OhlcBar[],
  card: Card,
  parameters: Parameters = {},
) {
  if (!Array.isArray(card.modules))
    throw new Error("ATTRIBUTION_CARD_REQUIRED");
  const unsupported = card.modules.filter((id) => !allowed.has(id));
  if (unsupported.length)
    throw new Error(
      "ATTRIBUTION_UNSUPPORTED_MODULES: " + unsupported.join(", "),
    );
  const runtime = getCardRuntimeConfig(card),
    designTf = runtime.design_tf;
  if (runtime.allowed_execution_tf !== designTf)
    throw new Error("ATTRIBUTION_DESIGN_TIMEFRAME_ONLY");
  if (bars.length < 600 || bars.length > 5000)
    throw new Error("ATTRIBUTION_WINDOW_REQUIRES_600_TO_5000_DESIGN_BARS");
  if(bars.some(b=>!Number.isFinite(barTime(b))))throw new Error("ATTRIBUTION_INVALID_TIME_GRID");
  const step = TF_MINUTES[designTf] * 60000;
  for (let i = 1; i < bars.length; i++)
    if (
      barTime(bars[i]) - barTime(bars[i - 1]) < step ||
      (barTime(bars[i]) - barTime(bars[i - 1])) % step
    )
      throw new Error("ATTRIBUTION_INVALID_TIME_GRID");
  const seeds = parameters.seeds ?? 8,
    maxEvents = parameters.maxEvents ?? 24;
  if (
    !Number.isInteger(seeds) ||
    seeds < 2 ||
    seeds > 16 ||
    !Number.isInteger(maxEvents) ||
    maxEvents < 6 ||
    maxEvents > 40
  )
    throw new Error("ATTRIBUTION_INVALID_BUDGET");
  let cfg = cloneSimConfig(parameters.cfg);
  if (parameters.hard) cfg = makeHardConfig(cfg);
  cfg.designTf = designTf;
  cfg.executionTf = designTf;
  cfg.risk.sizingMode = "FIXED_R";
  cfg.risk.fixedRValue = 1;
  cfg.discipline.cooldownBars[designTf] = 0;
  cfg.discipline.maxTradesPerDay[designTf] = 100000;
  const symbol = parameters.symbol || card.symbol || "XAUUSD";
  if (card.symbol && card.symbol !== symbol)
    throw new Error("ATTRIBUTION_CARD_ASSET_MISMATCH");
  let spec = getSymbolSpec(symbol);
  if (parameters.calibration) {
    const calibrated = applyBrokerCalibration(
      cfg,
      spec,
      parameters.calibration,
    );
    Object.assign(cfg.cost, calibrated.cfg.cost);
    spec = calibrated.spec;
  }
  assertSpecUsableForMoney(spec);
  const base: RealisticSimOptions = {
    cfg,
    spec,
    designTf,
    cardId: card.id || "attribution",
    symbol,
    coef: parameters.coef ?? getCoefProfile(),
  };
  const autoRR = card.modules.includes("auto_rr");
  const fullSystem = runRealisticBacktest(bars, card, {
    ...parameters,
    symbol,
    withWalkForward: false,
  });
  const census: Candidate[] = [];
  runRealisticSim(bars, card.modules, autoRR, {
    ...base,
    researchIntervention: { collectOnly: true },
    onResearchCandidate: (c) => census.push(c),
  });
  const pools: Candidate[] = [];
  for (const dir of ["BUY", "SELL"] as const)
    runRealisticSim(bars, card.modules, autoRR, {
      ...base,
      researchIntervention: {
        entries: bars.map((_, signalI) => ({ signalI, dir })),
        collectOnly: true,
      },
      onResearchCandidate: (c) => pools.push(c),
    });
  const foldSize = Math.floor(bars.length / 3),
    foldOf = (i: number) => Math.min(2, Math.floor(i / foldSize));
  const eligible = (c: Candidate) =>
    c.signalI >= foldOf(c.signalI) * foldSize + 40 &&
    c.signalI + 30 <
      (foldOf(c.signalI) === 2
        ? bars.length
        : (foldOf(c.signalI) + 1) * foldSize);
  const key = (c: Candidate) =>
    [
      foldOf(c.signalI),
      c.dir,
      c.regime,
      new Date(barTime(bars[c.signalI])).getUTCHours(),
    ].join(":");
  const byStratum = new Map<string, Candidate[]>();
  for (const c of pools.filter(eligible)) {
    const k = key(c),
      items = byStratum.get(k) || [];
    items.push(c);
    byStratum.set(k, items);
  }
  const matched = census
    .filter(eligible)
    .map((real) => ({
      real,
      controls: (byStratum.get(key(real)) || []).filter(
        (c) => c.signalI !== real.signalI,
      ),
    }))
    .filter((x) => x.controls.length);
  // Evenly spaced deterministic event selection, never selected by its forward outcome.
  const selected = matched
    .filter(
      (_, i) =>
        Math.floor((i * maxEvents) / matched.length) !==
        Math.floor(((i - 1) * maxEvents) / matched.length),
    )
    .slice(0, maxEvents);
  if (selected.length < 6)
    throw new Error("ATTRIBUTION_INSUFFICIENT_MATCHED_EVENTS");
  const cache = new Map<string, RealisticTradeResult>();
  const event = (c: Candidate, hold?: number) => {
    const k = c.signalI + ":" + c.dir + ":" + (hold ?? "exit");
    let trade = cache.get(k);
    if (trade) return trade;
    const result = runRealisticSim(
      bars.slice(0, c.signalI + 31),
      card.modules,
      autoRR,
      {
        ...base,
        researchIntervention: {
          entries: [{ signalI: c.signalI, dir: c.dir }],
          fixedHoldBars: hold,
        },
      },
    );
    trade = result.trades.find((t) => t.entryI === c.entryI && t.dir === c.dir);
    if (!trade) throw new Error("ATTRIBUTION_EVENT_DID_NOT_COMPLETE");
    cache.set(k, trade);
    return trade;
  };
  const realExit = selected.map((x) => event(x.real));
  const rows = [];
  const draws: Candidate[][] = [];
  for (let seed = 0; seed < seeds; seed++) {
    const rng = makeRng((cfg.seed ?? 42) + seed * 104729);
    draws.push(
      selected.map((x) => x.controls[Math.floor(rng() * x.controls.length)]),
    );
  }
  for (const horizon of [5, 10, 20]) {
    const a = describe(selected.map((x) => event(x.real, horizon))),
      d = describe(realExit);
    const controls = draws.map((draw, seed) => {
      const b = describe(draw.map((c) => event(c, horizon))),
        c = describe(draw.map((c) => event(c)));
      return {
        seed,
        b,
        c,
        entryLiftBps: a.meanNetBps! - b.meanNetBps!,
        exitLiftOnRandomBps: c.meanNetBps! - b.meanNetBps!,
        interactionBps:
          d.meanNetBps! - a.meanNetBps! - (c.meanNetBps! - b.meanNetBps!),
      };
    });
    rows.push({
      horizon,
      A_realEntriesFixedHold: a,
      D_realEntriesCardExit: d,
      controls,
      meanEntryLiftBps: average(controls.map((c) => c.entryLiftBps)),
      meanExitLiftOnRandomBps: average(
        controls.map((c) => c.exitLiftOnRandomBps),
      ),
      meanInteractionBps: average(controls.map((c) => c.interactionBps)),
    });
  }
  return {
    schema: 1,
    authority: "SHADOW_ONLY",
    decision: "NO_DECISION",
    method: "MATCHED_CONDITIONAL_EVENT_STUDY",
    status: "DESCRIPTIVE_ONLY",
    designTf,
    symbol,
    seeds,
    horizons: [5, 10, 20],
    rawSignalEvents: census.length,
    matchableEvents: matched.length,
    evaluatedEvents: selected.length,
    canonicalCallsObserved: cache.size + 4,
    fullSystem: {
      trades: fullSystem.analytics.n,
      netR: fullSystem.analytics.netNetR,
      netPF: fullSystem.analytics.netPF,
      costModel: fullSystem.manifest.cost_model,
      configHash: fullSystem.manifest.config_hash,
    },
    folds: [0, 1, 2].map((fold) => ({
      fold,
      events: selected.filter((x) => foldOf(x.real.signalI) === fold).length,
    })),
    rows,
    matches: selected.map((x, index) => ({
      signalIndex: x.real.signalI,
      signalTime: bars[x.real.signalI].t,
      direction: x.real.dir,
      regime: x.real.regime,
      stratum: key(x.real),
      controls: draws.map((draw, seed) => ({
        seed,
        signalIndex: draw[index].signalI,
        signalTime: bars[draw[index].signalI].t,
        stratum: key(draw[index]),
      })),
    })),
    protocol: {
      matching:
        "same chronological third, direction, causal EMA10/34 regime, UTC hour and supported Card gates/plan eligibility",
      sampling:
        "seeded with replacement; identical matched event counts; no outcome-based selection",
      execution:
        "isolated next-open events, fixed-R, canonical Card exit at its 28-elapsed-bar timeout (up to 29 observed candles); fixed hold uses the Nth candle close",
      exposure:
        "holding duration is reported, not exposure-matched by construction",
      outOfSample:
        "chronological thirds only; not an independent holdout after user selection",
      limitations: [
        "Conditional event study is not a continuous portfolio or a deployment test.",
        "Only the explicitly supported stateless native modules are accepted; custom/stateful/mixed-timeframe Cards are refused.",
        "Fixed-hold selection retains Card plan eligibility. This is not every raw trigger event.",
        "Repeated seeds and overlapping event paths are dependent; no p-value, DSR or profitability verdict is computed.",
        "Unknown past trial selection is not corrected. All observed canonical calls still enter the backend trial ledger.",
      ],
    },
  };
}
