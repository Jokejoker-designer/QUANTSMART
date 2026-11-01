// Immutable, owner-local evidence artifacts. Never a publication/performance receipt.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalHash } from "./researchTrials.mjs";
const ID = /^ev_[a-f0-9]{64}$/;
export function createDecisionEvidenceRepository(directory) {
  mkdirSync(directory, { recursive: true });
  const metadata = new Map();
  function read(id) {
    if (!ID.test(id)) throw new Error("EVIDENCE_INVALID_ID");
    const entry = JSON.parse(
      readFileSync(join(directory, id + ".json"), "utf8"),
    );
    if (entry.id !== id || "ev_" + canonicalHash(entry.report) !== id)
      throw new Error("EVIDENCE_INTEGRITY_FAILED");
    return entry;
  }
  function list() {
    const files = readdirSync(directory).filter((name) =>
      /^ev_[a-f0-9]{64}\.json$/.test(name),
    );
    return files
      .map((name) => {
        const stat = statSync(join(directory, name)),
          stamp = stat.mtimeMs + ":" + stat.size;
        const cached = metadata.get(name);
        if (cached?.stamp === stamp) return cached.value;
        const entry = read(name.slice(0, -5));
        const value = {
          id: entry.id,
          recordedAt: entry.recordedAt,
          cardId: entry.cardId,
          runId: entry.report.runId,
          source: entry.report.source,
          summary: entry.report.summary,
        };
        metadata.set(name, { stamp, value });
        return value;
      })
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }
  function save(report, cardId) {
    if (
      report.schema !== "quantsmart.decision-journal/1" ||
      report.authority !== "SHADOW_ONLY" ||
      report.live_apply_allowed !== false
    )
      throw new Error("EVIDENCE_INVALID_AUTHORITY");
    const id = "ev_" + canonicalHash(report),
      file = join(directory, id + ".json");
    try {
      const existing = read(id);
      return { id: existing.id, recordedAt: existing.recordedAt };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const files = readdirSync(directory).filter((name) =>
      name.endsWith(".json"),
    );
    if (
      files.length >= 100 ||
      files.reduce((n, name) => n + statSync(join(directory, name)).size, 0) >
        100 * 1024 * 1024
    )
      throw new Error("EVIDENCE_ARCHIVE_REQUIRED");
    const entry = {
        schema: 1,
        id,
        recordedAt: new Date().toISOString(),
        cardId,
        report,
      },
      text = JSON.stringify(entry);
    if (Buffer.byteLength(text) > 16 * 1024 * 1024)
      throw new Error("EVIDENCE_REPORT_TOO_LARGE");
    const temp = join(directory, "." + randomUUID() + ".tmp");
    try {
      writeFileSync(temp, text, { encoding: "utf8", flag: "wx", flush: true });
      renameSync(temp, file);
    } catch (error) {
      try {
        unlinkSync(temp);
      } catch {}
      throw error;
    }
    return { id, recordedAt: entry.recordedAt };
  }
  return { read, list, save };
}
