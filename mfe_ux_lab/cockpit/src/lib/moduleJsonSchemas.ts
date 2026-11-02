// Canonical AI output shapes. Semantic validators additionally resolve references,
// ports, roles, cross-field constraints and bounded dependency depth.
import { l1FeatureJsonSchema } from "./blocks/blockJsonContract.ts";
import { OP_SPEC } from "./blocks/quantAstTypes.ts";
import { quantOperationParams } from "./blocks/quantImportContract.ts";
import { SEED_MACROS } from "./blocks/quantMacroRegistry.ts";
import { CONDITION_OPERATORS, LEVEL_TEMPLATES } from "./customModule.ts";
import { ZONE_ROLES } from "./blocks/customL6.ts";

const text = (minLength = 1) => ({ type: "string", minLength });
const envelope = {
  name: text(2),
  explain: text(8),
  explanation: { type: "string" },
};
const draft = "https://json-schema.org/draft/2020-12/schema";
const condition = {
  type: "object",
  required: ["metric", "op", "value"],
  properties: {
    metric: text(),
    op: { enum: CONDITION_OPERATORS },
    value: { type: "number" },
    value2: { type: "number" },
  },
  additionalProperties: false,
  allOf: [
    {
      if: { properties: { op: { enum: ["between", "outside"] } } },
      then: { required: ["value2"] },
    },
  ],
};
export function conditionModuleJsonSchema(level: 0 | 4 | 5) {
  return {
    $schema: draft,
    title: `QUANTSMART L${level} condition import`,
    type: "object",
    required: ["level", "role", "name", "explain", "why", "conditions"],
    properties: {
      ...envelope,
      name: text(3),
      explain: text(12),
      why: text(12),
      level: { const: level },
      role: { enum: LEVEL_TEMPLATES[level].roles },
      conditions: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: condition,
      },
      logic: { enum: ["ALL", "ANY"], default: "ALL" },
      direction: { enum: ["LONG", "SHORT", "REGIME"] },
      weight: { type: "number", minimum: 0, maximum: 100 },
      reliability: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 },
      exitAction: { enum: ["CLOSE", "BREAKEVEN", "LOCK_SL"] },
      lockR: { type: "number", minimum: 0 },
    },
    allOf: [
      {
        if: { properties: { role: { const: "TRIGGER" } } },
        then: { required: ["direction"] },
      },
      {
        if: {
          required: ["exitAction"],
          properties: {
            role: { const: "EXIT" },
            exitAction: { const: "LOCK_SL" },
          },
        },
        then: { required: ["lockR"] },
      },
    ],
    $comment:
      "Metric scope, dependency availability and ordered range endpoints are validated by validateModule. role-specific weight/action semantics are preserved on import.",
  };
}
function l3Schema() {
  const expression = { $ref: "#/$defs/expression" };
  const operations = Object.entries(OP_SPEC).flatMap(([op, spec]) => {
    const base = {
      type: "object",
      required: ["op", "args"],
      properties: {
        op: { const: op },
        args: {
          type: "array",
          minItems: Math.max(0, spec.arity),
          maxItems: Math.max(0, spec.arity),
          items: expression,
        },
        params: {
          type: "object",
          properties: quantOperationParams(op),
          additionalProperties: false,
        },
      },
    };
    if (op !== "MACRO_REF") return [base];
    return Object.values(SEED_MACROS).map((macro) => ({
      ...base,
      properties: {
        ...base.properties,
        args: {
          type: "array",
          minItems: macro.inputs.length + 1,
          maxItems: macro.inputs.length + 1,
          prefixItems: [{ const: macro.macroId }],
          items: expression,
        },
      },
    }));
  });
  const flat = {
    type: "object",
    required: ["rootNodeId", "nodes"],
    properties: {
      rootNodeId: text(),
      nodes: {
        type: "object",
        minProperties: 1,
        maxProperties: 256,
        additionalProperties: {
          type: "object",
          required: ["kind"],
          properties: {
            nodeId: text(),
            kind: {
              enum: [
                "INPUT",
                "CONST",
                "POINT_OP",
                "ROLLING_OP",
                "LOGIC_OP",
                "MACRO",
              ],
            },
            op: { enum: Object.keys(OP_SPEC) },
            inputRef: text(),
            constValue: { type: "number" },
            children: { type: "array", maxItems: 256, items: text() },
            params: { type: "object" },
          },
        },
      },
    },
  };
  return {
    $schema: draft,
    title: "QUANTSMART L3 numeric formula import",
    type: "object",
    required: ["name", "ast"],
    properties: {
      name: text(),
      ast: { anyOf: [{ $ref: "#/$defs/operation" }, flat] },
      outputType: {
        enum: ["SCORE", "PROBABILITY_LIKE_SCORE", "INDICATOR", "EV_COMPONENT"],
        default: "SCORE",
      },
      explanation: { type: "string" },
    },
    $defs: {
      operation: { oneOf: operations },
      expression: {
        anyOf: [{ type: "number" }, text(), { $ref: "#/$defs/operation" }],
      },
    },
    $comment:
      "Canonical nested JSON uses explicit params. The importer also normalizes documented trailing constants, CONST/INPUT nodes and n-ary folds. Semantic validation enforces op-specific params, macro signatures, own references, no cycles, <=256 normalized nodes and depth <=64. A probability-like score is not a calibrated probability.",
  };
}
export function moduleImportSchemas() {
  const weighted = {
    type: "object",
    required: ["explain", "featureKeys", "weights"],
    properties: {
      ...envelope,
      kind: {
        enum: ["indicator", "regime", "bias", "confidence"],
        default: "indicator",
      },
      featureKeys: {
        type: "array",
        minItems: 1,
        maxItems: 128,
        uniqueItems: true,
        items: text(),
      },
      weights: {
        type: "object",
        minProperties: 1,
        additionalProperties: { type: "number", minimum: 0, maximum: 100 },
      },
    },
  };
  const overlay = {
    type: "object",
    required: ["name", "explain", "kind"],
    properties: {
      ...envelope,
      kind: { const: "overlay" },
      overlayKey: text(),
      overlayParams: {
        type: "object",
        additionalProperties: { type: "number" },
      },
      overlayLines: {
        type: "array",
        minItems: 1,
        maxItems: 32,
        items: { type: "object" },
      },
    },
    oneOf: [{ required: ["overlayKey"] }, { required: ["overlayLines"] }],
  };
  return {
    L1: l1FeatureJsonSchema(),
    L2: {
      $schema: draft,
      title: "QUANTSMART L2 indicator import",
      oneOf: [weighted, overlay],
      $comment:
        "References must resolve to existing L1 feature IDs; weights must exactly match selected keys and at least one must be positive. Overlay recipes/lines use the separate validated overlay contract. Palette blocks are not a JSON graph execution format.",
    },
    L3: l3Schema(),
    L4: conditionModuleJsonSchema(4),
    L5: conditionModuleJsonSchema(5),
    L6: {
      $schema: draft,
      title: "QUANTSMART L6 reference zone import",
      type: "object",
      required: ["name", "explain", "anchor", "role", "widthAtr"],
      properties: {
        ...envelope,
        anchor: {
          enum: ["swing_high", "swing_low", "poc", "evidence", "price"],
        },
        anchorRef: text(),
        role: { enum: ZONE_ROLES },
        offsetAtr: { type: "number", default: 0 },
        widthAtr: { type: "number", exclusiveMinimum: 0 },
      },
      allOf: [
        {
          if: { properties: { anchor: { const: "evidence" } } },
          then: { required: ["anchorRef"] },
        },
      ],
      $comment:
        "evidence requires an existing numeric L1/L2/L3 ID. L5-state anchors are unavailable. Swing anchors use the current and prior 20 bars; poc is range midpoint, not volume POC. L1 confirmed-pivot semantics are different.",
    },
  };
}
