# Import and use historical CSV data

## Import a file

1. Open **Microscope -> Chart & Replay** or the first-run panel on Cockpit.
2. Expand **Import or reopen historical CSV**.
3. Choose your file and its canonical symbol, such as `XAUUSD` or `BTCUSDT`.
4. Confirm the source timeframe or choose detection. Detection estimates observed
   spacing; it cannot prove the original export frequency when rows are missing.
5. Choose YMD, DMY or MDY and the UTC offset of timestamps without an explicit zone.
   An explicit `Z` or numeric offset in each timestamp takes precedence.
6. Select a price-column family if the file has both bid and ask OHLC columns.
7. Click **Validate and save locally**. Review the time range, warnings and first
   and last rows before opening the dataset in Microscope.

The parser runs in an isolated backend worker. Files stay in the local workspace.
It does not connect to a broker or upload history to GitHub. Keep your original
file as a separate source copy.

## Supported format

- UTF-8, UTF-8 BOM and BOM-marked UTF-16 LE/BE.
- Comma, tab, semicolon or pipe separators, including quoted fields and embedded
  newlines. Semicolon-separated decimal-comma prices are supported.
- `time,open,high,low,close`, MT4/MT5 `<DATE>` plus `<TIME>`, `BidOpen`/`AskOpen`
  column families, and headerless time/O/H/L/C records.
- ISO-style dates, dotted MT5 dates, explicitly selected DMY/MDY and integer epoch
  seconds, milliseconds, microseconds or nanoseconds. Bars must be minute aligned.
- M1, M5, M15, M30, H1, H4 and D1 source intervals. Chart aggregation uses UTC
  buckets. A Card may request an equal or coarser supported design timeframe.
- Up to 32 MB and 250,000 input rows. Limits cause an error, never tail truncation.

Malformed numbers, nonpositive/nonfinite prices, invalid calendar dates,
contradictory OHLC and conflicting duplicate timestamps reject the whole import
with a line number. Exact duplicate OHLC records can be removed with a warning.
Chronological sorting is reported. Extra volume columns are not treated as
verified volume evidence. No missing candle or price is fabricated.

## Reopen and select an interval

Expand the same panel, select **Saved dataset**, then **Open saved dataset**.
The normalized dataset and interpretation options survive service/browser restart.
Reimporting identical content and interpretation reuses its dataset ID.

The backend stores `imports/index.json` and immutable content-addressed JSON files
inside its selected workspace directory. The default portable workspace is under
`mfe_ux_lab/cockpit/artifacts/workspace`. Back up this directory before removing or
replacing an installation. Normalized data and metadata hashes are checked when
read; a mismatch stops the run and asks for a reimport.

The decoded-text hash is not always the original file-byte hash, particularly
for UTF-16/BOM files. The normalized hash identifies the bars actually stored.
Research receipts also retain the imported dataset identity and interpretation.

Gaps remain visible as warnings. For M1 path simulation, use **Use longest
continuous interval** when appropriate and review the resulting dates. A closed
higher-timeframe bucket with missing/duplicated minutes is not dropped and joined
to its neighbor. The simulation stops instead. The longest segment can still be
too short for the selected Card; import more data or choose a smaller design TF.

An M1 path currently requires every observed minute in the selected interval,
including any scheduled closure. No market-session calendar is implemented.
Full UTC D1 reconstruction requires all 1,440 minutes; use a broker's direct D1
CSV for a session-based daily chart rather than inventing closed-session minutes.

## Run a Strategy Card

Select a Card for the imported symbol. The chart and computation follow the
Card's design timeframe. An incompatible asset selection clears the prior Card.
A finer execution timeframe requires M1 input. The system refuses a silent
substitution with design-close execution.

CSV runs use the actual selected interval. A short file is not reused as three
separate 10Y/OOS/forward windows, and CSV diagnostic runs do not automatically
promote the saved Card's validation state.

The CSV supplies prices, not a broker contract or costs. Gold's existing
provisional specification remains explicitly modeled. Other assets need valid
broker specification inputs before monetary simulation. Unknown or mismatched
specifications are rejected at the canonical simulator boundary. A chart can be
inspected without establishing cash P&L.

## Compare entry and exit controls

With a supported Card and CSV interval, expand **Strategy attribution -> matched
controls** and run the fixed 8-seed protocol. It requires 600 to 5,000 design bars.
The interval is not silently shortened to meet the limit.

The four event-study arms use the same canonical simulator:

| Arm | Entry | Exit |
| --- | --- | --- |
| A | Real native candidate events | Fixed hold of 5, 10 or 20 observed candles |
| B | Seeded matched random events | Same fixed hold |
| C | The same random events as B | Card exit rules |
| D | The same real events as A | Card exit rules |

Events are matched by chronological third, direction, causal EMA10/34 regime,
UTC hour and supported gates/plan eligibility. Candidate and control IDs, seeds,
mean net basis points, net R and holding durations are exposed in the protocol
panel. Seeds sample with replacement. Each event is isolated under fixed-R
sizing; the separate full-system reference retains the normal position scheduler.

The current protocol accepts the enumerated native trigger families, classic
triggers, basic regime/session/news/chop/ATR gates, Auto R:R and the two native
close-based exits. It refuses custom/stateful/unsupported modules and mixed
execution timeframes. It does not silently replace their behavior.

These are conditional descriptive controls. Plan eligibility is retained, so the
sample is not every raw trigger event. Equal counts do not ensure equal exposure;
duration is reported. Chronological thirds are not an independent holdout after
strategy selection. Overlapping events and repeated seeds are dependent. There
is no p-value, Deflated Sharpe Ratio, multiple-testing correction or automatic
profitability verdict. Independent human rejection labels remain open in issue #4.

## Ambiguous exits and stop floors

The final stop-floor-adjusted plan must satisfy the minimum reward/risk threshold
when an explicit target is present. The same rule applies to design and intrabar
entries.

Marked/conservative stop-first and explicit optimistic policies remain available.
`TICK_REQUIRED` stops an ambiguous run because no tick executor exists.
`EXCLUDE_AMBIGUOUS` is refused as a full-equity execution policy. The existing
excluding-ambiguous PF is a report-only sensitivity statistic; it cannot define
counterfactual sizing, daily limits or future entry opportunities.

## Reproduce checks

```sh
npm run setup -- --historical --no-browser
npm run test:public
npm run test:bridge
```

Dataset-free checks include quoted/locale/MT5/epoch imports, 80,005-row retention,
strict failures, actual form rendering, stored-hash failure, canonical execution
contracts, deterministic matched controls and real built-worker persistence.
They do not substitute for a manual browser file-chooser acceptance run.

Optional checks with an authorized local copy of the documented external file:

```powershell
$env:QUANTSMART_REAL_CSV = 'C:\path\BTCUSDT-1m-2025-01.csv'
node tests/csv-import.test.mjs
node tests/csv-runtime.test.mjs
```

See [the validation record](CSV_RESEARCH_VALIDATION.md) for actual observed checks,
data provenance and the remaining UI acceptance boundary.
