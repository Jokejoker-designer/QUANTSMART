import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "./module-chain-fixture.mjs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const b = await build({
  stdin: {
    contents:
      "export{cardEntryRecords,realisticCardTrades}from'./src/lib/signatureBuild.ts';export{MeasurementEngine}from'./src/lib/measurements.ts';",
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
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
globalThis.localStorage = { getItem: () => null };
const bars = syntheticBars(1200),
  modules = ["trend_pullback", "regime_ctx", "exit_weak"];
const records = api.cardEntryRecords(
    "record-test",
    bars,
    modules,
    false,
    "XAUUSD",
    "H1",
  ),
  run = api.realisticCardTrades(
    "record-test",
    bars,
    modules,
    false,
    "XAUUSD",
    "H1",
  );
assert.ok(records.length > 0);
const measure = new api.MeasurementEngine(bars);
for (let i = 0; i < records.length; i++) {
  assert.equal(
    records[i].outcome.mfe_R,
    null,
    "Net R cannot be relabeled as MFE R",
  );
  assert.equal(records[i].outcome.mae_R, null, "A losing return is not MAE R");
  assert.deepEqual(
    records[i].snapshot,
    measure.snapshotAt(run.trades[i].entryI - 1, "XAUUSD", "H1"),
    "entry-open snapshots must not consume the entry candle high/low/close",
  );
  assert.equal(records[i].outcome.net_R, run.trades[i].netR);
}
delete globalThis.localStorage;
console.log(
  "SIGNATURE RECORD PASS: closed-signal-bar features; unavailable excursion R remains null; canonical net R retained",
);
