import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const b = await build({
  stdin: {
    contents:
      "export{parseAiIndicator,parseAiFormula,parseAiModule,parseAiZone}from'./src/lib/aiContextPack.ts';export{validateModule}from'./src/lib/customModule.ts';",
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
const l4 = {
  name: "Context example",
  explain: "A bounded context condition for research",
  why: "Explicit context gating for the selected evidence",
  level: 4,
  role: "CONTEXT_GATE",
  conditions: [{ metric: "hour", op: ">=", value: 7 }],
  logic: "ALL",
};
const cases = {
  L2() {
    assert.equal(
      api.parseAiIndicator(
        JSON.stringify({
          name: "Missing input",
          explain: "A weighted input measurement",
          featureKeys: ["missing_l1"],
          weights: { missing_l1: 1 },
        }),
      ).ok,
      false,
    );
  },
  L3() {
    assert.doesNotThrow(() =>
      assert.equal(
        api.parseAiFormula(
          JSON.stringify({
            name: "Broken AST",
            ast: { nodes: { root: null }, rootNodeId: "root" },
          }),
        ).ok,
        false,
      ),
    );
  },
  L4() {
    assert.equal(
      api.parseAiModule(
        JSON.stringify({
          ...l4,
          conditions: [{ metric: "hour", op: "RUN_CODE", value: 7 }],
        }),
      ).ok,
      false,
    );
  },
  L5() {
    assert.equal(
      api.parseAiModule(
        JSON.stringify({
          ...l4,
          level: 5,
          role: "TRIGGER",
          direction: "UNSUPPORTED",
        }),
      ).ok,
      false,
    );
  },
  L6() {
    assert.equal(
      api.parseAiZone(
        JSON.stringify({
          name: "Missing anchor",
          explain: "Reference to missing evidence",
          anchor: "evidence",
          anchorRef: "missing_feature",
          role: "OBSERVE",
          offsetAtr: 0,
          widthAtr: 1,
        }),
      ).ok,
      false,
    );
  },
};
let failed = 0;
for (const [name, test] of Object.entries(cases)) {
  try {
    test();
    console.log("PASS " + name);
  } catch (e) {
    failed++;
    console.error("FAIL " + name + ": " + e.message.split("\n")[0]);
  }
}
process.exitCode = failed ? 1 : 0;
