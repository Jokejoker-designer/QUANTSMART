// strategyAtlas — WO-5. Map ONE card's real trades onto the MEASURED environment they actually occurred
// in. For every trade we read the EnvironmentFingerprint AT ENTRY (causal, WO-4) and bucket the NET R by
// regime / session / volatility / month. Suitability is MEASURED (not the heuristic taxonomy), and gated by
// sample size (guard #6: <30 INSUFFICIENT · 30–99 WEAK · ≥100 USABLE). A thin cell may NOT claim "fits".
// These cards have NO fitted params → the full run IS out-of-sample, so per-env aggregates are honest OOS.
// Pure · no engine re-run · advisory · "suitability ≠ promise".
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { RealisticBacktest } from "./realisticSimRun.ts";
import { environmentFingerprint, type EnvironmentFingerprint, type FingerprintOptions } from "./environmentFingerprint.ts";
import { SESSION_LABEL } from "./simTimeframe.ts";

export type EvidenceLevel = "INSUFFICIENT_SAMPLE" | "WEAK_EVIDENCE" | "USABLE_EVIDENCE";
export type EnvVerdict = "FITS" | "HOSTILE" | "NEUTRAL" | "INSUFFICIENT";
export type AtlasDimension = "regime" | "session" | "volatility" | "month";

export interface AtlasCell {
  key: string; dimension: AtlasDimension; envLabel: string;
  trades: number; netR: number; posFrac: number;
  evidence: EvidenceLevel; verdict: EnvVerdict;
}
export interface AtlasDimensionView { dimension: AtlasDimension; cells: AtlasCell[] }
export interface CardAtlas {
  card_id: string;
  totalTrades: number; bucketedTrades: number;   // bucketed = trades that mapped to a (post-warmup) fingerprint
  dimensions: AtlasDimensionView[];
  thresholds: { weak: number; usable: number };
  source: "measured"; note: string;
}

export interface AtlasOptions { cardId?: string; weak?: number; usable?: number; fingerprint?: FingerprintOptions }

const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DIMS: AtlasDimension[] = ["regime", "session", "volatility", "month"];

function dimKey(dim: AtlasDimension, fp: EnvironmentFingerprint): string {
  if (dim === "regime") return fp.regime;
  if (dim === "session") return fp.session;
  if (dim === "volatility") return fp.volatilityBucket;
  return MON[fp.month] || String(fp.month);
}
function dimLabel(dim: AtlasDimension, key: string): string {
  if (dim === "session") return SESSION_LABEL[key as keyof typeof SESSION_LABEL] || key;
  return key;
}

export function buildCardAtlas(designBars: OhlcBar[], bt: RealisticBacktest, opts: AtlasOptions = {}): CardAtlas {
  const weak = opts.weak ?? 30, usable = opts.usable ?? 100;
  const fps = environmentFingerprint(designBars, opts.fingerprint);
  const timeIndex = new Map<string, number>();
  designBars.forEach((b, i) => { const k = b.t.slice(0, 16); if (!timeIndex.has(k)) timeIndex.set(k, i); });

  const trades = bt.sim?.trades ?? [];
  const enriched: { netR: number; fp: EnvironmentFingerprint }[] = [];
  for (const t of trades) {
    const idx = timeIndex.get(String(t.signal_time).slice(0, 16));
    const fp = idx != null ? fps[idx] : null;
    if (fp) enriched.push({ netR: t.netR, fp });
  }

  const dimensions: AtlasDimensionView[] = DIMS.map((dim) => {
    const groups = new Map<string, { netR: number; n: number; wins: number }>();
    for (const e of enriched) {
      const key = dimKey(dim, e.fp);
      const g = groups.get(key) ?? { netR: 0, n: 0, wins: 0 };
      g.netR += e.netR; g.n++; if (e.netR > 0) g.wins++;
      groups.set(key, g);
    }
    const cells: AtlasCell[] = [...groups.entries()].map(([key, g]) => {
      const evidence: EvidenceLevel = g.n >= usable ? "USABLE_EVIDENCE" : g.n >= weak ? "WEAK_EVIDENCE" : "INSUFFICIENT_SAMPLE";
      const posFrac = g.n ? g.wins / g.n : 0;
      const verdict: EnvVerdict = evidence === "INSUFFICIENT_SAMPLE" ? "INSUFFICIENT"
        : g.netR > 0 && posFrac >= 0.5 ? "FITS" : g.netR < 0 ? "HOSTILE" : "NEUTRAL";
      return { key, dimension: dim, envLabel: dimLabel(dim, key), trades: g.n, netR: +g.netR.toFixed(2), posFrac: +posFrac.toFixed(3), evidence, verdict };
    }).sort((a, b) => b.netR - a.netR);
    return { dimension: dim, cells };
  });

  return {
    card_id: opts.cardId || "card",
    totalTrades: trades.length, bucketedTrades: enriched.length,
    dimensions, thresholds: { weak, usable }, source: "measured",
    note: "MEASURED per-card NET R theo môi-trường tại-entry (fingerprint causal). Mẫu < " + weak + " = INSUFFICIENT (cấm claim 'hợp'); " + weak + "–" + (usable - 1) + " = WEAK; ≥ " + usable + " = USABLE. Card không fit-param → run đầy-đủ là OOS. Suitability ≠ lời-hứa · advisory · modeled.",
  };
}
