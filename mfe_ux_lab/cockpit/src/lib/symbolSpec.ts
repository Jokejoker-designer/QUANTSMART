// symbolSpec — broker contract specification (P-1 Truth Foundation).
// XAUUSD defaults are MANUAL_PROVISIONAL: percent-equity sizing is MODELED, not calibrated,
// until tickValue/contractSize are pulled from real broker symbol info.

export interface SymbolSpec {
  symbol: string;
  brokerSymbol?: string;
  assetClass: "FX" | "METAL" | "INDEX" | "CRYPTO" | "CFD" | "UNKNOWN";
  digits: number;
  point: number;
  tickSize: number;
  tickValue?: number;
  contractSize?: number;
  lotStep: number;
  minLot: number;
  maxLot?: number;
  profitCurrency: string;
  marginCurrency?: string;
  commissionModel: "PER_LOT_ROUND_TURN" | "PER_SIDE" | "SPREAD_ONLY" | "UNKNOWN";
  commissionRTPerLotUsd?: number;
  swapModel: "POINTS" | "USD_PER_LOT" | "PERCENT" | "UNKNOWN";
  source: "BROKER_SPEC" | "MANUAL_PROVISIONAL" | "MISSING" | "UNKNOWN";
}

// Gold standard contract: 100 oz/lot, quoted to 2 digits, $1 move = $100/lot.
export const XAUUSD_PROVISIONAL_SPEC: SymbolSpec = {
  symbol: "XAUUSD",
  brokerSymbol: "GOLD.i#",
  assetClass: "METAL",
  digits: 2,
  point: 0.01,
  tickSize: 0.01,
  tickValue: 1,          // USD per 0.01 price move per lot (= $100 per $1) — PROVISIONAL
  contractSize: 100,     // oz per lot
  lotStep: 0.01,
  minLot: 0.01,
  profitCurrency: "USD",
  commissionModel: "PER_LOT_ROUND_TURN",
  commissionRTPerLotUsd: 7,
  swapModel: "USD_PER_LOT",
  source: "MANUAL_PROVISIONAL",
};

export function getSymbolSpec(symbol: string): SymbolSpec {
  if (/XAU|GOLD/i.test(symbol)) return { ...XAUUSD_PROVISIONAL_SPEC, symbol };
  // FAIL‑CLOSED (F5): a non‑gold symbol with NO real broker spec must NOT inherit gold's digits/point/tickValue
  // (that silently mis‑prices EURUSD: 5 digits, point 0.00001, contract 100k). We return a MISSING spec whose
  // money‑math is BLOCKED. digits/point are NaN on purpose so any accidental P&L/sizing use surfaces, not lies.
  return {
    symbol, assetClass: "UNKNOWN", digits: NaN, point: NaN, tickSize: NaN,
    lotStep: NaN, minLot: NaN, profitCurrency: "USD",
    commissionModel: "UNKNOWN", swapModel: "UNKNOWN", source: "MISSING",
  };
}

// ── F5: money‑mode guard — WHAT may we conclude with this spec? ──
// REAL   = real broker spec pulled from MT5 → sizing/P&L trustworthy.
// MODELED= gold MANUAL_PROVISIONAL → research allowed, but P&L is modeled (flag it, don't sell it as real).
// BLOCKED= MISSING/UNKNOWN → research OHLC only; NO sizing / P&L / real‑money conclusion (owner's rule).
export type SpecMoneyMode = "REAL" | "MODELED" | "BLOCKED";
export function specMoneyMode(spec: SymbolSpec): SpecMoneyMode {
  if (spec.source === "BROKER_SPEC" && spec.tickValue != null && spec.contractSize != null) return "REAL";
  if (spec.source === "MANUAL_PROVISIONAL") return "MODELED";
  return "BLOCKED";
}
export function assertSpecUsableForMoney(spec: SymbolSpec): void {
  if (specMoneyMode(spec) === "BLOCKED") {
    throw new Error(`INSUFFICIENT_SPEC: ${spec.symbol} has no broker specification — research OHLC only, KHÔNG kết luận sizing/P&L. Connect MT5 or load a broker spec first.`);
  }
}

// Map the real MT5 /mt5/symbol_spec payload → a BROKER_SPEC SymbolSpec (the trustworthy path). Only fields the
// broker actually returned are used; if the core money fields are absent it stays MISSING (still fail‑closed).
export interface Mt5SpecRaw {
  symbol?: string; digits?: number; point?: number; trade_tick_size?: number; trade_tick_value?: number;
  trade_contract_size?: number; volume_min?: number; volume_step?: number; volume_max?: number;
  swap_long?: number; swap_short?: number;
}
export function assetClassOf(symbol: string): SymbolSpec["assetClass"] {
  const s = symbol.toUpperCase();
  if (/XAU|XAG|GOLD|SILVER/.test(s)) return "METAL";
  if (/BTC|ETH|USDT|USDC|SOL|XRP|DOGE/.test(s)) return "CRYPTO";
  if (/US30|US500|NAS|SPX|GER|UK100|JP225|DE40|INDEX/.test(s)) return "INDEX";
  if (/^[A-Z]{6}$/.test(s.replace(/[._#]/g, "")) && /USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD/.test(s)) return "FX";
  return "UNKNOWN";
}
export function mt5ToSymbolSpec(raw: Mt5SpecRaw, symbol: string): SymbolSpec {
  const hasMoney = raw.trade_tick_value != null && raw.trade_contract_size != null && raw.point != null && raw.digits != null;
  if (!hasMoney) return getSymbolSpec(symbol);   // broker didn't give money fields → stay fail‑closed
  return {
    symbol, brokerSymbol: raw.symbol, assetClass: assetClassOf(symbol),
    digits: raw.digits as number, point: raw.point as number,
    tickSize: raw.trade_tick_size ?? (raw.point as number),
    tickValue: raw.trade_tick_value, contractSize: raw.trade_contract_size,
    lotStep: raw.volume_step ?? 0.01, minLot: raw.volume_min ?? 0.01, maxLot: raw.volume_max,
    profitCurrency: "USD",
    commissionModel: "UNKNOWN", commissionRTPerLotUsd: undefined,
    swapModel: raw.swap_long != null || raw.swap_short != null ? "POINTS" : "UNKNOWN",
    source: "BROKER_SPEC",
  };
}
/** Resolve the best spec: real MT5 spec when available, else gold provisional, else MISSING fail‑closed. */
export function resolveSymbolSpec(symbol: string, mt5?: Mt5SpecRaw | null): SymbolSpec {
  if (mt5 && (mt5.trade_tick_value != null || mt5.trade_contract_size != null)) return mt5ToSymbolSpec(mt5, symbol);
  return getSymbolSpec(symbol);
}

// Bridge to the F0 per‑asset certification (assetLearning/contracts BrokerSpec) so a symbol's real spec can gate
// its certification tier consistently. NaN/absent fields stay absent → certification treats it as insufficient.
export function toBrokerSpec(spec: SymbolSpec): {
  digits?: number; point?: number; tick_size?: number; tick_value?: number; contract_size?: number;
  min_lot?: number; max_lot?: number; lot_step?: number; commission_rt_per_lot?: number;
  swap_long?: number; swap_short?: number; source: "BROKER_SPEC" | "MANUAL_PROVISIONAL" | "MISSING";
} {
  const fin = (v?: number) => (v != null && Number.isFinite(v) ? v : undefined);
  const source = spec.source === "BROKER_SPEC" ? "BROKER_SPEC" : spec.source === "MANUAL_PROVISIONAL" ? "MANUAL_PROVISIONAL" : "MISSING";
  return {
    digits: fin(spec.digits), point: fin(spec.point), tick_size: fin(spec.tickSize), tick_value: fin(spec.tickValue),
    contract_size: fin(spec.contractSize), min_lot: fin(spec.minLot), max_lot: fin(spec.maxLot), lot_step: fin(spec.lotStep),
    commission_rt_per_lot: fin(spec.commissionRTPerLotUsd), source,
  };
}

// percent-equity is only trustworthy when contract value is known
export function specSupportsCalibratedSizing(spec: SymbolSpec): boolean {
  return spec.tickValue != null && spec.contractSize != null && spec.source === "BROKER_SPEC";
}

export function specWarnings(spec: SymbolSpec): string[] {
  const w: string[] = [];
  if (spec.source !== "BROKER_SPEC") w.push("Symbol spec is " + spec.source + " — percent-equity sizing is MODELED, not calibrated.");
  if (spec.tickValue == null || spec.contractSize == null) w.push("tickValue/contractSize missing — P&L conversion is provisional.");
  return w;
}

// $ cost per lot → equivalent price units (so commission/swap can be expressed in price → R).
// price-PnL per lot per 1.0 price = contractSize * (tickValue/tickSize). For gold default = 100*(1/0.01)=10000? no:
// $1 price move = contractSize($/oz move) = 100 USD/lot. So priceEquiv(usd) = usd / (contractSize).
export function usdToPriceUnits(usd: number, spec: SymbolSpec): number {
  const cs = spec.contractSize || 100; // provisional fallback
  return usd / cs;
}
