export function strategyCloseRule(input: {
  modules: string[];
  held: number;
  side: "BUY" | "SELL";
  price: number;
  entry: number;
  ema10: number;
  ema34: number;
  rsi: number;
  customClose: boolean;
}): string | null {
  const { modules, held, side, price, entry, ema10, ema34, rsi, customClose } =
    input;
  const r = side === "BUY" ? price - entry : entry - price;
  if (
    modules.includes("mr_exit") &&
    held >= 1 &&
    (side === "BUY" ? price >= ema10 : price <= ema10) &&
    r > 0
  )
    return "Mean-reversion exit";
  if (
    modules.includes("exit_weak") &&
    held >= 2 &&
    (side === "BUY" ? ema10 < ema34 || rsi < 42 : ema10 > ema34 || rsi > 58)
  )
    return "Weakness exit";
  if (held >= 28) return "28-bar timeout";
  return customClose ? "Custom exit rule" : null;
}
