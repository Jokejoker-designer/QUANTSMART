import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../mfe_ux_lab/cockpit/package.json',import.meta.url));const {build}=require('esbuild');
const code=await build({entryPoints:[fileURLToPath(new URL('../mfe_ux_lab/cockpit/src/lib/workspaceMerge.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {mergeWorkspace}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
const pack=cards=>({mfe_strategy_cards:JSON.stringify(cards)});
const original=[{id:'a',name:'Old',modules:['x']}];
const local=[{...original[0],validationReceipt:{verified:true,job_id:'job'}}];
const remote=[{...original[0],name:'New name'},{id:'b',name:'Other tab',modules:[]}];
const merged=JSON.parse(mergeWorkspace(pack(original),pack(local),pack(remote)).mfe_strategy_cards);
assert.equal(merged.length,2);assert.equal(merged[0].name,'New name');assert.equal(merged[0].validationReceipt.job_id,'job');assert.equal(merged[1].id,'b');
assert.throws(()=>mergeWorkspace(pack(original),pack([{...original[0],name:'Left'}]),pack([{...original[0],name:'Right'}])),/REVIEW_REQUIRED/);
assert.throws(()=>mergeWorkspace(pack(original),pack([]),pack([{...original[0],name:'Changed'}])),/REVIEW_REQUIRED/);
assert.deepEqual(JSON.parse(mergeWorkspace(pack(original),pack(original),pack(remote)).mfe_strategy_cards),remote);
console.log('WORKSPACE MERGE PASS: independent tab edits and new Cards preserved; competing edits/deletions require review.');


const {createWorkspaceRepository} = await import('../mfe_ux_lab/cockpit/tools/workspaceRepository.mjs');
const {mkdtempSync,rmSync} = await import('node:fs');
const {tmpdir} = await import('node:os');
const {join} = await import('node:path');
const folder = mkdtempSync(join(tmpdir(),'qs-stale-run-'));
const repository = createWorkspaceRepository(folder);
try {
  repository.setEngineHash('old-engine');
  let saved = repository.commit({mfe_strategy_cards:JSON.stringify([{id:'a',name:'A',symbol:'XAUUSD',design_tf:'H1',modules:['trend_pullback']}])},0);
  repository.recordJob({
    id:'old-receipt',kind:'backtest',key:'fixture',engineHash:'old-engine',
    request:{kind:'backtest',card:{id:'a',symbol:'XAUUSD',design_tf:'H1',modules:['trend_pullback']},storage:{}},
    result:{manifest:{design_tf:'H1',data_range:{start:'2026-01-01',end:'2026-01-02',bars:100}},
      analytics:{n:1,netNetR:-1,netWinRate:0,maxDDNetR:-1,netPF:0}},
  });
  repository.setEngineHash('new-engine');
  saved = repository.commit({mfe_card_runs:JSON.stringify({a:{card_id:'a',windows:{Y10:{receipt:{job_id:'old-receipt'},verified:true,netR:-1}}}})},saved.revision);
  const oldWindow = JSON.parse(saved.storage.mfe_card_runs).a.windows.Y10;
  assert.equal(oldWindow.verified,false);
  assert.equal(oldWindow.verification_reason,'RUN_CONTEXT_CHANGED');
  assert.equal(oldWindow.netR,-1);
} finally {
  repository.close();
  rmSync(folder,{recursive:true,force:true});
}
console.log('STALE RUN SAVE PASS: old receipts remain unverified while current workspace changes save.');
