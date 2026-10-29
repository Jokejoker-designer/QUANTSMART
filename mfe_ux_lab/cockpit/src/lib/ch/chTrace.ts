// CH-WO-0 — source-trace builder + stable hash (manager §A.3). A trace makes a re-resample / version drift
// of the underlying bars DETECTABLE: same bars → same hash; any OHLC/count/tf change → different hash.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "../simConfig.ts";
import type { SourceTrace } from "./chTypes.ts";

// FNV-1a 32-bit → 8-hex. Deterministic, dependency-free, stable across runs.
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// build a trace over a contiguous (or arbitrary) set of source bar indices.
export function buildSourceTrace(bars: OhlcBar[], tf: Timeframe, barIds: number[]): SourceTrace {
  const ids = barIds.filter((i) => i >= 0 && i < bars.length);
  const first = ids.length ? bars[ids[0]] : undefined;
  const last = ids.length ? bars[ids[ids.length - 1]] : undefined;
  const payload = tf + "|" + (first?.t ?? "") + "|" + (last?.t ?? "") + "|" + ids.length + "|" +
    ids.map((i) => { const b = bars[i]; return `${b.o},${b.h},${b.l},${b.c}`; }).join(";");
  return {
    source_tf: tf,
    source_bar_ids: ids,
    source_start_time: first?.t ?? "",
    source_end_time: last?.t ?? "",
    source_count: ids.length,
    source_hash: stableHash(payload),
  };
}
