// Current source assessment only; unavailable measurements are never synthesized.
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { useLiveWorkspaceQuery, freshWorkspaceBars } from "../lib/liveWorkspaceQuery.ts";
import { liveSymbol } from "../lib/mt5DemoAdapter.ts";
import { PreEventWarning } from "../components/PreEventWarning.tsx";
import type { TradeAdvice } from "../adapters/loadCotrade.ts";
import "./product.css";
const go=(id:string)=>window.dispatchEvent(new CustomEvent("mfe-nav",{detail:id}));
export function EntryDanger(){
 const query=useLiveWorkspaceQuery(liveSymbol(getActiveSymbol()),"H1","H1","",600,true);
 const valid=!!query.data?.account?.connected&&freshWorkspaceBars(query.data?.bars,"H1")&&query.data.advice?.ok;
 const advice=valid?query.data?.advice?.advice as TradeAdvice|undefined:undefined;
 const danger=advice?.danger_score;const pct=danger==null?null:danger<=1?danger*100:danger;
 const assessment=advice?.entry_assessment;
 return <div className="product-workspace"><header className="product-page-header"><div><h1>Entry &amp; Danger</h1><p>Source assessments and measured conditions. No inferred readiness from missing data.</p></div><button className="product-button" onClick={()=>go("microscope")}>Inspect feed</button></header>
 {!advice?<section className="product-empty"><h2>No current assessment</h2><p>The market feed is not connected, current, or able to provide an assessment. No danger score or entry verdict is available.</p><button className="product-button" onClick={()=>go("assets")}>Check data sources</button></section>:<section className="coef-section"><h2>Current source assessment</h2><dl className="product-card-context"><span>As of <b>{advice.as_of||"Not supplied"}</b></span><span>Market view <b>{assessment?.market_view||"Not supplied"}</b></span><span>Assessment <b>{assessment?.verdict||"Not supplied"}</b></span><span>Danger <b>{pct==null?"Not measured":`${pct.toFixed(1)}%`}</b></span><span>Calibration <b>{advice.final_probability?.calibration_status||"Not measured"}</b></span></dl><ul>{(assessment?.no_trade_codes||[]).map(code=><li key={code}>{code.replace(/_/g," ").toLowerCase()}</li>)}</ul><details><summary>Original source payload</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:11}}>{JSON.stringify(advice,null,2)}</pre></details></section>}
 <PreEventWarning/>
 </div>;
}
