import { Worker } from "node:worker_threads";
import { createHash, randomUUID } from "node:crypto";
import {
  readFileSync,
  mkdirSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const minutes = { M1: 1, M5: 5, M15: 15, H1: 60, H4: 240, D1: 1440 };
export function createDemoRunner({
  workspaceDirectory,
  readWorkspace,
  workerFile,
  bridgePort = Number(process.env.MFE_BRIDGE_PORT || 8791),
  token = process.env.MFE_BRIDGE_TOKEN || "",
  enabled = process.env.MFE_ENABLE_CARD_DEMO === "true",
  bridgeCall,
  evaluate,
  now = Date.now,
  pollMs = 1000,
}) {
  let session = null,
    busy = false,
    closed = false,
    epoch = 0;
  const decisionCode = evaluate ? null : readFileSync(workerFile, "utf8");
  const decisionEngineHash = hash(decisionCode || "INJECTED_TEST_EVALUATOR");
  const journal = join(workspaceDirectory, "demo-execution.jsonl");
  mkdirSync(workspaceDirectory, { recursive: true });
  const pendingActions = new Map();
  let journalError = null;
  if (existsSync(journal)) {
    try {
      if (statSync(journal).size > 50 * 1024 * 1024)
        throw Error("DEMO_JOURNAL_ARCHIVE_REQUIRED");
      for (const line of readFileSync(journal, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.kind === "SEND_INTENT")
          pendingActions.set(event.actionId, event.accountHash);
        if (
          event.kind === "BROKER_RESULT" &&
          ["filled", "rejected"].includes(event.result?.state)
        )
          pendingActions.delete(event.actionId);
        if (event.kind === "USER_RECONCILED") pendingActions.clear();
      }
    } catch {
      journalError = "DEMO_JOURNAL_UNAVAILABLE_OR_CORRUPT";
    }
  }
  function persist(event) {
    const fd = openSync(journal, "a");
    try {
      writeSync(
        fd,
        JSON.stringify({ at: new Date(now()).toISOString(), ...event }) + "\n",
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  const call =
    bridgeCall ||
    (async (path, body) => {
      const response = await fetch(
        `http://127.0.0.1:${bridgePort}/mt5${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "x-mfe-bridge-token": token,
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw Error("DEMO_BRIDGE_" + response.status);
      return response.json();
    });
  const compute =
    evaluate ||
    ((input, storage) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(decisionCode, {
          eval: true,
          workerData: { input, storage },
          resourceLimits: { maxOldGenerationSizeMb: 384 },
        });
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(Error("DEMO_EVALUATION_TIMEOUT"));
        }, 8000);
        worker.once("message", (message) => {
          clearTimeout(timer);
          void worker.terminate();
          message.error
            ? reject(Error(message.error))
            : resolve(message.result);
        });
        worker.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        worker.once("exit", (code) => {
          clearTimeout(timer);
          if (code !== 0) reject(Error("DEMO_EVALUATOR_EXIT"));
        });
      }));
  function view() {
    return {
      scope: "CARD_DEMO_ONLY",
      real_execution_allowed: false,
      autoResume: false,
      needsReconciliation: pendingActions.size > 0,
      state: session?.state || "STOPPED",
      cardId: session?.card.id || null,
      cardName: session?.card.name || null,
      definitionHash: session?.definitionHash || null,
      symbol: session?.card.symbol || null,
      timeframe: session?.card.design_tf || null,
      volume: session?.volume || null,
      entries: session?.entries || 0,
      maxEntries: session?.maxEntries || 0,
      lastClosedBar: session?.lastBar || null,
      lastDecision: session?.lastDecision || null,
      reason: journalError || session?.reason || null,
      ownedPosition: session?.position || null,
    };
  }
  async function halt(reason) {
    epoch++;
    if (session) {
      session.state = "STOPPED";
      session.reason = reason;
      try {
        persist({ kind: "STOPPED", runId: session.id, reason });
      } catch {
        session.reason = "DEMO_JOURNAL_UNAVAILABLE; runner stopped";
      }
    }
    await call("/demo/auto/stop", {}).catch(() => {});
    return view();
  }
  async function prepare(body) {
    const stored = readWorkspace().storage,
      cards = JSON.parse(stored.mfe_strategy_cards || "[]");
    const card = cards.find((c) => c.id === body.cardId);
    if (
      !card ||
      !card.symbol ||
      !minutes[card.design_tf] ||
      (card.execution_tf && card.execution_tf !== card.design_tf)
    )
      throw Error("DEMO_SAVED_DESIGN_CLOSE_CARD_REQUIRED");
    const storage = Object.fromEntries(
      Object.entries(stored).filter(
        ([key]) => key === "mfe_coef_profile" || key.startsWith("mfe_custom_"),
      ),
    );
    const frozen = JSON.parse(JSON.stringify({ card, storage })),
      definitionHash = hash({ frozen, decisionEngineHash });
    const market = await call(
      `/demo/auto/market?symbol=${encodeURIComponent(card.symbol)}&tf=${card.design_tf}`,
    );
    if (!market.ok) throw Error(market.reason);
    const last = market.bars.at(-1);
    if (!last) throw Error("DEMO_CLOSED_BARS_UNAVAILABLE");
    await compute(
      {
        ...market,
        card: frozen.card,
        position: null,
        nowMs: Date.parse(last.t) + minutes[card.design_tf] * 60000,
      },
      frozen.storage,
    );
    return { card, frozen, definitionHash, last };
  }
  async function preflight(body) {
    const prepared = await prepare(body);
    return {
      ok: true,
      armed: false,
      sendsOrders: false,
      cardId: prepared.card.id,
      definitionHash: prepared.definitionHash,
      lastClosedBar: prepared.last.t,
    };
  }
  async function reconcile(body) {
    if (body.confirmReconciled !== true || busy || session?.state === "RUNNING")
      throw Error("DEMO_STOP_AND_CHECK_MT5_FIRST");
    if (journalError) throw Error(journalError);
    const result = await call("/demo/auto/reconcile", {});
    if (!result.ok) throw Error(result.reason);
    if (
      [...pendingActions.values()].some(
        (account) => !account || account !== result.accountHash,
      )
    )
      throw Error("DEMO_RECONCILE_ORIGINAL_ACCOUNT_REQUIRED");
    persist({ kind: "USER_RECONCILED", accountHash: result.accountHash });
    pendingActions.clear();
    return view();
  }
  async function start(body) {
    if (journalError) throw Error(journalError);
    if (pendingActions.size) throw Error("DEMO_RECONCILIATION_REQUIRED");
    if (!enabled || (!token && !bridgeCall)) throw Error("CARD_DEMO_DISABLED");
    if (busy || session?.state === "RUNNING" || session?.state === "STARTING")
      throw Error("DEMO_RUNNER_ALREADY_ACTIVE");
    if (
      body.confirmDemo !== true ||
      typeof body.cardId !== "string" ||
      !Number.isFinite(body.volume) ||
      body.volume <= 0 ||
      !Number.isInteger(body.maxEntries) ||
      body.maxEntries < 1 ||
      body.maxEntries > 100
    )
      throw Error("INVALID_DEMO_START");
    busy = true;
    const startEpoch = ++epoch;
    try {
      const { card, frozen, definitionHash, last } = await prepare(body);
      persist({
        kind: "ARM_REQUEST",
        definitionHash,
        frozenDefinition: frozen,
        cardId: card.id,
        volume: body.volume,
        maxEntries: body.maxEntries,
      });
      const armed = await call("/demo/auto/start", {
        symbol: card.symbol,
        definition_hash: definitionHash,
        volume: body.volume,
        max_entries: body.maxEntries,
        confirm_demo: true,
      });
      if (!armed.ok) throw Error(armed.reason);
      if (!/^[a-f0-9]{64}$/.test(armed.accountHash || ""))
        throw Error("DEMO_ACCOUNT_BINDING_UNAVAILABLE");
      if (startEpoch !== epoch || closed) {
        await call("/demo/auto/stop", {});
        throw Error("DEMO_START_CANCELLED");
      }
      session = {
        id: randomUUID(),
        bridgeId: armed.session_id,
        accountHash: armed.accountHash,
        state: "RUNNING",
        card: frozen.card,
        storage: frozen.storage,
        definitionHash,
        volume: body.volume,
        maxEntries: body.maxEntries,
        entries: 0,
        lastBar: last.t,
        position: null,
        positionRisk: null,
        lastExitMs: -Infinity,
        day: "",
        daily: 0,
        lastDecision: {
          kind: "WAIT",
          reason: "Started; waiting for the next newly closed candle",
        },
      };
      persist({
        kind: "ARMED",
        runId: session.id,
        cardId: card.id,
        definitionHash,
        lastBar: last.t,
      });
      return view();
    } catch (error) {
      if (session?.state === "RUNNING") {
        session.state = "STOPPED";
        session.reason = error.message;
      }
      await call("/demo/auto/stop", {}).catch(() => {});
      throw error;
    } finally {
      busy = false;
    }
  }
  async function tick() {
    if (closed || busy || session?.state !== "RUNNING") return;
    busy = true;
    const current = session;
    try {
      const heart = await call("/demo/auto/heartbeat", {
        session_id: current.bridgeId,
      });
      if (!heart.ok) throw Error(heart.reason);
      const hadPosition = !!current.position || current.positionRisk > 0;
      current.position = heart.position;
      if (current.position && current.positionRisk) {
        const actualRisk = Math.abs(
          current.position.entry - current.position.sl,
        );
        if (!(actualRisk > 0)) throw Error("DEMO_OWNED_RISK_UNAVAILABLE");
        current.positionRisk = actualRisk;
      }
      if (hadPosition && !heart.position) {
        current.lastExitMs = now();
        current.positionRisk = null;
        persist({ kind: "BROKER_POSITION_CLOSED", runId: current.id });
      }
      const market = await call(
        `/demo/auto/market?symbol=${current.card.symbol}&tf=${current.card.design_tf}`,
      );
      if (!market.ok) throw Error(market.reason);
      const last = market.bars.at(-1);
      if (!last) throw Error("DEMO_CLOSED_BARS_UNAVAILABLE");
      if (last.t === current.lastBar) return;
      const previous = Date.parse(current.lastBar),
        latest = Date.parse(last.t),
        step = minutes[current.card.design_tf] * 60000;
      current.lastBar = last.t;
      persist({ kind: "BAR_CLAIMED", runId: current.id, bar: last.t });
      if (latest !== previous + step)
        throw Error("DEMO_MISSED_CANDLE_RESTART_REQUIRED");
      const position = current.position
        ? { ...current.position, risk: current.positionRisk }
        : null;
      if (position && !(position.risk > 0))
        throw Error("DEMO_OWNED_RISK_UNAVAILABLE");
      const decision = await compute(
        { ...market, card: current.card, position },
        current.storage,
      );
      if (current.state !== "RUNNING" || closed) return;
      current.lastDecision = decision;
      persist({
        kind: "CARD_DECISION",
        runId: current.id,
        bar: last.t,
        decision,
      });
      if (decision.kind === "WAIT") return;
      const date = decision.signalTime.slice(0, 10);
      if (date !== current.day) {
        current.day = date;
        current.daily = 0;
      }
      if (decision.kind === "OPEN") {
        const cooldown = { M1: 20, M5: 3, M15: 2, H1: 1, H4: 0, D1: 0 }[
          current.card.design_tf
        ];
        const dayCap = { M1: 8, M5: 8, M15: 6, H1: 5, H4: 3, D1: 1 }[
          current.card.design_tf
        ];
        if (
          current.entries >= current.maxEntries ||
          current.daily >= dayCap ||
          now() - current.lastExitMs <= cooldown * step
        ) {
          current.lastDecision = {
            kind: "WAIT",
            reason: "Runner entry limit, daily cap or post-exit cooldown",
          };
          return;
        }
      }
      const actionId = hash({
        run: current.id,
        bar: last.t,
        kind: decision.kind,
      });
      persist({
        kind: "SEND_INTENT",
        runId: current.id,
        actionId,
        accountHash: current.accountHash,
        definitionHash: current.definitionHash,
        decision,
      });
      pendingActions.set(actionId, current.accountHash);
      if (current.state !== "RUNNING" || closed) return;
      const result = await call("/demo/auto/execute", {
        session_id: current.bridgeId,
        action_id: actionId,
        kind: decision.kind,
        side: decision.side || "BUY",
        sl: decision.sl || 0,
        tp: decision.tp || 0,
      });
      persist({ kind: "BROKER_RESULT", runId: current.id, actionId, result });
      if (["filled", "rejected"].includes(result.state))
        pendingActions.delete(actionId);
      if (result.state !== "filled")
        throw Error(result.reason || "DEMO_RESULT_UNKNOWN_RECONCILE_MT5");
      if (decision.kind === "OPEN") {
        current.entries++;
        current.daily++;
        current.positionRisk = decision.risk;
      } else {
        current.position = null;
        current.positionRisk = null;
        current.lastExitMs = now();
      }
      current.lastDecision = {
        ...decision,
        brokerState: result.state,
        price: result.price,
      };
    } catch (error) {
      await halt(error.message);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => {
    void tick();
  }, pollMs);
  timer.unref();
  const middleware = async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/demo-runner/")) return next();
    const send = (code, data) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(data));
    };
    let hostname;
    try {
      hostname = new URL("http://" + req.headers.host).hostname;
    } catch {
      return send(403, { error: "INVALID_HOST" });
    }
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      ) ||
      (req.headers.origin &&
        req.headers.origin !== "http://" + req.headers.host)
    )
      return send(403, { error: "LOCAL_DEMO_ONLY" });
    if (req.method === "GET" && url.pathname === "/api/demo-runner/status")
      return send(200, view());
    if (
      req.method !== "POST" ||
      req.headers["x-mfe-request"] !== "1" ||
      !String(req.headers["content-type"]).startsWith("application/json")
    )
      return send(403, { error: "SAME_ORIGIN_JSON_REQUIRED" });
    try {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 4096) throw Error("DEMO_INPUT_TOO_LARGE");
      }
      const body = JSON.parse(text || "{}");
      if (url.pathname === "/api/demo-runner/preflight")
        return send(200, await preflight(body));
      if (url.pathname === "/api/demo-runner/reconcile")
        return send(200, await reconcile(body));
      if (url.pathname === "/api/demo-runner/start")
        return send(200, await start(body));
      if (url.pathname === "/api/demo-runner/stop")
        return send(
          200,
          await halt(
            "Stopped by user; broker positions are not automatically liquidated",
          ),
        );
      return send(404, { error: "NOT_FOUND" });
    } catch (error) {
      return send(400, { error: error.message });
    }
  };
  return {
    start,
    preflight,
    reconcile,
    stop: halt,
    tick,
    status: view,
    middleware,
    close: () => {
      closed = true;
      clearInterval(timer);
      return halt("Application stopped; automatic resume is disabled");
    },
  };
}
