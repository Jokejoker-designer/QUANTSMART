import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildDecisionJournal,
  completedBarExcursions,
  definitionIdentity,
} from "../mfe_ux_lab/cockpit/tools/decisionJournal.mjs";
import { createDecisionEvidenceRepository } from "../mfe_ux_lab/cockpit/tools/decisionEvidenceRepository.mjs";
import { syntheticBars } from "./module-chain-fixture.mjs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const built = await build({
  stdin: {
    contents: "export{runRealisticBacktest}from'./src/lib/realisticSimRun.ts';",
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
const bars = syntheticBars(1200),
  card = {
    id: "TRACE_FIXTURE",
    symbol: "XAUUSD",
    design_tf: "H1",
    execution_tf: "H1",
    modules: ["trend_pullback", "regime_ctx", "exit_weak"],
  };
const backtest = api.runRealisticBacktest(bars, card, { symbol: "XAUUSD" }),
  before = JSON.stringify(backtest.sim);
const input = {
  bars,
  backtest,
  card,
  source: {
    id: "fixture",
    hash: "synthetic-source-hash",
    symbol: "XAUUSD",
    timeframe: "H1",
  },
  engineHash: "fixture-engine",
};
const report = buildDecisionJournal(input);
assert.equal(
  JSON.stringify(backtest.sim),
  before,
  "journal must not mutate canonical results",
);
assert.deepEqual(
  buildDecisionJournal(input),
  report,
  "replay must be deterministic",
);
assert.ok(report.summary.closed > 0);
assert.equal(report.summary.unjoinedTrades, 0);
assert.equal(report.summary.closed, backtest.sim.trades.length);
assert.equal(
  new Set(report.records.map((r) => r.observationId)).size,
  report.records.length,
);
assert.equal(report.structuralSetupLifecycle, "NOT_IMPLEMENTED");
for (const row of report.records) {
  assert.ok(row.missing.some((x) => x.field === "structuralSetupIdentity"));
  if (row.outcome) {
    const trade = backtest.sim.trades.find(
      (t) => t.trade_id === row.outcome.tradeId,
    );
    assert.equal(row.outcome.netR, trade.netR);
    assert.equal(row.outcome.excursions.mfeR, null);
    assert.equal(row.outcome.excursions.maeR, null);
  } else assert.equal(row.outcome, null);
}
const descriptors = {
  ...card,
  confidence: 0.1,
  atr: 999,
  name: "Renamed label",
  status: "PROMOTED",
};
assert.deepEqual(
  buildDecisionJournal({ ...input, card: descriptors }).records.map(
    (r) => r.observationId,
  ),
  report.records.map((r) => r.observationId),
);
const unrelated = {
  mfe_custom_l1: JSON.stringify([
    { id: "unreferenced", name: "Unused", graph: { bad: true } },
  ]),
};
assert.equal(definitionIdentity(card, unrelated), definitionIdentity(card));
const changed = { ...card, modules: [...card.modules, "auto_rr"] };
assert.notEqual(definitionIdentity(card), definitionIdentity(changed));
const cut = 600,
  prefixBars = bars.slice(0, cut),
  prefixTest = api.runRealisticBacktest(prefixBars, card, { symbol: "XAUUSD" });
const prefix = buildDecisionJournal({
  ...input,
  bars: prefixBars,
  backtest: prefixTest,
  source: { ...input.source, hash: "different-prefix-source-hash" },
});
assert.deepEqual(
  prefix.records.map((row) => row.observationId),
  report.records
    .filter((row) => row.barIndex < cut)
    .map((row) => row.observationId),
  "appending future bars must not change past observation identity",
);
const first = report.records.find((r) => r.outcome);
const directionChanged = {
  ...backtest,
  sim: {
    ...backtest.sim,
    events: backtest.sim.events.map((e) =>
      e.timestamp === first.signalTime && e.event_type === "SIGNAL_SEEN"
        ? {
            ...e,
            reason: (first.direction === "BUY" ? "SELL" : "BUY") + " candidate",
          }
        : e,
    ),
  },
};
const opposite = buildDecisionJournal({ ...input, backtest: directionChanged });
assert.notEqual(
  opposite.records.find((r) => r.signalTime === first.signalTime).observationId,
  first.observationId,
);
const sampleTrade = { entryI: 1, exitI: 3, entry_mid: 100, dir: "BUY" };
const samplePath = bars.slice(0, 4).map((b) => ({ ...b, h: 102, l: 98 }));
const bounds = completedBarExcursions(samplePath, sampleTrade);
samplePath[3] = { ...samplePath[3], h: 100000, l: 0 };
assert.deepEqual(
  completedBarExcursions(samplePath, sampleTrade),
  bounds,
  "post-exit extremes must not alter completed-bar bounds",
);
assert.equal(
  completedBarExcursions(samplePath, { ...sampleTrade, exitI: 1 })
    .maxFavorablePrice,
  null,
  "same-bar exits do not fabricate excursion values",
);
const blocked = structuredClone(backtest);
blocked.sim.trades = [];
blocked.sim.events = [
  {
    timestamp: bars[60].t,
    bar_index: 60,
    event_type: "SIGNAL_SEEN",
    reason: "BUY candidate",
  },
  {
    timestamp: bars[60].t,
    bar_index: 60,
    event_type: "SIGNAL_BLOCKED_COOLDOWN",
    reason: "cooldown",
  },
];
const blockedReport = buildDecisionJournal({ ...input, backtest: blocked });
assert.equal(blockedReport.records[0].status, "POLICY_BLOCKED");
assert.equal(blockedReport.records[0].outcome, null);
const censored = structuredClone(blocked);
censored.sim.events[1] = {
  timestamp: bars[61].t,
  bar_index: 61,
  event_type: "FILL_MODELED",
  reason: "BUY filled 100",
};
const open = buildDecisionJournal({ ...input, backtest: censored });
assert.equal(open.records[0].status, "OPEN_AT_END");
assert.equal(open.records[0].outcome, null);
assert.throws(
  () =>
    buildDecisionJournal({ ...input, card: { ...card, execution_tf: "M5" } }),
  /DESIGN_BAR_MODE/,
);
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "quantsmart-evidence-"));
try {
  const repo = createDecisionEvidenceRepository(folder),
    saved = repo.save(report, card.id),
    again = repo.save(report, card.id);
  assert.deepEqual(again, saved);
  assert.equal(repo.list().length, 1);
  assert.deepEqual(
    createDecisionEvidenceRepository(folder).read(saved.id).report,
    report,
  );
  assert.throws(() => repo.read("../workspace"), /INVALID_ID/);
  assert.throws(
    () => repo.save({ ...report, live_apply_allowed: true }, card.id),
    /AUTHORITY/,
  );
  const filename = path.join(folder, saved.id + ".json");
  const corrupt = JSON.parse(fs.readFileSync(filename));
  corrupt.report.summary.closed = 999;
  fs.writeFileSync(filename, JSON.stringify(corrupt));
  assert.throws(() => repo.read(saved.id), /INTEGRITY/);
  assert.throws(() => repo.save(report, card.id), /INTEGRITY/);
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
  delete globalThis.localStorage;
}
console.log(
  JSON.stringify({
    status: "DECISION_JOURNAL_PASS",
    signals: report.summary.signals,
    closed: report.summary.closed,
    unchangedSimulator: true,
    deterministicReplay: true,
    nullNonEntryOutcomes: true,
    exitBarExcluded: true,
    durableRestartAndIntegrity: true,
    structuralIdentityClaim: false,
  }),
);
