// Owner-local imported OHLC datasets. Content addressed, immutable, never a public static asset.
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { canonicalHash } from "./researchTrials.mjs";
export const csvHash = (value) =>
  typeof value === "string"
    ? createHash("sha256").update(value).digest("hex")
    : canonicalHash(value);
export function readCsvDataset(directory, id) {
  if (!/^[a-f0-9]{64}$/.test(id || "")) throw new Error("INVALID_IMPORT_ID");
  const doc = JSON.parse(readFileSync(join(directory, id + ".json"), "utf8"));
  if (
    csvHash(doc.metadata) !== doc.metadataHash ||
    doc.metadata.id !== id ||
    csvHash({
      decodedTextHash: doc.metadata.decodedTextHash,
      symbol: doc.metadata.symbol,
      options: doc.metadata.csvOptions || {},
    }) !== id ||
    csvHash(doc.bars) !== doc.metadata.normalizedHash
  )
    throw new Error("CSV_STORED_HASH_MISMATCH");
  return doc;
}
export function createImportRepository(directory) {
  mkdirSync(directory, { recursive: true });
  const index = join(directory, "index.json");
  let list = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")) : [];
  const atomic = (file, value) => {
    const temp = file + "." + randomUUID() + ".tmp";
    writeFileSync(temp, JSON.stringify(value), "utf8");
    renameSync(temp, file);
  };
  return {
    list: () => list,
    save(request, parsed) {
      const decodedTextHash = csvHash(request.text),
        id = csvHash({
          decodedTextHash,
          symbol: request.symbol,
          options: request.csvOptions || {},
        });
      const normalizedHash = csvHash(parsed.bars);
      const previous = list.find((m) => m.id === id);
      if (previous) return previous;
      const metadata = {
        id,
        csvOptions: request.csvOptions || {},
        filename: request.filename,
        symbol: request.symbol,
        tf: parsed.tf,
        bars: parsed.bars.length,
        from: parsed.bars[0].t,
        to: parsed.bars.at(-1).t,
        decodedTextHash,
        normalizedHash,
        warnings: parsed.warnings,
        quality: parsed.quality,
        preview: [...parsed.bars.slice(0, 3), ...parsed.bars.slice(-3)],
        importedAt: new Date().toISOString(),
      };
      atomic(join(directory, id + ".json"), {
        metadata,
        metadataHash: csvHash(metadata),
        bars: parsed.bars,
      });
      list = [...list, metadata];
      atomic(index, list);
      return metadata;
    },
  };
}
