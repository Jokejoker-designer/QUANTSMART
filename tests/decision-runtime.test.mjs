import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { syntheticBars } from "./module-chain-fixture.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)),
  workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "quantsmart-decision-api-"),
  );
const reservation = net.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = "http://127.0.0.1:" + port;
let child,
  stderr = "";
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
    { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.on("data", (x) => (stderr += x));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(stderr);
    try {
      if ((await fetch(base + "/api/research/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Startup timeout");
}
async function stop() {
  if (child?.exitCode === null) {
    const done = new Promise((r) => child.once("exit", r));
    child.kill();
    await done;
  }
}
async function request(route, body) {
  const response = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
async function job(body, expected) {
  let state = await request("/api/research/jobs", body);
  for (let i = 0; i < 500; i++) {
    if (state.status === "done") {
      assert.ok(!expected);
      return (await request("/api/research/jobs/" + state.id + "/result"))
        .result;
    }
    if (state.status === "failed") {
      if (expected) {
        assert.match(state.error, expected);
        return;
      }
      throw new Error(state.error);
    }
    await new Promise((r) => setTimeout(r, 25));
    state = await request("/api/research/jobs/" + state.id);
  }
  throw new Error("Job timeout");
}
const card = {
  id: "DECISION_API_FIXTURE",
  name: "Synthetic API research fixture",
  symbol: "XAUUSD",
  design_tf: "H1",
  execution_tf: "H1",
  modules: ["trend_pullback", "regime_ctx", "exit_weak"],
};
try {
  await boot();
  const bars = syntheticBars(1500),
    text =
      "time,open,high,low,close\n" +
      bars.map((b) => [b.t, b.o, b.h, b.l, b.c].join(",")).join("\n");
  const meta = await job({
    kind: "csv_import",
    symbol: "XAUUSD",
    filename: "Synthetic decision API fixture.csv",
    text,
    storage: {},
    csvOptions: {},
  });
  const requestBody = {
    kind: "diagnostic",
    analysis: "decision_trace",
    importId: meta.id,
    timeframe: "H1",
    windowTf: "H1",
    card,
    options: { symbol: "XAUUSD" },
    storage: {},
  };
  const ordinary = await job({
    ...requestBody,
    kind: "backtest",
    analysis: undefined,
    source: "CSV",
  });
  const trialsBefore = await request("/api/research/trials");
  const start = performance.now();
  const report = await job(requestBody);
  const elapsed = performance.now() - start;
  const trialsAfter = await request("/api/research/trials");
  assert.equal(
    trialsAfter.simulationCalls - trialsBefore.simulationCalls,
    1,
    "one optional journal request invokes one canonical simulation",
  );
  assert.equal(report.source.hash, meta.normalizedHash);
  assert.equal(report.summary.closed, ordinary.sim.trades.length);
  assert.equal(report.summary.unjoinedTrades, 0);
  assert.equal(report.entryEvaluation.coverage, "CAPTURED_DESIGN_BAR_BRANCHES");
  assert.equal(report.entryEvaluation.summary.recordedBars, bars.length - 40);
  assert.equal(report.entryEvaluation.summary.modeledEntries, ordinary.sim.actual_trades_taken);
  assert.ok(report.entryEvaluation.records.some(row => row.outcome === "ABSTAIN"));
  assert.equal(
    report.records
      .filter((r) => r.outcome)
      .reduce((n, r) => n + r.outcome.netR, 0),
    ordinary.sim.trades.reduce((n, t) => n + t.netR, 0),
  );
  assert.ok(report.evidenceRecord.id.startsWith("ev_"));
  assert.equal((await request("/api/research/evidence")).records.length, 1);
  const repeated = await job(requestBody);
  assert.equal(repeated.evidenceRecord.id, report.evidenceRecord.id);
  assert.equal((await request("/api/research/evidence")).records.length, 1);
  const beforeRestart = await request(
    "/api/research/evidence/" + report.evidenceRecord.id,
  );
  await stop();
  await boot();
  const afterRestart = await request(
    "/api/research/evidence/" + report.evidenceRecord.id,
  );
  assert.deepEqual(afterRestart, beforeRestart);
  const reexecuted = await job(requestBody);
  assert.deepEqual(
    reexecuted,
    report,
    "restart and canonical rerun preserve the same immutable evidence artifact",
  );
  const after = await job({
    ...requestBody,
    kind: "backtest",
    analysis: undefined,
    source: "CSV",
  });
  assert.deepEqual(
    after.sim,
    ordinary.sim,
    "creating evidence does not change canonical trades, costs or event state",
  );
  await job(
    { ...requestBody, card: { ...card, execution_tf: "M5" } },
    /EVIDENCE_DESIGN_BAR_MODE_ONLY/,
  );
  await job(
    { ...requestBody, importId: undefined, bars },
    /EVIDENCE_SAVED_CSV_REQUIRED/,
  );
  const malformed = await fetch(base + "/api/research/evidence/..%2Fworkspace");
  assert.notEqual(malformed.status, 200);
  const filename = path.join(
      workspace,
      "decision-evidence",
      report.evidenceRecord.id + ".json",
    ),
    bytes = fs.readFileSync(filename);
  const corrupt = JSON.parse(bytes);
  corrupt.report.summary.closed = 10000;
  fs.writeFileSync(filename, JSON.stringify(corrupt));
  await assert.rejects(
    () => request("/api/research/evidence/" + report.evidenceRecord.id),
    /EVIDENCE_INTEGRITY_FAILED/,
  );
  fs.writeFileSync(filename, bytes);
  if (process.env.QUANTSMART_LOCAL_GOLD_CSV) {
    const realText = fs.readFileSync(
      process.env.QUANTSMART_LOCAL_GOLD_CSV,
      "utf8",
    );
    const actual = await job({
      kind: "csv_import",
      symbol: "XAUUSD",
      filename: "Existing unverified sim_wide research tape.csv",
      text: realText,
      csvOptions: {},
      storage: {},
    });
    const realReport = await job({ ...requestBody, importId: actual.id });
    assert.equal(realReport.source.hash, actual.normalizedHash);
    assert.equal(realReport.summary.unjoinedTrades, 0);
    console.log(
      JSON.stringify({
        status: "EXISTING_CSV_DECISION_JOIN_PASS",
        bars: actual.bars,
        signals: realReport.summary.signals,
        closed: realReport.summary.closed,
        provenance:
          "Existing sim_wide source; broker provenance unverified; no independent edge claim",
      }),
    );
  }
  console.log(
    JSON.stringify({
      status: "DECISION_EVIDENCE_API_PASS",
      signals: report.summary.signals,
      closed: report.summary.closed,
      oneCanonicalCall: true,
      unchangedSimulator: true,
      durableRestart: true,
      idempotentRecord: true,
      integrityChecks: true,
      elapsedMs: Math.round(elapsed),
      reportBytes: Buffer.byteLength(JSON.stringify(report)),
      capturedEntryBranches: report.entryEvaluation.summary.recordedBars,
    }),
  );
} finally {
  await stop();
  fs.rmSync(workspace, { recursive: true, force: true });
}
