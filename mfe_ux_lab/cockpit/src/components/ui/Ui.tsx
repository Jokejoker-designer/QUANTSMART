// MFE Co-Trade Cockpit — shared UI primitives, 1:1 with the mockup package
// (UXUI/MFE_CoTrade_Cockpit_Mockup_Package/docs/UI_COMPONENT_LIBRARY.md).
// Every screen composes from these so the look stays "y chang" and governance is centralised.
// ADVISORY_ONLY · ORDER_SEND_FORBIDDEN · ZONE_ONLY · USER_DECIDES.
import type { ReactNode } from "react";
import "../../theme/tokens.css";

// ── design-token colors (mirror of specs/design_tokens.json) for inline use (gauges/bars) ──
export const TK = {
  bg: "#0A1124", s1: "#121E3A", s2: "#17264A", s3: "#1D2F5A", border: "rgba(0, 212, 255, 0.25)",
  text: "#F8FAFC", text2: "#94B2D8", muted: "#94B2D8",
  cyan: "#00E5FF", blue: "#38BDF8", green: "#00E676", yellow: "#FFB300",
  orange: "#FFB300", red: "#FF3B5C", purple: "#B388FF", teal: "#00E5FF",
};

// ── governance: forbidden copy must never render. If a label slips through, it is neutralised. ──
const FORBIDDEN = ["BUY NOW", "SELL NOW", "GUARANTEED", "PROFIT PROMISE", "BEST SIGNAL",
  "WIN-RATE BOOSTER", "CERTAIN REVERSAL", "RECOMMENDED LOT", "ALPHA_CERTIFIED", "BUY_NOW", "SELL_NOW"];
export function safeCopy(s: string): string {
  const up = (s || "").toUpperCase();
  return FORBIDDEN.some((f) => up.includes(f)) ? "⛔ blocked copy" : s;
}

// ── status badge: maps an allowed status word → a governed color family ──
type Kind = "good" | "watch" | "early" | "event" | "avoid" | "none" | "shadow";
export function statusKind(label: string): Kind {
  const u = (label || "").toUpperCase();
  if (/(GOOD FIT|COMPATIBLE|SUITABLE|PASS|CLEAN|HEALTHY)/.test(u)) return "good";
  if (/(AVOID|BLOCK|HOSTILE|DANGER|DO[ _-]?NOT)/.test(u)) return "avoid";
  if (/(EVENT|UNSTABLE|CAUTION|WARN)/.test(u)) return "event";
  if (/(EARLY|OPPORTUNITY|CONDITIONAL)/.test(u)) return "early";
  if (/(SHADOW|PAPER)/.test(u)) return "shadow";
  if (/(NO RELIABLE|INSUFFICIENT|LOW SAMPLE|UNKNOWN|N\/A|—)/.test(u)) return "none";
  return "watch";
}
export function StatusBadge({ label, kind }: { label: string; kind?: Kind }) {
  const k = kind || statusKind(label);
  return <span className={`mfe-badge ${k}`}><span className="dot" />{safeCopy(label)}</span>;
}

// ── AuthorityPillBar: the immutable, always-on governance row ──
export function AuthorityPillBar({ note }: { note?: string }) {
  return (
    <div className="mfe-pillbar" data-testid="authority-bar">
      <span className="auth lock">REPORT_ONLY</span>
      <span className="auth lock">SHADOW_ONLY</span>
      <span className="auth lock">DIAGNOSTIC_ONLY</span>
      <span className="auth warn">NO_DECISION</span>
      <span className="auth stop">LIVE APPLY: FALSE</span>
      <span className="auth stop">ORDER_SEND: FORBIDDEN</span>
      <span className="note">{note || "advisory visualization · zone-only · the user makes the final decision"}</span>
    </div>
  );
}

// ── MetricCard: a header stat tile ──
export function MetricCard({ label, value, sub, color }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string;
}) {
  return (
    <div className="mfe-metric">
      <div className="lbl">{label}</div>
      <div className="val" style={color ? { color } : undefined}>{value}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  );
}

// ── SectionCard: a titled panel ──
export function SectionCard({ title, right, children, style }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div className="mfe-card" style={style}>
      {(title || right) && <div className="h"><span className="t">{title}</span>{right && <span className="r">{right}</span>}</div>}
      {children}
    </div>
  );
}

// ── RiskGauge: 0..1 arc (green→yellow→orange→red). Color = status, not promise. ──
export function RiskGauge({ value, caption, size = 96, invert = false }: {
  value: number; caption?: string; size?: number; invert?: boolean;
}) {
  const v = Math.max(0, Math.min(1, value || 0));
  const score = invert ? 1 - v : v; // invert=true → high is GOOD (confidence/health)
  const col = score >= 0.66 ? TK.red : score >= 0.4 ? TK.orange : score >= 0.2 ? TK.yellow : TK.green;
  const goodCol = score >= 0.66 ? TK.green : score >= 0.4 ? TK.teal : score >= 0.2 ? TK.yellow : TK.muted;
  const stroke = invert ? goodCol : col;
  const r = size / 2 - 8, c = Math.PI * r, off = c * (1 - v);
  return (
    <div className="mfe-gauge">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path d={`M8 ${size / 2} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2}`} fill="none" stroke={TK.s3} strokeWidth={8} strokeLinecap="round" />
        <path d={`M8 ${size / 2} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2}`} fill="none" stroke={stroke} strokeWidth={8}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="num" style={{ color: stroke, marginTop: -size / 4 }}>{(v * 100).toFixed(0)}<span style={{ fontSize: 12 }}>%</span></div>
      {caption && <div className="cap">{caption}</div>}
    </div>
  );
}

// ── ZoneTag: zone-role chip (never an exact order ticket) ──
type ZoneRole = "observation" | "confirmation" | "risk" | "invalidation" | "avoid" | "reentry";
export function ZoneTag({ role, children }: { role: ZoneRole; children: ReactNode }) {
  return <span className={`mfe-zone ${role}`}>{children}</span>;
}

// ── Seg: segmented chooser (timeframe / mode / direction) ──
export function Seg<T extends string>({ value, options, onChange, kindOf }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; kindOf?: (v: T) => "" | "long" | "short";
}) {
  return (
    <div className="mfe-seg">
      {options.map((o) => (
        <button key={o} className={`${value === o ? "on" : ""} ${value === o && kindOf ? kindOf(o) : ""}`} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

// ── EmptyState: the "nothing selected yet" prompt ──
export function EmptyState({ icon = "◫", msg, hint }: { icon?: string; msg: string; hint?: string }) {
  return (
    <div className="mfe-empty">
      <div className="ic">{icon}</div>
      <div className="msg">{msg}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

// ── SelectorFrame: "build the frame first, the user chooses inside it to reveal" ──
// `ready` decides whether to render `children` or the empty prompt. Controls go in `controls`.
export function SelectorFrame({ title, controls, ready, emptyMsg, emptyHint, emptyIcon, children }: {
  title: ReactNode; controls?: ReactNode; ready: boolean;
  emptyMsg?: string; emptyHint?: string; emptyIcon?: string; children: ReactNode;
}) {
  return (
    <div className="mfe-selframe">
      <div className="bar">
        <span className="t">{title}</span>
        {controls && <span className="controls">{controls}</span>}
      </div>
      <div className="body">
        {ready ? children : <EmptyState icon={emptyIcon} msg={emptyMsg || "Select an option above to display"} hint={emptyHint} />}
      </div>
    </div>
  );
}

// ── InfoTip: Subtle circular "i" badge with clean hover pop-up tooltip ──
export function InfoTip({
  text,
  children,
  title,
  align = "left",
  bottom = false,
  style,
}: {
  text?: ReactNode;
  children?: ReactNode;
  title?: string;
  align?: "left" | "right" | "center";
  bottom?: boolean;
  style?: React.CSSProperties;
}) {
  const cls = [
    "mfe-infotip",
    align === "right" ? "align-right" : align === "center" ? "align-center" : "",
    bottom ? "pos-bottom" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} tabIndex={0} style={style} onClick={(e) => e.stopPropagation()}>
      i
      <span className="mfe-infotip-pop" role="tooltip">
        {title && <span className="mfe-infotip-title">{title}</span>}
        {text ?? children}
      </span>
    </span>
  );
}
