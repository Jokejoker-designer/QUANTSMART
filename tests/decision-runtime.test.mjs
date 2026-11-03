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
  const attacker = { ...card, artifact: { artifact_id: card.id, content_hash: "attacker-v1" },
    modules: ["trend_pullback"] };
  const guard = { ...card, id: "FORTRESS", name: "Fortress", role: "GUARD",
    artifact: { artifact_id: "FORTRESS", content_hash: "guard-v1" },
    modules: ["sr_zone_context", "level_memory", "regime_ctx"] };
  const beast = {
    id: "BEAST_FIXTURE", name: "Paired Fortress", context: { symbol: "XAUUSD", design_tf: "H1", execution_tf: "H1" },
    modules: [...attacker.modules, ...guard.modules],
    members: [[attacker, "ATTACKER"], [guard, "GUARD"]].map(([source, role]) => ({
      card_id: source.id, role, modules: source.modules, source_kind: "STRATEGY_CARD",
      source_artifact_id: source.artifact.artifact_id, source_content_hash: source.artifact.content_hash,
    })),
  };
  beast.members.push({ card_id: "l0", role: "SAFETY", modules: [], source_kind: "SAFETY" });
  const seed = await request("/api/research/workspace");
  const save = async cards => {
    const current = await request("/api/research/workspace");
    const response = await fetch(base + "/api/research/workspace", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: current.revision, storage: {
        mfe_strategy_cards: JSON.stringify(cards), mfe_beasts: JSON.stringify([beast]),
      } }),
    });
    assert.equal(response.status, 200);
  };
  assert.ok(seed.storage);
  await save([attacker, guard]);
  const sample = bars.slice(0, 300);
  const activity = (artifactKind, artifactId) => ({
    kind: "diagnostic", analysis: "cockpit_activity", timeframe: "H1", bars: sample,
    options: { symbol: "XAUUSD" }, parameters: { artifactKind, artifactId },
  });
  const { createRequire } = await import("node:module");
  const require = createRequire(path.join(root, "mfe_ux_lab/cockpit/package.json"));
  const { build } = require("esbuild");
  const compiled = await build({stdin:{contents:"export {cardChartAnnotations,demoDecisionAnnotation} from './src/lib/cardChartAnnotations.ts';",
    resolveDir:path.join(root,"mfe_ux_lab/cockpit")},bundle:true,platform:"node",format:"esm",write:false,logLevel:"silent"});
  const {cardChartAnnotations,demoDecisionAnnotation} = await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
  const cardActivity = await job(activity("CARD", attacker.id));
  assert.equal(cardActivity.lastBar, sample.at(-1).t);
  assert.ok(cardActivity.counts.withVotes > 0);
  assert.ok(cardActivity.recentActions.some(row => row.votes?.length));
  const marks = cardChartAnnotations(sample, cardActivity, "XAUUSD", "H1");
  assert.ok(marks.length > 0);
  assert.ok(marks.some(mark => mark.votes.length > 0));
  assert.ok(marks.every(mark => sample[mark.i].t === mark.time && mark.price === sample[mark.i].c));
  assert.deepEqual(cardChartAnnotations(sample, cardActivity, "EURUSD", "H1"), []);
  assert.deepEqual(cardChartAnnotations(sample, cardActivity, "XAUUSD", "M15"), []);
  assert.deepEqual(cardChartAnnotations([...sample,sample.at(-1)],cardActivity,"XAUUSD","H1"),[]);
  const shortened = sample.slice(100);
  const shifted = cardChartAnnotations(shortened, cardActivity, "XAUUSD", "H1");
  assert.ok(shifted.every(mark => shortened[mark.i].t === mark.time));
  const changed = sample.map(bar => ({...bar,c:bar.c+0.01}));
  assert.deepEqual(cardChartAnnotations(changed,cardActivity,"XAUUSD","H1"),[]);
  const demoStatus = {
    state:"RUNNING",cardId:attacker.id,cardName:attacker.name,symbol:"XAUUSD",timeframe:"H1",
    lastClosedBar:sample.at(-1).t,reason:null,
    decision:{kind:"WAIT",reason:"Guard veto",time:new Date(Date.parse(sample.at(-1).t.replace(/Z?$/, "Z"))+3600000).toISOString()},
  };
  const demoMark = demoDecisionAnnotation(sample,demoStatus,attacker.id,"XAUUSD","H1");
  assert.equal(demoMark.label,"DEMO CARD WAIT");
  assert.equal(demoMark.i,sample.length-1);
  assert.equal(demoDecisionAnnotation(sample,demoStatus,"other-card","XAUUSD","H1"),null);
  assert.equal(demoDecisionAnnotation(sample,demoStatus,attacker.id,"XAUUSD","M15"),null);
  await job(activity("CARD", guard.id), /ACTIVITY_MEMBER_REQUIRES_BEAST/);
  const beastActivity = await job(activity("BEAST", beast.id));
  const vetoMarks = cardChartAnnotations(sample,beastActivity,"XAUUSD","H1");
  assert.ok(vetoMarks.some(mark => mark.tone === "veto"));
  assert.ok(vetoMarks.every(mark => ["CARD VOTE","CARD VETO","CARD WAIT","REPLAY ENTRY"].includes(mark.label)));
  const guardActivity = beastActivity.roles.find(row => row.role === "GUARD");
  assert.deepEqual(guardActivity.removed, guard.modules);
  assert.deepEqual(guardActivity.without, cardActivity.counts);
  assert.equal(beastActivity.roles.find(row => row.role === "ATTACKER").without, null);
  assert.notDeepEqual(beastActivity.counts, guardActivity.without);
  await save([attacker, { ...guard, artifact: { ...guard.artifact, content_hash: "guard-v2" } }]);
  await job(activity("BEAST", beast.id), /ACTIVITY_BEAST_LINEAGE/);
  console.log("COCKPIT ACTIVITY PASS: recorded trigger votes, guard role removal, frozen saved definitions and stale lineage refusal.");
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
