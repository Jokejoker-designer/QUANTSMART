// Compact, self-healing CSV → OhlcBar[] parser (delimiter / header / column / time auto-detect).
// Supports standard single-timestamp CSVs, MetaTrader 4/5 two-column (<DATE> + <TIME>) exports,
// semicolon/tab/comma/pipe delimiters, headerless OHLC rows, and large multi-megabyte files.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

const DELIMS = [",", ";", "\t", "|"];
const HINT: Record<string, string[]> = {
  date: ["date", "day"],
  timeOnly: ["time"],
  datetime: ["datetime", "timestamp", "gmt", "ts", "time", "date"],
  open: ["open", "o", "bid_open", "first"],
  high: ["high", "h", "max"],
  low: ["low", "l", "min"],
  close: ["close", "c", "last", "price"],
};
const TF: [number, string][] = [
  [60, "M1"],
  [300, "M5"],
  [900, "M15"],
  [1800, "M30"],
  [3600, "H1"],
  [14400, "H4"],
  [86400, "D1"],
];

function parseTime(s: string): number {
  const t = (s || "").replace(/^["']|["']$/g, "").trim();
  if (!t) return NaN;
  if (/^\d{10}$/.test(t)) return +t * 1000;
  if (/^\d{13}$/.test(t)) return +t;
  // Normalize YYYY.MM.DD or DD.MM.YYYY -> YYYY-MM-DD
  let norm = t.replace(/\./g, "-").replace(/\//g, "-");
  norm = norm.replace(/^(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1");
  // Ensure HH:mm has :ss if needed for ISO parsing
  const iso = norm.replace(/\s+/, "T");
  const withZ = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z";
  const d = Date.parse(withZ);
  if (!isNaN(d)) return d;
  const fallback = Date.parse(norm.replace(" ", "T"));
  return isNaN(fallback) ? Date.parse(t) : fallback;
}

export type CsvResult = { bars: OhlcBar[]; tf: string; warnings: string[] } | { error: string };

export function parseCsvOhlc(text: string): CsvResult {
  try {
    if (!text || !text.trim()) return { error: "CSV file is empty." };

    // Fast tail-slice for huge multi-hundred-MB files while preserving header row
    let workingText = text;
    const MAX_CHARS = 12_000_000;
    if (workingText.length > MAX_CHARS) {
      const firstNl = workingText.indexOf("\n");
      const headLine = firstNl > 0 ? workingText.slice(0, firstNl) : "";
      const tailStart = workingText.indexOf("\n", workingText.length - MAX_CHARS);
      workingText = headLine + "\n" + (tailStart > 0 ? workingText.slice(tailStart + 1) : workingText.slice(-MAX_CHARS));
    }

    const allLines = workingText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((l) => l.trim());
    if (allLines.length < 5) return { error: "CSV has too few rows (minimum 5 OHLC bars required)." };

    const delimiter = DELIMS.map((d) => [d, allLines[0].split(d).length - 1] as [string, number]).sort((a, b) => b[1] - a[1])[0][0];
    const split = (l: string) => l.split(delimiter).map((c) => c.replace(/^["']|["']$/g, "").trim());
    const head = split(allLines[0]);
    const cleanHeaderToken = (c: string) => c.replace(/[<>[\]()]/g, "").trim().toLowerCase();

    const numericCellsInFirstRow = head.filter((c) => !isNaN(parseFloat(c)) && c !== "" && !/^\d{4}[./-]\d{2}[./-]\d{2}/.test(c) && !/^\d{2}:\d{2}/.test(c)).length;
    const hasHeader = numericCellsInFirstRow <= Math.max(1, Math.floor(head.length / 4));
    const cols = hasHeader ? head.map(cleanHeaderToken) : head.map((_, i) => `col${i}`);

    let body = hasHeader ? allLines.slice(1) : allLines;
    if (body.length > 80000) body = body.slice(-80000);
    const rows = body.map(split);

    let ti: number | undefined;
    let dateIdx: number | undefined;
    let timeOnlyIdx: number | undefined;
    let oi: number | undefined;
    let hi: number | undefined;
    let li: number | undefined;
    let ci: number | undefined;

    if (hasHeader) {
      const used = new Set<number>();
      // Check if separate date + time columns exist (e.g. MT4/MT5 <DATE> and <TIME>)
      const dCol = cols.findIndex((c) => HINT.date.includes(c));
      const tCol = cols.findIndex((c, idx) => idx !== dCol && HINT.timeOnly.includes(c));
      if (dCol >= 0 && tCol >= 0) {
        dateIdx = dCol;
        timeOnlyIdx = tCol;
        used.add(dCol);
        used.add(tCol);
      } else {
        for (let i = 0; i < cols.length; i++) {
          if (HINT.datetime.some((h) => cols[i] === h || (h.length > 2 && cols[i].includes(h)))) {
            ti = i;
            used.add(i);
            break;
          }
        }
      }

      const matchCol = (hints: string[]): number | undefined => {
        for (let i = 0; i < cols.length; i++) {
          if (used.has(i)) continue;
          if (hints.some((h) => cols[i] === h || (h.length > 1 && cols[i].includes(h)))) {
            used.add(i);
            return i;
          }
        }
        return undefined;
      };

      oi = matchCol(HINT.open);
      hi = matchCol(HINT.high);
      li = matchCol(HINT.low);
      ci = matchCol(HINT.close);
    } else if (rows.length > 0) {
      // Headerless CSV auto-detection
      const r0 = rows[0];
      if (r0.length >= 6 && /^\d{2}:\d{2}/.test(r0[1] || "") && !isNaN(parseTime(`${r0[0]} ${r0[1]}`))) {
        dateIdx = 0;
        timeOnlyIdx = 1;
        oi = 2;
        hi = 3;
        li = 4;
        ci = 5;
      } else if (r0.length >= 5 && !isNaN(parseTime(r0[0]))) {
        ti = 0;
        oi = 1;
        hi = 2;
        li = 3;
        ci = 4;
      }
    }

    const hasTime = (dateIdx !== undefined && timeOnlyIdx !== undefined) || ti !== undefined;
    const miss: string[] = [];
    if (!hasTime) miss.push("time/date");
    if (oi === undefined) miss.push("open");
    if (hi === undefined) miss.push("high");
    if (li === undefined) miss.push("low");
    if (ci === undefined) miss.push("close");
    if (miss.length) return { error: `Missing required columns: ${miss.join(", ")}` };

    let dropped = 0;
    const raw: { t: number; o: number; h: number; l: number; c: number }[] = [];
    for (const r of rows) {
      const rawTimeStr = dateIdx !== undefined && timeOnlyIdx !== undefined ? `${r[dateIdx] || ""} ${r[timeOnlyIdx] || ""}` : r[ti!] || "";
      const t = parseTime(rawTimeStr);
      const o = parseFloat((r[oi!] || "").replace(",", "."));
      const h = parseFloat((r[hi!] || "").replace(",", "."));
      const lo = parseFloat((r[li!] || "").replace(",", "."));
      const c = parseFloat((r[ci!] || "").replace(",", "."));
      if (isNaN(t) || isNaN(o) || isNaN(h) || isNaN(lo) || isNaN(c) || o <= 0 || h <= 0 || lo <= 0 || c <= 0) {
        dropped++;
        continue;
      }
      raw.push({ t, o, h: Math.max(o, h, lo, c), l: Math.min(o, h, lo, c), c });
    }
    raw.sort((a, b) => a.t - b.t);
    const dedup = raw.filter((b, i) => i === 0 || b.t !== raw[i - 1].t);
    if (dedup.length < 5) return { error: `Only ${dedup.length} valid OHLC bars after cleaning.` };

    const deltas = dedup
      .slice(1)
      .map((b, i) => (b.t - dedup[i].t) / 1000)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    const med = deltas[Math.floor(deltas.length / 2)] || 0;
    const tf = TF.reduce((p, x) => (Math.abs(x[0] - med) < Math.abs(p[0] - med) ? x : p))[1];
    const bars: OhlcBar[] = dedup.slice(-50000).map((b, i) => ({
      i,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      r: "N",
      t: new Date(b.t).toISOString().slice(0, 19),
    }));
    const warnings: string[] = [];
    if (dropped) warnings.push(`Skipped ${dropped} malformed rows`);
    return { bars, tf, warnings };
  } catch (e: unknown) {
    return { error: "CSV parse error: " + (e instanceof Error ? e.message : String(e)) };
  }
}
