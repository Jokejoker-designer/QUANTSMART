// StageStepper — the FORCED Y10 → M6 → M1 cascade control. Later stages are LOCKED (🔒) until the user
// explicitly DUYỆT (acknowledges) the current stage's result, so nobody can skip the 10-year base and judge
// a card on a lucky recent month. One engine (realistic) throughout. Used by Strategy Lab + Microscope.
import { TK, InfoTip } from "./ui/Ui.tsx";
import { STAGES, STAGE_LABEL, STAGE_HINT, STAGE_SOURCE, stageIndex, nextStage, canAdvance, type Stage } from "../lib/stageWindow.ts";

// `sourceLock` (optional, Microscope only): a per-stage reason string disables that stage because the current
// data source doesn't match (Y10/M6 need Replay, M1 needs Live). Strategy Lab passes none (all historical).
export function StageStepper({ stage, maxStage, onStage, onAdvance, ready, compact, sourceLock }: {
  stage: Stage; maxStage: number; onStage: (s: Stage) => void; onAdvance: () => void; ready: boolean; compact?: boolean;
  sourceLock?: Partial<Record<Stage, string>>;
}) {
  const idx = stageIndex(stage);
  const nxt = nextStage(stage);
  const nxtSrcLocked = nxt ? !!sourceLock?.[nxt] : false;
  const advance = canAdvance(stage, maxStage, ready) && !sourceLock?.[stage];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="pmut psm" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        Cascade:
        <InfoTip title="Sequential Validation Cascade">
          Strict sequential progression (10Y Base → 6M OOS → 1M Forward) on a single realistic simulation engine without skipping stages.
        </InfoTip>
      </span>
      <div className="ms-seg" role="tablist">
        {STAGES.map((s, i) => {
          const cascadeLock = i > maxStage;
          const srcLock = sourceLock?.[s];
          const locked = cascadeLock || !!srcLock;
          const done = i < maxStage && !srcLock;
          return (
            <button key={s} className={stage === s ? "on" : ""} disabled={locked}
              title={srcLock ? srcLock : cascadeLock ? "🔒 Locked — approve the previous stage in sequence first" : STAGE_HINT[s]}
              onClick={() => { if (!locked) onStage(s); }}
              style={locked ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
              {srcLock ? (STAGE_SOURCE[s] === "Live" ? "🔴 " : "📼 ") : cascadeLock ? "🔒 " : done ? "✓ " : ""}{STAGE_LABEL[s]}
            </button>
          );
        })}
      </div>
      {maxStage < STAGES.length - 1 && idx === maxStage && nxt && (
        <button className="ms-csv" disabled={!advance}
          style={{ flex: "none", padding: "5px 11px", background: advance ? "#1f6feb" : "#30363d", cursor: advance ? "pointer" : "not-allowed" }}
          onClick={() => { if (advance) onAdvance(); }}>
          {advance ? `✓ Approve ${STAGE_LABEL[stage]} → Unlock ${STAGE_LABEL[nxt]}` : nxtSrcLocked && ready ? `✓ Approve ${STAGE_LABEL[stage]} → Switch to ${STAGE_SOURCE[nxt!]} for ${STAGE_LABEL[nxt!]}` : `⏳ Waiting for ${STAGE_LABEL[stage]}`}
        </button>
      )}
      {idx === STAGES.length - 1 && maxStage === STAGES.length - 1 && (
        <span className="pflag" style={{ margin: 0, background: "rgba(33,208,122,.12)", color: TK.green, border: "1px solid " + TK.green }}>✓ Completed Y10 → M6 → M1</span>
      )}
    </div>
  );
}
