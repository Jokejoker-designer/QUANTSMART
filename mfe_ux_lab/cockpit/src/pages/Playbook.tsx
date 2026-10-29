// Playbook — TWO separated collections (manager: "phải chia ra"):
//  §1 Foundation v1 — the honest base: AVOID map (sure) + candidate zones (hypotheses, NOT proven edges).
//  §2 Market-Instability signals — a library of the 11y's most unstable episodes + a LIVE "this moment
//     resembles which unstable period -> stand aside" match. Both REPORT_ONLY / advisory.
import { useEffect, useMemo, useState } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import "./cotrade.css";
import { mt5Advice, liveSymbol, isOffline as mtOffline, getLiveSymbolOverride, setLiveSymbolOverride } from "../lib/mt5DemoAdapter.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { computeInstabilityFeatures, episodePeakFeatures, instSimilarity, instabilityScore, INST_KEYS, INST_LABEL, type InstFeatures } from "../lib/marketInstabilityFeatures.ts";
import { InfoTip } from "../components/ui/Ui.tsx";
import { legacyDisplayCopy } from "../lib/legacyDisplayCopy.ts";

// compute the LIVE "this moment" instability from the real advisor (shock/danger/black-swan), + nearest episode
const _n = (v: any) => (v == null || isNaN(+v) ? 0 : +v);
function computeLiveNow(adv: any, lib: InstLib | null): NowInst {
  const reg = adv.regime || {};
  const shock = _n(reg.shock_regime_gauge), danger = _n(adv.danger_score), swan = _n(adv.blackswan?.blackswan_risk);
  const score = Math.round((shock * 0.5 + danger * 0.3 + swan * 0.2) * 1000) / 1000;
  const band = score >= 0.6 ? "UNSTABLE" : score >= 0.38 ? "ELEVATED" : "STABLE";
  const verdict = band === "UNSTABLE" ? "STAND_ASIDE" : band === "ELEVATED" ? "CAUTION" : "NORMAL";
  const advice = band === "UNSTABLE" ? "Market structure is highly unstable — stand aside and avoid entering mid-storm." : band === "ELEVATED" ? "Instability elevated — reduce size and wait for stabilization." : "Normal conditions — follow standard plan.";
  let nearest: NowInst["nearest"] = null;
  if (lib && lib.episodes && lib.episodes.length) {
    const e = [...lib.episodes].sort((a, b) => Math.abs(a.peak_score - score) - Math.abs(b.peak_score - score))[0];
    nearest = { label: e.label, similarity: Math.max(0, Math.min(1, 1 - Math.abs(e.peak_score - score))), realized_storm_atr: e.realized_storm_atr };
  }
  return { t: String(adv.as_of || "").replace("T", " ").slice(0, 16) + " UTC", instability_score: score, band, verdict, advice, nearest };
}

const SIDE_COLOR: Record<string, string> = { LONG: "#3fb950", SHORT: "#f85149" };
const BAND: Record<string, { c: string; vi: string }> = {
  UNSTABLE: { c: "#f85149", vi: "UNSTABLE" }, ELEVATED: { c: "#db6d28", vi: "ELEVATED" }, STABLE: { c: "#3fb950", vi: "STABLE" },
};
const DOM_VI: Record<string, string> = {
  vol_pct: "Extreme volatility", reversal: "Continuous whipsaw reversals", spike: "Outlier bar spikes", range_atr_n: "Abnormal range expansion",
};
const HUMAN: Record<string, string> = {
  "session DEAD HOUR": "Dead Hour (thin liquidity)", "regime CHOP": "Choppy Regime", "path quality WHIPSAW": "Whipsaw Price Path",
  DEAD_HOUR: "Dead Hour", NEWS_WINDOW: "News Window",
};
const hz = (s: string) => HUMAN[s] || s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

interface AvoidCell { where: string; net_R: number | null; n: number | null; lesson: string }
interface Candidate { strategy: string; side: string; side_color: string; zones: string[]; n_signals: number }
interface Foundation { built: string; version: string; n_promotable: number; avoid: { hours: string[]; cells: AvoidCell[]; caveat: string }; candidate_zones: Candidate[]; honest_note: string }
interface Episode { id: string; label: string; start: string; end: string; peak_score: number; realized_storm_atr: number; dominant: string; note: string }
interface InstLib { tf: string; n_episodes: number; p98_threshold: number; episodes: Episode[]; honest_note: string }
interface NowInst { t: string; instability_score: number; band: string; verdict: string; advice: string; nearest: { label: string; similarity: number; realized_storm_atr: number } | null }
interface Validation { horizon_hours: number; auc_score_predicts_forward_shock: number; auc_current_vol_baseline: number; adds_over_coincident_vol: number; precision_at_elevated: number; recall_of_shocks: number; lead_hours_median: number; honest_read: string; caveat: string }

export function Playbook() {
  const [fnd, setFnd] = useState<Foundation | null>(null);
  const [lib, setLib] = useState<InstLib | null>(null);
  const [staticNow, setStaticNow] = useState<NowInst | null>(null);
  const [liveAdv, setLiveAdv] = useState<any>(null);
  const [val, setVal] = useState<Validation | null>(null);
  const [missing, setMissing] = useState(false);
  const [h4, setH4] = useState<OhlcBar[] | null>(null);   // for the transparent multi-feature instability match

  useEffect(() => {
    Promise.all([
      fetch("data/top5/playbook_foundation_v1.json").then((r) => (r.ok ? r.json() : null)),
      fetch("data/top5/instability_library.json").then((r) => (r.ok ? r.json() : null)),
      fetch("data/top5/now_instability.json").then((r) => (r.ok ? r.json() : null)),
      fetch("data/top5/instability_validation.json").then((r) => (r.ok ? r.json() : null)),
    ]).then(([f, l, n, v]) => { if (!f && !l) { setMissing(true); return; } setFnd(f); setLib(l); setStaticNow(n); setVal(v); });
  }, []);
  // LIVE "this moment" — poll the real advisor every 15s so the instability banner reflects the live feed
  const [liveReason, setLiveReason] = useState<string>("");
  const [symDraft, setSymDraft] = useState<string>(getLiveSymbolOverride());
  const [symTick, setSymTick] = useState(0);   // bump → re-poll ngay khi đổi symbol
  useEffect(() => {
    let off = false;
    const pull = async () => {
      const sym = liveSymbol(getActiveSymbol());
      const r = await mt5Advice(sym, "H1", "");
      if (off) return;
      if (!mtOffline(r) && (r as { ok?: boolean }).ok && (r as { advice?: unknown }).advice) { setLiveAdv((r as { advice: unknown }).advice); setLiveReason(""); }
      else { setLiveAdv(null); setLiveReason(mtOffline(r) ? "Data bridge unavailable at 127.0.0.1:8787" : `${sym}: ${(r as { reason?: string }).reason || "advice ok:false"}`); }
    };
    pull(); const id = setInterval(pull, 15000);
    return () => { off = true; clearInterval(id); };
  }, [symTick]);
  // H4 tape (live-backfilled) → the transparent instability fingerprint for NOW + each episode's peak
  useEffect(() => { loadSimOhlc("H4", true).then((d) => setH4(d?.bars || null)); }, []);
  const nowFeat = useMemo(() => (h4 && h4.length > 40 ? computeInstabilityFeatures(h4, h4.length - 1) : null), [h4]);
  // TRANSPARENT instability score from the OHLC features (recomputable) — used as the PRIMARY read; advisor blend = secondary.
  const transp = useMemo(() => {
    if (!nowFeat) return null;
    const score = instabilityScore(nowFeat);
    const band = score >= 0.6 ? "UNSTABLE" : score >= 0.38 ? "ELEVATED" : "STABLE";
    return { score, band };
  }, [nowFeat]);
  const matches = useMemo(() => {
    if (!h4 || !lib || !nowFeat) return [] as { label: string; peak_score: number; feat: InstFeatures; sim: number }[];
    return lib.episodes.map((e) => { const pk = episodePeakFeatures(h4, e.start, e.end); return pk ? { label: e.label, peak_score: e.peak_score, feat: pk.feat, sim: instSimilarity(nowFeat, pk.feat).similarity } : null; })
      .filter((x): x is { label: string; peak_score: number; feat: InstFeatures; sim: number } => !!x).sort((a, b) => b.sim - a.sim);
  }, [h4, lib, nowFeat]);
  const bestMatch = matches[0] ?? null;
  const matchByLabel = useMemo(() => new Map(matches.map((m) => [m.label, m])), [matches]);
  // HONEST match quality: near-tie among the top → NO clear analog; big per-feature gaps → what makes NOW different.
  const matchInfo = useMemo(() => {
    if (!nowFeat || !bestMatch) return null;
    const sim = bestMatch.sim;
    const strength: "STRONG" | "WEAK" | "NONE" = sim >= 0.9 ? "STRONG" : sim >= 0.82 ? "WEAK" : "NONE";
    const nearTie = matches.length >= 3 && matches[0].sim - matches[2].sim < 0.02;
    const gaps = INST_KEYS.map((k) => ({ k, d: Math.abs(nowFeat[k] - bestMatch.feat[k]) })).filter((g) => g.d >= 0.22).sort((a, b) => b.d - a.d);
    const clear = strength === "STRONG" && !nearTie;
    return { sim, strength, nearTie, gaps, clear };
  }, [nowFeat, bestMatch, matches]);

  if (missing) return <div className="co-card"><div className="empty">Playbook collections not found at <span className="mono">data/top5/</span> — run the build.</div></div>;
  if (!fnd && !lib) return <div className="co-card">Loading…</div>;
  const isLive = !!liveAdv;
  const now: NowInst | null = liveAdv ? computeLiveNow(liveAdv, lib) : staticNow;
  const nb = now ? BAND[now.band] ?? BAND.STABLE : null;
  // banner PREFERS the transparent OHLC score (recomputable); advisor blend = secondary + disagreement flagged.
  const effBand = transp?.band ?? now?.band ?? null;
  const effScore = transp?.score ?? now?.instability_score ?? null;
  const eb = effBand ? BAND[effBand] ?? BAND.STABLE : null;
  const effVerdict = effBand === "UNSTABLE" ? "STAND_ASIDE" : effBand === "ELEVATED" ? "CAUTION" : "NORMAL";
  const effAdvice = effBand === "UNSTABLE" ? "Market structure is highly unstable — stand aside and avoid entering mid-storm." : effBand === "ELEVATED" ? "Instability elevated — reduce size and wait for stabilization." : "Normal conditions — follow standard plan.";
  const advisorGap = (transp && now) ? +(now.instability_score - transp.score).toFixed(3) : null;

  return (
    <div className="cotrade">
      <div className="co-topbar">
        <span className="co-lock">PLAYBOOK · REPORT-ONLY · ADVISORY / AUDIT · NO WIN-RATE PROMISE</span>
        <span className="small co-mut" style={{ marginLeft: "auto" }}>Market Risk Playbook · Instability Monitor + Foundation Avoid Map</span>
      </div>

      {/* LIVE "this moment" instability banner — PRIMARY = transparent OHLC score */}
      {(now || transp) && eb && effBand && (
        <div className="co-card" style={{ borderColor: eb.c, background: effBand === "UNSTABLE" ? "#2a1416" : effBand === "ELEVATED" ? "#241a10" : "#10220f" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22 }}>{effBand === "UNSTABLE" ? "🛑" : effBand === "ELEVATED" ? "⚠️" : "✅"}</span>
            <div>
              <div style={{ fontWeight: 800, color: eb.c, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Current Market State: {eb.vi}
                <span className="co-mut" style={{ fontSize: 12, fontWeight: 400 }}>(score {effScore}{transp ? " · OHLC" : ""}{now ? " · " + now.t : ""})</span>
                <span title={isLive ? "" : "Reason: " + (liveReason || "no live advice")} style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: isLive ? "rgba(63,185,80,.18)" : "rgba(157,92,255,.15)", color: isLive ? "#3fb950" : "#9d5cff", border: "1px solid " + (isLive ? "#3fb950" : "#9d5cff") }}>{isLive ? "● LIVE " + liveSymbol(getActiveSymbol()) : "SIM"}</span>
                <InfoTip
                  title="Coincident Instability Score"
                  text="Computed transparently from causal H4 OHLC features (volatility, range, whipsaw, spike, choppiness, wick). Describes the current state (coincident), not a forward forecast."
                  bottom
                />
              </div>
              {!isLive && (
                <div style={{ marginTop: 4, fontSize: 10.5, color: "#c9a25a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span> Offline — {liveReason || "awaiting live advice"}.</span>
                  <span className="pmut">Broker Symbol Override (Market Watch):</span>
                  <input value={symDraft} onChange={(e) => setSymDraft(e.target.value)} placeholder={liveSymbol(getActiveSymbol())} style={{ background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 5, padding: "2px 6px", fontSize: 11, width: 110, fontFamily: "var(--mfe-mono)" }} />
                  <button onClick={() => { setLiveSymbolOverride(symDraft); setSymTick((t) => t + 1); }} style={{ background: "#1f6feb", color: "#fff", border: "none", borderRadius: 5, padding: "2px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Apply &amp; Retry</button>
                  {getLiveSymbolOverride() && <button onClick={() => { setLiveSymbolOverride(""); setSymDraft(""); setSymTick((t) => t + 1); }} style={{ background: "var(--mfe-s3)", color: "var(--mfe-muted)", border: "1px solid var(--mfe-border)", borderRadius: 5, padding: "2px 7px", fontSize: 10, cursor: "pointer" }}>Reset</button>}
                </div>
              )}
              <div className="small" style={{ marginTop: 2 }}>{effAdvice}</div>
              {advisorGap != null && Math.abs(advisorGap) >= 0.12 && now && (
                <div className="co-mut small" style={{ marginTop: 2, color: "#e3b341" }}> Advisor blend scored <b>{now.instability_score}</b> ({BAND[now.band]?.vi}) — <b>Δ {advisorGap > 0 ? "+" : ""}{advisorGap}</b> vs transparent OHLC score.</div>
              )}
              {bestMatch && matchInfo
                ? <div className="co-mut small" style={{ marginTop: 2 }}>
                    {matchInfo.clear
                      ? <>Structure closely resembles <b style={{ color: eb.c }}>{bestMatch.label}</b> ({Math.round(matchInfo.sim * 100)}%).</>
                      : <><b style={{ color: "#e3b341" }}>No clear historical analog</b> — nearest is <b>{bestMatch.label}</b> {Math.round(matchInfo.sim * 100)}%{matchInfo.nearTie ? " (top cluster within <2pp)" : ""}{matchInfo.gaps.length ? <>, diverging on <b>{matchInfo.gaps.slice(0, 2).map((g) => INST_LABEL[g.k]).join(", ")}</b></> : ""}.</>}
                  </div>
                : <div className="co-mut small" style={{ marginTop: 2 }}>Computing multi-feature fingerprint…</div>}
            </div>
            <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 4, background: eb.c + "22", color: eb.c, fontWeight: 800 }}>{effVerdict === "STAND_ASIDE" ? "STAND ASIDE" : effVerdict === "CAUTION" ? "CAUTION" : "NORMAL"}</span>
          </div>
        </div>
      )}

      {/* 🔬 Structural multi-feature match */}
      {nowFeat && bestMatch && (
        <div className="co-card" style={{ borderColor: "#2c5b8c" }}>
          <h3 style={{ margin: "2px 0 8px", fontSize: 15, color: "#e7eef6", display: "flex", alignItems: "center", gap: 8 }}>
            Structural Multi-Feature Analog Match
            <span className="co-mut" style={{ fontSize: 12, fontWeight: 400 }}>· 6 causal H4 OHLC features</span>
            <InfoTip
              title="6-Feature Structural Match"
              text="Compares current H4 volatility, range, whipsaw, spike, choppiness, and wick against historical shock peaks. Smaller Δ indicates closer structural similarity (Green <0.15 · Yellow <0.30 · Red ≥0.30)."
            />
          </h3>
          {matchInfo && (() => { const tone = matchInfo.clear ? "safe" : matchInfo.strength === "NONE" ? "danger" : "warn"; return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>Nearest Episode: <b style={{ color: "var(--accent-sky)", fontSize: 15 }}>{bestMatch.label}</b> · <b>{Math.round(matchInfo.sim * 100)}%</b></span>
              <span className={`mfe-status-pill ${tone}`}>{matchInfo.clear ? "STRONG ANALOG" : matchInfo.nearTie ? "AMBIGUOUS · NEAR-TIE" : "WEAK ANALOG"}</span>
              <span className="co-mut small">Top Analogs:</span>
              {matches.slice(0, 4).map((m) => <span key={m.label} className={`mfe-status-pill ${m.label === bestMatch.label ? "info" : ""}`}>{m.label} {Math.round(m.sim * 100)}%</span>)}
            </div>
          ); })()}
          <div style={{ display: "grid", gridTemplateColumns: "128px 1fr 1fr 44px", gap: "3px 10px", alignItems: "center", fontSize: 11.5 }}>
            <span className="co-mut" style={{ fontSize: 10 }}>FEATURE</span><span style={{ fontSize: 10, color: "#37c0ff", fontWeight: 700 }}>CURRENT</span><span style={{ fontSize: 10, color: "#e0a24e", fontWeight: 700 }}>{bestMatch.label}</span><span className="co-mut" style={{ fontSize: 10 }}>Δ</span>
            {INST_KEYS.map((k) => { const nv = nowFeat[k], ev = bestMatch.feat[k], d = Math.abs(nv - ev); const dc = d < 0.15 ? "#3fb950" : d < 0.3 ? "#e3b341" : "#f85149"; return (
              <div key={k} style={{ display: "contents" }}>
                <span>{INST_LABEL[k]}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ flex: 1, height: 7, background: "#1b2230", borderRadius: 3 }}><span style={{ display: "block", width: `${nv * 100}%`, height: "100%", background: "#37c0ff", borderRadius: 3 }} /></span><b className="mono" style={{ width: 30, fontSize: 10.5 }}>{nv.toFixed(2)}</b></span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ flex: 1, height: 7, background: "#1b2230", borderRadius: 3 }}><span style={{ display: "block", width: `${ev * 100}%`, height: "100%", background: "#e0a24e", borderRadius: 3 }} /></span><b className="mono" style={{ width: 30, fontSize: 10.5 }}>{ev.toFixed(2)}</b></span>
                <b className="mono" style={{ color: dc, fontSize: 11 }}>{d.toFixed(2)}</b>
              </div>
            ); })}
          </div>
        </div>
      )}

      {/* divider: everything below is HISTORICAL reference (not live) */}
      {(lib || fnd) && <div style={{ fontSize: 10.5, color: "#8b949e", fontWeight: 700, letterSpacing: ".5px", margin: "8px 2px 2px", borderTop: "1px solid #232c38", paddingTop: 8 }}>↓ HISTORICAL REFERENCE · 11-YEAR ARCHIVE (2015–2025)</div>}

      {/* ───────── §1 MARKET-INSTABILITY COLLECTION ───────── */}
      {lib && (
        <div className="co-card">
          <h3 style={{ margin: "2px 0 8px", fontSize: 15, color: "#e7eef6", display: "flex", alignItems: "center", gap: 8 }}>
            Market Instability Monitor · {lib.n_episodes} Historical Shock Episodes
            <span className="co-mut" style={{ fontSize: 12, fontWeight: 400 }}>({lib.tf} · top-2% score)</span>
            <InfoTip
              title="Historical Shock Library"
              text="Catalog of the most unstable episodes across 11 years. Used for coincident storm detection so you stand aside during active market turbulence rather than predicting future shocks."
            />
          </h3>

          {/* honest measurement: does it warn AHEAD? */}
          {val && (
            <div className="co-card" style={{ background: "#241a10", borderColor: "#db6d28", margin: "0 0 10px" }}>
              <div style={{ fontWeight: 700, color: "#e3b341", fontSize: 13 }}> Lead-Time Validation · Forward Forecast Check</div>
              <div className="small" style={{ marginTop: 4 }}>
                Forward {val.horizon_hours}h shock AUC: <b style={{ color: val.auc_score_predicts_forward_shock >= 0.55 ? "#3fb950" : "#f85149" }}>AUC {val.auc_score_predicts_forward_shock}</b>
                {" "}(coincident volatility baseline {val.auc_current_vol_baseline}; delta {val.adds_over_coincident_vol >= 0 ? "+" : ""}{val.adds_over_coincident_vol}).
                {" "}Precision at elevated threshold: <b style={{ color: "#f85149" }}>{Math.round(val.precision_at_elevated * 100)}%</b>.
              </div>
              <div className="small" style={{ marginTop: 4, color: "#f0c674", fontWeight: 600 }}>{legacyDisplayCopy(val.honest_read)}</div>
            </div>
          )}
          {lib.episodes.map((e) => {
            const w = Math.round(e.peak_score * 100);
            const m = matchByLabel.get(e.label);
            const isBest = bestMatch && e.label === bestMatch.label;
            return (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px", gap: 12, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #232c38", background: isBest ? "rgba(55,192,255,.06)" : undefined }}>
                <div style={{ fontWeight: 800, color: "#e7eef6" }}>{e.label}{isBest && <span style={{ marginLeft: 5, fontSize: 9, color: "#37c0ff", border: "1px solid #37c0ff", borderRadius: 3, padding: "0 3px" }}>≈NOW</span>}</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: "#1b2230", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${w}%`, height: "100%", background: w >= 80 ? "#f85149" : w >= 70 ? "#db6d28" : "#e3b341" }} /></div>
                    <span className="mono small" style={{ width: 64 }}>score {e.peak_score}</span>
                  </div>
                  <div className="co-mut small" style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{DOM_VI[e.dominant] ?? e.dominant} · {e.start} → {e.end}</span>
                    {m && <span style={{ display: "inline-flex", gap: 1.5, alignItems: "flex-end", height: 12 }} title={INST_KEYS.map((k) => `${INST_LABEL[k]} ${m.feat[k]}`).join(" · ")}>{INST_KEYS.map((k) => <span key={k} style={{ display: "inline-block", width: 4, height: `${Math.max(2, m.feat[k] * 12)}px`, background: "#5a7a9a", borderRadius: 1 }} />)}</span>}
                    {m && <span style={{ color: "#37c0ff", fontWeight: 700 }}>match {Math.round(m.sim * 100)}%</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}><b style={{ color: "#f85149" }}>{e.realized_storm_atr}×ATR</b><div className="co-mut small">storm range</div></div>
              </div>
            );
          })}
        </div>
      )}

      {/* ───────── §1 FOUNDATION v1 COLLECTION ───────── */}
      {fnd && (
        <>
          <div className="co-card" style={{ borderColor: "#8b3a38" }}>
            <h3 style={{ margin: "2px 0 6px", fontSize: 15, color: "#e7eef6", display: "flex", alignItems: "center", gap: 8 }}>
              Foundation Playbook v1 · Avoid Map
              <InfoTip title="Avoid Map Caveat" text={fnd.avoid.caveat} />
            </h3>
            <div className="small" style={{ marginBottom: 6 }}>Avoid Hours: {fnd.avoid.hours.length ? fnd.avoid.hours.map((h) => <span key={h} className="mfe-status-pill danger" style={{ marginRight: 5 }}>{hz(h)}</span>) : <span className="co-mut">—</span>}</div>
            {fnd.avoid.cells.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <b style={{ color: "var(--status-danger-text)", minWidth: 200 }}>{hz(c.where)}</b>
                <span className="mono small">net_R {c.net_R ?? "—"} · n {c.n ?? "—"}</span>
                <span className="co-mut small">{legacyDisplayCopy(c.lesson)}</span>
              </div>
            ))}
          </div>

          <div className="co-card">
            <h3 style={{ margin: "2px 0 4px", fontSize: 14, color: "var(--status-warn-text)" }}>Candidate Zones · Hypotheses (Test in Replay / Microscope)</h3>
            {fnd.candidate_zones.map((c, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ color: SIDE_COLOR[c.side] ?? "#94A3B8", fontWeight: 800, marginRight: 8 }}>{c.side}</span>
                <b>{c.strategy}</b> <span className="co-mut small">· {c.n_signals?.toLocaleString()} signals</span>
                <div className="small" style={{ marginTop: 4, display: "flex", gap: 5, flexWrap: "wrap" }}>{c.zones.length ? c.zones.map((z) => <span key={z} className="mfe-status-pill warn">{z}</span>) : <span className="co-mut">—</span>}</div>
              </div>
            ))}
          </div>

          <div className="co-card" style={{ background: "#10243f", borderColor: "#1f6feb" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#e7eef6", display: "flex", alignItems: "center", gap: 8 }}>
              Promotable Playbooks: <span style={{ color: "#f0a0b0" }}>{fnd.n_promotable}</span>
              <InfoTip title="Promotion Gate" text={fnd.honest_note} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
