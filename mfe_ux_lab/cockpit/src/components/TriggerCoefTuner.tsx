// Shadow profile editor; preserves calibration math and existing profile semantics.
import { useState } from "react";
import { InfoTip } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { NumberScrubber } from "./ui/NumberScrubber.tsx";
import { runCalibrationJob } from "../lib/researchJobs.ts";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { flushWorkspace } from "../lib/workspaceClient.ts";
import { DEFAULT_TRIGGER_COEF, type TriggerKey, type CalibrationReport, type TriggerCoefOverride } from "../lib/coefficientCalibration.ts";
import { getCoefProfile, setCoefProfile } from "../lib/coefProfileStore.ts";

const TRIGGERS: { key: TriggerKey; label: string }[] = [
  { key: "trend", label: "Trend Pullback" },
  { key: "sweep", label: "Sweep Reclaim" },
  { key: "rsi", label: "RSI Reclaim" },
  { key: "range", label: "Range Fade" },
  { key: "emaDefault", label: "EMA Cross" },
];

export function TriggerCoefTuner() {
  const [profile, setProfile] = useState<TriggerCoefOverride>(() => ({ ...(getCoefProfile() ?? {}) }));
  const [savedProfile, setSavedProfile] = useState(() => JSON.stringify(getCoefProfile() ?? {}));
  const [calib, setCalib] = useState<CalibrationReport | null>(null);
  const [operation, setOperation] = useState<"calibration" | "save" | "reset" | null>(null);
  const busy = operation !== null;
  const [feedback, setFeedback] = useState("");
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const unsaved = JSON.stringify(profile) !== savedProfile;
  const relOf = (k: TriggerKey) => profile[k]?.rel ?? DEFAULT_TRIGGER_COEF[k].rel;
  const wOf = (k: TriggerKey) => profile[k]?.w ?? DEFAULT_TRIGGER_COEF[k].w;
  const setWR = (k: TriggerKey, patch: { w?: number; rel?: number }) =>
    setProfile((p) => ({ ...p, [k]: { ...DEFAULT_TRIGGER_COEF[k], ...p[k], ...patch } }));

  async function selfCalibrate() {
    setOperation("calibration");
    setFeedback("");
    try {
      const result = await runCalibrationJob(getActiveSymbol());
      setCalib(result);
      setFeedback("Research calibration completed. No profile changes have been applied.");
    } catch {
      setFeedback("Data could not be loaded. Check the source and retry.");
    } finally {
      setOperation(null);
    }
  }

  const save = async () => {
    if (Object.values(invalid).some(Boolean) || busy) return;
    setOperation("save");
    try {
      setCoefProfile(Object.keys(profile).length ? profile : null);
      await flushWorkspace();
      setSavedProfile(JSON.stringify(profile));
      setFeedback("Shadow profile saved to the workspace.");
    } catch (error) {
      setFeedback(`Profile was not saved: ${(error as Error).message}`);
    } finally {
      setOperation(null);
    }
  };

  const reset = async () => {
    if (busy) return;
    setOperation("reset");
    try {
      setProfile({});
      setCoefProfile(null);
      await flushWorkspace();
      setSavedProfile("{}");
      setCalib(null);
      setInvalid({});
      setFeedback("Default configuration restored and saved.");
    } catch (error) {
      setFeedback(`Defaults were not saved: ${(error as Error).message}`);
    } finally {
      setOperation(null);
    }
  };

  const numeric = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <NumberScrubber
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={onChange}
      onValidityChange={(valid) => setInvalid((prev) => ({ ...prev, [label]: !valid }))}
    />
  );

  return (
    <section className="coef-section" aria-labelledby="entry-weights-heading">
      <div className="coef-section-header">
        <h2 id="entry-weights-heading">ENTRY WEIGHTS &amp; CALIBRATION</h2>
        <span className="shadow-label">SHADOW MODE</span>
        <InfoTip
          title="Shadow profile"
          text="Calibration measures directional hit rate and stability across two historical periods. Only PROVEN_SHADOW results can be selected. Calibration does not automatically apply a profile or grant live authority."
        />
        <div className="coeff-actions">
          <span className={`mfe-status-pill ${unsaved ? "warn" : "safe"}`}>
            {unsaved ? "Draft · unsaved" : "Profile synchronized"}
          </span>
          <button className="research-button" disabled={busy} onClick={selfCalibrate}>
            <Glyph name="flask" size={14} />
            {operation === "calibration" ? "Measuring…" : "Calibrate from history"}
          </button>
          <button
            className="research-button primary"
            disabled={busy || !unsaved || Object.values(invalid).some(Boolean)}
            onClick={save}
          >
            <Glyph name="save" size={14} />
            Save profile
          </button>
          <button className="research-button" onClick={reset}>
            <Glyph name="refresh" size={14} />
            Reset
          </button>
        </div>
      </div>

      <div className="coef-table-wrap">
        <table className="coef-table">
          <thead>
            <tr>
              <th>Trigger</th>
              <th>Source</th>
              <th>Weight (W)</th>
              <th>Reliability</th>
              <th>Calibration</th>
            </tr>
          </thead>
          <tbody>
            {TRIGGERS.map(({ key, label }) => {
              const t = calib?.triggers[key];
              const vTone =
                t?.verdict === "PROVEN_SHADOW"
                  ? "safe"
                  : t?.verdict === "NO_EDGE"
                    ? "danger"
                    : "warn";
              return (
                <tr key={key}>
                  <td style={{ color: "#F8FAFC", fontWeight: 500 }}>{label}</td>
                  <td>
                    <span className={`coef-source ${profile[key] ? "override" : ""}`}>
                      {profile[key] ? "OVERRIDE" : "DEFAULT"}
                    </span>
                  </td>
                  <td>{numeric(`${label} weight`, wOf(key), 0.3, 1.5, 0.05, (w) => setWR(key, { w }))}</td>
                  <td>{numeric(`${label} reliability`, relOf(key), 0.5, 0.72, 0.005, (rel) => setWR(key, { rel }))}</td>
                  <td className="coef-muted">
                    {t ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className={`mfe-status-pill ${vTone}`}>{t.verdict}</span>
                        <span>
                          {t.samples} samples · era {t.eraHit1}/{t.eraHit2}
                        </span>
                        {t.verdict === "PROVEN_SHADOW" && (
                          <button className="research-button" onClick={() => setWR(key, { rel: t.relCalibrated })}>
                            Select result
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="mfe-status-pill info">Not measured</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="coef-thresholds">
        <label>
          Fusion |score|
          {numeric(
            "Fusion threshold",
            profile.fusionThreshold ?? DEFAULT_TRIGGER_COEF.fusionThreshold,
            0.3,
            2,
            0.05,
            (fusionThreshold) => setProfile((p) => ({ ...p, fusionThreshold })),
          )}
        </label>
        <label>
          Bayes upper
          {numeric(
            "Bayes upper",
            profile.bayesUp ?? DEFAULT_TRIGGER_COEF.bayesUp,
            0.5,
            0.65,
            0.005,
            (bayesUp) => setProfile((p) => ({ ...p, bayesUp })),
          )}
        </label>
        <label>
          Bayes lower
          {numeric(
            "Bayes lower",
            profile.bayesDown ?? DEFAULT_TRIGGER_COEF.bayesDown,
            0.35,
            0.5,
            0.005,
            (bayesDown) => setProfile((p) => ({ ...p, bayesDown })),
          )}
        </label>
      </div>
      <p className="coef-note">
        NO_EDGE, ERA_UNSTABLE and insufficient samples describe evidence limitations. Parameters remain Shadow; tuning does not establish out-of-sample performance.
      </p>
      {feedback && (
        <p role="status" className="coef-feedback">
          {feedback}
        </p>
      )}
    </section>
  );
}
