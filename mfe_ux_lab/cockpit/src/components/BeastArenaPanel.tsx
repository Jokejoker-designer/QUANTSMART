// BeastArenaPanel — 1v1 Tactical Trading Card & Beast Duel Arena.
// Runs both combatants through the ONE canonical engine (runRealisticBacktest) on the exact same historical OHLC window
// and identical cost/slippage model. Displays head-to-head TCG stats (ATK, DEF, PF, Win%, Equity Curve overlay) and
// an honest referee diagnosis. SHADOW_ONLY · ADVISORY_ONLY · ORDER_SEND FORBIDDEN.

import { useMemo, useState } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { type SavedBeast } from "../lib/cardBeastV2/beastStore.ts";
import { inferCardRole, inferCardTribes } from "../lib/cardBeastV2/tcgStarterDeck.ts";
import { loadCustomModules } from "../lib/customModule.ts";
import { runRealisticBacktest } from "../lib/realisticSimRun.ts";
import { ROLE_BADGE } from "./StrategyCard.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { InfoTip } from "./ui/Ui.tsx";

export interface ArenaFighterOption {
  key: string;
  id: string;
  name: string;
  kind: "BEAST" | "CARD";
  role: string;
  tribes: string[];
  modules: string[];
  designTf: string;
}

interface DuelMetrics {
  fighter: ArenaFighterOption;
  n: number;
  netR: number;
  exp: number;
  pf: number;
  winRate: number;
  maxDD: number;
  equity: number[];
  score: number; // risk-adjusted composite arena score
}

function sampleEquity(curve: number[], maxPts = 80): number[] {
  if (!curve || curve.length === 0) return [0];
  if (curve.length <= maxPts) return curve;
  const out: number[] = [];
  const step = (curve.length - 1) / (maxPts - 1);
  for (let i = 0; i < maxPts; i++) {
    out.push(curve[Math.round(i * step)] ?? 0);
  }
  return out;
}

export function BeastArenaPanel({
  cards,
  beasts,
  initialLeftKey,
  initialRightKey,
}: {
  cards: { id: string; name: string; role?: unknown; archetype?: string; tribes?: unknown; modules: string[]; design_tf?: string }[];
  beasts: SavedBeast[];
  initialLeftKey?: string;
  initialRightKey?: string;
}) {
  const fighters = useMemo<ArenaFighterOption[]>(() => {
    const out: ArenaFighterOption[] = [];
    for (const b of beasts) {
      out.push({
        key: "beast:" + b.id,
        id: b.id,
        name: b.name,
        kind: "BEAST",
        role: "BEAST",
        tribes: inferCardTribes({ modules: b.modules }),
        modules: b.modules,
        designTf: "M15",
      });
    }
    for (const c of cards) {
      out.push({
        key: "card:" + c.id,
        id: c.id,
        name: c.name,
        kind: "CARD",
        role: inferCardRole(c),
        tribes: inferCardTribes(c),
        modules: c.modules || [],
        designTf: c.design_tf || "M15",
      });
    }
    return out;
  }, [cards, beasts]);

  const [leftKey, setLeftKey] = useState<string>(() => initialLeftKey || fighters[0]?.key || "");
  const [rightKey, setRightKey] = useState<string>(() => initialRightKey || fighters[1]?.key || fighters[0]?.key || "");
  const [tf, setTf] = useState<"M15" | "H1" | "H4">("M15");
  const [hard, setHard] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");
  const [duel, setDuel] = useState<{
    left: DuelMetrics;
    right: DuelMetrics;
    barsCount: number;
    rangeLabel: string;
    tf: string;
    hard: boolean;
  } | null>(null);

  const effLeftKey = fighters.some((f) => f.key === leftKey) ? leftKey : fighters[0]?.key || "";
  const effRightKey = fighters.some((f) => f.key === rightKey) ? rightKey : fighters[1]?.key || fighters[0]?.key || "";

  async function runDuel() {
    const fA = fighters.find((f) => f.key === effLeftKey);
    const fB = fighters.find((f) => f.key === effRightKey);
    if (!fA || !fB) return;
    setBusy(true);
    setErr("");
    try {
      const d = await loadSimOhlc(tf, false);
      const maxBars = tf === "M15" ? 24000 : tf === "H1" ? 12000 : 6000;
      const bars = ((d?.bars || []) as OhlcBar[]).slice(-maxBars);
      if (bars.length < 300) {
        setErr(`Insufficient ${tf} historical bars (${bars.length}).`);
        return;
      }
      await new Promise((r) => setTimeout(r, 20));
      const customs = loadCustomModules();
      const sym = getActiveSymbol();

      const evalFighter = (f: ArenaFighterOption): DuelMetrics => {
        const bt = runRealisticBacktest(
          bars,
          { id: f.id, name: f.name, modules: f.modules, design_tf: tf },
          { symbol: sym, chartTf: tf, customModules: customs, hard }
        );
        const a = bt.analytics;
        const exp = a.n > 0 ? +(a.netNetR / a.n).toFixed(3) : 0;
        const dd = +Math.abs(a.maxDDNetR).toFixed(2);
        // Risk-adjusted arena score: rewards positive expectancy & PF, penalizes deep drawdown or zero trades
        const score = a.n < 10 ? -999 : +(exp * 100 + (a.netPF - 1) * 25 - dd * 0.45).toFixed(1);
        return {
          fighter: f,
          n: a.n,
          netR: +a.netNetR.toFixed(2),
          exp,
          pf: +a.netPF.toFixed(2),
          winRate: +a.netWinRate.toFixed(1),
          maxDD: dd,
          equity: sampleEquity(a.netEquity || [0]),
          score,
        };
      };

      const left = evalFighter(fA);
      const right = evalFighter(fB);
      const t0 = String(bars[0]?.t || "").slice(0, 10);
      const t1 = String(bars[bars.length - 1]?.t || "").slice(0, 10);
      setDuel({ left, right, barsCount: bars.length, rangeLabel: `${t0} -> ${t1}`, tf, hard });
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  const selStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-panel)",
    color: "#F8FAFC",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    minWidth: 220,
    flex: 1,
  };

  return (
    <div className="co-card" style={{ marginBottom: 14, border: "1px solid rgba(168, 85, 247, 0.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 800,
            color: "#E9D5FF",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          <Glyph name="swords" size={14} color="#C084FC" /> TACTICAL DUEL ARENA (1V1 BENCHMARK)
        </span>
        <span className="co-mut" style={{ fontSize: 11.5 }}>
          Head-to-head battle between any two Beasts or Strategy Cards on the exact same historical tape &amp; friction model.
        </span>
        <InfoTip
          title="1v1 Tactical Arena"
          text="Runs both fighters through the canonical realisticStrategySim engine on the identical bar window and cost mode. Evaluates ATK (Expectancy & PF), DEF (Max Drawdown shield), and cumulative R curves."
        />
      </div>

      {/* Fighter Matchup Selector Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr) auto",
          gap: 10,
          alignItems: "center",
          padding: "10px 12px",
          borderRadius: 6,
          background: "var(--bg-card-inner)",
          border: "1px solid var(--border-panel)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--accent-cyan)", letterSpacing: "0.06em" }}>
            FIGHTER A · BLUE CORNER
          </span>
          <select aria-label="Fighter A" value={effLeftKey} onChange={(e) => setLeftKey(e.target.value)} style={selStyle}>
            {fighters.map((f) => (
              <option key={f.key} value={f.key}>
                [{f.kind === "BEAST" ? "BEAST" : f.role.replace("_SENTINEL", "")}] {f.name} ({f.modules.length} mod)
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            background: "rgba(168, 85, 247, 0.18)",
            border: "1px solid rgba(168, 85, 247, 0.45)",
            color: "#E9D5FF",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: "0.08em",
          }}
        >
          VS
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#FBBF24", letterSpacing: "0.06em" }}>
            FIGHTER B · GOLD CORNER
          </span>
          <select aria-label="Fighter B" value={effRightKey} onChange={(e) => setRightKey(e.target.value)} style={selStyle}>
            {fighters.map((f) => (
              <option key={f.key} value={f.key}>
                [{f.kind === "BEAST" ? "BEAST" : f.role.replace("_SENTINEL", "")}] {f.name} ({f.modules.length} mod)
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            aria-label="Arena Timeframe"
            value={tf}
            onChange={(e) => setTf(e.target.value as "M15" | "H1" | "H4")}
            style={{ ...selStyle, minWidth: 78, flex: "none" }}
          >
            <option value="M15">M15</option>
            <option value="H1">H1</option>
            <option value="H4">H4</option>
          </select>
          <button
            onClick={() => setHard((h) => !h)}
            style={{
              background: hard ? "var(--status-danger-bg)" : "var(--bg-elevated)",
              color: hard ? "var(--status-danger-text)" : "#CBD5E1",
              border: `1px solid ${hard ? "var(--status-danger-border)" : "var(--border-panel)"}`,
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
            title="Toggle HARD stress friction (higher spread & adverse slippage)"
          >
            {hard ? "COST: HARD STRESS" : "COST: NORMAL"}
          </button>
          <button
            onClick={runDuel}
            disabled={busy || fighters.length === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(90deg, #0284C7 0%, #7C3AED 100%)",
              color: "#F8FAFC",
              border: "1px solid var(--border-active)",
              borderRadius: 4,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 800,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            <Glyph name="swords" size={13} /> {busy ? "Simulating Duel…" : "Start Arena Duel"}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 10, color: "var(--status-danger-text)", fontSize: 12 }}>
          Arena simulation error: {err}
        </div>
      )}

      {duel && (() => {
        const L = duel.left;
        const R = duel.right;
        const leftWins = L.score > R.score + 0.5;
        const rightWins = R.score > L.score + 0.5;
        const allPts = [...L.equity, ...R.equity, 0];
        const minEq = Math.min(...allPts);
        const maxEq = Math.max(...allPts, minEq + 1);
        const W = 520;
        const H = 140;
        const toPoly = (pts: number[]) =>
          pts
            .map((v, i) => {
              const x = 10 + (i / Math.max(1, pts.length - 1)) * (W - 20);
              const y = H - 14 - ((v - minEq) / (maxEq - minEq || 1)) * (H - 28);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
        const zeroY = H - 14 - ((0 - minEq) / (maxEq - minEq || 1)) * (H - 28);

        const renderFighterCard = (m: DuelMetrics, cornerColor: string, isWinner: boolean) => {
          const rb = ROLE_BADGE[m.fighter.role] || ROLE_BADGE.ATTACKER;
          return (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                background: "var(--bg-card-inner)",
                border: `1px solid ${isWinner ? cornerColor : "var(--border-panel)"}`,
                boxShadow: isWinner ? `0 0 16px ${cornerColor}33` : "none",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    color: rb.color,
                    background: rb.bg,
                    border: `1px solid ${rb.border}`,
                    borderRadius: 4,
                    padding: "1px 6px",
                  }}
                >
                  {m.fighter.role.replace("_SENTINEL", "")}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: isWinner ? "#34D399" : "#94A3B8",
                    background: isWinner ? "rgba(16, 185, 129, 0.16)" : "var(--bg-elevated)",
                    border: `1px solid ${isWinner ? "rgba(16, 185, 129, 0.5)" : "var(--border-subtle)"}`,
                    borderRadius: 4,
                    padding: "1px 7px",
                  }}
                >
                  {isWinner ? "★ ARENA VICTOR" : "CONTENDER"}
                </span>
              </div>
              <b style={{ fontSize: 13.5, color: "#F8FAFC" }}>{m.fighter.name}</b>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {m.fighter.tribes.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#CBD5E1",
                      background: "var(--bg-elevated)",
                      borderRadius: 3,
                      padding: "1px 5px",
                    }}
                  >
                    {t}
                  </span>
                ))}
                <span style={{ fontSize: 9.5, color: "#64748B", marginLeft: "auto", fontFamily: "var(--mfe-mono)" }}>
                  ◆ {m.fighter.modules.length} mod
                </span>
              </div>
              <div className="tcg-stat-grid" style={{ marginTop: 4 }}>
                <div className="tcg-stat-cell">
                  <span className="tcg-stat-lbl">ATK · EXP/TRADE</span>
                  <span className="tcg-stat-val" style={{ color: m.exp >= 0 ? "#34D399" : "#F87171" }}>
                    {m.exp >= 0 ? "+" : ""}
                    {m.exp}R
                  </span>
                </div>
                <div className="tcg-stat-cell">
                  <span className="tcg-stat-lbl">DEF · MAX DD</span>
                  <span className="tcg-stat-val" style={{ color: "#38BDF8" }}>
                    -{m.maxDD}R
                  </span>
                </div>
                <div className="tcg-stat-cell">
                  <span className="tcg-stat-lbl">PF · TRADES</span>
                  <span className="tcg-stat-val">
                    {m.pf} · {m.n}t
                  </span>
                </div>
              </div>
            </div>
          );
        };

        return (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 1.2fr) minmax(0, 1fr)", gap: 12, alignItems: "stretch" }}>
              {renderFighterCard(L, "#22D3EE", leftWins)}

              {/* Center Equity Curve & Stat Comparison */}
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "rgba(7, 11, 20, 0.75)",
                  border: "1px solid var(--border-panel)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8", marginBottom: 4 }}>
                  <span>
                    CUMULATIVE NET R ({duel.barsCount.toLocaleString()} {duel.tf} bars · {duel.hard ? "HARD" : "NORMAL"} cost)
                  </span>
                  <span style={{ fontFamily: "var(--mfe-mono)" }}>{duel.rangeLabel}</span>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, background: "#070B14", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                  <line x1={10} y1={zeroY} x2={W - 10} y2={zeroY} stroke="rgba(148, 163, 184, 0.25)" strokeDasharray="4 3" />
                  <polyline fill="none" stroke="#22D3EE" strokeWidth={2.2} points={toPoly(L.equity)} />
                  <polyline fill="none" stroke="#FBBF24" strokeWidth={2.2} points={toPoly(R.equity)} />
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--mfe-mono)", marginTop: 6 }}>
                  <span style={{ color: "#22D3EE", fontWeight: 700 }}>
                    ● A: {L.netR >= 0 ? "+" : ""}
                    {L.netR}R ({L.winRate}% win)
                  </span>
                  <span style={{ color: "#FBBF24", fontWeight: 700 }}>
                    ● B: {R.netR >= 0 ? "+" : ""}
                    {R.netR}R ({R.winRate}% win)
                  </span>
                </div>
              </div>

              {renderFighterCard(R, "#FBBF24", rightWins)}
            </div>

            {/* Referee Diagnosis Strip */}
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 4,
                background: "var(--bg-card-inner)",
                border: "1px solid var(--border-panel)",
                fontSize: 11.5,
                color: "#CBD5E1",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span>
                <b style={{ color: "var(--accent-cyan)" }}>ARENA REFEREE VERDICT: </b>
                {L.n === 0 && R.n === 0
                  ? "Both fighters produced 0 trades (support-only cards need an Attacker in a Beast Deck to emit setups)."
                  : leftWins
                    ? `${L.fighter.name} leads with ${L.exp >= 0 ? "+" : ""}${L.exp}R/trade (PF ${L.pf}, MaxDD -${L.maxDD}R) vs ${R.fighter.name} (${R.exp >= 0 ? "+" : ""}${R.exp}R/trade, PF ${R.pf}, MaxDD -${R.maxDD}R).`
                    : rightWins
                      ? `${R.fighter.name} leads with ${R.exp >= 0 ? "+" : ""}${R.exp}R/trade (PF ${R.pf}, MaxDD -${R.maxDD}R) vs ${L.fighter.name} (${L.exp >= 0 ? "+" : ""}${L.exp}R/trade, PF ${L.pf}, MaxDD -${L.maxDD}R).`
                      : "Statistical draw — both fighters achieved near-identical risk-adjusted scores on this window."}
              </span>
              <span style={{ fontSize: 10, color: "#64748B" }}>SHADOW_ONLY · Same Engine · Identical Friction</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
