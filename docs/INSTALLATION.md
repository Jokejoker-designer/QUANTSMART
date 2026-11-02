# Install QUANTSMART

## Windows portable: no Node or npm installation

Download the [current Windows x64 portable ZIP](https://github.com/Jokejoker-designer/QUANTSMART/releases/download/v1.2.0-rc.3/QUANTSMART-1.2.0-rc.3-windows-x64.zip), which defaults to **5090**. Older release assets keep their historical defaults.
Extract the entire ZIP to a writable folder, for example your Documents folder,
then double-click `start.bat`. Do not run it from inside the ZIP.

Choose historical CSV research or the optional MT5 connector. The first screen
offers CSV import, MT5 connection, the guide and an option to explore without data.
The portable app bundles Node.js and the production UI/worker. It has no Vite server,
per-start build, global install or administrator requirement. Historical mode can
run offline without Python. It is a portable app, not a signed `.exe` installer.

The graph/CSV tools inspect the observations you supply. No market history or
fabricated performance is bundled. Imports are stored in the local workspace and can be reopened after restart. Keep the original CSV as a separate source copy; see [CSV_IMPORT.md](CSV_IMPORT.md).

For diagnostics from the extracted folder:

```bat
runtime\node.exe scripts\doctor.mjs --offline
```

## Source installation on Windows, macOS or Linux

Install Node.js **22.12 or newer**, preferably a supported LTS release, with npm.
The launcher reports the installed version and the official download URL when it
is incompatible. Version-manager users should select a compatible LTS version
in their terminal before setup; QUANTSMART does not change their global selection.

```sh
npm run setup -- --historical
npm run mfe:doctor
npm start
```

`setup` installs locked frontend dependencies, creates `.env` only if missing,
builds once and exits. `start` opens the production app; later starts reuse the
build while its sources and dependency lock are unchanged. `npm start` and Windows
`start.bat` show a mode chooser when attached to an interactive terminal. Scripts,
CI and callers can select a mode directly:

```sh
npm run mfe -- --historical --no-browser
npm run setup -- --mt5
npm run mfe -- --mt5
npm run mfe -- --dev --historical
npm run mfe -- --port 5090 --bridge-port 8791
npm run mfe:doctor -- --json --offline
```

Fresh source and portable downloads default to **`http://localhost:5090/`**. Startup stops if 5090 is occupied; it never scans for another port. Only an explicit `--port` or `MFE_PORT` override changes the app port. On an existing installation, update an old `.env` to `MFE_PORT=5090` to adopt the new default. Keep the launcher terminal open;
Ctrl+C stops only its own services. Occupied ports never cause unrelated processes
to be killed. Missing optional connector dependencies degrade to historical mode
with a reason. Read `WARN` diagnostics before assuming a feature is available.

## MT5 on Windows

Install your broker's desktop terminal and Python **3.11+ 64-bit**. Python 3.12
64-bit is a practical default. Enable Python's PATH option or set `MFE_PYTHON` in
your private `.env` to the full executable path. The launcher tries explicit
Python selection, versioned Windows Python launchers and PATH candidates.

Run setup with `--mt5`, open MT5 and sign in there, then choose **Auto-Attach** in
QUANTSMART. No broker account is initialized or logged in by setup or doctor.
Multiple installations can be selected with Advanced connection. Broker clocks
and symbol mappings are broker-specific; follow the README before changing them.

The connector's `.venv-mfe` is isolated. A broken existing interpreter is reported
and preserved. The research `.venv` is never used as a repair target. Real accounts
may provide read-only data; optional manual execution remains Demo-only and off
by default. Research runs never place orders.

The separate Card Demo runner preview is also off by default. Set
`MFE_ENABLE_CARD_DEMO=true` in your local `.env`, restart, choose a saved Card and
use **Check Card support**. Enabling the flag does not Start a session. Read
[supported behavior and verification limits](DEMO_AUTOMATION.md) before using
**Start Card on Demo**. Existing manual tickets still need their own opt-in flag.

## Tests without private data

```sh
npm run setup -- --historical
npm run test:public
npm run test:unit
npm run setup -- --historical --dev-deps
npm run test:bridge
npm run test:product:with-data
```

`test:public` exercises a real built local server and worker using a deterministic
synthetic test request. That fixture is never installed as application history and
its results are not market evidence. Bridge tests need isolated Python test
dependencies. The with-data lane requires authorized H1/M15 histories and reports
missing files before starting the suite. Tests do not silently download datasets.

## Public/static hosting

GitHub Pages or a static preview can display documentation and bundled UI assets.
It cannot start a local worker, save a durable research workspace or connect to
MT5. Use the local app for those capabilities. QUANTSMART does not deploy a
separate static application site as part of this installer.

## Disk space, upgrade and removal

Only source development needs `node_modules` and a build toolchain. The portable
release omits source dependencies, historical archives and user workspaces. Reuse
the installed build instead of keeping multiple unpacked releases.
Production builds do not copy `public/data` into `dist`; the local server reads
the original history directory directly, avoiding a second copy of large tapes.

Before removing an installation, stop its launcher and export your Cards. Preserve
your original CSV, private `.env`, any broker-clock settings and
`mfe_ux_lab/cockpit/artifacts/workspace` if you need the local saved evidence.
Never publish these files. Deleting the portable folder also deletes its local
workspace, so uninstall is deliberately a user action rather than automatic cleanup.

Native macOS `.dmg`, Linux AppImage and signed Windows installers are not provided
by this release. Source setup is available on those desktop platforms; native MT5
remains Windows-only. No direct phone installation is supported.
