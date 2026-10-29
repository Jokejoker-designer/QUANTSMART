// Strategy Lab — Card evaluation, album index, Microscope cascade sync, and deep diagnostics.
// Advisory-only · zone-only · controlled-optimism.
import { useEffect, useMemo, useState } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import "./cotrade.css";
import "./product.css";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { RealismPanel } from "../components/RealismPanel.tsx";
import { CalibrationPanel } from "../components/CalibrationPanel.tsx";
import { HonestyDashboard } from "../components/HonestyDashboard.tsx";
import { FundingPanel } from "../components/FundingPanel.tsx";
import { MultiYearFundingPanel } from "../components/MultiYearFundingPanel.tsx";
import { AblationPanel } from "../components/AblationPanel.tsx";
import { CardTaxonomyPanel } from "../components/CardTaxonomyPanel.tsx";
import { CardPassportChip } from "../components/CardPassportChip.tsx";
import { StrategyAlbumPanel } from "../components/StrategyAlbumPanel.tsx";
import { StrategyAtlasPanel } from "../components/StrategyAtlasPanel.tsx";
import { TfFitPanel } from "../components/TfFitPanel.tsx";
import { CardRunStatusPanel } from "../components/CardRunStatusPanel.tsx";
import { runStatus } from "../lib/cardRunStore.ts";
import { deriveCardPassport, type CardPassport } from "../lib/cardPassport.ts";
import { buildAlbum } from "../lib/albumView.ts";
import { PeriodSelector } from "../components/PeriodSelector.tsx";
import { sliceByPeriod, periodLabel, ALL_PERIOD, type Period } from "../lib/simPeriod.ts";
import { loadCustomModules } from "../lib/customModule.ts";
import { useResearchBacktest } from "../lib/researchJobs.ts";
import { ResearchJobStatus } from "../components/ResearchJobStatus.tsx";
import { getCardRuntimeConfig } from "../lib/simTimeframe.ts";
import { loadBrokerCalibration } from "../lib/brokerCalibration.ts";
import type { BrokerCalibrationInput } from "../lib/simCalibration.ts";
import { readStrategyCards, subscribeArtifactChanges } from "../lib/artifactRegistry.ts";
import { loadBeasts } from "../lib/cardBeastV2/beastStore.ts";
import { buildStrategyIntelligence, type CustomModuleExplanation, type IntelligenceLane } from "../lib/strategyIntelligence.ts";
import { StrategyIntelligencePanel } from "../components/StrategyIntelligencePanel.tsx";
import { loadCustomL1 } from "../lib/blocks/customL1.ts";
import { loadCustomL2 } from "../lib/blocks/customL2.ts";
import { loadCustomL3 } from "../lib/blocks/customL3.ts";
import { loadCustomL6 } from "../lib/blocks/customL6.ts";
import { InfoTip } from "../components/ui/Ui.tsx";
import { CardEvidencePanel } from "../components/CardEvidencePanel.tsx";
import { StrategyControls } from "../components/StrategyControls.tsx";
import { ROLE_BADGE } from "../components/StrategyCard.tsx";
import { seedTcgStarterDeck, measureCardRoleImpact, getModuleImpact, inferCardRole, type RoleImpactPreview } from "../lib/cardBeastV2/tcgStarterDeck.ts";

interface IndCard {
  indicator: string;
  label: string;
  promotion_state: string;
  calibrated_weight: number;
  precision: number;
  verdict: string;
  best_regimes: { regime: string; mfe_lift: number }[];
}
interface IndData {
  n_indicators: number;
  n_panel_rows: number;
  indicators: IndCard[];
  honest_note: string;
}
interface LibCard {
  id: string;
  name: string;
  archetype?: string;
  modules: string[];
  [key: string]: unknown;
}

export function StrategyLab() {
  const [ind, setInd] = useState<IndData | null>(null);
  useEffect(() => {
    fetch("data/top5/indicator_cards.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setInd)
      .catch(() => setInd(null));
  }, []);
  const promoTone = (s: string): "safe" | "danger" | "warn" =>
    s === "SHADOW_PROMOTED" ? "safe" : s === "FALSE_ALARM_TOO_HIGH" ? "danger" : "warn";

  const readCards = (): LibCard[] => readStrategyCards<LibCard>();
  const [cards, setCards] = useState<LibCard[]>(readCards);
  const [beasts, setBeasts] = useState(loadBeasts);
  useEffect(() => {
    const reload = () => {
      setCards(readCards());
      setBeasts(loadBeasts());
    };
    const unsub = subscribeArtifactChanges(reload);
    window.addEventListener("focus", reload);
    return () => {
      unsub();
      window.removeEventListener("focus", reload);
    };
  }, []);
  const [selId, setSelId] = useState<string | null>(null);
  useEffect(() => {
    if (!selId && cards.length) setSelId(cards[0].id);
  }, [cards, selId]);
  useEffect(() => {
    try {
      const pre = localStorage.getItem("mfe_strategylab_preselect");
      if (pre) {
        localStorage.removeItem("mfe_strategylab_preselect");
        setSelId(pre);
      }
    } catch {
      /* ignore */
    }
  }, []);
  const sel = cards.find((c) => c.id === selId) || null;
  const selectedRunStatus = sel ? runStatus(sel) : null;
  const isFresh = selectedRunStatus?.state === "FRESH";
  const [showDeep, setShowDeep] = useState(false);
  useEffect(() => {
    setShowDeep(false);
  }, [selId]);

  const designTf = sel ? getCardRuntimeConfig(sel).design_tf : "H1";
  const [designBars, setDesignBars] = useState<OhlcBar[] | null>(null);
  useEffect(() => {
    if (sel && showDeep) {
      setDesignBars(null);
      loadSimOhlc(designTf, false).then((d) => setDesignBars(d?.bars || null));
    }
  }, [selId, designTf, showDeep]);
  const [calib, setCalib] = useState<BrokerCalibrationInput | null>(null);
  useEffect(() => {
    loadBrokerCalibration(getActiveSymbol())
      .then(setCalib)
      .catch(() => setCalib(null));
  }, []);
  const [capital, setCapital] = useState(10000);
  const [riskPct, setRiskPct] = useState(0.75);
  const [period, setPeriod] = useState<Period>(ALL_PERIOD);
  const scopedBars = useMemo(() => sliceByPeriod(designBars, period), [designBars, period]);
  const [customMods, setCustomMods] = useState(loadCustomModules);
  const [impactMap, setImpactMap] = useState<Record<string, RoleImpactPreview>>(() => {
    try {
      return JSON.parse(localStorage.getItem("mfe_tcg_impact_cache") || "{}");
    } catch {
      return {};
    }
  });
  const [deckBusy, setDeckBusy] = useState("");
  const [deckNote, setDeckNote] = useState("");

  useEffect(() => {
    // Auto-seed Starter TCG Deck if workspace only has the single initial card
    if (cards.length <= 1 && !sessionStorage.getItem("mfe_tcg_autoseeded")) {
      sessionStorage.setItem("mfe_tcg_autoseeded", "1");
      void seedTcgStarterDeck().then(() => {
        setCards(readCards());
        setBeasts(loadBeasts());
        setCustomMods(loadCustomModules());
      });
    }
  }, [cards.length]);

  async function handleSeedStarterDeck() {
    setDeckBusy("Seeding deck…");
    try {
      const r = await seedTcgStarterDeck();
      setCards(readCards());
      setBeasts(loadBeasts());
      setCustomMods(loadCustomModules());
      setDeckNote(`Starter TCG Deck ready: ${r.totalCards} Strategy Cards (${r.roleCardsAdded} new Role Cards) · ${r.totalBeasts} Beasts · ${loadCustomModules().length} Custom Modules.`);
    } finally {
      setDeckBusy("");
    }
  }

  async function handleMeasureAllImpact() {
    setDeckBusy("Calibrating impacts…");
    try {
      const d = await loadSimOhlc("M15", false);
      const bars = ((d?.bars || []) as OhlcBar[]).slice(-24000);
      if (bars.length < 500) {
        setDeckNote("Insufficient M15 bars to calibrate role impacts.");
        return;
      }
      const next: Record<string, RoleImpactPreview> = { ...impactMap };
      const allCustoms = loadCustomModules();
      const current = readCards();
      for (const c of current) {
        await new Promise((r) => setTimeout(r, 5));
        next[c.id] = measureCardRoleImpact(bars, c, allCustoms, false);
      }
      setImpactMap(next);
      try {
        localStorage.setItem("mfe_tcg_impact_cache", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setDeckNote(`Calibrated ${current.length} Cards on ${bars.length.toLocaleString()} M15 bars (Direct Combat for Attackers/Beasts + Paired Ablation for Support Roles).`);
    } finally {
      setDeckBusy("");
    }
  }
  const customExplanations = useMemo<CustomModuleExplanation[]>(() => {
    const laneForRole = (role: string): IntelligenceLane =>
      role === "TRIGGER"
        ? "SETUP"
        : role === "VETO" || role === "CONTEXT_GATE" || role === "SAFETY_VETO"
          ? "GUARD"
          : role === "CONFIRM"
            ? "CONFIRM"
            : role === "EXIT"
              ? "EXIT"
              : "CONTEXT";
    return [
      ...customMods.map((m) => ({
        id: m.id,
        name: m.name,
        lane: laneForRole(m.role),
        explanation: `${m.explain} — ${m.why}`,
        status: m.status,
      })),
      ...loadCustomL1().map((m) => ({
        id: m.id,
        name: m.name,
        lane: "CONTEXT" as const,
        explanation: `${m.explain} — ${m.why}`,
        status: m.status,
      })),
      ...loadCustomL2().map((m) => ({
        id: m.id,
        name: m.name,
        lane: "CONTEXT" as const,
        explanation: `${m.explain} · L2 ${m.kind}`,
        status: m.status,
      })),
      ...loadCustomL3().map((m) => ({
        id: m.id,
        name: m.name,
        lane: "INFRA" as const,
        explanation: `${m.formulaText || m.outputType} · L3 scoring formula`,
        status: m.status,
      })),
      ...loadCustomL6().map((m) => ({
        id: m.id,
        name: m.name,
        lane: "CONTEXT" as const,
        explanation: `${m.explain} · L6 ${m.role} @ ${m.anchor}`,
        status: m.status,
      })),
    ];
  }, [customMods]);
  const researchJob = useResearchBacktest(
    showDeep ? scopedBars : null,
    sel,
    {
      symbol: getActiveSymbol(),
      chartTf: designTf,
      withWalkForward: true,
      walkForwardFolds: 5,
      calibration: calib || undefined,
      capital,
      riskPct,
      customModules: customMods,
    },
    "design",
    true,
  );
  const realBt = researchJob.result;
  const [passportCache, setPassportCache] = useState<Record<string, CardPassport>>({});
  useEffect(() => {
    if (sel && realBt) {
      setPassportCache((prev) => ({
        ...prev,
        [sel.id]: deriveCardPassport({ card: sel, backtest: realBt, period: periodLabel(period) }),
      }));
    }
  }, [sel, realBt, period]);
  const albumEntries = useMemo(
    () => buildAlbum(cards, passportCache, (c) => getCardRuntimeConfig(c).design_tf),
    [cards, passportCache],
  );
  const intelligence = useMemo(
    () =>
      sel && selectedRunStatus
        ? buildStrategyIntelligence({
            card: sel,
            customModules: customExplanations,
            beasts,
            run: selectedRunStatus,
          })
        : null,
    [sel, selectedRunStatus, customExplanations, beasts],
  );

  return (
    <div className="cotrade">
      <ResearchJobStatus pending={researchJob.pending} error={researchJob.error} />
      <div className="co-topbar">
        <span className="co-lock">STRATEGY LAB</span>
        <span className="small co-mut" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Multi-Horizon Validation Suite (Y10 → M6 → M1)
          <InfoTip
            title="Strategy Lab Governance"
            text="Every logic block carries explicit attribution, role permissions, and safety audits. Unexplained cards are blocked; newly authored cards start in DRAFT / SHADOW_TEST."
            align="right"
            bottom
          />
        </span>
      </div>

      {/* STRATEGY ALBUM — index/filter over cards + passports */}
      {deckNote && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            borderRadius: 6,
            background: "rgba(34, 211, 238, 0.12)",
            border: "1px solid var(--border-active)",
            color: "#E2E8F0",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{deckNote}</span>
          <button
            onClick={() => setDeckNote("")}
            style={{ background: "transparent", border: 0, color: "#94A3B8", cursor: "pointer", fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="strategy-lab-workbench"><div className="strategy-lab-gallery">
      {cards.length > 0 && (
        <StrategyAlbumPanel
          entries={albumEntries}
          selId={selId}
          onSelect={setSelId}
          impactMap={impactMap}
          onSeedStarterDeck={handleSeedStarterDeck}
          onMeasureAllImpact={handleMeasureAllImpact}
          busyLabel={deckBusy}
        />
      )}

      </div><section className="co-card strategy-lab-controls" aria-label="Selected Strategy controls"><label className="strategy-field">Strategy Card<select aria-label="Strategy Card to operate" value={selId || ""} onChange={e => setSelId(e.target.value || null)}><option value="">Select a Card</option>{cards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><StrategyControls card={sel} /></section></div>
      {/* SYNC: official cascade result read back from Microscope (Y10/M6/M1) */}
      {cards.length === 0 ? (
        <div className="co-card">
          <div className="co-mut small">
            Strategy Library is empty — package a card in <b>Strategy Canvas</b> or load the Starter Card on <b>Home</b>, then run the Y10 → M6 → M1 cascade in <b>Microscope</b>.
          </div>
        </div>
      ) : (
        <details className="strategy-advanced"><summary>Full validation history · Y10 / M6 / M1</summary><CardRunStatusPanel card={sel} /></details>
      )}

      {sel && (
        <div style={{ marginBottom: 12 }}>
          <CardEvidencePanel card={sel} />
        </div>
      )}

      {/* Deep analysis — OPT-IN, only for a FRESH (fully-run) card */}
      {sel && isFresh && !showDeep && (
        <div className="co-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="fx-toggle" style={{ fontSize: 13, padding: "7px 16px" }} onClick={() => setShowDeep(true)}>
            ▼ Run Deep Diagnostics (Honesty · Funding · Atlas · Ablation · Annual Breakdown)
          </button>
          <InfoTip
            title="Deep Diagnostics"
            text="Runs the full cost-aware realistic backtest on the clean historical tape across all years, walk-forward folds, and module ablations."
          />
        </div>
      )}

      {/* REALISTIC (NET) — P0: cost-aware, next-open, per-year */}
      {sel && showDeep && (
        <div className="co-card">
          {getCardRuntimeConfig(sel).allowed_execution_tf !== designTf && (
            <p className="product-message">
              These deep diagnostics use a design-timeframe baseline. They do not replace the Card&apos;s finer-execution publication receipt. Inspect the intrabar path and its available window in Microscope.
            </p>
          )}
          <h3 style={{ margin: "0 0 6px", fontSize: 15, color: "#F8FAFC", display: "flex", alignItems: "center", gap: 8 }}>
            Realistic Backtest (NET)
            <span className="co-mut" style={{ fontSize: 12, fontWeight: 400 }}>
              — {sel.name} · Design TF {designTf} · Next-Open + Costs
            </span>
            <InfoTip
              title="One Engine of Record"
              text="Uses the exact same realisticStrategySim engine and clean historical tape as the Microscope cascade. Note: 'All History' includes the forward month, whereas the official Y10 cascade window is strictly disjoint."
            />
          </h3>
          <div style={{ marginBottom: 10 }}>
            <PeriodSelector
              bars={designBars}
              period={period}
              onChange={setPeriod}
              barsLabel={scopedBars.length.toLocaleString() + " bars (" + designTf + ")"}
            />
          </div>
          {!realBt ? (
            <div className="co-mut small">
              {!designBars
                ? "Loading " + designTf + " historical tape…"
                : "Selected period " + periodLabel(period) + " has too few bars (" + scopedBars.length + ") — select a wider window."}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <CardPassportChip bt={realBt} card={sel} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <HonestyDashboard bt={realBt} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <CardTaxonomyPanel bt={realBt} card={sel} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <StrategyAtlasPanel designBars={scopedBars} bt={realBt} card={sel} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <TfFitPanel card={sel} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <FundingPanel
                  capital={capital}
                  onCapital={setCapital}
                  riskPct={riskPct}
                  onRiskPct={setRiskPct}
                  analytics={realBt.analytics}
                  calibrated={realBt.calibration?.specCalibrated}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <MultiYearFundingPanel designBars={designBars} card={sel} capital={capital} riskPct={riskPct} />
              </div>
              <RealismPanel bt={realBt} />
              {/* per-YEAR study */}
              <div className="co-card" style={{ margin: "10px 0 0", borderColor: "var(--status-shadow-border)" }}>
                <div style={{ fontWeight: 800, color: "var(--accent-purple)", fontSize: 12, marginBottom: 5, display: "flex", alignItems: "center", gap: 8 }}>
                  Annual Performance Breakdown
                  <span className="co-mut" style={{ fontWeight: 400 }}>
                    — Gross vs. Net R by calendar year
                  </span>
                  <InfoTip
                    title="Net R vs Gross R"
                    text="Net R deducts modeled spread, commission, and slippage. A positive Gross R with negative Net R indicates execution friction consumed the strategy's gross edge in that year."
                  />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#94A3B8", fontSize: 10, textTransform: "uppercase" }}>
                        <th style={{ textAlign: "left", padding: "4px 8px" }}>Year</th>
                        <th>Trades</th>
                        <th>Win% (Net)</th>
                        <th>Gross R</th>
                        <th>Net R</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(realBt.analytics.byYear)
                        .sort((a, b) => +a[0] - +b[0])
                        .map(([y, v]) => (
                          <tr key={y} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "5px 8px", fontWeight: 700, color: "#F8FAFC" }}>{y}</td>
                            <td style={{ textAlign: "center", fontFamily: "var(--mfe-mono)" }}>{v.n}</td>
                            <td
                              style={{
                                textAlign: "center",
                                fontFamily: "var(--mfe-mono)",
                                color: v.netWins / Math.max(1, v.n) >= 0.5 ? "var(--status-safe-text)" : "var(--status-warn-text)",
                              }}
                            >
                              {Math.round((v.netWins / Math.max(1, v.n)) * 100)}%
                            </td>
                            <td
                              style={{
                                textAlign: "center",
                                fontFamily: "var(--mfe-mono)",
                                color: v.grossR >= 0 ? "var(--status-safe-text)" : "var(--status-danger-text)",
                              }}
                            >
                              {v.grossR >= 0 ? "+" : ""}
                              {v.grossR.toFixed(1)}R
                            </td>
                            <td
                              style={{
                                textAlign: "center",
                                fontFamily: "var(--mfe-mono)",
                                color: v.netR >= 0 ? "var(--status-safe-text)" : "var(--status-danger-text)",
                                fontWeight: 700,
                              }}
                            >
                              {v.netR >= 0 ? "+" : ""}
                              {v.netR.toFixed(1)}R
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {Object.keys(realBt.analytics.byYear).length === 0 && (
                  <div className="co-mut small">No trades triggered on {designTf} (cooldown/cap filters or entry conditions were never met).</div>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <AblationPanel designBars={designBars} card={sel} capital={capital} riskPct={riskPct} customModules={customMods} />
              </div>
              <div style={{ marginTop: 10 }}>
                <CalibrationPanel />
              </div>
            </>
          )}
        </div>
      )}

      {/* 2-Column Layout (55% Card Composition + Indicator Panel / 45% Strategy Intelligence) */}
      <div className="strategy-lab-bottom-grid">
        <div className="co-card" style={{ margin: 0 }}>
          <h3>
            Card Composition <span className="co-mut small">{sel ? "· " + sel.name : "· select from Strategy Album"}</span>
          </h3>
          {sel ? (
            <>
              <div className="small" style={{ marginBottom: 8 }}>
                Archetype: <b style={{ color: "var(--accent-purple)" }}>{sel.archetype || "Research"}</b> ·{" "}
                <b style={{ color: "#F8FAFC" }}>{(sel.modules || []).length}</b> modules
                {(sel.modules || []).includes("auto_rr") ? " · Auto R:R" : ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(sel.modules || []).map((m) => (
                  <span key={m} className="mfe-mod-chip" style={{ margin: 0 }}>
                    {(() => {
                      const cm = customMods.find((c) => c.id === m);
                      const imp = getModuleImpact(m, cm);
                      const rb = ROLE_BADGE[imp.role] || { color: "#38BDF8", bg: "rgba(56, 189, 248, 0.12)", border: "rgba(56, 189, 248, 0.35)" };
                      return (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <b style={{ fontSize: 9, color: rb.color, background: rb.bg, border: `1px solid ${rb.border}`, borderRadius: 3, padding: "0 4px" }}>
                            {imp.role === "NONE" ? "CORE" : imp.role.replace("_SENTINEL", "")}
                          </b>
                          <span>{imp.name}</span>
                          <span style={{ fontSize: 9.5, color: imp.impactTone === "caution" ? "var(--status-warn-text)" : imp.impactTone === "proven" ? "var(--status-safe-text)" : "#94A3B8" }}>
                            · {imp.impactBadge}
                          </span>
                        </span>
                      );
                    })()}
                  </span>
                ))}
              </div>
              {(sel.modules || []).length === 0 && (
                <div className="co-mut small">No explicit module list saved — backtest uses default configuration.</div>
              )}
            </>
          ) : (
            <div className="co-mut small">Select a card from the Strategy Album above to inspect its modules and validation status.</div>
          )}

          <h3 style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6 }}>
            Indicator Panel (11y Self-Calibrated)
            {ind && <InfoTip title="Self-Calibrated Indicators" text={ind.honest_note} />}
          </h3>
          {!ind ? (
            <div className="co-mut small">data/top5/indicator_cards.json not found — run build.</div>
          ) : (
            ind.indicators.map((it) => (
              <div
                key={it.indicator}
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <b style={{ flex: "1 1 150px", fontSize: 12.5, color: "#F8FAFC" }}>{it.label}</b>
                <span className={`mfe-status-pill ${promoTone(it.promotion_state)}`}>{it.promotion_state}</span>
                <span className="mono small" style={{ marginLeft: "auto", color: "#94A3B8" }}>
                  w <b style={{ color: "#F8FAFC" }}>{it.calibrated_weight}</b> · prec <b style={{ color: "#F8FAFC" }}>{it.precision}</b>
                </span>
              </div>
            ))
          )}
        </div>

        <StrategyIntelligencePanel model={intelligence} />
      </div>
    </div>
  );
}
