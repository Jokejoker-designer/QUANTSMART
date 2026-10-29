// FormulaLabPage — the cockpit PAGE wrapper for the Formula Coordinate Lab. Reads the handed-off
// FormulaCoordinateInput from the store (set by any module via setFormulaLabInput), re-renders when a new one
// arrives, and remounts (key) so axes/weights reset cleanly per source formula. No input → demo formula.
import { useEffect, useState } from "react";
import { FormulaCoordinateLab } from "./FormulaCoordinateLab";
import { getFormulaLabInput, clearFormulaLabInput, FORMULA_LAB_EVENT } from "./formulaLabStore";
import type { FormulaCoordinateInput } from "./core/coordinateTypes";

export function FormulaLabPage() {
  const [input, setInput] = useState<FormulaCoordinateInput | undefined>(() => getFormulaLabInput() ?? undefined);
  useEffect(() => {
    const onUpdate = () => setInput(getFormulaLabInput() ?? undefined);
    window.addEventListener(FORMULA_LAB_EVENT, onUpdate);
    return () => window.removeEventListener(FORMULA_LAB_EVENT, onUpdate);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--mfe-muted)" }}>
          {input ? <>Current formula: <b style={{ color: "var(--mfe-text)" }}>{input.formulaName}</b> <span style={{ opacity: .7 }}>from a module</span></> : <>No formula was selected. Showing the explicit example <b>demo</b>. Open Coordinate Lab from a saved formula to inspect that definition.</>}
        </span>
        {input && <button onClick={() => { clearFormulaLabInput(); setInput(undefined); }} style={{ marginLeft: "auto", fontSize: 11, background: "transparent", border: "1px solid var(--mfe-border)", color: "var(--mfe-muted)", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>Reset to example</button>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FormulaCoordinateLab key={input?.formulaId ?? "demo"} input={input} />
      </div>
    </div>
  );
}
