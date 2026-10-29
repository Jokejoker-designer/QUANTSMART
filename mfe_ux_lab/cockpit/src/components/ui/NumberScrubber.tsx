import { useEffect, useId, useState, type CSSProperties } from "react";
import { numericPrecision, parseNumericDraft, stepNumeric } from "./numericInput.ts";
export function NumberScrubber({ label, value, min, max, step, onChange, onValidityChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; onValidityChange?: (valid: boolean) => void;
}) {
  const precision = numericPrecision(step);
  const [draft, setDraft] = useState(() => value.toFixed(precision));
  const [invalid, setInvalid] = useState(false); const id = useId();
  useEffect(() => { setDraft(value.toFixed(precision)); setInvalid(false); }, [value, precision]);
  const commit = () => {
    const parsed = parseNumericDraft(draft, min, max, step);
    setInvalid(parsed === null); onValidityChange?.(parsed !== null);
    if (parsed !== null) { onChange(parsed); setDraft(parsed.toFixed(precision)); }
  };
  const move = (direction: number) => { const next = stepNumeric(value, direction, min, max, step); setDraft(next.toFixed(precision)); setInvalid(false); onValidityChange?.(true); onChange(next); };
  return <div className="numeric-field"><div className={`number-scrubber ${invalid ? "invalid" : ""}`} style={{ "--number-fill": `${100 * Math.max(0, Math.min(1, (value - min) / (max - min)))}%` } as CSSProperties}>
    <span className="number-fill" aria-hidden="true" /><input aria-label={label} role="spinbutton" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-invalid={invalid} aria-describedby={invalid ? id : undefined} inputMode="decimal" value={draft} onChange={(e) => { setDraft(e.target.value); const valid = parseNumericDraft(e.target.value, min, max, step) !== null; setInvalid(!valid); onValidityChange?.(valid); }} onBlur={commit} onKeyDown={(e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { setDraft(value.toFixed(precision)); setInvalid(false); onValidityChange?.(true); }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); move(e.key === "ArrowUp" ? 1 : -1); }
    }} /><div className="number-steps"><button aria-label={`Decrease ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => move(-1)} disabled={value <= min}>−</button><button aria-label={`Increase ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => move(1)} disabled={value >= max}>+</button></div>
  </div>{invalid && <span className="numeric-error" id={id}>{min}–{max} · step {step}</span>}</div>;
}
