import { useEffect, useRef, useState } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import type { StrategyCardArtifactRecord } from "../lib/artifactRegistry.ts";
import { runStrategyTest, watchStrategyCard, type StrategyTestSource } from "../lib/strategyOperations.ts";
import { isTerminalAttached, useTerminalGeneration } from "../lib/mt5Connection.ts";
import { getCardRuntimeConfig } from "../lib/simTimeframe.ts";
import { flushWorkspace } from "../lib/workspaceClient.ts";
import { DemoTradeTicket } from "./DemoTradeTicket.tsx";
import { readCardEvidence } from "./CardEvidencePanel.tsx";
import "./strategy-controls.css";

export function StrategyControls({ card, onAdvanced }: { card: StrategyCardArtifactRecord | null; onAdvanced?: () => void }) {
  useTerminalGeneration();
  const [mode, setMode] = useState<"research" | "demo">("research");
  const [source, setSource] = useState<StrategyTestSource>(() => isTerminalAttached() ? "mt5" : "history");
  const [state, setState] = useState<"idle" | "running" | "saving" | "done" | "error" | "cancelled">("idle"), [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setState("idle"); setMessage(""); return () => { controller.current?.abort(); }; }, [card?.id]);
  const config = card ? getCardRuntimeConfig(card) : null;
  const hasSavedResult = !!readCardEvidence(card);
  const busy = state === "running" || state === "saving";
  async function retrySave() { setState("saving"); setMessage("Saving result…"); try { await flushWorkspace(); setState("done"); setMessage("Workspace saved. Check the current validation evidence below."); } catch(error) { setState("error"); setMessage(error instanceof Error ? error.message : "Workspace could not be saved."); } }
  async function run() {
    if (!card || controller.current) return;
    const request = new AbortController(); controller.current = request; setState("running"); setMessage("Starting backtest…");
    try { const result = await runStrategyTest(card, source, request.signal, text => { setMessage(text); if (text.startsWith("Saving")) setState("saving"); }); setState("done"); setMessage(`Saved · ${result.analytics.n} simulated trades · ${result.analytics.netNetR.toFixed(2)} R net. See validation evidence below.`); }
    catch (error) { if (request.signal.aborted && !(error instanceof Error && error.message === "CANCELLATION_NOT_CONFIRMED")) { setState("cancelled"); setMessage("Run cancelled on the research service."); } else { setState("error"); const reason = error instanceof Error ? error.message : "RUN_FAILED"; setMessage(reason === "DATASET_NOT_FOUND" || reason.includes("ENOENT") ? "Local history is missing. Choose MT5 closed candles, or import your historical dataset." : reason === "INTRABAR_HISTORY_REQUIRED_USE_LOCAL_HISTORY" ? "This Card needs more M1 history for its execution timeframe. Choose Local history." : reason === "CARD_CHANGED_RUN_AGAIN" ? "The Card or its inputs changed. Run again to validate the current version." : reason.replace(/_/g, " ")); } }
    finally { controller.current = null; }
  }
  return <div className="strategy-controls"><div className="strategy-mode" role="group" aria-label="Strategy control mode"><button aria-pressed={mode === "research"} disabled={busy} onClick={() => setMode("research")}>Card backtest</button><button aria-pressed={mode === "demo"} disabled={busy} onClick={() => setMode("demo")}>MT5 Demo</button></div>
    {mode === "demo" ? <DemoTradeTicket symbol={card?.symbol || getActiveSymbol()} /> : <>
      <div className="strategy-context"><strong>{card?.name || "Select a Strategy Card"}</strong><span>{card ? `${card.symbol || getActiveSymbol()} · design ${config?.design_tf} · execution ${config?.allowed_execution_tf}` : "Choose a Card above to run a measured test."}</span></div>
      <label className="strategy-field">Price history<select aria-label="Backtest price history" value={source} disabled={busy} onChange={e => setSource(e.target.value === "mt5" ? "mt5" : "history")}><option value="mt5" disabled={!isTerminalAttached()}>MT5 closed candles</option><option value="history">Local historical dataset</option></select></label>
      <p className="strategy-help">{source === "mt5" ? "Freezes recent closed candles for this test. The sample does not follow incoming ticks." : "Uses the local dataset and chronological walk-forward validation."} Costs use the existing HARD test settings.</p>
      <div className="strategy-actions"><button className="strategy-primary" disabled={!card || busy || source === "mt5" && !isTerminalAttached()} onClick={() => void run()}>{busy ? state === "saving" ? "Saving result…" : "Running backtest…" : state === "done" || hasSavedResult ? "Run again" : "Run backtest"}</button>{busy ? <button className="strategy-secondary" disabled={state === "saving"} onClick={() => { setMessage("Cancelling run…"); controller.current?.abort(); }}>Cancel run</button> : card && <button className="strategy-secondary" onClick={() => watchStrategyCard(card)}>Open chart</button>}</div>
      {message && <p className={state === "error" ? "strategy-error" : "strategy-run-status"} role={state === "error" ? "alert" : "status"}>{message}</p>}
      {state === "error" && /WORKSPACE|SAVE|CONFLICT/i.test(message) && <button className="strategy-secondary" onClick={() => void retrySave()}>Retry save</button>}
      {onAdvanced && <details className="strategy-advanced"><summary>Advanced validation</summary><p className="strategy-help">Use the full Y10 → M6 → M1 workflow for multi-window evidence.</p><button className="strategy-secondary" disabled={!card || busy} onClick={onAdvanced}>Open validation lab</button></details>}
    </>}
  </div>;
}
