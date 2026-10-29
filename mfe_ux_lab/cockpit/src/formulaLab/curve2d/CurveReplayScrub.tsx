import type { CurveSamplePoint } from "./core/curveTypes";

const STRIP_H = 32, MAX_BARS = 170;

// Replay Bar Strip — barIndex/time → formula output. Bar height ∝ output, ▲ above / ▼ below baseline. Current bar
// cyan · zero-crossing yellow · missing/NaN faded. Click a bar to select it. Timeline visualization only — no signal.
export function CurveReplayScrub({
  samplePoints, current, onCurrent, playing, onPlaying, speed, onSpeed, outputLabel = "output", binFilter,
}: {
  samplePoints: CurveSamplePoint[];
  current: number | null;
  onCurrent: (i: number | null) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
  speed: number;
  onSpeed: (s: number) => void;
  outputLabel?: string;
  binFilter?: { axis: "x" | "y"; lo: number; hi: number } | null;   // Phase 4 — dim bars outside the selected histogram bin
}) {
  const n = samplePoints.length;
  const cur = current ?? n - 1;
  const ts = current != null ? samplePoints[Math.min(n - 1, current)]?.timestamp : undefined;

  // down-sample so the strip fits + normalize output (Y) into [-1,1] for bar height
  const step = Math.max(1, Math.floor(n / MAX_BARS));
  const shown = samplePoints.filter((_, i) => i % step === 0);
  let maxAbs = 1e-9;
  for (const p of shown) if (Number.isFinite(p.y)) maxAbs = Math.max(maxAbs, Math.abs(p.y));
  const baseY = STRIP_H / 2, half = STRIP_H / 2 - 2;
  const curShownIdx = shown.findIndex((p) => p.barIndex === cur);
  const cursorX = curShownIdx >= 0 ? curShownIdx + 0.5 : (n > 1 ? (cur / (n - 1)) * shown.length : 0);

  return (
    <div>
      <div className="fl-note" style={{ marginTop: 0 }}>
        Replay Bar Strip · barIndex/time → {outputLabel} · timeline only · no entry · no order · no signal.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
        <button className="fl-tab" onClick={() => onCurrent(Math.max(0, cur - 1))}>⏮</button>
        <button className="fl-tab" onClick={() => onPlaying(!playing)}>{playing ? "⏸" : "▶"}</button>
        <button className="fl-tab" onClick={() => onCurrent(Math.min(n - 1, cur + 1))}>⏭</button>
        <select className="fl-tab" value={speed} onChange={(e) => onSpeed(Number(e.target.value))} style={{ padding: "4px 8px" }}>
          {[0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <input
          type="range" min={0} max={Math.max(0, n - 1)} value={cur}
          onChange={(e) => onCurrent(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--fl-cyan)" }}
        />
        <span className="mono" style={{ fontSize: 11, color: "var(--fl-muted)", minWidth: 130 }}>
          {n ? `bar ${cur + 1}/${n}` : "no samples"}{ts ? ` · ${ts}` : ""}
        </span>
      </div>
      {/* Replay Bar Strip */}
      <svg width="100%" height={STRIP_H} viewBox={`0 0 ${Math.max(1, shown.length)} ${STRIP_H}`} preserveAspectRatio="none"
        style={{ display: "block", background: "rgba(8,14,22,0.4)", borderRadius: 3 }}>
        <line x1={0} y1={baseY} x2={shown.length} y2={baseY} stroke="rgba(120,140,160,0.3)" strokeWidth={0.4} />
        {shown.map((p, k) => {
          const finite = Number.isFinite(p.y);
          if (!finite) return <rect key={p.barIndex} x={k + 0.1} y={baseY - 1} width={0.8} height={2} fill="rgba(120,130,140,0.3)"><title>{`bar ${p.barIndex} · missing/NaN`}</title></rect>;
          const prev = k > 0 ? shown[k - 1] : null;
          const zeroCross = !!prev && Number.isFinite(prev.y) && p.y !== 0 && prev.y !== 0 && Math.sign(p.y) !== Math.sign(prev.y);
          const isCur = p.barIndex === cur;
          const norm = Math.max(-1, Math.min(1, p.y / maxAbs));
          const h = Math.max(0.6, Math.abs(norm) * half);
          const y = p.y >= 0 ? baseY - h : baseY;
          const fv = binFilter ? (binFilter.axis === "x" ? p.x : p.y) : 0;
          const inFilter = !binFilter || (Number.isFinite(fv) && fv >= binFilter.lo && fv < binFilter.hi);
          const color = isCur ? "var(--fl-cyan)" : zeroCross ? "#f0c543" : (p.y >= 0 ? "rgba(63,182,168,0.6)" : "rgba(224,85,106,0.55)");
          return <rect key={p.barIndex} x={k + 0.08} y={y} width={0.84} height={h} fill={color} fillOpacity={binFilter && !inFilter && !isCur ? 0.16 : 1} style={{ cursor: "pointer" }} onClick={() => onCurrent(p.barIndex)}>
            <title>{`bar ${p.barIndex}${p.timestamp ? " · " + p.timestamp : ""} · ${outputLabel} ${p.y.toFixed(3)}${zeroCross ? " · zero-cross" : ""}`}</title>
          </rect>;
        })}
        <line x1={cursorX} y1={0} x2={cursorX} y2={STRIP_H} stroke="var(--fl-cyan)" strokeWidth={0.4} opacity={0.7} />
      </svg>
    </div>
  );
}
