import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDemoRunner } from "../mfe_ux_lab/cockpit/tools/demoRunner.mjs";
import http from "node:http";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qs-demo-runner-"));
let clock = Date.parse("2026-11-02T01:00:01Z"),
  closed = "2026-11-02T00:00:00Z",
  position = null,
  unknown = false,
  evaluations = 0,
  sends = 0;
const card = {
  id: "test",
  name: "Frozen Card",
  symbol: "XAUUSD",
  design_tf: "H1",
  execution_tf: "H1",
  modules: ["trend_pullback"],
};
const bridge = async (route, body) => {
  if (route.startsWith("/demo/auto/market"))
    return {
      ok: true,
      bars: [{ t: closed }],
      bid: 100,
      ask: 100.02,
      nowMs: clock,
    };
  if (route === "/demo/auto/start")
    return {
      ok: true,
      session_id: "s".repeat(24),
      accountHash: "a".repeat(64),
    };
  if (route === "/demo/auto/reconcile")
    return { ok: true, accountHash: "a".repeat(64) };
  if (route === "/demo/auto/stop") return { ok: true };
  if (route === "/demo/auto/heartbeat") return { ok: true, position };
  if (route === "/demo/auto/execute") {
    sends++;
    position = {
      ticket: "900",
      side: "BUY",
      entry: 100.02,
      sl: 99,
      tp: 104,
      openedAt: new Date(clock).toISOString(),
    };
    return {
      ok: !unknown,
      state: unknown ? "unknown" : "filled",
      price: 100.02,
    };
  }
  throw Error("Unexpected route " + route);
};
const options = {
  workspaceDirectory: temp,
  readWorkspace: () => ({
    storage: { mfe_strategy_cards: JSON.stringify([card]) },
  }),
  enabled: true,
  bridgeCall: bridge,
  evaluate: async (input) => {
    evaluations++;
    return {
      kind: "OPEN",
      side: "BUY",
      sl: 99,
      tp: 104,
      risk: 1.02,
      why: ["Card trigger"],
      signalTime: new Date(Date.parse(closed) + 3600000).toISOString(),
    };
  },
  now: () => clock,
  pollMs: 600000,
};
let runner = createDemoRunner(options);
try {
  const server = http.createServer((req, res) =>
    runner.middleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    assert.equal((await fetch(url + "/api/demo-runner/status")).status, 200);
    assert.equal(
      (
        await fetch(url + "/api/demo-runner/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/api/demo-runner/status", {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    const check = await fetch(url + "/api/demo-runner/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MFE-Request": "1" },
      body: JSON.stringify({ cardId: "test" }),
    });
    const checked = await check.json();
    assert.equal(checked.ok, true);
    assert.equal(checked.armed, false);
    assert.equal(sends, 0);
    assert.equal(runner.status().state, "STOPPED");
  } finally {
    await new Promise((r) => server.close(r));
  }
  await runner.start({
    cardId: "test",
    volume: 0.01,
    maxEntries: 1,
    confirmDemo: true,
  });
  assert.equal(sends, 0);
  assert.equal(runner.status().state, "RUNNING");
  await runner.tick();
  await runner.tick();
  assert.equal(sends, 0);
  assert.equal(
    evaluations,
    2,
    "Support check and start preflight only; no historical signal execution",
  );
  closed = "2026-11-02T01:00:00Z";
  clock += 3600000;
  await Promise.all([runner.tick(), runner.tick(), runner.tick()]);
  assert.equal(sends, 1);
  assert.equal(runner.status().entries, 1);
  await runner.tick();
  assert.equal(sends, 1, "Closed candle cannot be sent twice");
  await runner.stop("User stopped");
  await runner.tick();
  assert.equal(sends, 1);
  assert.ok(position, "Stop must not silently liquidate a broker position");
  await runner.close();
  runner = createDemoRunner(options);
  assert.equal(
    runner.status().state,
    "STOPPED",
    "A process restart never auto-resumes",
  );
  position = null;
  unknown = true;
  await runner.start({
    cardId: "test",
    volume: 0.01,
    maxEntries: 1,
    confirmDemo: true,
  });
  closed = "2026-11-02T02:00:00Z";
  clock += 3600000;
  await runner.tick();
  assert.equal(runner.status().state, "STOPPED");
  const count = sends;
  await runner.tick();
  assert.equal(sends, count, "Unknown broker results are not resent");
  await runner.close();
  runner = createDemoRunner(options);
  assert.equal(runner.status().needsReconciliation, true);
  await assert.rejects(
    () =>
      runner.start({
        cardId: "test",
        volume: 0.01,
        maxEntries: 1,
        confirmDemo: true,
      }),
    /RECONCILIATION_REQUIRED/,
  );
  await runner.reconcile({ confirmReconciled: true });
  assert.equal(runner.status().needsReconciliation, false);
  const log = fs
    .readFileSync(path.join(temp, "demo-execution.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  const intent = log.findIndex((e) => e.kind === "SEND_INTENT"),
    result = log.findIndex((e) => e.kind === "BROKER_RESULT");
  assert.ok(intent >= 0 && result > intent);
  console.log(
    "DEMO RUNNER PASS: frozen saved Card, no catch-up, closed-bar idempotence, concurrent poll exclusion, durable pre-send journal, user stop, no automatic resume and unknown-result halt.",
  );
} finally {
  await runner.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
