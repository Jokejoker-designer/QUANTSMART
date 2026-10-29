import { useEffect, useState } from "react";
import { terminalRequest, useTerminalGeneration, MT5_OPEN_DIALOG_EVENT } from "../lib/mt5Connection.ts";

interface Status { available: boolean; reason?: string; account_kind: string; account_id?: string; server?: string }
interface Position { ticket: string; symbol: string; side: string; volume: number; profit: number }
interface Preview { ok: true; preview_id: string; kind: "OPEN" | "CLOSE"; symbol: string; side: "BUY" | "SELL"; volume: number; price: number; sl: number; tp: number; account_id: string; server: string; deviation: number; ticket?: string }
interface Receipt { ok: boolean; state: "sending" | "filled" | "partial" | "accepted" | "rejected" | "unknown"; reason?: string; retcode?: number; deal?: string; order?: string; volume?: number; price?: number }
type TicketState = { kind: "editing" } | { kind: "review"; preview: Preview } | { kind: "sending"; id: string } | { kind: "result"; receipt: Receipt; id: string };
const PENDING_KEY = "mfe_demo_pending_request";
function pendingRequest(value?: string | null) { try { if (value === null) sessionStorage.removeItem(PENDING_KEY); else if (value !== undefined) sessionStorage.setItem(PENDING_KEY, value); return sessionStorage.getItem(PENDING_KEY); } catch { return null; } }
const messages: Record<string, string> = {
  MANUAL_DEMO_DISABLED: "Manual Demo execution is disabled. Set MFE_ENABLE_MANUAL_DEMO=true in the local .env and restart to opt in.",
  CONNECT_MT5_FIRST: "Connect MT5 to use a Demo ticket.", DEMO_ACCOUNT_REQUIRED: "This ticket requires a Demo account. Real accounts are blocked.",
  MT5_ALGO_TRADING_DISABLED: "Algo Trading is disabled in MT5. Enable it in the terminal if you want to send Demo orders.",
  MT5_PYTHON_TRADING_DISABLED: "MT5 blocks trading through its external Python API. Review that setting in the terminal.",
  BROKER_DEMO_TRADING_DISABLED: "This Demo account does not currently permit trading.", INVALID_LOT_SIZE: "Enter a volume within the broker's lot range and step.",
  INVALID_STOP_LOSS: "Stop loss is on the wrong side of price or too close for this broker.", INVALID_TAKE_PROFIT: "Take profit is on the wrong side of price or too close for this broker.",
  QUOTE_STALE: "The quote is stale. Wait for a fresh tick and review again.", PRICE_CHANGED_REVIEW_AGAIN: "Price moved beyond the reviewed tolerance. Review a fresh quote.",
  PREVIEW_EXPIRED: "The review expired after 30 seconds. Review a fresh quote.", ACCOUNT_CHANGED_REVIEW_AGAIN: "The account changed. Review the ticket again.",
  DEMO_ACCOUNT_CHANGED: "The account changed. No request was sent.", POSITION_CHANGED_REVIEW_AGAIN: "This position changed. Refresh it and review again.",
  POSITION_NOT_FOUND: "The position no longer exists. Refresh positions.", BROKER_RESULT_UNKNOWN_CHECK_MT5: "The broker result is unknown. Check MT5 before creating another request.",
};
const explain = (reason?: string) => messages[reason || ""] || reason?.replace(/_/g, " ") || "The local terminal is unavailable.";
const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });

export function DemoTradeTicket({ symbol }: { symbol: string }) {
  const generation = useTerminalGeneration();
  const [status, setStatus] = useState<Status | null>(null), [positions, setPositions] = useState<Position[]>([]);
  const [positionsReady, setPositionsReady] = useState(false);
  const [state, setState] = useState<TicketState>({ kind: "editing" });
  const [side, setSide] = useState<"BUY" | "SELL">("BUY"), [volume, setVolume] = useState("");
  const [sl, setSl] = useState(""), [tp, setTp] = useState(""), [deviation, setDeviation] = useState("20");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [spec, setSpec] = useState<{ volume_min?: number; volume_step?: number; volume_max?: number } | null>(null);
  async function refresh() {
    const [next, rows] = await Promise.all([terminalRequest<Status>("/demo/status"), terminalRequest<{ ok: boolean; positions: Position[] }>("/demo/positions")]);
    setStatus(next); setPositionsReady(rows.ok); setPositions(rows.ok ? rows.positions : []);
  }
  useEffect(() => {
    let active = true; const controller = new AbortController();
    const pull = async () => { if (document.hidden) return; try { const [next, rows] = await Promise.all([terminalRequest<Status>("/demo/status", undefined, controller.signal), terminalRequest<{ ok: boolean; positions: Position[] }>("/demo/positions", undefined, controller.signal)]); if (active) { setStatus(next); setPositionsReady(rows.ok); setPositions(rows.ok ? rows.positions : []); } } catch { if (active && !controller.signal.aborted) setStatus(null); } };
    void pull(); const timer = setInterval(pull, 5000); document.addEventListener("visibilitychange", pull);
    terminalRequest<typeof spec>(`/symbol_spec?symbol=${encodeURIComponent(symbol)}`, undefined, controller.signal).then(value => { if (active) setSpec(value); }).catch(() => {});
    setState({ kind: "editing" }); setError("");
    const pending = pendingRequest();
    if (pending) terminalRequest<Receipt>(`/demo/receipt?request_id=${encodeURIComponent(pending)}`, undefined, controller.signal).then(receipt => { if (active) setState({ kind: "result", receipt, id: pending }); }).catch(() => {});
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", pull); };
  }, [symbol, generation]);
  async function preview(ticket?: string) {
    if (busy) return; setBusy(true); setError("");
    try {
      const next = await terminalRequest<Preview | { ok: false; reason: string }>("/demo/preview", ticket ? { kind: "CLOSE", ticket: Number(ticket), deviation: Number(deviation) } : { kind: "OPEN", symbol, side, volume: Number(volume), sl: Number(sl), tp: Number(tp), deviation: Number(deviation) });
      if (!next.ok) { setError(explain(next.reason)); return; } setState({ kind: "review", preview: next });
    } catch (e) { setError(explain(e instanceof Error ? e.message : undefined)); } finally { setBusy(false); }
  }
  async function checkReceipt(id: string) {
    setBusy(true); try { const receipt = await terminalRequest<Receipt>(`/demo/receipt?request_id=${encodeURIComponent(id)}`); setState({ kind: "result", receipt, id }); await refresh(); } catch { setError("Result is unavailable. Check the terminal before trying again."); } finally { setBusy(false); }
  }
  async function confirm(preview: Preview) {
    if (busy) return; setBusy(true); setError(""); pendingRequest(preview.preview_id); setState({ kind: "sending", id: preview.preview_id });
    try { const receipt = await terminalRequest<Receipt>("/demo/submit", { preview_id: preview.preview_id, confirm_demo: true }); setState({ kind: "result", receipt, id: preview.preview_id }); await refresh(); }
    catch { setState({ kind: "result", id: preview.preview_id, receipt: { ok: false, state: "unknown", reason: "BROKER_RESULT_UNKNOWN_CHECK_MT5" } }); }
    finally { setBusy(false); }
  }
  const canUse = !!status?.available;
  return <div className="demo-ticket">
    <div className="strategy-context"><strong>Manual MT5 Demo</strong><span>{status?.account_id ? `${status.server} · #${status.account_id}` : "Terminal not connected"}</span></div>
    <p className="strategy-help">Orders go to the connected Demo account after review. Strategy tests never send orders.</p>
    {!canUse && <div className="strategy-notice" role="status">{explain(status?.reason)}{!status?.account_id && <button type="button" className="strategy-link" onClick={() => window.dispatchEvent(new CustomEvent(MT5_OPEN_DIALOG_EVENT))}>Connect MT5</button>}</div>}
    {error && <p className="strategy-error" role="alert">{error}</p>}
    {state.kind === "editing" && <form onSubmit={e => { e.preventDefault(); void preview(); }}>
      <fieldset className="strategy-side"><legend>Direction</legend>{(["BUY", "SELL"] as const).map(value => <label key={value} className={side === value ? value.toLowerCase() : ""}><input type="radio" name="demo-side" value={value} checked={side === value} onChange={() => setSide(value)} />{value}</label>)}</fieldset>
      <label className="strategy-field">Volume (lots)<input aria-label="Demo volume in lots" type="number" required min={spec?.volume_min || .01} max={spec?.volume_max} step={spec?.volume_step || .01} value={volume} onChange={e => setVolume(e.target.value)} placeholder={spec?.volume_min ? `Minimum ${spec.volume_min}` : "Enter lots"} /></label>
      <details className="strategy-advanced"><summary>Stops and price tolerance</summary><div className="strategy-field-row"><label className="strategy-field">Stop loss price<input type="number" min="0" step="any" value={sl} onChange={e => setSl(e.target.value)} placeholder="Optional" /></label><label className="strategy-field">Take profit price<input type="number" min="0" step="any" value={tp} onChange={e => setTp(e.target.value)} placeholder="Optional" /></label></div><label className="strategy-field">Review price drift (points)<input type="number" min="0" max="10000" step="1" value={deviation} onChange={e => setDeviation(e.target.value)} /></label></details>
      <button className="strategy-primary" disabled={!canUse || busy || !volume} type="submit">{busy ? "Checking with broker…" : `Review Demo ${side}`}</button>
    </form>}
    {state.kind === "review" && <section className="demo-review" aria-label="Review Demo order"><h4>{state.preview.kind === "CLOSE" ? `Close position #${state.preview.ticket}` : `Review ${state.preview.side}`}</h4><dl><div><dt>Instrument</dt><dd>{state.preview.symbol}</dd></div><div><dt>Volume</dt><dd>{state.preview.volume} lots</dd></div><div><dt>Quoted price</dt><dd>{amount(state.preview.price)}</dd></div><div><dt>Stop / target</dt><dd>{state.preview.sl || "—"} / {state.preview.tp || "—"}</dd></div></dl><p className="strategy-help">Demo account #{state.preview.account_id}. Review expires in 30 seconds. Broker execution can differ from this quote.</p><div className="strategy-actions"><button className={`strategy-primary ${state.preview.kind === "CLOSE" || state.preview.side === "SELL" ? "danger" : ""}`} disabled={busy || !canUse} onClick={() => void confirm(state.preview)}>{state.preview.kind === "CLOSE" ? "Confirm Demo close" : `Confirm Demo ${state.preview.side}`}</button><button className="strategy-secondary" disabled={busy} onClick={() => setState({ kind: "editing" })}>Back</button></div></section>}
    {state.kind === "sending" && <p role="status">Waiting for the broker response. This request will not be sent twice.</p>}
    {state.kind === "result" && <section className="demo-result" role="status"><strong>{state.receipt.state === "filled" ? "Broker confirmed fill" : state.receipt.state === "partial" ? "Partially filled" : state.receipt.state === "accepted" ? "Accepted · awaiting broker fill" : state.receipt.state === "sending" ? "Broker request pending" : state.receipt.state === "rejected" ? "Request rejected" : "Result unknown"}</strong><p>{state.receipt.reason ? explain(state.receipt.reason) : `Volume ${state.receipt.volume ?? "—"} · price ${state.receipt.price ?? "—"} · order #${state.receipt.order || "—"}`}</p><div className="strategy-actions"><button className="strategy-secondary" disabled={busy} onClick={() => void checkReceipt(state.id)}>Check broker result</button><button className="strategy-secondary" disabled={busy || state.receipt.state === "sending"} onClick={() => { pendingRequest(null); setState({ kind: "editing" }); }}>{state.receipt.state === "unknown" ? "Back after checking MT5" : "New ticket"}</button></div></section>}
    <div className="demo-positions"><div className="strategy-section-heading"><h4>Demo positions</h4><button className="strategy-link" disabled={busy} onClick={() => void refresh().catch(() => setError("Positions could not be refreshed."))}>Refresh</button></div>{positions.length ? positions.map(position => <div className="demo-position" key={position.ticket}><div><strong>{position.symbol} · {position.side}</strong><small>#{position.ticket} · {position.volume} lots · P/L {position.profit.toFixed(2)}</small></div><button className="strategy-secondary" disabled={!canUse || busy || state.kind === "sending"} onClick={() => void preview(position.ticket)}>Review close</button></div>) : <p className="strategy-help">{status?.account_kind === "DEMO" ? positionsReady ? "No open Demo positions." : "Positions are unavailable. Refresh to check the terminal." : "Connect a Demo account to see positions."}</p>}</div>
  </div>;
}
