// BeastDeckBoard — bàn ghép deck Beast theo ROLE SLOTS (WO UX4 · PRESENTATION_ONLY). Mỗi member là một lá bài
// (StrategyCard compact) đặt vào ô đúng vai; giữa các cặp member vẽ synergy-line theo affinityObserved THẬT:
// UNTESTED → xám mờ (mặc định trung thực, doctrine F0), INSUFFICIENT_EVIDENCE → nhạt, CHỈ cặp có band ĐO ĐƯỢC
// (COMPLEMENTARY/CONFLICTED/…) mới glow màu — cấm glow đẹp cho cặp chưa đo. Budget bar = engine-runs THẬT theo
// công thức measurePairs (2 + 2·pairs) vs SYNERGY_BUDGET.MAX_ENGINE_RUNS_PER_BATCH. Read-only cardBeastV2.
import { useMemo } from "react";
import { StrategyCard, ROLE_BADGE, type RarityTier } from "./StrategyCard.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { censusOf } from "../lib/cardBeastV2/moduleRoleCensus.ts";
import { affinityOf, type AffinityCell } from "../lib/cardBeastV2/affinityObserved.ts";
import { SYNERGY_BUDGET } from "../lib/cardBeastV2/budget.ts";

// ── PURE (export cho harness khóa vĩnh viễn) ──
export interface GlowStyle { kind: "muted" | "active"; color: string; label: string }
/** Glow chỉ dành cho cặp CÓ SỐ ĐO: COMPLEMENTARY xanh · CONFLICTED/HARMFUL đỏ (đo được nhưng XẤU — vẫn hiện,
 *  không giấu) · REDUNDANT vàng. UNTESTED/INSUFFICIENT/structural/shadow-testing/lạ → muted xám (fail-closed). */
export function glowOf(state: string | null | undefined): GlowStyle {
  switch ((state || "").toUpperCase()) {
    case "COMPLEMENTARY": return { kind: "active", color: "#21D07A", label: "measured synergy" };
    case "SHADOW_VALIDATED": return { kind: "active", color: "#25B7FF", label: "shadow-validated" };
    case "CONFLICTED": return { kind: "active", color: "#FF6A60", label: "measured conflict" };
    case "HARMFUL": return { kind: "active", color: "#FF4D4D", label: "measured harm" };
    case "REDUNDANT": return { kind: "active", color: "#F4C542", label: "measured overlap" };
    default: return { kind: "muted", color: "#3a4652", label: "Untested pair" };
  }
}

export interface DeckBudget { pairs: number; engineRuns: number; cap: number; over: boolean }
/** Cost THẬT: pairs = C(n,2); engine-runs = 2 + 2·pairs (đúng công thức measurePairs của affinityObserved —
 *  base train/held + mỗi cặp thêm 2 run). KHÔNG bịa mana. */
export function deckBudget(nMembers: number): DeckBudget {
  const n = Math.max(0, Math.floor(nMembers));
  const pairs = n >= 2 ? (n * (n - 1)) / 2 : 0;
  const engineRuns = pairs > 0 ? 2 + 2 * pairs : 0;
  const cap = SYNERGY_BUDGET.MAX_ENGINE_RUNS_PER_BATCH;
  return { pairs, engineRuns, cap, over: engineRuns > cap };
}

// slot theo đúng thứ tự vai (invariant role SLOTS — không nới để đẹp)
const SLOT_ORDER = ["ATTACKER", "GUARD", "CONFIRMATION", "SCOUT", "EXIT_SENTINEL", "FALLBACK", "SAFETY"] as const;

import { legacyDisplayCopy } from "../lib/legacyDisplayCopy.ts";
export interface DeckMember { card_id: string; role: string; modules: string[] }

function tribesOfMember(m: DeckMember): string[] {
  return [...new Set(m.modules.flatMap((id) => censusOf(id)?.tribes || []))];
}
/** affinity đo được tốt nhất giữa 2 member (qua các cặp tribe của chúng) — không có số đo → null (muted). */
function pairAffinity(a: DeckMember, b: DeckMember): AffinityCell | null {
  let best: AffinityCell | null = null;
  for (const ta of tribesOfMember(a)) for (const tb of tribesOfMember(b)) {
    if (ta === tb) continue;
    const cell = affinityOf(ta, tb);
    if (cell && (cell.state === "COMPLEMENTARY" || cell.state === "CONFLICTED")) {
      if (!best || Math.abs(cell.score) > Math.abs(best.score)) best = cell;
    } else if (cell && !best) best = cell;
  }
  return best;
}

export function BeastDeckBoard({ name, members, warnings = 0, tierOf, actions }: {
  name: string;
  members: DeckMember[];
  warnings?: number;
  tierOf?: (m: DeckMember) => RarityTier;   // caller map verdict thật → tier; mặc định "unmeasured" (trung thực)
  actions?: React.ReactNode;                 // nút export/xoá của caller — board không tự chế hành động
}) {
  const visible = members.filter((m) => m.role !== "SAFETY");
  const budget = deckBudget(visible.length);
  const links = useMemo(() => {
    const out: { a: number; b: number; glow: GlowStyle; note: string }[] = [];
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
      const cell = pairAffinity(visible[i], visible[j]);
      const glow = glowOf(cell?.state);
      out.push({ a: i, b: j, glow, note: cell ? `${cell.tribes.join("×")} · ${cell.state}${cell.note ? " · " + cell.note : ""}` : "No tribe pair has measured interaction evidence" });
    }
    return out;
  }, [members]);   // eslint-disable-line

  return (
    <div style={{ border: "1px solid #223142", borderRadius: 12, padding: "10px 12px", background: "linear-gradient(180deg,#0c1420 0%,#0a1017 100%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <b style={{ fontSize: 13, color: "#e7eef6" }}><Glyph name="beast" size={12} /> {name}</b>
        {warnings > 0 && <span style={{ fontSize: 9.5, color: "#FF8A2A" }}><Glyph name="warning" size={9} /> {warnings} composition warnings</span>}
        <span style={{ marginLeft: "auto", fontSize: 8.5, color: "#5b6b7d", fontStyle: "italic" }}>Research zones, not execution instructions</span>
      </div>

      {/* SLOTS theo vai — bàn chơi bài; ô trống hiện mờ (giữ nguyên invariant role) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        {SLOT_ORDER.filter((r) => r !== "SAFETY").map((role) => {
          const ms = visible.filter((m) => m.role === role);
          const rb = ROLE_BADGE[role];
          return (
            <div key={role} style={{ minHeight: 86, border: `1px dashed ${ms.length ? rb.color + "55" : "#22303e"}`, borderRadius: 10, padding: 5, background: ms.length ? rb.color + "0a" : "transparent" }}>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: ms.length ? rb.color : "#3f4e5c", letterSpacing: ".4px", marginBottom: 4 }}><Glyph name={rb.icon} size={9} /> {role.replace("_SENTINEL", "")}</div>
              {ms.length === 0 ? <div style={{ fontSize: 9, color: "#3f4e5c", fontStyle: "italic", textAlign: "center", paddingTop: 12 }}>Empty slot</div>
                : ms.map((m, i) => (
                  <div key={i} style={{ marginBottom: 4 }} title={m.modules.join(" · ")}>
                    <StrategyCard compact name={legacyDisplayCopy(m.card_id)} role={m.role} tier={tierOf ? tierOf(m) : "unmeasured"} costLabel={`${m.modules.length} mod`} />
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* SYNERGY — đường nối theo affinity ĐO THẬT (danh sách, đọc được cả lý do) */}
      {links.length > 0 && (
        <div style={{ marginTop: 8, borderTop: "1px solid #14202c", paddingTop: 6 }}>
          <div style={{ fontSize: 8.5, color: "#63758a", fontWeight: 700, letterSpacing: ".4px", marginBottom: 4 }}>Pairwise interaction evidence</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {links.map((l, i) => (
              <span key={i} title={l.note} style={{
                display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, borderRadius: 6, padding: "2px 7px",
                color: l.glow.kind === "active" ? l.glow.color : "#5b6b7d",
                border: `1px solid ${l.glow.kind === "active" ? l.glow.color + "88" : "#2a3642"}`,
                boxShadow: l.glow.kind === "active" ? `0 0 8px ${l.glow.color}44` : "none",
                background: l.glow.kind === "active" ? l.glow.color + "12" : "transparent",
              }}>
                {legacyDisplayCopy(visible[l.a].card_id)} <span style={{ opacity: .6 }}>⟷</span> {legacyDisplayCopy(visible[l.b].card_id)}
                <i style={{ opacity: .75, fontStyle: "normal" }}>· {l.glow.label}</i>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* BUDGET BAR — engine-runs thật vs cap (măng-đa không tồn tại ở đây) */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 8.5, color: "#63758a", fontWeight: 700 }}>BUDGET</span>
        <div style={{ flex: 1, height: 7, background: "#111c28", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (budget.engineRuns / budget.cap) * 100)}%`, height: "100%", background: budget.over ? "#FF4D4D" : "#25B7FF", borderRadius: 4 }} />
        </div>
        <span style={{ fontSize: 9, fontFamily: "var(--mfe-mono)", color: budget.over ? "#FF6A60" : "#9fb2c8" }}>
          {budget.pairs} pairs {budget.engineRuns}/{budget.cap} engine-runs{budget.over ? "Exceeds the current evaluation budget" : ""}
        </span>
      </div>
      {actions && <div style={{ marginTop: 8, display: "flex", gap: 6 }}>{actions}</div>}
    </div>
  );
}
