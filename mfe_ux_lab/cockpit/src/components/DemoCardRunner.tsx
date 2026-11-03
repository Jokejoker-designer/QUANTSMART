import { useEffect, useState } from "react";
import type { StrategyCardArtifactRecord } from "../lib/artifactRegistry.ts";
import { useTerminalGeneration } from "../lib/mt5Connection.ts";
import { flushWorkspace } from "../lib/workspaceClient.ts";

function explainCardError(reason: string): string {
  if (reason === "DEMO_GUARD_REQUIRES_ATTACKER")
    return "A Guard filters entries from an Attacker. Combine both roles in Beast Lab and check the exported Card.";
  if (reason === "DEMO_EXPLICIT_TRIGGER_REQUIRED")
    return "This Card has no supported entry trigger. Add an explicit trigger in Canvas, then save and check the Card.";
  if (reason === "DEMO_CARD_CHANGED_CHECK_AGAIN")
    return "The saved Card or its inputs changed. Check Card support again.";
  if (reason.startsWith("DEMO_UNSUPPORTED_MODULE:"))
    return "This module is unavailable for Demo: " + reason.split(":")[1].trim() + ". Review it in Canvas before running a separate Demo version.";
  return reason.replace(/_/g, " ");
}
interface RunnerStatus {
  needsReconciliation: boolean;
  state: "STOPPED" | "RUNNING" | "STARTING";
  cardId: string | null;
  cardName: string | null;
  definitionHash: string | null;
  volume: number | null;
  entries: number;
  maxEntries: number;
  lastClosedBar: string | null;
  reason: string | null;
  lastDecision: {
    kind: string;
    reason?: string;
    why?: string[];
    brokerState?: string;
  } | null;
  ownedPosition: {
    ticket: string;
    side: string;
    entry: number;
    volume: number;
  } | null;
}
async function request(path: string, body?: unknown): Promise<RunnerStatus> {
  const response = await fetch("/api/demo-runner/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? undefined
        : { "Content-Type": "application/json", "X-MFE-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Demo runner unavailable");
  return data;
}
export function DemoCardRunner({
  card,
}: {
  card: StrategyCardArtifactRecord | null;
}) {
  const generation = useTerminalGeneration();
  const [status, setStatus] = useState<RunnerStatus | null>(null),
    [volume, setVolume] = useState(""),
    [limit, setLimit] = useState("1"),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [support, setSupport] = useState<{ definitionHash: string; selection: string } | null>(null);
  const guard = card?.role === "GUARD";
  const selection = JSON.stringify([generation, card?.id, card?.modules, card?.symbol, card?.design_tf, card?.execution_tf, card?.role]);
  const checked = support?.selection === selection ? support : null;
  useEffect(() => {
    let active = true,
      pending = false;
    const pull = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = await request("status");
        if (active) setStatus(next);
      } catch {
        if (active) setError("Demo runner service unavailable");
      } finally {
        pending = false;
      }
    };
    void pull();
    const timer = setInterval(pull, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [generation]);
  useEffect(() => {
    setConfirm(false);
    setSupport(null);
    setError("");
    window.dispatchEvent(new CustomEvent("mfe-card-demo-support-clear"));
  }, [selection]);
  async function checkSupport() {
    setBusy(true);
    setError("");
    setSupport(null);
    try {
      await flushWorkspace();
      const response = await fetch("/api/demo-runner/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MFE-Request": "1" },
        body: JSON.stringify({ cardId: card?.id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Card support check failed");
      if (!result.ok || result.cardId !== card?.id || typeof result.definitionHash !== "string")
        throw Error("Card support response could not be verified");
      setSupport({ definitionHash: result.definitionHash, selection });
      window.dispatchEvent(new CustomEvent("mfe-card-demo-support", { detail: {
        cardId: card?.id, ok: true, reason: "Saved definition and closed candles verified",
      } }));
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Card check failed";
      setError(reason);
      window.dispatchEvent(new CustomEvent("mfe-card-demo-support", { detail: {
        cardId: card?.id, ok: false, reason: explainCardError(reason),
      } }));
    } finally {
      setBusy(false);
    }
  }
  async function act(kind: "start" | "stop" | "reconcile") {
    if (kind === "start" && (!checked || guard || !confirm)) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "start") await flushWorkspace();
      setStatus(
        await request(
          kind,
          kind === "start"
            ? {
                cardId: card?.id,
                volume: Number(volume),
                maxEntries: Number(limit),
                confirmDemo: confirm,
                definitionHash: checked?.definitionHash,
              }
            : kind === "reconcile"
              ? { confirmReconciled: true }
              : {},
        ),
      );
      window.dispatchEvent(new Event("mfe-demo-execution-changed"));
    } catch (e) {
      if (kind === "start") { setSupport(null); setConfirm(false); }
      setError(e instanceof Error ? e.message : "Demo runner failed");
    } finally {
      setBusy(false);
    }
  }
  const running = status?.state === "RUNNING";
  return (
    <section
      aria-label="Strategy Card Demo runner"
      className="demo-card-runner"
    >
      <h4>{guard ? "Guard Card" : "Run this Card on Demo"}</h4>
      <p className="strategy-help">{card?.name || "Select a saved Strategy Card above."}</p>
      {guard ? (
        <p className="strategy-notice">
          {explainCardError("DEMO_GUARD_REQUIRES_ATTACKER")}{" "}
          <a href="#beast-lab">Open Beast Lab</a>
        </p>
      ) : (
        <p className="strategy-help">
          Evaluates the saved Card's supported trigger, filters and exit rules on newly closed design candles.
          L6 zones remain chart references.
        </p>
      )}
      {error && (
        <p role="alert" className="strategy-error">
          {explainCardError(error)}
        </p>
      )}
      {!running && !guard && (
        <button
          type="button"
          className="strategy-secondary"
          disabled={!card || busy}
          onClick={() => void checkSupport()}
        >
          Check Card support
        </button>
      )}
      {checked && (
        <p role="status" className="strategy-help">
          Support check passed for this saved definition.
        </p>
      )}
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{status?.state || "Loading"}</dd>
        </div>
        {status?.cardName && (
          <div>
            <dt>Running definition</dt>
            <dd>
              {status.cardName} · {status.definitionHash?.slice(0, 12)}
            </dd>
          </div>
        )}
        <div>
          <dt>Entries</dt>
          <dd>
            {status?.entries || 0} / {status?.maxEntries || 0}
          </dd>
        </div>
        {status?.lastClosedBar && (
          <div>
            <dt>Last closed candle</dt>
            <dd>{status.lastClosedBar}</dd>
          </div>
        )}
      </dl>
      {status?.lastDecision && (
        <p role="status">
          {status.lastDecision.kind} ·{" "}
          {status.lastDecision.reason ||
            status.lastDecision.why?.join(" · ") ||
            status.lastDecision.brokerState}
        </p>
      )}
      {status?.needsReconciliation && (
        <div role="alert">
          <p>
            Check the original Demo account in MT5, including pending orders and
            history. The previous request has an unresolved result.
          </p>
          <button
            type="button"
            className="strategy-secondary"
            disabled={busy || running}
            onClick={() => void act("reconcile")}
          >
            I checked MT5; reconcile the stopped runner
          </button>
        </div>
      )}
      {status?.reason && (
        <p className="strategy-help">{status.reason.replace(/_/g, " ")}</p>
      )}
      {running ? (
        <>
          <button
            className="strategy-primary danger"
            disabled={busy}
            onClick={() => void act("stop")}
          >
            Stop Card runner
          </button>
          <p className="strategy-help">
            Stop prevents further automated requests. Existing broker positions
            stay open with their current SL/TP; manage them in Manual Demo or
            MT5.
          </p>
        </>
      ) : !guard && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("start");
          }}
        >
          <label className="strategy-field">
            Fixed volume, lots
            <input
              aria-label="Card Demo volume in lots"
              required
              type="number"
              min="0.01"
              step="0.01"
              max="10"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
            />
          </label>
          <label className="strategy-field">
            Maximum new entries
            <input
              aria-label="Card Demo maximum entries"
              required
              type="number"
              min="1"
              max="100"
              step="1"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
          <label className="strategy-help">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            I authorize automatic entries and exits on my connected Demo account
            for this Card and volume.
          </label>
          <button
            className="strategy-primary"
            disabled={
              !card ||
              !checked ||
              !confirm ||
              !volume ||
              busy ||
              status?.needsReconciliation
            }
            type="submit"
          >
            Start Card on Demo
          </button>
        </form>
      )}
      <p className="strategy-help">
        Starts flat and waits for the next candle. No historical catch-up
        trades, real-account execution or automatic restart. Unsupported Card
        behavior is reported before starting.
      </p>
    </section>
  );
}
