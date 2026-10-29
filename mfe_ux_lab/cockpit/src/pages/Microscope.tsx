// Microscope — refit to the MD spec (PAGE 02). Deep diagnostic view: big zone chart + session context +
// MTF minis + event timeline. Reuses CockpitChart. Diagnostic/advisory ONLY · order_send FORBIDDEN.
import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { useLiveWorkspaceQuery, freshWorkspaceBars } from "../lib/liveWorkspaceQuery.ts";
import { MicroChart, type TradeSeg } from "../components/MicroChart.tsx";
import { parseCsvOhlc } from "../lib/csvOhlc.ts";
// (legacy gross simulateCard removed — replay now uses the SAME realistic engine of record as the result table)
import { PreEventWarning } from "../components/PreEventWarning.tsx";
import { Mt5ConnectPanel } from "../components/Mt5ConnectPanel.tsx";
import type { CChartZone, CChartLine } from "../components/CockpitChart.tsx";
import { loadSimOhlc, loadSimOhlcTail, loadM1Years, loadSimM1Year, loadM1Range, type M1Year } from "../adapters/loadSimOhlc.ts";
import { loadCotrade, type TradeAdvice } from "../adapters/loadCotrade.ts";
import { liveSymbol } from "../lib/mt5DemoAdapter.ts";
import { kidiScan, kidiSummary } from "../lib/kidiEvents.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { TK, InfoTip } from "../components/ui/Ui.tsx";
import { Glyph } from "../components/ui/Glyph.tsx";
import { RealismPanel } from "../components/RealismPanel.tsx";
import { CalibrationPanel } from "../components/CalibrationPanel.tsx";
import { HonestyDashboard } from "../components/HonestyDashboard.tsx";
import { FundingPanel } from "../components/FundingPanel.tsx";
import { StageStepper } from "../components/StageStepper.tsx";
import { sliceForStage, STAGE_LABEL, STAGE_DAYS, STAGE_HINT, STAGE_SOURCE, type Stage } from "../lib/stageWindow.ts";
import { compareCardSummary, type CompareCardSummary } from "../lib/microscopeComputed.ts";
import { recordWindow } from "../lib/cardRunStore.ts";
import { honestyVerdict } from "../lib/simHonesty.ts";
import { computeCardZones } from "../lib/cardZones.ts";
import { loadCustomModules } from "../lib/customModule.ts";
import { useResearchBacktest } from "../lib/researchJobs.ts";
import { ResearchJobStatus } from "../components/ResearchJobStatus.tsx";
import { getCardRuntimeConfig, TF_MINUTES } from "../lib/simTimeframe.ts";
import { chEpisodeSegments } from "../lib/ch/chEpisodeSegments.ts";
import { loadYearAllTfFromM1, type YearAllTf } from "../lib/m1MasterData.ts";
import { loadBrokerCalibration } from "../lib/brokerCalibration.ts";
import type { BrokerCalibrationInput } from "../lib/simCalibration.ts";
import { readStrategyCards, subscribeArtifactChanges } from "../lib/artifactRegistry.ts";

const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const f = (v: any, d = 2) => (v == null || isNaN(+v) ? "—" : (+v).toFixed(d));
const fp = (v: any) => (v == null || isNaN(+v) ? "—" : (+v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const stamp = (iso?: string) => { const m = (iso || "").match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/); return m ? `${MON[+m[2]]} ${m[3]} ${m[4]}` : "—"; };
const TFS = ["M1", "M5", "M15", "H1", "H4", "D1"] as const;

// the 5 active zones + plain-language meaning (colors MATCH what the chart draws)
const ZONE_META = [
  { key: "observation", name: "Observation", color: "#D9B65A", desc: "Structural watch area around price — await confirmation." },
  { key: "risk", name: "Risk / Supply", color: TK.red, desc: "Overhead supply / invalidation side — avoid chasing." },
  { key: "demand", name: "Demand", color: TK.green, desc: "Underlying demand / target reaction zone." },
  { key: "sweep", name: "Sweep Band", color: TK.blue, desc: "Liquidity pool where stop sweeps frequently occur." },
  { key: "invalidation", name: "Invalidation", color: TK.purple, desc: "Structural invalidation level — thesis voids beyond this line." },
];
function Eye({ on, color }: { on: boolean; color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke={on ? color : "#3a4d61"} strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 10 C5 6,15 6,18 10 C15 14,5 14,2 10 Z" /><circle cx="10" cy="10" r="2" />
      {!on && <line x1="3.5" y1="3.5" x2="16.5" y2="16.5" stroke="#63758a" />}
    </svg>
  );
}

function Ring({ value, color, label, size = 88 }: { value: number; color: string; label: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value)); const r = size / 2 - 8, c = 2 * Math.PI * r, off = c * (1 - v / 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TK.s3} strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" transform={`rotate(90 ${size / 2} ${size / 2})`} fontSize="21" fontWeight="800" fill={color} fontFamily="JetBrains Mono, monospace">{Math.round(v)}<tspan fontSize="11">%</tspan></text>
      </svg>
      {label && <div className="pmut" style={{ fontSize: 9, letterSpacing: ".5px", textTransform: "uppercase" }}>{label}</div>}
    </div>
  );
}
function Spark({ bars, color }: { bars: OhlcBar[]; color: string }) {
  if (!bars || bars.length < 2) return <div className="pmut psm">—</div>;
  const cs = bars.map((b) => b.c); const lo = Math.min(...cs), hi = Math.max(...cs), sp = hi - lo || 1;
  const pts = cs.map((c, i) => `${(i / (cs.length - 1) * 100).toFixed(1)},${(28 - (c - lo) / sp * 26).toFixed(1)}`).join(" ");
  return <svg width="100%" height="30" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" /></svg>;
}

export function Microscope() {
  const [simAdv, setSimAdv] = useState<TradeAdvice | null>(null);
  const [liveAdv, setLiveAdv] = useState<TradeAdvice | null>(null);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [tf, setTf] = useState<string>("M15");
  const [source, setSource] = useState<"Live" | "CSV" | "Replay">("Live");
  const [m1Years, setM1Years] = useState<M1Year[]>([]);          // available M1 yearly chunks (11y)
  const [m1Year, setM1Year] = useState("2025");                  // which M1 year to replay
  useEffect(() => { loadM1Years().then((ys) => { if (ys.length) { setM1Years(ys); setM1Year(ys[ys.length - 1].year); } }); }, []);
  const [zoneOn, setZoneOn] = useState<Record<string, boolean>>({ observation: true, risk: true, demand: true, sweep: true, invalidation: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvBars, setCsvBars] = useState<OhlcBar[] | null>(null); const [csvName, setCsvName] = useState(""); const [csvErr, setCsvErr] = useState("");
  function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    file.text().then((text) => { const res = parseCsvOhlc(text); if ("error" in res) { setCsvErr(res.error); setCsvName(""); } else { setCsvBars(res.bars); setBars(res.bars); setSource("CSV"); if (!activeCard && res.tf) setTf(res.tf); setRunning(false); setCursor(null); setCsvErr(""); setCsvName(`${file.name} · ${res.bars.length.toLocaleString()} bars (${res.tf})`); } e.target.value = ""; });
  }
  // ── Strategy Replay Runner: bring a packaged Strategy Card here and run it (Advisory auto / Paper suggest) ──
  const [library, setLibrary] = useState<any[]>(() => readStrategyCards());
  useEffect(() => subscribeArtifactChanges(() => setLibrary(readStrategyCards())), []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [autoCascade, setAutoCascade] = useState(false);   // arriving via Lab "▶ Chạy ở Microscope" → auto-run Y10→M6→M1 then return to Lab
  // arriving from Strategy Lab "▶ Chạy ở Microscope": preselect the card + start in Replay (Y10 first) + auto-run the cascade
  useEffect(() => { try { const pre = localStorage.getItem("mfe_microscope_preselect"); if (pre) { localStorage.removeItem("mfe_microscope_preselect"); setActiveId(pre); setSource("Replay"); setAutoCascade(true); } } catch { /* ignore */ } }, []);   // eslint-disable-line
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [speed, setSpeed] = useState(2);
  // FORCED cascade: one realistic engine on Y10 → M6 → M1. maxStage = highest unlocked (0=only Y10). The user
  // must DUYỆT each window before the next unlocks → can't judge a card on a lucky recent month. Resets per card.
  const [stage, setStage] = useState<Stage>("Y10");
  const [maxStage, setMaxStage] = useState(0);
  const [designBars, setDesignBars] = useState<OhlcBar[] | null>(null);
  const runTimer = useRef<number | null>(null);
  const activeCard = library.find((c: any) => c.id === activeId) || null;
  const [cmpId, setCmpId] = useState<string>("");   // COMPARE: card/Beast thứ 2 chạy song song cùng cửa sổ
  const autoRR = !!(activeCard && Array.isArray(activeCard.modules) && activeCard.modules.includes("auto_rr"));
  // ── REALISTIC SIM (P0): card runs on its OWN design_tf (full sim history), next-open fill + costs ──
  const designTf = activeCard ? getCardRuntimeConfig(activeCard).design_tf : "H1";
  // DOCTRINE: the CARD decides its entry TF (design_tf) — the Chart TF must NOT change which TF the
  // strategy trades on. So when a card is active, LOCK the chart to the card's design_tf (Chart TF = view
  // only / follows the card). The TF selector is free only when no card is loaded. Fixes "entries followed
  // my Chart TF instead of the card deciding".
  useEffect(() => { if (activeCard) setTf(designTf); }, [activeId, designTf]);   // eslint-disable-line
  const [calib, setCalib] = useState<BrokerCalibrationInput | null>(null);
  useEffect(() => { loadBrokerCalibration(getActiveSymbol()).then(setCalib).catch(() => setCalib(null)); }, []);
  const [capital, setCapital] = useState(10000);   // funding mode
  const [riskPct, setRiskPct] = useState(0.75);
  const [customMods] = useState(loadCustomModules);
  const [hardMode, setHardMode] = useState(false);   // HARD broker realism (×cost + min-stop floor) — replay stress test
  useEffect(() => { setStage(source === "Live" ? "M1" : "Y10"); setMaxStage(0); }, [activeId]);   // eslint-disable-line
  // Y10/M6 use the RAW static historical tape (includeExt=false) — NOT the live-backfilled one, so the live
  // feed can't contaminate the historical windows / shift their anchor. M1 (live) reads the live `bars` instead.
  useEffect(() => { if (activeCard) { setDesignBars(null); loadSimOhlc(designTf, false).then((d) => setDesignBars(d?.bars || null)); } }, [activeId, designTf]);
  // SOURCE-split windows (disjoint, time-ordered): Y10/M6 = historical REPLAY tape · M1 = LIVE last-month feed.
  // M1 slices the live bars (so it's the genuine forward month); Y10/M6 slice the historical designBars.
  const stageBars = useMemo(() => {
    if (source === "CSV" && csvBars && csvBars.length) { const sliced = sliceForStage(csvBars, stage); return sliced.length >= 65 ? sliced : csvBars; }
    if (stage === "M1" && source === "Live" && bars && bars.length) return sliceForStage(bars, "M1");
    return sliceForStage(designBars, stage);
  }, [stage, source, bars, csvBars, designBars]);
  // ── P2 INTRABAR (execution_tf < design_tf): run the M1-master path so the card enters EARLY inside the design bar.
  // Only on a tractable REPLAY window (M1 ≈ designBars × TF_MINUTES[designTf] ≤ cap). Y10 / live stay design-close (honest badge).
  const execTf = activeCard ? getCardRuntimeConfig(activeCard).allowed_execution_tf : designTf;
  const wantIntrabar = execTf !== designTf && TF_MINUTES[execTf] < TF_MINUTES[designTf];
  const INTRABAR_M1_CAP = 650_000;   // ~ up to a year of H1 at M1 resolution — keeps resample/group snappy in-browser
  const estM1 = stageBars.length * TF_MINUTES[designTf];
  const intrabarFeasible = wantIntrabar && source === "Replay" && stageBars.length > 60 && estM1 <= INTRABAR_M1_CAP;
  const [m1Win, setM1Win] = useState<OhlcBar[] | null | undefined>(null);   // undefined = loading · null = not loaded/empty · []>60 = ready
  const winFrom = stageBars.length ? String(stageBars[0].t) : "", winTo = stageBars.length ? String(stageBars[stageBars.length - 1].t) : "";
  useEffect(() => {
    if (!intrabarFeasible) { setM1Win(null); return; }
    let alive = true; setM1Win(undefined);
    loadM1Range(winFrom, winTo).then((bs) => { if (alive) setM1Win(bs && bs.length > 60 ? bs : null); }).catch(() => { if (alive) setM1Win(null); });
    return () => { alive = false; };
  }, [intrabarFeasible, winFrom, winTo, execTf]);
  const useM1Job = intrabarFeasible && !!m1Win && m1Win.length > 60;
  const waitingForM1 = intrabarFeasible && m1Win === undefined;
  const researchOptions = { symbol: getActiveSymbol(), chartTf: tf, withWalkForward: stage === "Y10", walkForwardFolds: 5, calibration: calib || undefined, capital, riskPct, customModules: customMods, hard: hardMode };
  const primaryJob = useResearchBacktest(waitingForM1 ? null : useM1Job ? m1Win : stageBars, activeCard, researchOptions, useM1Job ? "m1" : "design", source === "Replay", source, stage);
  const realisticBt = primaryJob.result;
  const cmpCard = library.find((c: any) => c.id === cmpId) || null;
  const compareJob = useResearchBacktest(stageBars, cmpCard, researchOptions, "design", source === "Replay", source, stage);
  const cmpBt = compareJob.result;
  // honest intrabar status for the badge
  const intrabarStatus = !wantIntrabar ? "off"
    : realisticBt?.intrabar ? "on"
    : intrabarFeasible && m1Win === undefined ? "loading"
    : "blocked";   // wanted but window too large / live / load failed → design-close
  const panelBt = realisticBt;
  // lock the stages whose feed ≠ current source (Y10/M6 need Replay, M1 needs Live) + keep stage in sync.
  const sourceLock = useMemo<Partial<Record<Stage, string>>>(() => ({
    Y10: source === "Live" ? "Long-history validation uses the historical Replay source" : undefined,
    M6: source === "Live" ? "Six-month OOS validation uses the historical Replay source" : undefined,
    M1: source !== "Live" ? "The one-month holdout can be historical Replay or an observed forward feed; the receipt identifies its source" : undefined,
  }), [source]);
  useEffect(() => { if (source === "Live") setStage("M1"); else if (stage === "M1") setStage("Y10"); }, [source]);   // eslint-disable-line
  const stageRange = useMemo(() => (stageBars.length ? { from: String(stageBars[0].t).replace("T", " ").slice(0, 16), to: String(stageBars[stageBars.length - 1].t).replace("T", " ").slice(0, 16) } : null), [stageBars]);
  const stageIdx = stage === "M1" ? 2 : stage === "M6" ? 1 : 0;   // M1 reachable only after Y10+M6 are DUYỆT'd (maxStage≥2)
  // six-TF render context (visual only): when a Replay year is picked, resample all 6 TF from one M1 master.
  const [yearAllTf, setYearAllTf] = useState<YearAllTf | null>(null);
  useEffect(() => { if (source === "Replay" && m1Year) { setYearAllTf(null); loadYearAllTfFromM1(m1Year).then(setYearAllTf); } }, [source, m1Year]);
  // ── UNIFIED REPLAY ── the chart, cursor, markers and Trade Log all run on the SAME realistic engine + stage
  // window as the result table below (one engine of record). No more legacy gross sim over the full feed — so the
  // Trade Log count now EQUALS analytics.n (both = realisticBt.sim.trades.length) and the dates match the window.
  const replayBars = (activeCard && realisticBt) ? (realisticBt.designBars ?? stageBars) : (bars ?? []);   // intrabar (M1-master) renders its OWN resampled designBars so markers index-align
  // CH Episode Lens overlay — only when the card carries ch_episode_lens (observer · no engine effect). Indices align: same replayBars array feeds the chart.
  const msEpisodes = useMemo(() => (activeCard?.modules?.includes("ch_episode_lens") && replayBars.length > 30 ? chEpisodeSegments(replayBars, tf) : null), [replayBars, tf, activeId]);   // eslint-disable-line
  const replay = useMemo(() => {
    if (!activeCard || !realisticBt) return { trades: [] as TradeSeg[], markers: [] as { i: number; price: number; kind: string }[] };
    const trades: TradeSeg[] = realisticBt.sim.trades.map((t) => ({ entryI: t.entryI, entry: t.entry_effective, exitI: t.exitI, exit: t.exit_effective ?? t.entry_effective, dir: t.dir, outcome: t.outcome, R: Math.round(t.netR * 100) / 100, t: t.fill_time, why: t.why }));
    return { trades, markers: realisticBt.sim.markers.filter((m) => m.kind === "buy" || m.kind === "sell") };
  }, [activeCard, realisticBt]);
  const lastI = replayBars.length ? replayBars.length - 2 : 0;
  const runDone = cursor != null && cursor >= lastI && replayBars.length > 0;
  const revealed = cursor == null ? [] : replay.trades.filter((t) => t.exitI <= cursor);
  // L6 ZONE modules → real chart geometry, anchored to current structure at the cursor (else last bar).
  const cardZones = useMemo(() => (activeCard && replayBars.length ? computeCardZones(replayBars, Array.isArray(activeCard.modules) ? activeCard.modules : [], { atIndex: cursor ?? undefined }) : []), [activeCard, replayBars, cursor]);
  // SYNC: when this window's realistic result is shown, RECORD it so Strategy Lab reads the SAME numbers.
  useEffect(() => {
    if (!activeCard || !runDone || !realisticBt || stageIdx > maxStage || !stageRange) return;
    const a = realisticBt.analytics;
    const verdict = stage === "Y10" ? honestyVerdict(a, realisticBt.walkForward, realisticBt.calibration?.level ?? "FULLY_PROVISIONAL").trust : "—";
    recordWindow({ ...activeCard, design_tf: designTf }, {
      stage, source, receipt: realisticBt.researchReceipt, config_hash: realisticBt.manifest.config_hash, execution_mode: realisticBt.m1Master ? "m1" : "design", from: stageRange.from, to: stageRange.to, n: stageBars.length,
      trades: a.n, netR: a.netNetR, netPF: a.netPF, winRate: a.netWinRate, maxDD: a.maxDDNetR, verdict,
      driftBlocked: realisticBt.sim.signals_blocked_by_drift_guard, ruined: realisticBt.sim.ruined || undefined, ruinTime: realisticBt.sim.ruined ? realisticBt.sim.ruin_time : undefined, asOf: new Date().toISOString(), hard: hardMode,
    });
  }, [activeId, runDone, realisticBt, stage, maxStage, stageIdx, stageRange, designTf, hardMode]);   // eslint-disable-line
  // AUTO-CASCADE: arriving via the Lab "▶ Chạy ở Microscope" button → run the WHOLE Y10→M6→M1 flow automatically
  // (jump straight to each window's realistic result, which records it), then auto-return to Strategy Lab for deep
  // analysis. Manual use is untouched (autoCascade stays false unless preselected). One engine, one flow, hands-free.
  useEffect(() => {
    if (!autoCascade || !activeCard) return;
    // (a) window loaded but not yet run → jump to its result instantly (records via the SYNC effect above)
    if (cursor == null && replayBars.length > 60 && realisticBt) { setCursor(lastI); return; }
    // (b) window finished → advance to the next stage, or finish + go back to the Lab
    if (runDone && realisticBt && stageIdx <= maxStage) {
      // reset cursor IN THE SAME batch as the stage change so the new window starts fresh (else the previous
      // window's large cursor makes runDone falsely true for the new, shorter window → skips a stage).
      if (stage === "Y10") { setMaxStage((m) => Math.max(m, 1)); setCursor(null); setStage("M6"); }
      // M1 runs in REPLAY too (last month of the clean tape) — deterministic, no live-feed race during the auto-flow.
      else if (stage === "M6") { setMaxStage((m) => Math.max(m, 2)); setCursor(null); setStage("M1"); }
      else if (stage === "M1") {
        setAutoCascade(false);
        // defer the return so React fully commits the M1 record (recordWindow → localStorage) BEFORE Microscope
        // unmounts — otherwise the Lab can mount and read the store a beat too early and miss the last window.
        const cid = activeCard.id;
        window.setTimeout(() => { try { localStorage.setItem("mfe_strategylab_preselect", cid); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "strategy-lab" })); }, 120);
      }
    }
  }, [autoCascade, activeCard, stage, runDone, realisticBt, replayBars.length, cursor, lastI, stageIdx, maxStage]);   // eslint-disable-line
  useEffect(() => {
    if (!running || !replayBars.length) return;
    const inc = speed; // bars per tick — watchable pace (use 8× to fast-forward, ⏭ to jump to the result)
    runTimer.current = window.setInterval(() => { setCursor((c) => { const next = (c == null ? 40 : c) + inc; if (next >= replayBars.length - 2) { setRunning(false); return replayBars.length - 2; } return next; }); }, 110);
    return () => { if (runTimer.current) window.clearInterval(runTimer.current); };
  }, [running, speed, replayBars]);
  useEffect(() => { setRunning(false); setCursor(null); }, [activeId]);
  // changing the cascade window (advance Y10→M6→M1, or click an unlocked stage) HIDES the result again —
  // the user must Play / Kết-quả that window before its Honesty/Funding/Realism surface re-appears.
  useEffect(() => { setRunning(false); setCursor(null); }, [stage]);
  // LIVE SHADOW TEST: when source = Live + a card is chosen, the card runs FORWARD on the live GOLD.i# bars
  // (no replay, no orders) — cursor pinned to the latest bar so every resolved shadow trade + the live
  // performance show and auto-update as new live bars arrive.
  const liveShadow = source === "Live" && !!activeCard && !!liveAdv;
  useEffect(() => { if (liveShadow && replayBars.length > 2) setCursor(replayBars.length - 2); }, [liveShadow, replayBars]);
  function playRun() { if (running) { setRunning(false); return; } if (cursor == null || runDone) setCursor(40); setRunning(true); }
  function resetRun() { setRunning(false); setCursor(null); }

  useEffect(() => { loadCotrade().then((d) => (d ? setSimAdv(d) : setMissing(true))); }, []);
  const liveQuery = useLiveWorkspaceQuery(liveSymbol(getActiveSymbol()), tf, "H1", "", 600, source === "Live");
  useEffect(() => {
    if (source !== "Live") { setLiveAdv(null); return; }
    const bundle = liveQuery.data;
    setLiveAdv(bundle?.account?.connected && freshWorkspaceBars(bundle.bars, tf) && bundle.advice?.ok && bundle.advice.advice ? bundle.advice.advice as TradeAdvice : null);
  }, [source, liveQuery, tf]);
  useEffect(() => {
    let alive = true;
    if (source === "CSV") { if (csvBars && csvBars.length) setBars(csvBars); return; }
    if (source === "Replay") {
      if (tf === "M1" && m1Years.length) { setBars(null); loadSimM1Year(m1Year).then((d) => { if (alive) setBars(d?.bars || null); }); }
      else loadSimOhlc(tf).then((d) => { if (alive) setBars(d?.bars.slice(-70000) || null); });
    } else if (liveQuery.data?.account?.connected && freshWorkspaceBars(liveQuery.data.bars, tf)) setBars(liveQuery.data.bars || null);
    else loadSimOhlcTail(tf, 2000, false).then((d) => { if (alive) setBars(d?.bars || null); });
    return () => { alive = false; };
  }, [tf, source, m1Year, m1Years.length, liveQuery]);
  const kidi = useMemo(() => (bars && bars.length > 5 ? kidiSummary(kidiScan(bars)) : null), [bars]);   // KIDI on the (live) tape
  const adv: TradeAdvice = (source === "Live" && liveAdv) ? liveAdv : {};
  const hasAssessment = source === "Live" && !!liveAdv;
  const isLive = source === "Live" && !!liveQuery.data?.account?.connected && freshWorkspaceBars(liveQuery.data.bars, tf);
  if (missing && !adv) return <div className="pc">
      <ResearchJobStatus pending={primaryJob.pending || compareJob.pending} error={primaryJob.error || compareJob.error} /><div className="mfe-empty"><div className="ic">◫</div><div className="msg">Co-Trade payload not found — NO_DATA honesty.</div></div></div>;
  if (!adv) return <div className="pc"><div className="mfe-empty"><div className="ic">◫</div><div className="msg">Loading…</div></div></div>;

  const bias: any = adv.bias || {}; const ind: any = adv.indicators || {};
  const liq: any = (adv.classic_family && adv.classic_family.liquidity) || {};
  const sellers = /SELL/i.test(bias.side || ""); const buyers = /BUY/i.test(bias.side || "");
  const danger = adv.danger_score != null ? (adv.danger_score <= 1 ? adv.danger_score * 100 : adv.danger_score) : 0;
  const price = bars ? bars[bars.length - 1].c : (adv.price || ind.price || 0);
  const atr = bars && bars.length > 14 ? (() => { let s = 0, c = 0; for (let i = bars.length - 14; i < bars.length; i++) { s += Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); c++; } return s / c; })() : (ind.atr14 || 0);   // primary ATR = real from bars; fallback = advisor/price estimate (no fake 6.7)
  const sgn = buyers ? -1 : 1;
  const Z = (a: number, b: number) => ({ lo: Math.min(price + a * atr, price + b * atr), hi: Math.max(price + a * atr, price + b * atr) });
  const zones: CChartZone[] = [
    { role: "risk", ...Z(1.3 * sgn, 2.0 * sgn), label: "RISK / SUPPLY", color: TK.red },
    { role: "observation", ...Z(0.2 * sgn, 0.9 * sgn), label: "OBSERVATION", color: "#D9B65A" },
    { role: "demand", ...Z(-1.0 * sgn, -0.4 * sgn), label: "DEMAND", color: TK.green },
    { role: "sweep", ...Z(-2.4 * sgn, -2.0 * sgn), label: "SWEEP BAND", color: TK.blue },
  ];
  const lines: CChartLine[] = [{ price: price + 2.5 * sgn * atr, label: `INVALIDATION ${fp(price + 2.5 * sgn * atr)}`, color: TK.purple, dash: true }];
  // when the active card has L6 ZONE modules, draw the CARD's zones (its strategy geometry); else the advisory bands
  const visZones = cardZones.filter(zone => zoneOn[zone.role] !== false);
  const visLines: CChartLine[] = [];
  const mtf = adv.tf_breakdown?.main || [];
  const fitScore = 100 - Math.round(danger); // "market-state fit" gauge (advisory)
  const fitStatus = !hasAssessment ? "NOT ASSESSED" : fitScore >= 75 ? "GOOD FIT" : fitScore >= 50 ? "CONDITIONAL FIT" : fitScore >= 30 ? "EARLY / WATCH" : "HOSTILE";
  const fitCol = fitScore >= 75 ? TK.green : fitScore >= 50 ? TK.teal : fitScore >= 30 ? TK.yellow : TK.red;
  const why = hasAssessment ? String(adv.headline || "See the current source assessment.") : "No current market assessment. The chart and historical research remain available.";

  const ctx = [
    ["Assessment", hasAssessment ? "Current source" : "Unavailable", TK.text2],
    ["Data source", source === "Live" && !isLive ? "Historical fallback" : source, TK.text2],
    ["As of", bars?.length ? bars[bars.length-1].t : "Unavailable", TK.text2],
    ["Path quality", String(ind.path_quality || "Not measured"), TK.text2],
    ["Session", String((adv.session_clock as {session?:string})?.session || "Not provided"), TK.text2],
    ["News window", "See imported calendar", TK.text2],
    ["Calibration", adv.final_probability?.calibration_status || "Not measured", TK.text2],
  ];
  const indicators = [
    ["EMA Trend", !hasAssessment ? "Not provided" : sellers ? "Down" : buyers ? "Up" : "Flat", sellers ? TK.red : buyers ? TK.green : TK.text2],
    ["RSI State", ind.rsi_state || "Not provided", TK.yellow],
    ["ATR(14)", f(atr), TK.text],
    ["ATR / close", price && atr ? f((atr / price) * 100, 2) + "%" : "Not measured", TK.text2],
    ["Sweep Risk", !hasAssessment ? "Not measured" : danger >= 50 ? "High" : "Moderate", danger >= 50 ? TK.red : TK.yellow],
  ];

  return (
    <div className="ms">
      <ResearchJobStatus pending={primaryJob.pending || compareJob.pending} error={primaryJob.error || compareJob.error} />
      <style>{`
        .ms{font-size:13px}
        .ms-ctrl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--mfe-s2);border:1px solid var(--mfe-border);border-radius:10px;padding:7px 10px;margin-bottom:12px;position:sticky;top:54px;z-index:30;box-shadow:0 4px 18px rgba(0,0,0,.35)}
        .ms-seg{display:inline-flex;border:1px solid var(--mfe-border);border-radius:7px;overflow:hidden}
        .ms-seg button{background:transparent;border:none;border-left:1px solid var(--mfe-border);color:var(--mfe-text2);cursor:pointer;font-size:11px;font-weight:700;padding:4px 9px}
        .ms-seg button:first-child{border-left:none}.ms-seg button.on{background:rgba(37,183,255,.16);color:var(--mfe-cyan)}
        .ms-sel{background:var(--mfe-s3);border:1px solid var(--mfe-border);color:var(--mfe-text);border-radius:7px;padding:4px 8px;font-size:11.5px;font-weight:700}
        .ms-grid{display:grid;grid-template-columns:236px 1fr 290px;gap:12px}
        @media(max-width:1280px){.ms-grid{grid-template-columns:1fr}}
        .ms-col{display:flex;flex-direction:column;gap:12px}
        .ms-chart{display:flex;flex-direction:column;min-height:560px}
        .ms-q{flex:1;background:var(--mfe-s3);border:1px solid var(--mfe-border);color:var(--mfe-text2);border-radius:7px;padding:6px 0;font-size:10.5px;font-weight:700;cursor:pointer}
        .ms-q:hover{border-color:#3a4d61;color:var(--mfe-text)}
        .ms-bot{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:12px}
        @media(max-width:1280px){.ms-bot{grid-template-columns:1fr}}
        .ms-mtf{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .az-row{display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-bottom:1px solid #14202c}
        .az-row:last-of-type{border-bottom:none}
        .az-dot{width:11px;height:11px;border-radius:3px;flex-shrink:0;margin-top:3px}
        .az-txt{flex:1;min-width:0}
        .az-name{font-size:11.5px;font-weight:800}
        .az-desc{font-size:10px;color:var(--mfe-muted);line-height:1.42;margin-top:1px}
        .az-eye{background:transparent;border:none;cursor:pointer;padding:3px;display:flex;align-items:center;border-radius:6px}
        .az-eye:hover{background:var(--mfe-s3)}
        .ms-csv{background:#1f6feb;border:none;color:#fff;border-radius:7px;padding:5px 12px;font-size:11.5px;font-weight:700;cursor:pointer}
        .ms-csv:hover{background:#2a7bff}
      `}</style>

      {/* control bar */}
      <div className="ms-ctrl">
        <span className="ms-sel" style={{ fontWeight: 800, color: TK.text, cursor: "default" }}>{getActiveSymbol()}</span>
        <span className="pmut psm" style={{ marginRight: 2 }}>Chart TF:</span>
        <div className="ms-seg">{TFS.map((t) => <button key={t} className={tf === t ? "on" : ""} disabled={!!activeCard} title={activeCard ? "Strategy Card locks Chart TF to its own design_tf. Clear card selection to switch TF freely." : "Select chart timeframe"} onClick={() => setTf(t)}>{t}</button>)}</div>
        {activeCard && <span className="pflag b" style={{ margin: 0 }} title="Entries evaluate on the card's design_tf"><Glyph name="lock" size={12} /> design_tf = {designTf} (locked by card)</span>}
        <div className="ms-seg">{(["Live", "CSV", "Replay"] as const).map((s) => <button key={s} className={source === s ? "on" : ""} onClick={() => { setSource(s); if (s === "CSV" && !csvBars?.length) fileRef.current?.click(); }}>{s}</button>)}</div>
        {source === "Live" && <span className="pflag" style={{ margin: 0, background: isLive ? "rgba(33,208,122,.14)" : "rgba(255,138,42,.12)", color: isLive ? TK.green : TK.orange, border: "1px solid " + (isLive ? TK.green : TK.orange) }}>{isLive ? "● LIVE " + liveSymbol(getActiveSymbol()) : <><Glyph name="warning" size={12} /> SIM · MT5 offline</>}</span>}
        {source === "Replay" && tf === "M1" && m1Years.length > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10.5, color: TK.purple, fontWeight: 700 }}>M1 11y · Year</span>
            <select className="ms-sel" value={m1Year} onChange={(e) => setM1Year(e.target.value)}>{m1Years.map((y) => <option key={y.year} value={y.year}>{y.year} · {Math.round(y.n / 1000)}k bars</option>)}</select>
          </span>
        )}
        <span className="pflag a">SYNTHETIC VOLUME: NOT EVIDENCE</span>
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={onCsvFile} />
        <button className="ms-csv" style={{ marginLeft: "auto" }} title="Import MT5 CSV OHLC file into chart" onClick={() => fileRef.current?.click()}><Glyph name="folder" size={13} /> CSV</button>
        {csvName && <span className="pmut psm" style={{ maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{csvName}</span>}
        {csvErr && <span className="pflag r" style={{ margin: 0 }}><Glyph name="warning" size={12} /> {csvErr}</span>}
      </div>

      <div style={{ marginBottom: 10 }}><Mt5ConnectPanel /></div>

      <div className="ms-grid">
        {/* LEFT context */}
        <div className="ms-col">
          <div className="pc" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div className="pc-h" style={{ alignSelf: "stretch" }}>Market State <span className="mut">now</span></div>
            {hasAssessment ? <Ring value={fitScore} color={fitCol} label="Source assessment" size={96} /> : <div className="product-muted" style={{padding:18}}>Not measured</div>}
            <div style={{ fontWeight: 800, fontSize: 11.5, color: fitCol, letterSpacing: ".6px", marginTop: -2 }}>{fitStatus}</div>
            <div className="pmut psm" style={{ textAlign: "center", lineHeight: 1.45, marginTop: 3 }}><b style={{ color: TK.text2 }}>Why:</b> {why}</div>
          </div>
          <PreEventWarning cleanliness={Math.max(20, Math.round(100 - danger * 0.7))} />
          <div className="pc"><div className={`pc-h ${kidi && kidi.frozen ? "red" : kidi && kidi.total ? "amber" : "green"}`}>KIDI Status <span className="mut">{isLive ? "live tape" : source === "Live" ? "historical fallback" : source.toLowerCase()}</span></div>
            <div className="pkv"><span>Integrity</span><b style={{ color: kidi && kidi.frozen ? TK.red : kidi && kidi.total ? TK.yellow : TK.green }}>{kidi ? (kidi.frozen ? "BLOCK · frozen feed" : kidi.total ? "WARN · " + kidi.total + " events" : "CLEAN") : "—"}</b></div>
            <div className="pkv"><span>Frozen / Range-0</span><b style={{ color: kidi && (kidi.frozen || kidi.rangeZero) ? TK.yellow : TK.muted }}>{kidi ? kidi.frozen + " / " + kidi.rangeZero : "—"}</b></div>
            <div className="pkv"><span>Data gap</span><b style={{ color: kidi && kidi.gap ? TK.orange : TK.muted }}>{kidi ? kidi.gap : "—"}</b></div>
          </div>
          <div className="pc"><div className="pc-h amber">Liquidity / Spread</div>
            <div className="pkv"><span>Spread</span><b>{(adv as any).spread != null ? f((adv as any).spread, 2) + " " : "—"}<span className="pmut">{(adv as any).spread != null ? "Normal" : "no data"}</span></b></div>
            <div className="pkv"><span>Pool above</span><b style={{ color: TK.red }}>{fp(liq.nearest_liquidity_above)}</b></div>
            <div className="pkv"><span>Pool below</span><b style={{ color: TK.blue }}>{fp(liq.nearest_liquidity_below)}</b></div>
          </div>
          <div className="pc">
            <div className="pc-h">
              Quick Actions
              <InfoTip title="Chart Annotations" text="Marks are personal chart annotations only — never execution orders." />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="ms-q">⊙ Mark Obs</button><button className="ms-q"><Glyph name="x" size={12} /> Mark Inval</button>
              <button className="ms-q"><Glyph name="edit" size={12} /> Note</button><button className="ms-q">▣ Screenshot</button>
            </div>
          </div>
        </div>

        {/* CENTER chart */}
        <div className="ms-chart">
          {replayBars.length >= 2
            ? <MicroChart bars={replayBars} zones={visZones} lines={visLines} symbol={isLive ? liveSymbol(getActiveSymbol()) : getActiveSymbol()} tf={tf} live={isLive} cursor={cursor} markers={replay.markers} trades={revealed} episodes={msEpisodes?.bands} formingEpisode={msEpisodes?.forming} />
            : <div className="mfe-empty" style={{ flex: 1 }}><div className="ic">◫</div><div className="msg">Loading {tf} candles…</div></div>}
        </div>

        {/* RIGHT context-now + indicators */}
        <div className="ms-col">
          <div className="pc"><div className="pc-h">Context Now</div>
            {ctx.map(([k, v, c]) => <div key={k as string} className="pkv"><span>{k}</span><b style={{ color: c as string }}>{v}</b></div>)}
          </div>
          <div className="pc"><div className="pc-h violet">Indicator Snapshot</div>
            {indicators.map(([k, v, c]) => <div key={k as string} className="pkv"><span>{k}</span><b style={{ color: c as string }}>{v}</b></div>)}
          </div>
          <div className="pc">
            <div className="pc-h">
              Active Zones <span className="mut">toggle overlays</span>
              <InfoTip title="Zone-Only Overlays" text="Structural reference bands only — not exact order entry prices. Toggle individual zones to declutter the chart." align="right" />
            </div>
            {!cardZones.length && <p className="product-muted">No zone output from the selected Card. Add a supported L6 zone in Canvas.</p>}
            {ZONE_META.filter(meta=>cardZones.some(zone=>zone.role===meta.key)).map((z) => { const on = zoneOn[z.key]; return (
              <div key={z.key} className="az-row" style={{ opacity: on ? 1 : 0.5 }}>
                <span className="az-dot" style={{ background: z.color }} />
                <div className="az-txt"><div className="az-name" style={{ color: z.color }}>{z.name}</div><div className="az-desc">{z.desc}</div></div>
                <button className="az-eye" title={on ? "Visible — click to hide" : "Hidden — click to show"} onClick={() => setZoneOn((s) => ({ ...s, [z.key]: !s[z.key] }))}><Eye on={on} color={z.color} /></button>
              </div>
            ); })}
          </div>
        </div>
      </div>

      <section className="pc" style={{marginTop:12}}><div className="pc-h">Source coverage</div><p className="product-muted">The chart contains {replayBars.length.toLocaleString()} {tf} observations. Other timeframes are not inferred from this chart. No synthetic event timeline or placeholder directional percentage is generated.</p><div className="pkv"><span>As of</span><b>{replayBars.length?replayBars[replayBars.length-1].t:"Not available"}</b></div></section>

      {/* ── Strategy Replay Runner: bring a packaged Strategy Card here & run it ── */}
      <div className="pc" style={{ marginTop: 12, borderColor: liveShadow ? "#1c5b3c" : "#43306a" }}>
        <div className={`pc-h ${liveShadow ? "green" : "violet"}`}>
          {liveShadow ? <><Glyph name="satellite" size={13} /> LIVE SHADOW TEST</> : <><Glyph name="gamepad" size={13} /> Strategy Replay Runner</>}
          <span className="mut">{liveShadow ? "Live shadow tracking on " + liveSymbol(getActiveSymbol()) + " (no real orders)" : "Source: " + source}</span>
          <InfoTip
            title="Strategy Replay & Cascade Runner"
            text="Evaluates your Strategy Card through the One Engine of Record across Y10 → M6 → M1 windows. In Live mode, tracks forward shadow trades without sending broker orders."
          />
        </div>
        {autoCascade && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "7px 11px", borderRadius: 8, background: "rgba(124,92,255,.12)", border: "1px solid #5a4ab8" }}>
            <span style={{ color: "#b3a4ff", fontWeight: 700, fontSize: 12.5 }}> Running automated cascade — {STAGE_LABEL[stage]} · Y10 → M6 → M1 (returns to Strategy Lab upon completion)</span>
            <button className="ms-q" style={{ flex: "none", padding: "4px 10px", marginLeft: "auto" }} onClick={() => setAutoCascade(false)}> Pause Auto</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span className="pmut psm">Strategy Card:</span>
          <select className="ms-sel" disabled={running} value={activeId || ""} onChange={(e) => setActiveId(e.target.value || null)}>
            <option value="">— Select Strategy Card —</option>
            {library.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.archetype}</option>)}
          </select>
          {library.length === 0 && <span className="pmut psm">Library is empty — package a card in Strategy Canvas or load the Starter Card on Home.</span>}
          {library.length > 1 && (
            <select value={cmpId} onChange={(e) => setCmpId(e.target.value)} title="COMPARE: Run a second Card/Beast side-by-side on the exact same window and engine" style={{ background: "#0b141e", border: "1px solid #6b4fd8", borderRadius: 6, color: "var(--mfe-text)", padding: "3px 7px", fontSize: 11.5, marginLeft: 6 }}>
              <option value="">⇄ Compare with… (Beast/Card)</option>
              {library.filter((c: any) => c.id !== activeId).map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.archetype}</option>)}
            </select>
          )}
          {cmpBt && realisticBt && (() => {
            const A = compareCardSummary(realisticBt), B = compareCardSummary(cmpBt);
            const isBeast = (c: any) => String(c?.archetype || "").includes("Beast");
            const pairs: { card: any; s: CompareCardSummary; other: CompareCardSummary; live: boolean }[] = [
              { card: activeCard, s: A, other: B, live: true }, { card: cmpCard, s: B, other: A, live: false },
            ];
            pairs.sort((x, y) => (isBeast(x.card) ? 1 : 0) - (isBeast(y.card) ? 1 : 0));
            const Mini = ({ title, kind, s, other, live, cardId }: { title: string; kind: string; s: CompareCardSummary; other: CompareCardSummary; live: boolean; cardId?: string }) => {
              const edge = s.edge;
              const better = (a: number, b: number, invert = false) => (invert ? a < b : a > b) ? "#21D07A" : "var(--mfe-text)";
              return (
                <div style={{ flex: "1 1 260px", minWidth: 0, border: `1px solid ${edge ? "#21D07A55" : "#FF4D4D55"}`, borderRadius: 8, padding: "8px 10px", background: "#0d1420" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: kind === "BEAST" ? "#a78bfa" : "#25B7FF", border: `1px solid ${kind === "BEAST" ? "#a78bfa" : "#25B7FF"}55`, borderRadius: 4, padding: "1px 6px" }}>{kind}</span>
                    <b style={{ fontSize: 12 }}>{title}</b>
                    {live ? <span style={{ fontSize: 9, fontWeight: 800, color: "#21D07A", marginLeft: "auto" }}>● RUNNER</span>
                      : <button onClick={() => { if (cardId) { setCmpId(activeId || ""); setActiveId(cardId); } }} title="Make this card the primary runner on the chart"
                        style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--mfe-border)", borderRadius: 5, color: "var(--mfe-cyan, #25B7FF)", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", cursor: "pointer" }}> Set Primary Runner</button>}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: edge ? "#21D07A" : "#FF4D4D", marginBottom: 5 }}>{edge ? "POSITIVE NET EDGE (this window)" : "NO NET EDGE AFTER COSTS"}<span className="pmut" style={{ fontWeight: 400, fontSize: 9.5 }}> · {hardMode ? "HARD" : "normal"} · modeled</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, fontSize: 11, fontFamily: "var(--mfe-mono)" }}>
                    <div><div className="pmut" style={{ fontSize: 8.5 }}>NET PF</div><b style={{ color: better(s.pf, other.pf) }}>{s.pf}</b></div>
                    <div><div className="pmut" style={{ fontSize: 8.5 }}>NET R</div><b style={{ color: better(s.netR, other.netR) }}>{s.netR}</b></div>
                    <div><div className="pmut" style={{ fontSize: 8.5 }}>EXP / TRADE</div><b style={{ color: better(s.exp ?? -9, other.exp ?? -9) }}>{s.exp ?? "—"}</b></div>
                    <div><div className="pmut" style={{ fontSize: 8.5 }}>WIN %</div><b style={{ color: better(s.win, other.win) }}>{s.win}%</b></div>
                    <div><div className="pmut" style={{ fontSize: 8.5 }}>MAX DD</div><b style={{ color: better(s.dd, other.dd, true) === "#21D07A" ? "#21D07A" : "var(--mfe-text)" }}>{s.dd}R</b></div>
                    <div><div className="pmut" style={{ fontSize: 8.5 }}>TRADES</div><b>{s.n}</b></div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {[`GROSS PF ${s.grossPf}`, `Cost ${hardMode ? "×HARD" : "PROVISIONAL"}`, "Fill next-open", "advisory · no order"].map((c) => <span key={c} className="pmut" style={{ fontSize: 8.5, border: "1px solid var(--mfe-border)", borderRadius: 4, padding: "1px 5px" }}>{c}</span>)}
                  </div>
                </div>
              );
            };
            return (
              <div style={{ width: "100%", marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#a78bfa", marginBottom: 5 }}>⇄ COMPARE — Dual Honesty Dashboard · Same Window &amp; Engine {intrabarFeasible ? "· ⚠ intrabar active" : "· design-close aligned"}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {pairs.map((p, idx) => <Mini key={idx} title={p.card?.name || "?"} kind={isBeast(p.card) ? "BEAST" : "STRATEGY CARD"} s={p.s} other={p.other} live={p.live} cardId={p.card?.id} />)}
                </div>
              </div>
            );
          })()}
          {activeCard && <span className="pflag b">{activeCard.verdict} · {activeCard.score}%</span>}
          {activeCard && (autoRR ? <span className="pflag g"><Glyph name="gear" size={12} /> Auto R:R</span> : <span className="pflag a">Fixed risk (1 ATR · TP-cap +4R)</span>)}
          {activeCard && <span className="pflag" style={{ margin: 0, background: "rgba(33,208,122,.12)", color: TK.green, border: "1px solid " + TK.green }}>Card TF {designTf} · realistic · next-open · cost ON</span>}
        </div>
        {/* FORCED cascade Y10 → M6 → M1 */}
        {activeCard && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8, padding: "7px 9px", borderRadius: 8, background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)" }}>
            <StageStepper stage={stage} maxStage={maxStage} onStage={setStage} ready={runDone && !!realisticBt} sourceLock={sourceLock}
              onAdvance={() => { setMaxStage((m) => Math.min(2, m + 1)); setStage((s) => (s === "Y10" ? "M6" : "M1")); }} />
            {stage === "M1" && runDone && !!realisticBt && maxStage >= 2 && (
              <button className="ms-csv" style={{ flex: "none", padding: "5px 12px", background: "#1c6b48" }}
                onClick={() => { try { localStorage.setItem("mfe_strategylab_preselect", activeCard.id); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "strategy-lab" })); }}>
                <Glyph name="check" size={12} /> All 3 Windows Complete → Open Strategy Lab
              </button>
            )}
            <span className="pmut psm" style={{ marginLeft: "auto" }}>
              <b style={{ color: STAGE_SOURCE[stage] === "Live" ? "#21D07A" : "#9fd0ff" }}>{STAGE_SOURCE[stage] === "Live" ? <><Glyph name="dot" size={11} color={TK.red} /> LIVE</> : <><Glyph name="tape" size={12} /> REPLAY</>}</b>
              {stageRange ? <> · <b style={{ fontFamily: "var(--mfe-mono)" }}>{stageRange.from} → {stageRange.to}</b></> : ""} · {stageBars.length.toLocaleString()} bars ({designTf})
            </span>
          </div>
        )}

        {/* ⚡ INTRABAR badge */}
        {activeCard && wantIntrabar && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px", borderRadius: 8, fontSize: 11.5, lineHeight: 1.45,
            background: intrabarStatus === "on" ? "rgba(255,138,42,.10)" : intrabarStatus === "loading" ? "rgba(88,166,255,.08)" : "rgba(110,118,129,.08)",
            border: "1px solid " + (intrabarStatus === "on" ? "#FF8A2A66" : intrabarStatus === "loading" ? "#58a6ff44" : "#3a4d6155"),
            color: intrabarStatus === "on" ? "#F4C542" : intrabarStatus === "loading" ? "#9fd0ff" : "var(--mfe-muted)" }}>
            <span style={{ fontSize: 14 }}>{intrabarStatus === "loading" ? "⏳" : "⚡"}</span>
            {intrabarStatus === "on" ? <span><b>Intrabar {designTf} → {execTf} ON</b> · early entry on {execTf} close inside {designTf} · <b>{realisticBt?.intrabar?.entries ?? 0}</b> intrabar entries · M1-master ({(m1Win?.length ?? 0).toLocaleString()} M1 bars) · causal/no-repaint</span>
              : intrabarStatus === "loading" ? <span>Loading M1 tape for intrabar <b>{designTf} → {execTf}</b>…</span>
              : <span><b>Intrabar {designTf} → {execTf} OFF on this window</b> — {source !== "Replay" ? "LIVE source lacks full M1 history" : `M1 window exceeds cap (~${estM1.toLocaleString()} > ${INTRABAR_M1_CAP.toLocaleString()})`}. Running <b>design-close</b>.</span>}
          </div>
        )}

        {activeCard && (
          <>
            {liveShadow ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="pflag g">● LIVE SHADOW · {liveSymbol(getActiveSymbol())} · {tf}</span>
                <span className="pflag a">SHADOW ONLY — No real orders</span>
                <span className="pmut psm pmono" style={{ marginLeft: "auto" }}>{bars && bars.length ? "Latest bar " + stamp(bars[bars.length - 1].t) + " · " + bars.length + " live bars" : "Loading live feed…"}</span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="ms-csv" style={{ background: running ? "#6e40c9" : "#1f6feb" }} onClick={playRun}>{running ? "Pause replay" : cursor == null || runDone ? "Play replay" : "Resume replay"}</button>
                  <button className="ms-q" style={{ flex: "none", padding: "5px 11px" }} onClick={resetRun}>Restart replay</button>
                  <button className="ms-q" style={{ flex: "none", padding: "5px 11px" }} onClick={() => { setRunning(false); setCursor(lastI); }} disabled={!realisticBt || primaryJob.pending || stageIdx > maxStage}>Show results</button>
                  <div className="ms-seg">{[1, 2, 4, 8].map((s) => <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
                  <span className="pmut psm" style={{ fontWeight: 700 }}>Broker Realism:</span>
                  <div className="ms-seg" title="HARD Mode multiplies spread/slippage/swap costs and enforces a 0.6·ATR minimum stop distance.">
                    <button className={!hardMode ? "on" : ""} onClick={() => setHardMode(false)}>Normal</button>
                    <button className={hardMode ? "on" : ""} onClick={() => setHardMode(true)} style={hardMode ? { background: "#f7768e", color: "#1a0d10", borderColor: "#f7768e" } : undefined}><Glyph name="fire" size={13} /> HARD</button>
                  </div>
                  <span className={"pflag " + (hardMode ? "r" : "g")}>{hardMode ? "HARD REPLAY (×Costs + Min Stop)" : "ADVISORY REPLAY (Paper Only)"}</span>
                  <span className="pmut psm pmono" style={{ marginLeft: "auto" }}>{cursor != null && replayBars.length ? `bar ${cursor}/${replayBars.length} · ${stamp(replayBars[Math.min(cursor, replayBars.length - 1)].t)}` : `ready · from ${replayBars.length ? stamp(replayBars[0].t) : "—"}`}</span>
                </div>
                <div className="pbar" style={{ marginTop: 8, height: 9 }}><div style={{ width: cursor != null && replayBars.length ? `${cursor / replayBars.length * 100}%` : "0%", background: TK.purple }} /></div>
              </>
            )}
            <div style={{ marginTop: 10 }}>
              <div className="pc-h" style={{ border: "none", padding: 0, marginBottom: 4 }}>
                {liveShadow ? <><Glyph name="satellite" size={12} /> Live Shadow Trades</> : "Trade Log"}
                <span className="mut">{revealed.length}{replay.trades.length !== revealed.length ? "/" + replay.trades.length : ""} trades{realisticBt && realisticBt.sim.signals_blocked_by_drift_guard > 0 ? " · drift_guard blocked " + realisticBt.sim.signals_blocked_by_drift_guard : ""}</span>
              </div>
              <div style={{ maxHeight: 130, overflowY: "auto" }}>
                {revealed.length ? revealed.slice().reverse().slice(0, 16).map((t, i) => (
                  <div key={i} className="pkv"><span style={{ color: t.dir === "BUY" ? TK.green : TK.red }}>{t.dir === "BUY" ? "▲" : "▼"} {t.dir} · {stamp(t.t)}</span><b style={{ color: t.outcome === "TP" ? TK.green : TK.red }}>{t.outcome} · {t.R > 0 ? "+" : ""}{t.R}R</b></div>
                )) : <div className="pmut psm">No trades revealed yet — use Play replay or Show results.</div>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* M1 (Live) is reachable only AFTER Y10 + M6 are cleared in Replay */}
      {activeCard && stageIdx > maxStage && (
        <div className="pc" style={{ marginTop: 12, borderColor: "#5a3a18" }}>
          <div className="pmut psm"><Glyph name="lock" size={12} /> <b style={{ color: TK.orange }}>{STAGE_LABEL[stage]} is locked.</b> {stage === "M1" ? <>Switch source to <b>Replay</b> and complete <b>Y10 + M6</b> first before unlocking <b>M1</b>.</> : <>Complete the preceding cascade window first.</>}</div>
        </div>
      )}

      {/* ── REALISTIC SIM truth surface ── */}
      {activeCard && runDone && stageIdx <= maxStage && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="pc" style={{ borderColor: STAGE_SOURCE[stage] === "Live" ? "#1c5b3c" : "#43306a" }}>
            <div className="pc-h violet">
              Window Results: {STAGE_LABEL[stage]}
              <span className="pflag" style={{ margin: "0 0 0 6px", background: STAGE_SOURCE[stage] === "Live" ? "rgba(33,208,122,.14)" : "rgba(159,208,255,.12)", color: STAGE_SOURCE[stage] === "Live" ? TK.green : "#9fd0ff", border: "1px solid " + (STAGE_SOURCE[stage] === "Live" ? "#1c5b3c" : "#27506e") }}>{STAGE_SOURCE[stage] === "Live" ? "🔴 LIVE · 1M Forward" : "📼 REPLAY · Historical"}</span>
              <span className="mut">{stage === "Y10" ? "Walk-Forward Enabled" : "Single Window"}</span>
            </div>
            {stageRange && <div className="pmut psm pmono" style={{ marginTop: 2 }}><Glyph name="calendar" size={12} /> Range: <b style={{ color: TK.text2 }}>{stageRange.from} → {stageRange.to}</b> · {stageBars.length.toLocaleString()} bars ({designTf}, {STAGE_DAYS[stage]}d)</div>}
            {realisticBt && realisticBt.sim.signals_blocked_by_drift_guard > 0 && (
              <div style={{ marginTop: 6, padding: "6px 9px", borderRadius: 7, background: "rgba(227,162,58,.10)", border: "1px solid #5a3a18", fontSize: 11.5, color: "#f0d68a" }}>
                <Glyph name="bolt" size={12} /> <b>drift_guard circuit-breaker blocked {realisticBt.sim.signals_blocked_by_drift_guard} signals</b> in this window (rolling 15-trade PF &lt; 0.6).
              </div>
            )}
          </div>
          {source === "Replay" && yearAllTf && (
            <div className="pc" style={{ borderColor: "#1c4a5b" }}>
              <div className="pc-h"><Glyph name="ruler" size={13} /> Six-TF Render <span className="mut">Year {yearAllTf.year} · resampled from one M1 master ({Math.round(yearAllTf.master.bars.length / 1000)}k M1)</span></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["M1", "M5", "M15", "H1", "H4", "D1"] as const).map((t) => { const n = yearAllTf.tfBars[t]?.length || 0; const q = t === "M1" ? null : yearAllTf.resamples[t]; return (
                  <span key={t} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1, border: "1px solid var(--mfe-border)", borderRadius: 7, padding: "5px 11px", background: "var(--mfe-s2)" }}>
                    <b className="pmono" style={{ fontSize: 11, color: TK.cyan }}>{t}</b>
                    <span className="pmono" style={{ fontSize: 10, color: TK.text2 }}>{n.toLocaleString()} bars</span>
                    {q && <span className="pmut" style={{ fontSize: 8.5 }}>{q.gapBars ? q.gapBars + " gap" : "clean"}</span>}
                  </span>
                ); })}
              </div>
            </div>
          )}
          {panelBt ? (cmpBt ? (() => {
            const isBeastCol = (c: unknown) => String((c as { archetype?: string })?.archetype || "").includes("Beast");
            const cols = [{ card: activeCard, bt: panelBt, live: true }, { card: cmpCard, bt: cmpBt, live: false }];
            cols.sort((x, y) => (isBeastCol(x.card) ? 1 : 0) - (isBeastCol(y.card) ? 1 : 0));
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 12, alignItems: "start" }}>
                {cols.map((col, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 8, background: "#0d1420", border: `1px solid ${isBeastCol(col.card) ? "#a78bfa55" : "#25B7FF55"}` }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: isBeastCol(col.card) ? "#a78bfa" : "#25B7FF" }}>{isBeastCol(col.card) ? "BEAST" : "STRATEGY CARD"}</span>
                      <b style={{ fontSize: 12 }}>{(col.card as { name?: string })?.name || "?"}</b>
                      {col.live && <span style={{ fontSize: 9, fontWeight: 800, color: "#21D07A", marginLeft: "auto" }}>● RUNNER</span>}
                    </div>
                    <HonestyDashboard bt={col.bt} />
                    <FundingPanel capital={capital} onCapital={setCapital} riskPct={riskPct} onRiskPct={setRiskPct} analytics={col.bt.analytics} calibrated={col.bt.calibration?.specCalibrated} />
                    <RealismPanel bt={col.bt} />
                  </div>
                ))}
              </div>
            );
          })() : <>
            <HonestyDashboard bt={panelBt} />
            <FundingPanel capital={capital} onCapital={setCapital} riskPct={riskPct} onRiskPct={setRiskPct} analytics={panelBt.analytics} calibrated={panelBt.calibration?.specCalibrated} />
            <RealismPanel bt={panelBt} />
          </>)
            : <div className="pc" style={{ borderColor: "#43306a" }}><div className="pc-h violet"><Glyph name="microscope" size={13} /> Realism · Truth Surface</div><div className="pmut psm">Loading {designTf} tape for {STAGE_LABEL[stage]} realistic backtest…</div></div>}
          <CalibrationPanel />
        </div>
      )}

    </div>
  );
}
