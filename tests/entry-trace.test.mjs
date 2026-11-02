import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "./module-chain-fixture.mjs";
import { buildDecisionJournal } from "../mfe_ux_lab/cockpit/tools/decisionJournal.mjs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url));
const { build } = createRequire(app + "/package.json")("esbuild");
const built = await build({
  stdin: {
    contents:
      "export {runRealisticBacktest,runRealisticBacktestM1} from './src/lib/realisticSimRun.ts'; export {runRealisticSim} from './src/lib/realisticStrategySim.ts'; export {DEFAULT_REALISTIC_SIM_CONFIG} from './src/lib/simConfig.ts'; export {getSymbolSpec} from './src/lib/symbolSpec.ts';",
    resolveDir: app,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
globalThis.localStorage = { getItem: () => null };
try {
  const bars = syntheticBars(1200);
  const combinations = [
    [],
    ["trend_pullback"],
    ["trend_pullback", "session_ctx"],
    ["range_fade", "regime_ctx"],
    ["trend_pullback", "auto_rr"],
    ["range_fade", "range_size"],
    ["trend_pullback", "state_machine"],
    ["trend_pullback", "adx"],
    ["trend_pullback", "drift_guard"],
    ["trend_pullback", "topk_fit"],
    ["trend_pullback", "ev_rolling"],
  ];
  const codes = new Set();
  for (const modules of combinations) {
    const card = {
      id: "ENTRY_TRACE",
      symbol: "XAUUSD",
      design_tf: "H1",
      execution_tf: "H1",
      modules,
    };
    const plain = api.runRealisticBacktest(bars, card, { symbol: "XAUUSD" });
    const observed = api.runRealisticBacktest(bars, card, {
      symbol: "XAUUSD",
      captureEntryTrace: true,
    });
    assert.ok(
      Array.isArray(observed.sim.entryTrace),
      "opt-in evidence must capture branch facts",
    );
    const { entryTrace, ...rest } = observed.sim;
    assert.deepEqual(
      rest,
      plain.sim,
      "tracing must preserve every trade, cost, marker, event and counter",
    );
    assert.equal(
      entryTrace.length,
      bars.length - 40,
      "one terminal branch fact per post-warmup bar",
    );
    assert.equal(
      new Set(entryTrace.map((r) => r.barIndex)).size,
      entryTrace.length,
    );
    for (const row of entryTrace) {
      codes.add(row.code);
      assert.equal(row.barTime, bars[row.barIndex].t);
      assert.equal(
        row.at,
        new Date(
          Date.parse(bars[row.barIndex].t + "Z") + 3600000,
        ).toISOString(),
      );
      if (row.outcome === "VETO") assert.ok(row.direction);
      if (row.code === "SESSION_OUTSIDE_WINDOW") {
        const hour = new Date(row.barTime + "Z").getUTCHours();
        assert.ok(
          hour < 7 || hour >= 21,
          "reported gate is the actual branch condition",
        );
      }
    }
    const source = {
      id: "synthetic",
      hash: "fixture",
      symbol: "XAUUSD",
      timeframe: "H1",
    };
    const input = {
      bars,
      card,
      source,
      engineHash: "fixture",
      backtest: observed,
    };
    const report = buildDecisionJournal(input);
    assert.equal(
      report.entryEvaluation.coverage,
      "CAPTURED_DESIGN_BAR_BRANCHES",
    );
    assert.equal(report.entryEvaluation.records.length, entryTrace.length);
    assert.equal(
      report.entryEvaluation.summary.modeledEntries,
      plain.sim.actual_trades_taken,
    );
    assert.equal(report.entryEvaluation.summary.warmupBars, 40);
    assert.equal(report.entryEvaluation.summary.unobservedBars, 0);
    assert.deepEqual(buildDecisionJournal(input), report);
    const legacy = buildDecisionJournal({ ...input, backtest: plain });
    assert.equal(legacy.entryEvaluation.coverage, "NOT_CAPTURED");
    assert.equal(legacy.entryEvaluation.records.length, 0);
    assert.equal(
      legacy.entryEvaluation.summary,
      null,
      "missing evidence is not a zero-decision count",
    );
    assert.notEqual(
      legacy.runId,
      report.runId,
      "different evidence policies need distinct run identities",
    );
    assert.equal(report.structuralSetupLifecycle, "NOT_IMPLEMENTED");
    const prefixBars = bars.slice(0, 600);
    const prefixTest = api.runRealisticBacktest(prefixBars, card, {
      symbol: "XAUUSD",
      captureEntryTrace: true,
    });
    const prefix = buildDecisionJournal({
      ...input,
      bars: prefixBars,
      source: { ...source, hash: "prefix" },
      backtest: prefixTest,
    });
    assert.deepEqual(
      prefix.entryEvaluation.records.filter((r) => r.barIndex < 599),
      report.entryEvaluation.records.filter((r) => r.barIndex < 599),
      "future append must preserve past branch evidence and IDs",
    );
    for (const row of report.records.filter(
      (r) => r.status === "PLAN_REJECTED",
    )) {
      assert.equal(row.outcome, null);
      assert.ok(row.trace.some((e) => e.type === "ENTRY_PLAN_REJECTED"));
      assert.ok(!row.missing.some((e) => e.field === "noFillReason"));
    }
  }
  const flatBars = bars.map((b) => ({ ...b, o: 100, h: 101, l: 99, c: 100 }));
  const tied = api.runRealisticBacktest(
    flatBars,
    {
      id: "TIED",
      design_tf: "H1",
      execution_tf: "H1",
      modules: ["range_fade"],
    },
    { symbol: "XAUUSD", captureEntryTrace: true },
  );
  assert.ok(tied.sim.entryTrace.every((r) => r.code === "COMBINATION_ABSTAIN"));
  codes.add("COMBINATION_ABSTAIN");
  const customGate = {
    id: "trace_gate",
    name: "Research gate",
    level: 4,
    role: "CONTEXT_GATE",
    conditions: [{ metric: "price", op: ">", value: 10000 }],
    logic: "ALL",
    status: "SHADOW",
  };
  const customCard = {
    id: "CUSTOM",
    design_tf: "H1",
    execution_tf: "H1",
    modules: ["trend_pullback", customGate.id],
  };
  const custom = api.runRealisticBacktest(bars, customCard, {
    symbol: "XAUUSD",
    customModules: [customGate],
    captureEntryTrace: true,
  });
  assert.ok(
    custom.sim.entryTrace.some((r) => r.code === "CUSTOM_GATE_OR_VETO"),
  );
  assert.equal(custom.sim.actual_trades_taken, 0);
  assert.throws(
    () =>
      api.runRealisticBacktestM1(bars, customCard, { captureEntryTrace: true }),
    /ENTRY_TRACE_DESIGN_BAR_MODE_ONLY/,
  );
  assert.throws(
    () =>
      api.runRealisticBacktest(syntheticBars(5001), customCard, {
        symbol: "XAUUSD",
        captureEntryTrace: true,
      }),
    /ENTRY_TRACE_WINDOW/,
  );
  const options = {
    cfg: api.DEFAULT_REALISTIC_SIM_CONFIG,
    spec: api.getSymbolSpec("XAUUSD"),
    symbol: "XAUUSD",
    designTf: "H1",
    cardId: "UNSUPPORTED",
    captureEntryTrace: true,
  };
  for (const extra of [
    { m1ByDesign: [] },
    { researchIntervention: { collectOnly: true } },
    { closedBarProbe: { price: 100, onCandidate() {} } },
  ])
    assert.throws(
      () =>
        api.runRealisticSim(bars, ["trend_pullback"], false, {
          ...options,
          ...extra,
        }),
      /ENTRY_TRACE_DESIGN_BAR_MODE_ONLY/,
    );
  for (const code of [
    "NO_TRIGGER_VOTE",
    "POSITION_HELD",
    "SESSION_OUTSIDE_WINDOW",
    "MODELED_ENTRY",
    "COMBINATION_ABSTAIN",
    "AUTO_RR_INVALID_PLAN",
  ])
    assert.ok(codes.has(code), "fixture must exercise " + code);
  console.log(
    JSON.stringify({
      status: "ENTRY_TRACE_PASS",
      cards: combinations.length,
      unchangedCanonicalResults: true,
      firstBranchOnly: true,
      prefixStable: true,
      codes: [...codes].sort(),
    }),
  );
} finally {
  delete globalThis.localStorage;
}
