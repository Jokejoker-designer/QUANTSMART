// brokerCalibration — P4. Auto-fetch real broker contract spec from the signature_server when the MT5
// bridge is connected, and map it to a BrokerCalibrationInput. Offline → null → everything PROVISIONAL.
// MT5 symbol_info gives spec (tickValue/contractSize/digits) → percent-equity becomes CALIBRATED.
// Spread/commission/swap need a separate broker-doc feed (MANUAL_BROKER_DOC) — left provisional here.
import { mt5SymbolSpec, isOffline, liveSymbol, type Mt5SymbolSpec } from "./mt5DemoAdapter.ts";
import type { BrokerCalibrationInput } from "./simCalibration.ts";

export async function loadBrokerCalibration(symbol = "XAUUSD"): Promise<BrokerCalibrationInput | null> {
  const r = await mt5SymbolSpec(liveSymbol(symbol));
  if (isOffline(r) || !(r as Mt5SymbolSpec).ok) return null;
  const s = r as Mt5SymbolSpec;
  if (s.trade_tick_value == null || s.trade_contract_size == null) return null;   // no real spec → stay provisional
  return {
    source: "MT5_SYMBOL_INFO", symbol,
    digits: s.digits, point: s.point, tickSize: s.trade_tick_size,
    tickValue: s.trade_tick_value, contractSize: s.trade_contract_size,
    lotStep: s.volume_step, minLot: s.volume_min, maxLot: s.volume_max,
    hasTickBidAsk: false,                    // M1-bar feed, not raw tick → path stays APPROX
    brokerTimeOffsetHours: s.utc_offset_hours,
  };
}
