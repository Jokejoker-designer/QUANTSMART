function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function numeric(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
export function readCardEvidence(card: unknown) {
 if(!record(card)||!record(card.validationReceipt))return null;
 const receipt=card.validationReceipt;if(receipt.verified!==true||typeof receipt.job_id!=="string"||!record(receipt.analytics)||!record(receipt.manifest)||!record(receipt.manifest.data_range))return null;
 const a=receipt.analytics,m=receipt.manifest,r=m.data_range;
 if(!numeric(a.n)||!numeric(a.netNetR)||!numeric(a.netPF)||!numeric(a.maxDDNetR)||!record(r)||!numeric(r.bars)||typeof r.start!=="string"||typeof r.end!=="string"||typeof m.symbol!=="string"||typeof m.design_tf!=="string")return null;
 return {jobId:receipt.job_id,symbol:m.symbol,timeframe:m.design_tf,from:r.start,to:r.end,bars:r.bars,trades:a.n,netR:a.netNetR,pf:a.netPF,drawdown:a.maxDDNetR,walkForward:record(receipt.walk_forward)&&typeof receipt.walk_forward.verdict==="string"?receipt.walk_forward.verdict:"Not available"};
}
export function CardEvidencePanel({card}:{card:unknown}){
 const evidence=readCardEvidence(card);
 if(!evidence)return <section className="card-evidence-panel"><h3>Validation evidence</h3><p>No current verified publication receipt. Save and validate this Card to measure its results on historical data.</p></section>;
 return <section className="card-evidence-panel"><h3>Measured research result</h3><p>{evidence.symbol} · {evidence.timeframe} · {evidence.from} — {evidence.to} · {evidence.bars.toLocaleString()} bars</p><dl><div><dt>Trades</dt><dd>{evidence.trades}</dd></div><div><dt>Net result</dt><dd>{evidence.netR.toFixed(2)} R</dd></div><div><dt>Profit factor</dt><dd>{evidence.pf.toFixed(3)}</dd></div><div><dt>Max drawdown</dt><dd>{evidence.drawdown.toFixed(2)} R</dd></div></dl><p>Walk-forward: {evidence.walkForward}. Simulation with modeled execution assumptions; no live readiness is implied.</p><details><summary>Receipt</summary><code>{evidence.jobId}</code></details></section>;
}
