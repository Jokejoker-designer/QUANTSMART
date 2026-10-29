// Presentation-only clock and candle position. No market inference or decision output.
export function displayClock(now: number, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" }).formatToParts(date);
  const part = (kind: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === kind)?.value || "00";
  const h = part("hour"), m = part("minute"), s = part("second");
  return { iso: date.toISOString(), localTime: `${h}:${m}`, utcTime: date.toISOString().slice(11, 19), zoneLabel: part("timeZoneName").replace("GMT", "UTC").replace(/^UTC[+-]0(?::00)?$/, "UTC"), localDayElapsed: (Number(h) * 3600 + Number(m) * 60 + Number(s)) / 86400 * 100 };
}
export function candlePosition(bar?: { c: number; h: number; l: number }): number | null {
  if (!bar || ![bar.c, bar.h, bar.l].every(Number.isFinite) || bar.h <= bar.l) return null;
  return Math.max(0, Math.min(100, (bar.c - bar.l) / (bar.h - bar.l) * 100));
}
