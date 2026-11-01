import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(path.join(app, "package.json")),
  { build } = require("esbuild");
const state = path.join(app, ".mfe-state");
fs.mkdirSync(state, { recursive: true });
const output = path.join(state, "first-run-ui.cjs");
try {
  await build({
    stdin: {
      contents: "export{FirstRun}from'./src/shell/FirstRun.tsx';export{decodeCsvBytes}from'./src/lib/csvImports.ts';",
      resolveDir: app,
      loader: "tsx",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: output,
    external: ["react"],
    loader: { ".css": "empty" },
    logLevel: "silent",
  });
  const { FirstRun, decodeCsvBytes } = require(output),
    React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  globalThis.localStorage = { getItem: () => null };
  assert.equal(decodeCsvBytes(new Uint8Array(Buffer.from('\ufefftime,open','utf16le'))),'time,open');
  assert.equal(decodeCsvBytes(new TextEncoder().encode('time,open')),'time,open');
  assert.throws(()=>decodeCsvBytes(new Uint8Array([255,255,255])));
  const html = renderToStaticMarkup(
    React.createElement(FirstRun, { navigate: () => {} }),
  );
  assert.match(html, /Choose your first data source/);
  assert.match(html, /Import or reopen historical CSV/);
  assert.match(html, /OHLC file/);
  assert.match(html, /UTC offset for times without a zone/);
  assert.match(html, /Validate and save locally/);
  assert.match(html, /32 MB/);
  assert.match(html, /type="file"/);
  assert.match(html, /required=""/);
  assert.ok(!html.includes("Imports are held in this browser session"));
  console.log(
    "FIRST RUN PASS: actual import form renders accessible file/date/time/basis controls and durable-workspace copy. Browser interaction is a separate acceptance step.",
  );
} finally {
  delete globalThis.localStorage;
  fs.rmSync(output, { force: true });
}
