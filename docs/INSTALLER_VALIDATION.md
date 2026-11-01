# Installer acceptance: 1 November 2026

The Windows x64 release was exercised on the build host. This report distinguishes
actual local checks from the cross-platform CI configured in the repository.

## Observed locally

- Historical source setup installed locked frontend dependencies, created isolated
  state and built the production app. An unchanged start reused the build without
  Vite, dependency installation or compilation.
- Doctor reported Node/npm, Python version/architecture/path, installed terminal,
  loopback ports, write permissions, dependencies and absent historical data. Its
  offline path performed no network request or account initialization. Tests checked
  that a private env canary was neither printed nor modified.
- Public runtime tests used a real server, worker, inline synthetic test-only bars
  and workspace readback across restart. Missing history produced DATASET_NOT_FOUND
  without disclosing a local source path.
- The first-run browser file chooser imported a labeled 130-bar synthetic CSV,
  selected H1 and opened Microscope with CSV as its source. Existing integrity
  checks flagged frozen prices. No fixture was installed as market history.
- 28 isolated Python bridge/Demo tests passed. They use SDK fixtures and do not
  establish actual broker execution. No broker account was attached for this work.
- The portable ZIP was extracted into a path with spaces and Vietnamese characters.
  Its actual start.bat launched the built server with system Node/npm/Python absent
  from PATH. No install, build or Vite process occurred.
- Bundled Node.js v24.17.0 matched its official win-x64/node.exe SHA-256. Its full
  license and the bundled React/React DOM/Three.js licenses were included.
- npm audit reported zero known findings at the time of this acceptance run.

## Scope and limits

Public-checkout CI is configured for Windows, macOS and Linux. Actual GitHub check
results determine those outcomes; a configured workflow is not a passing run.
Native macOS/Linux binaries and signed Windows installers are not supplied. Phone
installation is unsupported.

Windows antivirus policies, Store Python aliases, unavailable networks, multiple
broker installations and terminals without a signed-in session vary by machine.
Doctor and the checks below help diagnose them. No universal-installation claim is made.

## Manual checks on another Windows machine

1. Extract the portable ZIP fully into a writable directory with spaces/Unicode.
2. Start historical mode without installed Node/Python and import an authorized CSV.
3. Close the launcher with Ctrl+C and verify its local services have stopped.
4. Repeat with an unrelated process occupying the app/bridge port. Verify that
   process is preserved and the launcher explains alternate ports or fallback.
5. For MT5, inspect doctor's 64-bit Python result. Run setup with --mt5. For Store
   Python or multiple versions, set MFE_PYTHON explicitly to the intended executable.
6. Open the intended terminal and sign in there. Use Advanced connection for multiple
   terminals; verify the connected account and broker symbol.
7. Keep manual Demo execution disabled unless intentionally using its separate
   reviewed ticket flow. Setup must never enable terminal permissions or send orders.

Commands and removal instructions are in [INSTALLATION.md](INSTALLATION.md).
Source setup: `npm run setup -- --historical`. Public checks: `npm run test:public`.
Bridge checks: `npm run test:bridge`. Windows portable build:
`npm run package:portable`, then `npm run test:portable`.
