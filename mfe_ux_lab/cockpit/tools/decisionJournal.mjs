// Read-only join over the canonical simulator's existing observations.
// This is not a structural-thesis lifecycle or a source of execution authority.
import { canonicalHash } from "./researchTrials.mjs";

const flags = {
  authority: "SHADOW_ONLY",
  decision: "NO_DECISION",
  live_apply_allowed: false,
};
const blocked = new Set([
  "SIGNAL_BLOCKED_COOLDOWN",
  "SIGNAL_BLOCKED_DAILY_CAP",
  "SIGNAL_BLOCKED_POSITION_OPEN",
]);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const missing = (field, reason) => ({ field, reason, fallbackUsed: false });
const utc = (time) => {
  const text = String(time);
  const ms = Date.parse(text + (/Z$|[+-]\d\d:?\d\d$/.test(text) ? "" : "Z"));
  if (!Number.isFinite(ms)) throw new Error("EVIDENCE_INVALID_TIME");
  return new Date(ms).toISOString();
};
const omitDescriptors = (value) =>
  Array.isArray(value)
    ? value.map(omitDescriptors)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(
              ([key]) =>
                ![
                  "name",
                  "explain",
                  "why",
                  "createdAt",
                  "updatedAt",
                  "status",
                  "validation",
                  "validationReport",
                  "validationReceipt",
                  "roles",
                  "authority",
                  "safety",
                  "astHash",
                ].includes(key),
            )
            .map(([key, v]) => [key, omitDescriptors(v)]),
        )
      : value;

export function definitionIdentity(card, storage = {}) {
  const rows = Object.entries(storage)
    .filter(([key]) => key.startsWith("mfe_custom_"))
    .flatMap(([, raw]) => {
      try {
        const value = JSON.parse(raw);
        return Array.isArray(value) ? value : [];
      } catch {
        throw new Error("EVIDENCE_INVALID_LIBRARY");
      }
    });
  const required = new Set(
    (card.modules || [])
      .map((id) => id.replace(/^myL[123456]_/, ""))
      .filter((id) => rows.some((row) => row.id === id)),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows.filter((row) => required.has(row.id))) {
      const walk = (value) => {
        if (
          typeof value === "string" &&
          rows.some((r) => r.id === value) &&
          !required.has(value)
        ) {
          required.add(value);
          changed = true;
        } else if (value && typeof value === "object")
          Object.values(value).forEach(walk);
      };
      walk(row);
    }
  }
  return canonicalHash({
    cardId: card.id,
    symbol: card.symbol,
    designTf: card.design_tf,
    executionTf: card.execution_tf || card.design_tf,
    modules: card.modules,
    definitions: rows
      .filter((row) => required.has(row.id))
      .map(omitDescriptors)
      .sort((a, b) => a.id.localeCompare(b.id)),
    coefficients: storage.mfe_coef_profile
      ? JSON.parse(storage.mfe_coef_profile)
      : null,
  });
}

export function completedBarExcursions(bars, trade) {
  const absent = [];
  if (
    !Number.isInteger(trade.entryI) ||
    !Number.isInteger(trade.exitI) ||
    trade.entryI < 0 ||
    trade.exitI < trade.entryI ||
    trade.exitI >= bars.length ||
    !finite(trade.entry_mid)
  )
    throw new Error("EVIDENCE_INVALID_TRADE_PATH");
  // Exit-bar OHLC can include prices after the modeled exit. Do not count it.
  const path = bars.slice(trade.entryI, trade.exitI);
  let favorable = null,
    adverse = null;
  if (path.length) {
    const sign = trade.dir === "BUY" ? 1 : -1;
    favorable = 0;
    adverse = 0;
    for (const b of path) {
      favorable = Math.max(
        favorable,
        sign * ((sign > 0 ? b.h : b.l) - trade.entry_mid),
      );
      adverse = Math.max(
        adverse,
        -sign * ((sign > 0 ? b.l : b.h) - trade.entry_mid),
      );
    }
  } else
    absent.push(
      missing(
        "completedBarExcursions",
        "No complete design bar exists before the exit bar.",
      ),
    );
  absent.push(
    missing(
      "mfeR",
      "Initial risk is not a structured field in the canonical trade result; it is not inferred from PnL or rounded log text.",
    ),
  );
  absent.push(
    missing(
      "maeR",
      "Initial risk is not a structured field in the canonical trade result.",
    ),
  );
  return {
    window: "COMPLETE_DESIGN_BARS_BEFORE_EXIT_BAR",
    bounds: "LOWER_BOUNDS_NOT_EXACT_PATH_EXTREMES",
    bars: path.length,
    maxFavorablePrice: favorable,
    maxAdversePrice: adverse,
    mfeR: null,
    maeR: null,
    missing: absent,
  };
}

export function buildDecisionJournal({
  bars,
  backtest,
  card,
  storage = {},
  source,
  engineHash,
}) {
  if (!Array.isArray(bars) || bars.length < 61 || bars.length > 5000)
    throw new Error("EVIDENCE_WINDOW_REQUIRES_61_TO_5000_BARS");
  if (!card || typeof card.id !== "string" || !Array.isArray(card.modules))
    throw new Error("EVIDENCE_CARD_REQUIRED");
  if (!source || typeof source.hash !== "string" || !source.hash)
    throw new Error("EVIDENCE_SOURCE_HASH_REQUIRED");
  if (
    backtest.designTf !== (card.design_tf || backtest.designTf) ||
    (card.execution_tf && card.execution_tf !== backtest.designTf) ||
    backtest.intrabar ||
    backtest.m1Master
  )
    throw new Error("EVIDENCE_DESIGN_BAR_MODE_ONLY");
  if (
    backtest.manifest.symbol !== source.symbol ||
    backtest.designTf !== source.timeframe
  )
    throw new Error("EVIDENCE_SOURCE_CONTEXT_MISMATCH");
  const definitionHash = definitionIdentity(card, storage),
    events = backtest.sim.events,
    trades = backtest.sim.trades;
  const byBar = new Map();
  for (const event of events) {
    const list = byBar.get(event.bar_index) || [];
    list.push(event);
    byBar.set(event.bar_index, list);
  }
  const bySignal = new Map();
  for (const trade of trades) {
    const key = utc(trade.signal_time) + "|" + trade.dir;
    if (bySignal.has(key)) throw new Error("EVIDENCE_AMBIGUOUS_TRADE_JOIN");
    bySignal.set(key, trade);
  }
  const joined = new Set(),
    records = [];
  for (const signal of events.filter(
    (event) => event.event_type === "SIGNAL_SEEN",
  )) {
    const match = /^(BUY|SELL) candidate$/.exec(signal.reason);
    if (!match) throw new Error("EVIDENCE_UNKNOWN_SIGNAL_GRAMMAR");
    const direction = match[1],
      signalTime = utc(signal.timestamp),
      key = signalTime + "|" + direction,
      trade = bySignal.get(key);
    const observationId =
      "obs_" +
      canonicalHash({
        policy: "SIGNAL_OBSERVATION_V1",
        definitionHash,
        symbol: source.symbol,
        timeframe: source.timeframe,
        direction,
        signalTime,
      });
    const observed = byBar.get(signal.bar_index) || [];
    const block = observed.find((event) => blocked.has(event.event_type));
    const fill = (byBar.get(signal.bar_index + 1) || []).find(
      (event) =>
        event.event_type === "FILL_MODELED" &&
        event.reason.startsWith(direction + " filled "),
    );
    const skipped = observed.find(
      (event) =>
        event.event_type === "DATA_WARNING" &&
        event.reason.includes("no next bar"),
    );
    if (trade && block) throw new Error("EVIDENCE_BLOCKED_TRADE_CONFLICT");
    if (trade && !fill) throw new Error("EVIDENCE_TRADE_WITHOUT_FILL");
    const status = trade
      ? "CLOSED_MODELED"
      : block
        ? "POLICY_BLOCKED"
        : fill
          ? "OPEN_AT_END"
          : skipped
            ? "UNFILLED_END_OF_DATA"
            : "NO_FILL_RECORDED";
    const trace = [
      signal,
      ...(block ? [block] : []),
      ...(fill ? [fill] : []),
      ...(skipped ? [skipped] : []),
    ].map((event, index) => ({
      id:
        "evt_" +
        canonicalHash({
          observationId,
          type: event.event_type,
          time: event.timestamp,
          index,
        }),
      type: event.event_type,
      at: utc(event.timestamp),
      barIndex: event.bar_index,
      reason: event.reason,
    }));
    const absent = [
      missing(
        "structuralSetupIdentity",
        "The simulator does not emit a canonical anchor, breakout origin and terminal thesis lineage. Signal observations are not structural setups.",
      ),
      missing(
        "preGateDecisionTrace",
        "Native pre-signal veto/abstain branches are not emitted by this event ledger.",
      ),
    ];
    let outcome = null;
    if (trade) {
      joined.add(key);
      if (!finite(trade.netR) || !finite(trade.grossR) || !finite(trade.costR))
        throw new Error("EVIDENCE_NONFINITE_OUTCOME");
      outcome = {
        tradeId: trade.trade_id,
        signalTime,
        fillTime: utc(trade.fill_time),
        exitTime: trade.exit_time ? utc(trade.exit_time) : null,
        entryIndex: trade.entryI,
        exitIndex: trade.exitI,
        netR: trade.netR,
        grossR: trade.grossR,
        costR: trade.costR,
        exitClassification: trade.intrabarOutcome,
        excursions: completedBarExcursions(bars, trade),
      };
      trace.push({
        id:
          "evt_" +
          canonicalHash({
            observationId,
            type: "TRADE_CLOSED",
            tradeId: trade.trade_id,
          }),
        type: "TRADE_CLOSED",
        at: trade.exit_time ? utc(trade.exit_time) : null,
        barIndex: trade.exitI,
        reason: trade.intrabarOutcome,
      });
    } else
      absent.push(
        missing(
          "simulatedOutcome",
          status === "OPEN_AT_END"
            ? "Position is right-censored at the end of this tape. No zero-return label is created."
            : "No completed trade is linked to this observation. No zero-return label is created.",
        ),
      );
    if (status === "NO_FILL_RECORDED")
      absent.push(
        missing(
          "noFillReason",
          "The canonical ledger does not expose the post-signal plan rejection reason.",
        ),
      );
    records.push({
      observationId,
      identityKind: "SIGNAL_OBSERVATION",
      signalTime,
      direction,
      barIndex: signal.bar_index,
      status,
      trace,
      outcome,
      missing: absent,
    });
  }
  const runId =
    "evidence_run_" +
    canonicalHash({
      sourceHash: source.hash,
      definitionHash,
      configHash: backtest.manifest.config_hash,
      engineHash,
      policy: "DECISION_JOURNAL_V1",
    });
  return {
    schema: "quantsmart.decision-journal/1",
    ...flags,
    scope: "OBSERVED_CANONICAL_SIGNALS_ONLY",
    structuralSetupLifecycle: "NOT_IMPLEMENTED",
    runId,
    definitionHash,
    engineHash,
    source: {
      ...source,
      from: bars[0].t,
      to: bars.at(-1).t,
      bars: bars.length,
    },
    configHash: backtest.manifest.config_hash,
    summary: {
      signals: records.length,
      closed: records.filter((r) => r.outcome).length,
      policyBlocked: records.filter((r) => r.status === "POLICY_BLOCKED")
        .length,
      openAtEnd: records.filter((r) => r.status === "OPEN_AT_END").length,
      noFill: records.filter(
        (r) =>
          r.status === "NO_FILL_RECORDED" ||
          r.status === "UNFILLED_END_OF_DATA",
      ).length,
      unjoinedTrades: trades.length - joined.size,
    },
    records,
    limitations: [
      "Observation IDs are stable signal identities, not canonical persistent structural-thesis IDs.",
      "Silent pre-gate vetoes and abstentions remain unobserved. Missing events are not reconstructed as facts.",
      "No-entry and open observations have null outcomes, not zero returns.",
      "Excursions exclude the exit bar and are lower bounds in price units. Exact MFE/MAE and normalized MFE/MAE R are unavailable.",
      "No convergence score, probability, adaptive confidence, promotion, risk adjustment or broker instruction is produced.",
    ],
  };
}
