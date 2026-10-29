// Mt5ConnectPanel — connect to MT5 (DEMO) and AUTO-FEED the OHLC gap left while the system was offline.
// Connect → shows account status (DEMO/REAL/offline, fail-closed) → detects the gap (last bar in our data
// vs now) → "Backfill" pulls the missing bars from MT5 (real copy_rates_range) and merges them into the
// tape (persisted, so the whole app sees the filled history). READ-ONLY data sync · no order · DEMO-only ·
// real account never sends orders · NO bar is ever fabricated (offline → NO_DATA).
import { useEffect, useState } from "react";
import { MT5_OPEN_DIALOG_EVENT, useTerminalGeneration } from "../lib/mt5Connection.ts";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { TK, InfoTip } from "./ui/Ui.tsx";
import { mt5Account, isOffline, type Mt5DemoAccountInfo } from "../lib/mt5DemoAdapter.ts";
import { loadSimOhlc, clearSimCache } from "../adapters/loadSimOhlc.ts";
import { detectGap, backfillFromMt5, clearLiveExt, autoSyncOnce, type GapInfo, type BackfillResult } from "../lib/marketDataSync.ts";

const TFS = ["M5", "M15", "M30", "H1", "H4", "D1"];   // M1 excluded (a multi-month M1 backfill blows localStorage quota)

export function Mt5ConnectPanel() {
  const terminalGeneration = useTerminalGeneration();
  const [acct, setAcct] = useState<Mt5DemoAccountInfo | null>(null);
  const [conn, setConn] = useState<"idle" | "connecting" | "offline" | "ok">("idle");
  const [gap, setGap] = useState<GapInfo | null>(null);
  const [lastT, setLastT] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BackfillResult[] | null>(null);
  const [auto, setAuto] = useState(false);            // Tier-2 auto-sync (poll) toggle
  const [autoMsg, setAutoMsg] = useState<string | null>(null);

  async function refreshGap() {
    const d = await loadSimOhlc("H1");
    const lt = d?.bars?.length ? d.bars[d.bars.length - 1].t : null;
    setLastT(lt); setGap(detectGap(lt, "H1"));
  }
  useEffect(() => { refreshGap(); }, []);

  async function connect() {
    window.dispatchEvent(new CustomEvent(MT5_OPEN_DIALOG_EVENT));
    setConn("connecting");
    const a = await mt5Account();
    if (isOffline(a)) { setConn("offline"); setAcct(null); return; }
    setAcct(a as Mt5DemoAccountInfo); setConn((a as Mt5DemoAccountInfo).connected ? "ok" : "idle");
  }

  useEffect(() => {
    let active = true;
    void mt5Account().then(account => {
      if (!active) return;
      if (isOffline(account)) { setAcct(null); setConn("offline"); return; }
      setAcct(account); setConn(account.connected ? "ok" : "idle");
    });
    return () => { active = false; };
  }, [terminalGeneration]);

  async function backfill() {
    if (!acct?.connected) return;
    setBusy(true); const out: BackfillResult[] = [];
    try {
      for (const tf of TFS) {
        const d = await loadSimOhlc(tf);
        const lt = d?.bars?.length ? d.bars[d.bars.length - 1].t : null;
        if (!lt) { out.push({ ok: false, tf, added: 0, totalExt: 0, reason: "NO_TAPE" }); continue; }
        out.push(await backfillFromMt5(getActiveSymbol(), tf, lt));
      }
      clearSimCache();            // force re-merge of the new extension on the next load
      setResults(out);
      await refreshGap();
    } finally { setBusy(false); }
  }

  function clearAll() { clearLiveExt(getActiveSymbol()); clearSimCache(); setResults(null); refreshGap(); }

  // Tier-2 AUTO-SYNC: while ON + DEMO connected, poll every 60s. autoSyncOnce has the in-flight lock + throttle +
  // backoff; mergeBars dedups by timestamp → polling/toggling can NEVER duplicate bars. Stops cleanly on toggle/unmount.
  useEffect(() => {
    if (!auto || !acct?.connected) return;
    let live = true;
    const loadLastBar = async (tf: string) => { const d = await loadSimOhlc(tf); return d?.bars?.length ? d.bars[d.bars.length - 1].t : null; };
    const tick = async () => {
      const r = await autoSyncOnce(getActiveSymbol(), TFS, loadLastBar);
      if (!live || !r.ran) return;
      if (r.added > 0) { clearSimCache(); await refreshGap(); try { window.dispatchEvent(new CustomEvent("mfe-ohlc-extended")); } catch { /* noop */ } }
      setAutoMsg(r.status === "OFFLINE" ? `⚠ MT5 offline · ${r.at.slice(11)}` : r.added > 0 ? `✓ +${r.added} bars · ${r.at.slice(11)}` : `· up to date · ${r.at.slice(11)}`);
    };
    tick();                                   // run once immediately on enable
    const id = setInterval(tick, 60000);      // then every 60s (throttle floor is 20s)
    return () => { live = false; clearInterval(id); };
  }, [auto, acct?.connected, acct?.account_kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const isReal = acct?.account_kind === "REAL";
  const totalAdded = results ? results.reduce((s, r) => s + r.added, 0) : 0;
  const offlineRes = results && results.every((r) => !r.ok);

  return (
    <div className="pc" style={{ borderColor: "#1d4c66" }}>
      <div className="pc-h">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
           MT5 — Connection &amp; Gap Backfill
          <InfoTip title="MT5 Data Sync">
            Read-only OHLC backfill (copy_rates_range) from a connected MetaTrader 5 terminal. Auto-sync polls every 60s with timestamp deduplication.
          </InfoTip>
        </span>
        <span className="mut">read-only sync · Demo / Real</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button className="ms-csv" style={{ background: conn === "connecting" ? "#6e40c9" : "#1f6feb" }} disabled={conn === "connecting"} onClick={connect}>
          {conn === "connecting" ? "⏳ Connecting…" : conn === "ok" ? "↻ Recheck" : "🔌 Connect MT5"}
        </button>
        {conn === "offline" && <span className="pflag r" style={{ margin: 0 }}> Local MT5 connector unavailable</span>}
        {acct && (
          <span className="pflag" style={{ margin: 0, background: acct.connected ? "var(--status-safe-bg)" : "rgba(255,138,42,.12)", color: acct.connected ? TK.green : TK.orange, border: "1px solid " + (acct.connected ? TK.green : TK.orange) }}>
            {acct.connected ? `● ${acct.account_kind}${acct.broker ? " · " + acct.broker : ""}` : "○ " + (acct.reason || "BROKER_NOT_CONNECTED")}
          </span>
        )}
      </div>



      {gap && (
        <div style={{ fontSize: 11.5, color: "var(--mfe-text2)", marginBottom: 8 }}>
          Local tape ends <b className="pmono">{gap.lastBarT}</b> · Now <b className="pmono">{gap.nowIso}</b> →{" "}
          {gap.hasGap ? <b style={{ color: TK.orange }}>missing ~{gap.missingDays}d (~{gap.missingBarsApprox.toLocaleString()} H1 bars)</b> : <b style={{ color: TK.green }}>no significant gap</b>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="ms-csv" style={{ background: !acct?.connected || busy ? "#39414f" : "#238636" }} disabled={!acct?.connected || busy} onClick={backfill}>
          {busy ? "⏳ Syncing from MT5…" : "⏬ Backfill Gap (MT5 → Tape)"}
        </button>
        <button className="ms-csv" style={{ background: !acct?.connected ? "#39414f" : auto ? "#1f6feb" : "transparent", border: "1px solid " + (auto ? "#1f6feb" : TK.border), color: auto ? "#fff" : TK.text2 }} disabled={!acct?.connected} onClick={() => { setAuto((a) => !a); if (auto) setAutoMsg(null); }} title="Poll new bars every 60s with timestamp deduplication">
          {auto ? "🔄 Auto-sync: ON" : "⏱ Auto-sync: OFF"}
        </button>
        {auto && autoMsg && <span className="pmut psm" style={{ fontFamily: "var(--mfe-mono)" }}>{autoMsg}</span>}
        {results && <button className="ms-csv" style={{ background: "transparent", border: "1px solid " + TK.border, color: TK.text2 }} onClick={clearAll}> Clear Backfill</button>}
        {!acct?.connected && <span className="pmut psm">Connect MT5 first to backfill.</span>}
      </div>

      {results && (
        offlineRes ? (
          <div className="pflag a" style={{ display: "block", marginTop: 8, padding: "7px 10px" }}> MT5 terminal not connected → <b>0 bars fetched</b> ({results[0]?.reason}). Open MetaTrader 5 on this machine.</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: TK.green, fontWeight: 700, marginBottom: 4 }}>✓ Synced {totalAdded.toLocaleString()} new bars from MT5 into tape.</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {results.map((r) => <span key={r.tf} className="pflag" style={{ margin: 0, background: r.added > 0 ? "rgba(33,208,122,.10)" : "rgba(99,117,138,.10)", color: r.added > 0 ? TK.green : TK.muted, border: "1px solid " + (r.added > 0 ? "#1c5b3c" : TK.border) }}>{r.tf}: +{r.added}{r.added > 0 && r.lastNew ? " → " + r.lastNew.slice(0, 16) : ""}</span>)}
            </div>
          </div>
        )
      )}
    </div>
  );
}
