import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { moduleChain, syntheticBars } from "./module-chain-fixture.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import net from "node:net";
const root = fileURLToPath(new URL("..", import.meta.url)),
  app = path.join(root, "mfe_ux_lab/cockpit"),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild");
const b = await build({
  stdin: {
    contents:
      "export{commitDefinitionChange}from'./src/lib/definitionPersistence.ts';export{saveBeast,loadBeasts}from'./src/lib/cardBeastV2/beastStore.ts';export{composeBeast}from'./src/lib/cardBeastV2/beastCompose.ts';export{rolePowerReport}from'./src/lib/cardBeastV2/beastCompose.ts';export{computeCardZones}from'./src/lib/cardZones.ts';export{importStrategyBundle,exportStrategyBundle}from'./src/lib/strategyBundle.ts';export{initializeWorkspace,flushWorkspace}from'./src/lib/workspaceClient.ts';export{loadCustomL1,saveCustomL1}from'./src/lib/blocks/customL1.ts';export{FEATURE_TEMPLATES}from'./src/lib/blocks/featureTemplates.ts';export{QUANT_AUTHORITY}from'./src/lib/blocks/quantAstTypes.ts';export{L3_AUTHORITY}from'./src/lib/blocks/customL3.ts';export{customMetricSeries}from'./src/lib/customMetricBridge.ts';export{zoneCenterSeries}from'./src/lib/blocks/l6Eval.ts';",
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
const workspace = fs.mkdtempSync(path.join(tmpdir(), "quantsmart-layers-")),
  reservation = net.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = "http://127.0.0.1:" + port;
let child,
  errors = "";
async function boot() {
  child = spawn(
    process.execPath,
    [
      "mfe_ux_lab/cockpit/tools/productServer.mjs",
      "--port",
      String(port),
      "--workspace",
      workspace,
    ],
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stderr.on("data", (b) => (errors += b));
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(errors);
    try {
      if ((await fetch(base + "/api/research/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Server startup timeout");
}
async function stop() {
  if (child?.exitCode === null) {
    const done = new Promise((r) => child.once("exit", r));
    child.kill();
    await done;
  }
}
const values = new Map();
let rejectWrites = false,
  rejectLocal = false;
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    if (rejectLocal && key === "mfe_custom_l1")
      throw new Error("QUOTA_FIXTURE");
    values.set(key, String(value));
  },
  removeItem: (key) => values.delete(key),
};
globalThis.window = new EventTarget();
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (String(url).startsWith("/api/")) {
    if (rejectWrites && options?.method === "PUT")
      return Promise.resolve(
        new Response(JSON.stringify({ error: "SAVE_FAILURE_FIXTURE" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      );
    return originalFetch(base + url, options);
  }
  return originalFetch(url, options);
};
async function request(route, body) {
  const r = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
async function job(body, expected) {
  let state = await request("/api/research/jobs", body);
  for (let i = 0; i < 500; i++) {
    if (state.status === "failed") {
      if (expected) {
        assert.match(state.error, expected);
        return;
      }
      throw new Error(state.error);
    }
    if (state.status === "done") {
      assert.ok(!expected, "expected failure");
      return (await request("/api/research/jobs/" + state.id + "/result"))
        .result;
    }
    await new Promise((r) => setTimeout(r, 30));
    state = await request("/api/research/jobs/" + state.id);
  }
  throw new Error("Job timeout");
}
try {
  await boot();
  await api.initializeWorkspace();
  const bundle = moduleChain(api);
  const imported = await api.importStrategyBundle(bundle);
  assert.equal(imported.added, 1);
  const saved = await request("/api/research/workspace");
  const cards = JSON.parse(saved.storage.mfe_strategy_cards);
  assert.equal(cards[0].n, 0);
  assert.equal(cards[0].netR, 0);
  assert.notEqual(cards[0].validationReceipt?.verified, true);
  assert.equal(JSON.parse(saved.storage.mfe_custom_l1)[0].status, "SHADOW");
  assert.equal(
    JSON.parse(saved.storage.mfe_custom_l3)[0].validation.oosStatus,
    "NOT_RUN",
  );
  assert.ok(cards[0].modules.includes("l6_fixture"),"legacy L6 prefix normalized to native Card ID");
  const geometry=api.computeCardZones(syntheticBars(),cards[0].modules);
  assert.equal(geometry.length,1);assert.ok(Number.isFinite(geometry[0].lo));assert.ok(geometry[0].hi>geometry[0].lo);
  const earlier=api.computeCardZones(syntheticBars(),cards[0].modules,{atIndex:500});
  const futureChanged=syntheticBars().map((bar,i)=>i>500?{...bar,o:bar.o*5,h:bar.h*5,l:bar.l*5,c:bar.c*5}:bar);
  assert.deepEqual(api.computeCardZones(futureChanged,cards[0].modules,{atIndex:500}),earlier,"future bars must not move past custom zones");
  const exported = api.exportStrategyBundle();
  assert.equal(exported.definitions.mfe_custom_l1.length, 1);
  assert.equal((await api.importStrategyBundle(exported)).skipped, 1);
  const before = JSON.stringify([...values]);
  const bad = structuredClone(bundle);
  bad.cards[0].id = "invalid_new_card";
  bad.definitions.mfe_custom_l1[0].graph.nodes = [null];
  await assert.rejects(() => api.importStrategyBundle(bad), /Invalid L1/);
  assert.equal(JSON.stringify([...values]), before);
  rejectWrites = true;
  await assert.rejects(
    () =>
      api.importStrategyBundle({
        ...exported,
        cards: exported.cards.map((c) => ({ ...c, id: "write_failure_card" })),
      }),
    /SAVE_FAILURE_FIXTURE/,
  );
  rejectWrites = false;
  assert.equal(
    JSON.stringify([...values]),
    before,
    "failed durable save must restore Cards and definition caches",
  );
  await api.flushWorkspace();
  rejectLocal = true;
  assert.throws(() => api.saveCustomL1([]), /QUOTA_FIXTURE/);
  rejectLocal = false;
  assert.equal(
    api.loadCustomL1().length,
    1,
    "quota failure must not replace in-memory library",
  );
  const bars = syntheticBars(),
    text =
      "time,open,high,low,close\n" +
      bars.map((b) => [b.t, b.o, b.h, b.l, b.c].join(",")).join("\n");
  const meta = await job({
    kind: "csv_import",
    filename: "Layer chain synthetic fixture.csv",
    symbol: "XAUUSD",
    text,
    csvOptions: {},
    storage: {},
  });
  const storage = Object.fromEntries(
    Object.entries(saved.storage).filter(([key]) =>
      key.startsWith("mfe_custom_"),
    ),
  );
  const members=[{card_id:"a",role:"ATTACKER",modules:["trend_pullback","fusion","auto_rr"],source_kind:"TEMPLATE"},{card_id:"g",role:"GUARD",modules:["regime_ctx"],source_kind:"TEMPLATE"},{card_id:"e",role:"EXIT_SENTINEL",modules:["exit_weak"],source_kind:"TEMPLATE"},{card_id:"l0",role:"SAFETY",modules:[],source_kind:"SAFETY"}];
  const context={symbol:"XAUUSD",design_tf:"H1",execution_tf:"H1"};
  rejectWrites=true;
  await assert.rejects(()=>api.commitDefinitionChange(()=>api.saveBeast("Save failure fixture",members,api.composeBeast(members),undefined,context),["mfe_beasts"]),/SAVE_FAILURE/);
  assert.equal(api.loadBeasts().length,0,"failed Beast save rolls back the visible library");rejectWrites=false;
  const beastReport=await job({kind:"diagnostic",analysis:"beast_roles",importId:meta.id,timeframe:"H1",options:{symbol:"XAUUSD"},parameters:{members,context},storage});
  assert.deepEqual(beastReport.full,api.rolePowerReport(bars,members,false,context).full);
  await job({kind:"diagnostic",analysis:"beast_roles",importId:meta.id,timeframe:"H1",options:{symbol:"XAUUSD"},parameters:{members,context:{...context,design_tf:"M15"}},storage},/BEAST_CSV_CONTEXT_MISMATCH/);
  console.log("BEAST CSV PASS: role analysis agrees with the canonical H1 run and rejects a different declared timeframe");
  const results = {};
  for (const id of [
    "l1_fixture",
    "l2_fixture",
    "l3_fixture",
    "l4_fixture",
    "l5_fixture",
    "l6_fixture",
  ]) {
    const result = await job({
      kind: "layer_preview",
      importId: meta.id,
      timeframe: "H1",
      moduleId: id,
      storage,
    });
    assert.equal(result.source.evaluatedBars, bars.length);
    assert.equal(result.source.importId, meta.id);
    assert.equal(result.series.length, bars.length);
    assert.ok(result.series.some(Number.isFinite));
    results[id] = { status: result.status, samples: result.series.length };
    if (["l1_fixture", "l2_fixture", "l3_fixture"].includes(id))
      assert.deepEqual(result.series, api.customMetricSeries(id, bars));
    if (id === "l6_fixture")
      assert.deepEqual(
        result.series,
        api.zoneCenterSeries(JSON.parse(saved.storage.mfe_custom_l6)[0], bars),
      );
  }
  const feature = await job({
    kind: "feature_preview",
    importId: meta.id,
    timeframe: "H1",
    graph: JSON.parse(saved.storage.mfe_custom_l1)[0].graph,
    roles: ["TIMING_TRIGGER"],
    storage,
  });
  assert.deepEqual(
    feature.allSeries[JSON.parse(saved.storage.mfe_custom_l1)[0].graph.output],
    api.customMetricSeries("l1_fixture", bars),
  );
  assert.equal(feature.gates.length, 1);
  assert.notEqual(feature.gates[0].verdict,"OOS_QUALIFIED","same-sample role checks must not issue independent OOS qualification");
  const testCard = cards[0],
    options = {
      symbol: "XAUUSD",
      customModules: JSON.parse(saved.storage.mfe_custom_modules),
    };
  const bt = await job({
    kind: "backtest",
    source: "CSV",
    importId: meta.id,
    card: testCard,
    options,
    storage,
  });
  assert.ok(bt.analytics.n > 0);
  assert.equal(bt.manifest.data_range.bars, bars.length);
  assert.equal(bt.sim.actual_trades_taken >= bt.analytics.n, true);
  await stop();
  await boot();
  const reopened = await request("/api/research/workspace");
  assert.equal(JSON.parse(reopened.storage.mfe_strategy_cards).length, 1);
  assert.equal(
    JSON.parse(reopened.storage.mfe_custom_l3)[0].astHash,
    JSON.parse(saved.storage.mfe_custom_l3)[0].astHash,
  );
  const repeat = await job({
    kind: "backtest",
    source: "CSV",
    importId: meta.id,
    card: testCard,
    options,
    storage,
  });
  assert.equal(repeat.analytics.netNetR, bt.analytics.netNetR);
  assert.deepEqual(repeat.sim.trades, bt.sim.trades);

  if (process.env.QUANTSMART_REAL_CSV) {
    const raw = fs.readFileSync(process.env.QUANTSMART_REAL_CSV, "utf8");
    const real = await job({
      kind: "csv_import",
      filename: "BTCUSDT-1m-2025-01.csv",
      symbol: "BTCUSDT",
      text: raw,
      csvOptions: {},
      storage: {},
    });
    assert.equal(real.bars, 44640);
    for (const id of [
      "l1_fixture",
      "l2_fixture",
      "l3_fixture",
      "l4_fixture",
      "l5_fixture",
      "l6_fixture",
    ]) {
      const result = await job({
        kind: "layer_preview",
        importId: real.id,
        timeframe: "M1",
        moduleId: id,
        storage,
      });
      assert.equal(result.source.availableBars, 44640);
      assert.equal(result.source.evaluatedBars, 2000);
      assert.equal(result.series.length, 2000);
      assert.ok(result.series.some(Number.isFinite));
    }
    await job(
      {
        kind: "backtest",
        source: "CSV",
        importId: real.id,
        mode: "m1",
        card: { ...testCard, symbol: "BTCUSDT" },
        options: { symbol: "BTCUSDT", customModules: options.customModules },
        storage,
      },
      /INSUFFICIENT_SPEC/,
    );
    console.log(
      "REAL LAYERS PASS: all L1–L6 on the same 2,000-row tail of 44,640 actual BTCUSDT observations; missing monetary specification refused.",
    );
  }
  if (process.env.QUANTSMART_LOCAL_GOLD_CSV) {
    const meta = await job({
      kind: "csv_import",
      filename: "LOCAL_XAUUSD_H1_RESEARCH.csv",
      symbol: "XAUUSD",
      text: fs.readFileSync(process.env.QUANTSMART_LOCAL_GOLD_CSV, "utf8"),
      csvOptions: {},
      storage: {},
    });
    assert.equal(meta.bars, 5000);
    const result = await job({
      kind: "backtest",
      source: "CSV",
      importId: meta.id,
      card: testCard,
      options,
      storage,
    });
    assert.equal(result.manifest.data_range.bars, 5000);
    assert.ok(result.analytics.n > 0);
    console.log(
      JSON.stringify({
        status: "LOCAL GOLD CHAIN PASS",
        source: "Existing sim_wide research file, broker provenance unverified",
        bars: meta.bars,
        trades: result.analytics.n,
        netR: result.analytics.netNetR,
      }),
    );
  }
  console.log(
    JSON.stringify({
      status: "LAYERS RUNTIME PASS",
      layers: results,
      trades: bt.analytics.n,
      syntheticNetR: bt.analytics.netNetR,
      importExportReopen: true,
      atomicRejectionAndRollback: true,
      sourceMatched: true,
      brokerOrders: false,
    }),
  );
} finally {
  await stop();
  globalThis.fetch = originalFetch;
  delete globalThis.window;
  delete globalThis.localStorage;
  assert.ok(
    path.resolve(workspace).startsWith(path.resolve(tmpdir()) + path.sep),
  );
  fs.rmSync(workspace, { recursive: true, force: true });
}
