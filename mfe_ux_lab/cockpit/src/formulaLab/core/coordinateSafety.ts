/**
 * coordinateSafety.ts — aggregate the KIDI / no-lookahead / finite-output gate.
 *
 * A no-lookahead failure or a non-finite surface makes the result NON-exportable:
 * the lab must not render it as valid or export it. Walls that were encountered
 * but labelled are "handled", not failures.
 */
import type {
  ResponseGrid,
  CoordinateSafetyStatus,
  FormulaCoordinateInput,
  WallState,
} from "./coordinateTypes";

export function computeSafetyStatus(
  input: FormulaCoordinateInput,
  grid: ResponseGrid,
  axisVarIds: string[],
): CoordinateSafetyStatus {
  const notes: string[] = [];
  const walls = new Set<WallState>(grid.wallsHit);

  // No-lookahead: input-level AND every variable actually used on an axis.
  const usedVars = input.variables.filter((v) => axisVarIds.includes(v.id));
  const varLookahead = usedVars.every((v) => v.safety.noLookahead && v.safety.causalSafe);
  const noLookaheadPass = input.safety.noLookahead && varLookahead;
  if (!noLookaheadPass) {
    walls.add("LOOKAHEAD_FAIL");
    notes.push("No-lookahead failed: a used variable is not causal-safe.");
  }

  const finiteOutputPass = input.safety.finiteOutput && grid.finiteCount > 0;
  if (!finiteOutputPass) notes.push("Finite-output failed: no finite surface cells.");

  // KIDI safe = declared safe AND no unlabeled NaN leak. Hard walls are allowed
  // as long as they are labelled (that is the whole point of KIDI).
  const kidiSafe = input.safety.kidiSafe && finiteOutputPass;
  const wallHandled = grid.wallCount > 0;
  if (wallHandled) notes.push(`${grid.wallCount} cell(s) hit a labelled KIDI wall and were sealed.`);

  if (grid.approx) notes.push(grid.approxReason ?? "Approx surface: non-axis variables held at selected bar / median.");

  const exportable = kidiSafe && noLookaheadPass && finiteOutputPass;
  if (!exportable) notes.push("Marked NON-exportable: not safe to render-as-valid or export.");

  return {
    kidiSafe,
    wallHandled,
    noLookaheadPass,
    finiteOutputPass,
    approxSurface: grid.approx,
    exportable,
    shadowOnly: true,
    noOrderSend: true,
    walls: Array.from(walls),
    notes,
  };
}
