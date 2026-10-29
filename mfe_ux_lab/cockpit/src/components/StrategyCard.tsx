// StrategyCard — Midnight Navy & Cyber Cyan Tactical TCG Card (PRESENTATION_ONLY).
// Rarity maps strictly to verified OOS / honesty verdict; unmeasured cards ("chưa đo") show neutral border.
// Advisory research zones only ("KHÔNG phải lệnh").
import type { CSSProperties, ReactNode } from "react";
import { Glyph, type GlyphName } from "./ui/Glyph.tsx";

export const RARITY_TIERS = ["proven", "conditional", "warning", "unmeasured"] as const;
export type RarityTier = typeof RARITY_TIERS[number];

export function rarityOf(verdict: string | null | undefined): RarityTier {
  switch ((verdict || "").toUpperCase()) {
    case "OOS_CONFIRMED":
    case "ROBUST_IN_SIM":
    case "ROLE_CONFIRMED":
    case "SHADOW_VALIDATED":
    case "OOS_QUALIFIED":
    case "SYSTEM":
      return "proven";
    case "OOS_CONDITIONAL":
    case "CONDITIONAL_EDGE":
    case "ROLE_CONDITIONAL":
    case "SHADOW_QUALIFIED":
      return "conditional";
    case "OOS_FLIPPED":
    case "FRAGILE_EDGE":
    case "NO_EDGE_AFTER_COST":
    case "ROLE_HOSTILE":
    case "HARMFUL":
    case "CONFLICTED":
      return "warning";
    default:
      return "unmeasured";
  }
}

export const RARITY_STYLE: Record<RarityTier, { border: string; glow: string; label: string; labelColor: string; pillBg: string; pillBorder: string; headerAccent: string }> = {
  proven: {
    border: "#38BDF8",
    glow: "0 0 14px rgba(56, 189, 248, 0.25)",
    label: "OOS Proven",
    labelColor: "#34D399",
    pillBg: "rgba(16, 185, 129, 0.16)",
    pillBorder: "rgba(16, 185, 129, 0.55)",
    headerAccent: "linear-gradient(90deg, rgba(56, 189, 248, 0.16) 0%, rgba(16, 185, 129, 0.08) 100%)",
  },
  conditional: {
    border: "#FBBF24",
    glow: "0 0 12px rgba(251, 191, 36, 0.18)",
    label: "Conditional",
    labelColor: "#FBBF24",
    pillBg: "rgba(245, 158, 11, 0.16)",
    pillBorder: "rgba(245, 158, 11, 0.55)",
    headerAccent: "linear-gradient(90deg, rgba(245, 158, 11, 0.16) 0%, rgba(15, 23, 42, 0) 100%)",
  },
  warning: {
    border: "#F87171",
    glow: "0 0 12px rgba(248, 113, 113, 0.18)",
    label: "Adverse / Fragile",
    labelColor: "#F87171",
    pillBg: "rgba(239, 68, 68, 0.16)",
    pillBorder: "rgba(239, 68, 68, 0.55)",
    headerAccent: "linear-gradient(90deg, rgba(239, 68, 68, 0.16) 0%, rgba(15, 23, 42, 0) 100%)",
  },
  unmeasured: {
    border: "rgba(56, 189, 248, 0.24)",
    glow: "none",
    label: "Not measured",
    labelColor: "#94A3B8",
    pillBg: "rgba(148, 163, 184, 0.12)",
    pillBorder: "rgba(148, 163, 184, 0.28)",
    headerAccent: "linear-gradient(90deg, rgba(56, 189, 248, 0.07) 0%, rgba(15, 23, 42, 0) 100%)",
  },
};

export const ROLE_BADGE: Record<string, { color: string; bg: string; border: string; icon: GlyphName; title: string }> = {
  ATTACKER: { color: "#FBBF24", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.45)", icon: "swords", title: "ATTACKER · Emits primary setup candidate votes" },
  GUARD: { color: "#F87171", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.45)", icon: "shield", title: "GUARD · Hard-vetoes entries in hostile conditions" },
  CONFIRMATION: { color: "#34D399", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.45)", icon: "check-circle", title: "CONFIRMATION · Scales vote conviction; never creates solo votes" },
  SCOUT: { color: "#22D3EE", bg: "rgba(34, 211, 238, 0.15)", border: "rgba(34, 211, 238, 0.45)", icon: "compass", title: "SCOUT · Context & structural regime radar" },
  EXIT_SENTINEL: { color: "#C084FC", bg: "rgba(168, 85, 247, 0.16)", border: "rgba(168, 85, 247, 0.48)", icon: "parachute", title: "EXIT SENTINEL · Protects open profit & governs exits" },
  FALLBACK: { color: "#38BDF8", bg: "rgba(56, 189, 248, 0.14)", border: "rgba(56, 189, 248, 0.40)", icon: "hook", title: "FALLBACK · Speaks only when primary Attackers are silent" },
  SAFETY: { color: "#34D399", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.45)", icon: "lock", title: "SAFETY · Locked L0 causal integrity foundation" },
  BEAST: { color: "#A855F7", bg: "rgba(168, 85, 247, 0.18)", border: "rgba(168, 85, 247, 0.55)", icon: "beast", title: "BEAST FUSION · Multi-role ensemble deck" },
};

let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const el = document.createElement("style");
  el.textContent = `
    .tcgc{transition:border-color .16s ease, box-shadow .16s ease, transform .14s ease;min-width:0;position:relative;overflow:hidden}
    .tcgc:hover{border-color:var(--border-active)!important;transform:translateY(-1px)}
    .tcgc:focus-visible{outline:2px solid var(--accent-sky);outline-offset:3px}
    .tcg-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:6px 8px;border-radius:4px;background:rgba(7,11,20,0.65);border:1px solid var(--border-subtle)}
    .tcg-stat-cell{display:flex;flex-direction:column;gap:1px;min-width:0}
    .tcg-stat-lbl{font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748B}
    .tcg-stat-val{font-size:11px;font-weight:800;font-family:var(--mfe-mono);font-variant-numeric:tabular-nums;color:#F8FAFC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  `;
  document.head.appendChild(el);
}

export interface TcgCardStats {
  atkLabel?: string;
  atkValue: string;
  atkColor?: string;
  defLabel?: string;
  defValue: string;
  defColor?: string;
  sampleLabel?: string;
  sampleValue: string;
  impactBadge?: string;
  impactColor?: string;
}

export interface StrategyCardProps {
  name: string;
  tier: RarityTier;
  role?: string;
  icon?: GlyphName;
  subtitle?: string;
  verdictText?: string;
  evidenceLabel?: string;
  chips?: { text: string; color?: string }[];
  tribes?: string[];
  thesis?: string;
  stats?: TcgCardStats;
  costLabel?: string;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  footNote?: string;
}

export function StrategyCard(p: StrategyCardProps) {
  injectCss();
  const r = RARITY_STYLE[p.tier];
  const rb = p.role ? ROLE_BADGE[p.role] || ROLE_BADGE.ATTACKER : null;
  const topAccentColor = p.selected ? "var(--accent-purple)" : rb ? rb.color : r.border;

  const wrap: CSSProperties = {
    position: "relative",
    borderRadius: 6,
    cursor: p.onClick ? "pointer" : "default",
    border: `1px solid ${p.selected ? "var(--accent-purple)" : r.border}`,
    borderTop: `2px solid ${topAccentColor}`,
    boxShadow: p.selected ? "0 0 0 1px rgba(168, 85, 247, 0.45), 0 8px 22px rgba(7, 11, 20, 0.55)" : r.glow,
    background: "var(--bg-card-inner)",
    padding: p.compact ? "7px 9px" : "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: p.compact ? 5 : 8,
  };

  return (
    <div
      className="tcgc"
      style={wrap}
      onClick={p.onClick}
      role={p.onClick ? "button" : undefined}
      tabIndex={p.onClick ? 0 : undefined}
      aria-pressed={p.onClick ? !!p.selected : undefined}
      onKeyDown={
        p.onClick
          ? (e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                p.onClick?.();
              }
            }
          : undefined
      }
    >
      {/* Top Role Crest & Cost Crystal Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          margin: p.compact ? "-7px -9px 2px" : "-10px -12px 2px",
          padding: p.compact ? "6px 9px" : "8px 12px",
          background: r.headerAccent,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: p.compact ? 0 : 3 }}>
            {rb && p.role && (
              <span
                title={rb.title}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  color: rb.color,
                  border: `1px solid ${rb.border}`,
                  borderRadius: 4,
                  padding: "1px 6px",
                  background: rb.bg,
                }}
              >
                <Glyph name={rb.icon} size={10} /> {p.role.replace("_SENTINEL", "")}
              </span>
            )}
            {p.stats?.impactBadge && !p.compact && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: p.stats.impactColor || "var(--accent-cyan)",
                  background: "rgba(34, 211, 238, 0.12)",
                  border: "1px solid rgba(34, 211, 238, 0.32)",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                {p.stats.impactBadge}
              </span>
            )}
          </div>
          <b
            style={{
              display: "block",
              fontSize: p.compact ? 11.5 : 13,
              fontWeight: 800,
              color: "#F8FAFC",
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {p.selected ? "▶ " : ""}
            {p.name}
          </b>
          {p.subtitle && !p.compact && (
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 2 }}>{p.subtitle}</div>
          )}
        </div>

        {p.costLabel && (
          <span
            title="Complexity / Module Cost"
            style={{
              flexShrink: 0,
              fontSize: 10,
              fontWeight: 800,
              color: "var(--accent-cyan)",
              border: "1px solid var(--border-panel)",
              borderRadius: 4,
              padding: "2px 7px",
              background: "var(--bg-elevated)",
              fontFamily: "var(--mfe-mono)",
            }}
          >
            ◆ {p.costLabel}
          </span>
        )}
      </div>

      {/* Elemental Tribes & Structural Chips Row */}
      {!p.compact && ((p.tribes && p.tribes.length > 0) || (p.chips && p.chips.length > 0)) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {(p.tribes || []).map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  color: "#E2E8F0",
                  background: "rgba(56, 189, 248, 0.12)",
                  border: "1px solid rgba(56, 189, 248, 0.26)",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                {t}
              </span>
            ))}
            {(p.chips || []).map((c, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--accent-sky)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-panel)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  whiteSpace: "nowrap",
                }}
              >
                {c.text}
              </span>
            ))}
          </div>

          {p.verdictText && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: "0.04em",
                color: r.labelColor,
                background: r.pillBg,
                border: `1px solid ${r.pillBorder}`,
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.labelColor, flexShrink: 0 }} />
              {p.verdictText}
            </span>
          )}
        </div>
      )}

      {/* Lore / Mechanism Effect Box */}
      {!p.compact && p.thesis && (
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: "#CBD5E1",
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            padding: "6px 8px",
          }}
        >
          {p.thesis}
        </div>
      )}

      {/* TCG ATK / DEF / SAMPLE Stat Block */}
      {!p.compact && p.stats && (
        <div className="tcg-stat-grid">
          <div className="tcg-stat-cell">
            <span className="tcg-stat-lbl">{p.stats.atkLabel || "ATK · EDGE"}</span>
            <span className="tcg-stat-val" style={{ color: p.stats.atkColor || "#F8FAFC" }}>
              {p.stats.atkValue}
            </span>
          </div>
          <div className="tcg-stat-cell">
            <span className="tcg-stat-lbl">{p.stats.defLabel || "DEF · SHIELD"}</span>
            <span className="tcg-stat-val" style={{ color: p.stats.defColor || "#F8FAFC" }}>
              {p.stats.defValue}
            </span>
          </div>
          <div className="tcg-stat-cell">
            <span className="tcg-stat-lbl">{p.stats.sampleLabel || "SAMPLE"}</span>
            <span className="tcg-stat-val">{p.stats.sampleValue}</span>
          </div>
        </div>
      )}

      {p.children && <div style={{ fontSize: 11, color: "#CBD5E1" }}>{p.children}</div>}

      {/* Card Footer: Rarity Tier & Advisory Stamp */}
      {!p.compact && (
        <div
          style={{
            marginTop: "auto",
            paddingTop: 5,
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
          }}
        >
          <span style={{ color: r.labelColor, fontWeight: 700 }}>★ {p.evidenceLabel || r.label}</span>
          <span style={{ color: "#64748B" }}>{p.footNote || "Research zones · advisory only"}</span>
        </div>
      )}
    </div>
  );
}
