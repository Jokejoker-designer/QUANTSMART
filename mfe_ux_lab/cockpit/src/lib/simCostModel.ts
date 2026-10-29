// simCostModel — spread + commission + slippage in R, with seeded RNG (P0).
// All values PROVISIONAL until broker tick/spec calibration. Costs only ever reduce NET. No hiding.
import type { SimulatorCostConfig } from "./simConfig.ts";
import type { SymbolSpec } from "./symbolSpec.ts";
import { usdToPriceUnits } from "./symbolSpec.ts";
import { classifySession, newsWindow, parseBarTime, type Session } from "./simTimeframe.ts";

// P2: count broker-midnight (21:00 UTC = 00:00 GMT+3) crossings between fill and exit;
// Wednesday night ×3 (weekend value-date rollover). Also flag weekend-held (gap risk).
function epochMs(iso: string): number { const p = parseBarTime(iso); return p.ok ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) : NaN; }
export function countSwapNights(fillTime: string, exitTime: string, wedX3: boolean): { nights: number; weighted: number; weekendHeld: boolean } {
  const f = epochMs(fillTime), x = epochMs(exitTime); const DAY = 86400000;
  if (isNaN(f) || isNaN(x) || x <= f) return { nights: 0, weighted: 0, weekendHeld: false };
  const d0 = new Date(f); let b = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate(), 21, 0);
  if (b <= f) b += DAY;
  let nights = 0, weighted = 0, weekendHeld = false;
  for (; b <= x; b += DAY) { nights++; const dow = new Date(b).getUTCDay(); weighted += (wedX3 && dow === 3) ? 3 : 1; if (dow === 5 || dow === 6 || dow === 0) weekendHeld = true; }
  return { nights, weighted, weekendHeld };
}

// deterministic PRNG (mulberry32) — same seed ⇒ same slippage
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function sessionSpread(session: Session, news: boolean, cost: SimulatorCostConfig): number {
  const s = cost.spread;
  let base = session === "overlap" ? s.overlap : session === "asia" ? s.asia : session === "rollover" ? s.rollover : s.single;
  if (news) base *= s.newsMult;
  return base;
}

export interface TradeCostBreakdown {
  spreadCostR: number;
  commissionCostR: number;
  slippageCostR: number;
  swapCostR: number;           // P2: overnight financing
  totalCostR: number;
  costStatus: "PROVISIONAL" | "CALIBRATED" | "PARTIAL" | "NOT_AVAILABLE";
  warnings: string[];
  // raw price components (let analytics rescale into LOW/BASE/STRESS without re-running the sim)
  spreadCostPrice: number;
  commissionCostPrice: number;
  slippageCostPrice: number;
  swapCostPrice: number;
  swapNights: number;
  weekendHeld: boolean;
  riskPrice: number;
}

export interface CostInput {
  entryTime: string;
  exitTime: string;
  atr: number;
  riskPrice: number;           // SL distance in price (1R)
  isStopExit: boolean;
  dir: "BUY" | "SELL";         // P2: swap side
  cost: SimulatorCostConfig;
  spec: SymbolSpec;
  rng: () => number;
  scenarioMult?: number;       // spread+slippage multiplier (commission fixed)
}

export function computeTradeCost(inp: CostInput): TradeCostBreakdown {
  const warnings: string[] = [];
  const mult = inp.scenarioMult ?? 1;
  const tick = inp.spec.tickSize || 0.01;
  const risk = inp.riskPrice > 0 ? inp.riskPrice : tick;

  const pe = inp.entryTime.match(/[T ](\d{2}):(\d{2})/), px = inp.exitTime.match(/[T ](\d{2}):(\d{2})/);
  const entrySession = pe ? classifySession(+pe[1], +pe[2]) : "single";
  const exitSession = px ? classifySession(+px[1], +px[2]) : entrySession;
  const sEntry = sessionSpread(entrySession, newsWindow(inp.entryTime), inp.cost);
  const sExit = sessionSpread(exitSession, newsWindow(inp.exitTime), inp.cost);
  const spreadCostPrice = ((sEntry + sExit) / 2) * mult;      // one round-turn spread crossing

  const commissionCostPrice = usdToPriceUnits(inp.cost.commissionRT_per_lot_usd, inp.spec); // fixed (lot cancels in R)

  const sl = inp.cost.slippage;
  const entrySlip = (sl.baseTicks * tick + sl.atrK * inp.atr * inp.rng());
  const exitSlip = (sl.baseTicks * tick + sl.atrK * inp.atr * inp.rng()) + (inp.isStopExit ? sl.slPenaltyTicks * tick : 0);
  const slippageCostPrice = (entrySlip + exitSlip) * mult;

  // swap / overnight financing (P2): nights × per-night usd (negative = you pay) → price → R cost
  const sw = countSwapNights(inp.entryTime, inp.exitTime, inp.cost.swap.wedX3);
  const perNightUsd = inp.dir === "BUY" ? inp.cost.swap.longUsdPerLotNight : inp.cost.swap.shortUsdPerLotNight;
  const swapPnlUsd = sw.weighted * perNightUsd;                 // negative if you pay
  const swapCostPrice = -usdToPriceUnits(swapPnlUsd, inp.spec);  // positive cost when swapPnl negative

  const spreadCostR = spreadCostPrice / risk;
  const commissionCostR = commissionCostPrice / risk;
  const slippageCostR = slippageCostPrice / risk;
  const swapCostR = swapCostPrice / risk;
  const totalCostR = spreadCostR + commissionCostR + slippageCostR + swapCostR;

  let costStatus: TradeCostBreakdown["costStatus"] = "PROVISIONAL";
  if (inp.spec.source === "BROKER_SPEC" && inp.cost.spread.status === "CALIBRATED") costStatus = "CALIBRATED";
  else if (inp.spec.contractSize == null) { costStatus = "PARTIAL"; warnings.push("contractSize missing — commission conversion provisional."); }
  if (inp.cost.spread.status === "PROVISIONAL") warnings.push("Spread PROVISIONAL.");
  if (inp.cost.slippage.status === "PROVISIONAL") warnings.push("Slippage PROVISIONAL.");
  if (inp.cost.swap.status === "PROVISIONAL" && sw.weighted > 0) warnings.push("Swap PROVISIONAL.");

  return {
    spreadCostR, commissionCostR, slippageCostR, swapCostR, totalCostR, costStatus, warnings,
    spreadCostPrice, commissionCostPrice, slippageCostPrice, swapCostPrice, swapNights: sw.weighted, weekendHeld: sw.weekendHeld, riskPrice: risk,
  };
}

// rescale a stored breakdown into a cost scenario (commission + swap fixed; spread+slip scaled)
export function rescaleCostR(b: TradeCostBreakdown, mult: number): number {
  const r = b.riskPrice > 0 ? b.riskPrice : 1;
  return (b.spreadCostPrice * mult + b.slippageCostPrice * mult + b.commissionCostPrice + b.swapCostPrice) / r;
}
