// EpisodeLens — the CH Episode Lens subpanel: shows WHICH episode the market is in right now (big state badge),
// a per-bar episode-state ribbon, the signed episode-strength oscillator, the recent episode timeline, and a
// detailed "how it works" explainer (this is our proprietary indicator). Takes a precomputed EpisodeResult so the
// main chart tint and this panel share one causal computation. CONTEXT/advisory only — an episode is not a signal.
import { useState } from "react";
import { EPISODE_META, EPISODE_STATES, type EpisodeResult } from "../lib/blocks/chEpisode.ts";
import { RegimeRibbon } from "./RegimeRibbon.tsx";

const BANDS = Object.fromEntries(EPISODE_STATES.map((s) => [EPISODE_META[s].code, { label: EPISODE_META[s].label, color: EPISODE_META[s].color }]));

export function EpisodeLens({ ep, i, start, end, window, onWindow, W = 900 }: { ep: EpisodeResult; i: number; start: number; end: number; window: number; onWindow: (w: number) => void; W?: number }) {
  const [explain, setExplain] = useState(false);
  const code = ep.state.slice(start, end).map((s) => EPISODE_META[s].code);
  const cur = ep.state[i] ?? "RANGE", cm = EPISODE_META[cur];
  const seg = ep.segments.find((s) => i >= s.start && i <= s.end);
  const lenNow = seg ? i - seg.start + 1 : 1;
  const recent = ep.segments.filter((s) => s.start <= i).slice(-6);
  const sNow = ep.score[i] ?? 0;

  const H = 60, yS = (v: number) => H / 2 - Math.max(-1, Math.min(1, v)) * (H / 2 - 6);
  const sl = ep.score.slice(start, end);
  const oline = sl.map((v, k) => `${((k + 0.5) * (W / Math.max(1, sl.length))).toFixed(1)},${yS(v).toFixed(1)}`).join(" ");
  const phx = (i - start + 0.5) * (W / Math.max(1, end - start));

  return (
    <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", border: "1px solid " + (cm.color) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12, color: "#9fd0ff" }}> CH Episode Lens</b>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: cm.color + "22", border: `1px solid ${cm.color}`, borderRadius: 6, padding: "1px 9px" }}>
          <span style={{ fontSize: 15, color: cm.color }}>{cm.icon}</span>
          <b style={{ fontSize: 13, color: cm.color }}>{cm.label}</b>
        </span>
        <span className="pmut" style={{ fontSize: 10 }}>episode #{seg?.id ?? 0} length {lenNow}  bars, strength {sNow >= 0 ? "+" : ""}{sNow.toFixed(2)}</span>
        <label className="pmut" style={{ fontSize: 9.5, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>window {window}
          <input type="range" min={5} max={60} value={window} onChange={(e) => onWindow(parseInt(e.target.value))} style={{ width: 90 }} />
        </label>
      </div>

      <div style={{ marginTop: 6 }}>
        <RegimeRibbon view={{ code, bands: BANDS }} label="Episode" atIndex={i - start} W={W} H={18} />
      </div>

      <div style={{ marginTop: 4 }}>
        <div className="pmut" style={{ fontSize: 9, marginBottom: 2 }}>Episode strength, from negative to positive direction</div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: 60, background: "#0b0f15", borderRadius: 4 }}>
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#3a4452" strokeWidth={0.7} strokeDasharray="3 3" />
          <line x1={0} y1={yS(0.45)} x2={W} y2={yS(0.45)} stroke="#21d07a" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />
          <line x1={0} y1={yS(-0.45)} x2={W} y2={yS(-0.45)} stroke="#f7768e" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />
          <polyline points={oline} fill="none" stroke={cm.color} strokeWidth={1.4} />
          <line x1={phx} y1={0} x2={phx} y2={H} stroke="#fff" strokeWidth={0.8} opacity={0.5} />
        </svg>
      </div>

      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
        {recent.map((s) => { const m = EPISODE_META[s.state], len = Math.min(s.len, i - s.start + 1); return (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, background: m.color + "1a", border: `1px solid ${m.color}55`, borderRadius: 5, padding: "1px 6px", color: m.color }} title={m.note}>
            <b>{m.icon} {m.label}</b><span className="pmut" style={{ fontSize: 8.5 }}>{len}n</span>
          </span>
        ); })}
      </div>

      <button onClick={() => setExplain((v) => !v)} style={{ marginTop: 8, background: "transparent", border: "1px solid #2a4a55", color: "#9fd0ff", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}> Inspect the mechanism {explain ? "▾" : "▸"}</button>
      {explain && <EpisodeExplain cur={cur} />}

      <div className="pmut" style={{ fontSize: 9, marginTop: 6, fontStyle: "italic" }}>{cm.icon} {cm.note}Causal episode approximation for reference context. No entry or execution authority.</div>
    </div>
  );
}

function EpisodeExplain({ cur }: { cur: string }) {
  const Hd = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 11, fontWeight: 800, color: "#9fd0ff", marginTop: 10, marginBottom: 3 }}>{children}</div>;
  const P = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 10.5, color: "var(--mfe-text2)", lineHeight: 1.65, marginBottom: 3 }}>{children}</div>;
  const Code = ({ children }: { children: React.ReactNode }) => <span style={{ fontFamily: "var(--mfe-mono)", fontSize: 10, background: "#0b0f15", border: "1px solid #1c2632", borderRadius: 4, padding: "0 4px", color: "#e3b341" }}>{children}</span>;
  return (
    <div style={{ marginTop: 6, padding: "8px 12px", background: "#0b0f15", border: "1px solid #1c2632", borderRadius: 8 }}>
      <Hd>1. Episode observation</Hd>
      <P>The observer evaluates <b>recent multi-bar structure</b> to classify a phase such as directional movement, expansion, contraction, pullback or range. <b>The phase is a descriptive label</b> with the limitations below.</P>

      <Hd>2. Components</Hd>
      <P><b>Body accumulation:</b> Sum the candle bodies <Code>Close − Open</Code> over the configured <b>W</b> bar window. Positive and negative values describe net body direction.</P>
      <P><b>ATR normalization:</b> chia run cho <Code>ATR × W × 0.5</Code> emits <b>episode strength</b> within <Code>−1 … +1</Code>. ATR scaling adjusts the contribution of large bars across volatility levels.</P>
      <P><b>Expansion and pullback:</b> <Code>ATR(14) / SMA(ATR,50)</Code> Compare current volatility with its 50-bar baseline, then compare the recent half-window with the full directional run. <b>against</b> the longer run to describe a pullback.</P>

      <Hd>3. State priority</Hd>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", fontSize: 10.5, margin: "2px 0 4px" }}>
        {EPISODE_STATES.map((s) => { const m = EPISODE_META[s]; const rule = s === "RUN_UP" ? "strength ≥ +0.45" : s === "RUN_DOWN" ? "strength ≤ −0.45" : s === "PULLBACK" ? "Absolute strength at least 0.2, with the recent half-window moving against it" : s === "EXPANSION" ? "expansion ≥ 1.25" : s === "CONTRACTION" ? "expansion ≤ 0.8" : "Remaining unclassified observations"; return (
          <div key={s} style={{ display: "contents" }}>
            <div style={{ color: m.color, fontWeight: 800, whiteSpace: "nowrap", background: cur === s ? m.color + "22" : "transparent", borderRadius: 4, padding: "0 4px" }}>{m.icon} {m.label}</div>
            <div style={{ color: "var(--mfe-text2)" }}><Code>{rule}</Code> — {m.note}</div>
          </div>
        ); })}
      </div>
      <P>Priority runs from directional movement to pullback, expansion/contraction and range. Adjacent bars with the same state form an <b>episode</b> episode with an index and duration.</P>

      <Hd>4. Interpretation</Hd>
      <P>· <b style={{ color: EPISODE_META.RUN_UP.color }}>RUN_UP / RUN_DOWN</b>: describes a directional phase, not an entry signal.<br />· <b style={{ color: EPISODE_META.CONTRACTION.color }}>CONTRACTION</b>: describes measured contraction. It does not establish a future breakout.<br />· <b style={{ color: EPISODE_META.EXPANSION.color }}>EXPANSION</b>: describes current volatility expansion.<br />· <b style={{ color: EPISODE_META.PULLBACK.color }}>PULLBACK</b>: describes a pullback within the longer directional run.<br />· <b style={{ color: EPISODE_META.RANGE.color }}>RANGE</b>: no directional structural classification.<br />Episode duration records how long the phase has persisted; it is not an exhaustion probability.</P>

      <Hd>5. Combined structural context</Hd>
      <P>A standard indicator often measures <b>one</b> component. This observer <b>combines</b> direction, expansion/contraction and pullback into <b>a descriptive state</b>. It is a Candle Hierarchy approximation, with <b>causal</b> causal access to observations through the evaluated bar.</P>

      <Hd>6. Limitations</Hd>
      <P>This is an <b>approximation</b> of episode structure. The thresholds <Code>0.45 / 0.2 / 1.25 / 0.8</Code> are heuristic and <b>not</b> OOS-optimized. Keep the output as reference context in <b>SHADOW</b> Shadow until its separate walk-forward and stability checks. It creates no execution authority.</P>
    </div>
  );
}
