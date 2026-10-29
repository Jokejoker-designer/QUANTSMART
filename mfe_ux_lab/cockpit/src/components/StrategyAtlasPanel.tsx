// StrategyAtlasPanel — WO-5. MEASURED card × environment map (regime/session/volatility/month), bucketed
// from the card's real trades by the fingerprint AT ENTRY. Sample-gated: a thin cell shows "insufficient",
// never a suitability claim. Read-only · advisory · "suitability ≠ promise".
import { useMemo } from "react";
import { TK } from "./ui/Ui.tsx";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { RealisticBacktest } from "../lib/realisticSimRun.ts";
import { buildCardAtlas, type AtlasCell, type AtlasDimension } from "../lib/strategyAtlas.ts";

const DIM_LABEL: Record<AtlasDimension, string> = { regime: "Regime", session: "Session", volatility: "Volatility", month: "Month" };
const vCol = (v: string) => v === "FITS" ? TK.green : v === "HOSTILE" ? TK.red : v === "NEUTRAL" ? TK.yellow : TK.muted;

function Cell({ c }: { c: AtlasCell }) {
  const col = vCol(c.verdict);
  const insuff = c.verdict === "INSUFFICIENT";
  return (
    <div title={`${c.envLabel} · ${c.evidence} · win ${(c.posFrac * 100).toFixed(0)}%`}
      style={{ minWidth: 96, border: "1px solid " + (insuff ? TK.border : col + "66"), background: insuff ? TK.s2 : col + "1a", borderRadius: 8, padding: "7px 8px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: insuff ? TK.muted : "#e7eef6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.envLabel}</div>
      <div style={{ fontFamily: "var(--mfe-mono)", fontSize: 13, fontWeight: 800, color: insuff ? TK.muted : c.netR >= 0 ? TK.green : TK.red }}>{insuff ? "insuff." : (c.netR >= 0 ? "+" : "") + c.netR + "R"}</div>
      <div style={{ fontSize: 9, color: TK.muted, fontFamily: "var(--mfe-mono)" }}>n={c.trades} · {c.evidence === "USABLE_EVIDENCE" ? "USABLE" : c.evidence === "WEAK_EVIDENCE" ? "WEAK" : "insufficient samples"}</div>
    </div>
  );
}

export function StrategyAtlasPanel({ designBars, bt, card }: { designBars: OhlcBar[] | null; bt: RealisticBacktest | null; card: { id?: string; name?: string } }) {
  const atlas = useMemo(() => (designBars && bt ? buildCardAtlas(designBars, bt, { cardId: card?.id }) : null), [designBars, bt, card?.id]);
  if (!atlas) return null;

  return (
    <div className="pc" style={{ borderColor: "#1d4c66" }}>
      <div className="pc-h"> Strategy Atlas: observed context coverage <span style={{ color: TK.cyan }}>MEASURED</span> <span className="mut">Out-of-sample entry-context fingerprint</span></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 11 }}>
        <span className="mfe-badge good" style={{ fontSize: 10 }}><span className="dot" />source: measured</span>
        <span className="pmut psm">{atlas.bucketedTrades}/{atlas.totalTrades} trades with a resolved context</span>
        <span className="pmut psm">minimum sample:{atlas.thresholds.weak} insuff · {atlas.thresholds.weak}–{atlas.thresholds.usable - 1} weak · ≥{atlas.thresholds.usable} usable</span>
      </div>
      {atlas.bucketedTrades === 0 ? (
        <div className="pmut psm">No trade has a resolved context yet. Check trade coverage and fingerprint warmup requirements.</div>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {atlas.dimensions.map((dv) => (
            <div key={dv.dimension}>
              <div style={{ fontSize: 9.5, color: TK.muted, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>{DIM_LABEL[dv.dimension]}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{dv.cells.map((c) => <Cell key={c.key} c={c} />)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="pfoot" style={{ marginTop: 8 }}>{atlas.note}</div>
      <div className="pmut psm" style={{ marginTop: 4, fontStyle: "italic" }}>These are historical descriptions, not a forecast of future compatibility. Insufficient buckets make no claim.</div>
    </div>
  );
}
