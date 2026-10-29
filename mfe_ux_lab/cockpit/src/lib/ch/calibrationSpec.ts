// CH-WO-0 — the shared self-calibration GATE (manager §5.5: self-learning is the default, never a cage).
// Every CH module declares a `calibration_spec` (chTypes) so this ONE honest protocol auto-applies:
//   (1) fit on TRAIN only            [caller, via the spec's fit_window]
//   (2) validate OOS                 [caller, via walkForward → oosScore]
//   (3) era-stability ≥ 0.70         [CH-WO-0 metric]
//   (4) BEAT the default on OOS, else FALL BACK to default
//   (5) SHADOW_ONLY until proven     [ceiling here — this gate can never return ACTIVE]
// An in-sample-only fit is REJECTED; an era-unstable fit is REJECTED. Reuses the trend-expander-promote-gate
// doctrine. This file is the pure DECISION; the fitting/OOS runs live in CH-WO-1+ (walkForward/simAblation).
import { ERA_STABILITY_MIN } from "./chMetrics.ts";
import type { CalibrationSpec } from "./chTypes.ts";

export type CalibrationState =
  | "ACCEPTED_SHADOW"          // beats default OOS + era-stable → use fitted value, but SHADOW_ONLY
  | "FELL_BACK_TO_DEFAULT"     // did not beat default OOS → use default
  | "REJECTED_ERA_UNSTABLE"    // era-stability < 0.70 → use default
  | "REJECTED_INSAMPLE_ONLY"   // fit positive but OOS non-positive → curve-fit, use default
  | "MANUAL_OVERRIDE";         // user turned self-calibration off (AUTO/MANUAL is a user choice, not a cage)

export interface CalibrationEvidence {
  fittedValue: number;
  fitScore: number;            // objective on the FIT window
  oosScore: number;            // objective on the disjoint OOS window
  defaultOosScore: number;     // the default value's objective on the SAME OOS window
  eraStability: number;        // CH-WO-0 metric across ≥2 eras
}
export interface CalibrationVerdict {
  state: CalibrationState;
  usedValue: number;           // the value the system will actually use
  shadowOnly: boolean;         // ALWAYS true unless MANUAL — this gate never authorises ACTIVE
  reasons: string[];
}

export function calibrationVerdict(spec: CalibrationSpec, ev: CalibrationEvidence): CalibrationVerdict {
  if (spec.mode === "MANUAL") {
    return { state: "MANUAL_OVERRIDE", usedValue: ev.fittedValue, shadowOnly: false, reasons: ["MANUAL — user override; self-calibration off (allowed, not a cage)"] };
  }
  const reasons: string[] = [];
  if (ev.eraStability < ERA_STABILITY_MIN) {
    reasons.push(`ERA_UNSTABLE: ${ev.eraStability} < ${ERA_STABILITY_MIN} → fall back to default`);
    return { state: "REJECTED_ERA_UNSTABLE", usedValue: spec.default_value, shadowOnly: true, reasons };
  }
  if (ev.fitScore > 0 && ev.oosScore <= 0) {
    reasons.push("IN_SAMPLE_ONLY: positive on fit, non-positive OOS → curve-fit rejected");
    return { state: "REJECTED_INSAMPLE_ONLY", usedValue: spec.default_value, shadowOnly: true, reasons };
  }
  if (ev.oosScore <= ev.defaultOosScore) {
    reasons.push(`NO_BEAT: OOS ${ev.oosScore} ≤ default OOS ${ev.defaultOosScore} → fall back to default`);
    return { state: "FELL_BACK_TO_DEFAULT", usedValue: spec.default_value, shadowOnly: true, reasons };
  }
  reasons.push(`ACCEPTED: beats default OOS (${ev.oosScore} > ${ev.defaultOosScore}) + era-stable (${ev.eraStability}) — SHADOW_ONLY until proven`);
  return { state: "ACCEPTED_SHADOW", usedValue: ev.fittedValue, shadowOnly: true, reasons };
}

// spec hygiene: fit/oos windows must be DISJOINT (no leakage) and within [0,1].
export function isValidCalibrationSpec(spec: CalibrationSpec): boolean {
  const f = spec.fit_window, o = spec.oos_window;
  const inUnit = (w: { startFrac: number; endFrac: number }) => w.startFrac >= 0 && w.endFrac <= 1 && w.startFrac < w.endFrac;
  const disjoint = o.startFrac >= f.endFrac || f.startFrac >= o.endFrac;
  return inUnit(f) && inUnit(o) && disjoint && spec.range[0] <= spec.range[1];
}
