import {useState} from "react";
import {useRecordedObservation,descriptiveModelAction} from "../lib/recordedObservation.ts";

const number=(v:number|null|undefined,digits=3)=>v==null||!Number.isFinite(v)?"Not measured":v.toFixed(digits);
export function RecordedObservationPanel({mode="summary"}:{mode?:"summary"|"episodes"|"replay"|"models"|"audit"|"pipeline"}){
  const {state,refresh}=useRecordedObservation(mode === "episodes" || mode === "audit");const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[reviewer,setReviewer]=useState("");
  async function act(action:"propose"|"review",model_id="",reviewAction=""){
    if(state.kind!=="ready"||!state.data.source_id)return;setBusy(true);setMessage("");
    try{await descriptiveModelAction(action,{source_id:state.data.source_id,...(action==="review"?{model_id,action:reviewAction,reviewer}:{})});setMessage("Descriptive research record saved. Strategy profiles and trading behavior are unchanged.");refresh();}
    catch(error){setMessage(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
  }
  return <section className="coef-section" aria-label="Recorded quote observer">
    <div className="coef-section-header"><h2>Recorded quote observer · {mode}</h2><button className="product-button" onClick={refresh}>Refresh observation</button></div>
    {state.kind==="loading"?<p role="status">Reading recorded observations…</p>:state.kind==="unavailable"?<p role="status">{state.reason} No normal-market or entry verdict is inferred.</p>:<>
      <dl className="product-card-context"><span>Evidence state <b>{state.data.state}</b></span><span>Same-session windows <b>{state.data.baseline_windows} / 30 descriptive minimum</b></span><span>Data tier <b>{state.data.certification}</b></span><span>Predictive qualification <b>{state.data.predictive_calibration}</b></span></dl>
      <p>Recorded source freshness: {state.data.freshness.state}. Age: {number(state.data.freshness.age_ms,0)} ms.</p><p className="product-muted">Source-specific backend measurements from completed 60-second quote windows. These are quote updates, not exchange order flow. No calibrated probability, entry approval or automatic coefficient application is supplied.</p>
      {state.data.current?.features&&<><p>Last completed window ends {new Date(state.data.current.cutoff_ms).toISOString()} UTC. Coverage: {state.data.current.quality}. This timestamp is not a claim of current quote freshness.</p><dl className="product-card-context"><span>Observed updates / second <b>{number(state.data.current.features.tick_rate_per_second)}</b></span><span>Inter-arrival p95, ms <b>{number(state.data.current.features.interarrival_p95_ms,0)}</b></span><span>Spread p50, price units <b>{number(state.data.current.features.spread_p50)}</b></span><span>Spread p95, price units <b>{number(state.data.current.features.spread_p95)}</b></span><span>Price progress / path <b>{number(state.data.current.features.price_progress_ratio)}</b></span></dl></>}
      {mode!=="summary"&&<><p>Stored outcome counts: {Object.entries(state.data.outcome_counts).map(([key,value])=>`${key}: ${value}`).join(" · ")||"No declarations have passed the descriptive baseline gate."}</p><p>False-alarm fraction among resolved live prospective warnings: {number(state.data.false_alarm_rate)} · {state.data.resolved_warning_count} resolved warnings. This is descriptive, not held-out predictive validation.</p></>}
      {(mode==="episodes"||mode==="replay"||mode==="audit")&&<div className="coef-table-wrap"><table className="coef-table"><caption>Frozen observations and later outcomes. Historical replay is labeled separately.</caption><thead><tr><th>Feature cutoff, UTC</th><th>Kind / flags</th><th>Outcome</th><th>Evidence</th></tr></thead><tbody>{state.data.declarations.map(row=><tr key={row.id}><td>{new Date(row.declaration.cutoff_ms).toISOString()}</td><td>{row.declaration.kind}<br/>{row.declaration.evaluation_mode}<br/>{row.declaration.flags.join(", ")||"Frozen negative control"}</td><td>{row.outcome}</td><td><details><summary>Inspect frozen declaration</summary><pre className="product-json">{JSON.stringify(row,null,2)}</pre></details></td></tr>)}</tbody></table></div>}
      {mode === "episodes" && (
        <section aria-label="Similar recorded windows">
          <h3>Similar recorded windows</h3>
          <p>Matches use the same recorded source and UTC session. A smaller rank distance means the measured features are closer.</p>
          {state.data.comparison ? (
            <div className="coef-table-wrap"><table className="coef-table">
              <caption>Nearest windows among {state.data.comparison.eligible_windows} earlier observations</caption>
              <thead><tr><th>Window cutoff, UTC</th><th>Rank distance</th></tr></thead>
              <tbody>{state.data.comparison.matches.map(match => (
                <tr key={match.cutoff_ms}><td>{new Date(match.cutoff_ms).toISOString()}</td><td>{number(match.rank_distance)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p>Requires 30 usable earlier windows with the same session and feature configuration.</p>}
        </section>
      )}
      {mode === "audit" && (
        <section aria-label="Recent quote distribution changes">
          <h3>Recent quote distribution changes</h3>
          {state.data.comparison ? (
            <div className="coef-table-wrap"><table className="coef-table">
              <caption>Median comparison across two disjoint groups of {state.data.comparison.windows_per_group} recorded windows</caption>
              <thead><tr><th>Measurement</th><th>Earlier median</th><th>Recent median</th></tr></thead>
              <tbody>{state.data.comparison.median_shifts.map(row => (
                <tr key={row.feature}><td>{row.feature.replace(/_/g, " ")}</td><td>{number(row.earlier_median)}</td><td>{number(row.recent_median)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p>Requires 30 usable earlier windows to compare two groups.</p>}
        </section>
      )}
      {mode==="pipeline"&&<><div className="coef-table-wrap"><table className="coef-table"><caption>Existing asset-learning stages with explicit quote ingestion</caption><thead><tr><th>Stage</th><th>Status</th></tr></thead><tbody>{state.data.pipeline.map(row=><tr key={row.stage}><td>{row.stage}</td><td>{row.status}</td></tr>)}</tbody></table></div><p>Optional L1/L2 inputs: {state.data.optional_module_inputs}. Live eligibility remains blocked.</p></>}
      {mode==="models"&&<><p>Versioned descriptive profiles are separate from the existing user trigger profile. Selection and rollback below affect this observer's review pointer only.</p><button className="product-button" disabled={busy || state.data.baseline_windows < 30 || !state.data.current?.features} onClick={()=>void act("propose")}>Create descriptive Shadow version</button>{state.data.baseline_windows<30&&<p>Locked: at least 30 valid same-source, same-session windows are required even for a descriptive candidate. Predictive qualification requires separate evidence.</p>}<label>Local operator name for descriptive review<input aria-label="Descriptive review operator" value={reviewer} maxLength={80} onChange={e=>setReviewer(e.target.value)}/></label><div className="coef-table-wrap"><table className="coef-table"><caption>Observer-only model versions</caption><thead><tr><th>Version</th><th>Status</th><th>Tier</th><th>Review pointer</th></tr></thead><tbody>{state.data.models.map(model=><tr key={model.id}><td>{model.version}</td><td>{model.status} · {model.review_state}</td><td>{model.tier}</td><td>{state.data.active_descriptive_version===model.id?"Selected descriptive version":"Not selected"}<button disabled={busy||!reviewer.trim()||model.review_state==="QUARANTINED"} onClick={()=>void act("review",model.id,"SELECT_DESCRIPTIVE")}>Select descriptive version</button><button disabled={busy||!reviewer.trim()||model.review_state==="QUARANTINED"} onClick={()=>void act("review",model.id,"ROLLBACK_DESCRIPTIVE")}>Roll back descriptive pointer</button><button disabled={busy||!reviewer.trim()||model.review_state==="QUARANTINED"} onClick={()=>void act("review",model.id,"QUARANTINE_DESCRIPTIVE")}>Quarantine descriptive version</button></td></tr>)}</tbody></table></div><p>Operator identity is a local declaration recorded by the backend, not external identity authentication or live promotion.</p></>}
      <details><summary>Source, limits and raw observer payload</summary><p style={{overflowWrap:"anywhere"}}>{state.data.source_id||"No recorded source for this asset"}</p><ul>{state.data.limitations.map(note=><li key={note}>{note}</li>)}</ul><pre className="product-json">{JSON.stringify(state.data,null,2)}</pre></details>
    </>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
