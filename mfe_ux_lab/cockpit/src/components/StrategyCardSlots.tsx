// StrategyCardSlots — a Strategy Card built from ROLE SLOTS (manager Phase B-4): 6 slots (Bias/Regime/Timing/
// Confirmation/Risk/Filter). Click a slot → eligible features whose role matches (qualified shown first; SHADOW/
// unproven shown but clearly tagged). Binding is EXPLICIT user action — never auto-routed. The card is a
// COMPOSITION of context features by role; it owns NO tactical authority (that's the Card/Beast core layer).
// Honesty invariants: Nó KHÔNG ra lệnh; không đưa edge chưa chứng minh lên card.
import { useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { loadCustomL1, type CustomL1Module } from "../lib/blocks/customL1.ts";
import { BASE_FEATURES } from "../lib/blocks/featureTemplates.ts";
import { ROLE_META, ROLE_STATUS_META, USAGE_ROLES, suggestRoles, roleStatusOf, type FeatureUsageRole, type RoleStatus, type FeatureRoleProfile } from "../lib/blocks/featureRoles.ts";
import { loadCustomL3, type CustomL3Module } from "../lib/blocks/customL3.ts";
import { l3CardEligibility, loadL3Card, saveL3Card } from "../lib/blocks/cardL3.ts";
import { StrategyCard, rarityOf } from "./StrategyCard.tsx";

const inp: React.CSSProperties = { background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "4px 8px", fontSize: 12 };
const CARD_KEY = "mfe_role_card";

interface SlotFeature { id: string; name: string; roles: FeatureUsageRole[]; profile: FeatureRoleProfile; promoted: boolean; system: boolean; explain: string }
type StatusOrSys = RoleStatus | "SYSTEM";
const RANK: Record<StatusOrSys, number> = { SYSTEM: 0, OOS_QUALIFIED: 1, SHADOW_QUALIFIED: 2, AUTO_SUGGESTED: 3, DECLARED: 4, REJECTED: 5 };
const proven = (s: StatusOrSys) => s === "SYSTEM" || s === "OOS_QUALIFIED";

function gather(): SlotFeature[] {
  const out: SlotFeature[] = [];
  for (const m of loadCustomL1()) { if (!m.roles) continue; out.push({ id: m.id, name: m.name, roles: [m.roles.primaryRole, ...m.roles.secondaryRoles], profile: m.roles, promoted: m.status === "PROMOTED", system: false, explain: m.explain }); }
  for (const t of BASE_FEATURES) { const p = suggestRoles(t.graph); out.push({ id: "sys_" + t.key, name: t.title, roles: [p.primaryRole, ...p.secondaryRoles], profile: p, promoted: true, system: true, explain: t.subtitle }); }
  return out;
}
const statusFor = (f: SlotFeature, role: FeatureUsageRole): StatusOrSys => (f.system ? "SYSTEM" : roleStatusOf(f.profile, role));

function StatusChip({ s }: { s: StatusOrSys }) {
  const m = s === "SYSTEM" ? { label: "system", color: "#58a6ff" } : ROLE_STATUS_META[s];
  return <span style={{ fontSize: 9, color: m.color, border: `1px solid ${m.color}66`, borderRadius: 4, padding: "0 4px" }}>{proven(s) ? <><Glyph name="check" size={9} /> </> : s === "SHADOW_QUALIFIED" ? "◐ " : "○ "}{m.label}</span>;
}

export function StrategyCardSlots({ onClose }: { onClose: () => void }) {
  const features = useMemo(gather, []);
  const [binding, setBinding] = useState<Record<string, string | null>>(() => { try { return JSON.parse(localStorage.getItem(CARD_KEY) || "{}"); } catch { return {}; } });
  const [pickFor, setPickFor] = useState<FeatureUsageRole | null>(null);
  const l3mods = useMemo(loadCustomL3, []);
  const [l3bind, setL3bind] = useState<Record<string, string | null>>(loadL3Card);
  const [pickL3For, setPickL3For] = useState<FeatureUsageRole | null>(null);
  const bindL3 = (role: FeatureUsageRole, id: string | null) => setL3bind((b) => { const nb = { ...b, [role]: id }; saveL3Card(nb); return nb; });
  const l3ById = (id: string | null | undefined) => l3mods.find((m) => m.id === id);

  const bind = (role: FeatureUsageRole, id: string | null) => setBinding((b) => { const nb = { ...b, [role]: id }; try { localStorage.setItem(CARD_KEY, JSON.stringify(nb)); } catch { /* ignore */ } return nb; });
  const featById = (id: string | null | undefined) => features.find((f) => f.id === id);
  const eligible = (role: FeatureUsageRole) => features.filter((f) => f.roles.includes(role)).sort((a, b) => RANK[statusFor(a, role)] - RANK[statusFor(b, role)]);

  const bound = USAGE_ROLES.map((r) => ({ role: r, f: featById(binding[r]) })).filter((x) => x.f);
  const filled = bound.length;
  const worst = bound.length ? Math.max(...bound.map((x) => RANK[statusFor(x.f!, x.role)])) : 0;
  const hasTrigger = !!binding["TIMING_TRIGGER"];
  const allProven = bound.length > 0 && bound.every((x) => proven(statusFor(x.f!, x.role)));

  return (
    <div style={{ position: "fixed", inset: 0, background: "#070b11", zIndex: 130, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box", overflowY: "auto" }}>
      <div className="pc-h" style={{ color: "#9fd0ff", borderColor: "#1f5b8c", display: "flex", alignItems: "center", gap: 10 }}>
        <Glyph name="card" size={14} /> Strategy Card · role slots <span className="mut">Choose each feature explicitly for its compatible slot.</span>
        <button onClick={onClose} style={{ ...inp, marginLeft: "auto", cursor: "pointer" }}><Glyph name="x" size={12} /> Close</button>
      </div>

      {/* role SLOTS dạng LÁ BÀI (WO UX4): khung 3 tầng, rarity theo STATUS THẬT của feature đã gắn — slot trống/
          feature chưa chứng minh = viền xám "chưa đo". Cơ chế bind/pick giữ NGUYÊN (bấm tay, không auto-route). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, marginTop: 6 }}>
        {USAGE_ROLES.map((role) => {
          const rm = ROLE_META[role], f = featById(binding[role]), elig = eligible(role);
          const st = f ? statusFor(f, role) : null;
          return (
            <StrategyCard key={role} name={rm.label} icon="card" tier={st ? rarityOf(st) : "unmeasured"}
              verdictText={st ? (st === "SYSTEM" ? "system" : st) : "EMPTY SLOT"}
              subtitle={`${rm.slot} · core: ${rm.core} · ${elig.length} compatible features`}
              costLabel={f ? "1 feature" : "0/1"} footNote={"research context slot"}>
              {f ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--mfe-s3)", border: `1px solid ${rm.color}55`, borderRadius: 7, padding: "5px 8px" }}>
                    <b style={{ fontSize: 12, color: "#e7eef6" }}>{f.name}</b>
                    <StatusChip s={statusFor(f, role)} />
                    <button onClick={(e) => { e.stopPropagation(); bind(role, null); }} style={{ ...inp, marginLeft: "auto", padding: "1px 7px", color: TK.red, cursor: "pointer" }}><Glyph name="x" size={10} /></button>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setPickFor(role); }} style={{ ...inp, marginTop: 5, padding: "2px 8px", fontSize: 10, cursor: "pointer", color: "var(--mfe-text2)" }}>Change feature</button>
                </>
              ) : <button onClick={(e) => { e.stopPropagation(); setPickFor(role); }} style={{ ...inp, width: "100%", cursor: "pointer", borderStyle: "dashed", color: rm.color }}>Choose a feature</button>}
            </StrategyCard>
          );
        })}
      </div>

      {/* card summary */}
      <div className="pc" style={{ margin: "10px 0 0", background: "var(--mfe-s2)", borderColor: allProven ? "#1c5b3c" : filled ? "#5a3a18" : "var(--mfe-border)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#e7eef6" }}>Card composition · {filled}/6 slots assigned</div>
        {!hasTrigger && <div className="psm" style={{ color: TK.orange, marginTop: 3 }}><Glyph name="warning" size={10} /> Missing <b>Timing / Trigger</b> — context alone does not create a setup.</div>}
        {filled > 0 && !allProven && <div className="psm" style={{ color: TK.orange, marginTop: 3 }}><Glyph name="warning" size={10} /> The Card contains <b>unproven features</b> ({ROLE_STATUS_META[(["DECLARED", "AUTO_SUGGESTED", "SHADOW_QUALIFIED"] as RoleStatus[])[Math.min(2, Math.max(0, worst - 1))] ?? "DECLARED"].label}) for research only; not OOS-qualified evidence.</div>}
        {allProven && <div className="psm" style={{ color: TK.green, marginTop: 3 }}><Glyph name="check" size={10} /> Features have individual qualification records. The combined Card still requires validation.</div>}
        <div className="pmut" style={{ fontSize: 10, marginTop: 5, fontStyle: "italic" }}>This panel assigns context roles. It does not create execution authority. Combined and per-role qualification are separate.</div>
      </div>

      {/* ── L3 SCORE SLOTS (chỉ nhận EDGE_OOS_QUALIFIED) ── */}
      <div className="pc-h" style={{ color: "#37c0ff", borderColor: "#1c4a5b", marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Glyph name="calc" size={13} /> L3 Score Slots <span className="mut">Attach a validated QuantLab score with the required OOS qualification</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 10, marginTop: 4 }}>
        {USAGE_ROLES.map((role) => {
          const rm = ROLE_META[role], m = l3ById(l3bind[role]), el = m ? l3CardEligibility(m) : null;
          return (
            <div key={role} className="pc" style={{ margin: 0, background: "var(--mfe-s2)", borderColor: "#1c4a5b" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: rm.color }} />
                <b style={{ fontSize: 13, color: rm.color }}>{rm.label}</b>
                <span className="pmut psm" style={{ marginLeft: "auto" }}>score slot</span>
              </div>
              {m && el ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, background: "var(--mfe-s3)", border: `1px solid ${el.color}66`, borderRadius: 7, padding: "5px 8px" }}>
                  <b style={{ fontSize: 12, color: "#e7eef6" }}><Glyph name="calc" size={11} /> {m.name}</b>
                  <span style={{ fontSize: 9, color: el.color, border: `1px solid ${el.color}66`, borderRadius: 4, padding: "0 4px" }}>{el.verdict}</span>
                  <span className="pmut" style={{ fontSize: 9, fontFamily: "var(--mfe-mono)" }}>IC {m.validationReport ? (m.validationReport.realIC >= 0 ? "+" : "") + m.validationReport.realIC.toFixed(3) : "—"}</span>
                  <button onClick={() => bindL3(role, null)} style={{ ...inp, marginLeft: "auto", padding: "1px 7px", color: TK.red, cursor: "pointer" }}><Glyph name="x" size={10} /></button>
                </div>
              ) : <button onClick={() => setPickL3For(role)} style={{ ...inp, width: "100%", marginTop: 6, cursor: "pointer", borderStyle: "dashed", color: "#37c0ff" }}>Select a validated L3 score</button>}
            </div>
          );
        })}
      </div>
      <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", borderColor: "#1c4a5b" }}>
        <div className="pmut" style={{ fontSize: 10, fontStyle: "italic", lineHeight: 1.6 }}>Eligibility requires a QuantLab verdict of <b style={{ color: "#3fb950" }}>EDGE_OOS_QUALIFIED</b> . Null-edge, conditional and unvalidated formulas are not eligible. A score remains research evidence.</div>
      </div>

      {/* picker */}
      {pickFor && (
        <div onClick={() => setPickFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(2,6,12,.7)", zIndex: 140, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} className="pc" style={{ width: 560, maxWidth: "100%", borderColor: ROLE_META[pickFor].color + "88" }}>
            <div className="pc-h" style={{ color: ROLE_META[pickFor].color }}>Choose a feature for slot <b>{ROLE_META[pickFor].label}</b></div>
            {eligible(pickFor).length === 0 && <div className="pmut psm">No feature has this role yet. Build and qualify a feature in the L1 sandbox.</div>}
            {eligible(pickFor).map((f) => { const s = statusFor(f, pickFor); return (
              <div key={f.id} onClick={() => { bind(pickFor, f.id); setPickFor(null); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, marginBottom: 4, background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><b style={{ fontSize: 12.5, color: "#e7eef6" }}>{f.name}</b>{f.system && <span className="pmut" style={{ fontSize: 9 }}>(system)</span>}<StatusChip s={s} /></div>
                  <div className="pmut" style={{ fontSize: 9.5 }}>{f.explain.length > 80 ? f.explain.slice(0, 78) + "…" : f.explain} · role: {f.roles.map((r) => ROLE_META[r].label).join(" · ")}</div>
                </div>
                {!proven(s) && <span style={{ fontSize: 9, color: TK.orange, fontWeight: 800 }}>UNPROVEN</span>}
              </div>
            ); })}
            <div className="pmut" style={{ fontSize: 9.5, marginTop: 4, fontStyle: "italic" }}><Glyph name="check" size={9} /> qualified; partially qualified; or declared/unproven. Inspect the qualification record before use.</div>
          </div>
        </div>
      )}

      {/* L3 score picker — eligibility-gated */}
      {pickL3For && (
        <div onClick={() => setPickL3For(null)} style={{ position: "fixed", inset: 0, background: "rgba(2,6,12,.7)", zIndex: 140, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} className="pc" style={{ width: 580, maxWidth: "100%", borderColor: "#1c4a5b" }}>
            <div className="pc-h" style={{ color: "#37c0ff" }}>Choose an L3 score for slot <b>{ROLE_META[pickL3For].label}</b> — EDGE_OOS_QUALIFIED only</div>
            {l3mods.length === 0 && <div className="pmut psm">No L3 formula is available. Open <Glyph name="calc" size={10} /> QuantLab, save a formula and run its validation.</div>}
            {l3mods.map((m) => { const el = l3CardEligibility(m); return (
              <div key={m.id} onClick={() => { if (el.eligible) { bindL3(pickL3For, m.id); setPickL3For(null); } }} title={el.reason} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, marginBottom: 4, background: "var(--mfe-s3)", border: `1px solid ${el.eligible ? el.color + "66" : "var(--mfe-border)"}`, cursor: el.eligible ? "pointer" : "not-allowed", opacity: el.eligible ? 1 : 0.6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><b style={{ fontSize: 12.5, color: "#e7eef6" }}><Glyph name="calc" size={11} /> {m.name}</b><span style={{ fontSize: 9, color: el.color, border: `1px solid ${el.color}66`, borderRadius: 4, padding: "0 4px" }}>{el.verdict}</span><span className="pmut" style={{ fontSize: 9, fontFamily: "var(--mfe-mono)" }}>v{m.version} · {m.outputType}</span></div>
                  <div className="pmut" style={{ fontSize: 9.5 }}>{el.reason}</div>
                </div>
                {el.eligible ? <span style={{ fontSize: 9, color: "#3fb950", fontWeight: 800 }}>ELIGIBLE</span> : <span style={{ fontSize: 9, color: el.color, fontWeight: 800 }}>BLOCKED</span>}
              </div>
            ); })}
            <div className="pmut" style={{ fontSize: 9.5, marginTop: 4, fontStyle: "italic" }}>Only EDGE_OOS_QUALIFIED formulas are eligible. Other results remain blocked with a reason.</div>
          </div>
        </div>
      )}
    </div>
  );
}
