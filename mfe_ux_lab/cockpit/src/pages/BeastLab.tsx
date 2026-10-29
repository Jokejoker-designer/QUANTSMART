// BeastLab — BEAST COLLECTOR & TACTICAL DUEL ARENA (owner 2026-07-02):
// Builds Role-Faithful Beast Ensembles, stores them as TCG Deck Boards, benchmarks 1v1 matchups in the Duel Arena,
// and routes strategies to compatible market environments ("Sai môi-trường không phải sai chiến-lược").
// Advisory · zone-only · no order · DEMO-ONLY · MODELED · ORDER_SEND FORBIDDEN.
import { useEffect, useState } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import "./cotrade.css";
import { TK } from "../components/ui/Ui.tsx";
import { Glyph } from "../components/ui/Glyph.tsx";
import { legacyDisplayCopy } from "../lib/legacyDisplayCopy.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import { getCardRuntimeConfig } from "../lib/simTimeframe.ts";
import { runRealisticBacktest } from "../lib/realisticSimRun.ts";
import { buildCardAtlas } from "../lib/strategyAtlas.ts";
import { fingerprintAt } from "../lib/environmentFingerprint.ts";
import { scoreCardFit, rankCardRoutes, ROUTE_LABEL, ROUTE_COLOR, type CardRouteScore } from "../lib/environmentRouting.ts";
import { BeastBuilderPanel } from "../components/BeastBuilderPanel.tsx";
import { BeastDeckBoard } from "../components/BeastDeckBoard.tsx";
import { BeastArenaPanel } from "../components/BeastArenaPanel.tsx";
import { seedBeastsToLibrary } from "../lib/cardBeastV2/breakoutLiquidityBeast.ts";
import { runDesignPipeline } from "../lib/cardBeastV2/grokBlockToBeastDesign.ts";
import { seedTcgStarterDeck } from "../lib/cardBeastV2/tcgStarterDeck.ts";
import { runConductor, type ConductorResult } from "../lib/cardBeastV2/conductorMode.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { assessBeastLineage, loadBeasts, saveBeasts, exportBeastAsCard, type SavedBeast } from "../lib/cardBeastV2/beastStore.ts";
import { composeBeast, type BeastMember } from "../lib/cardBeastV2/beastCompose.ts";
import { loadCustomModules } from "../lib/customModule.ts";
import { readStrategyCards, subscribeArtifactChanges } from "../lib/artifactRegistry.ts";

interface LibCard {
  id: string;
  name: string;
  role?: string;
  archetype?: string;
  modules: string[];
  design_tf?: string;
  [key: string]: unknown;
}
function loadLib(): LibCard[] {
  return readStrategyCards<LibCard>();
}

export function BeastLab() {
  const [cards, setCards] = useState<LibCard[]>(loadLib);
  const [beasts, setBeasts] = useState<SavedBeast[]>(loadBeasts);
  const [msg, setMsg] = useState("");
  const [routing, setRouting] = useState<CardRouteScore[] | null>(null);
  const [routingBusy, setRoutingBusy] = useState(false);
  const [conductor, setConductor] = useState<ConductorResult | null>(null);
  const [conductorBusy, setConductorBusy] = useState(false);

  useEffect(
    () =>
      subscribeArtifactChanges(() => {
        setCards(loadLib());
        setBeasts(loadBeasts());
      }),
    []
  );

  useEffect(() => {
    // Auto-seed the Tactical TCG Starter Deck if no Beasts exist yet
    if (beasts.length === 0 && !sessionStorage.getItem("mfe_beast_autoseeded")) {
      sessionStorage.setItem("mfe_beast_autoseeded", "1");
      void seedTcgStarterDeck().then(() => {
        setCards(loadLib());
        setBeasts(loadBeasts());
      });
    }
  }, [beasts.length]);

  async function handleSeedStarterDeck() {
    const r = await seedTcgStarterDeck();
    setCards(loadLib());
    setBeasts(loadBeasts());
    setMsg(
      `✓ Seeded Tactical Starter Deck: ${r.totalCards} Strategy Cards (${r.roleCardsAdded} new Role Cards) · ${r.totalBeasts} Beasts (${r.beastsAdded} new) · ${loadCustomModules().length} Custom Modules.`
    );
  }

  async function runConductorMode() {
    setConductorBusy(true);
    setConductor(null);
    try {
      const d = await loadSimOhlc("M15", false);
      const bs = (d?.bars || []) as OhlcBar[];
      if (bs.length < 5000) {
        setMsg("The routing experiment requires at least 5,000 M15 bars.");
        return;
      }
      await new Promise((r) => setTimeout(r, 30));
      setConductor(runConductor(bs.slice(-120000)));
    } finally {
      setConductorBusy(false);
    }
  }

  async function runRouting() {
    if (!cards.length) return;
    setRoutingBusy(true);
    try {
      const out: CardRouteScore[] = [];
      for (const c of cards) {
        const dtf = getCardRuntimeConfig(c).design_tf;
        const d = await loadSimOhlc(dtf, false);
        const bs = d?.bars;
        if (!bs || bs.length < 200) continue;
        const bt = runRealisticBacktest(bs, c, { symbol: getActiveSymbol(), chartTf: dtf, withWalkForward: false });
        const atlas = buildCardAtlas(bs, bt, { cardId: c.id });
        const fp = fingerprintAt(bs, bs.length - 1);
        if (fp) out.push(scoreCardFit(atlas, fp));
      }
      setRouting(rankCardRoutes(out));
    } finally {
      setRoutingBusy(false);
    }
  }

  function reExport(b: SavedBeast) {
    const lineage = assessBeastLineage(b, cards);
    if (lineage.status !== "FRESH") {
      setMsg(`⛔ ${b.name}: ${lineage.status} — ${lineage.issues.join(" · ")}`);
      return;
    }
    const store = (() => {
      try {
        return loadCustomModules();
      } catch {
        return [];
      }
    })();
    const members: BeastMember[] = b.members.map((m) => ({
      card_id: m.card_id,
      role: m.role as BeastMember["role"],
      modules: m.modules,
      source_kind: m.source_kind,
      source_artifact_id: m.source_artifact_id,
      source_content_hash: m.source_content_hash,
      customs: store.filter((c) => m.modules.includes(c.id)),
    }));
    const missing = b.customIds.filter((id) => !store.some((c) => c.id === id));
    const comp = composeBeast(members);
    if (!comp.ok) {
      setMsg("⛔ " + b.name + ": " + comp.errors.join("; "));
      return;
    }
    const r = exportBeastAsCard(b.name, comp);
    setMsg(
      (r.ok ? "" : "⛔ ") +
        r.note +
        (missing.length ? ` · Missing custom definitions: ${missing.join(", ")} (restore the required definitions before export)` : "")
    );
  }

  function removeBeast(id: string) {
    const next = beasts.filter((x) => x.id !== id);
    setBeasts(next);
    saveBeasts(next);
  }

  return (
    <div className="cotrade">
      <div className="mfe-pillbar" style={{ marginBottom: 12 }}>
        <span className="auth lock">
          <Glyph name="beast" size={11} /> BEAST COLLECTOR &amp; DUEL ARENA
        </span>
        <span className="auth lock">DEMO-ONLY</span>
        <span className="auth warn">MODELED</span>
        <span className="auth stop">ORDER_SEND FORBIDDEN</span>
        <span className="note">
          Compose Role-Pure Cards into 6-slot Beast Decks, measure leave-one-role-out impact, and battle 1v1 under identical friction.
        </span>
      </div>

      {/* 1) TẠO — 6-Slot Tactical Beast Deck Builder */}
      <BeastBuilderPanel onBeastSaved={(saved) => setBeasts((prev) => [saved, ...prev.filter((b) => b.id !== saved.id)])} />

      {/* 2) ĐẤU TRƯỜNG 1V1 — Tactical Duel Arena */}
      <BeastArenaPanel cards={cards} beasts={beasts} />

      {/* 3) KHO BEAST — Deck Vault */}
      <div className="pc" style={{ marginBottom: 12 }}>
        <div className="pc-h" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Glyph name="package" size={13} /> BEAST DECK VAULT{" "}
          <span className="mut">{beasts.length} saved ensembles · inspect role slots, pairwise tribe affinity &amp; export</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={handleSeedStarterDeck}
              style={{
                background: "rgba(34, 211, 238, 0.16)",
                border: "1px solid var(--border-active)",
                color: "var(--accent-cyan)",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 10.5,
                fontWeight: 800,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Glyph name="beast" size={11} /> Seed Starter TCG Deck (12 Role Cards + 3 Apex Beasts)
            </button>
            <button
              onClick={() => {
                const r = seedBeastsToLibrary();
                setBeasts(loadBeasts());
                setCards(loadLib());
                setMsg(
                  r.errors.length
                    ? "⛔ " + r.errors.join(" · ")
                    : `✓ ${r.exported.length ? "added " + r.exported.length + " ensembles to the library" : ""}${
                        r.skipped.length ? (r.exported.length ? " · " : "") + r.skipped.length + " already present; kept unchanged" : ""
                      } — exported drafts have no performance receipt until validated`
                );
              }}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-panel)",
                color: "#CBD5E1",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Glyph name="card" size={11} /> Add 2 Breakout/Retest Examples
            </button>
            <button
              title="Adds block-composed research definitions. Existing IDs are retained. Validate the exported Cards in Microscope."
              onClick={() => {
                const r = runDesignPipeline();
                setBeasts(loadBeasts());
                setCards(loadLib());
                const s = r.seed;
                setMsg(
                  s.errors.length
                    ? "⛔ " + s.errors.join(" · ")
                    : `✓ Grok design: ${s.exported.length ? "added " + s.exported.length + " beast" : "no new definitions"}${
                        s.skipped.length ? " · " + s.skipped.length + " already present" : ""
                      } · ${r.modules.length} modules · ${r.strategies.length} strategies; inspect them in Microscope with the same cost settings`
                );
              }}
              style={{
                background: "rgba(168, 85, 247, 0.16)",
                border: "1px solid rgba(168, 85, 247, 0.45)",
                color: "#E9D5FF",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Glyph name="beast" size={11} /> Seed 3 Grok Beasts (Block→Strategy)
            </button>
          </div>
        </div>
        {beasts.length === 0 ? (
          <div style={{ fontSize: 12, color: TK.muted, padding: "4px 2px" }}>
            No ensembles saved yet. Compose members above, then choose <Glyph name="save" size={10} /> Save Beast.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(430px,1fr))", gap: 12 }}>
            {beasts.map((b) => (
              <BeastDeckBoard
                key={b.id}
                name={`${b.name} · ${b.ts}`}
                members={b.members}
                warnings={b.warnings.length}
                actions={
                  <>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 10,
                        color: TK.muted,
                        fontFamily: "var(--mfe-mono)",
                        alignSelf: "center",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={b.modules.join(" · ")}
                    >
                      {b.modules.length} modules{b.customIds.length ? ` · ${b.customIds.length} custom` : ""}
                    </span>
                    {b.evidence && (
                      <span
                        title={`Measure ${b.evidence.bars} bars ${b.evidence.timeframe} · ${b.evidence.cost_mode}`}
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          color: b.evidence.identity?.status === "FALLBACK_DOMINANT" ? TK.red : TK.cyan,
                        }}
                      >
                        {b.evidence.identity?.status || "MEASURED"} · n={b.evidence.full.n}
                      </span>
                    )}
                    <span
                      title={legacyDisplayCopy(assessBeastLineage(b, cards).issues.join(" · ")) || "All Card member hashes match the current Library"}
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: assessBeastLineage(b, cards).status === "FRESH" ? "#34D399" : "#F87171",
                      }}
                    >
                      {assessBeastLineage(b, cards).status}
                    </span>
                    <button
                      onClick={() => reExport(b)}
                      style={{
                        background: "var(--status-safe-bg)",
                        color: "var(--status-safe-text)",
                        border: "1px solid var(--status-safe-border)",
                        borderRadius: 4,
                        padding: "4px 10px",
                        fontSize: 10.5,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      <Glyph name="package" size={11} /> Export Card
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Delete ensemble “" + b.name + "”?")) removeBeast(b.id);
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border-panel)",
                        borderRadius: 4,
                        color: "#F87171",
                        fontSize: 11,
                        padding: "4px 8px",
                        cursor: "pointer",
                      }}
                    >
                      <Glyph name="trash" size={12} />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
        {msg && <div style={{ fontSize: 11.5, color: msg.startsWith("⛔") ? "#F87171" : "#34D399", marginTop: 8 }}>{msg}</div>}
      </div>

      {/* 4) PHÂN TÍCH — Environment Routing */}
      <div className="co-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, color: TK.cyan, fontSize: 13 }}>
            <Glyph name="compass" size={12} /> Environment Routing
          </span>
          <span className="xs co-mut" style={{ flex: 1, minWidth: 180 }}>
            Evaluates each Card against its own most recent regime, volatility and session context. Historical alignment is not current live readiness.
          </span>
          <button
            className="ms-csv"
            style={{ background: routingBusy ? "#6e40c9" : "#1f6feb" }}
            disabled={routingBusy || !cards.length}
            onClick={runRouting}
          >
            {routingBusy ? "Evaluating Cards…" : <><Glyph name="compass" size={11} /> Evaluate routing</>}
          </button>
        </div>
        {routing && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {routing.length === 0 ? (
              <div className="co-mut small">No Card has sufficient observations for this routing calculation.</div>
            ) : (
              routing.map((r, i) => {
                const c = cards.find((x) => x.id === r.card_id);
                const col = ROUTE_COLOR[r.verdict];
                return (
                  <div
                    key={r.card_id}
                    title={r.note}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      borderRadius: 4,
                      background: "var(--bg-card-inner)",
                      border: "1px solid var(--border-panel)",
                      borderColor: col,
                    }}
                  >
                    <span style={{ width: 16, textAlign: "right", color: TK.muted, fontFamily: "var(--mfe-mono)", fontSize: 11 }}>
                      {i + 1}
                    </span>
                    <b style={{ minWidth: 118, fontSize: 12.5 }}>{c?.name || r.card_id}</b>
                    <span style={{ color: col, fontWeight: 800, fontSize: 11.5, minWidth: 130 }}>{ROUTE_LABEL[r.verdict]}</span>
                    <span className="xs co-mut">
                      env: <b style={{ color: TK.text2 }}>{r.env.regime}</b> · {r.env.session} · vol {r.env.volatility}
                    </span>
                    <span
                      className="xs"
                      style={{
                        marginLeft: "auto",
                        fontFamily: "var(--mfe-mono)",
                        color: (r.regimeCell?.netR ?? 0) >= 0 ? TK.green : TK.red,
                      }}
                    >
                      {r.regimeCell
                        ? `${r.regimeCell.trades} trades · ${r.regimeCell.netR >= 0 ? "+" : ""}${r.regimeCell.netR}R`
                        : "no trades in this regime"}
                    </span>
                  </div>
                );
              })
            )}
            <div className="co-mut small" style={{ fontStyle: "italic", marginTop: 2 }}>
              The current routing score uses regime, volatility and session components and a sample-size discount.{" "}
              <b>Inspect the context where each strategy was evaluated.</b>
            </div>
          </div>
        )}
      </div>

      {/* 5) NHẠC-TRƯỞNG THỬ NGHIỆM — Specialist Routing Experiment */}
      <div className="co-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, color: "#a78bfa", fontSize: 13 }}>
            <Glyph name="score" size={12} /> Specialist Routing Experiment
          </span>
          <span className="xs co-mut" style={{ flex: 1, minWidth: 200 }}>
            Builds per-regime passports on chronological training folds, then evaluates a causal router on test data. Abstention is a valid result.
          </span>
          <button
            className="ms-csv"
            style={{ background: conductorBusy ? "#6e40c9" : "#7c5cff" }}
            disabled={conductorBusy}
            onClick={runConductorMode}
          >
            {conductorBusy ? "Building passports and evaluating routing…" : <><Glyph name="score" size={11} /> Run routing experiment</>}
          </button>
        </div>
        {conductor && (() => {
          const c = conductor;
          const VC: Record<string, string> = { FITS: TK.green, HOSTILE: TK.red, NEUTRAL: TK.muted, INSUFFICIENT: TK.orange };
          const vLabel =
            c.verdict === "ROUTED_EDGE_SHADOW"
              ? { t: "Positive routed research result; confirmation required", col: TK.green }
              : c.verdict === "NO_EDGE_EVEN_ROUTED"
                ? { t: "No measured edge after routing", col: TK.red }
                : { t: "Insufficient coverage; no eligible OOS region found", col: TK.orange };
          return (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: vLabel.col, fontWeight: 800 }}>▶ {vLabel.t}</div>
              <div className="xs co-mut">
                TRAIN {c.trainRange} (passport learning) · TEST {c.testRange} (route)
              </div>
              {c.passports.map((p) => (
                <div
                  key={p.beast}
                  style={{ border: "1px solid var(--border-panel)", borderRadius: 6, padding: "7px 10px", background: "var(--bg-card-inner)" }}
                >
                  <b style={{ fontSize: 12 }}>
                    <Glyph name="beast" size={11} /> {p.beast}
                  </b>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                    {p.regimes.map((r) => (
                      <span
                        key={r.regime}
                        title={`${r.trades} trades · ${r.netR}R · ${r.evidence}`}
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: VC[r.verdict] || TK.muted,
                          border: `1px solid ${(VC[r.verdict] || TK.muted)}66`,
                          borderRadius: 4,
                          padding: "1px 7px",
                        }}
                      >
                        {r.regime}:{" "}
                        {r.verdict === "FITS" ? (
                          <>
                            <Glyph name="check" size={9} /> compatible
                          </>
                        ) : r.verdict === "HOSTILE" ? (
                          <>
                            <Glyph name="x" size={9} /> incompatible
                          </>
                        ) : r.verdict === "INSUFFICIENT" ? (
                          "insufficient samples"
                        ) : (
                          "neutral"
                        )}{" "}
                        <span className="co-mut">({r.trades}t)</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8 }}>
                {(
                  [
                    ["Coverage", c.portfolio.coveragePct + "%", "market coverage with an eligible ensemble"],
                    ["Uncovered / abstained", c.portfolio.gapPct + "%", "no qualified ensemble; no action"],
                    ["Overlap", c.portfolio.overlapPct + "%", "two or more compatible ensembles"],
                    ["Routed trades", String(c.portfolio.n), "after routing"],
                    ["Routed netR", (c.portfolio.netR >= 0 ? "+" : "") + c.portfolio.netR + "R", ""],
                    ["Routed PF", String(c.portfolio.pf), ""],
                  ] as [string, string, string][]
                ).map(([k, v, tip]) => (
                  <div
                    key={k}
                    title={tip}
                    style={{ border: "1px solid var(--border-panel)", borderRadius: 6, padding: "6px 9px", background: "var(--bg-card-inner)" }}
                  >
                    <div className="co-mut" style={{ fontSize: 8.5, textTransform: "uppercase" }}>
                      {k}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "var(--mfe-mono)", color: TK.text }}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="xs co-mut">
                Standalone test results: {c.solos.map((s) => `${s.beast} n=${s.n}/PF ${s.pf}`).join(" · ")} Routing restricts evaluation to regimes with supporting OOS evidence.
              </div>
              <div className="co-mut small" style={{ fontStyle: "italic" }}>
                Router causal (past-only, no-lookahead) · passport OOS · <b>Abstention is a valid result</b> · Shadow research; no execution.
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
