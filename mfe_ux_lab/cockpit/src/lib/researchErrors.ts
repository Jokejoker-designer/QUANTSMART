const messages:Record<string,string>={
 CSV_TIMEFRAME_MISMATCH:'This CSV cannot provide a finer timeframe. Choose an equal or coarser Card/chart timeframe.',
 CSV_M1_SOURCE_REQUIRED_FOR_DECLARED_EXECUTION:'This Card declares intrabar execution. Import M1 history to run that path; it will not be replaced by a design-close simulation.',
 CSV_INCOMPLETE_AGGREGATION:'Some closed chart buckets lack source rows. Select a continuous interval or import the missing history.',
 CSV_NO_COMPLETE_BARS_IN_WINDOW:'No complete bars exist at this timeframe in the selected interval.',
 INSUFFICIENT_CSV_DESIGN_BARS:'This interval has fewer than 61 design bars. Select more history or a smaller Card timeframe.',
 M1_DISCONTINUOUS_PATH:'The M1 path has missing or duplicated minutes. Choose a continuous interval; missing prices are never filled in.',
 M1_INCOMPLETE_CLOSED_BUCKET:'A closed higher-timeframe candle is missing M1 minutes. This path cannot be simulated reliably.',
 CSV_STORED_HASH_MISMATCH:'The stored dataset no longer matches its integrity hash. Reimport the original file; this run was stopped.',
 EXCLUDE_AMBIGUOUS_IS_REPORT_ONLY:'Excluding an unknown exit cannot define a full equity path. Use the exclusion sensitivity statistic, or choose an explicit supported simulation policy.',
 TICK_REQUIRED_FOR_AMBIGUOUS_PATH:'This candle touches both stop and target. Tick data would be required to resolve its order; this engine cannot execute tick replay.',
 ATTRIBUTION_UNSUPPORTED_MODULES:'This Card contains modules outside the matched-control protocol. Use a supported native Card; no substitute result was calculated.',
 ATTRIBUTION_DESIGN_TIMEFRAME_ONLY:'Matched controls currently require execution timeframe equal to design timeframe.',
 ATTRIBUTION_WINDOW_REQUIRES_600_TO_5000_DESIGN_BARS:'Select an interval containing 600 to 5,000 design bars for matched controls.',
 ATTRIBUTION_INSUFFICIENT_MATCHED_EVENTS:'Fewer than six eligible matched events were found. Choose a longer interval or another supported Card.',
 CSV_ASSET_MISMATCH:'The dataset and selected Card refer to different assets. Select a Card for this symbol.',
};
export function explainResearchError(error:string){const code=error.split(':',1)[0];return messages[code]??error;}
