// RealismPanel — the P0/P-1 truth surface: GROSS vs NET + truth contract + cost scenarios +
// discipline counts + manifest. Shared by Microscope and Strategy Lab. Honest labels only.
import { useState } from "react";
import { TK } from "./ui/Ui.tsx";
import type { RealisticBacktest } from "../lib/realisticSimRun.ts";
import { TRUTH_LABEL } from "../lib/simTruthContract.ts";

const f = (v: number | undefined, d = 2) => (v == null || isNaN(v) ? "—" : v.toFixed(d));
function Chip({ k, v, c }: { k: string; v: string; c?: string }) {
  return <span style={{ display: "inline-flex", gap: 5, alignItems: "center", background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", borderRadius: 6, padding: "2px 8px", fontSize: 10.5 }}>
    <span style={{ color: "var(--mfe-muted)" }}>{k}</span><b style={{ color: c || "var(--mfe-text)", fontFamily: "var(--mfe-mono)" }}>{v}</b></span>;
}

export function RealismPanel({ bt, compact }: { bt: RealisticBacktest; compact?: boolean }) {
  const [showManifest, setShowManifest] = useState(false);
  const { analytics: a, manifest: m, designTf, chartTf, tfBindingNote } = bt;
  const tc = m.truth_contract;
  const costRed = a.netPF < 1, costFragile = a.costFragile;
  const tfMismatch = chartTf !== designTf;

  return (
    <div className="pc" style={{ borderColor: "#43306a", background: "linear-gradient(180deg,rgba(157,92,255,.05),var(--mfe-s1))" }}>
      <div className="pc-h violet"> Realism · Truth Surface <span className="mut">modeled · advisory/research only · no order</span></div>

      {/* config chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Chip k="Mode" v={m.simulator_mode === "REALISTIC_SIM" ? "REALISTIC" : "LEGACY"} c={TK.cyan} />
        <Chip k="Card TF" v={designTf} c={TK.green} />
        <Chip k="Chart TF" v={chartTf} c={tfMismatch ? TK.orange : TK.text} />
        <Chip k="Fill" v="Next-open" c={TK.teal} />
        <Chip k="Cost" v={tc.costTruth === "PROVISIONAL" ? "PROVISIONAL" : tc.costTruth} c={TK.orange} />
        <Chip k="Sizing" v={m.risk_model.sizingMode === "PERCENT_EQUITY" ? "%Equity" : "Fixed-R"} />
        <Chip k="Cooldown" v={String(m.discipline_model.cooldownBars[designTf]) + " bar"} />
        <Chip k="Max/day" v={String(m.discipline_model.maxTradesPerDay[designTf])} />
      </div>

      {tfMismatch && <div className="pflag a" style={{ margin: "0 0 8px" }}>⚠ {tfBindingNote}</div>}

      {/* truth contract */}
      <div className="pkv"><span>Data Truth</span><b style={{ color: TK.text2 }}>{tc.dataTruth}</b></div>
      <div className="pkv"><span>Path Truth</span><b style={{ color: TK.orange }}>{TRUTH_LABEL[tc.pathTruth] || tc.pathTruth}</b></div>
      <div className="pkv"><span>Cost Truth</span><b style={{ color: TK.orange }}>{TRUTH_LABEL[tc.costTruth] || tc.costTruth}</b></div>
      <div className="pkv"><span>Execution Truth</span><b style={{ color: TK.teal }}>{TRUTH_LABEL[tc.executionTruth] || tc.executionTruth}</b></div>
      <div className="pkv"><span>Price Basis</span><b style={{ color: tc.priceBasis === "UNKNOWN" ? TK.orange : TK.text }}>{tc.priceBasis}</b></div>

      {/* GROSS vs NET */}
      <div className="pc-h" style={{ border: "none", padding: "8px 0 4px" }}>GROSS vs NET <span className="mut">before / after modeled costs</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 0, fontSize: 11.5 }}>
        <div className="pmut" style={{ padding: "3px 4px" }}>Metric</div>
        <div className="pmut" style={{ padding: "3px 4px", textAlign: "right" }}>GROSS</div>
        <div className="pmut" style={{ padding: "3px 4px", textAlign: "right" }}>NET</div>
        {[
          ["Profit Factor", f(a.grossPF), f(a.netPF)],
          ["Net R", (a.grossNetR >= 0 ? "+" : "") + f(a.grossNetR), (a.netNetR >= 0 ? "+" : "") + f(a.netNetR)],
          ["Win Rate %", f(a.grossWinRate, 1), f(a.netWinRate, 1)],
        ].map((row, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div style={{ padding: "3px 4px", borderTop: "1px solid #14202c" }}>{row[0]}</div>
            <div style={{ padding: "3px 4px", textAlign: "right", borderTop: "1px solid #14202c", fontFamily: "var(--mfe-mono)" }}>{row[1]}</div>
            <div style={{ padding: "3px 4px", textAlign: "right", borderTop: "1px solid #14202c", fontFamily: "var(--mfe-mono)", color: i === 0 ? (a.netPF >= 1 ? TK.green : TK.red) : i === 1 ? (a.netNetR >= 0 ? TK.green : TK.red) : TK.text }}>{row[2]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        <Chip k="Cost drag" v={f(a.costDragR) + "R"} c={TK.red} />
        <Chip k="Avg cost/trade" v={f(a.avgCostR, 3) + "R"} c={TK.orange} />
        <Chip k="Breakeven cost" v={f(a.breakevenCostR, 3) + "R"} />
        <Chip k="Trades/day" v={f(a.tradesPerDay)} />
      </div>
      {costRed && <div className="pflag r" style={{ margin: "8px 0 0" }}>NET PF &lt; 1 — after modeled costs this card is null/negative (the honest result).</div>}

      {/* cost scenarios */}
      {!compact && (
        <>
          <div className="pc-h" style={{ border: "none", padding: "8px 0 4px" }}>Cost Sensitivity <span className="mut">netPF under low/base/stress</span></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {a.scenarios.map((s) => <Chip key={s.scenario} k={s.scenario.replace("_COST", "")} v={"PF " + f(s.netPF) + " · " + (s.netR >= 0 ? "+" : "") + f(s.netR) + "R"} c={s.netPF >= 1 ? TK.green : TK.red} />)}
            {costFragile && <span className="pflag a" style={{ margin: 0 }}> COST_FRAGILE — survives only at LOW cost</span>}
          </div>
        </>
      )}

      {/* P2: swap + weekend + Monte-Carlo + walk-forward */}
      <div className="pc-h" style={{ border: "none", padding: "8px 0 4px" }}>Robustness <span className="mut">P2 · swap · Monte-Carlo · walk-forward</span></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
        <Chip k="Swap drag" v={f(a.swapCostRtotal) + "R"} c={a.swapCostRtotal > 0.01 ? TK.orange : TK.muted} />
        <Chip k="Held o/weekend" v={String(a.weekendHeldCount)} c={a.weekendHeldCount ? TK.orange : TK.muted} />
      </div>
      {a.monteCarlo ? (
        <>
          <div className="pkv"><span>Monte-Carlo final R <span className="pmut">({a.monteCarlo.runs}× bootstrap)</span></span><b className="pmono">p5 {f(a.monteCarlo.finalR.p5)} · p50 {f(a.monteCarlo.finalR.p50)} · p95 {f(a.monteCarlo.finalR.p95)}</b></div>
          <div className="pkv"><span>Max DD (median / 1-in-20 / worst)</span><b className="pmono" style={{ color: TK.red }}>{f(a.monteCarlo.maxDD.median)} / {f(a.monteCarlo.maxDD.p05Worst)} / {f(a.monteCarlo.maxDD.worst)}R</b></div>
          <div className="pkv"><span>P(net negative) · P(ruin {f(a.monteCarlo.riskOfRuinR, 0)}R)</span><b style={{ color: a.monteCarlo.probNegative > 0.2 ? TK.red : TK.text }}>{(a.monteCarlo.probNegative * 100).toFixed(1)}% · {(a.monteCarlo.probRuin * 100).toFixed(1)}%</b></div>
        </>
      ) : <div className="pmut psm">Monte Carlo requires at least ten trades.</div>}
      {bt.walkForward && (
        <>
          <div className="pkv"><span>Walk-forward <span className="pmut">({bt.walkForward.evaluatedFolds} OOS folds)</span></span><b style={{ color: bt.walkForward.verdict === "OOS_STABLE" ? TK.green : bt.walkForward.verdict === "OOS_MIXED" ? TK.yellow : TK.red }}>{bt.walkForward.verdict} · {(bt.walkForward.positiveFraction * 100).toFixed(0)}% folds + · medPF {f(bt.walkForward.medianNetPF)}</b></div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 2 }}>{bt.walkForward.folds.map((fd) => <span key={fd.index} title={`fold ${fd.index + 1}: ${fd.n} trades · netPF ${fd.netPF} · ${fd.netR}R`} style={{ fontSize: 9.5, fontFamily: "var(--mfe-mono)", padding: "1px 6px", borderRadius: 4, background: fd.n < 5 ? "var(--mfe-s3)" : fd.positive ? "rgba(33,208,122,.15)" : "rgba(255,77,77,.15)", color: fd.n < 5 ? TK.muted : fd.positive ? TK.green : TK.red }}>{fd.n < 5 ? "—" : (fd.netPF >= 999 ? "∞" : f(fd.netPF))}</span>)}</div>
        </>
      )}

      {/* discipline / blocked */}
      <div className="pc-h" style={{ border: "none", padding: "8px 0 4px" }}>Discipline <span className="mut">spam control</span></div>
      <div className="pkv"><span>Signals seen</span><b>{a.signals_seen}</b></div>
      <div className="pkv"><span>Blocked · cooldown</span><b style={{ color: TK.orange }}>{a.signals_blocked_by_cooldown}</b></div>
      <div className="pkv"><span>Blocked · daily cap</span><b style={{ color: TK.orange }}>{a.signals_blocked_by_daily_cap}</b></div>
      <div className="pkv"><span>Blocked · position open</span><b style={{ color: TK.orange }}>{a.signals_blocked_by_existing_position}</b></div>
      <div className="pkv"><span>Actual trades taken</span><b style={{ color: TK.green }}>{a.actual_trades_taken}</b></div>
      <div className="pkv"><span>Ambiguous intrabar</span><b style={{ color: a.ambiguous_intrabar_count ? TK.orange : TK.muted }}>{a.ambiguous_intrabar_count} <span className="pmut">(conservative stop-first · tick for exact)</span></b></div>

      {/* P1: M1 intrabar path + ambiguity */}
      {bt.m1Master && (
        <>
          <div className="pc-h" style={{ border: "none", padding: "8px 0 4px" }}>M1 Intrabar Path <span className="mut">P1 · M1 resolves under {designTf} signal</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            <Chip k="M1 Master" v="ON" c={TK.green} />
            <Chip k="Resample" v={"M1→" + designTf} c={TK.cyan} />
            <Chip k="Intrabar Resolve" v="M1" c={TK.teal} />
            <Chip k="Ambiguity Policy" v={(bt.ambiguityPolicy || "MARK_AMBIGUOUS").replace(/_/g, " ")} />
            {bt.resampleQuality && <Chip k="Resample Q" v={`${bt.resampleQuality.completeBars} closed · ${bt.resampleQuality.gapBars} gap`} c={bt.resampleQuality.gapBars ? TK.orange : TK.text} />}
          </div>
          <div className="pkv"><span>Ambiguous intrabar</span><b style={{ color: a.ambiguousCount ? TK.orange : TK.muted }}>{a.ambiguousCount} <span className="pmut">({(a.ambiguousRate * 100).toFixed(1)}%)</span></b></div>
          <div className="pkv"><span>Path fragility</span><b style={{ color: a.pathFragilityStatus === "PATH_FRAGILE" ? TK.red : TK.green }}>{a.pathFragilityStatus}</b></div>
          {!compact && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              <Chip k="mark-ambig" v={"PF " + f(a.ambiguityScenarios.netPF_mark_ambiguous)} />
              <Chip k="stop-first" v={"PF " + f(a.ambiguityScenarios.netPF_conservative_stop_first)} c={TK.red} />
              <Chip k="tp-first" v={"PF " + f(a.ambiguityScenarios.netPF_optimistic_tp_first)} c={TK.green} />
              <Chip k="excl-ambig" v={"PF " + f(a.ambiguityScenarios.netPF_excluding_ambiguous)} />
            </div>
          )}
          {a.pathFragilityStatus === "PATH_FRAGILE" && <div className="pflag a" style={{ margin: "6px 0 0" }}> PATH_FRAGILE — result depends on SL/TP order inside one M1 candle. Tick data required for exact fill.</div>}
        </>
      )}

      {/* manifest */}
      <div style={{ marginTop: 8 }}>
        <button className="pmut psm" style={{ background: "transparent", border: "1px solid var(--mfe-border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: "var(--mfe-text2)" }} onClick={() => setShowManifest((s) => !s)}>{showManifest ? "▾" : "▸"} Run Manifest</button>
        {showManifest && (
          <div className="pmono" style={{ fontSize: 10, marginTop: 6, color: "var(--mfe-muted)", lineHeight: 1.6, wordBreak: "break-all" }}>
            <div>run_id: {m.run_id}</div>
            <div>config_hash: {m.config_hash} · seed: {m.seed} · v: {m.simulator_version}</div>
            <div>range: {m.data_range.start} → {m.data_range.end} · {m.data_range.bars} bars</div>
            <div>data: dup {m.data_reality.duplicateCount} · gaps {m.data_reality.largeGapCount} · frozen {m.data_reality.frozenBarCount} · invalid {m.data_reality.invalidOhlcCount}</div>
            <div>symbol_spec: {m.symbol_spec.source} · contract {m.symbol_spec.contractSize ?? "?"} · comm ${m.symbol_spec.commissionRTPerLotUsd ?? "?"}/RT</div>
            {m.warnings.length > 0 && <div style={{ color: TK.orange, marginTop: 4 }}>⚠ {m.warnings.join(" · ")}</div>}
          </div>
        )}
      </div>

      <div className="pfoot" style={{ marginTop: 6 }}>MODELED NET · PROVISIONAL COST · M1 APPROX PATH · TICK REQUIRED FOR EXACT FILL · advisory/research only — not live-ready, not a profit promise.</div>
    </div>
  );
}
