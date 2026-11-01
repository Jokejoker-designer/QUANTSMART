import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import net from "node:net";
const root = fileURLToPath(new URL("..", import.meta.url)),
  workspace = fs.mkdtempSync(path.join(tmpdir(), "quantsmart-csv-"));
const reservation = net.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = "http://127.0.0.1:" + port;
let child,
  error = "";
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
  child.stderr.on("data", (b) => (error += b));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(error);
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
async function api(url, body) {
  const r = await fetch(base + url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function job(request, expectedError) {
  const response = await api("/api/research/jobs", request);
  assert.ok([200, 202].includes(response.status), JSON.stringify(response));
  for (let i = 0; i < 300; i++) {
    const s = (await api("/api/research/jobs/" + response.data.id)).data;
    if (s.status === "failed") {
      if (expectedError) {
        assert.match(s.error, expectedError);
        return;
      }
      throw new Error(s.error);
    }
    if (s.status === "done") {
      assert.ok(!expectedError, "expected job failure");
      return (await api("/api/research/jobs/" + s.id + "/result")).data.result;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Job timeout");
}
try {
  await boot();
  const rows = Array.from(
      { length: 240 },
      (_, i) =>
        `${new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString()},100,102,99,101`,
    ),
    text = "time,open,high,low,close\n" + rows.join("\n");
  const request = {
    kind: "csv_import",
    text,
    symbol: "XAUUSD",
    filename: "Gold dữ liệu.csv",
    csvOptions: {},
    storage: {},
  };
  const meta = await job(request);
  assert.equal(meta.bars, 240);
  assert.equal(meta.tf, "H1");
  assert.equal((await api("/api/research/imports")).data.imports.length, 1);
  const view = await job({
    kind: "csv_view",
    importId: meta.id,
    timeframe: "H1",
  });
  assert.equal(view.bars.length, 240);
  assert.equal(view.bars[0].o, 100);
  const bt = await job({
    kind: "backtest",
    source: "CSV",
    importId: meta.id,
    windowTf: "H1",
    from: view.bars[0].t,
    to: view.bars.at(-1).t,
    card: {
      id: "CSV_FIXTURE_ONLY",
      symbol: "XAUUSD",
      design_tf: "H1",
      modules: ["trend_pullback"],
    },
    options: { symbol: "XAUUSD" },
    storage: {},
  });
  assert.equal(bt.manifest.data_range.bars, 240);
  assert.equal(bt.manifest.truth_contract.pathTruth, "HTF_HEURISTIC");
  await job(
    { ...request, text: text.replace("100,102,99,101", "100,90,99,101") },
    /geometry/,
  );
  assert.equal((await api("/api/research/imports")).data.imports.length, 1);
  await job(
    { kind: "csv_view", importId: meta.id, timeframe: "M1" },
    /TIMEFRAME_MISMATCH/,
  );
  await job(
    {
      kind: "backtest",
      importId: meta.id,
      card: {
        symbol: "XAUUSD",
        design_tf: "H1",
        execution_tf: "M5",
        modules: ["trend_pullback"],
      },
      options: { symbol: "XAUUSD" },
      storage: {},
    },
    /CSV_M1_SOURCE_REQUIRED_FOR_DECLARED_EXECUTION/,
  );
  assert.equal(
    (await api("/api/research/jobs", { kind: "csv_view", importId: "../bad" }))
      .status,
    400,
  );
  const studyRows = Array.from({ length: 1500 }, (_, i) => {
    const o = 100 + Math.sin(i / 12) * 5,
      c = 100 + Math.sin((i + 1) / 12) * 5;
    return `${new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString()},${o},${Math.max(o, c) + 0.3},${Math.min(o, c) - 0.3},${c}`;
  });
  const study = await job({
    ...request,
    filename: "Attribution synthetic fixture.csv",
    text: "time,open,high,low,close\n" + studyRows.join("\n"),
  });
  const beforeTrials = (await api("/api/research/trials")).data;
  const attribution = await job({
    kind: "diagnostic",
    analysis: "attribution",
    importId: study.id,
    card: {
      id: "AT_API",
      symbol: "XAUUSD",
      design_tf: "H1",
      modules: ["trend_pullback", "regime_ctx"],
    },
    options: { symbol: "XAUUSD" },
    parameters: { seeds: 2, maxEvents: 6 },
    storage: {},
  });
  assert.equal(attribution.status, "DESCRIPTIVE_ONLY");
  assert.equal(attribution.evaluatedEvents, 6);
  const afterTrials = (await api("/api/research/trials")).data;
  assert.equal(
    afterTrials.simulationCalls - beforeTrials.simulationCalls,
    attribution.canonicalCallsObserved,
  );
  await stop();
  await boot();
  const reopened = (await api("/api/research/imports")).data.imports;
  assert.equal(reopened[0].normalizedHash, meta.normalizedHash);
  assert.equal((await job(request)).id, meta.id);
  assert.equal((await api("/api/research/imports")).data.imports.length, 2);
  if (process.env.QUANTSMART_REAL_CSV) {
    const actual = await job({
      kind: "csv_import",
      symbol: "BTCUSDT",
      filename: "BTCUSDT-1m-2025-01.csv",
      text: fs.readFileSync(process.env.QUANTSMART_REAL_CSV, "utf8"),
      csvOptions: {},
      storage: {},
    });
    assert.equal(actual.bars, 44640);
    const h1 = await job({
      kind: "csv_view",
      importId: actual.id,
      timeframe: "H1",
    });
    assert.equal(h1.bars.length, 744);
    assert.equal(h1.bars[0].t, "2025-01-01T00:00:00");
    await job(
      {
        kind: "backtest",
        importId: actual.id,
        mode: "m1",
        card: {
          symbol: "BTCUSDT",
          design_tf: "H1",
          modules: ["trend_pullback"],
        },
        options: { symbol: "BTCUSDT" },
        storage: {},
      },
      /INSUFFICIENT_SPEC/,
    );
    console.log(
      "REAL CSV API PASS: 44,640 actual exchange rows, 744 H1 bars; unknown broker money spec is refused.",
    );
  }
  const damaged = path.join(workspace, "imports", meta.id + ".json");
  const snapshot = JSON.parse(fs.readFileSync(damaged, "utf8"));
  snapshot.bars[0].c = 100;
  fs.writeFileSync(damaged, JSON.stringify(snapshot));
  await job(
    { kind: "csv_view", importId: meta.id, timeframe: "H1" },
    /CSV_STORED_HASH_MISMATCH/,
  );
  console.log(
    "CSV RUNTIME PASS: worker parse, save, chart view, Card backtest, invalid rejection, idempotence, restart and hash readback.",
  );
} finally {
  await stop();
  assert.ok(
    path.resolve(workspace).startsWith(path.resolve(tmpdir()) + path.sep),
  );
  fs.rmSync(workspace, { recursive: true, force: true });
}
