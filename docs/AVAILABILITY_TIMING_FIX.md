# Decision-time availability correction

Date: 4 November 2026. Reproduced baseline: `434ce00e436d41d4651b967f6c01eaa65657bf0a`.

## Findings and corrected behavior

Atlas previously joined `signal_time` to the opening timestamp of a candle. In design-close execution, that timestamp is the next candle's open. The joined fingerprint therefore included that candle's later high, low and close. Changing those future values could change the recorded entry environment.

Atlas now selects the latest design candle whose close boundary is at or before `signal_time`. The same rule handles exact boundaries, intrabar signal times and gaps without requiring an exact timestamp match. Invalid or pre-history signal times remain unbucketed. Source timestamps without an offset follow the existing UTC tape contract. Explicit offsets are parsed as instants. Invalid and non-increasing candle timelines are rejected.

Conductor previously combined `fps[t]` with a trade at `entryI=t`. It now routes at open(t) using the latest completed candle. The public `routePickAt` helper has the same fill-open semantics and accepts the declared timeframe, defaulting to M15 for its existing Conductor caller.

Price pivots retain their original symmetric high/low definition. Each has a confirmation index. Replay displays a pivot only after that confirming candle is revealed. The chart computes these pivots from its closed-candle input, before its separate forming-candle overlay is appended. Pivot tooltips identify the original and confirming candles.

## Research interpretation

Atlas groups are historical descriptive samples. Their thresholds do not establish an untouched holdout. Sequential fixed-configuration segments also require separate provenance before being called independent out-of-sample evidence.

Conductor reports positive or nonpositive routed sample results. Its UI displays the limits of selecting completed trades from independently simulated specialists. Shared position ownership, capital and portfolio execution are outside that experiment. Its result is not a qualification for automatic execution.

Previously generated Atlas groups and routing reports need recomputation. Their timing differs from the corrected calculations.

## Verification

Run:

```sh
node tests/availability-timing.test.mjs
npm run test:public
```

Six targeted cases cover future fill-candle mutation, complete-bar boundaries, explicit offsets, intrabar availability, gaps, invalid timestamps, warm-up and missing joins, pivot confirmation and the actual Conductor scheduling loop. The Conductor scheduling test holds training passports and specialist trades fixed to isolate its timing behavior.

The historical baseline reproduction is optional and requires Git history:

```sh
node tests/availability-timing.test.mjs --baseline
```

It is expected to fail against the pinned baseline. The tests fail on the old Atlas, old routing helper and old Conductor scheduling, then pass with the correction. The normal test lane uses the fixed source without requiring Git.

A local comparison used the same final 5,000 H1 and 40,000 M15 candles from the existing historical tapes. The complete H1 canonical simulation output was identical before and after the patch. Atlas joined 298 trades before the patch and 304 after it because completed-candle lookup also handles missing exact-open matches. The tested Conductor sample had no eligible routes before or after the correction. These local tapes' original broker lineage was not reverified, and this comparison establishes no predictive performance.
