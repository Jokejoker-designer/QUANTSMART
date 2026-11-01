import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { moduleChain } from "./module-chain-fixture.mjs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const b = await build({
  stdin: {
    contents:
      "export{prepareDefinitionImport,canonicalDefinition}from'./src/lib/portableDefinitions.ts';export{FEATURE_TEMPLATES}from'./src/lib/blocks/featureTemplates.ts';export{QUANT_AUTHORITY}from'./src/lib/blocks/quantAstTypes.ts';export{L3_AUTHORITY}from'./src/lib/blocks/customL3.ts';export{parseAiIndicator}from'./src/lib/aiContextPack.ts';",
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
const bundle = moduleChain(api),
  prepared = api.prepareDefinitionImport(bundle.definitions, {});
assert.equal(prepared.stores.mfe_custom_l1[0].status, "SHADOW");
assert.equal(prepared.stores.mfe_custom_l2[0].status, "SHADOW");
assert.equal(prepared.stores.mfe_custom_l3[0].validation.oosStatus, "NOT_RUN");
assert.notEqual(prepared.stores.mfe_custom_l3[0].astHash, "forged");
assert.deepEqual(
  api.prepareDefinitionImport(prepared.stores, prepared.updates).stores,
  prepared.stores,
  "reimport is stable",
);
for (const key of [
  "mfe_custom_l1",
  "mfe_custom_l2",
  "mfe_custom_l3",
  "mfe_custom_modules",
  "mfe_custom_l6",
]) {
  const bad = structuredClone(bundle.definitions);
  bad[key][0] = { id: "malformed" };
  assert.throws(() => api.prepareDefinitionImport(bad, {}));
}
const conflict = structuredClone(bundle.definitions);
conflict.mfe_custom_l1[0].graph.nodes[0].blockId = "source_close";
assert.throws(
  () => api.prepareDefinitionImport(conflict, prepared.updates),
  /conflict|Invalid/,
);
const missing = structuredClone(bundle.definitions);
delete missing.mfe_custom_l1;
assert.throws(
  () => api.prepareDefinitionImport(missing, {}),
  /Missing|unavailable/,
);
const overlay = {
  id: "overlay_fixture",
  name: "EMA overlay fixture",
  explain: "Causal EMA reference context",
  kind: "overlay",
  featureKeys: [],
  weights: {},
  overlayKey: "ema",
  overlayParams: { period: 20 },
  status: "PROMOTED",
  createdAt: "2020-01-01",
};
const parsed = api.parseAiIndicator(JSON.stringify(overlay));
assert.equal(parsed.ok, true, parsed.errors?.join(";"));
assert.equal(parsed.module.kind, "overlay");
assert.equal(
  api.prepareDefinitionImport({ mfe_custom_l2: [overlay] }, {}).stores
    .mfe_custom_l2[0].status,
  "SHADOW",
);
console.log(
  "PORTABLE DEFINITIONS PASS: L1–L6 structure/dependencies, untrusted claims reset, stable reimport, conflicts, missing inputs and native overlay definitions.",
);

assert.equal(api.canonicalDefinition({featureKeys:["ema_slope"],weights:{ema_slope:1,rsi_value:99},weightSrc:{ema_slope:"USER_WEIGHTED",rsi_value:"USER_WEIGHTED"}}),api.canonicalDefinition({featureKeys:["ema_slope"],weights:{ema_slope:1},weightSrc:{ema_slope:"USER_WEIGHTED"}}),"unused L2 inputs must not create a false same-ID mechanism conflict");
