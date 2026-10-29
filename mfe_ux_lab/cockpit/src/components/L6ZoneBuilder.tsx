// L6ZoneBuilder — L6 Visualization Hub: build zone (anchor + role + offset/width) + hiển-thị MỌI lớp L1→L6 trên MỘT
// ChartPane qua strategyRenderFeed (pure). Layout flagship 3 cột (parity L2): form+controls · Hub chart · Inspector.
// L6 = zone-only · advisory · KHÔNG order (vắng field = enforcement). Live param + custom màu.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { validateL6Zone, saveCustomL6, loadCustomL6, ZONE_ROLES, type CustomL6Zone, type ZoneRole, type ZoneAnchor } from "../lib/blocks/customL6.ts";
import { listCustomMetrics } from "../lib/customMetricBridge.ts";
import { atrOf, anchorLevel } from "../lib/blocks/l6Eval.ts";
import { l6ToFormulaLab } from "../formulaLab/adapters/tierToFormulaLab.ts";
import { setFormulaLabInput } from "../formulaLab/formulaLabStore.ts";
import { buildLayerPack, parseAiZone } from "../lib/aiContextPack.ts";
import { strategyRenderFeed } from "../lib/blocks/strategyRenderFeed.ts";
import { OVERLAY_INDICATORS, STD_BY_KEY } from "../lib/blocks/stdIndicators.ts";
import { loadCustomModules } from "../lib/customModule.ts";
import { ChartPane } from "./vizkit/ChartPane.tsx";
import { InspRow, InspPass } from "./vizkit/VizKit.tsx";
import { L6_ANCHOR_BLOCKS, L6_RECIPE_BLOCKS, L6_RECIPE_BY_ID } from "../lib/blocks/l6BlockLibrary.ts";
import { LayerInfoPopup } from "./LayerInfoPopup.tsx";

const HUB_PAL = ["#37c0ff", "#e3b341", "#a371f7", "#5ad1c4", "#f7768e", "#58a6ff", "#21d07a", "#ff8fab"];
const inp: React.CSSProperties = {
  background: "var(--bg-card-inner, #131E36)",
  border: "1px solid var(--border-panel, rgba(56,189,248,0.22))",
  color: "var(--mfe-text)",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12,
};
const ROLE_COLOR: Record<ZoneRole, string> = { OBSERVE: "#38bdf8", RISK: "#f87171", DEMAND: "#34d399", INVALIDATE: "#fbbf24" };
const ROLE_EN: Record<ZoneRole, string> = { OBSERVE: "Observation", RISK: "Risk / Supply", DEMAND: "Demand / Support", INVALIDATE: "Invalidation" };
const ROLE_SUB: Record<ZoneRole, string> = {
  DEMAND: "Structural demand / pullback interest band",
  OBSERVE: "Reaction & magnet monitoring band",
  RISK: "Overhead resistance / supply warning band",
  INVALIDATE: "Thesis invalidation boundary",
};
const ANCHOR_LABEL: Record<ZoneAnchor, string> = {
  swing_high: "Swing High",
  swing_low: "Swing Low",
  poc: "Price-occupancy POC",
  evidence: "Evidence L1/L2/L3",
  l5_state: "L5 state",
  price: "Close price",
};

const RECIPE_DEFAULT_META: Record<string, { name: string; explain: string }> = {
  l6z_demand: { name: "L6_DEMAND_ZONE", explain: "Demand band anchored around prior 20-bar swing low" },
  l6z_supply: { name: "L6_SUPPLY_ZONE", explain: "Supply / resistance band anchored around prior 20-bar swing high" },
  l6z_risk: { name: "L6_RISK_BUFFER", explain: "Risk buffer band projected above swing high (+0.3 ATR)" },
  l6z_invalidation: { name: "L6_THESIS_INVALIDATION", explain: "Invalidation boundary below swing low (-0.5 ATR)" },
  l6z_poc_magnet: { name: "L6_POC_MAGNET", explain: "Observation band centered at volume/price occupancy POC" },
};

export function L6ZoneBuilder({ onClose, onSaved }: { onClose: () => void; onSaved?: (savedId?: string) => void }) {
  const evMetrics = useMemo(() => listCustomMetrics(), []);
  const [name, setName] = useState("L6_DEMAND_ZONE");
  const [explain, setExplain] = useState("Demand band anchored around prior 20-bar swing low");
  const [anchor, setAnchor] = useState<ZoneAnchor>("swing_low");
  const [anchorRef, setAnchorRef] = useState<string>(evMetrics[0]?.key ?? "");
  const [role, setRole] = useState<ZoneRole>("DEMAND");
  const [offsetAtr, setOffsetAtr] = useState(0);
  const [widthAtr, setWidthAtr] = useState(0.5);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [activeRecipeId, setActiveRecipeId] = useState<string>("l6z_demand");
  const [showOverlayDrawer, setShowOverlayDrawer] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiJson, setAiJson] = useState("");
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiCopied, setAiCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSafetySeal, setShowSafetySeal] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    loadSimOhlc("M15").then((d) => setBars(d?.bars || null));
  }, []);

  const draft: Partial<CustomL6Zone> = {
    name,
    explain,
    anchor,
    anchorRef: anchor === "evidence" || anchor === "l5_state" ? anchorRef : undefined,
    role,
    offsetAtr,
    widthAtr,
  };
  const valid = validateL6Zone(draft);
  const band = useMemo(() => {
    if (!bars || bars.length < 30) return null;
    const i = bars.length - 1;
    const a = atrOf(bars, i);
    const lvl = anchorLevel(bars, i, anchor, anchorRef) + offsetAtr * a;
    return { lo: lvl - widthAtr * a, hi: lvl + widthAtr * a, lvl, atr: a };
  }, [bars, anchor, anchorRef, offsetAtr, widthAtr]);

  const [hubInds, setHubInds] = useState<{ key: string; color: string; params: Record<string, number> }[]>([]);
  const [hubModuleId, setHubModuleId] = useState("");
  const savedModules = useMemo(() => loadCustomModules().filter((m) => m.level === 4 || m.level === 5), []);
  const savedZones = useMemo(() => loadCustomL6(), [saved]);

  const toggleInd = (key: string) =>
    setHubInds((cur) =>
      cur.some((h) => h.key === key)
        ? cur.filter((h) => h.key !== key)
        : [...cur, { key, color: HUB_PAL[cur.length % HUB_PAL.length], params: {} }],
    );
  const setIndColor = (key: string, color: string) =>
    setHubInds((cur) => cur.map((h) => (h.key === key ? { ...h, color } : h)));
  const setIndParam = (key: string, pn: string, v: number) =>
    setHubInds((cur) => cur.map((h) => (h.key === key ? { ...h, params: { ...h.params, [pn]: v } } : h)));

  const hubFeed = useMemo(() => {
    if (!bars || bars.length < 30) return null;
    const pv = bars.slice(-1500);
    const zones: CustomL6Zone[] = [];
    if (valid.ok) {
      zones.push({
        id: "draft",
        name: name || "draft",
        explain,
        anchor,
        anchorRef: anchor === "evidence" || anchor === "l5_state" ? anchorRef : undefined,
        role,
        offsetAtr,
        widthAtr,
        status: "SHADOW",
        createdAt: "",
      });
    }
    for (const z of savedZones) zones.push(z);
    const decisionModule = hubModuleId ? savedModules.find((m) => m.id === hubModuleId) ?? null : null;
    return { bars: pv, feed: strategyRenderFeed({ bars: pv, indicators: hubInds, zones, decisionModule }) };
  }, [bars, valid.ok, name, explain, anchor, anchorRef, role, offsetAtr, widthAtr, savedZones, hubInds, hubModuleId, savedModules]);

  function save(attachAndClose = false) {
    if (!valid.ok) return;
    const z: CustomL6Zone = {
      id: "l6_" + Date.now().toString(36),
      name: name.trim(),
      explain: explain.trim(),
      anchor,
      anchorRef: draft.anchorRef,
      role,
      offsetAtr,
      widthAtr,
      status: "SHADOW",
      createdAt: new Date().toISOString(),
    };
    saveCustomL6([z, ...loadCustomL6()]);
    setSaved(true);
    onSaved?.(z.id);
    if (attachAndClose) onClose();
  }

  function copyPrompt() {
    try {
      navigator.clipboard?.writeText(buildLayerPack("L6"));
    } catch {
      /* */
    }
    setAiCopied(true);
    setTimeout(() => setAiCopied(false), 1600);
  }

  function importAi() {
    const r = parseAiZone(aiJson);
    if (!r.ok || !r.zone) {
      setAiMsg({ ok: false, text: "✗ " + (r.errors[0] || "Invalid JSON") });
      return;
    }
    saveCustomL6([r.zone, ...loadCustomL6()]);
    setAiMsg({ ok: true, text: `Loaded zone «${r.zone.name}»` });
    onSaved?.(r.zone.id);
  }

  const applyRecipe = (blockId: string) => {
    const rb = L6_RECIPE_BY_ID[blockId];
    if (!rb) return;
    setActiveRecipeId(blockId);
    setAnchor(rb.anchor);
    setRole(rb.role);
    setOffsetAtr(rb.offsetAtr);
    setWidthAtr(rb.widthAtr);
    const meta = RECIPE_DEFAULT_META[blockId];
    if (meta) {
      setName(meta.name);
      setExplain(meta.explain);
    }
    setSaved(false);
  };

  const roleColor = ROLE_COLOR[role];

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-app, #070B14)", zIndex: 130, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box", overflow: "hidden" }}>
      {/* ── Top Header Bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border-panel, rgba(56,189,248,0.22))", paddingBottom: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: "#070B14", background: "#34d399", borderRadius: 4, padding: "3px 8px", letterSpacing: ".06em" }}>
          L6 STUDIO
        </span>
        <div>
          <b style={{ color: "#f8fafc", fontSize: 14 }}>Tactical Zone & Geometry Builder (L6)</b>
          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 10 }}>
            Step-by-step spatial zone builder — anchors a price band to structural swings, POC, or evidence
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#34d399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 4, padding: "2px 8px", fontWeight: 800 }}>
            🎯 TACTICAL ZONE · DEF 88
          </span>
          <span style={{ fontSize: 10, color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.35)", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>
            ZONE-ONLY · NO ORDER
          </span>
          <button
            onClick={() => setGuideOpen(true)}
            style={{ ...inp, cursor: "pointer", color: "#34d399", borderColor: "rgba(52,211,153,0.45)", background: "rgba(52,211,153,0.12)", fontSize: 11, fontWeight: 800 }}
          >
            ⓘ L6 Layer Guide
          </button>
          <button
            onClick={() => {
              if (!bars || !valid.ok) return;
              const z: CustomL6Zone = {
                id: "l6_" + Date.now().toString(36),
                name: name.trim(),
                explain: explain.trim(),
                anchor,
                anchorRef: draft.anchorRef,
                role,
                offsetAtr,
                widthAtr,
                status: "SHADOW",
                createdAt: "",
              };
              setFormulaLabInput(l6ToFormulaLab(z, bars));
              onClose();
              window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "formula-lab" }));
            }}
            disabled={!valid.ok || !bars}
            style={{ ...inp, cursor: valid.ok && bars ? "pointer" : "default", color: "#c084fc", borderColor: "rgba(192,132,252,0.4)", fontSize: 11, fontWeight: 700 }}
          >
            <Glyph name="ruler" size={12} /> Coordinate Lab
          </button>
          <button onClick={onClose} style={{ ...inp, cursor: "pointer", fontWeight: 700 }}>
            <Glyph name="x" size={12} /> Close
          </button>
        </div>
      </div>

      {/* ── Main 3-Column Studio Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "335px 1fr 320px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* ── LEFT COLUMN: 3 Clear Steps + Collapsible Optional Drawers ── */}
        <div style={{ overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* STEP 1: 1-Click Zone Templates */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399", letterSpacing: ".04em" }}>
                STEP 1 · 1-CLICK ZONE TEMPLATES
              </span>
              <span style={{ fontSize: 9.5, color: "#94a3b8" }}>Auto-fills anchor + width</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {L6_RECIPE_BLOCKS.map((rb) => {
                const active = activeRecipeId === rb.blockId && anchor === rb.anchor && role === rb.role;
                const c = ROLE_COLOR[rb.role];
                return (
                  <button
                    key={rb.blockId}
                    onClick={() => applyRecipe(rb.blockId)}
                    style={{
                      textAlign: "left",
                      padding: "7px 8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: active ? `${c}1f` : "var(--bg-card-inner, #131E36)",
                      border: active ? `1px solid ${c}` : "1px solid rgba(148,163,184,0.16)",
                      color: "#e2e8f0",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: active ? c : "#f1f5f9" }}>{rb.label}</div>
                    <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 2 }}>{rb.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: Zone Role & Structural Anchor */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#34d399", letterSpacing: ".04em", marginBottom: 8 }}>
              STEP 2 · ZONE ROLE & ANCHOR POINT
            </div>

            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
              Zone Role (Color & Tactical Purpose):
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 10 }}>
              {ZONE_ROLES.map((r) => {
                const on = r === role;
                const c = ROLE_COLOR[r];
                return (
                  <button
                    key={r}
                    onClick={() => {
                      setRole(r);
                      setSaved(false);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: on ? `${c}22` : "var(--bg-card-inner, #131E36)",
                      border: on ? `1px solid ${c}` : "1px solid rgba(148,163,184,0.16)",
                    }}
                  >
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: on ? c : "#e2e8f0" }}>{ROLE_EN[r]}</div>
                    <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1 }}>{ROLE_SUB[r]}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
              Structural Anchor Reference:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {L6_ANCHOR_BLOCKS.map((ab) => {
                const on = anchor === ab.anchor;
                return (
                  <button
                    key={ab.blockId}
                    onClick={() => {
                      setAnchor(ab.anchor);
                      setSaved(false);
                    }}
                    title={ab.description}
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: on ? "rgba(56,189,248,0.18)" : "var(--bg-card-inner, #131E36)",
                      border: on ? "1px solid #38bdf8" : "1px solid rgba(148,163,184,0.16)",
                      color: on ? "#38bdf8" : "#cbd5e1",
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    {ab.label}
                  </button>
                );
              })}
            </div>

            {(anchor === "evidence" || anchor === "l5_state") && (
              <label style={{ display: "block", fontSize: 10.5, color: "#94a3b8", marginTop: 8 }}>
                Reference Module ID
                <select
                  style={{ ...inp, width: "100%", marginTop: 3 }}
                  value={anchorRef}
                  onChange={(e) => setAnchorRef(e.target.value)}
                >
                  {evMetrics.length ? (
                    evMetrics.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label} · {m.layer}
                      </option>
                    ))
                  ) : (
                    <option value="">No reference evidence; build L1, L2 or L3 first</option>
                  )}
                </select>
              </label>
            )}
          </div>

          {/* STEP 3: Interactive ATR Geometry & Zone Identity */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#34d399", letterSpacing: ".04em", marginBottom: 8 }}>
              STEP 3 · ATR GEOMETRY & ZONE IDENTITY
            </div>

            {/* Interactive Offset Slider */}
            <div style={{ background: "var(--bg-card-inner, #131E36)", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 6, padding: "7px 9px", marginBottom: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10.5, marginBottom: 4 }}>
                <span style={{ color: "#cbd5e1", fontWeight: 700 }}>Offset from Anchor (ATR)</span>
                <span style={{ color: "#38bdf8", fontFamily: "var(--mfe-mono)", fontWeight: 800 }}>
                  {offsetAtr >= 0 ? `+${offsetAtr.toFixed(1)}` : offsetAtr.toFixed(1)} ATR
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={-2.0}
                  max={2.0}
                  step={0.1}
                  value={offsetAtr}
                  onChange={(e) => {
                    setOffsetAtr(+e.target.value);
                    setSaved(false);
                  }}
                  style={{ flex: 1, accentColor: "#38bdf8", cursor: "pointer" }}
                />
                <input
                  type="number"
                  step="0.1"
                  value={offsetAtr}
                  onChange={(e) => {
                    setOffsetAtr(+e.target.value);
                    setSaved(false);
                  }}
                  style={{ ...inp, width: 64, padding: "3px 6px", fontSize: 11, fontFamily: "var(--mfe-mono)" }}
                />
              </div>
            </div>

            {/* Interactive Width Slider */}
            <div style={{ background: "var(--bg-card-inner, #131E36)", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 6, padding: "7px 9px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10.5, marginBottom: 4 }}>
                <span style={{ color: "#cbd5e1", fontWeight: 700 }}>Zone Half-Width (±ATR)</span>
                <span style={{ color: "#34d399", fontFamily: "var(--mfe-mono)", fontWeight: 800 }}>
                  ±{widthAtr.toFixed(1)} ATR
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0.1}
                  max={2.5}
                  step={0.1}
                  value={widthAtr}
                  onChange={(e) => {
                    setWidthAtr(Math.max(0.1, +e.target.value));
                    setSaved(false);
                  }}
                  style={{ flex: 1, accentColor: "#34d399", cursor: "pointer" }}
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={widthAtr}
                  onChange={(e) => {
                    setWidthAtr(Math.max(0.1, +e.target.value));
                    setSaved(false);
                  }}
                  style={{ ...inp, width: 64, padding: "3px 6px", fontSize: 11, fontFamily: "var(--mfe-mono)" }}
                />
              </div>
            </div>

            {band && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 6, background: `${roleColor}14`, border: `1px solid ${roleColor}44`, marginBottom: 8, fontSize: 10.5 }}>
                <span style={{ color: "#cbd5e1", fontWeight: 700 }}>Live Calculated Band:</span>
                <span style={{ color: roleColor, fontFamily: "var(--mfe-mono)", fontWeight: 800 }}>
                  [{band.lo.toFixed(1)} … {band.hi.toFixed(1)}]
                </span>
              </div>
            )}

            <label style={{ display: "block", fontSize: 10.5, color: "#94a3b8", marginBottom: 6 }}>
              Zone Identifier
              <input
                style={{ ...inp, width: "100%", marginTop: 3, boxSizing: "border-box", fontWeight: 700 }}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label style={{ display: "block", fontSize: 10.5, color: "#94a3b8" }}>
              Plain-English Summary
              <input
                style={{ ...inp, width: "100%", marginTop: 3, boxSizing: "border-box" }}
                value={explain}
                onChange={(e) => setExplain(e.target.value)}
              />
            </label>
            {!valid.ok && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#f87171" }}>
                <Glyph name="warning" size={10} /> {valid.errors.join(" · ")}
              </div>
            )}
          </div>

          {/* Collapsible Drawer 1: Optional Chart Comparison Overlays */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: "8px 10px" }}>
            <button
              onClick={() => setShowOverlayDrawer((v) => !v)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 0,
              }}
            >
              <span>👁 Optional Chart Comparison Overlays ({hubInds.length + (hubModuleId ? 1 : 0)})</span>
              <span>{showOverlayDrawer ? "▾" : "▸"}</span>
            </button>
            {showOverlayDrawer && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                <div style={{ fontSize: 9.5, color: "#94a3b8", marginBottom: 6 }}>
                  Compare your L6 Zone against standard indicators or saved L4/L5 modules on the preview chart:
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                  {OVERLAY_INDICATORS.map((spec) => {
                    const active = hubInds.some((h) => h.key === spec.key);
                    return (
                      <button
                        key={spec.key}
                        onClick={() => toggleInd(spec.key)}
                        title={spec.context}
                        style={{
                          ...inp,
                          cursor: "pointer",
                          fontSize: 10,
                          padding: "2px 7px",
                          background: active ? "rgba(37,183,255,.18)" : "var(--bg-card-inner, #131E36)",
                          color: active ? TK.cyan : "var(--mfe-text2)",
                        }}
                      >
                        {active ? (
                          <>
                            <Glyph name="check" size={10} />{" "}
                          </>
                        ) : (
                          "+ "
                        )}
                        {spec.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
                {hubInds.map((h) => {
                  const spec = STD_BY_KEY[h.key];
                  if (!spec) return null;
                  return (
                    <div key={h.key} style={{ border: "1px solid #1c232c", borderRadius: 6, padding: "5px 6px", marginTop: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="color"
                          value={h.color}
                          onChange={(e) => setIndColor(h.key, e.target.value)}
                          title="custom color"
                          style={{ width: 22, height: 18, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                        />
                        <b style={{ color: h.color, fontSize: 10.5 }}>{spec.name}</b>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                        {spec.params.map((pr) => (
                          <label key={pr.name} className="pmut" style={{ fontSize: 9 }}>
                            {pr.label}
                            <input
                              type="number"
                              value={h.params[pr.name] ?? pr.def}
                              min={pr.min}
                              max={pr.max}
                              step={pr.step ?? 1}
                              onChange={(e) => setIndParam(h.key, pr.name, +e.target.value)}
                              style={{ ...inp, width: 52, marginLeft: 3, padding: "1px 4px" }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9.5, color: "#94a3b8", marginBottom: 3 }}>Overlay L4/L5 Decision Layer:</div>
                  <select value={hubModuleId} onChange={(e) => setHubModuleId(e.target.value)} style={{ ...inp, width: "100%", fontSize: 11 }}>
                    <option value="">None: zone and indicator only</option>
                    {savedModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.role}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Collapsible Drawer 2: External AI JSON Import */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: "8px 10px" }}>
            <button
              onClick={() => setAiOpen((v) => !v)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 0,
              }}
            >
              <span>⚙ External AI JSON Import / Prompt</span>
              <span>{aiOpen ? "▾" : "▸"}</span>
            </button>
            {aiOpen && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <button
                    onClick={copyPrompt}
                    style={{ ...inp, cursor: "pointer", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 700, fontSize: 10.5 }}
                  >
                    {aiCopied ? "✓ Copied Prompt" : "Copy L6 AI Prompt"}
                  </button>
                </div>
                <textarea
                  value={aiJson}
                  onChange={(e) => {
                    setAiJson(e.target.value);
                    setAiMsg(null);
                  }}
                  placeholder="Paste zone JSON with anchor, role, offsetAtr and widthAtr."
                  style={{ ...inp, width: "100%", minHeight: 48, fontFamily: "var(--mfe-mono)", fontSize: 10.5, boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
                  <button
                    onClick={importAi}
                    disabled={!aiJson.trim()}
                    style={{
                      ...inp,
                      cursor: aiJson.trim() ? "pointer" : "default",
                      background: aiJson.trim() ? "#238636" : "#20262d",
                      color: "#fff",
                      border: "none",
                      fontWeight: 700,
                      fontSize: 10.5,
                    }}
                  >
                    Import JSON
                  </button>
                  {aiMsg && <span style={{ fontSize: 10.5, color: aiMsg.ok ? "#3fb950" : "#f85149" }}>{aiMsg.text}</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER COLUMN: Plain-English Zone Formula Banner + Tall Hub Chart ── */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", gap: 10 }}>
          {/* Plain-English Zone Formula Banner */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: `1px solid ${roleColor}55`, borderLeft: `4px solid ${roleColor}`, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "#070B14", background: roleColor, borderRadius: 4, padding: "2px 6px" }}>
                {ROLE_EN[role].toUpperCase()}
              </span>
              <span style={{ color: "#e2e8f0" }}>
                Anchored at <b style={{ color: "#38bdf8" }}>{ANCHOR_LABEL[anchor]}</b>{" "}
                {offsetAtr !== 0 ? (
                  <span>
                    shifted by <b>{offsetAtr > 0 ? `+${offsetAtr}` : offsetAtr} ATR</b>
                  </span>
                ) : (
                  <span>(0.0 ATR offset)</span>
                )}{" "}
                with half-width <b style={{ color: "#34d399" }}>±{widthAtr} ATR</b>
              </span>
            </div>
            {band && (
              <span style={{ fontSize: 11, fontFamily: "var(--mfe-mono)", fontWeight: 800, color: roleColor, background: `${roleColor}18`, border: `1px solid ${roleColor}44`, borderRadius: 5, padding: "2px 8px" }}>
                Band: [{band.lo.toFixed(1)} … {band.hi.toFixed(1)}]
              </span>
            )}
          </div>

          {/* Hub Chart Card */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 10, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11.5, color: "#e2e8f0", fontWeight: 700 }}>
                <Glyph name="monitor" size={11} /> Live L6 Tactical Zone Preview (M15 Replay)
              </div>
              <span style={{ fontSize: 9.5, color: "#94a3b8" }}>
                Shaded band renders your active L6 Zone · Causal bar-by-bar geometry
              </span>
            </div>
            {hubFeed ? (
              <>
                <ChartPane
                  bars={hubFeed.bars}
                  replay
                  overlays={hubFeed.feed.overlays}
                  markers={hubFeed.feed.markers}
                  oscillator={hubFeed.feed.oscillator}
                  height={405}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(148,163,184,0.14)", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8" }}>
                      VISIBLE LAYERS ({hubFeed.feed.layers.length}):
                    </span>
                    {hubFeed.feed.layers.length ? (
                      hubFeed.feed.layers.map((l) => (
                        <span key={l.id} style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5, color: "#cbd5e1" }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                          {l.label}
                        </span>
                      ))
                    ) : (
                      <span className="pmut psm">Enable a zone or overlay to render on chart.</span>
                    )}
                  </div>
                  {hubFeed.feed.warnings.length > 0 && (
                    <span style={{ fontSize: 9.5, color: TK.orange }}>
                      <Glyph name="warning" size={9} /> {hubFeed.feed.warnings.join(" · ")}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="pmut psm" style={{ padding: 12 }}>
                Loading M15 bars…
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Tactical TCG L6 Zone Card Preview + Save & Attach CTA ── */}
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Tactical TCG Zone Card Preview */}
          <div style={{ background: "linear-gradient(180deg, rgba(52,211,153,0.12) 0%, rgba(15,23,42,0.96) 100%)", border: `1px solid ${roleColor}66`, borderTop: `3px solid ${roleColor}`, borderRadius: 10, padding: 12, boxShadow: "0 10px 24px rgba(0,0,0,0.35)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 900, color: "#070B14", background: roleColor, borderRadius: 4, padding: "2px 6px", letterSpacing: ".05em" }}>
                TACTICAL ZONE · L6
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#34d399", fontFamily: "var(--mfe-mono)" }}>
                ATK 42 · DEF 88
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc", marginBottom: 3 }}>{name || "UNNAMED_ZONE"}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10, lineHeight: 1.35 }}>{explain}</div>

            <div style={{ background: "rgba(7,11,20,0.65)", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 6, padding: "7px 9px", marginBottom: 12 }}>
              <InspRow k="Zone Role" v={ROLE_EN[role]} c={roleColor} />
              <InspRow k="Anchor Point" v={ANCHOR_LABEL[anchor]} c="#38bdf8" />
              <InspRow k="Offset / Width" v={`${offsetAtr >= 0 ? "+" : ""}${offsetAtr} ATR / ±${widthAtr} ATR`} />
              <InspRow k="Current Band" v={band ? `[${band.lo.toFixed(1)} … ${band.hi.toFixed(1)}]` : "—"} c={roleColor} />
            </div>

            <button
              onClick={() => save(true)}
              disabled={!valid.ok}
              style={{
                ...inp,
                width: "100%",
                cursor: valid.ok ? "pointer" : "not-allowed",
                background: valid.ok ? "linear-gradient(135deg, #059669, #0284c7)" : "var(--mfe-s3)",
                color: valid.ok ? "#fff" : "var(--mfe-muted)",
                border: valid.ok ? "1px solid #34d399" : "none",
                fontWeight: 800,
                padding: "9px 12px",
                fontSize: 12,
                boxShadow: valid.ok ? "0 4px 14px rgba(5,150,105,0.35)" : "none",
              }}
            >
              <Glyph name="check" size={12} /> Save & Attach to L6 Lane
            </button>
            <button
              onClick={() => save(false)}
              disabled={!valid.ok}
              style={{
                ...inp,
                width: "100%",
                marginTop: 6,
                cursor: valid.ok ? "pointer" : "not-allowed",
                background: saved ? "#1c5b3c" : "rgba(30,41,59,0.8)",
                color: valid.ok || saved ? "#cbd5e1" : "var(--mfe-muted)",
                border: "1px solid var(--border-panel)",
                fontWeight: 700,
                padding: "6px 10px",
                fontSize: 11,
              }}
            >
              {saved ? (
                <>
                  <Glyph name="check" size={12} /> Saved to Library (Shadow)
                </>
              ) : (
                <>
                  <Glyph name="save" size={12} /> Save to Library Only
                </>
              )}
            </button>
          </div>

          {/* Compact Readiness & Safety Accordion */}
          <div style={{ background: "var(--bg-panel, #0F172A)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", marginBottom: 6, letterSpacing: ".04em" }}>
              ZONE READINESS CHECKS
            </div>
            <InspPass k="Zone geometry valid" ok={valid.ok} />
            <InspPass k="Live band computed on M15" ok={!!band} />
            <InspPass k="Required L6 output ready for Card" ok={valid.ok} />

            <button
              onClick={() => setShowSafetySeal((s) => !s)}
              style={{
                marginTop: 8,
                width: "100%",
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.28)",
                borderRadius: 6,
                padding: "5px 8px",
                color: "#34d399",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>🛡 Safety & Contract Seal (5/5 PASS)</span>
              <span>{showSafetySeal ? "▾" : "▸"}</span>
            </button>
            {showSafetySeal && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                <InspRow k="Authority" v="Display zones only" c={TK.orange} />
                <InspRow k="Not intended for" v="Order / entry / SL-TP" c="#f87171" />
                <InspPass k="KIDI Safe" />
                <InspPass k="NaN / Inf Guard" />
                <InspPass k="No-Lookahead Seal" />
                <InspPass k="Closed-Bar Only" />
                <InspPass k="Zone-only · No Order" />
              </div>
            )}
          </div>
        </div>
      </div>
      {guideOpen && <LayerInfoPopup initialLevel={6} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
