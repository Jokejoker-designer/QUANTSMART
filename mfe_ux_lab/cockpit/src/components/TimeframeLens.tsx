// TimeframeLens — L2 subpanel showing the SAME fusion module evaluated on M5/M15/H1/H4/D1 (latest closed bar per
// TF, reusing the builder's tfHeat), so you see at a glance whether the timeframes are ALIGNED (đồng pha → stronger
// context) or DIVERGENT (lệch pha → short vs long conflict). CONTEXT/advisory only — alignment is not a trade signal.
export function TimeframeLens({ tf, W: _W = 900 }: { tf: { tf: string; val: number }[]; W?: number }) {
  const vals = tf.filter((t) => isFinite(t.val));
  const ups = vals.filter((t) => t.val > 0.05).length, downs = vals.filter((t) => t.val < -0.05).length;
  const verdict = !vals.length ? { t: "—", c: "var(--mfe-muted)" }
    : ups >= Math.ceil(vals.length * 0.6) && ups > downs ? { t: "Timeframes aligned upward", c: "#21d07a" }
    : downs >= Math.ceil(vals.length * 0.6) && downs > ups ? { t: "Timeframes aligned downward", c: "#f7768e" }
    : { t: "Timeframes disagree", c: "#e3b341" };
  const agree = vals.length ? Math.round((Math.max(ups, downs) / vals.length) * 100) : 0;
  const grp = (ks: string[]) => { const g = tf.filter((t) => ks.includes(t.tf) && isFinite(t.val)); return g.length ? g.reduce((s, t) => s + t.val, 0) / g.length : NaN; };
  const sV = grp(["M5", "M15"]), lV = grp(["H4", "D1"]);
  const split = isFinite(sV) && isFinite(lV) && Math.sign(sV) !== Math.sign(lV) && Math.abs(sV) > 0.05 && Math.abs(lV) > 0.05;

  return (
    <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", border: "1px solid " + (verdict.c) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12, color: "#9fd0ff" }}> Timeframe Lens</b>
        <span style={{ fontSize: 13, fontWeight: 800, color: verdict.c }}>{verdict.t}</span>
        <span className="pmut" style={{ fontSize: 10 }}>{Math.max(ups, downs)}/{vals.length} timeframes with matching direction {agree}%</span>
        {split && <span style={{ fontSize: 10, color: "#e3b341" }}>short-term and long-term disagreement</span>}
      </div>
      <div style={{ marginTop: 6 }}>
        {tf.map((t) => { const ok = isFinite(t.val), v = ok ? Math.max(-1, Math.min(1, t.val)) : 0, c = !ok ? "#3a4452" : v > 0.05 ? "#21d07a" : v < -0.05 ? "#f7768e" : "#5b6b7d"; return (
          <div key={t.tf} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
            <span style={{ width: 34, fontSize: 10.5, fontWeight: 700, color: "#cdd6df" }}>{t.tf}</span>
            <div style={{ flex: 1, position: "relative", height: 12, background: "#0b0f15", borderRadius: 3 }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#3a4452" }} />
              <div style={{ position: "absolute", top: 1, bottom: 1, borderRadius: 2, background: c, ...(v >= 0 ? { left: "50%", width: `${Math.abs(v) * 50}%` } : { right: "50%", width: `${Math.abs(v) * 50}%` }) }} />
            </div>
            <span style={{ width: 48, textAlign: "right", fontFamily: "var(--mfe-mono)", fontSize: 10, color: c }}>{ok ? (v >= 0 ? "+" : "") + t.val.toFixed(2) : "—"}</span>
          </div>
        ); })}
      </div>
      <div className="pmut" style={{ fontSize: 9, marginTop: 5, fontStyle: "italic" }}>Evaluates the module on each stated timeframe's completed bars. Agreement is context, not independent evidence of an edge.</div>
    </div>
  );
}
