// customModule — user-authored modules constrained to a per-level template (L0..L6). NOT free code:
// each module is a parameterized, explainable, validatable spec the engine can run safely. Conditions
// read a FIXED metric catalog (no arbitrary math, no lookahead). New modules are SHADOW until validated.
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Op = ">" | "<" | ">=" | "<=" | "==" | "between" | "outside";
export type Role =
  | "SAFETY_VETO" | "FEATURE" | "INDICATOR" | "ALGORITHM" | "CONTEXT_GATE" | "TRIGGER" | "VETO" | "CONFIRM" | "EXIT" | "ZONE";

export interface Condition { metric: string; op: Op; value: number; value2?: number }
export interface CustomModule {
  id: string; level: Level; role: Role; name: string;
  explain: string; why: string;                 // explainability gate (what + why)
  conditions: Condition[]; logic: "ALL" | "ANY";
  direction?: "LONG" | "SHORT" | "REGIME";       // TRIGGER
  weight?: number; reliability?: number;         // TRIGGER
  exitAction?: "CLOSE" | "BREAKEVEN" | "LOCK_SL";   // EXIT — LOCK_SL: siết SL về entry + lockR·risk (protective-only, không bao giờ nới)
  lockR?: number;                                    // LOCK_SL: khoá lãi tại +lockR R (mặc định 0.5)
  zoneRole?: "observation" | "risk" | "demand" | "invalidation"; zoneOffsetAtr?: number;   // ZONE
  status: "SHADOW";                              // never auto-promoted
  createdAt: string;
}

// ── metric catalog the conditions may read (entry-time + exit-time). type: num. cat = categorical 0/1 ──
export interface MetricDef { key: string; label: string; scope: "entry" | "exit" | "both"; unit: string; hint: string }
export const METRICS: MetricDef[] = [
  { key: "price", label: "Price", scope: "both", unit: "$", hint: "Current bar close" },
  { key: "rsi", label: "RSI(14)", scope: "both", unit: "", hint: "0-100" },
  { key: "regime", label: "Regime", scope: "both", unit: "-1/0/1", hint: "EMA10/EMA34 direction: negative, neutral or positive" },
  { key: "hour", label: "UTC hour", scope: "entry", unit: "0-23", hint: "Hour of the day" },
  { key: "overlap", label: "London/NY overlap", scope: "entry", unit: "0/1", hint: "One during the configured overlap session" },
  { key: "spread", label: "Modeled spread", scope: "entry", unit: "$", hint: "Session-dependent spread assumption" },
  { key: "atrPct", label: "ATR %", scope: "both", unit: "%", hint: "ATR divided by price, in percent" },
  { key: "atrRatio", label: "ATR / slow ATR", scope: "both", unit: "×", hint: "Above one indicates higher volatility relative to the baseline" },
  { key: "emaGapAtr", label: "EMA gap (×ATR)", scope: "both", unit: "×ATR", hint: "EMA10 minus EMA34, normalized by ATR" },
  { key: "priceEmaAtr", label: "Price distance from EMA10, in ATR", scope: "both", unit: "×ATR", hint: "Close minus EMA10, divided by ATR" },
  { key: "brokeHigh20", label: "Break above 20-bar high", scope: "entry", unit: "0/1", hint: "One when the close exceeds the prior 20-bar high" },
  { key: "brokeLow20", label: "Break below 20-bar low", scope: "entry", unit: "0/1", hint: "One when the close falls below the prior 20-bar low" },
  { key: "wickRatio", label: "Wick ratio", scope: "both", unit: "0-1", hint: "Wick length divided by current bar range" },
  { key: "bodyRatio", label: "Body ratio", scope: "both", unit: "0-1", hint: "Absolute body divided by current bar range" },
  { key: "voteCount", label: "Aligned vote count", scope: "entry", unit: "", hint: "Number of aligned source votes" },
  { key: "ddPct", label: "Current drawdown percent", scope: "entry", unit: "%", hint: "Drawdown from modeled peak equity, negative" },
  { key: "dayLosses", label: "Daily losing trades", scope: "entry", unit: "", hint: "Completed losing trades in the modeled day" },
  { key: "dayPnlR", label: "Daily result, R", scope: "entry", unit: "R", hint: "Sum of realized R in the modeled day" },
  { key: "barsSinceTrade", label: "Bars since previous trade", scope: "entry", unit: "", hint: "Elapsed bar count since the previous simulated trade" },
  { key: "flowConsistency", label: "Candle-direction consistency", scope: "entry", unit: "0-1", hint: "Body-direction consistency over eight recent bars" },
  { key: "htfAlign", label: "Higher-timeframe alignment", scope: "entry", unit: "-2..2", hint: "Completed 4x and 16x EMA structures: matching directions sum to positive or negative two" },
  { key: "pocDistAtr", label: "POC distance, ATR", scope: "entry", unit: "×ATR", hint: "Distance from the 96-bar price-occupancy concentration" },
  { key: "extAtr", label: "Extension beyond 20-bar level, ATR", scope: "entry", unit: "×ATR", hint: "Distance beyond the prior high or low; zero while within the range" },
  { key: "candleDir", label: "L1 candle pattern", scope: "entry", unit: "-1/0/1", hint: "Directional engulfing, hammer or pin-bar observation; sub-0.5 ATR bars are excluded" },
  { key: "candleAlign", label: "Candle direction versus vote", scope: "entry", unit: "-1/0/1", hint: "One when a directional candle observation agrees with the vote, negative one when opposing it" },
  { key: "heldBars", label: "Bars held", scope: "exit", unit: "", hint: "Age of the current simulated position" },
  { key: "rMultiple", label: "Unrealized R", scope: "exit", unit: "R", hint: "Current modeled position result in R" },
  { key: "maxR", label: "Maximum favorable R", scope: "exit", unit: "R", hint: "Peak unrealized result during the simulated position" },
];
export const metricsForScope = (s: "entry" | "exit") => METRICS.filter((m) => m.scope === s || m.scope === "both");

// ── per-level template registry: each level has ONE role-faithful shape ──
export interface LevelTemplate { level: Level; roles: Role[]; title: string; role_desc: string; scope: "entry" | "exit"; outputs: string; executable: boolean }
export const LEVEL_TEMPLATES: Record<Level, LevelTemplate> = {
  0: { level: 0, roles: ["SAFETY_VETO"], title: "L0 · Governance", role_desc: "Runs before the other modules. A true condition vetoes the simulated strategy.", scope: "entry", outputs: "veto-all", executable: true },
  1: { level: 1, roles: ["FEATURE"], title: "L1 · Features", role_desc: "Name an OHLC measurement to reference in conditions.", scope: "entry", outputs: "number (advisory)", executable: false },
  2: { level: 2, roles: ["INDICATOR"], title: "L2 · Indicators", role_desc: "Classify a measurement into a state, such as high, normal or low. Does not generate broker orders.", scope: "entry", outputs: "state (advisory)", executable: false },
  3: { level: 3, roles: ["ALGORITHM"], title: "L3 · Algorithms", role_desc: "Combine weighted measurements into a score or threshold. Does not place orders.", scope: "entry", outputs: "score (advisory)", executable: false },
  4: { level: 4, roles: ["CONTEXT_GATE"], title: "L4 · Context", role_desc: "Context condition: when false, prevents simulated entry.", scope: "entry", outputs: "gate (engine evaluated)", executable: true },
  5: { level: 5, roles: ["TRIGGER", "VETO", "CONFIRM", "EXIT"], title: "L5 · Logic", role_desc: "Strategy logic: TRIGGER creates a simulated entry vote; VETO rejects it; CONFIRM scales existing votes; EXIT closes a simulated position.", scope: "entry", outputs: "vote / veto / confirm-weight / exit (simulated)", executable: true },
  6: { level: 6, roles: ["ZONE"], title: "L6 · Zones", role_desc: "Output a reference zone for the chart: observation, risk, demand or invalidation. Does not place orders.", scope: "entry", outputs: "zone (advisory)", executable: false },
};
export const EXECUTABLE_ROLES: Role[] = ["SAFETY_VETO", "CONTEXT_GATE", "TRIGGER", "VETO", "CONFIRM", "EXIT"];

// ── validation + explainability gate ──
// allowedExtra = metric-key NGOÀI 29 catalog vẫn hợp-lệ vì resolve về một MODULE evidence đã build (block-native,
// [[block-is-fixed-foundation-doctrine]]). Default undefined → hành vi CŨ y hệt (chỉ 29 catalog) → regression-safe.
export function validateModule(m: Partial<CustomModule>, allowedExtra?: Set<string>): { ok: boolean; errors: string[] } {
  const e: string[] = [];
  if (!m.name || m.name.trim().length < 3) e.push("Name must contain at least 3 characters.");
  if (m.level == null || !(m.level in LEVEL_TEMPLATES)) e.push("Invalid level.");
  if (!m.role || (m.level != null && !LEVEL_TEMPLATES[m.level as Level].roles.includes(m.role))) e.push("Role does not match the level.");
  const condRoles: Role[] = ["SAFETY_VETO", "CONTEXT_GATE", "TRIGGER", "VETO", "CONFIRM", "EXIT"];
  if (m.role && condRoles.includes(m.role)) {
    if (!m.conditions || !m.conditions.length) e.push("At least one condition is required.");
    const scope = m.role === "EXIT" ? "exit" : "entry";
    const allowed = new Set(metricsForScope(scope).map((x) => x.key));
    if (allowedExtra) for (const k of allowedExtra) allowed.add(k);   // + metric block-native (id module evidence đã build)
    (m.conditions || []).forEach((c, i) => {
      if (!allowed.has(c.metric)) e.push(`Condition ${i + 1}: metric "${c.metric}" is unavailable at ${scope}.`);
      if (typeof c.value !== "number" || isNaN(c.value)) e.push(`Condition ${i + 1}: invalid value.`);
      if ((c.op === "between" || c.op === "outside") && (c.value2 == null || isNaN(c.value2))) e.push(`Condition ${i + 1}: a second value is required.`);
    });
  }
  if (m.role === "TRIGGER" && !m.direction) e.push("TRIGGER requires a direction (LONG/SHORT/REGIME).");
  if (m.role === "EXIT" && m.exitAction === "LOCK_SL" && (typeof m.lockR !== "number" || m.lockR < 0)) e.push("LOCK_SL requires lockR ≥ 0 to lock simulated profit at +lockR R.");
  // explainability gate
  if (!m.explain || m.explain.trim().length < 12) e.push("Explain what the module does in at least 12 characters.");
  if (!m.why || m.why.trim().length < 12) e.push("Explain why the module is appropriate in at least 12 characters.");
  return { ok: e.length === 0, errors: e };
}

// ── interpreter (engine-side): evaluate conditions over a metric context ──
export type Ctx = Record<string, number>;
function one(ctx: Ctx, c: Condition): boolean {
  const v = ctx[c.metric]; if (v == null || isNaN(v)) return false;
  switch (c.op) {
    case ">": return v > c.value; case "<": return v < c.value; case ">=": return v >= c.value; case "<=": return v <= c.value;
    case "==": return v === c.value;
    case "between": return v >= c.value && v <= (c.value2 ?? c.value);
    case "outside": return v < c.value || v > (c.value2 ?? c.value);
  }
}
export function condsMet(ctx: Ctx, m: CustomModule): boolean {
  if (!m.conditions.length) return false;
  return m.logic === "ANY" ? m.conditions.some((c) => one(ctx, c)) : m.conditions.every((c) => one(ctx, c));
}

export interface CustomVote { dir: number; w: number; rel: number }
// entry: returns whether to BLOCK + any trigger votes + a CONFIRM weight-boost (F3 — weight authority ONLY:
// a CONFIRM module can never push a vote; its boost is applied by the engine to EXISTING votes only).
export function evalEntryCustom(ctx: Ctx, mods: CustomModule[]): { blocked: boolean; reason: string; votes: CustomVote[]; confirmBoost: number } {
  let blocked = false; let reason = ""; const votes: CustomVote[] = []; let confirmBoost = 1;
  for (const m of mods) {
    if (m.role === "SAFETY_VETO" || m.role === "VETO") { if (condsMet(ctx, m)) { blocked = true; reason = m.name; } }
    else if (m.role === "CONTEXT_GATE") { if (!condsMet(ctx, m)) { blocked = true; reason = m.name + " (gate off)"; } }   // gate must be satisfied to allow
    else if (m.role === "TRIGGER") { if (condsMet(ctx, m)) { const d = m.direction === "SHORT" ? -1 : m.direction === "REGIME" ? Math.sign(ctx.regime || 0) : 1; if (d !== 0) votes.push({ dir: d, w: m.weight ?? 0.8, rel: m.reliability ?? 0.53 }); } }
    else if (m.role === "CONFIRM") { if (condsMet(ctx, m)) confirmBoost = +(confirmBoost * (m.weight ?? 1.25)).toFixed(4); }   // never a vote
  }
  return { blocked, reason, votes, confirmBoost };
}
// exit: returns close / move-to-breakeven / protective SL-lock (lockR = highest lock requested; engine applies
// PROTECTIVE-ONLY — SL chỉ được siết về phía lãi, không bao giờ nới)
export function evalExitCustom(ctx: Ctx, mods: CustomModule[]): { close: boolean; breakeven: boolean; lockR: number | null; reason: string } {
  let close = false, breakeven = false, reason = ""; let lockR: number | null = null;
  for (const m of mods) {
    if (m.role !== "EXIT" || !condsMet(ctx, m)) continue;
    if (m.exitAction === "BREAKEVEN") breakeven = true;
    else if (m.exitAction === "LOCK_SL") lockR = Math.max(lockR ?? 0, m.lockR ?? 0.5);
    else { close = true; reason = m.name; }
  }
  return { close, breakeven, lockR, reason };
}

// ── ready-made recipes (one-click) so users start from a working module, not a blank form ──
export const MODULE_PRESETS: { label: string; draft: Partial<CustomModule> }[] = [
  { label: "High-spread filter", draft: { level: 5, role: "VETO", name: "High-spread filter", conditions: [{ metric: "spread", op: ">", value: 0.4 }], logic: "ALL", explain: "Vetoes a modeled spread above 0.4", why: "Tests sensitivity to modeled execution costs" } },
  { label: "Stop after three daily losses", draft: { level: 5, role: "VETO", name: "Daily-loss breaker", conditions: [{ metric: "dayLosses", op: ">=", value: 3 }], logic: "ALL", explain: "Stops new simulated entries after three daily losses", why: "A research constraint on repeated daily losses" } },
  { label: "Pause below ten-percent drawdown", draft: { level: 5, role: "VETO", name: "Drawdown breaker", conditions: [{ metric: "ddPct", op: "<", value: -10 }], logic: "ALL", explain: "Pauses when modeled drawdown exceeds ten percent", why: "A modeled capital-protection constraint" } },
  { label: "Overlap-session filter", draft: { level: 4, role: "CONTEXT_GATE", name: "Overlap only", conditions: [{ metric: "overlap", op: "==", value: 1 }], logic: "ALL", explain: "Allows simulated entries only during the configured overlap", why: "Tests the configured liquidity and spread context" } },
  { label: "20-bar high breakout", draft: { level: 5, role: "TRIGGER", name: "Breakout long", conditions: [{ metric: "brokeHigh20", op: "==", value: 1 }], logic: "ALL", direction: "LONG", weight: 1, reliability: 0.55, explain: "Contributes a long candidate after a close above the prior 20-bar high", why: "A continuation hypothesis requiring out-of-sample validation" } },
  { label: "Break-even protection after +1R", draft: { level: 5, role: "EXIT", name: "Break-even +1R", conditions: [{ metric: "rMultiple", op: ">=", value: 1 }], logic: "ALL", exitAction: "BREAKEVEN", explain: "Moves the modeled protective stop to entry after +1R", why: "A protective-only rule; its effect requires measurement" } },
  { label: "Overbought filter", draft: { level: 5, role: "VETO", name: "Overbought filter", conditions: [{ metric: "rsi", op: ">", value: 78 }], logic: "ALL", explain: "Vetoes the configured long candidate when RSI exceeds 78", why: "Tests exclusion of extended momentum conditions" } },
  // ── F2: imports from the OLD QTQ/MFE systems, decomposed into BLOCKS per BLOCK_COMPOSITION_RULE (no monoliths) ──
  { label: "🦢 BlackSwan Guard (QTQ · block-composed)", draft: { level: 5, role: "VETO", name: "BlackSwan Guard", conditions: [{ metric: "atrRatio", op: ">", value: 1.8 }, { metric: "priceEmaAtr", op: "outside", value: -2.5, value2: 2.5 }], logic: "ANY", explain: "Vetoes ATR above 1.8 times baseline or EMA10 distance outside plus/minus 2.5 ATR", why: "Two measured context inputs, atrRatio and priceEmaAtr. The prior research result is not a guarantee in this Card" } },
  { label: "🪂 Smart Trailing (MFE · block-composed)", draft: { level: 5, role: "EXIT", name: "Smart Trailing (give-back)", conditions: [{ metric: "maxR", op: ">=", value: 1.0 }, { metric: "rMultiple", op: "<=", value: 0.4 }], logic: "ALL", exitAction: "CLOSE", explain: "Closes a simulated position after reaching +1R then giving back to +0.4R", why: "A give-back constraint built from maximum favorable R and current R" } },
  // ── F3: Trade-Management Lab imports (block-composed, SHADOW discipline tools — đo trên engine: CHƯA xác-nhận tăng expectancy; dùng vì kỷ-luật, không vì hứa lợi-nhuận) ──
  { label: "⏱ Time-Stop (Lab · block-composed)", draft: { level: 5, role: "EXIT", name: "Time-stop", conditions: [{ metric: "heldBars", op: ">=", value: 12 }, { metric: "rMultiple", op: "<=", value: 0.1 }], logic: "ALL", exitAction: "CLOSE", explain: "Closes after twelve bars while current result remains at or below +0.1R", why: "Previous train/held-out effects differed in sign; this remains an unconfirmed research constraint" } },
  { label: "🎯 Daily Profit Target (Lab · block-composed)", draft: { level: 5, role: "VETO", name: "Daily profit target", conditions: [{ metric: "dayPnlR", op: ">=", value: 2 }], logic: "ALL", explain: "Stops new simulated entries after a daily +2R result", why: "A daily-result constraint rather than an assumed performance improvement" } },
  // ── F3: đủ bộ block cho user tự tìm edge (đo của TA chưa thấy edge ≠ user không tìm được — mọi số đều tunable) ──
  { label: "🔍 Retest Quality (QTQ · CONFIRM)", draft: { level: 5, role: "CONFIRM", name: "Retest quality confirm", conditions: [{ metric: "priceEmaAtr", op: "between", value: -0.6, value2: 0.6 }, { metric: "wickRatio", op: "<", value: 0.6 }], logic: "ALL", weight: 1.25, explain: "Increases vote weight near EMA10 within 0.6 ATR, subject to candle-wick conditions", why: "Confirmation scales existing evidence; it does not create a candidate" } },
  { label: "🧬 Evidence Independence (MFE · CONFIRM)", draft: { level: 5, role: "CONFIRM", name: "Evidence independence confirm", conditions: [{ metric: "voteCount", op: ">=", value: 2 }], logic: "ALL", weight: 1.2, explain: "Increases weight when at least two source votes align", why: "Tests aligned evidence; the count alone does not prove independence" } },
  { label: "🕯 Candle Pattern Guard (MFE · block-composed)", draft: { level: 5, role: "VETO", name: "Dirty candle guard", conditions: [{ metric: "wickRatio", op: ">", value: 0.7 }], logic: "ALL", explain: "Vetoes an entry bar with wick ratio above seventy percent", why: "A candle-quality hypothesis requiring combined-strategy validation" } },
  { label: "🛡 Smart SL Lock (Lab · block-composed)", draft: { level: 5, role: "EXIT", name: "Smart SL lock +0.5R", conditions: [{ metric: "maxR", op: ">=", value: 1.5 }], logic: "ALL", exitAction: "LOCK_SL", lockR: 0.5, explain: "After +1.5R, tightens the modeled protective stop to +0.5R", why: "Protective-only simulated stop adjustment; it never widens a stop" } },
  { label: "Profit-lock T2, adverse prior evidence", draft: { level: 5, role: "EXIT", name: "Profit-lock level two", conditions: [{ metric: "maxR", op: ">=", value: 2 }, { metric: "rMultiple", op: "<=", value: 1.2 }], logic: "ALL", exitAction: "CLOSE", explain: "Closes after reaching +2R then giving back to +1.2R", why: "A discrete trailing approximation with adverse prior train and held-out effects. Validate any changed configuration separately" } },
  // ── F4: 6 candidate cuối cùng của Import ledger, rã thành block (đo bằng harness f4BlockImports — nhãn số là ĐO THẬT) ──
  { label: "☠️ Danger Scale Guard (MFE · block-composed)", draft: { level: 5, role: "VETO", name: "Danger scale guard", conditions: [{ metric: "atrRatio", op: ">", value: 2.2 }, { metric: "wickRatio", op: ">", value: 0.85 }, { metric: "priceEmaAtr", op: "outside", value: -3, value2: 3 }], logic: "ANY", explain: "Vetoes ATR above 2.2 times baseline, wick ratio above 85%, or EMA10 distance outside plus/minus 3 ATR", why: "A composite risk constraint. Prior measurements reduced expectancy for the tested trend attacker; it is not an expectancy booster" } },
  { label: "🎼 CF-Rhythm Confirm (QTQ · CONFIRM)", draft: { level: 5, role: "CONFIRM", name: "CF-rhythm confirm", conditions: [{ metric: "flowConsistency", op: ">=", value: 0.75 }], logic: "ALL", weight: 1.2, explain: "Increases vote weight when at least 75% of the last eight candle bodies share direction", why: "Weight scaling may be inert in a single-trigger Card; inspect its measured contribution" } },
  { label: "🧭 MTF Agreement Gate (QTQ · block-composed)", draft: { level: 4, role: "CONTEXT_GATE", name: "MTF agreement gate", conditions: [{ metric: "htfAlign", op: "outside", value: -0.5, value2: 0.5 }], logic: "ALL", explain: "Requires resolved, nonconflicting structure in both completed higher-timeframe buckets", why: "A higher-timeframe context hypothesis with prior supporting observations; combined-strategy validation is still required" } },
  { label: "🎯 Price Concentration Gate (MFE · block-composed)", draft: { level: 4, role: "CONTEXT_GATE", name: "Price concentration gate", conditions: [{ metric: "pocDistAtr", op: ">", value: 0.5 }], logic: "ALL", explain: "Requires price to be more than 0.5 ATR from the 96-bar POC", why: "Previous train and held-out effects did not agree. POC distance is not proven to improve this strategy" } },
  { label: "🪜 TP-Trailing Stop Ladder (Lab · protective-only)", draft: { level: 5, role: "EXIT", name: "TP-trailing stop ladder", conditions: [{ metric: "maxR", op: ">=", value: 2 }], logic: "ALL", exitAction: "LOCK_SL", lockR: 1.0, explain: "After +2R, tightens the modeled protective stop to +1R", why: "Protective-only stop ladder. Prior training and held-out effects differed in sign" } },
  { label: "💰 RR Cost Guard (Lab · block-composed)", draft: { level: 5, role: "VETO", name: "RR cost guard", conditions: [{ metric: "atrPct", op: "<", value: 0.04 }], logic: "ALL", explain: "Vetoes ATR below 0.04% of price", why: "A cost-discipline constraint that had no events on the prior gold sample. Check applicability to this asset and timeframe" } },
  // ── F5: Break & Retest family (owner 2026-07-03) — anti-chase + bộ nhận diện nến L1 làm block ──
  { label: "🎣 No-Chase Guard (owner · anti-FOMO breakout)", draft: { level: 5, role: "VETO", name: "No-chase guard", conditions: [{ metric: "extAtr", op: ">", value: 0.8 }], logic: "ALL", explain: "Vetoes extension beyond a prior 20-bar level by more than 0.8 ATR", why: "A location filter, not a retest prediction. Strong moves without retests can be missed" } },
  { label: "🕯️ Candle Rejection Confirm (L1 · block-composed)", draft: { level: 5, role: "CONFIRM", name: "Candle rejection confirm", conditions: [{ metric: "candleAlign", op: "==", value: 1 }], logic: "ALL", weight: 1.2, explain: "Increases vote weight when a candle rejection pattern agrees with the candidate direction", why: "Candle context confirmation cannot create a setup. Validate its effect within the combined Card" } },
  { label: "🚫🕯️ Candle-Against Veto (L1 · block-composed)", draft: { level: 5, role: "VETO", name: "Candle-against veto", conditions: [{ metric: "candleAlign", op: "==", value: -1 }], logic: "ALL", explain: "Vetoes a candle rejection pattern opposing the candidate direction", why: "A candle-context veto, built from candle direction and vote direction" } },
];

// Only the levels that ACTUALLY EXECUTE a user decision are createable. L1/L2/L3 (advisory feature/
// indicator/algorithm) + L0 (locked governance safety) + L6 (zone output) are NOT user-createable —
// they only collect text without affecting the backtest, so the builder hides them.
export const CREATABLE_LEVELS: Level[] = [4, 5];

const LS_KEY = "mfe_custom_modules";
export function loadCustomModules(): CustomModule[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } }
export function saveCustomModules(list: CustomModule[]) { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ } }
export function deleteCustomModule(id: string): CustomModule[] { const next = loadCustomModules().filter((m) => m.id !== id); saveCustomModules(next); return next; }
