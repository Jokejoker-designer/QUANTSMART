import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const compiled = await build({
  stdin: {
    contents:
      "export * from './src/lib/strategyAttribution.ts';export * from './src/lib/realisticStrategySim.ts';export * from './src/lib/simConfig.ts';export * from './src/lib/symbolSpec.ts';export {setSimulationTrialObserver} from './src/lib/simTrialObserver.ts';",
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
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
globalThis.localStorage = { getItem: () => null };
const bars = Array.from({ length: 1500 }, (_, i) => {
  const o = 100 + Math.sin(i / 12) * 5,
    c = 100 + Math.sin((i + 1) / 12) * 5;
  return {
    i,
    t: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString().slice(0, 19),
    o,
    h: Math.max(o, c) + 0.3,
    l: Math.min(o, c) - 0.3,
    c,
    r: "N",
  };
});
const cfg = api.cloneSimConfig();
cfg.risk.sizingMode = "FIXED_R";
const forced = api.runRealisticSim(bars, ["trend_pullback"], false, {
  cfg,
  spec: api.XAUUSD_PROVISIONAL_SPEC,
  designTf: "H1",
  symbol: "XAUUSD",
  cardId: "FORCED_TEST",
  researchIntervention: {
    entries: [{ signalI: 40, dir: "BUY" }],
    fixedHoldBars: 5,
  },
});
assert.equal(forced.actual_trades_taken, 1);
assert.equal(forced.trades.length, 1);
assert.equal(forced.trades[0].entryI, 41);
assert.equal(forced.trades[0].exitI, 45, "five observed candles, not six");
assert.equal(forced.trades[0].exit_mid, bars[45].c);
assert.equal(forced.trades[0].intrabarOutcome, "RESEARCH_FIXED_HOLD");
let calls = 0;
const restore = api.setSimulationTrialObserver(() => calls++);
const card = {
  id: "ATTRIBUTION_TEST",
  symbol: "XAUUSD",
  design_tf: "H1",
  modules: ["trend_pullback", "regime_ctx", "exit_weak"],
};
const result = api.runStrategyAttribution(bars, card, {
  seeds: 3,
  maxEvents: 12,
});
restore();
assert.equal(result.status, "DESCRIPTIVE_ONLY");
assert.equal(result.canonicalCallsObserved, calls);
assert.equal(result.rows.length, 3);
assert.equal(result.evaluatedEvents, 12);
assert.ok(result.folds.every((f) => f.events > 0));
for (const pair of result.matches)
  for (const c of pair.controls) {
    assert.equal(c.stratum, pair.stratum);
    assert.notEqual(c.signalIndex, pair.signalIndex);
  }
for (const row of result.rows) {
  assert.equal(row.controls.length, 3);
  assert.equal(row.A_realEntriesFixedHold.events, 12);
  assert.equal(row.A_realEntriesFixedHold.meanHeldBars, row.horizon);
  for (const c of row.controls) {
    assert.equal(c.b.events, 12);
    assert.equal(c.c.events, 12);
    assert.equal(c.b.meanHeldBars, row.horizon);
    assert.ok(
      Number.isFinite(c.entryLiftBps) && Number.isFinite(c.interactionBps),
    );
  }
}
assert.deepEqual(
  api.runStrategyAttribution(bars, card, { seeds: 3, maxEvents: 12 }),
  result,
  "same protocol and seeds repeat exactly",
);
assert.throws(
  () =>
    api.runStrategyAttribution(bars, {
      ...card,
      modules: ["trend_pullback", "ev_rolling"],
    }),
  /UNSUPPORTED_MODULES/,
);
assert.throws(
  () => api.runStrategyAttribution(bars, { ...card, execution_tf: "M5" }),
  /DESIGN_TIMEFRAME_ONLY/,
);
assert.throws(
  () => api.runStrategyAttribution(bars.slice(0, 500), card),
  /600_TO_5000/,
);
assert.throws(
  () => api.runStrategyAttribution(bars, card, { symbol: "BTCUSDT" }),
  /ASSET_MISMATCH/,
);
if (process.argv.includes("--report")) {
  fs.mkdirSync(".mfe-state", { recursive: true });
  fs.writeFileSync(
    ".mfe-state/attribution-test-result.json",
    JSON.stringify(result, null, 2),
  );
}
console.log(
  "ATTRIBUTION PASS: forced-entry isolation, exact fixed-hold horizon, matched arm counts, deterministic seeds, three chronological strata, canonical trial instrumentation and unsupported-context refusal.",
);
