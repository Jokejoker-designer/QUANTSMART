import { CsvImportPanel } from "./CsvImportPanel.tsx";
import type { useSandboxDataset } from "../lib/sandboxDataset.ts";
import { explainResearchError } from "../lib/researchErrors.ts";
import "./sandbox-workspace.css";
export function SandboxDatasetControls({
  data,
}: {
  data: ReturnType<typeof useSandboxDataset>;
}) {
  return (
    <section className="sandbox-dataset">
      <div className="sandbox-dataset-fields">
        <label>
          Sandbox CSV dataset
          <select value={data.id} onChange={(e) => data.setId(e.target.value)}>
            <option value="">Select a saved dataset</option>
            {data.list.map((row) => (
              <option key={row.id} value={row.id}>
                {row.symbol} · {row.filename} · {row.tf}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evaluation timeframe
          <select value={data.tf} onChange={(e) => data.setTf(e.target.value)}>
            {data.frames.map((frame) => (
              <option key={frame}>{frame}</option>
            ))}
          </select>
        </label>
        <p role="status">
          {data.pending ? "Loading selected observations…" : data.label}
        </p>
      </div>
      {data.error && <p role="alert">{explainResearchError(data.error)}</p>}
      <small>
        The latest 2,000 selected observations feed this sandbox. Preview is
        descriptive; it does not establish an independent holdout or live
        readiness.
      </small>
      <CsvImportPanel openLabel="Use in this sandbox" onOpen={data.select} />
    </section>
  );
}
