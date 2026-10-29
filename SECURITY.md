# Security and local data

MFE runs on loopback. Its frontend uses a same-origin gateway to an optional,
separate MT5 process. Market-data routes are read-only. The Python process requires a per-launch secret
held in process memory; the browser never receives that secret. Do not expose
these services through a public reverse proxy or change their loopback binding.

Auto-Attach uses the MT5 desktop session. Advanced credentials go in a JSON POST
to the local bridge, are used by the MT5 SDK, then discarded by MFE. They are not
saved in .env, browser storage, research receipts, source exports or logs. The MT5
terminal itself may remember account details according to its own settings.

This protects against accidental persistence and cross-origin browser requests;
it does not protect a machine already compromised by malware or a privileged
local process. Market data supports Demo and Real accounts. Optional manual Demo
tickets are disabled by default (`MFE_ENABLE_MANUAL_DEMO=false`). Opting in enables
only `/mt5/demo/preview` and `/mt5/demo/submit`; research jobs cannot submit orders.
The adapter reads the actual account type and trading permissions, binds a preview
to its account/generation, rechecks before sending, expires previews in 30 seconds,
and prevents duplicate submission of a preview. Real, contest and unknown accounts
are rejected. Keep the intended Demo account selected in MT5 during review/send;
external account switching is outside the Python process's lock.

An unknown broker response is never reported as a fill or retried automatically.
Check MT5 before creating another request. A pending request ID may be retained in
sessionStorage only for result lookup; credentials are never stored there. This
adapter does not change MT5 Algo Trading or external-API protection settings.

Never publish .env, .venv, .mfe-state, node_modules, account configuration, public
data histories, artifacts, browser exports, backups or workspace receipts. Build
an allowlisted release with npm run package:mfe, inspect RELEASE_MANIFEST.json,
and publish that directory. The exporter does not upload anything.

If you find a security issue, notify the repository maintainer privately using
the repository's security reporting channel. Do not include credentials in a
public issue. This template contains no invented maintainer contact address.
