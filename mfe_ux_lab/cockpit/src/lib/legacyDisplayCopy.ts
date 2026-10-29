// Display translations for identified legacy archive copy. Stored artifacts and IDs
// stay byte-for-byte unchanged; this is never used for lookup, hashing or execution.
const LEGACY_DISPLAY_COPY: readonly (readonly [string, string])[] = [
  ["Môi trường (chop+dead+news)", "Environment (chop + dead hours + news)"],
  ["Chủ-yếu ĐỒNG-THỜI (vol-clustering): score cao vì vol đang cao; ít báo TRƯỚC hơn so với chỉ nhìn vol hiện-tại.", "Mostly coincident volatility clustering: the score rises with current volatility. It provides less advance warning than the current-volatility baseline."],
  ["path_quality GRIND: ổn-định ÂM (sign 0.82, median -0.03) — AVOID.", "path_quality GRIND: consistently negative in this archive (sign 0.82, median -0.03) — AVOID."],
  ["session DEAD_HOUR: ổn-định ÂM (sign 1.0, median -0.56) — AVOID.", "session DEAD_HOUR: consistently negative in this archive (sign 1.0, median -0.56) — AVOID."],
];
export function legacyDisplayCopy(value: string): string {
  return LEGACY_DISPLAY_COPY.reduce((text, [original, english]) => text.split(original).join(english), value);
}
