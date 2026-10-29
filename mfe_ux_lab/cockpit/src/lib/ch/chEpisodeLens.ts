// ch_episode_lens (CH Canvas module · L2 Indicators · CH_AUTH_1 · advisory/descriptive — NEVER a verdict).
// "The eyes of CH": shows the market as a sequence of SegmentEpisodes (the WO-1 vocabulary that PASSED the
// null-relative gate: era-stable + 32× distinct from a random walk). It is DESCRIPTIVE geometry, not a forecast.
//
// THE THREE HONESTY GUARDS (from the manager review):
//  1) REPAINT-SAFE: confirmed episodes (closing swing confirmed, asOf-correct) are the truth; the CURRENT
//     in-progress leg is returned SEPARATELY as `forming_leg` with confirmed=false ("đang hình-thành · có thể đổi").
//  2) CONTEXT-FROM-SEQUENCE: `episode_context` is derived from the confirmed swing sequence (HH/HL vs LH/LL),
//     NOT a new unvalidated "regime model" (the MTF/regime features were shown era-sensitive → not used).
//  3) HONEST LABELS: `vocabulary_label` is a friendly mapping of the validated kind; attributes are scale-free
//     descriptive geometry. No outcome %, no probability — that is the forbidden circular-prediction (CH-WO-4).
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Timeframe } from "../simConfig.ts";
import type { EpisodeKind, AsOfEpisode } from "./chTypes.ts";
import { buildSegmentEpisodes, atrCausal, classifyLeg, DEFAULT_BUILDER_CONFIG, type SegmentBuilderConfig } from "./segmentEpisodeBuilder.ts";
import { confirmedSwings, type ConfirmedSwing } from "./confirmedSwing.ts";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : +x.toFixed(4));

export interface EpisodeAttrs { range_atr: number; body_ratio: number; duration_bars: number; impulse_strength: number; pullback_depth: number | null }
export interface LensEpisode {
  episode_id: string; kind: EpisodeKind; direction_sign: -1 | 0 | 1;
  confirmed: boolean;              // false = the still-forming leg (can repaint) — never trust as final
  attrs: EpisodeAttrs; vocabulary_label: string;
}
export interface EpisodeLensOutput {
  authority: "CH_AUTH_1";
  active_episode: LensEpisode | null;   // most recent CONFIRMED episode (the current settled structure)
  forming_leg: LensEpisode | null;      // the in-progress leg — PROVISIONAL, confirmed=false
  recent_episodes: LensEpisode[];       // confirmed, oldest→newest
  episode_context: string;              // descriptive, derived from the confirmed swing sequence
  vocabulary_label: string;             // headline (forming if present, else active)
  note: string;
}

function vocabLabel(kind: EpisodeKind, dir: number): string {
  switch (kind) {
    case "IMPULSE": return dir >= 0 ? "Đà tăng mạnh" : "Đà giảm mạnh";
    case "CORRECTIVE": return "Hồi / điều-chỉnh";
    case "RANGE": return "Tích-luỹ · đi ngang";
    case "SWEEP_RECLAIM": return dir >= 0 ? "Quét đỉnh rồi thu lại" : "Quét đáy rồi thu lại";
    case "FAILED_BREAKOUT": return "Phá vỡ hụt";
    default: return "Chưa rõ cấu-trúc";
  }
}

// trend context purely from confirmed swings (HH/HL = up-sequence, LH/LL = down-sequence) — descriptive only.
function trendContext(swings: ConfirmedSwing[]): string {
  const highs = swings.filter((s) => s.kind === "high"), lows = swings.filter((s) => s.kind === "low");
  const hh = highs.length >= 2 && highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lh = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows.length >= 2 && lows[lows.length - 1].price < lows[lows.length - 2].price;
  if (hh && hl) return "Chuỗi tăng (higher-high + higher-low)";
  if (lh && ll) return "Chuỗi giảm (lower-high + lower-low)";
  return "Đi ngang · xu-hướng chưa rõ";
}

function toLens(ep: AsOfEpisode, prior: AsOfEpisode | null, bars: OhlcBar[]): LensEpisode {
  const ids = ep.trace.source_bar_ids, Ak = ids[0], Bk = ids[ids.length - 1];
  const span = Math.abs(bars[Bk].c - bars[Ak].c);
  let pullback: number | null = null;
  if (prior && prior.direction_sign !== 0 && ep.direction_sign === -prior.direction_sign) {
    const p = prior.trace.source_bar_ids, pSpan = Math.abs(bars[p[p.length - 1]].c - bars[p[0]].c);
    pullback = pSpan > 0 ? clamp01(span / pSpan) : null;   // retrace fraction of the prior leg
  }
  return {
    episode_id: ep.episode_id, kind: ep.kind, direction_sign: ep.direction_sign, confirmed: true,
    attrs: { range_atr: ep.range_atr, body_ratio: ep.body_ratio, duration_bars: ep.duration_bars, impulse_strength: clamp01(ep.range_atr / 3), pullback_depth: pullback },
    vocabulary_label: vocabLabel(ep.kind, ep.direction_sign),
  };
}

export interface EpisodeLensOpts { recentN?: number; cfg?: SegmentBuilderConfig }

export function chEpisodeLens(bars: OhlcBar[], tf: Timeframe, opts: EpisodeLensOpts = {}): EpisodeLensOutput {
  const cfg = opts.cfg ?? DEFAULT_BUILDER_CONFIG, recentN = opts.recentN ?? 6;
  const note = "Mô-tả cấu-trúc (CH_AUTH_1) · KHÔNG phải tín-hiệu/dự-báo · leg 'đang hình-thành' có thể đổi.";
  if (bars.length < 5) return { authority: "CH_AUTH_1", active_episode: null, forming_leg: null, recent_episodes: [], episode_context: "Chưa đủ nến", vocabulary_label: "—", note };

  const eps = buildSegmentEpisodes(bars, tf, cfg);                                   // CONFIRMED legs (asOf-correct)
  const swings = confirmedSwings(bars, cfg.swing).sort((a, b) => a.k - b.k || (a.kind < b.kind ? -1 : 1));
  const recent: LensEpisode[] = eps.slice(-recentN).map((e, i, arr) => toLens(e, i > 0 ? arr[i - 1] : (eps.length - arr.length > 0 ? eps[eps.length - arr.length - 1] : null), bars));
  const active = recent.length ? recent[recent.length - 1] : null;

  // forming leg: from the LAST confirmed swing to the current bar — PROVISIONAL (confirmed=false), can repaint.
  let forming: LensEpisode | null = null;
  const last = swings[swings.length - 1];
  if (last && last.k < bars.length - 1) {
    const atr = atrCausal(bars, cfg.atrPeriod), a0 = atr[last.k] || 1e-9, Bk = bars.length - 1;
    let hi = -Infinity, lo = Infinity, path = 0;
    for (let j = last.k; j <= Bk; j++) { hi = Math.max(hi, bars[j].h); lo = Math.min(lo, bars[j].l); if (j > last.k) path += Math.abs(bars[j].c - bars[j - 1].c); }
    const net = bars[Bk].c - bars[last.k].c, rangeAtr = +((hi - lo) / a0).toFixed(4);
    const bodyRatio = path > 0 ? clamp01(Math.abs(net) / path) : 0, dir: -1 | 0 | 1 = net > 0 ? 1 : net < 0 ? -1 : 0;
    // sweep context vs the prior same-kind level (opposite of the last swing's kind = the level being tested)
    const opp = last.kind === "high" ? "low" : "high";
    const priorOpp = [...swings].reverse().find((s) => s.kind === opp);
    let pierce: number | null = null, reclaimed = false;
    if (priorOpp) { pierce = +((dir >= 0 ? hi - priorOpp.price : priorOpp.price - lo) / a0).toFixed(4); reclaimed = dir >= 0 ? bars[Bk].c < priorOpp.price : bars[Bk].c > priorOpp.price; }
    const { kind } = classifyLeg(cfg.thresholds, rangeAtr, bodyRatio, pierce, reclaimed);
    forming = {
      episode_id: `${tf}-forming-${last.k}`, kind, direction_sign: dir, confirmed: false,
      attrs: { range_atr: rangeAtr, body_ratio: bodyRatio, duration_bars: Bk - last.k, impulse_strength: clamp01(rangeAtr / 3), pullback_depth: null },
      vocabulary_label: vocabLabel(kind, dir) + " (đang hình-thành · chưa xác-nhận)",
    };
  }

  const trend = trendContext(swings);
  const episode_context = active ? `${active.vocabulary_label} trong ${trend}` : trend;
  const headline = forming?.vocabulary_label ?? active?.vocabulary_label ?? "—";
  return { authority: "CH_AUTH_1", active_episode: active, forming_leg: forming, recent_episodes: recent, episode_context, vocabulary_label: headline, note };
}
