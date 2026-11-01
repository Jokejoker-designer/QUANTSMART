import{explainResearchError}from"../lib/researchErrors.ts";
import { useState } from "react";
import { researchStorage,runResearchJob } from "../lib/researchJobs.ts";
import type { runStrategyAttribution } from "../lib/strategyAttribution.ts";
import type { RealisticBacktestOptions } from "../lib/realisticSimRun.ts";
export function StrategyAttributionPanel({
  importId,
  card,
  from,
  to,
  windowTf,
  options,
}: {
  importId: string;
  card: {
    modules: string[];
    design_tf?: "M1" | "M5" | "M15" | "H1" | "H4" | "D1";
    symbol?: string;
  };
  from: string;
  to: string;
  windowTf: string;
  options: RealisticBacktestOptions;
}) {
  const [result, setResult] = useState<{
      key: string;
      data: ReturnType<typeof runStrategyAttribution>;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const storage=researchStorage();
  const key = JSON.stringify({ importId, card, from, to, windowTf, options,storage });
  const shown = result?.key === key ? result.data : null;
  const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
  const value = (x: number | null) => (x == null ? "—" : x.toFixed(2));
  return (
    <details className="csv-import">
      <summary>Strategy attribution · matched controls</summary>
      <p>
        Compare native entry events and the same Card exits with seeded random
        entries. Matching uses chronological third, direction, causal EMA
        regime, UTC hour and supported plan filters. Requires 600–5,000 design
        bars. Custom/stateful/mixed-timeframe Cards are refused.
      </p>
      <button
        type="button"
        disabled={busy || !from || !to}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const data = await runResearchJob<
              ReturnType<typeof runStrategyAttribution>
            >({
              kind: "diagnostic",
              analysis: "attribution",
              importId,
              from,
              to,
              windowTf,
              card,
              options,
              parameters: { seeds: 8, maxEvents: 24 },
              storage,
            });
            setResult({ key, data });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Running matched experiments…" : "Run 8-seed attribution"}
      </button>
      <p role="alert">{explainResearchError(error)}</p>
      {shown && (
        <div role="status">
          <p>
            {shown.evaluatedEvents} matched events · {shown.seeds} seeds ·{" "}
            {shown.canonicalCallsObserved} canonical simulator calls.
            Full-system reference: {shown.fullSystem.trades} trades,{" "}
            {value(shown.fullSystem.netR)} R.
          </p>
          <div className="csv-import-preview">
            <table>
              <caption>
                Conditional event study, mean net basis points per event
              </caption>
              <thead>
                <tr>
                  <th>Hold</th>
                  <th>A · Real + hold</th>
                  <th>B · Random + hold</th>
                  <th>C · Random + exit</th>
                  <th>D · Real + exit</th>
                  <th>Entry lift</th>
                  <th>Exit lift on random</th>
                  <th>Interaction</th>
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((row) => (
                  <tr key={row.horizon}>
                    <td>{row.horizon} bars</td>
                    <td>{value(row.A_realEntriesFixedHold.meanNetBps)}</td>
                    <td>
                      {value(mean(row.controls.map((c) => c.b.meanNetBps!)))}
                    </td>
                    <td>
                      {value(mean(row.controls.map((c) => c.c.meanNetBps!)))}
                    </td>
                    <td>{value(row.D_realEntriesCardExit.meanNetBps)}</td>
                    <td>{value(row.meanEntryLiftBps)}</td>
                    <td>{value(row.meanExitLiftOnRandomBps)}</td>
                    <td>{value(row.meanInteractionBps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            D uses isolated events; the separate full-system reference retains
            the actual position scheduler. Exposure duration is reported, not
            automatically equal. Chronological thirds are not independent OOS
            evidence after strategy selection. No p-value, selection correction
            or profitability verdict is computed.
          </p>
          <details>
            <summary>Protocol, individual seeds and exposure</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(shown, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </details>
  );
}
