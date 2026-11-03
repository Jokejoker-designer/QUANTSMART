# Local XAUUSD M1 history

The large-history importer reads a local UTC M1 CSV in a streaming pass and prepares files for the existing QUANTSMART Replay and research loaders. Use it for a history archive that exceeds the regular CSV upload limits. Python 3.11 or newer is required for this optional command.

```powershell
python scripts/import-xauusd-history.py "D:/history/XAUUSD_M1_UTC0_20150101_20260617.csv" --output "D:/history/quantsmart-xauusd-staged" --expected-sha256 c2335a8827769f62408854c222ffe03dee7df7a778d4aaa823da415c0531dfc3
```

The example hash identifies the registered original. If a downloaded copy differs, keep it intact and review its provenance before substituting a hash. The importer validates ordering, unique minute timestamps, UTC and OHLC consistency. It saves M1 bars by year, a recent M1 file with at most 250,000 bars, and complete M5/M15/M30/H1/H4/D1 buckets. A higher timeframe bucket with a missing minute is omitted and counted. The full M1 sequence retains all gaps. Only OHLC enters the output; volume is excluded. A timeframe with zero complete buckets has no output file. For example, a feed with daily session breaks may have no complete UTC D1 buckets. A session calendar would be needed to derive session-based daily bars.

The command creates a new output directory and a receipt with source SHA-256, coverage, gap counts and output hashes. Inspect the receipt before activation. Stop QUANTSMART, preserve the current `mfe_ux_lab/cockpit/public/data/sim` files as a backup, and place the new `ohlc_XAUUSD_*.json` files there. Keep existing history for other symbols. If an XAUUSD timeframe is missing from the receipt, move its previous tape to the backup or treat it as a separately sourced tape with its own coverage. Start QUANTSMART and open Microscope → Replay → M1. Select a year from the year selector. Check the selected timeframe and source before running a backtest. Higher timeframe results can differ from a previous tape because complete buckets are derived from the selected M1 data.

The regular browser CSV upload remains available for smaller, separately saved datasets. Source CSVs and generated market data belong in the local workspace only. The import is research evidence. It does not qualify a strategy or grant live authority.

Run the importer checks with `python -m unittest discover -s tests -p test_import_xauusd_history.py -v`.
