// ChEpisodeLensPanel — the LIVE view of the ch_episode_lens L2 module (CH_AUTH_1 · observer · descriptive).
// Runs the validated WO-1 KIND vocabulary on the current design_tf tape and shows the market AS structure:
// recent CONFIRMED episodes + the PROVISIONAL forming leg + a sequence-derived context. No signal, no outcome %.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { chEpisodeLens, type LensEpisode, type EpisodeLensOutput } from "../lib/ch/index.ts";

const KIND_STYLE: Record<string, { c: string; icon: string }> = {
  IMPULSE: { c: TK.green, icon: "⇪" }, CORRECTIVE: { c: TK.yellow, icon: "↩" }, RANGE: { c: TK.muted, icon: "≈" },
  SWEEP_RECLAIM: { c: TK.purple, icon: "⊐" }, FAILED_BREAKOUT: { c: TK.orange, icon: "✗" }, UNCLASSIFIED: { c: TK.muted, icon: "?" },
};
const dirArrow = (d: number) => (d > 0 ? "▲" : d < 0 ? "▼" : "•");

function Chip({ e, active }: { e: LensEpisode; active?: boolean }) {
  const s = KIND_STYLE[e.kind] || KIND_STYLE.UNCLASSIFIED;
  return (
    <span title={`${e.kind} · ${e.attrs.duration_bars} bars · range ${e.attrs.range_atr} ATR · body ${e.attrs.body_ratio}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${s.c}${active ? "" : "55"}`, background: active ? s.c + "22" : "#161b22", borderRadius: 7, padding: "3px 8px", fontSize: 11.5, color: TK.text, boxShadow: active ? `0 0 0 1px ${s.c}66` : "none" }}>
      <span style={{ color: s.c }}>{s.icon}{dirArrow(e.direction_sign)}</span>
      <b>{e.kind.replace("_", " ").toLowerCase()}</b>
      {!e.confirmed && <span style={{ fontSize: 8.5, color: TK.orange, border: "1px solid #5a3a18", borderRadius: 3, padding: "0 3px" }}>forming</span>}
    </span>
  );
}

export function ChEpisodeLensPanel({ tf = "H1" }: { tf?: string }) {
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  useEffect(() => { loadSimOhlc(tf).then((d) => setBars(d?.bars || null)); }, [tf]);
  const lens: EpisodeLensOutput | null = useMemo(() => (bars && bars.length ? chEpisodeLens(bars, tf as never) : null), [bars, tf]);

  return (
    <div className="pc" style={{ marginTop: 12, borderColor: "#1c4a5b" }}>
      <div className="pc-h cyan"> CH Episode Lens <span className="mut">L2 · CH_AUTH_1 · observer · {tf} Structural description, not a signal or forecast</span></div>
      {!lens ? <div className="pmut psm">Loading tape {tf}…</div> : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: TK.cyan }}>{lens.vocabulary_label}</div>
            <span className="pmut psm" style={{ marginLeft: "auto" }}>{lens.episode_context}</span>
          </div>

          {lens.forming_leg && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(227,162,58,.08)", border: "1px solid #5a3a18", borderRadius: 8, padding: "6px 9px", marginBottom: 8 }}>
              <span className="pmut psm">Provisional current leg:</span>
              <Chip e={lens.forming_leg} active />
              <span className="pmut psm" style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)" }}>range {lens.forming_leg.attrs.range_atr} ATR · body {lens.forming_leg.attrs.body_ratio} · {lens.forming_leg.attrs.duration_bars} bars</span>
            </div>
          )}

          <div className="pmut psm" style={{ marginBottom: 4 }}>Confirmed episode sequence, oldest first:</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {lens.recent_episodes.length ? lens.recent_episodes.map((e, i) => <Chip key={e.episode_id} e={e} active={i === lens.recent_episodes.length - 1} />) : <span className="pmut psm">Not enough confirmed swings.</span>}
          </div>

          {lens.active_episode && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1px 16px", borderTop: "1px solid #14202c", paddingTop: 7 }}>
              <div className="pkv"><span>Confirmed kind</span><b style={{ color: (KIND_STYLE[lens.active_episode.kind] || KIND_STYLE.UNCLASSIFIED).c }}>{lens.active_episode.kind}</b></div>
              <div className="pkv"><span>impulse strength</span><b>{lens.active_episode.attrs.impulse_strength}</b></div>
              <div className="pkv"><span>pullback depth</span><b>{lens.active_episode.attrs.pullback_depth ?? "—"}</b></div>
              <div className="pkv"><span>duration</span><b>{lens.active_episode.attrs.duration_bars} bars</b></div>
            </div>
          )}

          <div className="pfoot" style={{ marginTop: 8 }}>{lens.note} Descriptive geometry. Its structural vocabulary is separate from outcome probabilities.</div>
        </>
      )}
    </div>
  );
}
