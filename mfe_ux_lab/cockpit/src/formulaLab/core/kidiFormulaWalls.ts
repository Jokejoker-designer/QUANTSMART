/**
 * kidiFormulaWalls.ts — KIDI's doctrine for the formula lab:
 *   when math becomes unsafe, LABEL the wall/state instead of crashing.
 *
 * Each guarded op returns the value plus an optional WallState. A hard wall
 * seals the value (NaN) so downstream rendering can quarantine the cell rather
 * than draw a misleading surface.
 */
import type { WallState } from "./coordinateTypes";

export const DIV_EPS = 1e-12;
export const EXP_MAX_ARG = 709; // exp overflow threshold for f64

export interface Guarded {
  value: number;
  wall: WallState | null;
}

const ok = (value: number): Guarded => ({ value, wall: null });
const sealed = (wall: WallState): Guarded => ({ value: NaN, wall });

/** Final seal: any non-finite result becomes a labelled NAN_INF_SEAL. */
export function seal(value: number): Guarded {
  return Number.isFinite(value) ? ok(value) : sealed("NAN_INF_SEAL");
}

export function safeDiv(a: number, b: number): Guarded {
  if (Math.abs(b) < DIV_EPS) return sealed("KIDI_DIV_WALL");
  return seal(a / b);
}

export function safeLog(x: number): Guarded {
  if (x <= 0) return sealed("DOMAIN_WALL_LOG");
  return seal(Math.log(x));
}

export function safeSqrt(x: number): Guarded {
  if (x < 0) return sealed("DOMAIN_WALL_SQRT");
  return seal(Math.sqrt(x));
}

export function safeExp(x: number): Guarded {
  if (x > EXP_MAX_ARG) return sealed("EXP_OVERFLOW_WALL");
  return seal(Math.exp(x));
}

export function safePow(a: number, b: number): Guarded {
  // negative base with non-integer exponent ⇒ complex ⇒ domain seal
  if (a < 0 && !Number.isInteger(b)) return sealed("DOMAIN_WALL_SQRT");
  return seal(Math.pow(a, b));
}

/** standard deviation guard used by transforms (zscore). */
export function rollingStdGuard(std: number): WallState | null {
  return Math.abs(std) < DIV_EPS ? "ROLLING_STD_ZERO_WALL" : null;
}

export const HARD_WALLS: WallState[] = [
  "KIDI_DIV_WALL",
  "DOMAIN_WALL_LOG",
  "DOMAIN_WALL_SQRT",
  "EXP_OVERFLOW_WALL",
  "ROLLING_STD_ZERO_WALL",
  "NAN_INF_SEAL",
];

export const LOOKAHEAD_WALLS: WallState[] = [
  "LOOKAHEAD_FAIL",
  "HTF_FORMING_BAR",
  "ORACLE_LABEL_LEAK",
];

export function isHardWall(w: WallState): boolean {
  return HARD_WALLS.includes(w);
}
