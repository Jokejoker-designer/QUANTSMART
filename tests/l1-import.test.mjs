import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const b = await build({
  stdin: {
    contents:
      "export{parseAiFeature}from'./src/lib/aiContextPack.ts';export{validateGraph}from'./src/lib/blocks/featureGraph.ts';export{FEATURE_TEMPLATES}from'./src/lib/blocks/featureTemplates.ts';",
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
const template = api.FEATURE_TEMPLATES[0],
  data = {
    name: "Imported rejection",
    explain: "A candle rejection feature for research",
    why: "A bounded geometric research measurement",
    graph: structuredClone(template.graph),
  };
const cases = {
  malformed() {
    assert.doesNotThrow(() => {
      const result = api.parseAiFeature(
        JSON.stringify({ ...data, graph: { nodes: [null], output: "out" } }),
      );
      assert.equal(result.ok, false);
    });
  },
  duplicate() {
    const graph = structuredClone(template.graph);
    graph.nodes.push({ ...graph.nodes[0] });
    assert.equal(api.validateGraph(graph).ok, false);
  },
  parameters() {
    const graph = structuredClone(template.graph);
    graph.nodes[0].params = { bad: "string" };
    assert.equal(api.validateGraph(graph).ok, false);
  },
  rawGraph() {
    assert.equal(
      api.parseAiFeature(JSON.stringify(template.graph)).ok,
      true,
      "a native graph export should be inspectable",
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
