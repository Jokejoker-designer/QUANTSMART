// cardZones — turn a card's L6 ZONE modules (observation/confirmation/risk/invalidation/avoid) into ACTUAL
// chart geometry. Each zone is a price band anchored to the CURRENT structure (causal: swing range + ATR +
// EMA trend at the chosen bar). This is DESCRIPTIVE geometry ("where the strategy is watching"), NOT a
// prediction and NOT an order — advisory · zone-only. Previously the L6 modules were inert labels; now placing
// one actually draws its region on the Microscope chart.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { CChartZone } from "../components/CockpitChart.tsx";
import { valueAreaOf } from "./valueAreaProxy.ts";

const ZONE_IDS = ["observation_zone", "confirmation_zone", "risk_zone", "invalidation_zone", "avoid_zone", "dynamic_zone", "value_area_zone"] as const;
export function cardHasZones(modules: string[] | undefined): boolean {
  return Array.isArray(modules) && modules.some((m) => (ZONE_IDS as readonly string[]).includes(m));
}

// causal indicators evaluated at bar `i` (uses only bars ≤ i).
function emaAt(closes: number[], period: number, i: number): number {
  const k = 2 / (period + 1); let e = closes[0] ?? 0;
  for (let j = 1; j <= i; j++) e = closes[j] * k + e * (1 - k);
  return e;
}
function atrAt(bars: OhlcBar[], i: number, p = 14): number {
  let a = bars[0].h - bars[0].l;
  for (let j = 1; j <= i; j++) { const tr = Math.max(bars[j].h - bars[j].l, Math.abs(bars[j].h - bars[j - 1].c), Math.abs(bars[j].l - bars[j - 1].c)); a = (a * (p - 1) + tr) / p; }
  return a || (bars[i].h - bars[i].l) || 1;
}

export interface CardZoneOpts { atIndex?: number; lookback?: number }

// build the zones a card's L6 modules describe, as of `atIndex` (default last bar).
export function computeCardZones(bars: OhlcBar[] | null | undefined, modules: string[] | undefined, opts: CardZoneOpts = {}): CChartZone[] {
  if (!bars || bars.length < 40 || !cardHasZones(modules)) return [];
  const mods = modules!; const has = (id: string) => mods.includes(id);
  const i = Math.max(35, Math.min(opts.atIndex ?? bars.length - 1, bars.length - 1));
  const N = opts.lookback ?? 20;
  const closes = bars.map((b) => b.c);
  const atr = atrAt(bars, i), e10 = emaAt(closes, 10, i), e34 = emaAt(closes, 34, i);
  const up = e10 >= e34, dir = up ? 1 : -1;
  const w = bars.slice(Math.max(0, i - N + 1), i + 1);
  const hi = Math.max(...w.map((x) => x.h)), lo = Math.min(...w.map((x) => x.l));
  const band = (role: string, label: string, color: string, center: number, halfAtr: number): CChartZone => ({ role, label, color, lo: +(center - halfAtr * atr).toFixed(5), hi: +(center + halfAtr * atr).toFixed(5) });

  // dynamic_zone widens the protective bands when volatility (ATR vs its EMA) is elevated — DISPLAY only.
  const volMult = has("dynamic_zone") ? Math.min(1.8, Math.max(1, atr / (atrAt(bars, i, 100) || atr))) : 1;
  const z: CChartZone[] = [];
  // OBSERVATION — the pullback/retest level the strategy watches (toward EMA / edge of the range, against trend)
  if (has("observation_zone")) {
    const center = up ? Math.min(e10, lo + 0.6 * atr) : Math.max(e10, hi - 0.6 * atr);
    z.push(band("observation", "OBSERVATION · Pullback band", "#D9B65A", center, 0.45 * volMult));
  }
  // CONFIRMATION — the breakout/reclaim level in trend direction (thesis confirmed if price holds beyond)
  if (has("confirmation_zone")) {
    z.push(band("confirmation", "CONFIRMATION · Reclaim band", "#21D07A", up ? hi : lo, 0.3));
  }
  // RISK — the SL region just beyond structure against the trade
  if (has("risk_zone")) {
    z.push(band("risk", "RISK · Stop-loss band", "#FF4D4D", (up ? lo : hi) - dir * 0.4 * atr * volMult, 0.4 * volMult));
  }
  // INVALIDATION — the level that breaks the thesis (further beyond the swing)
  if (has("invalidation_zone")) {
    z.push(band("invalidation", "INVALIDATION · Structure break", "#9D5CFF", (up ? lo : hi) - dir * 1.2 * atr * volMult, 0.22));
  }
  // AVOID — the EMA-cluster chop region (no-mans-land)
  if (has("avoid_zone")) {
    const mid = (e10 + e34) / 2, halfGap = Math.max(0.25, Math.abs(e10 - e34) / atr / 2);
    z.push(band("avoid", "AVOID · Chop band", "#6b7d90", mid, halfGap));
  }
  // VALUE AREA — TPO price-histogram proxy (WO VALUE_AREA_PROXY_V1): VAH/VAL @70% quanh POC 96 nến.
  // DESCRIPTIVE_ONLY — vẽ "vùng giá được chấp nhận" để nhìn, KHÔNG code path nào đọc nó để vào lệnh.
  if (has("value_area_zone")) {
    const va = valueAreaOf(bars, i, atr);
    z.push({ role: "value_area", label: "VALUE AREA · 70% TPO proxy (VAL→VAH)", color: "#25B7FF", lo: +Math.min(va.val, va.vah).toFixed(5), hi: +Math.max(va.val, va.vah).toFixed(5) });
  }
  return z;
}
