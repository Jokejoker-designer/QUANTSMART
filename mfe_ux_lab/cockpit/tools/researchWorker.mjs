// RESEARCH / SHADOW_ONLY / NO_DECISION. Isolated engine invocation; no broker imports.
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readCsvDataset } from './importRepository.mjs';
import { simulationTrialSnapshot } from './researchTrials.mjs';
import { setSimulationTrialObserver } from '../src/lib/simTrialObserver.ts';

const allowedStorage = new Set(['mfe_coef_profile', 'mfe_custom_modules', 'mfe_custom_l1', 'mfe_custom_l2', 'mfe_custom_l3', 'mfe_custom_l4_recipe', 'mfe_custom_l5_recipe', 'mfe_custom_l6']);
const storage = workerData.request.storage || {};
// Each job has its own module state. Storage is a frozen input, never the user's browser storage.
globalThis.localStorage = { getItem: (key) => allowedStorage.has(key) ? storage[key] ?? null : null, setItem: () => { throw new Error('RESEARCH_STORAGE_READ_ONLY'); }, removeItem: () => { throw new Error('RESEARCH_STORAGE_READ_ONLY'); } };
const norm = (s) => String(s).replace(' ', 'T');
async function run() { try {
  const { request, dataRoot, importDirectory } = workerData;
  if(request.kind==='csv_import'){
    const{parseCsvOhlc}=await import('../src/lib/csvOhlc.ts');const parsed=parseCsvOhlc(request.text,request.csvOptions||{});if(parsed.error)throw new Error(parsed.error);parentPort.postMessage({result:parsed});return;
  }
  let bars = request.bars;
  let dataHash;
  let imported;
  if(request.importId){
    imported=readCsvDataset(importDirectory,request.importId);dataHash=imported.metadata.normalizedHash;bars=imported.bars;
    if(request.kind==='csv_view'&&(request.from||request.to))bars=bars.filter(b=>(!request.from||b.t>=request.from)&&(!request.to||b.t<=request.to));
    if(request.kind==='csv_view'||request.mode!=='m1'){
      const{aggregateCsvBars}=await import('../src/lib/csvDataset.ts');const target=request.timeframe||request.card?.design_tf||imported.metadata.tf;const aggregated=aggregateCsvBars(bars,imported.metadata.tf,target);bars=aggregated.bars;
      if((request.kind==='backtest'||request.analysis==='attribution')&&aggregated.gapBuckets)throw new Error('CSV_INCOMPLETE_AGGREGATION: use a continuous interval');
    }else if(imported.metadata.tf!=='M1')throw new Error('CSV_M1_SOURCE_REQUIRED');
    if(request.kind!=='csv_view'&&(request.from||request.to)){const end=request.to?Date.parse(request.to+'Z')+(request.mode==='m1'?({M1:1,M5:5,M15:15,M30:30,H1:60,H4:240,D1:1440}[request.windowTf]||1)-1:0)*60000:Infinity;bars=bars.filter(b=>(!request.from||b.t>=request.from)&&Date.parse(b.t+'Z')<=end);}
    if(request.kind==='csv_view'){if(!bars.length)throw new Error('CSV_NO_COMPLETE_BARS_IN_WINDOW');parentPort.postMessage({result:{metadata:imported.metadata,bars},provenance:{dataHash,bars:bars.length}});return;}
    if(request.options?.symbol!==imported.metadata.symbol)throw new Error('CSV_ASSET_MISMATCH');
    if(request.kind==='backtest'&&request.mode!=='m1'){const{getCardRuntimeConfig}=await import('../src/lib/simTimeframe.ts');const runtime=getCardRuntimeConfig(request.card);if(runtime.allowed_execution_tf!==runtime.design_tf)throw new Error('CSV_M1_SOURCE_REQUIRED_FOR_DECLARED_EXECUTION');}

    request.options={...request.options,priceBasis:imported.metadata.quality.priceBasis,timezoneStatus:'PROVISIONAL'};
  }else if (request.dataset) {
    const { symbol, tf, from, to } = request.dataset;
    if (!/^[A-Z0-9]{3,12}$/.test(symbol) || !['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'].includes(tf)) throw new Error('INVALID_DATASET');
    const files = tf === 'M1' && from && to
      ? Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 }, (_, i) => `ohlc_${symbol}_M1_${Number(from.slice(0, 4)) + i}.json`)
      : [`ohlc_${symbol}_${tf}.json`];
    if (files.length < 1 || files.length > 20) throw new Error('INVALID_DATA_WINDOW');
    bars = []; const digest = createHash('sha256');
    for (const file of files) { const raw = readFileSync(join(dataRoot, file)); digest.update(raw); const data = JSON.parse(raw); if (!Array.isArray(data.bars)) throw new Error('INVALID_DATASET'); for (const bar of data.bars) if ((!from || norm(bar.t) >= norm(from)) && (!to || norm(bar.t) <= norm(to))) bars.push(bar); }
    dataHash = digest.digest('hex');
    if (request.dataset.expectedCount != null && bars.length !== request.dataset.expectedCount) throw new Error('DATA_WINDOW_MISMATCH');
    if (request.dataset.expectedHash && createHash('sha256').update(JSON.stringify(bars)).digest('hex') !== request.dataset.expectedHash) throw new Error('DATA_CONTENT_MISMATCH');
    if (request.dataset.first && JSON.stringify(bars[0]) !== request.dataset.first) throw new Error('DATA_SOURCE_MISMATCH');
    if (request.dataset.last && JSON.stringify(bars[bars.length - 1]) !== request.dataset.last) throw new Error('DATA_SOURCE_MISMATCH');
  } else dataHash = createHash('sha256').update(JSON.stringify(bars)).digest('hex');
  const totalBars=bars?.length;
  if(request.kind==='market')bars=bars.slice(-Math.min(5000,Math.max(61,request.count||600)));
  if (!Array.isArray(bars) || bars.length < 61 || bars.length > 750000) throw new Error('INSUFFICIENT_OR_EXCESSIVE_DATA');
  if(request.kind!=='market')setSimulationTrialObserver(definition=>{
    parentPort.postMessage({type:'simulation_trial',trial:simulationTrialSnapshot(definition,storage)});
  });
  if(request.kind==='market'){
    const {emaArr,atrArr}=await import('../src/lib/blocks/stdIndicators.ts');
    const closes=bars.map(b=>b.c),last=bars[bars.length-1];
    parentPort.postMessage({result:{bars,price:last.c,as_of:last.t,source:'HISTORICAL_OHLC',symbol:request.dataset.symbol,timeframe:request.dataset.tf,total_bars:totalBars,source_hash:dataHash,indicators:{ema10:emaArr(closes,10).at(-1),ema34:emaArr(closes,34).at(-1),atr14:atrArr(bars,14).at(-1)},indicator_lookback:bars.length},provenance:{dataHash,bars:bars.length}});
  }else if(request.kind==='diagnostic'){
    let result;
    if(request.analysis==='attribution'){const{runStrategyAttribution}=await import('../src/lib/strategyAttribution.ts');result=runStrategyAttribution(bars,request.card,{...request.options,...request.parameters});}
    else if(request.analysis==='ablation'){const {runAblation}=await import('../src/lib/simAblation.ts');result=runAblation(bars,request.card,request.parameters);}
    else if(request.analysis==='funding'){const {multiYearFunding}=await import('../src/lib/simMultiYearFunding.ts');result=multiYearFunding(bars,request.card,request.parameters);}
    else if(request.analysis==='beast_roles'){const {rolePowerReport}=await import('../src/lib/cardBeastV2/beastCompose.ts');result=rolePowerReport(bars,request.parameters.members);}
    else throw new Error('INVALID_ANALYSIS');
    parentPort.postMessage({result,provenance:{dataHash,bars:bars.length}});
  }else if (request.kind === 'calibration') {
    const { calibrateTriggerReliabilities } = await import('../src/lib/coefficientCalibration.ts');
    parentPort.postMessage({ result: calibrateTriggerReliabilities(bars), provenance: { dataHash, bars: bars.length,...(imported?{csvSource:{id:imported.metadata.id,filename:imported.metadata.filename,symbol:imported.metadata.symbol,sourceTimeframe:imported.metadata.tf,decodedTextHash:imported.metadata.decodedTextHash,normalizedHash:imported.metadata.normalizedHash,quality:imported.metadata.quality}}:{}) } });
  } else {
    if(request.purpose==='publication'){
      const {censusOf}=await import('../src/lib/cardBeastV2/moduleRoleCensus.ts');
      const {cardHasZones}=await import('../src/lib/cardZones.ts');
      const {diagnoseCardTriggers}=await import('../src/lib/cardTriggerDiagnosis.ts');
      const governance=new Set(['data_quality','kidi_guard','no_lookahead','synthetic_vol_guard','authority_guard']);
      const custom=request.options?.customModules||[];const stored=Object.values(request.storage||{}).flatMap(value=>{try{const x=JSON.parse(value);return Array.isArray(x)?x:[];}catch{return[];}});
      for(const id of request.card.modules)if(!censusOf(id)&&!governance.has(id)&&!cardHasZones([id])&&!custom.some(m=>m.id===id)&&!stored.some(m=>m.id===id||['myL1_','myL2_','myL3_','myL6_'].some(prefix=>prefix+m.id===id)))throw new Error(`UNRESOLVED_MODULE_DEPENDENCY:${id}`);
      if(diagnoseCardTriggers(request.card.modules).count===0&&!custom.some(m=>m.role==='TRIGGER'))throw new Error('EXPLICIT_TRIGGER_REQUIRED');
    }
    const { runRealisticBacktest, runRealisticBacktestM1 } = await import('../src/lib/realisticSimRun.ts');
    const result = (request.mode === 'm1' ? runRealisticBacktestM1 : runRealisticBacktest)(bars, request.card, request.options || {});
    if(request.importId&&(result.designBars?.length??bars.length)<61)throw new Error('INSUFFICIENT_CSV_DESIGN_BARS: choose a longer interval or a smaller Card timeframe');
    // A normal run already has these bars in the viewport client; avoid duplicating the history response.
    if (request.mode !== 'm1') delete result.designBars;
    parentPort.postMessage({ result, provenance: { dataHash, bars: bars.length,...(imported?{csvSource:{id:imported.metadata.id,filename:imported.metadata.filename,symbol:imported.metadata.symbol,sourceTimeframe:imported.metadata.tf,decodedTextHash:imported.metadata.decodedTextHash,normalizedHash:imported.metadata.normalizedHash,quality:imported.metadata.quality}}:{}) } });
  }
} catch (error) { parentPort.postMessage({ error: error.message || 'RESEARCH_JOB_FAILED' }); } }
void run();
