import { useEffect, useMemo, useRef, useState } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { readStrategyCards, subscribeArtifactChanges, writeStrategyCards, type StrategyCardArtifactRecord } from "../lib/artifactRegistry.ts";
import { loadBeasts, prepareRefreshedBeast, saveBeast, type SavedBeast } from "../lib/cardBeastV2/beastStore.ts";
import type { CockpitActivity } from "../lib/cockpitActivity.ts";
import { terminalRequest } from "../lib/mt5Connection.ts";
import { runResearchJob } from "../lib/researchJobs.ts";
import { researchContextHash } from "../lib/strategyIdentity.ts";
import { getCardRuntimeConfig } from "../lib/simTimeframe.ts";
import { flushWorkspace } from "../lib/workspaceClient.ts";

function beastContext(beast: SavedBeast, cards: StrategyCardArtifactRecord[]) {
  if (beast.context) return beast.context;
  const attacker = beast.members.find(member => member.role === "ATTACKER");
  const card = cards.find(item => item.id === attacker?.card_id);
  return card?.symbol && card.design_tf ? { symbol: card.symbol, design_tf: card.design_tf } : null;
}

function describeFailure(reason: string) {
  switch (reason.split(":", 1)[0]) {
    case "ACTIVITY_MEMBER_REQUIRES_BEAST": return "This Card serves a supporting role. Evaluate it inside a saved Beast with an Attacker.";
    case "ACTIVITY_EXPLICIT_TRIGGER_REQUIRED": return "The saved definition needs an explicit entry trigger.";
    case "ACTIVITY_DESIGN_CLOSE_ONLY": return "This view supports Cards with matching design and execution timeframes.";
    case "ACTIVITY_BEAST_LINEAGE": return "One or more Beast members no longer match their saved Card fingerprints.";
    case "ACTIVITY_BEAST_COMPOSITION": return "The saved roles do not form an evaluable Beast. Review the details in Beast Lab.";
    case "ACTIVITY_INVALID_CLOSED_TAPE": return "The source returned unordered, duplicated or invalid candles.";
    case "ACTIVITY_ARTIFACT_NOT_SAVED": return "Save the selected Card or Beast to the workspace, then evaluate again.";
    case "ACTIVITY_BEAST_CONTEXT_MISMATCH": return "Use a Beast whose member Cards share an asset and matching design and execution timeframes.";
    case "ACTIVITY_BEAST_DEFINITION_CHANGED": return "The saved Beast differs from its current composition. Review and re-save it in Beast Lab.";
    case "ACTIVITY_REQUIRES_120_TO_600_CLOSED_BARS": return "This evaluation requires at least 120 closed candles.";
    case "DATASET_NOT_FOUND": return "No local history for this asset and timeframe.";
    default: return reason;
  }
}

const counts = (row: CockpitActivity["counts"]) =>
  `${row.withVotes} candles with votes · ${row.vetoed} vetoes · ${row.modeledEntries} modeled entries · ${row.closedTrades} closed simulations`;

export function StrategyActivity({ card, symbol, source, chartBars, chartTf, onActivityChange, onActivityIssueChange }: {
  card: StrategyCardArtifactRecord | null;
  symbol: string;
  source: "history" | "live" | "csv";
  chartBars?: OhlcBar[];
  chartTf?: string;
  onActivityIssueChange?: (issue: string | null) => void;
  onActivityChange?: (activity: CockpitActivity | null) => void;
}) {
  const [library, setLibrary] = useState(() => ({ beasts: loadBeasts(), cards: readStrategyCards() }));
  const [selectedBeast, setSelectedBeast] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<{ key: string; data?: CockpitActivity; error?: string; detail?: string; pending?: boolean; stale?: boolean }>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => subscribeArtifactChanges(() => setLibrary({ beasts: loadBeasts(), cards: readStrategyCards() })), []);
  const choices = library.beasts.filter(item => beastContext(item, library.cards)?.symbol === symbol);
  const beast = choices.find(item => item.id === selectedBeast);
  const target = beast ?? card;
  const timeframe = beast ? beastContext(beast, library.cards)?.design_tf : card ? getCardRuntimeConfig(card).design_tf : null;
  const contextHash = target ? researchContextHash({ ...target, design_tf: timeframe ?? undefined }) : "";
  const lastChartBar = chartBars?.[chartBars.length - 1];
  const windowKey = useMemo(() => chartBars ? JSON.stringify([chartTf, chartBars.slice(-600)]) : "", [chartBars, chartTf]);
  const key = JSON.stringify([source, symbol, timeframe, target?.id, target?.artifact?.content_hash, contextHash,
    library.cards.map(item => [item.id, item.artifact?.content_hash]), windowKey]);
  const [following, setFollowing] = useState(true);
  useEffect(() => () => controller.current?.abort(), [key]);
  const visible = state?.key === key ? state : undefined;

  async function evaluate() {
    if (!target || !timeframe || visible?.pending) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setState({ key, pending: true });
    try {
      await flushWorkspace();
      const tape = chartBars ? { ok: true, bars: chartTf === timeframe ? chartBars.slice(-600) : [] } : source === "live"
        ? await terminalRequest<{ ok: boolean; bars?: OhlcBar[]; reason?: string }>(
          `/bars?symbol=${encodeURIComponent(symbol)}&tf=${timeframe}&n=600`, undefined, request.signal)
        : null;
      if (chartBars && chartTf !== timeframe) throw Error("Choose " + timeframe + " on the chart to evaluate this definition.");
      if (tape && (!tape.ok || !tape.bars || tape.bars.length < 120))
        throw Error("The selected chart needs at least 120 closed candles for this evaluation.");
      const data = await runResearchJob<CockpitActivity>({
        kind: "diagnostic", analysis: "cockpit_activity", timeframe,
        ...(tape?.bars ? { bars: tape.bars.slice(-600), source: source === "csv" ? "CSV" : source === "live" ? "Live" : "Replay" } :
          { dataset: { symbol, tf: timeframe }, source: "Replay" }),
        options: { symbol },
        parameters: { artifactId: target.id, artifactKind: beast ? "BEAST" : "CARD" },
      }, request.signal, { cancelOnAbort: true });
      if (!request.signal.aborted) setState({ key, data });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!request.signal.aborted) setState({ key, error: describeFailure(reason), detail: reason, stale: reason.startsWith("ACTIVITY_BEAST_LINEAGE:") });
    }
  }

  useEffect(() => {
    onActivityChange?.(visible?.data ?? null);
    onActivityIssueChange?.(visible?.error ?? null);
  }, [visible?.data, visible?.error, key, onActivityChange, onActivityIssueChange]);
  useEffect(() => {
    if (!following || !target || !timeframe || !chartBars || !lastChartBar) return;
    const timer = setTimeout(() => { void evaluate(); }, 250);
    return () => { clearTimeout(timer); };
  }, [key, following]);

  async function refreshBeast() {
    if (!beast || refreshing) return;
    setRefreshing(true);
    try {
      const cards = readStrategyCards();
      const prepared = prepareRefreshedBeast(beast, cards);
      writeStrategyCards(cards);
      const saved = saveBeast(beast.name + " · Refreshed", prepared.members, prepared.composed, undefined, prepared.context);
      await flushWorkspace();
      setSelectedBeast(saved.id);
    } catch (error) {
      setState({ key, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRefreshing(false);
    }
  }

  const data = visible?.data;
  return <div className="strategy-controls">
    <label className="strategy-field">Evaluate
      <select value={selectedBeast} onChange={event => setSelectedBeast(event.target.value)}>
        <option value="">Selected Strategy Card</option>
        {choices.map(item => <option key={item.id} value={item.id}>Beast · {item.name}</option>)}
      </select>
    </label>
    <p className="strategy-help">{target ? `${target.name} · ${timeframe}` : "Select a Card above or choose a saved Beast."}
      {" · "}{source === "live" ? "MT5 closed candles" : source === "csv" ? "Selected CSV candles" : "Local historical candles"}
    </p>
    {chartBars && <label className="strategy-help"><input type="checkbox" checked={following}
      onChange={event => setFollowing(event.target.checked)} /> Follow chart's closed candles</label>}
    <button type="button" className="strategy-secondary" disabled={!target || !timeframe || visible?.pending}
      onClick={() => void evaluate()}>{visible?.pending ? "Evaluating…" : "Evaluate closed candles"}</button>
    {visible?.error && <div role="status">
      <p className="strategy-error">{visible.error}</p>
      <details><summary>Inspect saved definition</summary>
        <p>{target?.name} · {symbol} · {timeframe}</p>
        {target?.modules?.length ? <p>{target.modules.join(", ")}</p> : <p>No modules saved.</p>}
        {visible.detail && <p>{visible.detail}</p>}
      </details>
      {!beast && card && <button type="button" className="strategy-secondary" onClick={() => {
        localStorage.setItem("mfe_strategylab_preselect", card.id);
        window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "strategy-lab" }));
      }}>Inspect in Strategy Lab</button>}
      {!visible.stale && <>{" "}<a href="#beast-lab">Open Beast Lab</a></>}
    </div>}
    {visible?.stale && beast && <>
      <p className="strategy-help">Save a copy using the current Card definitions and the same modules. Previous results stay with the original Beast.</p>
      <button type="button" className="strategy-secondary" disabled={refreshing} onClick={() => void refreshBeast()}>
        {refreshing ? "Saving…" : "Save refreshed Beast copy"}
      </button>
      {" "}<a href="#beast-lab">Open Beast Lab</a>
    </>}
    {data && <>
      <p className="strategy-run-status" role="status">{data.bars} candles · {data.counts.evaluated} evaluated · sample ends {data.lastClose}</p>
      <p className="strategy-help">{counts(data.counts)}</p>
      {data.latest && <><p className="strategy-help">Last evaluated close: {data.latest.at}</p><strong>{data.latest.code.replace(/_/g, " ")}</strong><p>{data.latest.reason}</p>
        {!!data.latest.votes?.length && <ul>{data.latest.votes.map((vote, index) =>
          <li key={index}>{vote.reason} · weight {vote.weight}</li>)}</ul>}
      </>}
      {!!data.recentActions.length && <details className="strategy-advanced"><summary>Recent votes and vetoes</summary>
        <ul>{data.recentActions.map(row => <li key={row.at}>
          <time dateTime={row.at}>{row.at}</time> · {row.reason}
          {row.votes?.map((vote, index) => <div key={index}>{vote.reason}</div>)}
        </li>)}</ul>
      </details>}
      {data.roles.map(role => <details className="strategy-advanced" key={role.role}>
        <summary>{role.role.replace(/_/g, " ")} · {role.members.map(member => member.name).join(", ")}</summary>
        {role.members.map(member => <div key={member.card_id}>
          <p>{member.name} · retained: {member.used.join(", ") || "none"}
            {member.dropped.length ? ` · excluded: ${member.dropped.join(", ")}` : ""}</p>
          {role.members.length > 1 && <p className="strategy-help">
            {member.without ? `Without this member: ${counts(member.without)}.` : "This member has no separately removable modules in this role."}
          </p>}
        </div>)}
        <p>{role.without
          ? `Same sample without this role: ${counts(role.without)}.`
          : role.role === "ATTACKER" ? "Removing the Attacker leaves no primary candidate." : "No independent removal was measured for this role."}</p>
      </details>)}
      <p className="strategy-help">Research snapshot · HARD costs · source {data.sourceHash.slice(0, 12)} · definition {data.artifactHash.slice(0, 12)} · engine {data.engineHash.slice(0, 12)}</p>
    </>}
  </div>;
}
