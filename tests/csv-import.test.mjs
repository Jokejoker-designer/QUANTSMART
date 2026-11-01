import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const baseline = process.argv.includes("--baseline");
const plugins = baseline
  ? [
      {
        name: "csv-baseline",
        setup(b) {
          b.onLoad({ filter: /csvOhlc\.ts$/ }, () => ({
            contents: execFileSync(
              "git",
              ["show", "efa8194:mfe_ux_lab/cockpit/src/lib/csvOhlc.ts"],
              { encoding: "utf8" },
            ),
            loader: "ts",
          }));
        },
      },
    ]
  : [];
const b = await build({
  stdin: { contents: "export * from './src/lib/csvOhlc.ts';", resolveDir: app },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
  plugins,
});
const { parseCsvOhlc } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
const rows = Array.from(
    { length: 130 },
    (_, i) =>
      `${new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString()},100,102,99,101`,
  ),
  csv = "time,open,high,low,close\n" + rows.join("\n");
const good = parseCsvOhlc(csv);
assert.ok(!good.error);
assert.equal(good.tf, "H1");
assert.equal(good.bars.length, 130);
assert.match(
  parseCsvOhlc(csv.replace("100,102,99,101", "100,98,99,101")).error,
  /geometry/,
  "never repair high/low",
);
assert.match(
  parseCsvOhlc(csv.replace("100,102,99,101", "100oops,102,99,101")).error,
  /numeric/,
);
const dupe = parseCsvOhlc(csv + "\n" + rows[0]);
assert.equal(dupe.quality.duplicatesRemoved, 1);
assert.equal(dupe.bars.length, 130);
assert.match(
  parseCsvOhlc(csv + "\n" + rows[0].replace(",101", ",100")).error,
  /conflicting/,
);
const tsv =
  "\ufeff<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\n" +
  Array.from(
    { length: 8 },
    (_, i) => `2020.01.01\t0${i}:00:00\t100\t102\t99\t101`,
  ).join("\n");
assert.equal(parseCsvOhlc(tsv).bars.length, 8);
const locale =
  "Date;Time;Open;High;Low;Close\n" +
  Array.from(
    { length: 8 },
    (_, i) => `31/01/2020;0${i}:00;100,1;102,2;99,3;101,4`,
  ).join("\n");
assert.ok(parseCsvOhlc(locale).error);
const local = parseCsvOhlc(locale, { dateOrder: "DMY", utcOffsetMinutes: 420 });
assert.equal(local.bars[0].t, "2020-01-30T17:00:00");
assert.equal(local.bars[0].o, 100.1);
const quoted =
  "time,open,high,low,close,note\n" +
  rows
    .slice(0, 8)
    .map((r) => r + ',"text, with ""quotes""\nand a newline"')
    .join("\n");
assert.equal(parseCsvOhlc(quoted).bars.length, 8);
assert.ok(parseCsvOhlc(csv.replace("2020-01-01", "2020-02-30")).error);
const bid =
  "DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen,AskHigh,AskLow,AskClose\n" +
  rows
    .slice(0, 8)
    .map((r) => r + ",101,103,100,102")
    .join("\n");
const ask = parseCsvOhlc(bid, { priceBasis: "ASK" });
assert.equal(ask.bars[0].o, 101);
assert.equal(ask.quality.priceBasis, "ASK");
const micro = Array.from(
  { length: 8 },
  (_, i) =>
    `${BigInt(Date.UTC(2025, 0, 1) + i * 60000) * 1000n},100,102,99,101`,
);
assert.equal(parseCsvOhlc(micro.join("\n")).bars[0].t, "2025-01-01T00:00:00");
assert.ok(parseCsvOhlc(csv, { timeframe: "constructor" }).error);
assert.ok(parseCsvOhlc(csv, { priceBasis: "INVALID" }).error);
assert.ok(parseCsvOhlc(csv, { utcOffsetMinutes: 99999 }).error);
const long = Array.from(
  { length: 80005 },
  (_, i) => `${Date.UTC(2020, 0, 1) + i * 60000},100,102,99,101`,
).join("\n");
assert.equal(
  parseCsvOhlc(long).bars.length,
  80005,
  "do not silently truncate old 50k/80k limits",
);
if (process.env.QUANTSMART_REAL_CSV) {
  const real = parseCsvOhlc(
    fs.readFileSync(process.env.QUANTSMART_REAL_CSV, "utf8"),
  );
  assert.ok(!real.error, real.error);
  assert.equal(real.bars.length, 44640);
  assert.equal(real.tf, "M1");
  assert.equal(real.quality.gapCount, 0);
  console.log(
    "REAL CSV PASS: Binance BTCUSDT January 2025, 44,640 M1 rows retained.",
  );
}
console.log(
  "CSV IMPORT PASS: strict geometry/numbers, duplicates, quoted fields, calendar, offsets, MT5, bid/ask, microseconds and 80,005-row retention.",
);
