// RegimeRibbon — the L2 signature viz: a per-bar colored strip under the chart showing the CONTEXT regime
// (trend UP/RANGE/DOWN · vol LOW/NORMAL/HIGH · session · …). Aligned to the price chart by bar index. The
// current regime label is shown. Context only — a regime is NOT a trade signal.
import type { RegimeView } from "../lib/blocks/l2Eval.ts";

export function RegimeRibbon({ view, label, atIndex, W = 920, H = 16 }: { view: RegimeView; label: string; atIndex?: number; W?: number; H?: number }) {
  const { code, bands } = view, n = code.length || 1, cw = W / n;
  const i = atIndex ?? n - 1, cur = bands[code[i]] ?? { label: "—", color: "#333" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0" }}>
      <span style={{ width: 96, fontSize: 10, color: "var(--mfe-muted)", flexShrink: 0 }}>{label}</span>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", flex: 1, borderRadius: 4, height: H }}>
        {code.map((c, k) => <rect key={k} x={k * cw} y={0} width={cw + 0.5} height={H} fill={bands[c]?.color ?? "#2a2f38"} opacity={0.85} />)}
        <line x1={i * cw + cw / 2} y1={0} x2={i * cw + cw / 2} y2={H} stroke="#fff" strokeWidth={0.8} opacity={0.5} />
      </svg>
      <span style={{ width: 70, textAlign: "right", fontSize: 10.5, fontWeight: 800, color: cur.color, flexShrink: 0 }}>{cur.label}</span>
    </div>
  );
}
