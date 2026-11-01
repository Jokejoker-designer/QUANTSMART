import { useEffect, useMemo, useState } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import {
  CSV_SELECTED_KEY,
  listCsvImports,
  type CsvImportMetadata,
} from "./csvImports.ts";
import { CSV_MINUTES } from "./csvOhlc.ts";
import { runResearchJob } from "./researchJobs.ts";
export function useSandboxDataset() {
  const [list, setList] = useState<CsvImportMetadata[]>([]),
    [id, setId] = useState(""),
    [tf, setTf] = useState("M15");
  const [state, setState] = useState<{
    key: string;
    bars: OhlcBar[];
    available: number;
    error: string | null;
  }>({ key: "", bars: [], available: 0, error: null });
  useEffect(() => {
    let live = true;
    listCsvImports()
      .then((rows) => {
        if (!live) return;
        setList(rows);
        const row =
          rows.find((x) => x.id === localStorage.getItem(CSV_SELECTED_KEY)) ||
          rows[rows.length - 1];
        if (row) {
          setId(row.id);
          setTf(row.tf);
        }
      })
      .catch((error) => {
        if (live)
          setState({ key: "", bars: [], available: 0, error: error.message });
      });
    return () => {
      live = false;
    };
  }, []);
  const key = id + ":" + tf;
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    runResearchJob<{ bars: OhlcBar[]; availableBars?: number }>(
      {
        kind: "csv_view",
        importId: id,
        timeframe: tf,
        count: 2000,
        storage: {},
      },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setState({
            key,
            bars: result.bars,
            available: result.availableBars || result.bars.length,
            error: null,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ key, bars: [], available: 0, error: error.message });
      });
    return () => controller.abort();
  }, [key, id, tf]);
  const bars = useMemo(
    () => (state.key === key ? state.bars : []),
    [state, key],
  );
  const selected = list.find((row) => row.id === id);
  return {
    list,
    id,
    tf,
    bars,
    selected,
    pending: !!id && state.key !== key,
    error: state.key === key || !id ? state.error : null,
    label: selected
      ? `${selected.symbol} · ${tf} · ${bars.length.toLocaleString()} of ${state.available.toLocaleString()} observations`
      : "Select or import a CSV dataset",
    setTf,
    setId: (value: string) => {
      setId(value);
      const row = list.find((x) => x.id === value);
      if (row) setTf(row.tf);
    },
    select: (row: CsvImportMetadata) => {
      setList((rows) => [row, ...rows.filter((x) => x.id !== row.id)]);
      setId(row.id);
      setTf(row.tf);
      localStorage.setItem(CSV_SELECTED_KEY, row.id);
    },
    frames: Object.keys(CSV_MINUTES).filter(
      (frame) => !selected || CSV_MINUTES[frame] >= CSV_MINUTES[selected.tf],
    ),
  };
}
