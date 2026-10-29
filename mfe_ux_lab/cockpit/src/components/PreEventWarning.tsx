// Real calendar source only. Missing data never starts a fabricated countdown.
import { useEffect, useState } from "react";
import { Glyph } from "./ui/Glyph.tsx";
type Calendar={status:string;source?:string;updated_at?:string;events:{title:string;at_utc:string}[]};
export function PreEventWarning(_props:{cleanliness?:number;name?:string;startSec?:number}){
 const [calendar,setCalendar]=useState<Calendar|null>(null),[now,setNow]=useState(Date.now);
 useEffect(()=>{const c=new AbortController();fetch("/api/research/calendar",{signal:c.signal}).then(r=>r.ok?r.json():null).then(setCalendar).catch(()=>{});return()=>c.abort();},[]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const next=calendar?.events.filter(e=>Date.parse(e.at_utc)>now).sort((a,b)=>Date.parse(a.at_utc)-Date.parse(b.at_utc))[0];
 const seconds=next?Math.max(0,Math.floor((Date.parse(next.at_utc)-now)/1000)):null;
 return <section className="pc"><div className="pc-h"><Glyph name="calendar" size={14}/>Economic calendar</div>{calendar?.status!=="CONFIGURED"?<p className="product-muted">No calendar source configured. Import a dated calendar in Assets; event timing is not available.</p>:<><p className="product-muted">Source: {calendar.source} · updated {calendar.updated_at||"not supplied"}</p>{next?<><strong>{next.title}</strong><p>{next.at_utc} · {Math.floor(seconds!/3600)}h {Math.floor(seconds!%3600/60)}m remaining</p></>:<p>No upcoming events in the imported calendar. This does not imply an event-free market.</p>}</>}</section>;
}
