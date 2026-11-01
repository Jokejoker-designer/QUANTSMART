import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { CsvOptions, CsvQuality } from "./csvOhlc.ts";
import { CSV_MAX_BYTES } from "./csvOhlc.ts";
import { runResearchJob } from "./researchJobs.ts";
export interface CsvImportMetadata {
  id: string;
  filename: string;
  symbol: string;
  tf: string;
  bars: number;
  from: string;
  to: string;
  decodedTextHash: string;
  normalizedHash: string;
  warnings: string[];
  quality: CsvQuality;
  preview: OhlcBar[];
}
export const CSV_SELECTED_KEY = "quantsmart-csv-selected";
export async function listCsvImports(): Promise<CsvImportMetadata[]> {
  const r = await fetch("/api/research/imports");
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "CSV_LIBRARY_UNAVAILABLE");
  return data.imports;
}
export function decodeCsvBytes(bytes: Uint8Array) {
  const encoding =
    bytes[0] === 255 && bytes[1] === 254
      ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255
        ? "utf-16be"
        : "utf-8";
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}
export async function importCsvFile(
  file: File,
  symbol: string,
  csvOptions: CsvOptions,
): Promise<CsvImportMetadata> {
  if (file.size > CSV_MAX_BYTES)
    throw new Error(
      "Choose a CSV up to 32 MB; split larger files. No rows will be truncated.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decodeCsvBytes(bytes);
  return runResearchJob<CsvImportMetadata>({
    kind: "csv_import",
    filename: file.name,
    symbol: symbol.toUpperCase(),
    text,
    csvOptions,
    storage: {},
  });
}
export function readCsvView(
  importId: string,
  timeframe: string,
  range?: { from: string; to: string },
  signal?: AbortSignal,
) {
  return runResearchJob<{ metadata: CsvImportMetadata; bars: OhlcBar[] }>(
    { kind: "csv_view", importId, timeframe, ...range, storage: {} },
    signal,
  );
}
