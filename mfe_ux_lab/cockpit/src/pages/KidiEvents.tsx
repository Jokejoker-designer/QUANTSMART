// KidiEvents — one page listing every event KIDI witnesses on the loaded tape.
// KIDI = flatness / frozen-feed witness (zero-variance / range-zero); a BLOCK-severity event is what
// makes L0 kidi_cleanliness BLOCK → no GOOD_FIT downstream. Read-only · advisory · diagnostic.
import { useEffect, useMemo, useState } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { TK } from "../components/ui/Ui.tsx";
import { loadSimOhlc, SIM_TFS } from "../adapters/loadSimOhlc.ts";
import { mt5Bars, liveSymbol, isOffline as mtOffline } from "../lib/mt5DemoAdapter.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { kidiScan, kidiSummary, type KidiEvent, type KidiType, type KidiSeverity } from "../lib/kidiEvents.ts";

const TYPE_COLOR: Record<KidiType, string> = { FROZEN_FEED: TK.red, RANGE_ZERO: TK.yellow, DATA_GAP: TK.orange };
const TYPE_LABEL: Record<KidiType, string> = { FROZEN_FEED: "Frozen feed", RANGE_ZERO: "Range zero", DATA_GAP: "Data gap" };
const SEV_COLOR: Record<KidiSeverity, string> = { WARN: TK.yellow, BLOCK: TK.red };

export function KidiEvents() {
  const [tf, setTf] = useState("M15");
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"Live" | "Replay">("Live");
  const [isLive, setIsLive] = useState(false);
  // KIDI runs the SAME witness (kidiScan) on whatever tape it's fed → feed LIVE GOLD.i# bars when source=Live.
  useEffect(() => {
    setLoading(true);
    if (source === "Replay") { setIsLive(false); loadSimOhlc(tf).then((d) => { setBars(d?.bars || null); setLoading(false); }); return; }
    let off = false;
    const pull = async () => {
      const r = await mt5Bars(liveSymbol(getActiveSymbol()), tf, 1000);
      if (off) return;
      if (!mtOffline(r) && ((r as { bars?: OhlcBar[] }).bars || []).length >= 2) { setBars((r as { bars: OhlcBar[] }).bars); setIsLive(true); setLoading(false); }
      else { setIsLive(false); loadSimOhlc(tf).then((d) => { if (!off) { setBars(d?.bars || null); setLoading(false); } }); }
    };
    pull(); const id = setInterval(pull, 5000);
    return () => { off = true; clearInterval(id); };
  }, [tf, source]);

  const events = useMemo(() => (bars ? kidiScan(bars) : []), [bars]);
  const sum = useMemo(() => kidiSummary(events), [events]);
  const span = bars && bars.length ? bars[0].t.slice(0, 10) + " → " + bars[bars.length - 1].t.slice(0, 10) : "—";

  const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div style={{ flex: 1, minWidth: 120, background: "#0b141e", border: "1px solid " + TK.border, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: TK.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "var(--font-mono, monospace)" }}>{value}</div>
    </div>
  );

  return (
    <div className="cm" style={{ fontSize: 13 }}>
      <div className="mfe-pillbar" style={{ marginBottom: 12 }}>
        <span className="auth lock">KIDI WITNESS</span><span className="auth lock">DIAGNOSTIC ONLY</span>
        <span className="auth warn">FLATNESS / FROZEN-FEED, NOT A GAP DETECTOR</span>
        <span className="auth" style={{ background: isLive ? "rgba(33,208,122,.14)" : "rgba(157,92,255,.12)", color: isLive ? TK.green : TK.purple, border: "1px solid " + (isLive ? TK.green : TK.purple), fontWeight: 700 }}>{isLive ? "● LIVE " + liveSymbol(getActiveSymbol()) : "REPLAY · sim"}</span>
      </div>

      <div className="pc" style={{ marginBottom: 12 }}>
        <div className="pc-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>◧ KIDI Events <span style={{ fontSize: 11, color: TK.muted, fontWeight: 400 }}>— events measured on the selected tape</span></span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {(["Live", "Replay"] as const).map((s) => <button key={s} onClick={() => setSource(s)} style={{ background: source === s ? (s === "Live" ? TK.green : TK.purple) : "transparent", color: source === s ? "#06101a" : TK.text2, border: "1px solid " + (source === s ? (s === "Live" ? TK.green : TK.purple) : TK.border), borderRadius: 5, padding: "2px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{s}</button>)}
            <span style={{ width: 8 }} />
            {SIM_TFS.map((t) => <button key={t} onClick={() => setTf(t)} style={{ background: tf === t ? TK.cyan : "transparent", color: tf === t ? "#06101a" : TK.text2, border: "1px solid " + (tf === t ? TK.cyan : TK.border), borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{t}</button>)}
          </span>
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 12, color: TK.text2, marginBottom: 10 }}>{loading ? "Loading…" : (bars ? bars.length.toLocaleString() + " bars · " + span : "no data")}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <Stat label={"Total events"} value={sum.total} color={sum.total ? TK.cyan : TK.green} />
            <Stat label="Frozen feed" value={sum.frozen} color={sum.frozen ? TK.red : TK.muted} />
            <Stat label="Range zero" value={sum.rangeZero} color={sum.rangeZero ? TK.yellow : TK.muted} />
            <Stat label="Data gap" value={sum.gap} color={sum.gap ? TK.orange : TK.muted} />
            <Stat label={"Blocking observations"} value={sum.blocks} color={sum.blocks ? TK.red : TK.green} />
          </div>
        </div>
      </div>

      <div className="pc">
        <div className="pc-h">Event details</div>
        <div style={{ padding: 12 }}>
          {loading ? <div style={{ color: TK.muted }}>…</div> : events.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: TK.green, fontSize: 13 }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <span>No KIDI observations in this tape {tf} within the flat-feed and zero-range checks. This is not a general feed certification.</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ position: "sticky", top: 0, background: "#0b141e", color: TK.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {["#", "Time (UTC)", "Type", "Severity", "Span", "Details"].map((h) => <th key={h} style={{ padding: "5px 8px", borderBottom: "1px solid " + TK.border }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {events.map((e: KidiEvent, k) => (
                    <tr key={e.i + "_" + e.type} style={{ borderBottom: "1px solid #14202c" }}>
                      <td style={{ padding: "4px 8px", color: TK.muted }}>{k + 1}</td>
                      <td style={{ padding: "4px 8px", color: TK.text, fontFamily: "var(--font-mono, monospace)" }}>{e.t.replace("T", " ")}</td>
                      <td style={{ padding: "4px 8px" }}><span style={{ color: TYPE_COLOR[e.type], fontWeight: 600 }}>{TYPE_LABEL[e.type]}</span></td>
                      <td style={{ padding: "4px 8px" }}><span style={{ color: SEV_COLOR[e.severity], fontWeight: 700, fontSize: 11 }}>{e.severity}</span></td>
                      <td style={{ padding: "4px 8px", color: TK.text2 }}>{e.span}</td>
                      <td style={{ padding: "4px 8px", color: TK.text2 }}>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ fontSize: 11, color: TK.muted, marginTop: 10, lineHeight: 1.5 }}>
            KIDI witnesses <b>flat or frozen feeds</b> through repeated closes and zero high/low ranges. A blocking observation <b style={{ color: TK.red }}>BLOCK</b> affects the registered L0 integrity boundary <code>kidi_cleanliness</code> . Timestamp gaps are a separate feed-integrity check. Diagnostic only.
          </div>
        </div>
      </div>
    </div>
  );
}
