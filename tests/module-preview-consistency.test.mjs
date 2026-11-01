import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const b = await build({
  stdin: {
    contents:
      "export{zoneCenterSeries,zoneAtrSeries,atrOf}from'./src/lib/blocks/l6Eval.ts';export{replayLastIndex}from'./src/lib/microscopeComputed.ts';export{previewModule,buildPreviewCtx,countPreviewStates}from'./src/lib/moduleIntentPreview.ts';export{runRealisticSim}from'./src/lib/realisticStrategySim.ts';export{cloneSimConfig}from'./src/lib/simConfig.ts';export{XAUUSD_PROVISIONAL_SPEC}from'./src/lib/symbolSpec.ts';",
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
const bars = Array.from({ length: 500 }, (_, i) => {
  const o = 100 + Math.sin(i / 8) * 4,
    c = 100 + Math.sin((i + 1) / 8) * 4,
    w = 0.1 + (i % 37) / 20;
  return {
    i,
    t: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
    o,
    h: Math.max(o, c) + w,
    l: Math.min(o, c) - w,
    c,
    r: "N",
  };
});
const cfg = api.cloneSimConfig();
cfg.discipline.cooldownBars.H1 = 0;
cfg.discipline.maxTradesPerDay.H1 = 10000;
let failed = 0;
for (const metric of ["rsi", "atrRatio"]) {
  const module = {
    id: "consistency_" + metric,
    name: "Consistency test",
    level: 5,
    role: "TRIGGER",
    direction: "LONG",
    logic: "ALL",
    conditions: [{ metric, op: ">=", value: metric === "rsi" ? 55 : 1 }],
    explain: "Mechanical consistency fixture",
    why: "Check preview against canonical engine",
    status: "SHADOW",
  };
  const engine = [];
  api.runRealisticSim(bars, [module.id], false, {
    cfg,
    spec: api.XAUUSD_PROVISIONAL_SPEC,
    designTf: "H1",
    symbol: "XAUUSD",
    cardId: "CONSISTENCY",
    customModules: [module],
    researchIntervention: { collectOnly: true },
    onResearchCandidate: (c) => engine.push(c.signalI),
  });
  const preview = api
    .previewModule(bars, module)
    .fires.map((p) => p.i)
    .filter((i) => i < bars.length - 1);
  try {
    assert.deepEqual(preview, engine);
    console.log("PASS " + metric + " preview/canonical candidates");
  } catch {
    failed++;
    console.error(
      "FAIL " +
        metric +
        ": preview " +
        preview.length +
        " vs engine " +
        engine.length +
        " candidate indices differ",
    );
  }
}
process.exitCode = failed ? 1 : 0;

const dist=api.countPreviewStates(Array.from({length:100},(_,i)=>i<60?"WATCH":"READY"),[Array.from({length:100},(_,i)=>i===50?NaN:1)],40);
assert.equal(dist.observations,59);assert.equal(dist.counts.WATCH,19);assert.equal(dist.counts.READY,40);assert.equal(Object.values(dist.counts).reduce((a,b)=>a+b,0),dist.observations);console.log("PASS state histogram excludes warmup and unavailable inputs from both counts and denominator");

assert.equal(api.replayLastIndex(5000,"CSV"),4999);assert.equal(api.replayLastIndex(5000,"Replay"),4999);assert.equal(api.replayLastIndex(5000,"Live"),4998);assert.equal(api.replayLastIndex(0,"CSV"),0);console.log("PASS Show results includes the last closed CSV observation while Live excludes the forming bar");

const atr=api.zoneAtrSeries(bars);for(let i=0;i<bars.length;i++)assert.equal(atr[i],api.atrOf(bars,i));let evidenceCalls=0;const centers=api.zoneCenterSeries({anchor:"evidence",anchorRef:"fixture",offsetAtr:.2},bars,()=>{evidenceCalls++;return bars.map(()=>.5)});assert.equal(evidenceCalls,1);assert.equal(centers.at(-1),bars.at(-1).c+.5*atr.at(-1)+.2*atr.at(-1));console.log("PASS L6 computes evidence once per series and retains exact causal ATR values");
