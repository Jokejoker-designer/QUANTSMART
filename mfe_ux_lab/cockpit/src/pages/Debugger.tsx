// Inspect only current service responses. No fixture is substituted for a failed source.
import { useEffect, useState } from "react";
import { useLiveWorkspaceQuery } from "../lib/liveWorkspaceQuery.ts";
import { liveSymbol } from "../lib/mt5DemoAdapter.ts";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import "./product.css";
export function Debugger(){
 const [source,setSource]=useState("workspace"),[data,setData]=useState<Record<string,unknown>|null>(null),[error,setError]=useState("");
 const live=useLiveWorkspaceQuery(liveSymbol(getActiveSymbol()),"H1","H1","",600,source==="feed");
 useEffect(()=>{if(source==="feed")return;const c=new AbortController();setData(null);setError("");fetch(source==="workspace"?"/api/research/workspace":"/api/research/health",{signal:c.signal}).then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[source]);
 const shown=source==="feed"?live.data:data;
 return <div className="product-workspace"><header className="product-page-header"><div><h1>Payload inspector</h1><p>Inspect actual service responses and source errors.</p></div></header><div className="product-toolbar"><label>Source<select aria-label="Payload source" value={source} onChange={e=>setSource(e.target.value)}><option value="workspace">Durable workspace</option><option value="engine">Research engine</option><option value="feed">Current market feed</option></select></label></div>{error||source==="feed"&&live.error?<p className="product-message error">{error||live.error}</p>:null}<pre className="product-json">{shown?JSON.stringify(shown,null,2):"No response is available from this source."}</pre></div>;
}
