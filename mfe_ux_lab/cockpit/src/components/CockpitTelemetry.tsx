// Presentation only. SHADOW_ONLY / NO_DECISION. Scales never imply trading permission.
import { finite } from "../lib/cockpitTelemetry.ts";

export type TelemetryTone = "info" | "safe" | "danger" | "warn" | "shadow";

export function Gauge({ value, tone = "info", label }: { value: number | null; tone?: TelemetryTone; label: string }) {
  const numeric = finite(value);
  const bounded = numeric === null ? null : Math.max(0, Math.min(100, numeric));
  return <div className={`quant-gauge ${tone}`} role={bounded === null ? undefined : "meter"} aria-label={label} aria-valuemin={bounded === null ? undefined : 0} aria-valuemax={bounded === null ? undefined : 100} aria-valuenow={bounded ?? undefined}>
    {bounded !== null && <span style={{ width: `${bounded}%` }} />}
  </div>;
}

export function InstrumentDial({ progress, display, unit, label, tone = "info" }: {
  progress: number | null; display: string; unit: string; label: string; tone?: TelemetryTone;
}) {
  const numeric = finite(progress);
  const bounded = numeric === null ? null : Math.max(0, Math.min(100, numeric));
  const available = bounded !== null;
  const reading = available ? `${display} ${unit}` : "Not available";
  return <div className={`quant-dial ${tone}`} data-state={available ? "ready" : "unavailable"}
    role={available ? "meter" : "img"} aria-label={available ? label : `${label}: not available`} title={`${label} · ${reading}`}
    aria-valuemin={available ? 0 : undefined} aria-valuemax={available ? 100 : undefined}
    aria-valuenow={bounded ?? undefined} aria-valuetext={available ? reading : undefined}>
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g className="quant-dial-ticks">{Array.from({ length: 12 }, (_, i) => <line key={i} x1="32" y1="1.5" x2="32" y2={i % 3 === 0 ? "5.5" : "4"} transform={`rotate(${i * 30} 32 32)`} />)}</g>
      <circle className="quant-dial-track" cx="32" cy="32" r="24" />
      {available && <circle className="quant-dial-reading" cx="32" cy="32" r="24" pathLength="100" strokeDasharray={`${bounded} ${100 - bounded}`} transform="rotate(-90 32 32)" />}
      <circle className="quant-dial-inner" cx="32" cy="32" r="18" />
      <text className={`quant-dial-number ${display.length > 4 ? "wide" : ""}`} x="32" y="32.5">{available ? display : "—"}</text>
      <text className="quant-dial-unit" x="32" y="42">{available ? unit : "NO DATA"}</text>
    </svg>
    {!available && <span className="quant-sr-only">Not available</span>}
  </div>;
}

export function BiasBar({ gapAtr, frame }: { gapAtr: number | null; frame: string }) {
  const gap = finite(gapAtr);
  const bounded = gap === null ? null : Math.max(-2, Math.min(2, gap));
  const width = bounded === null ? 0 : Math.abs(bounded) / 2 * 50;
  return <div className="quant-bias-bar" role={gap === null ? undefined : "meter"}
    aria-label={`${frame} signed EMA gap in ATR, display capped at ±2`}
    aria-valuemin={gap === null ? undefined : -2} aria-valuemax={gap === null ? undefined : 2}
    aria-valuenow={bounded ?? undefined} aria-valuetext={gap === null ? undefined : `${gap.toFixed(2)} ATR`}>
    <i className="quant-bias-origin" />
    {bounded !== null && <span className={bounded < 0 ? "danger" : "safe"} style={{ left: `${bounded < 0 ? 50 - width : 50}%`, width: `${width}%` }} />}
  </div>;
}

export function Telemetry({ label, value, detail, gauge, tone = "info", gaugeLabel, dialDisplay, dialUnit }: {
  label: string; value: string; detail: string; gauge: number | null; tone?: TelemetryTone;
  gaugeLabel: string; dialDisplay: string; dialUnit: string;
}) {
  return <section className={`product-kpi-card quant-telemetry ${tone}`}>
    <span className="product-kpi-label" title={label}>{label}</span>
    <div className="quant-telemetry-reading">
      <InstrumentDial progress={gauge} display={dialDisplay} unit={dialUnit} label={gaugeLabel} tone={tone} />
      <strong>{value}</strong>
    </div>
    <Gauge value={gauge} tone={tone} label={`${gaugeLabel} · bar`} />
    <small>{detail}</small>
  </section>;
}
