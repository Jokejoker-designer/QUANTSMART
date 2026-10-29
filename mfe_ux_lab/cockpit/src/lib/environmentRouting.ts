// environmentRouting — P3. Route the CURRENT measured environment → the card that fits it, by reading each card's
// MEASURED Atlas (WO-5) at the live environment fingerprint (WO-4). Pure scoring over an ALREADY-built Atlas +
// fingerprint — no engine re-run here (the caller backtests + builds the Atlas). Regime-primary, evidence-gated,
// advisory. "Fit ≠ promise": a card with an INSUFFICIENT regime sample CANNOT claim a fit (verdict INSUFFICIENT).
// Doctrine: this is a SELECTOR on top of the existing Beast coordination engine — never a second orchestrator.
import type { CardAtlas, AtlasCell, AtlasDimension } from "./strategyAtlas.ts";
import type { EnvironmentFingerprint } from "./environmentFingerprint.ts";

export type RouteVerdict = "GOOD_FIT" | "NEUTRAL" | "INSUFFICIENT" | "HOSTILE";

export interface CardRouteScore {
  card_id: string;
  score: number;                                   // ranking score: regime-weighted per-trade edge, evidence-discounted
  verdict: RouteVerdict;                            // led by the REGIME cell (the strongest fit axis)
  regimeCell?: AtlasCell; sessionCell?: AtlasCell; volCell?: AtlasCell;
  env: { regime: string; session: string; volatility: string };
  totalTrades: number;
  note: string;
}

// per-trade NET R of a cell (0 if empty) — comparable across cards with different trade counts
const cellEdge = (c?: AtlasCell): number => (c && c.trades > 0 ? c.netR / c.trades : 0);
// evidence discount — a thin sample contributes little (honest: <30 trades ≈ noise)
const evW = (c?: AtlasCell): number => (!c ? 0 : c.evidence === "USABLE_EVIDENCE" ? 1 : c.evidence === "WEAK_EVIDENCE" ? 0.6 : 0.2);

const findCell = (atlas: CardAtlas, dim: AtlasDimension, key: string): AtlasCell | undefined =>
  atlas.dimensions.find((d) => d.dimension === dim)?.cells.find((c) => c.key === key);

// Score ONE card's fit to the current environment fingerprint (regime 50% · volatility 30% · session 20%).
export function scoreCardFit(atlas: CardAtlas, fp: EnvironmentFingerprint): CardRouteScore {
  const regimeCell = findCell(atlas, "regime", fp.regime);
  const sessionCell = findCell(atlas, "session", fp.session);
  const volCell = findCell(atlas, "volatility", fp.volatilityBucket);
  const score = 0.5 * cellEdge(regimeCell) * evW(regimeCell)
    + 0.3 * cellEdge(volCell) * evW(volCell)
    + 0.2 * cellEdge(sessionCell) * evW(sessionCell);
  // verdict is REGIME-led (the dominant fit axis); an INSUFFICIENT/absent regime sample can NOT claim a fit
  const verdict: RouteVerdict = !regimeCell || regimeCell.evidence === "INSUFFICIENT_SAMPLE" ? "INSUFFICIENT"
    : regimeCell.verdict === "FITS" ? "GOOD_FIT"
    : regimeCell.verdict === "HOSTILE" ? "HOSTILE" : "NEUTRAL";
  const ev = regimeCell?.evidence === "USABLE_EVIDENCE" ? "Sufficient sample" : regimeCell?.evidence === "WEAK_EVIDENCE" ? "Weak sample" : "Insufficient sample";
  const note = !regimeCell ? `No observed trades in regime ${fp.regime}; insufficient evidence for routing.`
    : `Regime ${fp.regime}: ${regimeCell.trades} trades · ${regimeCell.netR >= 0 ? "+" : ""}${regimeCell.netR}R (${ev}). Measured advisory suitability is not a forecast.`;
  return { card_id: atlas.card_id, score: +score.toFixed(4), verdict, regimeCell, sessionCell, volCell, env: { regime: fp.regime, session: fp.session, volatility: fp.volatilityBucket }, totalTrades: atlas.totalTrades, note };
}

// Rank cards: GOOD_FIT first, then NEUTRAL, then INSUFFICIENT (early opportunity), HOSTILE last; ties broken by score.
const ORDER: Record<RouteVerdict, number> = { GOOD_FIT: 0, NEUTRAL: 1, INSUFFICIENT: 2, HOSTILE: 3 };
export function rankCardRoutes(scores: CardRouteScore[]): CardRouteScore[] {
  return [...scores].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || b.score - a.score);
}

// UX labels (controlled-optimism language: opportunity felt, win-rate never promised)
export const ROUTE_LABEL: Record<RouteVerdict, string> = {
  GOOD_FIT: "Observed fit", NEUTRAL: "Neutral", INSUFFICIENT: "Early indication; insufficient sample", HOSTILE: "Adverse observed environment",
};
export const ROUTE_COLOR: Record<RouteVerdict, string> = {
  GOOD_FIT: "#21D07A", NEUTRAL: "#9FB2C8", INSUFFICIENT: "#E3B341", HOSTILE: "#FF4D4D",
};
