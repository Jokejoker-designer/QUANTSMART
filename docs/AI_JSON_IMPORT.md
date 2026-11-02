# AI prompts and JSON import contracts

Audit date: 2026-11-02. The supplied assessment was treated as a set of claims to test against the source, not as an authoritative specification or proof of performance.

## Use the correct import path

1. Copy the context pack for the layer you are building. Each pack includes the data boundary, exact IDs, accepted parameters, timing rules and validation protocol.
2. Ask for **one module at a time**. Paste raw JSON or exactly one fenced JSON block. A BOM is accepted. Prose, multiple fenced blocks and mixed `graph`/`ast`/`conditions` payloads are refused rather than partially imported.
3. Use the matching studio to inspect the definition before saving. The general Canvas JSON importer also accepts individual module definitions; a versioned Strategy library is a separate format for Cards plus their dependencies.
4. Build upstream definitions first. Use their saved IDs in downstream inputs; display names are not numeric series keys. A portable Strategy library can carry the definitions together and validates their dependencies atomically.
5. Saving creates a Shadow research definition. Imported status, safety claims and performance numbers do not establish a verified result. Run the measured experiment separately.

Text module parsing is bounded at 8 MiB characters; the Canvas file-upload control additionally limits files to 4 MB. L1 and L3 permit at most 256 nodes and dependency depth 64, L2 permits 128 distinct feature inputs, and condition modules permit 100 conditions. These are computational bounds, not statistical protection against overfitting.

## Layer contracts

| Layer | Accepted numeric/reference definition | Important restrictions |
| --- | --- | --- |
| L1 | `name`, `explain`, `why`, `graph:{nodes,output}`; a native graph export is also inspectable | Typed ports; exact case-sensitive params; executable emitting output; no cycles. Runtime placeholders cannot supply measured output. |
| L2 | Numeric `kind`, `featureKeys`, matching `weights`; or a separately validated overlay recipe/line definition | Weights 0–100, at least one positive. Numeric inputs use causal expanding normalization. Palette labels do not create a general executable L2 graph, HTF feed or automatic calibration. |
| L3 | Nested `{op,args,params}` AST or a flat `{rootNodeId,nodes}` AST inside `ast` | Own-property operation/input references, exact operation params, macro signatures and bounded depth. Nested trailing constants and n-ary arithmetic are normalized without discarding explicit params. |
| L4 | `level:4`, `role:CONTEXT_GATE`, conditions, ALL/ANY | Exact metric IDs and entry-time scope. Unsupported metrics are not guessed. |
| L5 | `level:5`, TRIGGER/VETO/CONFIRM/EXIT, conditions and role-specific parameters | TRIGGER needs direction; LOCK_SL needs a nonnegative lockR. ALL/ANY, weight, reliability and exit action survive import, recipe save and compilation. CONFIRM uses the generic importer. |
| L6 | Supported anchor, role, offsetAtr and positive widthAtr | Numeric offsets are required if supplied. Evidence anchors require a real numeric dependency; L5-state anchors are unavailable. Zones are chart references. |

The generated [JSON Schema catalog](schemas/module-import-contracts.json) contains all six canonical output schemas and **85 L1 block contracts**, including input/output ports, each parameter's type/default/range, runtime availability and caveats. Semantic validators additionally check references, output paths and cross-field rules. A schema pass alone does not prove a working experiment.

Regenerate with:

```sh
node mfe_ux_lab/cockpit/tools/generate-module-contracts.mjs
node mfe_ux_lab/cockpit/tools/generate-module-contracts.mjs --check
node tests/prompt-import-contract.test.mjs
```

## Confirmed swing example

The correct parameter is **uppercase `W`**, an integer from 1 to 20, default 3. `window`, `n` and lowercase `w` are different keys and are rejected with the expected parameter schema and received value.

At completed observation bar `i`, the implementation examines candidate `k=i-W` using `[k-W,k+W]`. A strict pivot is confirmed only if its high exceeds, or its low falls below, every other value in that symmetric window. Equal highs/lows do not form a strict pivot. The value is emitted at `i`, never backdated to `k`, and the last confirmed level is carried forward.

**Legacy warmup behavior:** before the first confirmation, these blocks use the current high/low. That value is not a confirmed pivot. This behavior is disclosed rather than silently changed for existing strategies. On continuous M15 data, `W=2` introduces two completed bars, or 30 minutes, of confirmation delay; market closures and source gaps can make calendar elapsed time longer.

The [importable example](examples/confirmed-swing-distance.l1.json) measures `(last swing high - close) / ATR(14)`. It is a signed, bar-level distance measurement, not a trade instruction. Its early values inherit the documented warmup behavior.

L6 anchors with the same `swing_high`/`swing_low` names have a different implementation: extrema of the current and prior 20 bars. Its `poc` is a range midpoint, not measured volume POC. These names do not imply the L1 confirmation contract.

## Data and research boundaries

The module JSON evaluator consumes completed OHLC series. A live MT5 tick chart does not expose a tick/trade/order-book input to L1/L2/L3. `m1_subbar` has no numeric implementation in this path and is not a substitute for ticks. General multi-timeframe JSON merge/resample is unavailable; an HTF palette label does not create an aligned H1 source inside an M15 feature.

KIDI in this contract refers to numeric guards such as finite-value and near-zero-denominator handling. A guarded zero is a fallback, not proof of complete market evidence or a validated strategy. L1 thresholds and `if_else` can express descriptive measurements; their presence alone is not a layer violation.

Choose thresholds on training data, freeze definitions, compare prefix-only and whole-series measurements, then use chronological held-out/walk-forward tests. Disclose source gaps, session effects, costs and ambiguous OHLC paths. Log tried variants. JSON validity does not provide an independent human-label set, multiple-testing correction, Deflated Sharpe/PBO or calibrated probability.

## Reproduced defects and fixes

- L1 prompt omitted parameter contracts; fractional integer parameters passed validation. Prompt and validator now use the same registry metadata, including `W`.
- Fenced JSON requested by the prompt was rejected by raw parsers. One shared parser now serves studios, generic module import and Canvas file import.
- Malformed nested L3 operands could throw; inherited object properties could pass as operations/references; nested macro windows could disappear. Inputs are bounded and rejected cleanly, own references are required, and explicit/trailing parameters must agree.
- The L3 JSON-to-formula editor round trip could replace outputType with SCORE, serialize WINSOR's default tail fraction as 0.5 instead of 0.05, or omit a windowed macro's default window required by the text parser. The round trip now preserves values across 38 non-macro operations × four output types, plus all three seed macros with supported window variants.
- L2 accepted negative weights that its evaluator clipped to zero, and overlay parameter typos could be ignored. Unsupported values and keys are now refused.
- L5's visual recipe import discarded ANY logic and coefficients and could rewrite protective exits as CLOSE. These fields now survive the studio/recipe/compiler path. Imported conditions are labeled as imported conditions instead of an unrelated palette strategy.
- L6 defaulted a malformed string offset to zero. Only an omitted offset receives the documented zero default.
- Generic condition-builder saves now await durable workspace acknowledgement and retain the form on failure; clipboard success is shown only after the copy operation succeeds.

The supplied claim that there were no node limits or node previews was not supported by the current source: both already existed. No claim of strategy profitability or complete validation of every graph/parameter/dataset is made by this audit.

## Authority

`SHADOW_ONLY / NO_DECISION / live_apply_allowed=false`. Existing valid signal algorithms and cost/execution rules are unchanged. Import validation and authoring behavior changed; previously accepted invalid or silently rewritten definitions can now be refused. No MT5/order implementation is modified by this work.
