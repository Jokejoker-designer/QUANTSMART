// BlockModuleLibrary — Tactical TCG Equip / Spell / Trap Module Armory (#blocks-modules).
// Displays (1) all 37 Engine Modules classified by Role + Tribe + Real Impact & Dilution Warnings,
// (2) User & Starter Block-Composed Custom Modules, (3) 1-Click Block-Composed Presets, and (4) L1 Primitive Blocks.
// Advisory · zone-only · SHADOW-until-proven.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { MODULE_CENSUS, IMPORT_CANDIDATES, roleCensus } from "../lib/cardBeastV2/moduleRoleCensus.ts";
import { METRICS, MODULE_PRESETS, loadCustomModules, saveCustomModules, validateModule, type CustomModule } from "../lib/customModule.ts";
import { BlockGroupsExplainer } from "./BlockGroupsExplainer.tsx";
import { BLOCKS } from "../lib/blocks/blockLibrary.ts";
import { readStrategyCards, subscribeArtifactChanges, type StrategyCardArtifactRecord } from "../lib/artifactRegistry.ts";
import { SemanticXraySandbox, type SemanticSandboxTarget } from "./SemanticXraySandbox.tsx";
import { ROLE_BADGE } from "./StrategyCard.tsx";
import { ensureStarterCustomModules, getModuleImpact, seedTcgStarterDeck } from "../lib/cardBeastV2/tcgStarterDeck.ts";

const ROLE_COLOR: Record<string, string> = {
  ATTACKER: "#FBBF24",
  GUARD: "#F87171",
  CONFIRMATION: "#34D399",
  SCOUT: "#22D3EE",
  EXIT_SENTINEL: "#C084FC",
  FALLBACK: "#38BDF8",
  SAFETY: "#34D399",
  NONE: "#94A3B8",
};

const chip = (txt: string, color: string, title = "") => (
  <span
    key={txt + color}
    title={title}
    style={{
      fontSize: 9.5,
      fontWeight: 800,
      color,
      background: "rgba(15, 23, 42, 0.7)",
      border: `1px solid ${color}55`,
      borderRadius: 4,
      padding: "1px 6px",
      marginRight: 4,
    }}
  >
    {txt}
  </span>
);

export function BlockModuleLibrary() {
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [showExplain, setShowExplain] = useState(false);
  const [xray, setXray] = useState<SemanticSandboxTarget | null>(null);
  const [blockQuery, setBlockQuery] = useState("");
  const [cards, setCards] = useState<StrategyCardArtifactRecord[]>(readStrategyCards);
  const [customs, setCustoms] = useState<CustomModule[]>(() => {
    const r = ensureStarterCustomModules();
    return r.all;
  });
  const [banner, setBanner] = useState("");

  useEffect(
    () =>
      subscribeArtifactChanges(() => {
        setCards(readStrategyCards());
        setCustoms(loadCustomModules());
      }),
    []
  );

  const census = useMemo(() => roleCensus(), []);
  const roles = ["ALL", "ATTACKER", "GUARD", "CONFIRMATION", "SCOUT", "EXIT_SENTINEL", "FALLBACK", "NONE"];
  const mods = MODULE_CENSUS.filter((m) => roleFilter === "ALL" || m.role === roleFilter);

  function addPreset(label: string, draft: Partial<CustomModule>) {
    const full: CustomModule = {
      ...(draft as CustomModule),
      id: "cm_" + Date.now() + "_" + Math.floor(Math.random() * 1e4),
      status: "SHADOW",
      createdAt: new Date().toISOString(),
    };
    const v = validateModule(full);
    if (!v.ok) {
      window.alert("Invalid preset: " + v.errors.join("; "));
      return;
    }
    saveCustomModules([...loadCustomModules(), full]);
    setCustoms(loadCustomModules());
    setAdded((a) => ({ ...a, [label]: true }));
  }

  async function handleSeedStarter() {
    const r = await seedTcgStarterDeck();
    setCards(readStrategyCards());
    setCustoms(loadCustomModules());
    setBanner(
      `Starter TCG Armory & Deck synchronized: ${loadCustomModules().length} Custom Modules · ${r.totalCards} Strategy Cards · ${r.totalBeasts} Beasts.`
    );
  }

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto" }}>
      <div className="co-topbar" style={{ marginBottom: 12 }}>
        <span className="co-lock">BLOCKS &amp; MODULES · TACTICAL TCG ARMORY · COMPILER-BOUNDED ROLES</span>
        <span className="small co-mut">
          Every module is classified by its true Engine Mechanism, Role Authority, ATK/DEF Impact, and Synergy/Dilution Diagnostics.
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleSeedStarter}
            style={{
              background: "rgba(168, 85, 247, 0.18)",
              color: "#E9D5FF",
              border: "1px solid rgba(168, 85, 247, 0.55)",
              borderRadius: 4,
              padding: "5px 11px",
              fontSize: 11.5,
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Glyph name="beast" size={12} /> Sync Starter TCG Armory &amp; Deck
          </button>
          <button
            onClick={() => setShowExplain((s) => !s)}
            style={{
              background: showExplain ? "rgba(34, 211, 238, 0.2)" : "var(--bg-elevated)",
              color: "var(--accent-cyan)",
              border: "1px solid var(--border-active)",
              borderRadius: 4,
              padding: "5px 11px",
              fontSize: 11.5,
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Glyph name="book" size={12} /> Block Group Guide
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "strategy-canvas" }))}
            style={{
              background: "rgba(56, 189, 248, 0.18)",
              color: "#F8FAFC",
              border: "1px solid var(--border-active)",
              borderRadius: 4,
              padding: "5px 12px",
              fontSize: 11.5,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Open Strategy Canvas →
          </button>
        </div>
      </div>

      {banner && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 6,
            background: "rgba(34, 211, 238, 0.12)",
            border: "1px solid var(--border-active)",
            color: "#F8FAFC",
            fontSize: 12,
          }}
        >
          {banner}
        </div>
      )}

      {showExplain && <BlockGroupsExplainer onClose={() => setShowExplain(false)} />}

      {/* Semantic X-Ray Pipeline Summary */}
      <div className="pc" style={{ marginBottom: 14 }}>
        <div className="pc-h">
          <Glyph name="microscope" size={12} /> CAUSAL TCG HIERARCHY{" "}
          <span className="mut">L1 Primitive Block → Tactical Equip Module (Spell/Trap/Trigger) → Strategy Card → 6-Slot Beast Deck</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {[
            ["1. PRIMITIVE BLOCKS (L1)", "Typed causal transforms & feature series", BLOCKS.length, "#22D3EE"],
            ["2. ENGINE & CUSTOM MODULES", "Compiler-governed Role spells, traps & triggers", MODULE_CENSUS.length + customs.length, "#FBBF24"],
            ["3. STRATEGY CARDS", "Role-Pure Cards & validated execution artifacts", cards.length, "#A855F7"],
          ].map(([kind, desc, count, color]) => (
            <div
              key={String(kind)}
              style={{
                border: "1px solid var(--border-panel)",
                borderTop: `2px solid ${color}`,
                background: "var(--bg-card-inner)",
                borderRadius: 6,
                padding: "9px 12px",
              }}
            >
              <div style={{ color: String(color), fontWeight: 800, fontSize: 11.5, letterSpacing: "0.04em" }}>
                {kind} · <span style={{ fontFamily: "var(--mfe-mono)" }}>{count}</span>
              </div>
              <div style={{ color: "#94A3B8", fontSize: 10.5, marginTop: 3 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 1) ENGINE MODULES BY ROLE / TRIBE (TACTICAL TCG EQUIP CARDS) */}
      <div className="pc" style={{ marginBottom: 14 }}>
        <div className="pc-h">
          ENGINE TACTICAL MODULES{" "}
          <span className="mut">
            {MODULE_CENSUS.length} canonical modules · ATTACKER {census.counts["ATTACKER"] || 0} · GUARD {census.counts["GUARD"] || 0} · CONFIRM{" "}
            {census.counts["CONFIRMATION"] || 0} · SCOUT {census.counts["SCOUT"] || 0} · EXIT {census.counts["EXIT_SENTINEL"] || 0} · FALLBACK{" "}
            {census.counts["FALLBACK"] || 0}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 12px" }}>
          {roles.map((r) => {
            const on = roleFilter === r;
            const col = ROLE_COLOR[r] || "#38BDF8";
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                style={{
                  background: on ? `${col}22` : "var(--bg-card-inner)",
                  color: on ? col : "#CBD5E1",
                  border: `1px solid ${on ? col : "var(--border-panel)"}`,
                  borderRadius: 4,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {r === "NONE" ? "CORE INFRA" : r.replace("_SENTINEL", "")}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 10 }}>
          {mods.map((m) => {
            const imp = getModuleImpact(m.id);
            const rb = ROLE_BADGE[m.role] || {
              color: "#94A3B8",
              bg: "rgba(148, 163, 184, 0.12)",
              border: "rgba(148, 163, 184, 0.3)",
              icon: "puzzle" as const,
            };
            return (
              <div
                key={m.id}
                style={{
                  border: `1px solid ${imp.trapWarning ? "var(--status-warn-border)" : "var(--border-panel)"}`,
                  borderTop: `2px solid ${rb.color}`,
                  borderRadius: 6,
                  padding: "9px 11px",
                  background: "var(--bg-card-inner)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 9.5,
                      fontWeight: 800,
                      color: rb.color,
                      background: rb.bg,
                      border: `1px solid ${rb.border}`,
                      borderRadius: 4,
                      padding: "1px 6px",
                    }}
                  >
                    <Glyph name={rb.icon} size={10} /> {imp.cardClassLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      fontFamily: "var(--mfe-mono)",
                      color:
                        imp.impactTone === "caution"
                          ? "var(--status-warn-text)"
                          : imp.impactTone === "proven"
                            ? "var(--status-safe-text)"
                            : "var(--accent-cyan)",
                    }}
                  >
                    {imp.impactBadge}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                  <b style={{ fontSize: 12.5, color: "#F8FAFC" }}>{imp.name}</b>
                  <span style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: "#64748B" }}>{m.id}</span>
                </div>

                <div>
                  {m.tribes.map((t) => chip(t, "var(--accent-sky)", "Elemental Tribe"))}
                  {chip(m.mechanism, "#94A3B8", "Engine Mechanism")}
                </div>

                <div style={{ fontSize: 11, color: "#CBD5E1", lineHeight: 1.4 }}>{m.note}</div>

                {imp.trapWarning && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--status-warn-text)",
                      background: "var(--status-warn-bg)",
                      border: "1px solid var(--status-warn-border)",
                      borderRadius: 4,
                      padding: "4px 7px",
                      lineHeight: 1.35,
                    }}
                  >
                    ⚠ {imp.trapWarning}
                  </div>
                )}

                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: 6,
                    borderTop: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 10,
                  }}
                >
                  <span style={{ fontFamily: "var(--mfe-mono)", color: "#94A3B8" }}>
                    ATK <b style={{ color: "#FBBF24" }}>{imp.atkScore}</b> · DEF <b style={{ color: "#38BDF8" }}>{imp.defScore}</b> · Syn:{" "}
                    <b style={{ color: "#CBD5E1" }}>{imp.synergyWith.slice(0, 2).join(", ")}</b>
                  </span>
                  <button
                    onClick={() => setXray({ kind: "ENGINE_MODULE", module: m })}
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-panel)",
                      borderRadius: 4,
                      color: "var(--accent-cyan)",
                      padding: "3px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Glyph name="microscope" size={10} /> X-Ray
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2) BLOCK-COMPOSED CUSTOM MODULES (EQUIP SPELLS & TRAPS) */}
      <div className="pc" style={{ marginBottom: 14 }}>
        <div className="pc-h">
          CUSTOM EQUIP MODULES (BLOCK-COMPOSED){" "}
          <span className="mut">
            {customs.length} active custom modules in workspace · ready to attach in Strategy Canvas or Beast Decks
          </span>
        </div>
        {customs.length === 0 ? (
          <div className="mut" style={{ fontSize: 11 }}>
            No custom modules yet. Click <b>Sync Starter TCG Armory &amp; Deck</b> above to populate 11 block-composed custom modules.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 10 }}>
            {customs.map((m) => {
              const imp = getModuleImpact(m.id, m);
              const rb = ROLE_BADGE[imp.role] || ROLE_BADGE.GUARD;
              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid var(--border-panel)",
                    borderTop: `2px solid ${rb.color}`,
                    background: "var(--bg-card-inner)",
                    borderRadius: 6,
                    padding: "9px 11px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <div>
                      {chip("L" + m.level, "#A855F7")}
                      {chip(imp.role.replace("_SENTINEL", ""), rb.color)}
                    </div>
                    <span style={{ fontSize: 9.5, fontFamily: "var(--mfe-mono)", color: "var(--status-safe-text)", fontWeight: 700 }}>
                      {imp.impactBadge}
                    </span>
                  </div>
                  <b style={{ fontSize: 12.5, color: "#F8FAFC" }}>{m.name}</b>
                  <div style={{ color: "#CBD5E1", fontSize: 10.5, lineHeight: 1.4 }}>{m.explain}</div>
                  <div style={{ color: "#94A3B8", fontSize: 10 }}>
                    {m.conditions.map((c) => `${c.metric} ${c.op} ${c.value}`).join(` ${m.logic} `)}
                  </div>
                  <div style={{ marginTop: "auto", paddingTop: 6, borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9.5, fontFamily: "var(--mfe-mono)", color: "#64748B" }}>{m.id}</span>
                    <button
                      onClick={() => setXray({ kind: "CUSTOM_MODULE", module: m })}
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid rgba(168, 85, 247, 0.45)",
                        borderRadius: 4,
                        color: "#E9D5FF",
                        padding: "3px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      <Glyph name="microscope" size={10} /> X-Ray + Intent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3) BLOCK-COMPOSED PRESET RECIPES */}
      <div className="pc" style={{ marginBottom: 14 }}>
        <div className="pc-h">
          BLOCK-COMPOSED PRESET RECIPES{" "}
          <span className="mut">
            {MODULE_PRESETS.length} decomposing blueprints from legacy QTQ/MFE observers · honest train/held OOS measurements attached
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 10 }}>
          {MODULE_PRESETS.map((p) => {
            const warn = p.label.includes("⚠") || (p.draft.why || "").includes("HURTS");
            const mappedRole =
              p.draft.role === "VETO" || p.draft.role === "SAFETY_VETO" || p.draft.role === "CONTEXT_GATE"
                ? "GUARD"
                : p.draft.role === "CONFIRM"
                  ? "CONFIRMATION"
                  : p.draft.role === "EXIT"
                    ? "EXIT_SENTINEL"
                    : p.draft.role === "TRIGGER"
                      ? "ATTACKER"
                      : "NONE";
            return (
              <div
                key={p.label}
                style={{
                  border: `1px solid ${warn ? "var(--status-warn-border)" : "var(--border-panel)"}`,
                  borderRadius: 6,
                  padding: "9px 11px",
                  background: "var(--bg-card-inner)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <b style={{ fontSize: 12, color: "#F8FAFC" }}>{p.label}</b>
                  {chip(p.draft.role || "?", ROLE_COLOR[mappedRole] || TK.muted)}
                </div>
                <div style={{ fontSize: 11, color: "#CBD5E1" }}>{p.draft.explain}</div>
                <div style={{ fontSize: 10, color: warn ? "var(--status-warn-text)" : "#94A3B8" }}>{p.draft.why}</div>
                <button
                  onClick={() => addPreset(p.label, p.draft)}
                  disabled={!!added[p.label]}
                  style={{
                    marginTop: "auto",
                    alignSelf: "flex-start",
                    background: added[p.label] ? "var(--status-safe-bg)" : "rgba(34, 211, 238, 0.16)",
                    color: added[p.label] ? "var(--status-safe-text)" : "var(--accent-cyan)",
                    border: `1px solid ${added[p.label] ? "var(--status-safe-border)" : "var(--border-active)"}`,
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {added[p.label] ? (
                    <>
                      <Glyph name="check" size={11} /> Added to Armory
                    </>
                  ) : (
                    <>
                      <Glyph name="plus" size={11} /> Craft Custom Module
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4) L1 PRIMITIVE BLOCKS */}
      <div className="pc" style={{ marginBottom: 14 }}>
        <div className="pc-h" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          L1 PRIMITIVE BLOCKS{" "}
          <span className="mut">{BLOCKS.length} atomic blocks with typed ports, causal transforms &amp; visualization contracts</span>
          <input
            value={blockQuery}
            onChange={(e) => setBlockQuery(e.target.value)}
            placeholder="Search blocks…"
            style={{
              marginLeft: "auto",
              width: 210,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-panel)",
              borderRadius: 4,
              color: "#F8FAFC",
              padding: "4px 8px",
              fontSize: 11,
            }}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 8,
            maxHeight: 440,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {BLOCKS.filter(
            (b) => !blockQuery || (b.blockId + " " + b.label + " " + b.description).toLowerCase().includes(blockQuery.toLowerCase())
          ).map((b) => (
            <div
              key={b.blockId}
              style={{
                border: "1px solid var(--border-panel)",
                borderRadius: 6,
                padding: "8px 10px",
                background: "var(--bg-card-inner)",
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <b style={{ color: "var(--accent-cyan)", fontFamily: "var(--mfe-mono)", fontSize: 11 }}>{b.blockId}</b>
                {chip(b.group, "#94A3B8")}
                {b.provisional && chip("PROVISIONAL", "#FBBF24")}
              </div>
              <div style={{ color: "#CBD5E1", fontSize: 10.5, marginTop: 4 }}>
                {b.label} · {b.description}
              </div>
              <div style={{ color: "#94A3B8", fontSize: 9.5, marginTop: 3 }}>
                {b.inputs.map((p) => p.type).join(" + ") || "constant/state"} → <b style={{ color: "#34D399" }}>{b.outputs[0]?.type}</b> · viz{" "}
                {b.viz}
              </div>
              <button
                onClick={() => setXray({ kind: "BLOCK", block: b })}
                style={{
                  marginTop: 6,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-panel)",
                  borderRadius: 4,
                  color: "var(--accent-cyan)",
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Glyph name="microscope" size={10} /> X-Ray + Live Series
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 5) CONDITION METRICS */}
      <div className="pc" style={{ marginBottom: 14 }}>
        <div className="pc-h">
          L4/L5 CONDITION METRICS{" "}
          <span className="mut">{METRICS.length} causal metrics available for Custom Module conditions</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {METRICS.map((b) => (
            <div
              key={b.key}
              style={{
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-card-inner)",
                borderRadius: 4,
                padding: "7px 9px",
                fontSize: 11,
              }}
            >
              <b style={{ fontFamily: "var(--mfe-mono)", color: "var(--accent-cyan)" }}>{b.key}</b>
              <span style={{ color: "#94A3B8" }}>
                {" "}
                · {b.label} {b.unit && "(" + b.unit + ")"}
              </span>{" "}
              {chip(b.scope, b.scope === "exit" ? "#C084FC" : b.scope === "both" ? "#FBBF24" : "#34D399")}
              <div style={{ color: "#94A3B8", fontSize: 10, marginTop: 2 }}>{b.hint}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 6) IMPORT LEDGER */}
      <div className="pc">
        <div className="pc-h">
          IMPORT DECOMPOSITION LEDGER <span className="mut">Legacy QTQ/MFE observer audit &amp; block decomposition status</span>
        </div>
        {IMPORT_CANDIDATES.map((c, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "baseline",
              padding: "5px 0",
              fontSize: 11,
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            {chip(
              c.status === "BLOCK_COMPOSED_AS_PRESET" ? "SHIPPED" : c.status === "MEASURED_NO_EDGE_SHADOW_ONLY" ? "NO-EDGE" : "CANDIDATE",
              c.status === "BLOCK_COMPOSED_AS_PRESET" ? "#34D399" : c.status === "MEASURED_NO_EDGE_SHADOW_ONLY" ? "#FBBF24" : "#94A3B8"
            )}
            {chip(c.proposed_role, ROLE_COLOR[c.proposed_role] || TK.muted)}
            <span style={{ color: "#CBD5E1" }}>{c.source}</span>
            <span style={{ color: "#94A3B8", marginLeft: "auto", textAlign: "right", maxWidth: 460 }}>{c.block_decomposition}</span>
          </div>
        ))}
      </div>

      {xray && <SemanticXraySandbox target={xray} onClose={() => setXray(null)} />}
    </div>
  );
}
