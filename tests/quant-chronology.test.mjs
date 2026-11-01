import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const app=path.join(root,'mfe_ux_lab/cockpit');
const require=createRequire(path.join(app,'package.json'));
const {build}=require('esbuild');
const baseline=process.argv.includes('--baseline');
const base='05cdaeb';
const archived=/realisticStrategySim\.ts$|simCalibration\.ts$|realisticSimRun\.ts$|simTruthContract\.ts$/;
const plugins=baseline?[{name:'chronology-baseline',setup(b){
 b.onLoad({filter:archived},args=>({contents:execFileSync('git',['show',base+':mfe_ux_lab/cockpit/'+path.relative(app,args.path).replaceAll('\\','/')],{cwd:root,encoding:'utf8',maxBuffer:2e6}),loader:'ts'}));
}}]:[];
const bundled=await build({stdin:{contents:"export * from './src/lib/realisticStrategySim.ts';export * from './src/lib/realisticSimRun.ts';export * from './src/lib/simCalibration.ts';export * from './src/lib/simConfig.ts';export * from './src/lib/symbolSpec.ts';export {buildTruthContract} from './src/lib/simTruthContract.ts';",resolveDir:app,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',plugins});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const iso=(i,minute=0)=>new Date(Date.UTC(2020,0,1)+i*3600000+minute*60000).toISOString();
const flat=()=>Array.from({length:85},(_,i)=>({i,t:iso(i),o:100,h:101,l:99,c:100,r:'N'}));
const trigger={id:'causal_fixture',name:'Synthetic research fixture',level:5,role:'TRIGGER',conditions:[{metric:'hour',op:'==',value:16}],logic:'ALL',direction:'LONG',status:'SHADOW',explain:'Test-only event',why:'Regression',createdAt:''};
function config(){const c=api.cloneSimConfig();c.risk.sizingMode='FIXED_R';c.risk.fixedRValue=1;return c;}
const run=(bars,modules=[trigger.id],extra={})=>api.runRealisticSim(bars,modules,modules.includes('auto_rr'),{cfg:config(),spec:api.XAUUSD_PROVISIONAL_SPEC,designTf:'H1',cardId:'CHRONOLOGY_FIXTURE',symbol:'XAUUSD',customModules:modules.includes(trigger.id)?[trigger]:[],...extra});
const opened=r=>r.events.find(e=>e.event_type==='POSITION_OPENED_MODELED');
function intrabarFixture(index=41,afterTouch=true){
 const bars=Array.from({length:85},(_,i)=>{const o=100+i*.2,c=o+.2;return{i,t:iso(i),o,h:c+.1,l:o-.1,c,r:'N'};});
 const entry=100+index*.2+1;
 const kids=Array.from({length:60},(_,m)=>({i:m,t:iso(index,m),o:entry,h:entry+.1,l:entry-.1,c:entry,r:'N'}));
 // This low is inside the signal's first five minutes, before its closed-bar fill.
 kids[0]={...kids[0],o:entry-1,l:entry-3};
 if(afterTouch)kids[5]={...kids[5],l:entry-1};
 bars[index]={...bars[index],o:kids[0].o,h:entry+.1,l:entry-3,c:entry};
 const ex=bars.map(()=>[]);ex[index]=[{...kids[0],c:entry,h:entry+.1}];
 const m1=bars.map((b,i)=>Array.from({length:60},(_,m)=>({...b,i:m,t:iso(i,m)})));m1[index]=kids;
 const cfg=config();cfg.executionTf='M5';return{bars,ex,m1,cfg,entry,index};
}
const mirrorBar=b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c});
function mirrorFixture(f){return {...f,bars:f.bars.map(mirrorBar),ex:f.ex.map(k=>k.map(mirrorBar)),m1:f.m1.map(k=>k.map(mirrorBar)),entry:200-f.entry};}
const observations={};
const cases={
 'next-open':()=>{
  const results=[];observations.nextOpen=results;
  for(const auto of [false,true])for(const direction of ['LONG','SHORT'])for(const floor of [0,10]){
   let a=flat();if(auto)a[30]={...a[30],h:120};if(direction==='SHORT')a=a.map(mirrorBar);
   const b=structuredClone(a);b[41]={...b[41],h:125,l:75,c:direction==='LONG'?115:85};
   const modules=[trigger.id,...(auto?['auto_rr']:[])],cfg=config();cfg.minStopAtrK=floor;
   const customModules=[{...trigger,direction}];const options={cfg,customModules};
   const original=opened(run(a,modules,options)),mutated=opened(run(b,modules,options));
   results.push({autoRR:auto,direction,minStopAtrK:floor,original:original?.reason??'NO_PLAN',mutatedFutureCandle:mutated?.reason??'NO_PLAN'});
  }
  for(const r of results)assert.equal(r.mutatedFutureCandle,r.original,'future fill-bar H/L/C must not set entry risk or target');
  for(const direction of ['LONG','SHORT']){
   let bars=flat();bars[30]={...bars[30],h:120};if(direction==='SHORT')bars=bars.map(mirrorBar);
   bars[41]={...bars[41],o:direction==='LONG'?125:75,h:126,l:74,c:100};
   const result=run(bars,[trigger.id,'auto_rr'],{customModules:[{...trigger,direction}]});
   assert.ok(!result.events.some(e=>e.event_type==='POSITION_OPENED_MODELED'&&e.bar_index===41),'skip targets already behind a gapped fill');
  }
 },
 intrabar:()=>{
  const results=[];observations.intrabar=results;
  for(const direction of ['LONG','SHORT'])for(const outcome of ['stop','target','ambiguous','safe','final','gap']){
   let f=intrabarFixture(outcome==='final'?84:41,!['safe','target','ambiguous','gap'].includes(outcome));
   if(outcome==='target')f.m1[f.index][5]={...f.m1[f.index][5],h:f.entry+3};
   if(outcome==='ambiguous')f.m1[f.index][5]={...f.m1[f.index][5],h:f.entry+3,l:f.entry-1};
   if(outcome==='gap'){f.m1[f.index][5]={...f.m1[f.index][5],o:f.entry+.2,h:f.entry+.3,l:f.entry+.1,c:f.entry+.2};f.m1[f.index][6]={...f.m1[f.index][6],l:f.entry-1};}
   if(direction==='SHORT')f=mirrorFixture(f);
   const r=run(f.bars,['trend_pullback'],{cfg:f.cfg,execByDesign:f.ex,m1ByDesign:f.m1});const t=r.trades.find(t=>t.entryI===f.index);
   results.push({direction,outcome,entryI:t?.entryI,exitI:t?.exitI,fillTime:t?.fill_time,exitTime:t?.exit_time,grossR:t?.grossR});
   if(outcome==='safe')assert.ok(!t||t.exitI!==f.index,'pre-entry extremes never stop a later fill');
   else{
    assert.ok(t,'intrabar fixture opens and closes');assert.equal(t.exitI,f.index,'post-entry touch resolves inside the entry design candle');
    assert.equal(t.fill_time,iso(f.index,5),'M5 close availability time');assert.equal(t.signal_time,t.fill_time);
    assert.equal(t.exit_time,iso(f.index,outcome==='gap'?6:5));assert.equal(t.m1Resolved,true);
    assert.equal(t.grossR,outcome==='target'?4:-1);assert.ok(t.netR<t.grossR);assert.equal(t.equityAfter,+(t.equityBefore+t.netR).toFixed(2));
    if(outcome==='gap')assert.equal(t.entry_mid,f.entry+(direction==='LONG'?.2:-.2),'fill uses the next observed open, not the preceding close');
    if(outcome==='ambiguous'){
     assert.equal(t.ambiguous,true);const optimistic=run(f.bars,['trend_pullback'],{cfg:f.cfg,execByDesign:f.ex,m1ByDesign:f.m1,ambiguityPolicy:'OPTIMISTIC_TP_FIRST'}).trades.find(t=>t.entryI===f.index);assert.equal(optimistic.grossR,4);
    }
   }
   for(let i=1;i<r.events.length;i++)assert.ok(Date.parse(r.events[i].timestamp)>=Date.parse(r.events[i-1].timestamp),'events never move backward in time');
  }
  for(const direction of ['LONG','SHORT']){
   let f=intrabarFixture();if(direction==='SHORT')f=mirrorFixture(f);
   const facade=api.runRealisticBacktestM1(f.m1.flat(),{id:'M1_FACADE_CHRONOLOGY',design_tf:'H1',execution_tf:'M5',modules:['trend_pullback']},{cfg:f.cfg});
   const t=facade.sim.trades.find(t=>t.entryI===41);assert.ok(t);assert.equal(t.exitI,41);assert.equal(t.fill_time,iso(41,5));assert.equal(t.grossR,-1);assert.equal(facade.manifest.truth_contract.pathTruth,'M1_PATH_APPROX');
  }
  const original=intrabarFixture(),changed=intrabarFixture();changed.m1[41][30]={...changed.m1[41][30],h:150,l:50,c:120};changed.bars[41]={...changed.bars[41],h:150,l:50,c:120};
  const first=f=>run(f.bars,['trend_pullback'],{cfg:f.cfg,execByDesign:f.ex,m1ByDesign:f.m1}).trades.find(t=>t.entryI===41);
  assert.equal(first(changed).netR,first(original).netR,'data after an exited child cannot revise the trade or its costs');
  const missing=intrabarFixture();missing.m1[41]=missing.m1[41].filter((_,i)=>i!==9);
  assert.throws(()=>run(missing.bars,['trend_pullback'],{cfg:missing.cfg,execByDesign:missing.ex,m1ByDesign:missing.m1}),/INTRABAR_POST_ENTRY_PATH_INCOMPLETE/);
  const f=intrabarFixture();f.ex[41]=Array.from({length:12},(_,i)=>{const kids=f.m1[41].slice(i*5,i*5+5);return{...kids[0],h:Math.max(...kids.map(b=>b.h)),l:Math.min(...kids.map(b=>b.l)),c:kids.at(-1).c};});
  const coarse=run(f.bars,['trend_pullback'],{cfg:f.cfg,execByDesign:f.ex});const ct=coarse.trades.find(t=>t.entryI===41);assert.equal(ct.exitI,41);assert.equal(ct.m1Resolved,false);assert.match(ct.intrabarOutcome,/^EXECUTION_/);
  // An inherited position exits late in this candle. The engine must not then
  // replay an earlier M5 signal and open retroactively at 17:05.
  const inherited=intrabarFixture(41,false);inherited.cfg.minStopAtrK=10;inherited.m1[41][50]={...inherited.m1[41][50],l:100};
  const ir=run(inherited.bars,['trend_pullback',trigger.id],{cfg:inherited.cfg,customModules:[trigger],execByDesign:inherited.ex,m1ByDesign:inherited.m1});
  assert.equal(ir.trades[0].entryI,41);assert.equal(ir.trades[0].exitI,41);assert.equal(ir.trades[0].exit_time,iso(41,50));
  assert.equal(ir.markers.filter(m=>m.i===41&&m.kind==='buy').length,1,'no earlier intrabar reopen after a later inherited exit');
 },
 truth:()=>{
  const results=[];observations.truth=results;
  const m1=flat().flatMap((b,i)=>Array.from({length:60},(_,m)=>({...b,t:iso(i,m)})));
  for(const hasTickBidAsk of [true,false,undefined]){
   const cal={source:'MT5_SYMBOL_INFO',symbol:'XAUUSD',hasTickBidAsk,tickValue:1,contractSize:100,commissionRTPerLotUsd:7,swapLongUsdPerLotNight:-7,spread:{single:.2}};
   const direct=api.applyBrokerCalibration(config(),api.XAUUSD_PROVISIONAL_SPEC,cal);
   observations.calibration={pathExact:direct.pathExact};assert.equal(direct.state.specCalibrated,true);
   for(const [run,bars,expected]of [[api.runRealisticBacktest,flat(),'HTF_HEURISTIC'],[api.runRealisticBacktestM1,m1,'M1_PATH_APPROX']]){
    const r=run(bars,{id:'TRUTH_FIXTURE',design_tf:'H1',modules:[]},{calibration:cal,cfg:config()});
    results.push({hasTickBidAsk:hasTickBidAsk??'absent',pathTruth:r.manifest.truth_contract.pathTruth,pathExact:r.pathExact});
    assert.equal(r.pathExact,false);assert.equal(r.calibration.pathExact,false);assert.equal(r.manifest.truth_contract.pathTruth,expected);
    if(hasTickBidAsk)assert.ok(r.calibration.notes.some(n=>n.includes('did not execute')));
   }
   assert.equal(direct.pathExact,false,'availability is not executed tick replay');assert.notEqual(direct.state.level,'FULLY_CALIBRATED');
  }
  const stale=config();stale.version='realistic-sim-p0';const current=api.runRealisticBacktest(flat(),{id:'STALE_CONFIG_VERSION',design_tf:'H1',modules:[]},{cfg:stale});assert.equal(current.manifest.simulator_version,api.SIM_VERSION,'engine version is not supplied by a saved user configuration');
  assert.throws(()=>api.buildTruthContract({dataTruth:'TICK_BID_ASK',priceBasis:'BID',timezoneStatus:'VERIFIED',costStatus:'CALIBRATED',pathTruth:'TICK_PATH_EXACT'}),/TICK_REPLAY_NOT_IMPLEMENTED/);
 }
};
let failed=0;
for(const[name,test]of Object.entries(cases)){
 try{test();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.message.split('\n')[0]);}
}
const report={baseline,base,status:failed?'FAIL':'PASS',observations};console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--report')){fs.mkdirSync(path.join(root,'.mfe-state'),{recursive:true});fs.writeFileSync(path.join(root,'.mfe-state',baseline?'chronology-before.json':'chronology-current.json'),JSON.stringify(report,null,2));}
process.exitCode=failed?1:0;
