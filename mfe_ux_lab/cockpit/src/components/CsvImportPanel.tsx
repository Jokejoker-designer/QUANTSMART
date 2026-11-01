import{explainResearchError}from"../lib/researchErrors.ts";
import { useEffect, useId, useState } from "react";
import { CSV_MINUTES, type CsvOptions } from "../lib/csvOhlc.ts";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import {
  importCsvFile,
  listCsvImports,
  CSV_SELECTED_KEY,
  type CsvImportMetadata,
} from "../lib/csvImports.ts";
import "./csv-import.css";
export function CsvImportPanel({
  onOpen, openLabel="Open in Microscope",
}: {
  onOpen: (data: CsvImportMetadata) => void; openLabel?:string;
}) {
  const id = useId();
  const [list, setList] = useState<CsvImportMetadata[]>([]),
    [selected, setSelected] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [symbol, setSymbol] = useState(getActiveSymbol),
    [tf, setTf] = useState(""),
    [order, setOrder] = useState<"YMD" | "DMY" | "MDY">("YMD"),
    [offset, setOffset] = useState(0),
    [basis, setBasis] = useState<CsvOptions["priceBasis"]>("UNKNOWN"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<CsvImportMetadata | null>(null);
  useEffect(() => {
    let alive = true;
    listCsvImports()
      .then((rows) => {
        if (alive) {
          setList(rows);
          setSelected(
            localStorage.getItem(CSV_SELECTED_KEY) ||
              rows[rows.length - 1]?.id ||
              "",
          );
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const open = (data: CsvImportMetadata) => {
    localStorage.setItem(CSV_SELECTED_KEY, data.id);
    onOpen(data);
  };
  return (
    <details className="csv-import">
      <summary>Import or reopen historical CSV</summary>
      <div aria-busy={busy}>
        <p>
          Validate OHLC data in the local backend. Imports are saved on this
          machine and remain available after restart.
        </p>
        {list.length > 0 && (
          <div className="csv-import-row">
            <label>
              Saved dataset
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {list.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.symbol} · {x.filename} · {x.tf} ·{" "}
                    {x.bars.toLocaleString()} bars
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !list.some((x) => x.id === selected)}
              onClick={() => {
                const row = list.find((x) => x.id === selected);
                if (row) open(row);
              }}
            >
              Open saved dataset
            </button>
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const data = await importCsvFile(file, symbol, {
                dateOrder: order,
                utcOffsetMinutes: offset,
                timeframe: tf || undefined,
                priceBasis: basis,
              });
              setSaved(data);
              setList(await listCsvImports());
              setSelected(data.id);
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="csv-import-grid">
            <label>
              OHLC file
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                required
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setSaved(null);
                  setError("");
                }}
                aria-describedby={id + "-help " + id + "-error"}
              />
            </label>
            <label>
              Symbol
              <input
                value={symbol}
                required
                pattern="[A-Za-z0-9]{3,12}"
                maxLength={12}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              Source timeframe
              <select value={tf} onChange={(e) => setTf(e.target.value)}>
                <option value="">Detect from timestamps</option>
                {Object.keys(CSV_MINUTES).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Date order
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value as typeof order)}
              >
                <option value="YMD">Year / month / day (ISO, MT5)</option>
                <option value="DMY">Day / month / year</option>
                <option value="MDY">Month / day / year</option>
              </select>
            </label>
            <label>
              UTC offset for times without a zone
              <select
                value={offset}
                onChange={(e) => setOffset(+e.target.value)}
              >
                {[-720, -480, -300, 0, 120, 180, 420, 480, 540, 840].map(
                  (x) => (
                    <option key={x} value={x}>
                      UTC{x >= 0 ? "+" : "−"}
                      {Math.abs(x) / 60}:00
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Price columns
              <select
                value={basis}
                onChange={(e) => setBasis(e.target.value as typeof basis)}
              >
                <option value="UNKNOWN">Detect OHLC column family</option>
                <option value="BID">Bid OHLC</option>
                <option value="ASK">Ask OHLC</option>
                <option value="MID">OHLC declared as mid</option>
              </select>
            </label>
          </div>
          <p id={id + "-help"}>
            Up to 32 MB / 250,000 rows. Comma, tab, semicolon and pipe; MT5
            split date/time; ISO and epoch timestamps. No price repair, forward
            fill or silent truncation. Explicit timestamp offsets take
            precedence.
          </p>
          <button disabled={busy || !file} type="submit">
            {busy ? "Validating and saving…" : "Validate and save locally"}
          </button>
        </form>
        <p id={id + "-error"} role="alert">
          {explainResearchError(error)}
        </p>
        {saved && (
          <section className="csv-import-result" role="status">
            <h3>Dataset saved</h3>
            <p>
              {saved.symbol} · {saved.tf} · {saved.bars.toLocaleString()} bars ·{" "}
              {saved.from} → {saved.to} UTC
            </p>
            <ul>
              {saved.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="csv-import-preview">
              <table>
                <caption>First and last imported rows</caption>
                <thead>
                  <tr>
                    <th>UTC time</th>
                    <th>Open</th>
                    <th>High</th>
                    <th>Low</th>
                    <th>Close</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.preview.map((b, i) => (
                    <tr key={i}>
                      <td>{b.t}</td>
                      <td>{b.o}</td>
                      <td>{b.h}</td>
                      <td>{b.l}</td>
                      <td>{b.c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => open(saved)}>
              {openLabel}
            </button>
          </section>
        )}
      </div>
    </details>
  );
}
