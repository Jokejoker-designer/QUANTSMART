import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json");
const { build } = require("esbuild");
const bundle = await build({
  stdin: {
    contents:
      "export{brokerDealMarkers,brokerPositionLines}from'./src/lib/brokerDealMarkers.ts'",
    resolveDir: app,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const { brokerDealMarkers, brokerPositionLines } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const bars = [
  { t: "2026-10-30T22:00:00" },
  { t: "2026-11-02T00:00:00Z" },
  { t: "2026-11-02T01:00:00Z" },
];
const deal = {
  id: "1",
  symbol: "XAUUSD",
  brokerSymbol: "GOLD",
  positionId: "10",
  timeMs: Date.parse("2026-11-02T01:01:00Z"),
  time: "2026-11-02T01:01:00Z",
  price: 3900,
  volume: 0.03,
  side: "SELL",
  positionSide: "BUY",
  entryKind: "EXIT",
};
let marks = brokerDealMarkers(bars, [deal], "XAUUSD", 60);
assert.equal(marks.length, 1);
assert.equal(marks[0].i, 2);
assert.equal(marks[0].label, "DEMO CLOSE");
assert.ok(marks[0].detail.includes("SELL execution"));
assert.deepEqual(
  brokerDealMarkers(
    bars,
    [{ ...deal, timeMs: Date.parse("2026-11-01T12:00:00Z") }],
    "XAUUSD",
    60,
  ),
  [],
  "Weekend execution must not be mapped to a Friday candle",
);
assert.deepEqual(brokerDealMarkers(bars, [deal], "EURUSD", 60), []);
assert.equal(
  brokerDealMarkers(bars, [{ ...deal, entryKind: "ENTRY" }], "XAUUSD", 60)[0]
    .label,
  "DEMO SELL",
);
assert.equal(
  brokerDealMarkers(bars, [{ ...deal, entryKind: "REVERSAL" }], "XAUUSD", 60)[0]
    .label,
  "DEMO REVERSAL",
);
assert.deepEqual(
  brokerDealMarkers(bars, [{ ...deal, price: NaN }], "XAUUSD", 60),
  [],
);
console.log(
  "BROKER MARKERS PASS: exact candle intervals, actual price/time, symbol filtering, entry/close/reversal semantics and weekend refusal.",
);

assert.equal(
  brokerPositionLines(
    [{ symbol: "GOLD", side: "BUY", open_price: 100, sl: 99, tp: 104 }],
    "GOLD",
  ).length,
  3,
);
assert.deepEqual(
  brokerPositionLines(
    [{ symbol: "EURUSD", side: "BUY", open_price: 100, sl: 99, tp: 104 }],
    "GOLD",
  ),
  [],
);
assert.equal(
  brokerPositionLines(
    [{ symbol: "GOLD", side: "BUY", open_price: 100, sl: 0, tp: 0 }],
    "GOLD",
  ).length,
  1,
);
