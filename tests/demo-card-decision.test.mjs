import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { syntheticBars, moduleChain } from "./module-chain-fixture.mjs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
async function bundle() {
  const built = await build({
    stdin: {
      contents:
        "export{evaluateDemoCard}from'./src/lib/demoCardDecision.ts';export{runRealisticBacktest}from'./src/lib/realisticSimRun.ts';export{runRealisticSim}from'./src/lib/realisticStrategySim.ts';export{cloneSimConfig}from'./src/lib/simConfig.ts';export{getSymbolSpec}from'./src/lib/symbolSpec.ts';export{FEATURE_TEMPLATES}from'./src/lib/blocks/featureTemplates.ts';export{QUANT_AUTHORITY}from'./src/lib/blocks/quantAstTypes.ts';export{L3_AUTHORITY}from'./src/lib/blocks/customL3.ts';",
      resolveDir: app,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(built.outputFiles[0].text).toString("base64") +
      "#" +
      Math.random()
  );
}
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) || null };
const api = await bundle(),
  bars = syntheticBars(1200);
const card = {
  id: "native",
  name: "Native Card",
  symbol: "XAUUSD",
  design_tf: "H1",
  execution_tf: "H1",
  modules: ["trend_pullback", "regime_ctx", "exit_weak", "mr_exit"],
};
// Golden SHA-256 was measured against the unmodified 391b6a0 simulator. Works in source ZIPs without Git.
assert.equal(
  createHash("sha256")
    .update(
      JSON.stringify(
        api.runRealisticBacktest(bars, card, { symbol: "XAUUSD" }).sim,
      ),
    )
    .digest("hex"),
  "9e4073e18cca89b1ef5873e4ae86ec1d1c888f633fff5d05dea845868df2ba3b",
  "Default historical simulation must stay unchanged",
);
let signals = 0;
for (let end = 150; end < 300; end++) {
  const tape = bars.slice(0, end),
    last = tape.at(-1),
    nowMs = Date.parse(last.t.replace(/Z?$/, "Z")) + 3600000;
  const decision = api.evaluateDemoCard({
    card,
    bars: tape,
    bid: last.c,
    ask: last.c + 0.02,
    nowMs,
    position: null,
  });
  let canonical = null;
  const future = {
    ...last,
    i: end,
    t: new Date(nowMs).toISOString(),
    o:
      decision.kind === "OPEN" && decision.side === "SELL"
        ? last.c
        : last.c + 0.02,
  };
  api.runRealisticSim([...tape, future], card.modules, false, {
    cfg: api.cloneSimConfig(),
    spec: api.getSymbolSpec("XAUUSD"),
    designTf: "H1",
    cardId: "native",
    symbol: "XAUUSD",
    researchIntervention: { collectOnly: true },
    onResearchCandidate: (c) => {
      if (c.signalI === end - 1) canonical = c.dir;
    },
  });
  assert.equal(
    decision.kind === "OPEN" ? decision.side : null,
    canonical,
    "Last closed-bar probe must match the existing native entry/gate evaluator",
  );
  if (decision.kind === "OPEN") {
    signals++;
    assert.ok(decision.sl > 0 && decision.tp > 0);
    assert.ok(
      decision.side === "BUY"
        ? decision.sl < last.c && decision.tp > last.c
        : decision.sl > last.c && decision.tp < last.c,
    );
  }
}
assert.ok(signals > 5);
const tape = bars.slice(0, 250),
  last = tape.at(-1),
  nowMs = Date.parse(last.t.replace(/Z?$/, "Z")) + 3600000,
  input = {
    card,
    bars: tape,
    bid: last.c,
    ask: last.c + 0.02,
    nowMs,
    position: null,
  };
assert.throws(
  () => api.evaluateDemoCard({ ...input, nowMs: nowMs - 1 }),
  /NOT_FRESH/,
);
assert.throws(
  () => api.evaluateDemoCard({ ...input, nowMs: nowMs + 30001 }),
  /NOT_FRESH/,
);
assert.throws(
  () =>
    api.evaluateDemoCard({ ...input, card: { ...card, execution_tf: "M1" } }),
  /DESIGN_CLOSE_ONLY/,
);
assert.throws(
  () =>
    api.evaluateDemoCard({
      ...input,
      card: { ...card, modules: ["regime_ctx"] },
    }),
  /EXPLICIT_TRIGGER_REQUIRED/,
);
assert.throws(
  () =>
    api.evaluateDemoCard({
      ...input,
      card: { ...card, modules: ["trend_pullback", "ev_rolling"] },
    }),
  /UNSUPPORTED_MODULE/,
);
const chain = moduleChain(api);
for (const [key, value] of Object.entries(chain.definitions))
  storage.set(key, typeof value === "string" ? value : JSON.stringify(value));
// Use a fresh module bundle so frozen per-worker library caches see this custom chain.
const customApi = await bundle();
const customCard = {
  ...chain.cards[0],
  design_tf: "H1",
  execution_tf: "H1",
  symbol: "XAUUSD",
};
const customDecision = customApi.evaluateDemoCard({
  ...input,
  card: customCard,
});
assert.ok(["WAIT", "OPEN"].includes(customDecision.kind));
storage.set(
  "mfe_custom_modules",
  JSON.stringify(
    JSON.parse(storage.get("mfe_custom_modules")).map((m) =>
      m.role === "TRIGGER"
        ? { ...m, conditions: [{ metric: "dayPnlR", op: ">", value: 0 }] }
        : m,
    ),
  ),
);
const third = await bundle();
assert.throws(
  () => third.evaluateDemoCard({ ...input, card: customCard }),
  /ACCOUNT_METRIC_UNSUPPORTED/,
);
console.log(
  "DEMO CARD DECISION PASS: native trigger/gate parity on 150 prefixes, unchanged historical engine output, directional broker protection, closed-bar freshness, explicit trigger and unsupported-context refusal.",
);
delete globalThis.localStorage;
