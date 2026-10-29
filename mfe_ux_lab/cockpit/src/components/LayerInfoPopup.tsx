import { useState } from "react";
import { Glyph } from "./ui/Glyph.tsx";

export interface LayerGuideSpec {
  level: number;
  code: string;
  title: string;
  tcgClass: string;
  color: string;
  summary: string;
  meaning: string;
  applications: string[];
  consumes: string;
  emits: string;
  example: string;
  bestPractice: string;
}

export const LAYER_GUIDES: Record<number, LayerGuideSpec> = {
  0: {
    level: 0,
    code: "L0",
    title: "Safety & Data Governance",
    tcgClass: "🔒 Immutable Core Rules",
    color: "#94A3B8",
    summary: "Mandatory pre-flight safety guards that protect every Strategy Card from corrupted data, lookahead bias, and unauthorized execution.",
    meaning:
      "L0 is the non-negotiable foundation of the engine. All 5 L0 guards are permanently locked onto every Strategy Card and run before any L1–L6 calculation.",
    applications: [
      "Rejects bars with NaN, Infinity, negative spreads, or timestamp gaps before indicators run.",
      "Enforces strict closed-bar evaluation (No-Lookahead Seal) so backtests never peek into future candles.",
      "Locks execution to Advisory / DEMO-only governance so custom modules cannot send unverified live orders.",
    ],
    consumes: "Raw OHLCV market feed & timestamp clock",
    emits: "Validated closed-bar stream (or immediate VETO if data is corrupted)",
    example: "If a broker feed drops candles or spikes a corrupted 0-price tick, L0 Data Quality Guard halts evaluation immediately.",
    bestPractice: "Always locked (5/5). You never need to configure L0 manually.",
  },
  1: {
    level: 1,
    code: "L1",
    title: "Primitive Features",
    tcgClass: "🔭 Field Scout (ATK 25 · DEF 40)",
    color: "#38BDF8",
    summary: "Raw, single-purpose measurements extracted directly from OHLC bars (slope, wick ratio, range size, liquidity sweep depth).",
    meaning:
      "L1 translates raw candle geometry into normalized numbers [0..1] or ATR-scaled measurements. It does not make trading decisions—it acts as the sensory eyes of your strategy.",
    applications: [
      "Measure candle anatomy such as upper/lower wick rejection, body-to-range ratio, or micro-sweep depth.",
      "Compute normalized price velocity (EMA slope) or bar range expansion relative to ATR.",
      "Feed clean numerical building blocks upward into L2 Indicators, L3 Quant Formulas, or L4/L5 rules.",
    ],
    consumes: "Validated L0 OHLC bars",
    emits: "Normalized feature series (e.g. feature[0..1] or ATR distance)",
    example: "Build a 'Sweep Depth' L1 feature to measure how far a candle wick pierces below a 20-bar low before closing back inside.",
    bestPractice: "Keep L1 modules simple and single-metric so they can be reused across multiple strategies.",
  },
  2: {
    level: 2,
    code: "L2",
    title: "Technical Indicators & Context",
    tcgClass: "🧭 Structural Navigator (ATK 45 · DEF 55)",
    color: "#A855F7",
    summary: "Multi-bar technical indicators, regime classifiers, and price overlays (EMA Trend, RSI Reclaim, Bollinger, Ichimoku, MACD).",
    meaning:
      "L2 combines price history and L1 features into structured market state signals—identifying whether the market is trending, mean-reverting, compressed, or reclaiming momentum.",
    applications: [
      "Provide primary trend direction (e.g. EMA 20/50 alignment) or momentum recovery (RSI crossing back above 30/50).",
      "Classify volatility compression/expansion using Bollinger Bandwidth or ADX trend strength.",
      "Plot visual overlays on the replay chart while exporting structured indicator states to L3, L4, and L5.",
    ],
    consumes: "L0 OHLC bars + L1 Primitive Features",
    emits: "Indicator series, chart overlays, and directional/regime context states",
    example: "Attach 'RSI Reclaim' and 'EMA Trend' in L2 to confirm that momentum is recovering in the direction of the higher-timeframe trend.",
    bestPractice: "Combine 1 trend indicator + 1 momentum/volatility indicator rather than stacking 5 collinear oscillators.",
  },
  3: {
    level: 3,
    code: "L3",
    title: "Quant Algorithms & Scoring",
    tcgClass: "🧪 Spell Amplifier (ATK 55 · DEF 65)",
    color: "#F97316",
    summary: "Mathematical formulas (AST), Bayesian/Markov probability estimators, Expected Value (EV), and dynamic R:R calculators.",
    meaning:
      "L3 is the quantitative brain of the card. Instead of binary yes/no rules, L3 synthesizes multiple L1/L2 inputs into a continuous conviction score, win-probability estimate, or risk-reward ratio.",
    applications: [
      "Combine multiple L1/L2 signals into a single weighted composite score using the QuantLab AST formula tree.",
      "Estimate setup Expected Value (EV) and regime transition probabilities (Bayesian / Markov).",
      "Require a minimum conviction score in L4/L5 before allowing an entry trigger to fire.",
    ],
    consumes: "L1 Features + L2 Indicators",
    emits: "Continuous Score, Probability [0..1], Expected Value (EV), or R:R target",
    example: "Create an L3 Z-Score / Composite Formula that weights Trend Slope (60%) + Wick Rejection (40%), then require Score > 0.65 in L5.",
    bestPractice: "Use L3 when you want smooth multi-factor scoring rather than rigid all-or-nothing boolean thresholds.",
  },
  4: {
    level: 4,
    code: "L4",
    title: "Market Context Gate",
    tcgClass: "🛡 Counter-Trap Shield (ATK 15 · DEF 89)",
    color: "#FBBF24",
    summary: "Environmental permission gates (Regime, Session Hours, Volatility Filter, Drift Guard) that block trades during hostile market conditions.",
    meaning:
      "L4 never triggers a trade on its own. Instead, it acts as a protective shield (OPEN or CLOSED): if L4 is CLOSED, all L5 entry triggers are blocked—preventing whipsaws in dead sessions or choppy markets.",
    applications: [
      "Filter out flat, choppy markets using Anti-Chop EMA Gap or ATR Volatility Expansion gates.",
      "Restrict trading to high-liquidity institutional hours (e.g. London & New York sessions, 07:00–20:00 UTC).",
      "Block entries when price is already overextended far beyond its mean (Overextension Guard).",
    ],
    consumes: "Session clock, volatility/regime metrics, and L1–L3 evidence",
    emits: "Binary Gate State: OPEN (allow L5 evaluation) or CLOSED (veto entries)",
    example: "Add an L4 'Anti-Chop Trend' gate so your breakout or pullback strategy automatically sits on its hands when the market is flat.",
    bestPractice: "Aim for an L4 Gate Pass Rate between 20% and 75%. If Pass Rate < 2%, your gate is over-filtering.",
  },
  5: {
    level: 5,
    code: "L5",
    title: "Strategy Logic & Explicit Trigger",
    tcgClass: "⚔ Main Attacker / Veto / Exit (ATK 88 · DEF 64)",
    color: "#F87171",
    summary: "The core combat engine of your Strategy Card: defines exact Entry Triggers (ATK), Veto Guards (VETO), and Exit Sentinels (EXIT).",
    meaning:
      "L5 is where trade setups actually fire. When L0 is safe and L4 Gate is OPEN, L5 evaluates your Primary Setup + Confirmation rules to emit READY (Long/Short/Regime), VETO, or EXIT hints.",
    applications: [
      "Define explicit entry archetypes: Trend Pullback, Liquidity Sweep + Reclaim, Range Fade, or Breakout Retest.",
      "Pair a Primary Setup Condition with an optional Confirmation Filter to eliminate false breakouts.",
      "Add dedicated VETO modules (to cancel risky setups) or EXIT Sentinels (to warn when momentum fades).",
    ],
    consumes: "L1–L3 Evidence + L4 Gate Permission + Price Action Patterns",
    emits: "Explicit Trigger (LONG / SHORT / REGIME), VETO block, or EXIT hint",
    example: "Every complete Strategy Card should have at least 1 L5 ATK module (e.g. 'Sweep + Reclaim'); otherwise the engine falls back to a basic EMA crossover.",
    bestPractice: "Always include ≥1 L5 Attacker (ATK) module and pair it with an L4 Context Gate for high-precision selectivity.",
  },
  6: {
    level: 6,
    code: "L6",
    title: "Tactical Zones (Required Output)",
    tcgClass: "🎯 Tactical Field Zone (ATK 42 · DEF 88)",
    color: "#34D399",
    summary: "Required spatial price bands (Demand/Support, Supply/Risk, Observation, Invalidation) anchored to structural levels and scaled by ATR.",
    meaning:
      "L6 translates your strategy's logic into visual price bands on the chart. Every Strategy Card requires at least one L6 Zone to pass the Explainability Gate and define where setups are observed or invalidated.",
    applications: [
      "Project ATR-scaled Demand / Support or Supply / Risk bands around Swing Highs, Swing Lows, or POC.",
      "Define clear Thesis Invalidation boundaries (e.g. -0.5 ATR below Swing Low) so traders see where the setup fails.",
      "Overlay L6 zones alongside L2 indicators and L4/L5 signals on the unified Visualization Hub chart.",
    ],
    consumes: "Structural Anchors (Swing High/Low, POC, Close, or L1–L5 refs) + ATR",
    emits: "Price Band [lo … hi] rendered on chart (Advisory Zone-Only · No Order)",
    example: "Attach an L6 'Demand Zone' (anchored at Swing Low ±0.5 ATR) and an 'Invalidation Zone' (-0.5 ATR below Swing Low) to complete your Card.",
    bestPractice: "Every Card MUST have ≥1 L6 Zone module to unlock [Validate & Evaluate].",
  },
};

export function LayerInfoPopup({
  initialLevel = 4,
  onClose,
  onOpenStudio,
  onFilterLibrary,
}: {
  initialLevel?: number;
  onClose: () => void;
  onOpenStudio?: (lv: number) => void;
  onFilterLibrary?: (lv: number) => void;
}) {
  const [lv, setLv] = useState<number>(initialLevel in LAYER_GUIDES ? initialLevel : 4);
  const spec = LAYER_GUIDES[lv] || LAYER_GUIDES[4];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4, 7, 14, 0.72)",
        backdropFilter: "blur(3px)",
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 95vw)",
          background: "var(--bg-panel, #0F172A)",
          border: `1px solid ${spec.color}88`,
          borderTop: `3px solid ${spec.color}`,
          borderRadius: 12,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.75)",
          padding: "14px 16px",
          color: "#E2E8F0",
        }}
      >
        {/* Top Layer Switcher Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            paddingBottom: 10,
            marginBottom: 12,
            borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: "#94A3B8", marginRight: 4, letterSpacing: ".04em" }}>
              LAYER GUIDE:
            </span>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => {
              const g = LAYER_GUIDES[n];
              const active = n === lv;
              return (
                <button
                  key={n}
                  onClick={() => setLv(n)}
                  style={{
                    cursor: "pointer",
                    borderRadius: 5,
                    padding: "3px 8px",
                    fontSize: 10.5,
                    fontWeight: 900,
                    background: active ? g.color : `${g.color}18`,
                    color: active ? "#070B14" : g.color,
                    border: `1px solid ${active ? g.color : g.color + "55"}`,
                    transition: "all 0.12s ease",
                  }}
                >
                  L{n}
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-card-inner, #131E36)",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              color: "#CBD5E1",
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Glyph name="x" size={11} /> Close
          </button>
        </div>

        {/* Layer Title & TCG Class Badge */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#070B14",
                  background: spec.color,
                  borderRadius: 5,
                  padding: "2px 8px",
                }}
              >
                {spec.code}
              </span>
              <span style={{ fontSize: 15, fontWeight: 900, color: "#F8FAFC" }}>{spec.title}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "#CBD5E1", marginTop: 5, lineHeight: 1.45 }}>{spec.summary}</div>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: spec.color,
              background: `${spec.color}18`,
              border: `1px solid ${spec.color}55`,
              borderRadius: 6,
              padding: "3px 8px",
              whiteSpace: "nowrap",
            }}
          >
            {spec.tcgClass}
          </span>
        </div>

        {/* Core Meaning Box */}
        <div
          style={{
            background: "var(--bg-card-inner, #131E36)",
            border: "1px solid rgba(56, 189, 248, 0.16)",
            borderLeft: `3px solid ${spec.color}`,
            borderRadius: 8,
            padding: "8px 11px",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 900, color: spec.color, letterSpacing: ".04em", marginBottom: 3 }}>
            CORE PURPOSE & ROLE IN STRATEGY CARD
          </div>
          <div style={{ fontSize: 11.5, color: "#E2E8F0", lineHeight: 1.45 }}>{spec.meaning}</div>
        </div>

        {/* Practical Applications */}
        <div
          style={{
            background: "var(--bg-card-inner, #131E36)",
            border: "1px solid rgba(148, 163, 184, 0.14)",
            borderRadius: 8,
            padding: "9px 11px",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 900, color: "#38BDF8", letterSpacing: ".04em", marginBottom: 5 }}>
            PRACTICAL APPLICATIONS (HOW TO USE {spec.code})
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: "#CBD5E1", lineHeight: 1.5 }}>
            {spec.applications.map((item, idx) => (
              <li key={idx} style={{ marginBottom: 3 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Pipeline Input -> Output Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div style={{ background: "rgba(7, 11, 20, 0.7)", border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: 7, padding: "7px 9px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase" }}>
              📥 Consumes (Upstream Input)
            </div>
            <div style={{ fontSize: 11, color: "#E2E8F0", fontWeight: 700, marginTop: 2 }}>{spec.consumes}</div>
          </div>
          <div style={{ background: "rgba(7, 11, 20, 0.7)", border: `1px solid ${spec.color}44`, borderRadius: 7, padding: "7px 9px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: spec.color, textTransform: "uppercase" }}>
              📤 Emits (Downstream Output)
            </div>
            <div style={{ fontSize: 11, color: "#F8FAFC", fontWeight: 700, marginTop: 2 }}>{spec.emits}</div>
          </div>
        </div>

        {/* Example + Best Practice */}
        <div
          style={{
            background: "rgba(16, 185, 129, 0.07)",
            border: "1px solid rgba(16, 185, 129, 0.28)",
            borderRadius: 8,
            padding: "8px 11px",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          <div style={{ color: "#34D399", fontWeight: 800, marginBottom: 2 }}>💡 Concrete Example:</div>
          <div style={{ color: "#CBD5E1", marginBottom: 5 }}>{spec.example}</div>
          <div style={{ color: "#FBBF24", fontWeight: 700, fontSize: 10.5 }}>★ Best Practice: {spec.bestPractice}</div>
        </div>

        {/* Bottom Quick Actions (when opened from Strategy Canvas) */}
        {(onFilterLibrary || (onOpenStudio && lv >= 1)) && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(148, 163, 184, 0.14)" }}>
            {onFilterLibrary && lv >= 1 && (
              <button
                onClick={() => {
                  onFilterLibrary(lv);
                  onClose();
                }}
                style={{
                  background: "var(--bg-card-inner, #131E36)",
                  border: `1px solid ${spec.color}66`,
                  color: spec.color,
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Filter Library to L{lv}
              </button>
            )}
            {onOpenStudio && lv >= 1 && (
              <button
                onClick={() => {
                  onOpenStudio(lv);
                  onClose();
                }}
                style={{
                  background: spec.color,
                  border: `1px solid ${spec.color}`,
                  color: "#070B14",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ⚙ Open Custom L{lv} Studio
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
