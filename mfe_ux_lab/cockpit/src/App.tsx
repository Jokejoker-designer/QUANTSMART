import { useState, useEffect, lazy, Suspense } from "react";
import { Layout } from "./shell/Layout.tsx";
import { pageFromHash, validPage } from "./shell/navigation.ts";
import { ResearchCockpit } from "./pages/ResearchCockpit.tsx";
import { WorkspaceErrorBoundary } from "./shell/WorkspaceErrorBoundary.tsx";

// Keep only the always-visible shell and Home eager. Every navigated workspace is a real
// loading boundary, so opening Home no longer downloads the entire research cockpit.
const Microscope = lazy(() => import("./pages/Microscope.tsx").then((m) => ({ default: m.Microscope })));
const EntryDanger = lazy(() => import("./pages/EntryDanger.tsx").then((m) => ({ default: m.EntryDanger })));
const WeeklyAudit = lazy(() => import("./pages/WeeklyAudit.tsx").then((m) => ({ default: m.WeeklyAudit })));
const Analysis = lazy(() => import("./pages/Analysis.tsx").then((m) => ({ default: m.Analysis })));
const Playbook = lazy(() => import("./pages/Playbook.tsx").then((m) => ({ default: m.Playbook })));
const StrategyLab = lazy(() => import("./pages/StrategyLab.tsx").then((m) => ({ default: m.StrategyLab })));
const StrategyCanvas = lazy(() => import("./pages/StrategyCanvas.tsx").then((m) => ({ default: m.StrategyCanvas })));
const StrategyRanking = lazy(() => import("./pages/StrategyRanking.tsx").then((m) => ({ default: m.StrategyRanking })));
const BeastLab = lazy(() => import("./pages/BeastLab.tsx").then((m) => ({ default: m.BeastLab })));
const KidiEvents = lazy(() => import("./pages/KidiEvents.tsx").then((m) => ({ default: m.KidiEvents })));
const Debugger = lazy(() => import("./pages/Debugger.tsx").then((m) => ({ default: m.Debugger })));
const HiddenCoefficients = lazy(() => import("./pages/HiddenCoefficients.tsx").then((m) => ({ default: m.HiddenCoefficients })));
const HelpManual = lazy(() => import("./pages/HelpManual.tsx").then((m) => ({ default: m.HelpManual })));
const AssetReadinessPanel = lazy(() => import("./components/AssetReadinessPanel.tsx").then((m) => ({ default: m.AssetReadinessPanel })));
const BlockModuleLibrary = lazy(() => import("./components/BlockModuleLibrary.tsx").then((m) => ({ default: m.BlockModuleLibrary })));
const FormulaLabPage = lazy(() => import("./formulaLab/FormulaLabPage.tsx").then((m) => ({ default: m.FormulaLabPage })));

const pageFallback = <div style={{ padding: 24, color: "var(--mfe-muted)" }}>Loading workspace…</div>;

// 2026-06-24 — Cockpit = the Co-Trade product (manager: "cắt gọn :5190, bỏ legacy, xây từ
// cotrade_all_pages_mockup"). The 12 legacy X-Ray review pages are removed from the cockpit (their .tsx
// files remain on disk, reversible). The old standalone "120-bar Chart" (X-Ray DecadeChart) was MERGED
// into Microscope as a history-scroll viewport (manager: one chart, not two) — file kept on disk.
// All pages bind the single TradeAdvice/OHLC object and recompute NOTHING. ADVISORY_ONLY · ORDER_SEND: FORBIDDEN.
//
// 2026-06-27 — nav consolidation (manager approved): (1) "Entry Advisor" + "Sweep & Danger" → one page
// "Entry & Danger" (EntryDanger.tsx sub-tab wrapper; both read the same live TradeAdvice). (2) "CSV Data"
// page removed from nav — CSV ingest already lives inside Microscope (Live/CSV/Replay source + 📂 picker).
// CsvLab.tsx is kept on disk (reversible). No engine/execution change.

export function App() {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));
  const navigate = (id: string) => { if (!validPage(id)) return; setPage(id); if (window.location.hash !== `#${id}`) window.location.hash = id; };
  useEffect(() => {
    const checkHash = () => setPage(pageFromHash(window.location.hash));
    checkHash();
    // cross-page navigation (e.g. Strategy Lab "▶ Chạy ở Microscope") via a custom event
    const onNav = (e: Event) => { const id = (e as CustomEvent).detail; if (typeof id === "string") navigate(id); };
    window.addEventListener("hashchange", checkHash);
    window.addEventListener("mfe-nav", onNav);
    return () => { window.removeEventListener("hashchange", checkHash); window.removeEventListener("mfe-nav", onNav); };
  }, []);
  return (
    <Layout
      current={page}
      onNavigate={navigate}
    >
      <WorkspaceErrorBoundary key={page}>
      {page === "home" && <ResearchCockpit />}
      <Suspense fallback={pageFallback}>
        {page === "help" && <HelpManual />}
        {page === "microscope" && <Microscope />}
        {page === "entry-danger" && <EntryDanger />}
        {page === "weekly-audit" && <WeeklyAudit />}
        {page === "analysis" && <Analysis />}
        {page === "strategy-ranking" && <StrategyRanking />}
        {page === "playbook" && <Playbook />}
        {page === "strategy-lab" && <StrategyLab />}
        {page === "assets" && <AssetReadinessPanel />}
        {page === "blocks-modules" && <BlockModuleLibrary />}
        {page === "beast-lab" && <BeastLab />}
        {page === "strategy-canvas" && <StrategyCanvas />}
        {page === "formula-lab" && <FormulaLabPage />}
        {page === "hidden-coefficients" && <HiddenCoefficients />}
        {page === "kidi-events" && <KidiEvents />}
        {page === "debugger" && <Debugger />}
      </Suspense>
      </WorkspaceErrorBoundary>
    </Layout>
  );
}
