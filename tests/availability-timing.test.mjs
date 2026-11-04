import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const app=path.join(root,"mfe_ux_lab/cockpit");
const {build}=createRequire(path.join(app,"package.json"))("esbuild");
const baseline = process.argv.includes("--baseline");
const pinned = "434ce00e436d41d4651b967f6c01eaa65657bf0a";
const baselinePlugin = {
  name: "pre-availability-fix",
  setup(builder) {
    builder.onLoad({filter: /(?:strategyAtlas|conductorMode)\.ts$/}, args => ({
      contents: execFileSync("git", ["show", pinned + ":mfe_ux_lab/cockpit/" +
        path.relative(app,args.path).replaceAll("\\","/")], {cwd:root,encoding:"utf8"}),
      loader: "ts",
    }));
  },
};
const bundle=await build({stdin:{contents: [
 "export {buildCardAtlas} from './src/lib/strategyAtlas.ts';",
 "export {routePickAt} from './src/lib/cardBeastV2/conductorMode.ts';",
 "export {barCloseTimes,barTimeMs,completedBarIndex} from './src/lib/barAvailability.ts';",
 "export {confirmedPricePivots,pivotsAvailableAt} from './src/lib/confirmedPricePivots.ts';",
 "export {environmentFingerprint} from './src/lib/environmentFingerprint.ts';"
].join("\n"),resolveDir:app},bundle:true,platform:"node",format:"esm",write:false,logLevel:"silent",plugins:baseline?[baselinePlugin]:[]});
const api=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const iso=i=>new Date(Date.UTC(2020,0,1)+i*3600000).toISOString();
const bars=Array.from({length:150},(_,i)=>{
 const o=100+Math.sin(i/5),c=100+Math.sin((i+1)/5);
 return {i,t:iso(i),o,c,h:Math.max(o,c)+.2,l:Math.min(o,c)-.2,r:"N"};
});
const cutoff=55,fill=cutoff+1;
const changed=structuredClone(bars);
changed[fill]={...changed[fill],h:190,l:10,c:180};
const trade={signal_time:iso(fill),fill_time:iso(fill),entryI:fill,netR:1};
const result={designTf:"H1",sim:{trades:[trade]}};
let failures=0;
function check(name,test){
 try{test();console.log("PASS "+name);}
 catch(error){failures++;console.error("FAIL "+name+": "+error.message.split("\n")[0]);}
}
check("Atlas excludes unclosed fill-candle information",()=>{
 const a=api.buildCardAtlas(bars,result,{weak:1,usable:1});
 const b=api.buildCardAtlas(changed,result,{weak:1,usable:1});
 assert.deepEqual(a.dimensions,b.dimensions);
 const expected=api.environmentFingerprint(bars)[cutoff];
 assert.equal(a.dimensions.find(d=>d.dimension==="volatility").cells[0].key,expected.volatilityBucket);
});
check("Conductor routes at the fill open from completed bars",()=>{
 const fp=api.environmentFingerprint(bars)[cutoff];
 const passports=[{beast:"fixed-passport",regimes:[{regime:fp.regime,verdict:"FITS",evidence:"USABLE_EVIDENCE",trades:100,netR:10,edgePerTrade:.1}]}];
 const before=api.routePickAt(bars,fill,passports,"H1");
 const after=api.routePickAt(changed,fill,passports,"H1");
 assert.equal(before,"fixed-passport");
 assert.equal(after,before);
 assert.equal(api.routePickAt(bars,0,passports,"H1"),"NO_ACTION");
});

check("Availability boundaries, offsets, gaps and invalid times",()=>{
 const closes=api.barCloseTimes(bars,"H1");
 assert.equal(api.completedBarIndex(closes,Date.parse(iso(56))-1),54);
 assert.equal(api.completedBarIndex(closes,Date.parse(iso(56))),55);
 assert.equal(api.completedBarIndex(closes,Date.parse(iso(56))+5*60000),55);
 assert.equal(api.completedBarIndex(closes,NaN),null);
 const offset=bars.map(bar=>({...bar,t:bar.t.replace("Z","+00:00")}));
 assert.deepEqual(api.barCloseTimes(offset,"H1"),closes);
 assert.equal(api.barTimeMs("2020-01-03T10:00:00+02:00"),Date.parse("2020-01-03T08:00:00Z"));
 const gap=bars.filter((_,i)=>i!==56);
 assert.equal(api.completedBarIndex(api.barCloseTimes(gap,"H1"),Date.parse(iso(57))),55);
 assert.throws(()=>api.barCloseTimes([bars[0],bars[0]],"H1"),/INVALID_AVAILABILITY_TIMESTAMPS/);
 assert.throws(()=>api.barCloseTimes([{...bars[0],t:"invalid"}],"H1"),/INVALID_AVAILABILITY_TIMESTAMPS/);
});
check("Atlas handles intrabar signals, missing exact opens and unjoinable times",()=>{
 const options={weak:1,usable:1};
 for(const signal_time of [iso(56),new Date(Date.parse(iso(56))+5*60000).toISOString()]){
  const report=api.buildCardAtlas(bars,{...result,sim:{trades:[{...trade,signal_time}]}},options);
  assert.equal(report.bucketedTrades,1);
  assert.equal(report.dimensions.find(d=>d.dimension==="volatility").cells[0].key,api.environmentFingerprint(bars)[55].volatilityBucket);
 }
 const gap=bars.filter((_,i)=>i!==56);
 const report=api.buildCardAtlas(gap,result,options);
 assert.equal(report.bucketedTrades,1);
 assert.equal(report.dimensions.find(d=>d.dimension==="volatility").cells[0].key,api.environmentFingerprint(gap)[55].volatilityBucket);
 const missing=api.buildCardAtlas(bars,{...result,sim:{trades:[{...trade,signal_time:"invalid"}]}},options);
 assert.equal(missing.bucketedTrades,0);
 assert.equal(missing.totalTrades,1);
});
check("Chart pivots appear after confirmation and match prefix replay",()=>{
 const tape=Array.from({length:11},(_,i)=>({i,t:iso(i),o:100,c:100,h:i===5?110:101,l:99,r:"N"}));
 const all=api.confirmedPricePivots(tape);
 assert.ok(all.some(p=>p.i===5&&p.confirmIndex===8));
 assert.ok(!api.pivotsAvailableAt(all,7).some(p=>p.i===5));
 assert.ok(api.pivotsAvailableAt(all,8).some(p=>p.i===5));
 for(let cursor=0;cursor<tape.length;cursor++)
  assert.deepEqual(api.pivotsAvailableAt(all,cursor),api.confirmedPricePivots(tape.slice(0,cursor+1)));
});

const m15 = Array.from({length:300},(_,i)=>{
 const o=100+Math.sin(i/5),c=100+Math.sin((i+1)/5);
 return {i,t:new Date(Date.UTC(2020,0,1)+i*900000).toISOString(),o,c,h:Math.max(o,c)+.2,l:Math.min(o,c)-.2,r:"N"};
});
const testStart=180;
let entryIndex,correctRegime,changedClose;
const testTape=m15.slice(testStart);
const fingerprints=api.environmentFingerprint(testTape);
for(let i=55;i<testTape.length;i++){
 const previous=fingerprints[i-1],current=fingerprints[i];
 if(!previous||!current||previous.regime!==current.regime)continue;
 const altered=structuredClone(testTape);
 const c=previous.regime==="TREND_UP"?20:180;
 altered[i]={...altered[i],h:190,l:10,c};
 if(api.environmentFingerprint(altered)[i].regime!==previous.regime){
  entryIndex=i;correctRegime=previous.regime;changedClose=c;break;
 }
}
assert.ok(Number.isInteger(entryIndex),"Need a current-candle regime mutation for the routing schedule regression");
// Keep specialist trades and training passports fixed. Run the actual
// Conductor orchestration while changing only unavailable fill-candle H/L/C.
const fixedSpecialists = {
 name:"fixed-specialists",
 setup(builder){
  builder.onLoad({filter:/realisticSimRun\.ts$/},()=>({
   contents:`export function runRealisticBacktest(){return {sim:{trades:[{entryI:${entryIndex},netR:1}]}};}`,loader:"ts",
  }));
  builder.onLoad({filter:/strategyAtlas\.ts$/},()=>({
   contents:`export function buildCardAtlas(){return {dimensions:[{dimension:"regime",cells:[{key:${JSON.stringify(correctRegime)},verdict:"FITS",evidence:"USABLE_EVIDENCE",trades:100,netR:10}]}]};}`,loader:"ts",
  }));
  builder.onLoad({filter:/breakoutLiquidityBeast\.ts$/},()=>({
   contents:"export const beastMembers=()=>[];export const trendRetestMembers=()=>[];",loader:"ts",
  }));
  builder.onLoad({filter:/beastCompose\.ts$/},()=>({
   contents:"export function composeBeast(){return {ok:true,modules:[],customModules:[]};}",loader:"ts",
  }));
  if(baseline)builder.onLoad({filter:/conductorMode\.ts$/},args=>({
   contents:execFileSync("git",["show",pinned+":mfe_ux_lab/cockpit/src/lib/cardBeastV2/conductorMode.ts"],{cwd:root,encoding:"utf8"}),loader:"ts",
  }));
 },
};
const orchestrator=await build({stdin:{contents:"export {runConductor} from './src/lib/cardBeastV2/conductorMode.ts';",resolveDir:app},
 bundle:true,platform:"node",format:"esm",write:false,logLevel:"silent",plugins:[fixedSpecialists]});
const {runConductor}=await import("data:text/javascript;base64,"+Buffer.from(orchestrator.outputFiles[0].text).toString("base64"));
check("Actual Conductor selection preserves fixed entry when fill H/L/C changes",()=>{
 const altered=structuredClone(m15);
 const index=testStart+entryIndex;
 altered[index]={...altered[index],h:190,l:10,c:changedClose};
 const before=runConductor(m15),after=runConductor(altered);
 assert.equal(before.portfolio.n,1);
 for(const key of ["n","netR","pf","win","maxDD"])assert.equal(after.portfolio[key],before.portfolio[key]);
});
console.log(JSON.stringify({baseline,failures,fixtureOnly:true}));
process.exitCode=failures?1:0;
