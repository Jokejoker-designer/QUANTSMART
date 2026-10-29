// Read-only terminal connection manager. Account credentials are never persisted.
import { useEffect, useRef, useState } from "react";
import { getActiveSymbol, SYMBOL_CHANGED_EVENT } from "../lib/activeSymbolStore.ts";
import { attachTerminal, detachTerminal, invalidateTerminalData, observeTerminalAccount, terminalRequest, useTerminalGeneration, MT5_OPEN_DIALOG_EVENT, type SymbolResolution, type TerminalAccount, type TerminalSettings } from "../lib/mt5Connection.ts";
import type { Mt5LiveBar } from "../lib/mt5DemoAdapter.ts";
import { Glyph } from "../components/ui/Glyph.tsx";
import "./mt5-connection.css";

const reasonText: Record<string, string> = {
  HISTORICAL_MODE: "Historical mode is active. Restart without --historical to enable the Windows MT5 connector.",
  PYTHON_311_REQUIRED: "Install 64-bit Python 3.11 or newer, then restart with npm run mfe to enable MT5.",
  BRIDGE_SETUP_FAILED: "The optional connector installation failed. Check the launcher output and restart when its dependencies are available. Historical research remains available.",
  NOT_ATTACHED: "Open and sign in to your MT5 desktop terminal, then choose Auto-Attach.",
  NATIVE_MT5_REQUIRES_WINDOWS: "Native MT5 connectivity requires Windows. Historical research and CSV import remain available.",
  MT5_PACKAGE_UNAVAILABLE: "The MT5 Python package is unavailable. Start the workspace with npm run mfe on Windows.",
  LOCAL_BRIDGE_NOT_STARTED: "Start the local connector with npm run mfe. Historical research remains available.",
  LOCAL_BRIDGE_UNAVAILABLE: "The local connector is not responding. Check the terminal running npm run mfe.",
  MT5_INITIALIZE_FAILED: "MT5 could not be attached. Open a signed-in terminal or select its executable in Advanced connection.",
  INVALID_TERMINAL_PATH: "Enter an absolute path to an installed local MT5 terminal executable.",
  SERVER_REQUIRED_FOR_ACCOUNT_SWITCH: "Enter the exact broker server name when selecting a login.",
  LOGIN_REQUIRED_FOR_ACCOUNT_SWITCH: "Enter a login ID to use account credentials, or leave all credential fields blank for Auto-Attach.",
  TERMINAL_DISCONNECTED: "The terminal is attached but its broker connection is unavailable.",
  SYMBOL_NOT_FOUND: "No matching symbol was found. Check the selected asset and the broker's Market Watch.",
};
const explanation = (reason?: string) => reasonText[reason || ""] || reason || "No current terminal connection.";
const amount = (value?: number | null) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

function ConnectionDialog({ account, close }: { account: TerminalAccount | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [advanced, setAdvanced] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [path, setPath] = useState(""), [login, setLogin] = useState(""), [password, setPassword] = useState(""), [server, setServer] = useState("");
  const [resolution, setResolution] = useState<SymbolResolution | null>(null);
  const symbol = getActiveSymbol();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { dialog.current?.close(); previous?.focus(); }; }, []);
  useEffect(() => {
    if (!account?.connected) { setResolution(null); return; }
    const controller = new AbortController();
    terminalRequest<SymbolResolution>(`/symbols?symbol=${encodeURIComponent(symbol)}`, undefined, controller.signal).then(setResolution).catch(() => { if (!controller.signal.aborted) setError("The broker symbol list is unavailable."); });
    return () => controller.abort();
  }, [account?.connected, account?.generation, symbol]);
  const dismiss = () => { setPassword(""); close(); };
  async function connect(settings: TerminalSettings) {
    setBusy(true); setError("");
    try { const result = await attachTerminal(settings); if (!result.connected) setError(explanation(result.reason)); }
    catch (e) { setError(explanation((e as Error).message)); }
    finally { setPassword(""); setBusy(false); }
  }
  async function disconnect() { setBusy(true); setError(""); try { await detachTerminal(); } catch { setError("The local connector could not be detached."); } finally { setBusy(false); } }
  async function chooseSymbol(name: string) {
    setBusy(true); setError(""); invalidateTerminalData();
    try { const next = await terminalRequest<SymbolResolution>("/resolve", { symbol, broker_symbol: name }); setResolution(next); if (!next.ok) setError(explanation(next.reason)); }
    catch { setError("The selected broker symbol could not be activated."); }
    finally { invalidateTerminalData(); setBusy(false); }
  }
  return <dialog ref={dialog} className="mt5-connect-dialog" aria-labelledby="mt5-dialog-title" onCancel={e => { e.preventDefault(); dismiss(); }} onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
    <header><div><h2 id="mt5-dialog-title">Connect MetaTrader 5</h2><p>Local terminal · read-only market data</p></div><button className="mt5-close" aria-label="Close MT5 connection" onClick={dismiss}><Glyph name="x" size={18} /></button></header>
    <div className="mt5-dialog-body">
      <p className="mt5-connect-intro">Open your broker's MT5 terminal and sign in there. Auto-Attach uses the terminal session without asking for your password.</p>
      <button className="mt5-auto-attach" disabled={busy || account?.supported === false} onClick={() => connect({})}><Glyph name="bolt" size={18} />{busy ? "Connecting…" : "Auto-Attach Running MT5"}</button>
      {account?.supported === false && <p className="mt5-connect-note">{explanation(account.reason)}</p>}
      {error && <p className="mt5-connect-error" role="alert">{error}</p>}
      {busy && <p role="status" className="mt5-connect-note">Waiting for the local terminal. No password is being saved.</p>}
      {account?.connected && <section className="mt5-account-info" aria-label="Connected MT5 account"><h3>Connected account <span>{account.account_kind} · Read only</span></h3><dl>
        <div><dt>Broker / server</dt><dd>{account.server || account.broker || "—"}</dd></div><div><dt>Login ID</dt><dd>{account.account_id || "—"}</dd></div><div><dt>Balance</dt><dd>{amount(account.balance)} {account.currency}</dd></div><div><dt>Equity</dt><dd>{amount(account.equity)} {account.currency}</dd></div>
      </dl><label className="mt5-input-label">Broker symbol for {symbol}<select aria-label="Broker symbol mapping" disabled={busy || !resolution?.candidates.length} value={resolution?.broker_symbol || ""} onChange={e => chooseSymbol(e.target.value)}><option value="">{resolution?.reason ? explanation(resolution.reason) : "Resolving broker symbols…"}</option>{resolution?.candidates.map(item => <option key={item.name} value={item.name}>{item.name}{item.quote ? ` · ${item.quote}` : ""}</option>)}</select></label><p className="mt5-connect-note">The resolver activates the selected symbol in Market Watch. A terminal or account change clears the previous mapping.</p><button className="mt5-secondary" disabled={busy} onClick={disconnect}>Detach data connection</button></section>}
      <button className="mt5-advanced-toggle" aria-expanded={advanced} aria-controls="mt5-advanced-form" onClick={() => setAdvanced(!advanced)}><Glyph name="gear" size={15} />Advanced connection</button>
      {advanced && <form id="mt5-advanced-form" onSubmit={e => { e.preventDefault(); void connect({ terminal_path: path.trim(), login: login.trim(), password: password || undefined, server: server.trim() }); }}>
        <p className="mt5-connect-note">Choose a terminal when several are installed. Optional credentials can switch that terminal's active account. Use the terminal and account you intend to inspect.</p>
        <label className="mt5-input-label">MT5 executable path<input disabled={busy} aria-label="MT5 terminal path" autoComplete="off" value={path} onChange={e => setPath(e.target.value)} placeholder="C:\Program Files\Your Broker MT5\terminal64.exe" /></label>
        <div className="mt5-input-pair"><label className="mt5-input-label">Login ID<input disabled={busy} aria-label="MT5 login ID" inputMode="numeric" autoComplete="off" value={login} onChange={e => setLogin(e.target.value)} maxLength={24} /></label><label className="mt5-input-label">Password<input disabled={busy} aria-label="MT5 password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label></div>
        <label className="mt5-input-label">Broker server<input disabled={busy} aria-label="MT5 broker server" autoComplete="off" value={server} onChange={e => setServer(e.target.value)} placeholder="Use the exact server name shown in MT5" /></label>
        <p className="mt5-connect-note">QUANTSMART sends these fields only to its local bridge. MT5 handles broker authentication. QUANTSMART never saves the password to browser storage, .env, workspace files or logs.</p><button className="mt5-secondary" disabled={busy || account?.supported === false} type="submit">Connect selected terminal / account</button>
      </form>}
    </div>
  </dialog>;
}

export function ConnectionStatus({ onSynced }: { onSynced?: (synced: boolean) => void }) {
  const [account, setAccount] = useState<TerminalAccount | null>(null);
  const [state, setState] = useState("checking"), [open, setOpen] = useState(false), [reason, setReason] = useState("");
  const generation = useTerminalGeneration();
  useEffect(() => { const show = () => setOpen(true); window.addEventListener(MT5_OPEN_DIALOG_EVENT, show); return () => window.removeEventListener(MT5_OPEN_DIALOG_EVENT, show); }, []);
  useEffect(() => { onSynced?.(state === "synced"); }, [state, onSynced]);
  useEffect(() => {
    let stopped = false, controller: AbortController | null = null, timer: ReturnType<typeof setTimeout>;
    const pull = async () => {
      clearTimeout(timer); controller?.abort(); if (document.hidden) return;
      controller = new AbortController(); const current = controller;
      try {
        const next = await terminalRequest<TerminalAccount>("/account", undefined, current.signal);
        if (stopped || current.signal.aborted) return;
        observeTerminalAccount(next); setAccount(next); setReason(explanation(next.reason));
        let nextState = next.connected ? "stale" : "offline";
        if (next.connected) {
          const b = await terminalRequest<Partial<Mt5LiveBar>>(`/bar?symbol=${encodeURIComponent(getActiveSymbol())}&tf=M1`, undefined, current.signal);
          const age = Date.now() - Date.parse(b.time || "");
          if (Number.isFinite(age) && age >= -60000 && age < 180000) nextState = "synced";
        }
        if (!stopped && !current.signal.aborted) setState(nextState);
      } catch { if (!stopped && !current.signal.aborted) { setAccount(null); setState("offline"); setReason(explanation("LOCAL_BRIDGE_UNAVAILABLE")); } }
      finally { if (!stopped) timer = setTimeout(pull, 20000); }
    };
    const refresh = () => { if (document.hidden) { clearTimeout(timer); controller?.abort(); } else void pull(); };
    void pull(); document.addEventListener("visibilitychange", refresh); window.addEventListener(SYMBOL_CHANGED_EVENT, refresh);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", refresh); window.removeEventListener(SYMBOL_CHANGED_EVENT, refresh); };
  }, [generation]);
  // Account identifiers and balances belong in the explicit connection dialog.
  const label = account?.connected ? state === "synced" ? "MT5 Sync" : "MT5 Connected" : state === "checking" ? "MT5…" : "MT5 Offline";
  return <div className="connection-wrap"><button className={`connection-status ${state}`} aria-label={`Connection: ${label}`} aria-haspopup="dialog" title={account?.connected ? `${label} · ${state === "synced" ? "current feed" : "no current M1 feed"}` : reason} onClick={() => setOpen(true)}><span className="connection-dot" /><span className="connection-label">{label}</span><span className="connection-chevron">▾</span></button>{open && <ConnectionDialog account={account} close={() => setOpen(false)} />}</div>;
}
