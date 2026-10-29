// coefProfileStore — the user's tuned trigger-coefficient profile (global). EMPTY by default → the engine uses
// DEFAULT_TRIGGER_COEF (historical values) → regression-identical. Only when the user tunes (or accepts a proven
// self-calibration) does a partial override get stored + applied to backtests. Node/tests have no localStorage →
// getCoefProfile() returns undefined → default. Doctrine: user-overridable, transparent, never a hidden guess.
import type { TriggerCoefOverride } from "./coefficientCalibration.ts";

const LS = "mfe_coef_profile";
export const COEF_PROFILE_EVENT = "mfe-coef-changed";
let _cache: TriggerCoefOverride | null | undefined = undefined;   // undefined = not loaded, null = loaded-empty

export function getCoefProfile(): TriggerCoefOverride | undefined {
  if (_cache === undefined) {
    try { const raw = localStorage.getItem(LS); _cache = raw ? (JSON.parse(raw) as TriggerCoefOverride) : null; }
    catch { _cache = null; }   // no localStorage (node) or parse error → empty
  }
  return _cache && Object.keys(_cache).length ? _cache : undefined;
}

export function setCoefProfile(p: TriggerCoefOverride | null): void {
  _cache = p && Object.keys(p).length ? p : null;
  try { if (_cache) localStorage.setItem(LS, JSON.stringify(_cache)); else localStorage.removeItem(LS); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(COEF_PROFILE_EVENT)); } catch { /* ignore */ }
}
