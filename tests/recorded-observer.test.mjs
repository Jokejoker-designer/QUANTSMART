import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('../mfe_ux_lab/cockpit/',import.meta.url));
const require=createRequire(path.join(app,'package.json')),ts=require('typescript'),{build}=require('esbuild');
const text=fs.readFileSync(path.join(app,'src/pages/Playbook.tsx'),'utf8');
const source=ts.createSourceFile('Playbook.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const nodes=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='computeLiveNow'||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(source)==='_n'));
const built=await build({stdin:{contents:nodes.map(n=>n.getText(source)).join('\n')+'\nexport {computeLiveNow};',loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {computeLiveNow}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
assert.equal(computeLiveNow({},null),null);
for(const value of [null,undefined,NaN,'0',-1,2])assert.equal(computeLiveNow({as_of:'2026-11-03T00:00:00Z',regime:{shock_regime_gauge:value},danger_score:0,blackswan:{blackswan_risk:0}},null),null);
assert.equal(computeLiveNow({as_of:'2026-11-03T00:00:00Z',regime:{shock_regime_gauge:0},danger_score:0,blackswan:{blackswan_risk:0}},null).instability_score,0);
const contracts=await build({stdin:{contents:"export {PIPELINE_STAGES,pipelineStagesFor} from './src/lib/assetLearning/contracts.ts';",resolveDir:app},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const api=await import('data:text/javascript;base64,'+Buffer.from(contracts.outputFiles[0].text).toString('base64'));
assert.deepEqual(api.pipelineStagesFor('CSV'),api.PIPELINE_STAGES);
assert.deepEqual(api.pipelineStagesFor('MT5_QUOTE_RECORDING').slice(1),api.PIPELINE_STAGES.slice(1));
assert.equal(api.pipelineStagesFor('MT5_QUOTE_RECORDING')[0],'live_tick_ingest');
for(const file of ['ResearchCockpit','EntryDanger','Playbook','HiddenCoefficients','StrategyLab','WeeklyAudit','Analysis','Microscope'])assert.match(fs.readFileSync(path.join(app,'src/pages/'+file+'.tsx'),'utf8'),/RecordedObservationPanel/);
console.log('RECORDED OBSERVER PASS: missing assessment stays unavailable; explicit ingestion origin preserves existing CSV stages; existing pages consume one recorded observer.');


const microscope = await build({
  stdin: {contents:"export {microscopeCardIssue,microscopeCsvSupports} from './src/lib/microscopeComputed.ts';", resolveDir:app},
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',
});
const {microscopeCardIssue,microscopeCsvSupports} = await import('data:text/javascript;base64,'+Buffer.from(microscope.outputFiles[0].text).toString('base64'));
const card = {id:'m15',name:'M15 fixture',modules:['trend_pullback'],design_tf:'M15',execution_tf:'M15'};
const inputs = {source:'CSV',csvTf:'H1',customTriggerIds:[]};
assert.equal(microscopeCsvSupports('H1','M15'),false);
assert.equal(microscopeCsvSupports('M15','H1'),true);
assert.match(microscopeCardIssue(card,inputs),/CSV is H1; this Card needs M15/);
assert.equal(microscopeCardIssue(card,{...inputs,source:'Replay'}),null);
assert.match(microscopeCardIssue({...card,role:'GUARD'},inputs),/GUARD is a supporting role/);
assert.match(microscopeCardIssue({...card,modules:['regime_ctx']},{...inputs,source:'Replay'}),/No explicit entry trigger/);
assert.equal(microscopeCardIssue({...card,modules:['custom_trigger']},{...inputs,source:'Replay',customTriggerIds:['custom_trigger']}),null);
assert.match(microscopeCardIssue(card,{...inputs,source:'Live',liveReady:false}),/Closed MT5 candles are unavailable/);
assert.match(microscopeCardIssue({...card,design_tf:'H1',execution_tf:'H1'},{...inputs,source:'Replay',primaryTf:'M15'}),/same design timeframe/);
assert.match(microscopeCardIssue({...card,execution_tf:'M1'},{...inputs,csvTf:'M15'}),/M1 intrabar history/);
console.log('MICROSCOPE DIAGNOSTICS PASS: source changes, explicit triggers, supporting roles, aligned comparison and intrabar input requirements.');
