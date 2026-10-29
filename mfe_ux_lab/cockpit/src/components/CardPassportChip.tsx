// CardPassportChip — WO-1B. A compact, read-only Card Passport summary for Strategy Lab. Derives the
// passport from the SAME realistic backtest the page already ran (deriveCardPassport, never evaluate()).
// Shows the honesty verdict (gate-capped), MetricValidityGate flags, key metrics, OOS, truth level and
// weaknesses — every number sourced from the real run. Presentation only · modeled · advisory · no order.
import { deriveCardPassport, type CardPassport, type PassportCardInput } from "../lib/cardPassport.ts";
import type { RealisticBacktest } from "../lib/realisticSimRun.ts";

const TRUST_TONE: Record<string, { cls: string; label: string }> = {
  ROBUST_IN_SIM: { cls: "good", label: "ROBUST_IN_SIM" },
  CONDITIONAL_EDGE: { cls: "early", label: "CONDITIONAL_EDGE" },
  FRAGILE_EDGE: { cls: "event", label: "FRAGILE_EDGE" },
  NO_EDGE_AFTER_COST: { cls: "avoid", label: "NO_EDGE_AFTER_COST" },
};

export function CardPassportChip({ bt, card }: { bt: RealisticBacktest | null; card: unknown }) {
  const p: CardPassport = deriveCardPassport({ card: (card ?? {}) as PassportCardInput, backtest: bt });

  if (p.status === "NEEDS_RUN") {
    return (
      <div className="pc">
        <div className="pc-h"> Card Passport <span className="mut r">Derived from the measured run</span></div>
        <span className="mfe-badge none"><span className="dot" />NEEDS_RUN</span>
        <span className="psm pmut" style={{ marginLeft: 8 }}>{p.needsRunReason}</span>
      </div>
    );
  }

  const m = p.metrics!, gate = p.metricValidity!, h = p.honesty!;
  const tone = TRUST_TONE[h.value] || { cls: "none", label: h.value };
  const oosTxt = `OOS ${String(p.oos!.value)}${p.oos!.positiveFraction != null ? " · " + Math.round(p.oos!.positiveFraction * 100) + "%" : ""}`;

  return (
    <div className="pc">
      <div className="pc-h"> Card Passport
        <span className="r" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className={"mfe-badge " + tone.cls}><span className="dot" />{tone.label}</span>
          {h.cappedFrom && <span className="pflag a">capped from {h.cappedFrom}</span>}
          <span className="pflag b">modeled</span>
        </span>
      </div>

      {/* key metrics — all source = realistic_backtest */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
        <span className="pflag g">n {m.n.value}</span>
        <span className="pflag a">loss {m.lossCount.value}</span>
        <span className="pflag b">netPF {m.netPF.value}</span>
        <span className={"pflag " + (m.netNetR.value >= 0 ? "g" : "r")}>net {m.netNetR.value >= 0 ? "+" : ""}{m.netNetR.value}R</span>
        <span className="pflag r">DD {m.maxDDNetR.value}R</span>
        <span className="pflag b">{oosTxt}</span>
        <span className="pflag b">{p.truthLevel!.value}</span>
      </div>

      {/* MetricValidityGate */}
      {gate.flags.length > 0 && (
        <div style={{ marginBottom: 7 }}>
          <span className="psm pmut" style={{ marginRight: 6 }}>Metric gate · <b style={{ color: gate.status === "INVALID_FOR_PROMOTION" ? "var(--mfe-red)" : "var(--mfe-orange)" }}>{gate.status}</b> ceiling {gate.maxClaimableTrust}:</span>
          {gate.flags.map((f) => <span key={f} className={"pflag " + (f === "NOT_VALID_FOR_PROMOTION" || f === "UNBOUNDED_PF" ? "r" : "a")}>{f}</span>)}
        </div>
      )}

      {/* weaknesses (top 3) */}
      {(p.weaknesses || []).length > 0 && (
        <div className="psm" style={{ color: "var(--mfe-text2)", lineHeight: 1.6 }}>
          {(p.weaknesses || []).slice(0, 3).map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}

      {p.operatingContext && (
        <div className="psm pmut" style={{ marginBottom: 4 }}> ctx <span className="pmono" style={{ color: "var(--mfe-cyan)" }}>{p.contextHash!.value}</span> · design_tf <b>{p.operatingContext.value.design_tf}</b> <span style={{ fontSize: 9 }}>({p.operatingContext.value.design_tf_source})</span> · path {p.operatingContext.value.path_tf} · {p.operatingContext.value.period}</div>
      )}
      <div className="pfoot">run {p.run_id!.value} values from <b>realistic_backtest</b> Each field has source attribution. Context identity separates evidence from different environments. Heuristic dimensions remain labeled; compatibility is not a performance promise.</div>
    </div>
  );
}
