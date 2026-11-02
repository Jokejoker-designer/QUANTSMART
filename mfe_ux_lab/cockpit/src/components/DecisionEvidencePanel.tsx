import { useEffect, useRef, useState } from "react";
import { researchStorage, runResearchJob } from "../lib/researchJobs.ts";
import type {
  DecisionJournal,
  SavedDecisionEvidence,
} from "../lib/decisionJournalTypes.ts";
import type { RealisticBacktestOptions } from "../lib/realisticSimRun.ts";
import "./decision-evidence.css";

function EntryEvaluationEvidence({
  evidence,
}: {
  evidence: DecisionJournal["entryEvaluation"];
}) {
  const [filter, setFilter] = useState("ALL"),
    [page, setPage] = useState(0);
  if (!evidence || evidence.coverage === "NOT_CAPTURED" || !evidence.summary)
    return (
      <p>
        Entry evaluation was not captured in this archived run. Missing evidence
        does not mean the system explicitly chose to abstain.
      </p>
    );
  const rows = evidence.records.filter(
    (row) => filter === "ALL" || row.outcome === filter,
  );
  return (
    <details>
      <summary>Why entries did or did not proceed</summary>
      <p>
        {evidence.summary.recordedBars.toLocaleString()} recorded bars ·{" "}
        {evidence.summary.abstentions} abstentions · {evidence.summary.vetoes}{" "}
        gate vetoes · {evidence.summary.planRejections} rejected plans ·{" "}
        {evidence.summary.modeledEntries} modeled entries.
      </p>
      <p>
        {evidence.summary.warmupBars} warmup bars excluded ·{" "}
        {evidence.summary.unobservedBars} later bars unobserved. Only the first
        reached terminal branch is recorded. Subsequent gates were not
        evaluated.
      </p>
      <label>
        Entry evaluation outcome
        <select
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
        >
          <option value="ALL">All recorded branches</option>
          <option value="ABSTAIN">No candidate or combination abstained</option>
          <option value="VETO">Gate veto</option>
          <option value="POLICY_BLOCKED">Discipline block</option>
          <option value="PLAN_REJECTED">Plan rejected</option>
          <option value="UNFILLED">No next bar</option>
          <option value="MODELED_ENTRY">Modeled entry</option>
          <option value="POSITION_HELD">
            Existing position; entry not evaluated
          </option>
          <option value="RUN_HALTED">Simulation halted</option>
        </select>
      </label>
      <div className="csv-import-preview">
        <table>
          <caption>
            Recorded entry branches · {rows.length.toLocaleString()} matching
            bars
          </caption>
          <thead>
            <tr>
              <th scope="col">Design close, UTC</th>
              <th scope="col">Branch</th>
              <th scope="col">Observed reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 25, (page + 1) * 25).map((row) => (
              <tr key={row.evaluationId}>
                <td>{row.at}</td>
                <td>{row.outcome}</td>
                <td>
                  <strong>{row.code}</strong>
                  <br />
                  {row.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="evidence-controls">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous entry branches
        </button>
        <span>
          Page {page + 1} / {Math.max(1, Math.ceil(rows.length / 25))}
        </span>
        <button
          type="button"
          disabled={(page + 1) * 25 >= rows.length}
          onClick={() => setPage((value) => value + 1)}
        >
          Next entry branches
        </button>
      </div>
      <ul>
        {evidence.limitations.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  );
}

export function DecisionEvidencePanel({
  importId,
  card,
  from,
  to,
  windowTf,
  barsCount,
  options,
}: {
  importId: string;
  card: {
    id: string;
    modules: string[];
    design_tf?: string;
    execution_tf?: string;
    symbol?: string;
  };
  from: string;
  to: string;
  windowTf: string;
  barsCount: number;
  options: RealisticBacktestOptions;
}) {
  const [result, setResult] = useState<{
      key: string;
      report: DecisionJournal;
      archived: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<SavedDecisionEvidence[]>([]),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState(0);
  const key = JSON.stringify({
    importId,
    card,
    from,
    to,
    windowTf,
    options,
    storage: researchStorage(),
  });
  const current = useRef(key);
  current.current = key;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
    setPage(0);
    setError("");
  }, [key]);
  const shown = result?.key === key ? result : null;
  const canRun =
    barsCount >= 61 &&
    barsCount <= 5000 &&
    (!card.execution_tf || card.execution_tf === (card.design_tf || windowTf));
  async function refresh() {
    try {
      const response = await fetch("/api/research/evidence");
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Evidence archive is unavailable.");
      setSaved(body.records);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  async function build() {
    if (busy || !canRun) return;
    setBusy(true);
    setError("");
    const expected = key;
    controller.current = new AbortController();
    try {
      const report = await runResearchJob<DecisionJournal>(
        {
          kind: "diagnostic",
          analysis: "decision_trace",
          source: "CSV",
          importId,
          from,
          to,
          windowTf,
          timeframe: windowTf,
          card,
          options,
          storage: researchStorage(),
        },
        controller.current.signal,
        { cancelOnAbort: true },
      );
      if (current.current === expected) {
        setResult({ key: expected, report, archived: false });
        setPage(0);
        await refresh();
      }
    } catch (error) {
      if (current.current === expected)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function openSaved() {
    if (!selected || busy) return;
    setError("");
    setBusy(true);
    const expected = key;
    try {
      const response = await fetch(
        "/api/research/evidence/" + encodeURIComponent(selected),
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Saved evidence is unavailable.");
      if (current.current === expected) {
        setResult({
          key: expected,
          report: {
            ...body.report,
            evidenceRecord: { id: body.id, recordedAt: body.recordedAt },
          },
          archived: true,
        });
        setPage(0);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="csv-import decision-evidence"
      onToggle={(event) => {
        if (event.currentTarget.open) void refresh();
      }}
    >
      <summary>Decision &amp; outcome evidence</summary>
      <p>
        Join the canonical simulator's observed signals with policy blocks,
        modeled fills and completed trades. This is a read-only report on
        61–5,000 selected design bars. No-entry and open observations have no
        return label.
      </p>
      <p>
        New reports capture the first reached entry branch on each processed
        design bar, including abstentions and gate vetoes. Structural setup
        lineage remains unavailable. This report is not a performance receipt.
      </p>
      <div className="evidence-controls">
        <button
          type="button"
          disabled={busy || !canRun}
          onClick={() => void build()}
        >
          {busy ? "Building evidence…" : "Build decision journal"}
        </button>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh saved reports
        </button>
      </div>
      {!canRun && (
        <p role="status">
          Select 61–5,000 bars and a Card with the same design and execution
          timeframe.
        </p>
      )}
      <div className="evidence-controls">
        <label>
          Saved evidence
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Select an archived report</option>
            {saved.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.cardId} · {entry.source.symbol} {entry.source.timeframe}{" "}
                · {entry.summary.signals} signals · {entry.recordedAt}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={() => void openSaved()}
        >
          Open saved report
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {shown && (
        <section aria-label="Decision journal results" aria-live="polite">
          {shown.archived && (
            <p className="evidence-note">
              Archived evidence may describe an earlier Card definition or
              another dataset. Its frozen source and definition hash are shown
              below.
            </p>
          )}
          <p>
            {shown.report.source.symbol} · {shown.report.source.timeframe} ·{" "}
            {shown.report.source.bars.toLocaleString()} bars ·{" "}
            {shown.report.summary.signals} observed signals ·{" "}
            {shown.report.summary.closed} completed modeled trades ·{" "}
            {shown.report.summary.policyBlocked} policy blocks ·{" "}
            {shown.report.summary.openAtEnd} open at end.
          </p>
          <p>
            {shown.report.source.from} → {shown.report.source.to} UTC
          </p>
          <EntryEvaluationEvidence
            key={shown.report.runId}
            evidence={shown.report.entryEvaluation}
          />
          <details>
            <summary>Source identity and coverage limits</summary>
            <dl>
              <dt>Source hash</dt>
              <dd>{shown.report.source.hash}</dd>
              <dt>Definition hash</dt>
              <dd>{shown.report.definitionHash}</dd>
              <dt>Engine hash</dt>
              <dd>{shown.report.engineHash}</dd>
              <dt>Structural setup lifecycle</dt>
              <dd>{shown.report.structuralSetupLifecycle}</dd>
              <dt>Unjoined trades</dt>
              <dd>{shown.report.summary.unjoinedTrades}</dd>
            </dl>
            <ul>
              {shown.report.limitations.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
          {shown.report.evidenceRecord && (
            <p>
              <a
                href={
                  "/api/research/evidence/" + shown.report.evidenceRecord.id
                }
                download={shown.report.evidenceRecord.id + ".json"}
              >
                Download immutable evidence JSON
              </a>
            </p>
          )}
          <div className="csv-import-preview">
            <table>
              <caption>
                Observed candidate decisions and joined outcomes
              </caption>
              <thead>
                <tr>
                  <th scope="col">Signal time, UTC</th>
                  <th scope="col">Scenario</th>
                  <th scope="col">Observation status</th>
                  <th scope="col">Net R</th>
                  <th scope="col">Trace</th>
                </tr>
              </thead>
              <tbody>
                {shown.report.records
                  .slice(page * 25, (page + 1) * 25)
                  .map((row) => (
                    <tr key={row.observationId}>
                      <td>{row.signalTime}</td>
                      <td>
                        {row.direction === "BUY"
                          ? "Long research scenario"
                          : "Short research scenario"}
                      </td>
                      <td>{row.status}</td>
                      <td className="evidence-number">
                        {row.outcome ? row.outcome.netR.toFixed(3) : "—"}
                      </td>
                      <td>
                        <details>
                          <summary>Inspect observation</summary>
                          <p className="evidence-id">{row.observationId}</p>
                          <ol>
                            {row.trace.map((event) => (
                              <li key={event.id}>
                                {event.at || "Time not emitted"} · {event.type}{" "}
                                · {event.reason}
                              </li>
                            ))}
                          </ol>
                          {row.outcome && (
                            <p>
                              Completed-bar favorable / adverse price excursion:{" "}
                              {row.outcome.excursions.maxFavorablePrice?.toFixed(
                                3,
                              ) ?? "Unavailable"}{" "}
                              /{" "}
                              {row.outcome.excursions.maxAdversePrice?.toFixed(
                                3,
                              ) ?? "Unavailable"}
                              . Lower bounds; exit bar excluded. MFE/MAE in R:
                              unavailable.
                            </p>
                          )}
                          <ul>
                            {row.missing.map((item) => (
                              <li key={item.field}>
                                {item.field}: {item.reason}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="evidence-controls">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={page === 0}
            >
              Previous observations
            </button>
            <span>
              Page {page + 1} /{" "}
              {Math.max(1, Math.ceil(shown.report.records.length / 25))}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => value + 1)}
              disabled={(page + 1) * 25 >= shown.report.records.length}
            >
              Next observations
            </button>
          </div>
        </section>
      )}
    </details>
  );
}
