import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(
  new URL(
    "../../../docs/schemas/module-import-contracts.json",
    import.meta.url,
  ),
);
const compiled = await build({
  stdin: {
    contents:
      "export {moduleImportSchemas} from './src/lib/moduleJsonSchemas.ts'; export {l1BlockContracts} from './src/lib/blocks/blockJsonContract.ts'; export {L1_EXAMPLE,L2_EXAMPLE,L3_EXAMPLE,L6_EXAMPLE,FEW_SHOT_PRESETS} from './src/lib/aiContextPack.ts';",
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
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const result = {
  schema: "quantsmart.module-import-contracts/1",
  purpose:
    "Canonical JSON output contracts; semantic validation still required",
  authority: "SHADOW_ONLY",
  live_apply_allowed: false,
  limits: {
    jsonTextCharacters: 8 * 1024 * 1024,
    graphNodes: 256,
    dependencyDepth: 64,
    conditions: 100,
    l2Features: 128,
  },
  L1Blocks: api.l1BlockContracts(),
  schemas: api.moduleImportSchemas(),
  examples: {
    L1: api.L1_EXAMPLE,
    L2: api.L2_EXAMPLE,
    L3: api.L3_EXAMPLE,
    L4: api.FEW_SHOT_PRESETS.find((x) => x.module.level === 4).module,
    L5: api.FEW_SHOT_PRESETS.find((x) => x.module.level === 5).module,
    L6: api.L6_EXAMPLE,
  },
};
const text = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8").replaceAll("\r\n", "\n") !== text)
    throw new Error(
      "Generated module contracts are stale. Run node mfe_ux_lab/cockpit/tools/generate-module-contracts.mjs.",
    );
} else {
  mkdirSync(fileURLToPath(new URL("../../../docs/schemas/", import.meta.url)), {
    recursive: true,
  });
  writeFileSync(output, text);
}
console.log(
  JSON.stringify({
    status: process.argv.includes("--check")
      ? "MODULE_CONTRACTS_CURRENT"
      : "MODULE_CONTRACTS_GENERATED",
    L1Blocks: result.L1Blocks.length,
    schemas: Object.keys(result.schemas),
    bytes: Buffer.byteLength(text),
  }),
);
