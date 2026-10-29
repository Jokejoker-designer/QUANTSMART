// BlockPlayground — "adjust the knobs, see the effect" for ANY parameterised block, the same idea as the
// adjustable candle: drag a param slider and the block's live preview (candle/ribbon/gauge/sparkline) updates
// so the user understands exactly what their change does. Controlled (params+onParams, e.g. bound to a graph
// node) or uncontrolled (local exploration in the Gallery). L1 = measurement only.
import { useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import type { L1PrimitiveBlockSpec } from "../lib/blocks/blockTypes.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { baseSeriesFrom, computeBlockSeries, defaultParams } from "../lib/blocks/blockDemo.ts";
import { BlockViz } from "./BlockViz.tsx";

const fmt = (v: number) => (!isFinite(v) ? "—" : Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));

export function BlockPlayground({ block, bars, params, onParams, W = 280, H = 70 }: {
  block: L1PrimitiveBlockSpec; bars: OhlcBar[];
  params?: Record<string, number>; onParams?: (p: Record<string, number>) => void; W?: number; H?: number;
}) {
  const [local, setLocal] = useState<Record<string, number>>(() => params ?? defaultParams(block));
  const p = params ?? local;
  const set = (key: string, val: number) => { const np = { ...p, [key]: val }; onParams ? onParams(np) : setLocal(np); };

  const base = useMemo(() => baseSeriesFrom(bars), [bars]);
  const series = useMemo(() => computeBlockSeries(block, bars, base, p), [block, bars, base, p]);
  const last = series && series.length ? series[series.length - 1] : undefined;

  return (
    <div>
      <BlockViz block={block} series={series} bars={bars} W={W} H={H} />
      {block.parameters.length > 0 ? (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
          {block.parameters.map((par) => (
            <label key={par.name} style={{ fontSize: 10.5, color: "var(--mfe-text2)" }}>
              {par.label || par.name}: <b style={{ color: TK.cyan }}>{p[par.name] ?? par.defaultValue}</b>
              <input type="range" min={par.min ?? 0} max={par.max ?? 100} step={par.step ?? 1} value={p[par.name] ?? par.defaultValue} onChange={(e) => set(par.name, parseFloat(e.target.value))} style={{ width: "100%" }} />
            </label>
          ))}
          <div className="pmut" style={{ fontSize: 9.5, fontStyle: "italic" }}>Parameter changes update the preview. Current value: <b style={{ color: TK.cyan }}>{last !== undefined ? fmt(last) : "—"}</b></div>
        </div>
      ) : (
        <div className="pmut psm" style={{ marginTop: 5, fontStyle: "italic" }}>This block has no adjustable parameter{last !== undefined ? `value${fmt(last)}` : ""}.</div>
      )}
    </div>
  );
}
