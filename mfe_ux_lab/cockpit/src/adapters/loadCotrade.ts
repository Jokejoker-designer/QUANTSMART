// MORPHEUS · MFE X-Ray Lab — Co-Trade adapter (read-only, ADVISOR_ONLY).
// WO: MFE_TO_MORPHEUS_COTRADE_UI_WO_V1. ONE OBJECT RULE: every panel binds to the SINGLE
// `TradeAdvice` JSON (public/data/cotrade/tradeadvice_sample.json). The UI NEVER recomputes a number,
// a verdict, a probability, or a story — it renders what the object says. If a value isn't in the
// object, request it from MFE; do not derive it in React. No KIDI/CREM/PatternStore, no order path.

export interface Attention { level: string; text: string }
export interface MarketStory {
  headline?: string; primary_story?: string; preferred_playbook?: string; state?: string;
  next_trigger?: string[]; classic_story?: string[]; last_month_lesson?: string;
}
export interface AttentionBlock { top_3: Attention[]; one_playbook?: string; one_trigger?: string }
export interface HealthBar { label: string; pct: number; color: string; band: string; detail: string }
export interface TfRow {
  tf: string; trend: string; buy_pct: number; sell_pct: number;
  vol_regime_pct: number | null; danger_pct: number;
}
export interface Bias {
  side?: string; raw_votes?: string; independent_families?: number;
  echo_class?: string; usable_for_entry?: string;
}
export interface ScorecardRow {
  tf: string; style: string; win_rate: number; net_ev_r: number; echo_risk: string; status: string;
}
export interface StrategyCompass {
  preferred_mode?: string; avoid_modes?: string[]; current_playbook?: string;
  current_playbook_indicators?: string[]; timeframe_scorecard?: ScorecardRow[];
  trusted_indicator_families?: string[]; degraded_indicator_families?: string[];
}
export interface CalibrationBucket { predicted_prob_bucket: number; tp_atr: number; actual_win_rate: number; n: number; calibration_error: number }
export interface Calibration {
  buckets?: CalibrationBucket[]; brier_score?: number; mean_calibration_error?: number;
  advisor_confidence_adjustment?: number; trustworthy?: boolean; note?: string;
}
export interface Echo { echo_class?: string; regime?: string; reason?: string; confidence_adjustment?: string }
export interface Tp { name: string; price: number; rr?: number; reach_probability?: number; expectancy_R?: number }
export interface EntryAssessment {
  verdict?: string; reason?: string; market_view?: string; entry_verdict?: string;
  usable_for_entry?: string; cost_adjusted_expectancy_R?: number; no_trade_codes?: string[];
}
export interface FinalProbability {
  p_raw?: number; p_final?: number; regime?: string; calibration_status?: string;
  trend_calibration_mode?: string; permission?: string;
}
export interface Sizing {
  recommended_lot?: string; reference_lot?: number; max_loss_if_sl?: number; note?: string;
}
export interface Cost {
  gross_expectancy_R?: number; cost_adjusted_expectancy_R?: number; cost_R?: number; worth_after_cost?: boolean;
}
export interface NoTrade { codes?: string[]; hard_block?: boolean; message?: string }
export interface ConcZone { center: number; low: number; high: number; strength: number; width_atr: number; kind: string }
export interface Concentration { zones?: ConcZone[]; poc?: number; value_area_low?: number; value_area_high?: number; price_zone?: string }
export interface Indicators {
  tf?: string; price?: number; ema_fast?: number; ema_slow?: number; ema_stack?: string;
  rsi14?: number; rsi_state?: string; macd?: number; macd_signal?: number; macd_hist?: number;
  bb_upper?: number; bb_lower?: number; bb_pctb?: number; swing_high?: number; swing_low?: number;
  atr14?: number; fib?: Record<string, number>;
}
export interface ClassicFamily {
  atr?: { atr14?: number; percentile?: number; regime?: string };
  ema?: { ema20?: number; ema50?: number; ema200?: number; stack?: string; guard?: string; price_vs_ema50?: string };
  rsi?: { rsi14?: number; slope?: number; regime?: string; guard?: string };
  fib?: { nearest_level?: string; in_golden_zone?: boolean };
  compression?: { state?: string; bb_width_percentile?: number; keltner_squeeze?: boolean };
  macd?: { hist?: number; role?: string };
  liquidity?: { nearest_liquidity_above?: number; nearest_liquidity_below?: number };
}

// Only the keys the Command Center renders are typed; the rest stay as-is on the object (ONE OBJECT).
export interface TradeAdvice {
  as_of?: string; price?: number; mode?: string;
  danger_score?: number; danger_band?: string; danger_color?: string;
  headline?: string;
  market_story?: MarketStory;
  attention?: AttentionBlock;
  health_bars?: HealthBar[];
  bias?: Bias;
  tf_breakdown?: { main?: TfRow[] };
  strategy_compass?: StrategyCompass;
  entry_assessment?: EntryAssessment;
  trade_plan?: { direction?: string; entry?: number; stop_loss?: number; tps?: Tp[] };
  rr?: { targets?: Tp[]; direction?: string; stop_loss?: number; risk_per_unit?: number };
  sizing?: Sizing;
  cost?: Cost;
  no_trade?: NoTrade;
  indicators?: Indicators;
  concentration?: Concentration;
  classic_family?: ClassicFamily;
  sweep?: unknown; // not in V1 sample yet — Microscope shows NO_DATA until MFE drops it
  calibration?: Calibration;
  echo?: Echo;
  weekly_self_audit?: unknown; // WO §5 object — not dropped yet; Audit shows NO_DATA until MFE exports it
  final_probability?: FinalProbability;
  data_quality?: { reliable?: boolean; message?: string };
  live_reliability?: { status?: string };
  authority?: { tool_order_send?: string; advisor_only?: boolean };
  [k: string]: unknown; // ONE OBJECT: keep every other backend key intact, untouched
}

// Sample payloads are development fixtures, never a production data fallback.
export async function loadCotrade(): Promise<TradeAdvice | null> { return null; }

// evidence_provenance (WO §0 follow-up, DELIVERED) — per-number source/sample/calibration/regime for the
// "66% · n · calib · regime" badge. The UI shows the badge; it NEVER recomputes the number.
export interface ProvItem {
  value: number; source: string; sample_n: unknown; calibration_version: string;
  regime_calibration_status: string | null; basis?: string; as_of?: string;
}
let _prov: Promise<Record<string, ProvItem> | null> | null = null;
export function loadProvenance(): Promise<Record<string, ProvItem> | null> {
  if (!_prov) {
    _prov = (async () => {
      try {
        const r = await fetch("data/cotrade/provenance_sample.json", { cache: "force-cache" });
        if (!r.ok) return null;
        const d = await r.json();
        return (d?.items as Record<string, ProvItem>) ?? null;
      } catch {
        return null;
      }
    })();
  }
  return _prov;
}
