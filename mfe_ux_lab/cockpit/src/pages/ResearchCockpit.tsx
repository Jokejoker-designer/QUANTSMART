// Production Quant Cockpit. Source-backed observations; research scenarios never send orders.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { readStrategyCards, subscribeArtifactChanges, upsertStrategyCard } from "../lib/artifactRegistry.ts";
import { flushWorkspace } from "../lib/workspaceClient.ts";
import { runResearchJob } from "../lib/researchJobs.ts";
import { useLiveWorkspaceQuery, freshWorkspaceBars } from "../lib/liveWorkspaceQuery.ts";
import { useLiveTickFeed } from "../lib/liveTickFeed.ts";
import { candlePosition, displayClock } from "../lib/displayClock.ts";
import { liveSymbol } from "../lib/mt5DemoAdapter.ts";
import { isTerminalAttached, MT5_CONNECTED_EVENT } from "../lib/mt5Connection.ts";
import { getCardRuntimeConfig } from "../lib/simTimeframe.ts";
import { computeCardZones } from "../lib/cardZones.ts";
import { cardEvidence } from "../lib/cardEvidence.ts";
import { kidiScan, kidiSummary } from "../lib/kidiEvents.ts";
import { closedFrameCutoff, finite, observedBias, rangePercentile, sessionAt, type MarketSnapshot } from "../lib/cockpitTelemetry.ts";
import { MicroChart } from "../components/MicroChart.tsx";
import { CardEvidencePanel } from "../components/CardEvidencePanel.tsx";
import { StrategyControls } from "../components/StrategyControls.tsx";
import { BiasBar, Gauge, Telemetry, type TelemetryTone as Tone } from "../components/CockpitTelemetry.tsx";
import { InfoTip } from "../components/ui/Ui.tsx";
import type { TradeAdvice } from "../adapters/loadCotrade.ts";
import type { CChartZone } from "../components/CockpitChart.tsx";
import "./product.css";
import "./quant-cockpit.css";

const go = (id: string) => window.dispatchEvent(new CustomEvent("mfe-nav", { detail: id }));
const TFS = ["M15", "H1", "H4", "D1", "W1"];
const number = (v: unknown, digits = 2) => finite(v) === null ? "—" : (v as number).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
function Panel({ title, children, note, className = "" }: { title: string; children: ReactNode; note?: string; className?: string }) {
  return <section className={`quant-panel ${className}`}><h2>{title}{note && <InfoTip title={title} text={note} align="right" />}</h2>{children}</section>;
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="quant-kv"><dt>{label}</dt><dd>{children}</dd></div>;
}
function LiveMarketView({ symbol, tf, fallback }: { symbol: string; tf: string; fallback?: { c: number; h: number; l: number } }) {
  const feed = useLiveTickFeed(symbol, tf, true);
  const bar = feed.frame?.bar || fallback;
  const position = candlePosition(bar);
  return <Telemetry label="Live price" value={bar ? number(bar.c, symbol.endsWith("USD") && !/XAU|BTC/.test(symbol) ? 5 : 2) : "Awaiting tick"} detail={feed.status === "live" ? `${tf} position: 0% low / 100% high` : `${tf} last observation · waiting for tick`} gauge={position} dialDisplay={number(position, 0)} dialUnit="RANGE %" tone="info" gaugeLabel="Price position in forming candle: 0% low, 100% high. Not a probability." />;
}
function SessionTelemetry({ live, asOf }: { live: boolean; asOf?: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (!live) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [live]);
  const clock = displayClock(now);
  const session = sessionAt(live ? clock.iso : asOf);
  return <Telemetry label={live ? "Session · local clock" : "Session · data time"} value={session.label} detail={live ? `Now · ${clock.utcTime} UTC · charts use UTC` : "Historical candle timestamp · UTC"} gauge={live ? clock.localDayElapsed : session.elapsed} dialDisplay={live ? clock.localTime : session.time.split(" ")[0]} dialUnit={live ? clock.zoneLabel : "UTC"} tone="info" gaugeLabel={live ? "Current local time and local day elapsed" : "Historical candle time and UTC day elapsed"} />;
}
function LiveMicrostructure({ symbol, tf, volRank }: { symbol: string; tf: string; volRank: number | null }) {
  const feed = useLiveTickFeed(symbol, tf, true);
  return <dl><Row label="Tick activity">{number(feed.frame?.bar?.tick_volume, 0)}</Row><Row label="Spread (broker points)">{number(feed.frame?.bar?.spread)}</Row><Row label="Volatility range rank">{volRank === null ? "—" : `${volRank}%`}</Row><Row label="Source">{feed.status === "live" ? "MT5 tick stream" : "Waiting for tick"}</Row></dl>;
}

export function ResearchCockpit() {
  const symbol = getActiveSymbol();
  const [cards, setCards] = useState(() => readStrategyCards());
  const [selected, setSelected] = useState(() => localStorage.getItem("mfe_home_card") || "");
  const availableCards = cards.filter((c) => (c.symbol || "XAUUSD") === symbol);
  const card = availableCards.find((c) => c.id === selected) || null;
  const [tf, setTf] = useState("H1");
  const [source, setSource] = useState<"history" | "live">(() => isTerminalAttached() ? "live" : "history");
  const [direction, setDirection] = useState<"" | "BUY" | "SELL">("");
  const [zones, setZones] = useState(true);
  const [snapshot, setSnapshot] = useState<{ key: string; data: MarketSnapshot } | null>(null);
  const [mtf, setMtf] = useState<{ key: string; rows: Record<string, MarketSnapshot>; errors: string[] }>({ key: "", rows: {}, errors: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [subnavSlot, setSubnavSlot] = useState<HTMLElement | null>(null);
  const key = `${source}:${symbol}:${tf}`;
  const market = snapshot?.key === key && source === "history" ? snapshot.data : null;
  const live = useLiveWorkspaceQuery(liveSymbol(symbol), tf, tf, direction, 600, source === "live");
  const liveReady = source === "live" && !!live.data?.account?.connected && Date.now() - live.checkedAt < 30000 && freshWorkspaceBars(live.data?.bars, tf);
  const advice: TradeAdvice | null = liveReady && live.data?.advice?.ok ? live.data.advice.advice as TradeAdvice : null;
  const bars = source === "history" ? market?.bars || [] : liveReady ? live.data?.bars || [] : [];
  const last = bars[bars.length - 1];

  useEffect(() => { setSubnavSlot(document.getElementById("cockpit-controls-slot")); }, []);
  useEffect(() => { const connected = () => setSource("live"); window.addEventListener(MT5_CONNECTED_EVENT, connected); return () => window.removeEventListener(MT5_CONNECTED_EVENT, connected); }, []);
  useEffect(() => subscribeArtifactChanges(() => setCards(readStrategyCards())), []);
  useEffect(() => { localStorage.setItem("mfe_home_card", selected); }, [selected]);
  useEffect(() => { if (card) setTf(getCardRuntimeConfig(card).design_tf); }, [card?.id, card?.design_tf]);
  useEffect(() => {
    setError(null);
    if (source !== "history") return;
    const controller = new AbortController();
    runResearchJob<MarketSnapshot>({ kind: "market", dataset: { symbol, tf }, count: 600, storage: {} }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setSnapshot({ key, data }); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message.includes("ENOENT") ? "No local historical dataset. Import an OHLC CSV in Microscope" : e.message); });
    return () => controller.abort();
  }, [key]);
  // Small server-computed snapshots, loaded sequentially to respect the bounded worker queue.
  // Each higher timeframe is cut off at the chart timestamp. No future tape enters this comparison.
  useEffect(() => {
    if (!market) return;
    const controller = new AbortController(); const rows: Record<string, MarketSnapshot> = { [tf]: market }; const errors: string[] = [];
    setMtf({ key, rows: { ...rows }, errors: [] });
    void (async () => {
      for (const frame of TFS) {
        if (frame === tf || controller.signal.aborted) continue;
        try {
          const cutoff = closedFrameCutoff(market.as_of, tf, frame);
          if (!cutoff) throw new Error("INVALID_FRAME_CUTOFF");
          rows[frame] = await runResearchJob<MarketSnapshot>({ kind: "market", dataset: { symbol, tf: frame, to: cutoff }, count: 600, storage: {} }, controller.signal);
        }
        catch { if (!controller.signal.aborted) errors.push(frame); }
        if (!controller.signal.aborted) setMtf({ key, rows: { ...rows }, errors: [...errors] });
      }
    })();
    return () => controller.abort();
  }, [market]);

  const evidence = useMemo(() => card ? cardEvidence(card.modules) : null, [card]);
  const integrity = useMemo(() => bars.length >= 3 ? kidiSummary(kidiScan(bars)) : null, [bars]);
  const volRank = useMemo(() => rangePercentile(bars), [bars]);
  const observedTape = source === "history" ? market : liveReady ? live.data?.observations || null : null;
  const bias = observedBias(observedTape);
  const liveDanger = finite(advice?.danger_score);
  const danger = liveDanger === null || liveDanger < 0 || liveDanger > 1 ? null : liveDanger * 100;
  const trendTone: Tone = bias?.side === "UP" ? "safe" : bias?.side === "DOWN" ? "danger" : "info";
  const hasDangerSource = source === "live" && danger !== null;
  const volatility = hasDangerSource ? danger : volRank;
  const volTone: Tone = volatility === null ? "info" : volatility >= 75 ? "danger" : volatility >= 50 ? "warn" : "safe";
  const closeLocation = candlePosition(last);
  const liveRows = advice?.tf_breakdown?.main || [];
  const historicalRows = mtf.key === key ? mtf.rows : {};
  const observationRows = source === "history" ? historicalRows : liveReady ? live.data?.observations_by_tf || {} : {};
  const sides = TFS.map((t) => observedBias(observationRows[t] || null)?.side).filter(Boolean);
  const conflict = sides.includes("UP") && sides.includes("DOWN");
  const entry = advice?.entry_assessment;
  const plan = advice?.trade_plan;
  const planDirectionMatches = !direction || plan?.direction === direction || (direction === "BUY" && plan?.direction === "LONG_SCENARIO") || (direction === "SELL" && plan?.direction === "SHORT_SCENARIO");
  const planEntry = planDirectionMatches ? finite(plan?.entry) : null;
  const planStop = planDirectionMatches ? finite(plan?.stop_loss) : null;
  const targets = planDirectionMatches ? (plan?.tps || []).filter((t) => finite(t.price) !== null) : [];
  const showZones = useMemo(() => {
    if (!zones || bars.length < 40) return [];
    const mapped = computeCardZones(bars, card ? card.modules : ["observation_zone", "risk_zone", "invalidation_zone"]).map((z) => ({ ...z, label: z.role === "observation" ? "Observation" : z.role === "risk" ? "Risk" : z.role === "invalidation" ? "Invalidation" : z.label, color: z.role === "observation" ? "#00E5FF" : z.role === "risk" ? "#FF3B5C" : z.role === "invalidation" ? "#B388FF" : "#00E676" }));
    // Targets are only displayed when the backend actually supplies them; no fabricated ATR targets.
    const targetBands: CChartZone[] = planDirectionMatches ? (plan?.tps || []).filter((t) => finite(t.price) !== null).map((t, i) => ({ role: "target", label: t.name || `Target ${i + 1}`, color: "#00E676", lo: t.price, hi: t.price })) : [];
    return [...mapped, ...targetBands];
  }, [bars, card, zones, plan, planDirectionMatches]);
  const rangeBars = bars.slice(-20);
  const rangeHigh = rangeBars.length ? Math.max(...rangeBars.map((b) => b.h)) : null;
  const rangeLow = rangeBars.length ? Math.min(...rangeBars.map((b) => b.l)) : null;
  const above = finite(advice?.classic_family?.liquidity?.nearest_liquidity_above);
  const below = finite(advice?.classic_family?.liquidity?.nearest_liquidity_below);
  const liveBar = liveReady && live.data?.live_bar && "spread" in live.data.live_bar ? live.data.live_bar : null;
  const reasons = entry?.no_trade_codes || advice?.no_trade?.codes || [];
  const sourceLabel = source === "history" ? "Historical OHLC" : liveReady ? "MT5 connected" : "Feed unavailable";

  async function createExample() {
    setBusy(true); setError(null);
    try {
      const id = "sc_" + crypto.randomUUID();
      upsertStrategyCard({ id, name: "Trend Pullback · Research", symbol, design_tf: "H1", execution_tf: "H1", modules: ["data_quality", "kidi_guard", "no_lookahead", "synthetic_vol_guard", "authority_guard", "ema_slope", "ema_trend", "fusion", "session_ctx", "trend_pullback", "auto_rr", "observation_zone", "risk_zone", "invalidation_zone"], status: "DRAFT", bt_window: "NO_DATA" });
      await flushWorkspace(); setSelected(id); setCards(readStrategyCards());
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function inspect() { if (card) localStorage.setItem("mfe_strategylab_preselect", card.id); go("strategy-lab"); }
  const controls = <div className="cockpit-subnav-controls">
    <button className="product-button primary" onClick={() => go("strategy-canvas")}>Build strategy</button>
    <div className="product-segment" role="group" aria-label="Feed source">{(["history", "live"] as const).map((s) => <button key={s} aria-pressed={source === s} className={source === s ? "active" : ""} onClick={() => setSource(s)}>{s === "history" ? "Historical" : "Live feed"}</button>)}</div>
    <label>Timeframe<select aria-label="Chart timeframe" value={tf} onChange={(e) => setTf(e.target.value)}>{["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"].map((t) => <option key={t}>{t}</option>)}</select></label>
    <span className="quant-source-label">{sourceLabel}</span>
  </div>;

  return <div className="product-workspace quant-workspace">
    {subnavSlot ? createPortal(controls, subnavSlot) : <div className="product-toolbar">{controls}</div>}
    {error && <p className="product-message error" role="alert">{error}. <button className="quant-link" onClick={() => go("assets")}>Check data coverage</button></p>}
    <div className="product-kpi-grid" aria-label="Cockpit telemetry">
      <Telemetry label="Market state" value={bias ? `${bias.side} · STRUCTURE` : advice?.market_story?.state || "Not assessed"} detail={bias ? "EMA 10 / 34 · scale 0–2 ATR" : "Source assessment unavailable"} gauge={bias?.gauge ?? null} dialDisplay={number(Math.abs(bias?.gapAtr ?? NaN))} dialUnit="ATR" tone={trendTone} gaugeLabel="EMA gap magnitude, capped at 2 ATR" />
      <Telemetry label={hasDangerSource ? "Danger level" : "Volatility · range rank"} value={volatility === null ? "Not assessed" : hasDangerSource ? "Source score" : "True range"} detail={!hasDangerSource ? `Percentile within ${Math.max(0, bars.length - 1)} observed bars` : "Backend danger score · not an entry probability"} gauge={volatility} dialDisplay={number(volatility, 0)} dialUnit={hasDangerSource ? "SCORE %" : "RANK %"} tone={volTone} gaugeLabel={hasDangerSource ? "Backend danger score" : "True-range percentile"} />
      {source === "live" && liveReady ? <LiveMarketView symbol={symbol} tf={tf} fallback={last} /> : <Telemetry label="Last close" value={last ? number(last.c) : "Awaiting tape"} detail={last ? `${tf} position: 0% low / 100% high` : "No price observation"} gauge={closeLocation} dialDisplay={number(closeLocation, 0)} dialUnit="RANGE %" tone="info" gaugeLabel="Closing price position: 0% low, 100% high. Not a probability." />}
      <Telemetry label="Entry verdict" value={entry?.verdict || "Not assessed"} detail={source === "history" ? "Observation mode · no live entry assessment" : entry?.reason || "Waiting for source assessment"} gauge={null} dialDisplay="—" dialUnit="NO SCORE" tone={advice?.no_trade?.hard_block ? "danger" : "shadow"} gaugeLabel="No numeric entry score supplied" />
      <Telemetry label="Feed health" value={source === "history" ? bars.length ? "Historical tape" : "Loading" : liveReady ? "Connected" : "Unavailable"} detail={market ? `${market.total_bars.toLocaleString()} source bars · 600 requested` : source === "live" ? live.error || "Read-only MT5 feed" : "Reading local dataset"} gauge={bars.length ? Math.min(100, bars.length / 600 * 100) : null} dialDisplay={number(bars.length, 0)} dialUnit="BARS" tone={source === "live" && !liveReady ? "warn" : "info"} gaugeLabel="Loaded bars relative to requested 600" />
      <SessionTelemetry live={source === "live"} asOf={last?.t} />
    </div>

    <div className="quant-cockpit-grid">
      <aside className="quant-diagnostics" aria-label="Market diagnostics">
        <Panel title="MTF bias stack" note="Bars show EMA 10–34 direction and gap in ATR units, capped at 2 ATR on the bar. These are observations, not probabilities or Card votes. Live percentages are supplied by the advisory source.">
          <span className={`mfe-status-pill ${conflict ? "warn" : "info"}`}>{conflict ? "TF CONFLICT" : sides.length === TFS.length ? "TF OBSERVATIONS" : "PARTIAL COVERAGE"}</span>
          {<div className="quant-bias-scale" aria-hidden="true"><span>−2 ATR</span><span>0</span><span>+2 ATR</span></div>}
          <div className="quant-mtf-stack">{TFS.map((frame) => {
            const row = observedBias(observationRows[frame] || null);
            const liveRow = source === "live" ? liveRows.find((r) => r.tf === frame) : null;
            const buyPct = finite(liveRow?.buy_pct), sellPct = finite(liveRow?.sell_pct);
            const side = row?.side || (liveRow ? liveRow.trend : null);
            const tone: Tone = row ? row.side === "UP" ? "safe" : row.side === "DOWN" ? "danger" : "info" : "info";
            const observed = observationRows[frame];
            return <div key={frame} className="quant-mtf-row"><b>{frame}</b><span className={tone}>{side || "—"}</span><strong>{row ? `${row.gapAtr > 0 ? "+" : ""}${number(row.gapAtr)} ATR` : buyPct !== null && sellPct !== null ? `${number(buyPct, 0)}/${number(sellPct, 0)}%` : "No data"}</strong>{row || source === "history" || !liveRow ? <BiasBar gapAtr={row?.gapAtr ?? null} frame={frame} /> : <Gauge value={buyPct !== null && sellPct !== null ? Math.max(buyPct, sellPct) : null} tone={tone} label={`${frame} source directional share`} />}{observed && <small>As of {observed.as_of.replace("T", " ").slice(0, 16)}</small>}</div>;
          })}</div>
          {mtf.key === key && mtf.errors.length > 0 && <p className="quant-note">Unavailable: {mtf.errors.join(", ")}</p>}
        </Panel>
        <Panel title="Evidence independence" note="Card module counts grouped by a documented family heuristic. Family diversity is structural; empirical statistical independence has not been established.">
          <dl><Row label="Evidence modules">{evidence?.rawVotes ?? "—"}</Row><Row label="Distinct families">{evidence?.familyCount ?? "—"}</Row><Row label="Composition class">{evidence?.echoClass.replace(/_/g, " ") || "Select a Card"}</Row></dl>
          {evidence && evidence.rawVotes > 0 && <div className="quant-evidence-mix" aria-label="Evidence module distribution">
            <h3>Evidence mix <span>module count</span></h3>
            {evidence.families.map((family) => <div key={family} className="quant-evidence-row"><span>{family}</span><b>{evidence.byFamily[family].length} / {evidence.rawVotes}</b><Gauge value={evidence.byFamily[family].length / evidence.rawVotes * 100} label={`${family}: ${evidence.byFamily[family].length} of ${evidence.rawVotes} evidence modules`} /></div>)}
          </div>}
          <p className="quant-note">Composition-derived · not live votes</p>
        </Panel>
        <Panel title="Live microstructure">
          {source === "live" && liveReady ? <LiveMicrostructure symbol={symbol} tf={tf} volRank={volRank} /> : <dl><Row label="Tick activity">{finite(liveBar?.tick_volume) === null ? "Unavailable" : number(liveBar?.tick_volume, 0)}</Row><Row label="Spread (broker points)">{number(liveBar?.spread)}</Row><Row label="Volatility range rank">{volRank === null ? "—" : `${volRank}%`}</Row><Row label="Source">{sourceLabel}</Row></dl>}
          <p className="quant-note">Tick volume and spread require the live feed.</p>
        </Panel>
        <Panel title="Observed indicators"><dl><Row label="EMA 10">{number(observedTape?.indicators.ema10 ?? advice?.indicators?.ema_fast, 3)}</Row><Row label="EMA 34">{number(observedTape?.indicators.ema34 ?? advice?.indicators?.ema_slow, 3)}</Row><Row label="ATR 14">{number(observedTape?.indicators.atr14 ?? advice?.indicators?.atr14, 3)}</Row></dl>{market && <details><summary>Data provenance</summary><code>{market.source_hash}</code><p className="quant-note">Computed by the research service on {market.indicator_lookback} bars.</p></details>}</Panel>
      </aside>

      <section className="quant-market-column" aria-label="Market analysis">
        <section className="quant-chart" aria-label="Market chart">
          <div className="quant-chart-heading"><strong>{symbol} <span>{tf}</span></strong><span>{last?.t || "Waiting for OHLC"}</span><label><input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} />Zones</label></div>
          <div className="quant-zone-legend">{showZones.map((z, i) => <span key={i} style={{ color: z.color }}><i />{z.label}</span>)}<small>{card ? "Card structural model" : "Market structural model · no Card selected"} · as of last bar</small></div>
          <div className="quant-chart-canvas">{bars.length > 1 ? <MicroChart bars={bars} zones={showZones} zoneLayout="wide" symbol={symbol} tf={tf} live={liveReady} /> : <div className="product-empty"><h2>{source === "live" ? "Live feed unavailable" : error ? "History unavailable" : "Loading market history"}</h2><p>{source === "live" ? "Connect the data service to inspect current market observations." : "The research service reads the local OHLC dataset."}</p><button className="product-button" onClick={() => go(source === "live" ? "microscope" : "assets")}>{source === "live" ? "Open Microscope" : "Open Assets"}</button></div>}</div>
        </section>
        <div className="quant-market-widgets">
          <Panel title="Sweep map / liquidity" note="Liquidity levels come from the advisory source. The rolling 20-bar high and low are observed price extremes, not confirmed stop pools."><dl><Row label="Above liquidity">{number(above)}</Row><Row label="Below liquidity">{number(below)}</Row><Row label="20-bar high">{number(rangeHigh)}</Row><Row label="20-bar low">{number(rangeLow)}</Row></dl><button className="quant-link" onClick={() => go("microscope")}>Inspect structure</button></Panel>
          <Panel title="Strategy compass"><p className="quant-highlight">{card?.name || "No Card selected"}</p><dl><Row label="Design timeframe">{card ? getCardRuntimeConfig(card).design_tf : "—"}</Row><Row label="Modules">{card?.modules.length ?? "—"}</Row><Row label="Research state">{String(card?.status || "Unconfigured")}</Row></dl><button className="quant-link" onClick={inspect}>Open Strategy Lab</button></Panel>
          <Panel title="Weekly self-audit"><p className="quant-note">{advice?.weekly_self_audit ? "A source audit is available for review." : "No weekly audit supplied for this view. Historical Card validation is available in Analytics."}</p><button className="quant-link" onClick={() => go("weekly-audit")}>Review audit evidence</button></Panel>
          <Panel title="KIDI · numeric integrity" note="Read-only scan of the displayed bars for frozen closes, zero ranges and gaps exceeding four days. This scan does not establish overall feed reliability."><dl><Row label="Flagged events">{integrity?.total ?? "—"}</Row><Row label="Frozen-feed blocks">{integrity?.blocks ?? "—"}</Row><Row label="Zero ranges / gaps">{integrity ? `${integrity.rangeZero} / ${integrity.gap}` : "—"}</Row></dl><button className="quant-link" onClick={() => go("kidi-events")}>Inspect KIDI events</button></Panel>
        </div>
      </section>

      <aside className="quant-decision-column" aria-label="Strategy and scenario inspection">
        <Panel title="Strategy & orders"><label className="strategy-field">Strategy Card<select aria-label="Active Strategy Card" value={card?.id || ""} onChange={(e) => setSelected(e.target.value)}><option value="">Select a strategy</option>{availableCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><StrategyControls card={card} onAdvanced={inspect} />{!card && <button className="quant-link" disabled={busy} onClick={createExample}>{busy ? "Saving…" : "Create a research Card"}</button>}</Panel>
        <CardEvidencePanel card={card} />
        <details className="quant-research-context"><summary>Research assessment & source plan</summary>
        <Panel title="Research assessment" className={advice?.no_trade?.hard_block ? "quant-assessment blocked" : "quant-assessment"}>
          <strong className="quant-assessment-value">{entry?.verdict || "OBSERVATION ONLY"}</strong><p>{entry?.reason || (source === "history" ? "Historical tape · no current entry assessment" : "Waiting for a source-backed assessment")}</p><div className="quant-tags">{reasons.map((r) => <span key={r} className="mfe-status-pill danger">{r.replace(/_/g, " ")}</span>)}</div>
        </Panel>
        {advice && <Panel title="Your direction" note="Choose a read-only research scenario. On the live feed, the selection is passed to the advisory query; it never submits an order."><div className="quant-direction" role="group" aria-label="Research direction">{(["BUY", "SELL"] as const).map((d) => <button key={d} aria-pressed={direction === d} className={`${d.toLowerCase()} ${direction === d ? "selected" : ""}`} onClick={() => setDirection(direction === d ? "" : d)}>{d === "BUY" ? "↑" : "↓"} {d} scenario</button>)}</div><p className="quant-note">{source === "live" ? direction ? `${direction} scenario · advisory query` : "Select a direction to inspect" : direction ? `${direction} selected · switch to Live feed for a source plan` : "Research scenario · no order execution"}</p></Panel>}
        <Panel title="Trade plan · source levels" className="quant-trade-plan"><dl><Row label="Direction">{planDirectionMatches ? plan?.direction || "—" : "Awaiting selected scenario"}</Row><Row label="Entry reference">{number(planEntry)}</Row><Row label="Invalidation">{number(planStop)}</Row><Row label="Target 1">{number(targets[0]?.price)}</Row><Row label="Target 2">{number(targets[1]?.price)}</Row><Row label="R:R (Target 1)">{number(targets[0]?.rr)}</Row></dl>{planEntry === null && <p className="quant-note">No source plan for this view. Structural overlays are descriptive price regions.</p>}</Panel>
        </details>
        <Panel title="System story"><p className="quant-story">{advice?.market_story?.primary_story || advice?.headline || (market ? `${symbol} ${tf}: ${bias?.side.toLowerCase() || "unassessed"} EMA structure. The latest true range ranks at ${volRank ?? "—"}% of the displayed window. ${conflict ? "Timeframes show opposing directions." : "Compare the timeframe stack before drawing a conclusion."}` : "Waiting for source observations.")}</p><button className="quant-link" onClick={() => go("help")}>Cockpit guide</button></Panel>
      </aside>
    </div>
  </div>;
}

