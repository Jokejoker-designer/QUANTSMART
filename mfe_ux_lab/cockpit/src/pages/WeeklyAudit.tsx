// Audit activity is derived from saved run receipts, not the old paper/sample logs.
import { useEffect, useState } from "react";
import { readStrategyCards, subscribeArtifactChanges } from "../lib/artifactRegistry.ts";
import { loadCardRuns } from "../lib/cardRunStore.ts";
import { mt5WeekHistory, liveSymbol, isOffline, type Mt5WeekHistory } from "../lib/mt5DemoAdapter.ts";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import "./product.css";
export function WeeklyAudit(){
 const [version,setVersion]=useState(0),[history,setHistory]=useState<Mt5WeekHistory|null>(null);
 useEffect(()=>subscribeArtifactChanges(()=>setVersion(v=>v+1)),[]);
 useEffect(()=>{let alive=true;mt5WeekHistory(liveSymbol(getActiveSymbol())).then(r=>{if(alive&&!isOffline(r))setHistory(r);});return()=>{alive=false;};},[]);
 const cards=readStrategyCards(),ids=new Set(cards.map(c=>c.id));const records=Object.values(loadCardRuns()).filter(r=>ids.has(r.card_id));
 const rows=records.flatMap(record=>Object.values(record.windows).map(window=>({record,window}))).filter(row=>row.window&&Date.parse(row.window.asOf)>=Date.now()-7*86400000);
 return <div className="product-workspace" data-revision={version}><header className="product-page-header"><div><h1>Weekly audit</h1><p>Validation activity recorded in the last seven days. Historical run returns are not this week's trading returns.</p></div></header>
 <section className="coef-section"><div className="coef-section-header"><h2>Research activity</h2><span>{rows.length} saved window receipts</span></div>{rows.length?<div className="coef-table-wrap"><table className="coef-table"><thead><tr><th>Card</th><th>Window</th><th>Historical range</th><th>Trades</th><th>Net R</th><th>Verification</th></tr></thead><tbody>{rows.map(({record,window})=><tr key={record.card_id+window.stage}><td>{cards.find(c=>c.id===record.card_id)?.name||record.card_id}</td><td>{window.stage}</td><td>{window.from} — {window.to}</td><td>{window.verified?window.trades:"Not verified"}</td><td>{window.verified?window.netR.toFixed(2):"Not verified"}</td><td>{window.verified?"Backend verified":"Imported / unverified"}</td></tr>)}</tbody></table></div>:<div className="product-empty"><h2>No validation activity yet</h2><p>Run a Card in Microscope to create a traceable audit receipt.</p></div>}</section>
 <section className="coef-section"><h2>Broker weekly report</h2>{history?.ok?<dl className="product-card-context"><span>Closed trades <b>{history.trades??"Not supplied"}</b></span><span>Net result <b>{history.net_profit??"Not supplied"} {history.currency||""}</b></span><span>Win rate <b>{history.win_rate==null?"Not supplied":`${history.win_rate}%`}</b></span></dl>:<p className="product-muted">No verified broker statistics are available. Connect the broker data service to retrieve closed-deal history.</p>}</section>
 </div>;
}
