# Verification and current limits

This source release is intended for local quantitative research. Templates, feature
plots and historical measurements are distinct from broker execution and future
performance.

## Checks performed on October 29, 2026

- Frontend TypeScript checks and a production build.
- Launcher, loopback proxy, tick-stream, display-clock, research-job ownership,
  workspace-merge and responsive canvas lifecycle tests.
- 28 Python bridge and manual-Demo tests using injected SDK fixtures, including
  rejection of Real accounts, changed-account previews and duplicate submissions.
- A live Windows MT5 Demo attachment to XM, without entering an account password.
- Actual broker symbol resolution, current M1 candles, closed H1 history and
  server-sent tick packets through the application origin.
- Browser inspection and screenshots of the 17 navigation workspaces.

The live connection check observed 14 stream packets during approximately four
seconds. This is a bounded observation, not a latency benchmark or a guarantee of
continuous availability. No broker order was submitted or closed for this release
check. Fixture tests do not establish acceptance of an actual broker order.

## Source and evidence

The screenshot gallery uses the running application with locally available data
and saved research designs. Broker account IDs, balances, passwords, local datasets
and private workspaces are excluded from the distribution. A clean installation
therefore starts without those histories or measured results. Import your own
authorized OHLC data or connect your own local terminal.

The user-facing documentation is in English. Imported user content and independent
historical artifacts retain their original language and provenance. Legacy internal
`mfe_*` identifiers remain for compatibility with saved workspaces.

## Limits

- The native MT5 connector requires Windows, a compatible 64-bit Python runtime
  and an installed terminal with a valid broker session.
- A connected price feed does not provide an entry assessment. Missing advisory
  outputs, liquidity pools or target plans remain unavailable.
- The simulator uses declared modeled fills and costs. Backtest results do not
  establish broker-calibrated tick execution or a future edge.
- Strategy jobs never send broker orders. Optional manual Demo tickets require
  a separate opt-in and an explicit preview/confirmation workflow. Real accounts
  cannot use this execution path.
- Research receipts identify the tested source and configuration. Changing inputs
  can invalidate their relevance; a screenshot is not a verification receipt.

Run the commands in the [README](../README.md#development-and-verification) to
repeat the automated checks. See [SECURITY.md](../SECURITY.md) for the local service
boundary and responsible reporting.
