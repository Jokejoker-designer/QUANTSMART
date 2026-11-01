// Strict OHLC CSV reader shared by the isolated backend worker and public tests.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
export const CSV_MAX_BYTES = 32 * 1024 * 1024;
export const CSV_MAX_BARS = 250000;
export const CSV_MINUTES: Record<string, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
};
export interface CsvOptions {
  dateOrder?: "YMD" | "DMY" | "MDY";
  utcOffsetMinutes?: number;
  timeframe?: string;
  priceBasis?: "BID" | "ASK" | "MID" | "UNKNOWN";
}
export interface CsvQuality {
  inputRows: number;
  duplicatesRemoved: number;
  reordered: boolean;
  gapCount: number;
  missingIntervals: number;
  longestContinuous: { from: string; to: string; bars: number };
  delimiter: string;
  dateOrder: string;
  utcOffsetMinutes: number;
  priceBasis: "BID" | "ASK" | "MID" | "UNKNOWN";
}
export type CsvResult =
  | { bars: OhlcBar[]; tf: string; warnings: string[]; quality: CsvQuality }
  | { error: string };
const token = (s: string) =>
  s
    .replace(/^\uFEFF/, "")
    .replace(/[<>\[\]()\s_-]/g, "")
    .toLowerCase();
function delimiterOf(line: string) {
  let quoted = false;
  const counts = new Map([
    [",", 0],
    [";", 0],
    ["\t", 0],
    ["|", 0],
  ]);
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
function* records(
  text: string,
  delimiter: string,
): Generator<{ cells: string[]; line: number }> {
  let cells: string[] = [],
    value = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i] ?? "\n";
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        if (i === text.length)
          throw new Error(`Row ${start}: unclosed quoted field`);
        value += c;
        if (c === "\n") line++;
      }
      continue;
    }
    if (c === '"') {
      if (value.trim() || closed)
        throw new Error(`Row ${start}: unexpected quote`);
      quoted = true;
      value = "";
    } else if (c === delimiter) {
      cells.push(value.trim());
      value = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cells.push(value.trim());
      if (cells.some(Boolean)) yield { cells, line: start };
      cells = [];
      value = "";
      closed = false;
      line++;
      start = line;
    } else {
      if (closed && c.trim())
        throw new Error(`Row ${start}: text after closing quote`);
      value += c;
    }
  }
}
function timestamp(value: string, options: CsvOptions): number {
  const t = value.trim();
  if (/^\d{10}$|^\d{13}$|^\d{16}$|^\d{19}$/.test(t)) {
    const n = BigInt(t);
    return Number(
      t.length === 10
        ? n * 1000n
        : t.length === 13
          ? n
          : t.length === 16
            ? n / 1000n
            : n / 1000000n,
    );
  }
  const m = t.match(
    /^(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?)?(Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (!m)
    throw new Error(
      "unsupported timestamp; use ISO, epoch, or an explicit date order",
    );
  const order = m[1].length === 4 ? "YMD" : (options.dateOrder ?? "YMD");
  if (order === "YMD" && m[1].length !== 4)
    throw new Error("ambiguous date; select DMY or MDY");
  const year = +(order === "YMD" ? m[1] : m[3]),
    month = +(order === "MDY" ? m[1] : m[2]),
    day = +(order === "YMD" ? m[3] : order === "DMY" ? m[1] : m[2]);
  const hour = +(m[4] || 0),
    minute = +(m[5] || 0),
    second = +(m[6] || 0),
    ms = Math.floor(Number(m[7] || 0) * 1000);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, ms),
    check = new Date(utc);
  if (
    year < 1970 ||
    year > 2100 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw new Error("invalid calendar date/time");
  let offset = options.utcOffsetMinutes ?? 0;
  if (m[8]) {
    const z = m[8];
    if (z.toUpperCase() === "Z") offset = 0;
    else {
      const digits = z.slice(1).replace(":", "");
      const h = +digits.slice(0, 2),
        min = +digits.slice(2);
      if (h > 14 || min > 59 || (h === 14 && min !== 0))
        throw new Error("invalid timezone offset");
      offset = (z[0] === "-" ? -1 : 1) * (h * 60 + min);
    }
  }
  return utc - offset * 60000;
}
function price(s: string) {
  const value = s.replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
    throw new Error("invalid numeric price");
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error("prices must be finite and positive");
  return n;
}
export function parseCsvOhlc(
  text: string,
  options: CsvOptions = {},
): CsvResult {
  try {
    if (!text.trim()) throw new Error("CSV file is empty.");
    if (new TextEncoder().encode(text).byteLength > CSV_MAX_BYTES)
      throw new Error(
        "CSV exceeds 32 MB; split the file. No rows were imported.",
      );
    if (
      !["YMD", "DMY", "MDY"].includes(options.dateOrder ?? "YMD") ||
      !Number.isInteger(options.utcOffsetMinutes ?? 0) ||
      Math.abs(options.utcOffsetMinutes ?? 0) > 840
    )
      throw new Error("Invalid date/time options");
    if (
      !["BID", "ASK", "MID", "UNKNOWN"].includes(
        options.priceBasis ?? "UNKNOWN",
      )
    )
      throw new Error("Invalid price basis");
    if (
      options.timeframe &&
      !Object.prototype.hasOwnProperty.call(CSV_MINUTES, options.timeframe)
    )
      throw new Error("Unsupported source timeframe");
    const clean = text.replace(/^\uFEFF/, "");
    const delimiter = delimiterOf(clean.split(/\r?\n/, 1)[0]);
    const iterator = records(clean, delimiter);
    const first = iterator.next().value;
    if (!first) throw new Error("CSV file is empty.");
    const headers = first.cells.map(token);
    const hasHeader = headers.some((h: string) =>
      ["open", "bidopen", "askopen"].includes(h),
    );
    let ti = 0,
      di = -1,
      timeOnly = -1;
    let positions = [1, 2, 3, 4];
    let basis: CsvQuality["priceBasis"] = options.priceBasis ?? "UNKNOWN";
    if (hasHeader) {
      di = headers.indexOf("date");
      timeOnly = headers.indexOf("time");
      if (di >= 0 && timeOnly >= 0) {
        ti = -1;
      } else {
        di = -1;
        timeOnly = -1;
        ti = headers.findIndex((h: string) =>
          [
            "datetime",
            "timestamp",
            "time",
            "date",
            "opentime",
            "gmttime",
            "ts",
          ].includes(h),
        );
      }
      const prefix =
        options.priceBasis === "BID"
          ? "bid"
          : options.priceBasis === "ASK"
            ? "ask"
            : headers.includes("open")
              ? ""
              : headers.includes("bidopen")
                ? "bid"
                : headers.includes("askopen")
                  ? "ask"
                  : "";
      positions = ["open", "high", "low", "close"].map((k) =>
        headers.indexOf(prefix + k),
      );
      if ((ti < 0 && di < 0) || positions.some((i) => i < 0))
        throw new Error(
          "Missing time/open/high/low/close columns for the selected price basis",
        );
      if (prefix) basis = prefix === "bid" ? "BID" : "ASK";
    } else if (
      first.cells.length >= 6 &&
      /^\d{1,2}:\d{2}/.test(first.cells[1])
    ) {
      di = 0;
      timeOnly = 1;
      ti = -1;
      positions = [2, 3, 4, 5];
    }
    const raw: { ms: number; bar: OhlcBar; line: number }[] = [];
    const accept = ({ cells, line }: { cells: string[]; line: number }) => {
      if (raw.length >= CSV_MAX_BARS)
        throw new Error(
          `CSV exceeds ${CSV_MAX_BARS.toLocaleString()} rows; split the file. No truncation was performed.`,
        );
      try {
        const ms = timestamp(
          di >= 0 ? `${cells[di]} ${cells[timeOnly]}` : (cells[ti] ?? ""),
          options,
        );
        const [o, h, l, c] = positions.map((i) => price(cells[i] ?? ""));
        if (h < Math.max(o, c) || l > Math.min(o, c) || h < l)
          throw new Error("invalid OHLC geometry; prices were not repaired");
        if (!Number.isFinite(ms)) throw new Error("timestamp out of range");
        raw.push({
          ms,
          bar: {
            i: 0,
            t: new Date(ms).toISOString().slice(0, 19),
            o,
            h,
            l,
            c,
            r: "N",
          },
          line,
        });
      } catch (error) {
        throw new Error(
          `Row ${line}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    if (!hasHeader) accept(first);
    for (const row of iterator) accept(row);
    const inputRows = raw.length;
    const reordered = raw.some((b, i) => i > 0 && b.ms < raw[i - 1].ms);
    raw.sort((a, b) => a.ms - b.ms);
    const unique: typeof raw = [];
    let duplicatesRemoved = 0;
    for (const item of raw) {
      const previous = unique[unique.length - 1];
      if (previous?.ms === item.ms) {
        if (
          ["o", "h", "l", "c"].some(
            (k) => previous.bar[k as "o"] !== item.bar[k as "o"],
          )
        )
          throw new Error(
            `Row ${item.line}: conflicting prices for duplicate timestamp`,
          );
        duplicatesRemoved++;
      } else unique.push(item);
    }
    if (unique.length < 5)
      throw new Error("At least 5 distinct OHLC bars are required.");
    const counts = new Map<number, number>();
    for (let i = 1; i < unique.length; i++) {
      const d = (unique[i].ms - unique[i - 1].ms) / 60000;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const mostCommon = [...counts].sort(
      (a, b) => b[1] - a[1] || a[0] - b[0],
    )[0][0];
    const tf =
      options.timeframe ??
      Object.keys(CSV_MINUTES).find((k) => CSV_MINUTES[k] === mostCommon);
    if (!tf)
      throw new Error(
        "Cannot infer a supported timeframe; choose the source timeframe explicitly.",
      );
    const step = CSV_MINUTES[tf] * 60000;
    let gapCount = 0,
      missingIntervals = 0,
      start = 0,
      longest = { from: unique[0].bar.t, to: unique[0].bar.t, bars: 1 };
    for (let i = 0; i < unique.length; i++) {
      if (unique[i].ms % 60000 !== 0)
        throw new Error(
          `Row ${unique[i].line}: timestamp is not minute-aligned. Check source timeframe.`,
        );
      if (i > 0) {
        const d = unique[i].ms - unique[i - 1].ms;
        if (d < step || d % step)
          throw new Error("Rows do not match the selected source timeframe");
        if (d > step) {
          gapCount++;
          missingIntervals += d / step - 1;
          start = i;
        }
      }
      if (i - start + 1 > longest.bars)
        longest = {
          from: unique[start].bar.t,
          to: unique[i].bar.t,
          bars: i - start + 1,
        };
    }
    const warnings: string[] = [`${options.timeframe ? "Declared" : "Inferred"} source timeframe: ${tf}. Confirm that it matches the export.`];
    if (reordered) warnings.push("Rows were sorted chronologically.");
    if (duplicatesRemoved)
      warnings.push(
        `${duplicatesRemoved} identical duplicate rows were removed.`,
      );
    if (gapCount)
      warnings.push(
        `${gapCount} gaps; ${missingIntervals} unobserved intervals. No prices were filled in.`,
      );
    warnings.push(
      "Naive timestamps use the selected UTC offset. Price/cost provenance is not independently verified.",
    );
    return {
      bars: unique.map((x, i) => ({ ...x.bar, i })),
      tf,
      warnings,
      quality: {
        inputRows,
        duplicatesRemoved,
        reordered,
        gapCount,
        missingIntervals,
        longestContinuous: longest,
        delimiter,
        dateOrder: options.dateOrder ?? "YMD",
        utcOffsetMinutes: options.utcOffsetMinutes ?? 0,
        priceBasis: basis,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
