// Verify semantic numeric states in the shipped instrument components, without a browser or workspace writes.
import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const entry=`
const assert = require('node:assert/strict');
const {createElement} = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {InstrumentDial, BiasBar, Gauge} = require('./src/components/CockpitTelemetry.tsx');
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
for(const missing of [null, NaN, Infinity]) {
 const html=render(InstrumentDial,{progress:missing,display:'0',unit:'%',label:'Observed score'});
 assert.ok(html.includes('not available'));assert.ok(!html.includes('aria-valuenow'));assert.ok(!html.includes('quant-dial-reading'));assert.ok(html.includes('NO DATA'));
}
const zero=render(InstrumentDial,{progress:0,display:'0',unit:'RANK %',label:'Observed rank'});
assert.ok(zero.includes('aria-valuenow="0"'));assert.ok(zero.includes('aria-valuetext="0 RANK %"'));assert.ok(!zero.includes('NO DATA'));
const high=render(InstrumentDial,{progress:120,display:'2.40',unit:'ATR',label:'Gap capped at 2 ATR'});
assert.ok(high.includes('aria-valuenow="100"'));assert.ok(high.includes('aria-valuetext="2.40 ATR"'));
const signed=render(BiasBar,{gapAtr:-3.2,frame:'H1'});
assert.ok(signed.includes('aria-valuemin="-2"'));assert.ok(signed.includes('aria-valuenow="-2"'));assert.ok(signed.includes('aria-valuetext="-3.20 ATR"'));
assert.ok(!render(BiasBar,{gapAtr:null,frame:'W1'}).includes('aria-valuenow'));
assert.ok(!render(Gauge,{value:NaN,label:'Invalid observation'}).includes('aria-valuenow'));
console.log('COCKPIT INSTRUMENTS PASS: absent/invalid inputs never become zero scores; observed zero is valid; display caps preserve raw-unit readings; signed and unavailable bars expose truthful accessible values.');
`;
const compiled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'cockpit-instruments-acceptance.cjs'},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'});
const target='artifacts/desktop_instruments_20261027/instruments-acceptance.cjs';writeFileSync(target,compiled.outputFiles[0].text);
const result=spawnSync(process.execPath,[target],{encoding:'utf8',timeout:15000,windowsHide:true});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;if(result.status!==0)process.exitCode=result.status||1;
