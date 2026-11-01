# Build your own quantitative modules

QUANTSMART's custom studios let you describe the calculations behind a strategy,
inspect intermediate values and check how the pieces connect. Open **Strategy
Studio → Canvas** and choose a **Custom L1–L6 studio** beside the corresponding lane.

## Feature graphs: L1

Combine price inputs, candle anatomy, rolling windows, normalization, arithmetic
and stateful blocks into a numeric feature. The graph shows typed ports, connections
and intermediate values. Its inspector explains the selected operation, while the
replay panel lets you examine the feature on a declared price tape.

This example builds **Wick Rejection Strength**:

```text
lower_wick_ratio × close_location × (1 − body_ratio)
```

It measures a candle's geometry. The calculation alone does not establish that it
predicts future returns.

![Custom L1 feature graph: Wick Rejection Strength](screenshots/custom-l1-feature-graph.png)

*Full-screen development capture supplied by the project owner. The original image
contains one legacy Vietnamese inspector sentence; the current source explanation
is in English. The graph and measurements are reproduced without alteration.*

## Indicators, algorithms and strategy wiring

Canvas exposes separate authoring lanes for features, indicators, algorithms,
market context, strategy logic and zone output. Use the relevant studio to build
a component, save its definition, and inspect how it contributes to a Card.
Typed connections and dependency checks help identify missing inputs; an editable
component is not automatically an engine-supported or validated strategy.

![Custom studios and their lanes in Strategy Canvas](screenshots/strategy-canvas.jpg)

## Inspect formulas in Coordinate Lab

Use Coordinate Lab to examine a saved formula through curves, surfaces, heatmaps
and slices. Check the selected inputs and fixed-variable assumptions. Geometry,
smoothness and sensitivity describe the formula; they do not prove a trading edge.
Opening the workspace without a saved formula shows an explicitly labeled example.

![Coordinate Lab for quantitative formula inspection](screenshots/formula-lab.jpg)

## From a module to an experiment

1. Start from a small template and identify what the output measures.
2. Change the graph or parameters and inspect the intermediate values.
3. Validate the dependencies and role, then save the component.
4. Assemble it into a Card and run a measured test against your authorized history.
5. Review costs, fill assumptions, sample size and chronological validation coverage.

Saving a definition, passing a graph check and obtaining a profitable backtest are
different milestones. Research runs remain separate from optional manual MT5 Demo
tickets.

Return to the [product tour](PRODUCT_TOUR.md) or [installation guide](../README.md).

## CSV-backed studios and AI authoring

Select a saved CSV and evaluation timeframe in the studio. Output, replay and the individual-bar inspector use that source. Preview uses the latest 2,000 selected observations. Save Shadow keeps a definition in the library; use Attach explicitly to change the current Card.

Each L1–L6 studio provides a layer-specific prompt and JSON importer. Canvas Research mode also provides a strategy authoring brief and a generic module importer. These tools export a specification for your external assistant. They do not call an AI provider or accept arbitrary code. Inspect the returned definition, then run a separate complete Card backtest.

BEAST composes Cards by role. Member Cards must agree on symbol, design timeframe and execution timeframe. The builder preserves that context when saving and exporting. CSV role analysis measures leave-one-role-out changes; it does not confer an independent edge.

See [video tutorials](TUTORIALS.md) and [layer verification](LAYER_VALIDATION.md) for the tested workflows and limits.
