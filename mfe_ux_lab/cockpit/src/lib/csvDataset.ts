import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { CSV_MINUTES } from "./csvOhlc.ts";
export function aggregateCsvBars(
  input: OhlcBar[],
  sourceTf: string,
  targetTf: string,
) {
  const source = CSV_MINUTES[sourceTf],
    target = CSV_MINUTES[targetTf];
  if (
    !Number.isFinite(source) ||
    !Number.isFinite(target) ||
    target < source ||
    target % source
  )
    throw new Error(
      "CSV_TIMEFRAME_MISMATCH: choose an equal or coarser chart/Card timeframe",
    );
  if (target === source)
    return { bars: input, gapBuckets: 0, incompleteBuckets: 0 };
  const buckets = new Map<number, OhlcBar[]>();
  for (const b of input) {
    const key = Math.floor(Date.parse(b.t + "Z") / (target * 60000));
    const group = buckets.get(key) ?? [];
    group.push(b);
    buckets.set(key, group);
  }
  const bars: OhlcBar[] = [];
  let gapBuckets = 0,
    incompleteBuckets = 0;
  const availableEnd =
    Date.parse(input[input.length - 1].t + "Z") + source * 60000;
  for (const [key, group] of buckets) {
    const start = key * target * 60000;
    if (start + target * 60000 > availableEnd) {
      incompleteBuckets++;
      continue;
    }
    const gap =
      group.length !== target / source ||
      group.some(
        (b, i) => Date.parse(b.t + "Z") !== start + i * source * 60000,
      );
    if (gap) gapBuckets++;
    bars.push({
      i: bars.length,
      t: new Date(start).toISOString().slice(0, 19),
      o: group[0].o,
      h: Math.max(...group.map((b) => b.h)),
      l: Math.min(...group.map((b) => b.l)),
      c: group[group.length - 1].c,
      r: "N",
    });
  }
  return { bars, gapBuckets, incompleteBuckets };
}
