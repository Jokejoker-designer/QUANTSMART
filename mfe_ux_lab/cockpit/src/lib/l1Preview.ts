import { useEffect, useMemo, useState } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { FeatureGraph } from "./blocks/featureGraph.ts";
import type { RoleGateResult } from "./blocks/roleGate.ts";
import { runResearchJob } from "./researchJobs.ts";
export interface L1Preview {
  bars: OhlcBar[];
  allSeries: Record<string, number[]>;
  source: {
    importId: string;
    symbol: string;
    tf: string;
    sourceHash: string;
    availableBars: number;
    evaluatedBars: number;
    from: string;
    to: string;
  };
  gates: RoleGateResult[];
  warnings: string[];
}
export function featureMechanismKey(graph: FeatureGraph) {
  return JSON.stringify({
    output: graph.output,
    nodes: graph.nodes.map(({ id, blockId, inputs, params }) => ({
      id,
      blockId,
      inputs,
      params,
    })),
  });
}
export function useL1Preview(
  importId: string,
  timeframe: string,
  graph: FeatureGraph,
  valid: boolean,
) {
  const mechanism = featureMechanismKey(graph);
  const frozen = useMemo(() => JSON.parse(mechanism), [mechanism]);
  const key = JSON.stringify({ importId, timeframe, mechanism });
  const [state, setState] = useState<{
    key: string;
    result: L1Preview | null;
    error: string | null;
  }>({ key: "", result: null, error: null });
  useEffect(() => {
    if (!importId || !valid) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      runResearchJob<L1Preview>(
        {
          kind: "feature_preview",
          importId,
          timeframe,
          graph: { ...frozen, id: "l1-preview", name: "L1 preview" },
          options: {},
          storage: {},
        },
        controller.signal,
        { cancelOnAbort: true },
      )
        .then((result) => {
          if (!controller.signal.aborted)
            setState({
              key,
              result: {
                ...result,
                allSeries: Object.fromEntries(
                  Object.entries(result.allSeries).map(([id, series]) => [
                    id,
                    series.map((value) =>
                      typeof value === "number" && Number.isFinite(value)
                        ? value
                        : NaN,
                    ),
                  ]),
                ),
              },
              error: null,
            });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({ key, result: null, error: error.message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, importId, timeframe, valid, frozen]);
  return {
    result: valid && state.key === key ? state.result : null,
    error: state.key === key ? state.error : null,
    pending: !!importId && valid && state.key !== key,
  };
}
