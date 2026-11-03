import {useState} from "react";
import {getActiveSymbol} from "../lib/activeSymbolStore.ts";
import {useTickEvidence,recorderAction} from "../lib/tickEvidenceClient.ts";

const time=(ms:number|null)=>ms===null?"Not recorded":new Date(ms).toISOString();
export function TickEvidencePanel({controls=false,quality=false}:{controls?:boolean;quality?:boolean}){
  const {result,refresh}=useTickEvidence();const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function change(action:"start"|"stop"){setBusy(true);setError("");try{await recorderAction(action,getActiveSymbol());}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}}
  return <section className="coef-section" aria-label={quality?"Recorded tick feed integrity":"Recorded market evidence"}>
    <div className="coef-section-header"><h2>{quality?"Tick feed integrity · separate from OHLC KIDI":"Recorded market evidence"}</h2><button className="product-button" onClick={refresh}>Refresh recorder</button></div>
    {result.kind==="loading"?<p role="status">Reading recorder status…</p>:result.kind==="unavailable"?<p role="status">Recorder unavailable: {result.reason}. No collection or qualification is inferred.</p>:<>
      <dl className="product-card-context"><span>Recorder <b>{result.status.state}</b></span><span>Saved quotes <b>{result.status.rows.toLocaleString()} / {result.status.max_rows.toLocaleString()}</b></span><span>Collection asset <b>{result.status.symbol}</b></span><span>Last commit <b>{result.status.last_commit??"No commit in this process"}</b></span><span>Storage <b>Local backend SQLite</b></span><span>Qualification <b>{result.status.qualification}</b></span></dl>
      <p className="product-muted">Raw Bid/Ask observations remain on this machine. The backend recorder continues with the browser closed while the local service and authorized terminal are running. It stops at its quota; evidence is not silently deleted. Collection does not trade or certify an edge.</p>
      {controls&&<div className="product-toolbar"><button className="product-button" disabled={busy} onClick={()=>void change("start")}>{busy?"Updating…":`Start / resume ${getActiveSymbol()} recording`}</button><button className="product-button" disabled={busy||!result.status.enabled} onClick={()=>void change("stop")}>Stop recording</button></div>}
      {result.status.sources.length?<div className="coef-table-wrap"><table className="coef-table"><caption>Source-specific stored coverage, UTC</caption><thead><tr><th>Asset / broker symbol</th><th>Quotes</th><th>From</th><th>To</th><th>Replay</th></tr></thead><tbody>{result.status.sources.map(source=><tr key={source.id}><td>{source.canonical_symbol} / {source.broker_symbol}<br/>{source.broker}<br/>{source.server_timezone}</td><td>{source.rows.toLocaleString()}</td><td>{time(source.from_ms)}</td><td>{time(source.to_ms)}</td><td><a href={`/api/mt5/evidence/replay?source_id=${encodeURIComponent(source.id)}&limit=1000`} target="_blank" rel="noreferrer">Inspect first 1,000 quotes</a></td></tr>)}</tbody></table></div>:<p>No recorded source yet. Connect the terminal, then explicitly start recording.</p>}
      {quality&&<><p>Market closure: <strong>not verified</strong>. A quiet interval is not classified as a frozen feed or a broker closure.</p><div className="coef-table-wrap"><table className="coef-table"><caption>Recorder quality and lifecycle observations</caption><thead><tr><th>Observed at</th><th>State</th><th>Detail</th></tr></thead><tbody>{result.status.quality.map(event=><tr key={event.id}><td>{event.at}</td><td>{event.state}</td><td>{event.detail||"State transition; no market outcome inferred"}</td></tr>)}</tbody></table></div></>}
      <p><a href="/api/mt5/evidence/integrity" target="_blank" rel="noreferrer">Check stored tick and batch integrity</a></p>
    </>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
