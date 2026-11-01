# Custom layers and BEAST verification

The 1.2.0-rc.4 preview repairs the CSV-backed custom-authoring workflow. This audit covers the built application, its local research worker and the actual import UI. It does not certify live performance or an independent trading edge.

## Verified workflow

| Layer | Definition | Checked behavior |
|---|---|---|
| L1 | Typed feature graph | Native graph JSON, malformed-node rejection, CSV worker output, replay on the same interval, descriptive role check, durable Shadow save |
| L2 | Weighted context or price overlay | Existing-input resolution, finite weights, overlay import, no false conflict from unused input weights, save and reopen |
| L3 | Safe numeric AST | Malformed AST and dependency rejection, JSON-to-editor handoff, measured formula output, source-matched replay and descriptive validation |
| L4 | Context gate | Operator and threshold validation, same-CSV bar inspector, canonical indicator math, library-only save |
| L5 | Trigger, veto or exit intent | Direction and role validation, supported recipe import, canonical RSI/ATR, sample-consistent state distribution, explicit refusal of position-only metrics |
| L6 | Reference zone | Supported anchor resolution, legacy Card-ID normalization, custom geometry on the main chart, unchanged past geometry after future data changes |
| BEAST | Role-filtered Card composition | Common symbol/design/execution context, mixed-context refusal, CSV role analysis, lineage save, context-preserving Card export |

All six studios retain prompt export and JSON import. Prompts use the actual component catalogs. Clipboard success is displayed only after the browser confirms the write. The bundled examples were imported through each studio and saved as Shadow. No external AI response was fabricated for the demonstrations.

The expanded L1 template row and inspector cards no longer shrink beneath following panels. The L3 JSON form also keeps its controls in the scrollable column. The source selector, output, replay and L4/L5 bar inspector now refer to the selected CSV rather than unrelated bundled M15/M1 data. The latest 2,000 selected observations feed each custom preview; full Card runs use the explicitly selected Card interval.

A library-only save does not attach a module to the current draft. Attachment requires the separate Attach action. Failed durable saves restore the local definition state, including BEAST saves.

## Data and scope

The public test lane generates deterministic OHLC fixtures. An optional real-data run used the official Binance BTCUSDT January 2025 CSV with 44,640 M1 observations. Every custom layer used the same latest 2,000-row tail and matching normalized source hash. Monetary simulation without a supported symbol specification was refused.

A separate local integration check used 5,000 existing XAUUSD H1 research observations. Its original file is labeled sim_wide; broker provenance is unverified. The complete six-layer fixture produced 378 modeled trades and 69.56 net R, matching the browser result. These numbers demonstrate wiring and reproducibility, not a profitability claim. Neither CSV is included in the source or portable release.

The synthetic chain produced 101 trades and -47.83 net R. Save/reopen, export/reimport, restart, invalid-input rejection, an injected HTTP 503 save failure and local-storage quota failure were checked against the running service. Imported performance claims and validation receipts are reset in the receiving workspace.

Rule-preview regressions compare actual candidate indices with the canonical simulator. Before the fix, a 500-bar fixture produced 221 versus 211 RSI candidates and 296 versus 251 ATR-ratio candidates. Both comparisons now agree. L5 distributions exclude warmup and unavailable values from both counts and denominator. CSV Show results includes the last closed observation; Live still excludes the forming candle. CSV results no longer inherit a 10Y or enabled walk-forward label.

L6 computes a referenced evidence series once per preview, rather than recalculating it for every candle. Its causal ATR series remains numerically equal to the previous per-index calculation.

## Browser evidence

Actual browser actions covered file-chooser CSV upload, validation report, Open in Microscope, chart display, native L1 graph-file import, each studio's prompt copy and JSON import, library-only Shadow saves, an imported six-layer Card backtest, supported matched controls and explicit unsupported-Card refusal. BEAST composition, CSV role ablation, lineage save and Card export were recorded. The exported Card was read back as XAUUSD, design H1, execution H1, zero trades and NO_DATA before its separate backtest.

The final additional recording of opening that BEAST Card in Microscope was unavailable after local browser access was disabled. It is not presented as filmed evidence. Existing Card backtests and automated BEAST H1 engine comparisons remain separate verified checks.

## Reproduce

```sh
npm run setup -- --historical --no-browser
npm run test:public
npm run setup -- --historical --dev-deps --no-browser
npm run test:bridge
```

Optional authorized local data can be passed through QUANTSMART_REAL_CSV and QUANTSMART_LOCAL_GOLD_CSV. The default public test lane does not download market history.

New regression tests: l1-import, layers-import, portable-definitions, module-preview-consistency, sandbox-render, beast-context and layers-runtime. The layer-runtime test starts a real built service with a separate temporary workspace. Installer acceptance still uses the packaged launcher at port 5090 with no automatic fallback.

## Limits

- L1 role checks are descriptive on the selected sample. They cannot issue independent OOS qualification or automatic promotion.
- Formula validation can report an observed null result. Reusing its data for design does not create an untouched holdout.
- Matched entry/exit controls support the declared native stateless subset. Custom, stateful and mixed-timeframe Cards are refused.
- BEAST role analysis requires equal design and execution timeframes. Finer execution is not inferred from coarser CSV candles.
- L6 state anchors remain unsupported. Missing evidence never silently becomes close price.
- Execution is modeled. OHLC cannot prove tick ordering or actual broker fills.
- The independent human-labeled rejection benchmark remains open in issue #4.

Authority: SHADOW_ONLY. Decision: NO_DECISION. live_apply_allowed=false. Research runtime behavior changed: YES, for the listed correctness fixes. MT5 broker/order path touched: NO.
