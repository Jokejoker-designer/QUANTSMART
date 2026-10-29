// A live join of the actual Card library and its run records. No sample routing board.
import { useEffect, useState } from "react";
import { readStrategyCards, subscribeArtifactChanges } from "../lib/artifactRegistry.ts";
import { runStatus } from "../lib/cardRunStore.ts";
import { getCardRuntimeConfig } from "../lib/simTimeframe.ts";
import "./product.css";
export function StrategyRanking(){
 const [version,setVersion]=useState(0);useEffect(()=>subscribeArtifactChanges(()=>setVersion(v=>v+1)),[]);const cards=readStrategyCards();
 const open=(id:string)=>{localStorage.setItem("mfe_strategylab_preselect",id);window.dispatchEvent(new CustomEvent("mfe-nav",{detail:"strategy-lab"}));};
 return <div className="product-workspace" data-revision={version}><header className="product-page-header"><div><h1>Compatibility map</h1><p>Compare validation coverage for the current asset. A measured backtest is not a promise of future compatibility.</p></div></header><section className="coef-section">{!cards.length?<div className="product-empty"><h2>No Strategy Cards</h2><p>Create a Card in Canvas before comparing its evidence.</p></div>:<div className="coef-table-wrap"><table className="coef-table"><thead><tr><th>Strategy</th><th>Design / execution</th><th>Long history</th><th>6-month OOS</th><th>1-month holdout</th><th>Evidence</th><th/></tr></thead><tbody>{cards.map(card=>{const status=runStatus(card),tf=getCardRuntimeConfig(card);return <tr key={card.id}><td>{card.name}</td><td>{tf.design_tf} / {tf.allowed_execution_tf}</td>{(["Y10","M6","M1"] as const).map(stage=>{const row=status.record?.windows[stage];return <td key={stage}>{status.state==="STALE"?"Stale":row?.verified?`${row.trades} trades · PF ${row.netPF.toFixed(3)}`:row?"Not verified":"Not run"}</td>;})}<td>{status.state==="FRESH"?"Complete research coverage":status.state}</td><td><button className="product-button" onClick={()=>open(card.id)}>Inspect</button></td></tr>;})}</tbody></table></div>}</section></div>;
}
