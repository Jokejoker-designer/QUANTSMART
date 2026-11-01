import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild"),
  output = path.join(app, ".mfe-state/sandbox-render.cjs");
fs.mkdirSync(path.dirname(output), { recursive: true });
globalThis.localStorage = { getItem: () => null };
try {
  await build({
    stdin: {
      contents:
        "export{DecisionEvidencePanel}from'./src/components/DecisionEvidencePanel.tsx';export{ModuleIntentSandbox}from'./src/components/ModuleIntentSandbox.tsx';export{L1ModuleSandbox}from'./src/components/L1ModuleSandbox.tsx';export{L2Preview}from'./src/components/L2Preview.tsx';export{QuantLab}from'./src/components/QuantLab.tsx';export{L4GateBuilder}from'./src/components/L4GateBuilder.tsx';export{L5Sandbox}from'./src/components/L5Sandbox.tsx';export{L6ZoneBuilder}from'./src/components/L6ZoneBuilder.tsx';export{FeatureTestChart}from'./src/components/FeatureTestChart.tsx';export{FEATURE_TEMPLATES}from'./src/lib/blocks/featureTemplates.ts';",
      resolveDir: app,
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: output,
    external: ["react"],
    loader: { ".css": "empty" },
    logLevel: "silent",
  });
  const api = require(output),
    React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  for (const name of [
    "L1ModuleSandbox",
    "L2Preview",
    "QuantLab",
    "L4GateBuilder",
    "L5Sandbox",
    "L6ZoneBuilder",
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(api[name], { onClose: () => {} }),
    );
    assert.match(html, /Close/);
    assert.match(html, /CSV|dataset/);
    assert.ok(
      !html.includes("Save, Qualify for L2/L3"),
      "structural save must not claim qualification",
    );
    console.log("PASS " + name + " actual markup and closable data controls");
  }
  const journalMarkup=renderToStaticMarkup(React.createElement(api.DecisionEvidencePanel,{importId:"fixture",card:{id:"fixture",modules:[],symbol:"XAUUSD",design_tf:"H1",execution_tf:"H1"},from:"2020-01-01T00:00:00",to:"2020-01-02T00:00:00",windowTf:"H1",barsCount:5000,options:{symbol:"XAUUSD"}}));
  assert.match(journalMarkup,/Decision &amp; outcome evidence/);assert.match(journalMarkup,/Build decision journal/);assert.match(journalMarkup,/Saved evidence/);assert.match(journalMarkup,/No-entry and open observations have no return label/);
  console.log("PASS decision evidence controls expose source limits, null-outcome semantics and saved-report access.");
  const bars = Array.from({ length: 5 }, (_, i) => ({
    i,
    t: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
    o: 100,
    h: 102,
    l: 99,
    c: 101,
    r: "N",
  }));
  const chart = renderToStaticMarkup(
    React.createElement(api.FeatureTestChart, {
      graph: api.FEATURE_TEMPLATES[0].graph,
      bars,
      sourceLabel: "XAUUSD · H1 · CSV fixture",
    }),
  );
  const inspector = renderToStaticMarkup(React.createElement(api.ModuleIntentSandbox, {draft:{id:"fixture",name:"CSV inspector",level:4,role:"CONTEXT",conditions:[{metric:"rsi",op:">",value:50}],logic:"ALL"}, valid:true,bars:Array.from({length:80},(_,i)=>({...bars[i%5],i})),timeframe:"H1",sourceLabel:"XAUUSD H1 selected CSV"}));
  assert.match(inspector,/XAUUSD H1 selected CSV/);
  assert.ok(!inspector.includes("Loading bars M15"));
  assert.ok(!inspector.includes("NaN"));
  console.log("PASS L4/L5 bar inspector uses supplied CSV observations without fetching unrelated M15 history.");
  assert.match(chart, /XAUUSD.*H1/);
  assert.match(chart, /5 observations/);
  assert.match(chart, /aria-label="Feature replay position"/);
  assert.ok(!chart.includes("NaN"));
  assert.match(chart, /min="0"/);
  console.log(
    "PASS supplied CSV replay on a five-bar tape without invalid range or missing time access.",
  );
} finally {
  delete globalThis.localStorage;
  fs.rmSync(output, { force: true });
}
