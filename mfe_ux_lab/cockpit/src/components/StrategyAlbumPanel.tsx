// StrategyAlbumPanel — Tactical TCG Album Index/Filter/Sort over saved Strategy Cards & Passports.
// Preserves honesty invariants: NEEDS_RUN — chọn để chạy (không bịa số); suitability ≠ lời-hứa.
import { useState } from "react";
import { TK, InfoTip } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { filterAlbum, sortAlbum, albumFacets, type AlbumEntry, type AlbumStatusFilter, type AlbumSort } from "../lib/albumView.ts";
import { StrategyCard, ROLE_BADGE, rarityOf, type TcgCardStats } from "./StrategyCard.tsx";
import { readCardEvidence } from "./CardEvidencePanel.tsx";
import { inferCardRole, inferCardTribes, getModuleImpact, type RoleImpactPreview } from "../lib/cardBeastV2/tcgStarterDeck.ts";

const VERDICTS = ["ROBUST_IN_SIM", "CONDITIONAL_EDGE", "FRAGILE_EDGE", "NO_EDGE_AFTER_COST"];
const ROLE_FILTERS = ["ALL", "BEAST", "ATTACKER", "GUARD", "CONFIRMATION", "EXIT_SENTINEL", "FALLBACK", "SCOUT"] as const;

export interface StrategyAlbumPanelProps {
  entries: AlbumEntry[];
  selId: string | null;
  onSelect: (id: string) => void;
  impactMap?: Record<string, RoleImpactPreview>;
  onSeedStarterDeck?: () => void;
  onMeasureAllImpact?: () => void;
  busyLabel?: string;
}

function buildCardTcgStats(entry: AlbumEntry, role: string, impact?: RoleImpactPreview): TcgCardStats {
  const run = entry.passport.status === "PASSPORT_MODELED";
  const m = run ? entry.passport.metrics : null;
  const measured = readCardEvidence(entry.card);
  if (!run && measured) return {
    atkLabel: "NET RESULT", atkValue: `${measured.netR.toFixed(2)} R`,
    defLabel: "MAX DRAWDOWN", defValue: `${Math.abs(measured.drawdown).toFixed(2)} R`,
    sampleLabel: "SAMPLE", sampleValue: `${measured.trades} trades`,
    impactBadge: "Measured backtest", impactColor: "#38BDF8",
  };

  if (run && m) {
    const netR = m.netNetR.value;
    const pf = m.netPF.value;
    const n = m.n.value;
    const exp = n > 0 ? +(netR / n).toFixed(3) : 0;
    return {
      atkLabel: "ATK · EXP / PF",
      atkValue: `${exp >= 0 ? "+" : ""}${exp}R · PF ${pf}`,
      atkColor: netR >= 0 ? "#34D399" : "#F87171",
      defLabel: "DEF · NET R",
      defValue: `${netR >= 0 ? "+" : ""}${netR}R`,
      defColor: netR >= 0 ? "#38BDF8" : "#FBBF24",
      sampleLabel: "SAMPLE",
      sampleValue: `${n} trades`,
      impactBadge: "Passport Measured",
      impactColor: "#34D399",
    };
  }

  if (impact) {
    if (impact.mode === "DIRECT_COMBAT") {
      return {
        atkLabel: "ATK · EXP / PF",
        atkValue: `${impact.exp >= 0 ? "+" : ""}${impact.exp}R · PF ${impact.pf}`,
        atkColor: impact.exp >= 0 ? "#34D399" : "#F87171",
        defLabel: "DEF · MAX DD",
        defValue: `-${impact.maxDD}R · ${impact.winRate}%W`,
        defColor: impact.maxDD <= 18 ? "#38BDF8" : "#FBBF24",
        sampleLabel: "SAMPLE (M15)",
        sampleValue: `${impact.n} trades`,
        impactBadge: impact.exp > 0 ? `+${impact.exp}R/trade` : `${impact.exp}R/trade`,
        impactColor: impact.exp > 0 ? "#34D399" : "#FBBF24",
      };
    }
    const dExp = impact.dExp ?? 0;
    const dTr = impact.dTrades ?? 0;
    return {
      atkLabel: "SYNERGY ΔEXP",
      atkValue: `${dExp >= 0 ? "+" : ""}${dExp}R / trade`,
      atkColor: dExp > 0 ? "#34D399" : dExp < 0 ? "#F87171" : "#94A3B8",
      defLabel: role === "GUARD" ? "TRADES BLOCKED" : "PAIRED DD",
      defValue: role === "GUARD" ? `${Math.max(0, -dTr)} filtered` : `-${impact.maxDD}R`,
      defColor: "#38BDF8",
      sampleLabel: "PAIRED N",
      sampleValue: `${impact.n} trades`,
      impactBadge: role === "GUARD" ? `Filters ${Math.max(0, -dTr)} entries` : `ΔExp ${dExp >= 0 ? "+" : ""}${dExp}R`,
      impactColor: dExp >= 0 ? "#34D399" : "#FBBF24",
    };
  }

  // Structural fallback before measurement (honest: shows role power & mechanism, never fake PnL)
  const mods = entry.card.modules || [];
  const profiles = mods.map((id) => getModuleImpact(id));
  const avgAtk = profiles.length ? Math.round(profiles.reduce((s, p) => s + p.atkScore, 0) / profiles.length) : 50;
  const avgDef = profiles.length ? Math.round(profiles.reduce((s, p) => s + p.defScore, 0) / profiles.length) : 50;

  return {
    atkLabel: "ROLE ATK SPEC",
    atkValue: role === "ATTACKER" || role === "BEAST" ? `PWR ${avgAtk}/100` : role === "CONFIRMATION" ? "WEIGHT ×SCALER" : "SUPPORT SLOT",
    atkColor: "#CBD5E1",
    defLabel: "ROLE DEF SPEC",
    defValue: role === "GUARD" || role === "BEAST" ? `SHD ${avgDef}/100` : role === "EXIT_SENTINEL" ? "PROFIT LOCK" : `${mods.length} modules`,
    defColor: "#38BDF8",
    sampleLabel: "ENGINE RUN",
    sampleValue: "Not run yet",
    impactBadge: role === "BEAST" ? "Multi-Role Deck" : `${role.replace("_SENTINEL", "")} Card`,
    impactColor: ROLE_BADGE[role]?.color || "#38BDF8",
  };
}

export function StrategyAlbumPanel({
  entries,
  selId,
  onSelect,
  impactMap = {},
  onSeedStarterDeck,
  onMeasureAllImpact,
  busyLabel,
}: StrategyAlbumPanelProps) {
  const [status, setStatus] = useState<AlbumStatusFilter>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [pf, setPf] = useState("");
  const [tf, setTf] = useState("");
  const [verdict, setVerdict] = useState("");
  const [sortBy, setSortBy] = useState<AlbumSort>("honesty");

  const facets = albumFacets(entries);
  const baseFiltered = sortAlbum(
    filterAlbum(entries, {
      status,
      patternFamily: pf || undefined,
      timeframe: tf || undefined,
      honestyVerdict: verdict || undefined,
    }),
    sortBy,
  );

  const view = baseFiltered.filter((e) => {
    if (roleFilter === "ALL") return true;
    return inferCardRole(e.card) === roleFilter;
  });

  const roleCounts: Record<string, number> = { ALL: entries.length };
  for (const e of entries) {
    const r = inferCardRole(e.card);
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  }

  const runCount = entries.filter((e) => e.passport.status === "PASSPORT_MODELED" || !!readCardEvidence(e.card) || !!impactMap[e.card.id]).length;

  const sel: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-panel)",
    color: "#F8FAFC",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 11.5,
    fontFamily: "inherit",
  };
  const seg = (on: boolean): React.CSSProperties => ({
    background: on ? "rgba(56, 189, 248, 0.18)" : "var(--bg-card-inner)",
    color: on ? "var(--accent-cyan)" : "#94A3B8",
    border: "1px solid " + (on ? "var(--border-active)" : "var(--border-panel)"),
    borderRadius: 4,
    fontSize: 11,
    padding: "4px 10px",
    cursor: "pointer",
    fontWeight: 700,
  });

  return (
    <div className="co-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 12, color: "#F8FAFC", display: "flex", alignItems: "center", gap: 8 }}>
          <Glyph name="folder" size={14} color={TK.cyan} />
          <span>STRATEGY ALBUM · TACTICAL TCG COLLECTION</span>
          <span className="co-mut" style={{ fontSize: 11, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
            ({entries.length} {entries.length === 1 ? "Card" : "Cards"} · {runCount} measured)
          </span>
          <InfoTip
            title="Tactical TCG Strategy Album"
            text="Collects Role-Pure Strategy Cards (Attacker, Guard, Confirmation, Exit Sentinel, Fallback, Scout) and fused Beast Ensembles. Each card displays its true engine Role, Elemental Tribes, and measured ATK/DEF impact."
          />
        </h3>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {onSeedStarterDeck && (
            <button
              onClick={onSeedStarterDeck}
              disabled={!!busyLabel}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(168, 85, 247, 0.18)",
                border: "1px solid rgba(168, 85, 247, 0.55)",
                color: "#E9D5FF",
                borderRadius: 4,
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: 800,
                cursor: busyLabel ? "wait" : "pointer",
              }}
              title="Seeds 11 block-composed Custom Modules, 12 Role-Pure Reference Cards across all 6 tactical roles, and 3 Apex Beast Ensembles"
            >
              <Glyph name="beast" size={12} /> Seed Starter TCG Deck (12 Role Cards + 3 Beasts)
            </button>
          )}
          {onMeasureAllImpact && (
            <button
              onClick={onMeasureAllImpact}
              disabled={!!busyLabel}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(34, 211, 238, 0.16)",
                border: "1px solid var(--border-active)",
                color: "var(--accent-cyan)",
                borderRadius: 4,
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: 800,
                cursor: busyLabel ? "wait" : "pointer",
              }}
              title="Measures direct combat stats for Attackers/Beasts and paired ablation impact (ΔExp & filtered trades) for Guard/Confirmation/Exit/Fallback support cards on 24k M15 bars"
            >
              <Glyph name="balance" size={12} /> {busyLabel || "Calibrate All Card Impacts (24k M15)"}
            </button>
          )}
        </div>
      </div>

      {/* Role Class Filter Strip */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
        {ROLE_FILTERS.map((r) => {
          const active = roleFilter === r;
          const rb = ROLE_BADGE[r];
          const count = roleCounts[r] || 0;
          return (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 4,
                fontSize: 10.5,
                fontWeight: 800,
                cursor: "pointer",
                background: active ? (rb ? rb.bg : "rgba(56, 189, 248, 0.2)") : "var(--bg-card-inner)",
                color: active ? (rb ? rb.color : "var(--accent-cyan)") : "#CBD5E1",
                border: `1px solid ${active ? (rb ? rb.color : "var(--border-active)") : "var(--border-panel)"}`,
              }}
            >
              {rb && <Glyph name={rb.icon} size={10} />}
              <span>{r === "ALL" ? "ALL ROLES" : r.replace("_SENTINEL", "")}</span>
              <span
                style={{
                  fontSize: 9.5,
                  fontFamily: "var(--mfe-mono)",
                  padding: "0 5px",
                  borderRadius: 3,
                  background: "rgba(7, 11, 20, 0.65)",
                  color: "#F8FAFC",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary Filter & Sort Bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "0 0 12px" }}>
        <span style={{ display: "inline-flex", gap: 4 }}>
          {(["ALL", "RUN_ONLY", "NEEDS_RUN"] as AlbumStatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)} style={seg(status === s)}>
              {s === "ALL" ? "All" : s === "RUN_ONLY" ? "Passport ready" : "Needs passport"}
            </button>
          ))}
        </span>
        <select aria-label="Filter Card archetype" value={pf} onChange={(e) => setPf(e.target.value)} style={sel}>
          <option value="">All archetypes</option>
          {facets.patternFamilies.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select aria-label="Filter Card timeframe" value={tf} onChange={(e) => setTf(e.target.value)} style={sel}>
          <option value="">All timeframes</option>
          {facets.timeframes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Filter measured verdict" value={verdict} onChange={(e) => setVerdict(e.target.value)} style={sel}>
          <option value="">Measured verdict</option>
          {VERDICTS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span className="co-mut" style={{ fontSize: 11 }}>
            Sort by
          </span>
          <select aria-label="Sort Strategy Album" value={sortBy} onChange={(e) => setSortBy(e.target.value as AlbumSort)} style={sel}>
            <option value="honesty">Honesty</option>
            <option value="netR">Net R</option>
            <option value="name">Name</option>
          </select>
        </span>
      </div>

      {view.length === 0 ? (
        <div className="co-mut small" style={{ padding: "12px 4px" }}>
          No Card matches these filters. Click <b>Seed Starter TCG Deck</b> above to populate all 6 Role classes and 3 Apex Beasts.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 305px), 1fr))", gap: 12 }}>
          {view.map((e) => {
            const run = e.passport.status === "PASSPORT_MODELED";
            const impact = impactMap[e.card.id];
            const role = inferCardRole(e.card);
            const tribes = inferCardTribes(e.card);
            const rawThesis = "thesis" in e.card && typeof e.card.thesis === "string" ? e.card.thesis : undefined;
            const v = run
              ? e.passport.honesty!.value
              : impact
                ? impact.mode === "DIRECT_COMBAT"
                  ? impact.exp > 0.02
                    ? "SHADOW_QUALIFIED"
                    : impact.exp < -0.02
                      ? "NO_EDGE_AFTER_COST"
                      : "IN_SAMPLE_ONLY"
                  : (impact.dExp ?? 0) > 0.005
                    ? "ROLE_CONFIRMED"
                    : (impact.dExp ?? 0) < -0.01
                      ? "ROLE_HOSTILE"
                      : "SHADOW_QUALIFIED"
                : readCardEvidence(e.card) ? "BACKTEST_SAVED" : "NEEDS_RUN";
            const isSel = e.card.id === selId;
            const chips: { text: string; color?: string }[] = [
              { text: e.structural.timeframe, color: TK.blue },
              { text: e.structural.riskStyle, color: TK.blue },
            ];
            const stats = buildCardTcgStats(e, role, impact);

            return (
              <div key={e.card.id} title="Select to inspect composition, role impact, and validation status">
                <StrategyCard
                  name={e.card.name}
                  role={role}
                  tier={rarityOf(v)}
                  verdictText={v.replace(/_/g, " ")}
                  evidenceLabel={readCardEvidence(e.card) ? "Measured sample" : undefined}
                  selected={isSel}
                  subtitle={`${e.card.archetype || "Research"} · ${(e.card.modules || []).length} modules`}
                  costLabel={`${(e.card.modules || []).length} mod`}
                  tribes={tribes}
                  chips={chips}
                  thesis={rawThesis}
                  stats={stats}
                  onClick={() => onSelect(e.card.id)}
                >
                  {impact && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#94A3B8",
                        fontFamily: "var(--mfe-mono)",
                        padding: "4px 6px",
                        borderRadius: 4,
                        background: "rgba(15, 23, 42, 0.7)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {impact.summary}
                    </div>
                  )}
                  {run && e.passport.honesty!.cappedFrom && (
                    <div style={{ fontSize: 10, color: TK.orange }}>Capped from {e.passport.honesty!.cappedFrom}</div>
                  )}
                </StrategyCard>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
