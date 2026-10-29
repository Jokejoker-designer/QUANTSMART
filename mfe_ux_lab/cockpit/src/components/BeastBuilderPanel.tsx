// BeastBuilderPanel (P4b) — Tactical 6-Slot TCG Deck Builder.
// Composes Strategy Cards from your Library into explicit Role Slots (ATTACKER, GUARD, CONFIRMATION, SCOUT,
// EXIT_SENTINEL, FALLBACK + locked L0 SAFETY). composeBeast strictly filters modules by Role authority and
// rolePowerReport measures leave-one-role-out impact on the canonical engine.
import { flushWorkspace } from "../lib/workspaceClient.ts";
import { runResearchAnalysis } from "../lib/researchJobs.ts";
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import { cardContributesToRole, composeBeast, rolePowerReport, type BeastMember } from "../lib/cardBeastV2/beastCompose.ts";
import { exportBeastAsCard, saveBeast, type SavedBeast, type SavedRoleEvidence } from "../lib/cardBeastV2/beastStore.ts";
import { loadCustomModules, type CustomModule } from "../lib/customModule.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { readStrategyCards, subscribeArtifactChanges, type ArtifactIdentity } from "../lib/artifactRegistry.ts";
import { ROLE_BADGE } from "./StrategyCard.tsx";

const SWAN: CustomModule = {
  id: "cm_swan_beast",
  level: 5,
  role: "VETO",
  name: "BlackSwan Guard",
  explain: "Vetoes a volatility shock or excessive distance from the EMA",
  why: "Shock witness decomposed into atrRatio and priceEmaAtr blocks",
  conditions: [
    { metric: "atrRatio", op: ">", value: 1.8 },
    { metric: "priceEmaAtr", op: "outside", value: -2.5, value2: 2.5 },
  ],
  logic: "ANY",
  status: "SHADOW",
  createdAt: "beast",
};

const TEMPLATES: Record<string, { id: string; label: string; modules: string[]; customs?: CustomModule[] }[]> = {
  ATTACKER: [
    { id: "tpl_atk_trend", label: "Trend Pullback", modules: ["trend_pullback", "fusion", "auto_rr"] },
    { id: "tpl_atk_htf", label: "HTF Anchor", modules: ["htf_anchor", "fusion", "auto_rr"] },
    { id: "tpl_atk_volc", label: "Vol Contraction", modules: ["vol_contraction", "fusion", "auto_rr"] },
    { id: "tpl_atk_psl", label: "PSL Sweep + MR exit", modules: ["psl_sweep", "fusion", "auto_rr", "mr_exit"] },
  ],
  GUARD: [
    { id: "tpl_grd_env", label: "Environment filters", modules: ["no_trade_chop", "dead_hour", "news_ctx"] },
    { id: "tpl_grd_regime", label: "Regime (regime_ctx+markov)", modules: ["regime_ctx", "markov"] },
    { id: "tpl_grd_swan", label: "BlackSwan (block-composed)", modules: [SWAN.id], customs: [SWAN] },
    { id: "tpl_grd_structure", label: "Structure veto (S/R + memory)", modules: ["sr_zone_context", "level_memory"] },
  ],
  CONFIRMATION: [
    { id: "tpl_cfm_mtf", label: "MTF Confirm (weight)", modules: ["mtf_confirm"] },
    { id: "tpl_cfm_state", label: "State-Machine (armed)", modules: ["state_machine"] },
  ],
  SCOUT: [{ id: "tpl_sct_episode", label: "CH Episode observer", modules: ["ch_episode_lens"] }],
  EXIT_SENTINEL: [
    { id: "tpl_ext_weak", label: "Exit Weakening", modules: ["exit_weak"] },
    { id: "tpl_ext_mr", label: "Mean-Reversion Exit", modules: ["mr_exit"] },
  ],
  FALLBACK: [{ id: "tpl_fb_range", label: "Fallback Range Fade", modules: ["fb_range_fade"] }],
};

const LIMITS: Record<string, [number, number]> = {
  ATTACKER: [1, 1],
  GUARD: [1, 3],
  CONFIRMATION: [0, 3],
  SCOUT: [0, 2],
  EXIT_SENTINEL: [0, 2],
  FALLBACK: [0, 1],
};

const ROLE_COLOR: Record<string, string> = {
  ATTACKER: "#FBBF24",
  GUARD: "#F87171",
  CONFIRMATION: "#34D399",
  SCOUT: "#22D3EE",
  EXIT_SENTINEL: "#C084FC",
  FALLBACK: "#38BDF8",
};

const ROLE_DESC: Record<string, string> = {
  ATTACKER: "Primary setup spearhead (TRIGGER_VOTE + COMBINER)",
  GUARD: "Hard veto shield (HARD_GATE + VETO blocks)",
  CONFIRMATION: "Conviction multiplier (WEIGHT_SCALER + QUALITY_GATE)",
  SCOUT: "Context & regime radar (CONTEXT_STATE)",
  EXIT_SENTINEL: "Profit lock & decay exit (EXIT_RULE)",
  FALLBACK: "Silent-bar backup responder (FALLBACK_VOTE)",
};

interface LibCard {
  id: string;
  name: string;
  role?: string;
  modules: string[];
  archetype?: string;
  artifact?: ArtifactIdentity;
  [key: string]: unknown;
}
function loadLib(): LibCard[] {
  return readStrategyCards<LibCard>();
}

export function BeastBuilderPanel({ onBeastSaved }: { onBeastSaved?: (beast: SavedBeast) => void }) {
  const [lib, setLib] = useState<LibCard[]>(loadLib);
  const [customStore, setCustomStore] = useState<CustomModule[]>(() => {
    try {
      return loadCustomModules();
    } catch {
      return [];
    }
  });
  const [picked, setPicked] = useState<Record<string, string[]>>(() => {
    const initialCards = loadLib();
    const hasId = (id: string) => initialCards.some((c) => c.id === id);
    return {
      ATTACKER: [hasId("tcg_atk_liquidity_trinity") ? "lib:tcg_atk_liquidity_trinity" : "tpl:tpl_atk_trend"],
      GUARD: [hasId("tcg_grd_anti_chop_shock") ? "lib:tcg_grd_anti_chop_shock" : "tpl:tpl_grd_env"],
      CONFIRMATION: [hasId("tcg_cfm_mtf_retest") ? "lib:tcg_cfm_mtf_retest" : "tpl:tpl_cfm_mtf"],
      SCOUT: hasId("tcg_sct_episode_radar") ? ["lib:tcg_sct_episode_radar"] : [],
      EXIT_SENTINEL: [hasId("tcg_ext_profit_aegis") ? "lib:tcg_ext_profit_aegis" : "tpl:tpl_ext_weak"],
      FALLBACK: hasId("tcg_fb_silent_range") ? ["lib:tcg_fb_silent_range"] : [],
    };
  });
  const [name, setName] = useState("Apex Tactical Beast");
  const [busy, setBusy] = useState(false);
  interface PowerRow {
    role: string;
    noCandidate: boolean;
    dExp: number | null;
    dTrades: number | null;
    note: string;
  }
  const [power, setPower] = useState<{
    full: { n: number; exp: number | null; dd: number };
    rows: PowerRow[];
    bars: number;
    identity: ReturnType<typeof rolePowerReport>["identity"];
  } | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    return subscribeArtifactChanges(() => {
      const updated = loadLib();
      setLib(updated);
      try {
        setCustomStore(loadCustomModules());
      } catch {
        /* ignore */
      }
      // Upgrade template picks to real Library Role Cards automatically once Starter Deck is seeded
      setPicked((prev) => {
        const hasId = (id: string) => updated.some((c) => c.id === id);
        if (prev.ATTACKER?.[0]?.startsWith("tpl:") && hasId("tcg_atk_liquidity_trinity")) {
          return {
            ATTACKER: ["lib:tcg_atk_liquidity_trinity"],
            GUARD: hasId("tcg_grd_anti_chop_shock") ? ["lib:tcg_grd_anti_chop_shock", ...(hasId("tcg_grd_structure_fortress") ? ["lib:tcg_grd_structure_fortress"] : [])] : prev.GUARD,
            CONFIRMATION: hasId("tcg_cfm_mtf_retest") ? ["lib:tcg_cfm_mtf_retest"] : prev.CONFIRMATION,
            SCOUT: hasId("tcg_sct_episode_radar") ? ["lib:tcg_sct_episode_radar"] : prev.SCOUT,
            EXIT_SENTINEL: hasId("tcg_ext_profit_aegis") ? ["lib:tcg_ext_profit_aegis"] : prev.EXIT_SENTINEL,
            FALLBACK: hasId("tcg_fb_silent_range") ? ["lib:tcg_fb_silent_range"] : prev.FALLBACK,
          };
        }
        return prev;
      });
    });
  }, []);

  const optionsFor = (role: string) => {
    const cards = lib
      .filter((c) => !(c.archetype || "").toLowerCase().includes("beast"))
      .filter((c) => cardContributesToRole(c.modules || [], role as BeastMember["role"]) || c.role === role)
      .map((c) => ({
        key: "lib:" + c.id,
        sourceId: c.id,
        sourceKind: "STRATEGY_CARD" as const,
        sourceArtifactId: c.artifact?.artifact_id,
        sourceContentHash: c.artifact?.content_hash,
        label: "📇 " + c.name,
        modules: c.modules || [],
        customs: customStore.filter((m) => (c.modules || []).includes(m.id)),
      }));
    const tpls = (TEMPLATES[role] || []).map((t) => ({
      key: "tpl:" + t.id,
      sourceId: "template:" + t.id,
      sourceKind: "TEMPLATE" as const,
      sourceArtifactId: undefined,
      sourceContentHash: undefined,
      label: "🧩 " + t.label + " (template)",
      modules: t.modules,
      customs: t.customs || [],
    }));
    return [...cards, ...tpls];
  };

  const members: BeastMember[] = useMemo(() => {
    const out: BeastMember[] = [];
    for (const role of Object.keys(LIMITS))
      for (const key of picked[role] || []) {
        const o = optionsFor(role).find((x) => x.key === key);
        if (o)
          out.push({
            card_id: o.sourceId,
            role: role as BeastMember["role"],
            modules: o.modules,
            customs: o.customs,
            source_kind: o.sourceKind,
            source_artifact_id: o.sourceArtifactId,
            source_content_hash: o.sourceContentHash,
          });
      }
    out.push({ card_id: "l0", role: "SAFETY", modules: [], source_kind: "SAFETY" });
    return out;
  }, [picked, lib, customStore]); // eslint-disable-line

  const comp = useMemo(() => composeBeast(members), [members]);
  const lineageReady = members.every(
    (m) => m.source_kind !== "STRATEGY_CARD" || (!!m.source_artifact_id && !!m.source_content_hash)
  );

  function toggle(role: string, key: string) {
    setPower(null);
    setMsg("");
    setPicked((p) => {
      const cur = p[role] || [];
      const [, max] = LIMITS[role];
      if (cur.includes(key)) return role === "ATTACKER" ? p : { ...p, [role]: cur.filter((x) => x !== key) };
      const next = role === "ATTACKER" ? [key] : [...cur, key];
      return next.length > max ? p : { ...p, [role]: next };
    });
  }

  async function measurePower() {
    setBusy(true);
    setPower(null);
    try {
      const d = await loadSimOhlc("M15", false);
      const bars = ((d?.bars || []) as OhlcBar[]).slice(-24000);
      const rp = await runResearchAnalysis<ReturnType<typeof rolePowerReport>>("beast_roles", bars, null, { members });
      setPower({
        full: { n: rp.full.n, exp: rp.full.exp, dd: rp.full.dd },
        rows: rp.rows.map((r) => ({
          role: r.role,
          noCandidate: "status" in r.withoutRole,
          dExp: r.dExp,
          dTrades: r.dTrades,
          note: r.note,
        })),
        bars: bars.length,
        identity: rp.identity,
      });
      setBusy(false);
    } catch (error) {
      setMsg(`Role analysis failed: ${(error as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <div className="pc" style={{ marginBottom: 14 }}>
      <div className="pc-h" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Glyph name="beast" size={15} /> BEAST DECK BUILDER · 6-ROLE TACTICAL FORMATION{" "}
        <span className="mut">
          Assign Role-Pure Cards into their authority slots. Out-of-role modules are automatically stripped.
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10.5, color: "#94A3B8", textTransform: "none", fontWeight: 600 }}>Deck Name:</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-panel)",
              borderRadius: 4,
              color: "#F8FAFC",
              padding: "4px 9px",
              fontSize: 11.5,
              fontWeight: 700,
              width: 190,
            }}
          />
        </div>
      </div>

      <style>{`
        .bb-col{flex:1;min-width:195px;background:var(--bg-card-inner);border:1px solid var(--border-panel);border-radius:6px;padding:9px 10px 8px;display:flex;flex-direction:column}
        .bb-list{max-height:156px;overflow-y:auto;padding-right:3px;display:flex;flex-direction:column;gap:4px}
        .bb-list::-webkit-scrollbar{width:5px}
        .bb-list::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}.bb-list::-webkit-scrollbar-track{background:transparent}
        .bb-opt{cursor:pointer;font-size:11px;padding:6px 8px;border-radius:4px;border:1px solid var(--border-subtle);background:rgba(7,11,20,0.55);color:#CBD5E1;transition:.14s;display:flex;flex-direction:column;gap:2px}
        .bb-opt:hover{border-color:var(--border-active);color:#F8FAFC}
      `}</style>

      {/* Active Formation Bar */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "8px 11px",
          margin: "4px 0 10px",
          background: "var(--bg-card-inner)",
          border: "1px solid var(--border-panel)",
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.06em", marginRight: 4 }}>
          ACTIVE FORMATION:
        </span>
        {Object.keys(LIMITS).map((role) => {
          const rb = ROLE_BADGE[role] || ROLE_BADGE.ATTACKER;
          const names = (picked[role] || []).map(
            (k) =>
              optionsFor(role)
                .find((o) => o.key === k)
                ?.label.replace(/^📇 |^🧩 /, "")
                .replace(" (template)", "") || "?"
          );
          return names.length ? (
            names.map((n, i) => (
              <span
                key={role + i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: rb.color,
                  background: rb.bg,
                  border: `1px solid ${rb.border}`,
                  borderRadius: 4,
                  padding: "3px 9px",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: rb.color }} />
                <b style={{ opacity: 0.85 }}>{role.replace("_SENTINEL", "")}:</b> {n}
              </span>
            ))
          ) : (
            <span
              key={role}
              style={{
                fontSize: 10.5,
                color: "#64748B",
                border: "1px dashed var(--border-subtle)",
                borderRadius: 4,
                padding: "3px 9px",
              }}
            >
              {role.replace("_SENTINEL", "")}: Empty
              {LIMITS[role][0] > 0 ? (
                <>
                  {" "}
                  <Glyph name="warning" size={9} />
                </>
              ) : (
                ""
              )}
            </span>
          );
        })}
        <span
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10,
            fontWeight: 800,
            color: "var(--status-safe-text)",
            background: "var(--status-safe-bg)",
            border: "1px solid var(--status-safe-border)",
            borderRadius: 4,
            padding: "3px 9px",
          }}
        >
          <Glyph name="lock" size={10} /> L0 SAFETY LOCKED
        </span>
      </div>

      {/* 6 Role Slot Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))", gap: 10, padding: "2px 0" }}>
        {Object.keys(LIMITS).map((role) => {
          const cnt = (picked[role] || []).length;
          const rb = ROLE_BADGE[role] || ROLE_BADGE.ATTACKER;
          return (
            <div key={role} className="bb-col" style={{ borderTop: `2px solid ${ROLE_COLOR[role]}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <Glyph name={rb.icon} size={11} color={ROLE_COLOR[role]} />
                <span style={{ fontSize: 10.5, fontWeight: 800, color: ROLE_COLOR[role], letterSpacing: "0.05em" }}>
                  {role.replace("_SENTINEL", "")}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 9.5,
                    fontWeight: 800,
                    fontFamily: "var(--mfe-mono)",
                    color: cnt < LIMITS[role][0] ? "var(--status-danger-text)" : "#94A3B8",
                  }}
                >
                  {cnt}/{LIMITS[role][1]} SLOT
                </span>
              </div>
              <div style={{ fontSize: 9.5, color: "#64748B", marginBottom: 6 }}>{ROLE_DESC[role]}</div>
              <div className="bb-list">
                {optionsFor(role).map((o) => {
                  const on = (picked[role] || []).includes(o.key);
                  return (
                    <div
                      key={o.key}
                      className="bb-opt"
                      onClick={() => toggle(role, o.key)}
                      title={o.modules.join(" · ")}
                      style={
                        on
                          ? {
                              border: `1px solid ${ROLE_COLOR[role]}`,
                              background: rb.bg,
                              color: "#F8FAFC",
                            }
                          : undefined
                      }
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                        <span style={{ fontWeight: on ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {on ? "✓ " : ""}
                          {o.label}
                        </span>
                        <span style={{ fontSize: 9, fontFamily: "var(--mfe-mono)", color: "#94A3B8", flexShrink: 0 }}>
                          {o.modules.length}m
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {comp.errors.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 4,
            background: "var(--status-danger-bg)",
            border: "1px solid var(--status-danger-border)",
            fontSize: 11.5,
            color: "var(--status-danger-text)",
          }}
        >
          {comp.errors.map((e, i) => (
            <div key={i}>
              <Glyph name="forbidden" size={10} /> {e}
            </div>
          ))}
        </div>
      )}
      {comp.warnings.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--status-warn-text)", padding: "6px 0 2px" }}>
          {comp.warnings.map((e, i) => (
            <div key={i}>
              <Glyph name="warning" size={10} /> {e.replace(/—[^()]*\(kh[^()]*smuggle\)/i, "— stripped (outside role authority)")}
            </div>
          ))}
        </div>
      )}

      {/* Role-Filtered Authority Breakdown */}
      <div
        style={{
          marginTop: 8,
          padding: "8px 10px",
          borderRadius: 4,
          background: "rgba(7, 11, 20, 0.55)",
          border: "1px solid var(--border-subtle)",
          fontSize: 11,
          color: "#CBD5E1",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div style={{ fontSize: 9.5, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.05em", marginBottom: 2 }}>
          COMPILER ROLE AUTHORITY MATRIX ({comp.modules.length} active modules compiled):
        </div>
        {comp.contributions
          .filter((c) => c.role !== "SAFETY")
          .map((c, i) => (
            <div key={i}>
              ▪ <b style={{ color: ROLE_COLOR[c.role] || TK.muted }}>{c.role.replace("_SENTINEL", "")}</b> «{c.card_id}» contributes:{" "}
              <span style={{ fontFamily: "var(--mfe-mono)", color: "var(--accent-cyan)" }}>{c.used.join(", ") || "—"}</span>
              {c.dropped.length ? (
                <span style={{ color: "var(--status-warn-text)" }}> · stripped (outside role authority): {c.dropped.join(", ")}</span>
              ) : null}
            </div>
          ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button
          onClick={measurePower}
          disabled={busy || !comp.ok}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--status-warn-bg)",
            color: "var(--status-warn-text)",
            border: "1px solid var(--status-warn-border)",
            borderRadius: 4,
            padding: "6px 12px",
            fontSize: 11.5,
            fontWeight: 800,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Measuring…" : <><Glyph name="balance" size={11} /> Measure Role Contributions (Leave-One-Out)</>}
        </button>
        <button
          onClick={async () => {
            if (!comp.ok || !lineageReady || busy) return;
            setBusy(true);
            try {
              const evidence: SavedRoleEvidence | undefined = power
                ? {
                    measured_at: new Date().toISOString(),
                    timeframe: "M15",
                    bars: power.bars,
                    cost_mode: "NORMAL",
                    full: power.full,
                    rows: power.rows,
                    identity: power.identity,
                  }
                : undefined;
              const saved = saveBeast(name, members, comp, evidence);
              await flushWorkspace();
              onBeastSaved?.(saved);
              setMsg("Saved Beast “" + name + "” with frozen Card lineage" + (evidence ? " + role evidence." : "."));
            } catch (error) {
              setMsg(`Ensemble was not saved: ${(error as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
          disabled={!comp.ok || !lineageReady || busy || !name.trim()}
          title={lineageReady ? "Card identity/hash will be frozen into Beast lineage" : "Select Library Strategy Cards or Templates with valid hashes"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(34, 211, 238, 0.16)",
            color: "var(--accent-cyan)",
            border: "1px solid var(--border-active)",
            borderRadius: 4,
            padding: "6px 12px",
            fontSize: 11.5,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <Glyph name="save" size={11} /> Save Beast to Deck Vault
        </button>
        <button
          onClick={async () => {
            if (!comp.ok || busy) return;
            setBusy(true);
            try {
              const r = exportBeastAsCard(name, comp);
              if (!r.ok) throw new Error(r.note);
              await flushWorkspace();
              setMsg("Exported Beast as a Strategy Card in the Library. Ready for Arena Duel or Microscope validation.");
            } catch (error) {
              setMsg(`Card export failed: ${(error as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
          disabled={!comp.ok || busy || !name.trim()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--status-safe-bg)",
            color: "var(--status-safe-text)",
            border: "1px solid var(--status-safe-border)",
            borderRadius: 4,
            padding: "6px 12px",
            fontSize: 11.5,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <Glyph name="package" size={11} /> Export Beast as Playable Card
        </button>
      </div>

      {msg && <div style={{ fontSize: 11.5, color: "var(--status-safe-text)", marginTop: 8 }}>{msg}</div>}

      {power && (() => {
        const maxAbs = Math.max(0.02, ...power.rows.filter((r) => r.dExp != null).map((r) => Math.abs(r.dExp as number)));
        const tile = (lbl: string, val: string, color: string) => (
          <div style={{ flex: 1, minWidth: 110, background: "var(--bg-card-inner)", border: "1px solid var(--border-panel)", borderRadius: 4, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>{lbl}</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--mfe-mono)", color }}>{val}</div>
          </div>
        );
        return (
          <div style={{ marginTop: 10, background: "rgba(7, 11, 20, 0.7)", border: "1px solid var(--border-panel)", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "#CBD5E1", letterSpacing: "0.05em", marginBottom: 8 }}>
              <Glyph name="balance" size={11} /> LEAVE-ONE-ROLE-OUT ABLATION IMPACT{" "}
              <span style={{ color: "#94A3B8", fontWeight: 400 }}>— measures exact ΔExpectancy &amp; filtered trades per role</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {tile("Full Beast · Trades", String(power.full.n), "#F8FAFC")}
              {tile(
                "ATK · Expectancy / Trade",
                (power.full.exp ?? 0) >= 0 ? `+${power.full.exp}R` : `${power.full.exp}R`,
                (power.full.exp ?? 0) >= 0 ? "#34D399" : "#F87171"
              )}
              {tile("DEF · Max Drawdown", `${power.full.dd}R`, "#38BDF8")}
            </div>
            <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, color: power.identity.status === "FALLBACK_DOMINANT" ? "#F87171" : "#34D399" }}>
              Deck Identity: {power.identity.status} · Primary Attacker Share{" "}
              {power.identity.attackerTradeShare == null ? "—" : `${(power.identity.attackerTradeShare * 100).toFixed(1)}%`} · Fallback Share{" "}
              {power.identity.fallbackTakeoverRate == null ? "—" : `${(power.identity.fallbackTakeoverRate * 100).toFixed(1)}%`}
            </div>
            {power.rows.map((r) => {
              const col = ROLE_COLOR[r.role] || TK.muted;
              const d = r.dExp ?? 0;
              const w = Math.min(100, (Math.abs(d) / maxAbs) * 100);
              return (
                <div key={r.role} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
                  <span style={{ width: 115, flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: col }}>
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: col, marginRight: 6 }} />
                    {r.role.replace("_SENTINEL", "")}
                  </span>
                  {r.noCandidate ? (
                    <span style={{ fontSize: 10.5, color: "#FBBF24", fontWeight: 700 }}>
                      <Glyph name="forbidden" size={10} /> NO_CANDIDATE: Primary Attacker is the setup engine; removing it emits 0 setups.
                    </span>
                  ) : (
                    <>
                      <div style={{ flex: 1, height: 12, position: "relative", background: "var(--bg-card-inner)", borderRadius: 4, overflow: "hidden", minWidth: 120 }}>
                        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border-panel)" }} />
                        <div
                          style={{
                            position: "absolute",
                            top: 2,
                            bottom: 2,
                            borderRadius: 3,
                            background: d >= 0 ? "#34D399" : "#F87171",
                            left: d >= 0 ? "50%" : `${50 - w / 2}%`,
                            width: `${w / 2}%`,
                          }}
                        />
                      </div>
                      <b
                        style={{
                          width: 78,
                          textAlign: "right",
                          fontFamily: "var(--mfe-mono)",
                          fontSize: 11.5,
                          color: d > 0.005 ? "#34D399" : d < -0.005 ? "#F87171" : "#94A3B8",
                        }}
                      >
                        {d >= 0 ? "+" : ""}
                        {d}R
                      </b>
                      <span
                        style={{
                          width: 110,
                          textAlign: "right",
                          fontSize: 10.5,
                          color: (r.dTrades ?? 0) < 0 ? "var(--accent-cyan)" : "#94A3B8",
                          fontFamily: "var(--mfe-mono)",
                        }}
                      >
                        {(r.dTrades ?? 0) < 0 ? `blocks ${-(r.dTrades as number)} trades` : `${r.dTrades ?? 0} trades`}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
