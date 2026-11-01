import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {syntheticBars} from './module-chain-fixture.mjs';
const app=fileURLToPath(new URL('../mfe_ux_lab/cockpit',import.meta.url));
const require=createRequire(app+'/package.json'),{build}=require('esbuild');
const output=path.join(app,'.mfe-state/report-labels.cjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
globalThis.localStorage={getItem:()=>null};
try {
  await build({stdin:{contents:"export{RealismPanel}from'./src/components/RealismPanel.tsx';export{HonestyDashboard}from'./src/components/HonestyDashboard.tsx';export{runRealisticBacktest}from'./src/lib/realisticSimRun.ts';",resolveDir:app},bundle:true,platform:'node',format:'cjs',outfile:output,external:['react'],loader:{'.css':'empty'},logLevel:'silent'});
  const api=require(output),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const run=api.runRealisticBacktest(syntheticBars(1200),{id:'labels',symbol:'XAUUSD',design_tf:'H1',execution_tf:'H1',modules:['trend_pullback']},{symbol:'XAUUSD',chartTf:'H1'});
  const render=(bt)=>renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(api.HonestyDashboard,{bt}),React.createElement(api.RealismPanel,{bt})));
  let failures=0;
  function check(name,fn){try{fn();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+': '+error.message.split('\n')[0]);}}
  check('H1-only report never claims an M1 path',()=>{const html=render(run);assert.ok(!/M1 APPROX PATH|approximate M1 path|M1 path APPROX/.test(html));assert.match(html,/DESIGN-BAR OHLC HEURISTIC/);});
  const mixed={...run,analytics:{...run.analytics,netPF:1.07,netNetR:17.78,costFragile:true,scenarios:[{scenario:'LOW_COST',netPF:1.13,netR:29.81},{scenario:'BASE_COST',netPF:1.07,netR:17.78},{scenario:'STRESS_COST',netPF:.98,netR:-6.29}]}};
  check('positive BASE and failed STRESS are reported separately',()=>{const html=render(mixed);assert.ok(!html.includes('survives only at LOW cost'));assert.match(html,/non-positive result under STRESS cost/);});
  check('calibrated cost footer follows the receipt',()=>{const calibrated={...run,manifest:{...run.manifest,truth_contract:{...run.manifest.truth_contract,costTruth:'BROKER_SPEC_CALIBRATED'}}};const html=renderToStaticMarkup(React.createElement(api.RealismPanel,{bt:calibrated}));assert.ok(!html.includes('PROVISIONAL COST'));assert.match(html,/BROKER-SPEC COST/);});
  check('M1 receipt keeps the M1 path label',()=>{const m1={...run,manifest:{...run.manifest,truth_contract:{...run.manifest.truth_contract,pathTruth:'M1_PATH_APPROX'}}};assert.match(render(m1),/M1 APPROX PATH/);});
  assert.equal(failures,0,'Report labels must match the execution receipt and scenario results');
} finally {delete globalThis.localStorage;fs.rmSync(output,{force:true});}
