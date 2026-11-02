import { BLOCKS } from "./blockLibrary.ts";
import type { L1PrimitiveBlockSpec } from "./blockTypes.ts";

export const MAX_FEATURE_NODES = 256;
export const MAX_FEATURE_DEPTH = 64;
export function blockParametersSchema(block: L1PrimitiveBlockSpec) {
  return {
    type: "object",
    properties: Object.fromEntries(
      block.parameters.map((p) => [
        p.name,
        {
          type: p.type,
          default: p.defaultValue,
          ...(p.min === undefined ? {} : { minimum: p.min }),
          ...(p.max === undefined ? {} : { maximum: p.max }),
        },
      ]),
    ),
    additionalProperties: false,
  };
}
export function l1BlockContracts() {
  return BLOCKS.map((block) => ({
    blockId: block.blockId,
    description: block.description,
    inputs: block.inputs.filter((p) => p.type !== "STREAM_OHLC"),
    outputs: block.outputs,
    paramsSchema: blockParametersSchema(block),
    runtime: block.compute ? "AVAILABLE" : "NOT_IMPLEMENTED",
    provisional: !!block.provisional,
    note: block.note,
  }));
}
export function blockParameterErrors(
  block: L1PrimitiveBlockSpec,
  params: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const expected = JSON.stringify(blockParametersSchema(block));
  for (const [key, value] of Object.entries(params)) {
    const p = block.parameters.find((p) => p.name === key);
    if (
      !p ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (p.type === "integer" && !Number.isInteger(value)) ||
      (p.min !== undefined && value < p.min) ||
      (p.max !== undefined && value > p.max)
    )
      errors.push(
        `${block.blockId}: expected case-sensitive params ${expected}; got ${JSON.stringify({ [key]: value })}.`,
      );
    if (errors.length >= 8) break;
  }
  const defaults = Object.fromEntries(
    block.parameters.map((p) => [p.name, p.defaultValue]),
  );
  const values = { ...defaults, ...params };
  if (
    ["clip", "between"].includes(block.blockId) &&
    typeof values.lo === "number" &&
    typeof values.hi === "number" &&
    values.lo > values.hi
  )
    errors.push(
      `${block.blockId}: lo must be less than or equal to hi, including defaults.`,
    );
  if (
    block.blockId === "hysteresis" &&
    typeof values.on === "number" &&
    typeof values.off === "number" &&
    values.on < values.off
  )
    errors.push("hysteresis: on must be greater than or equal to off.");
  return errors;
}
export function l1FeatureJsonSchema() {
  const ref = {
    type: "string",
    pattern: "^[A-Za-z0-9_.:-]{1,128}$",
    not: { enum: ["constructor", "prototype", "__proto__"] },
  };
  const nodes = BLOCKS.map((block) => {
    const arity = block.inputs.filter((p) => p.type !== "STREAM_OHLC").length;
    return {
      type: "object",
      required: ["id", "blockId", "inputs"],
      properties: {
        id: ref,
        blockId: { const: block.blockId },
        params: blockParametersSchema(block),
        inputs: {
          type: "array",
          minItems: arity,
          maxItems: arity,
          items: { anyOf: [ref, { type: "null" }] },
        },
        x: { type: "number", minimum: 0, maximum: 100000 },
        y: { type: "number", minimum: 0, maximum: 100000 },
      },
      description: block.description,
      "x-ports": block.inputs,
      "x-runtime": block.compute ? "AVAILABLE" : "NOT_IMPLEMENTED",
    };
  });
  const graph = {
    type: "object",
    required: ["nodes", "output"],
    properties: {
      output: ref,
      nodes: {
        type: "array",
        minItems: 1,
        maxItems: MAX_FEATURE_NODES,
        items: { oneOf: nodes },
      },
    },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "QUANTSMART L1 feature import",
    anyOf: [
      {
        type: "object",
        required: ["name", "explain", "why", "graph"],
        properties: {
          name: { type: "string", minLength: 2 },
          explain: { type: "string", minLength: 12 },
          why: { type: "string", minLength: 12 },
          graph,
        },
      },
      graph,
    ],
    $comment:
      "Semantic validation also checks unique IDs, references, ports, emitting output, cycles, dependency depth <=64 and executable blocks on the output path. Schema defaults are documentation; the evaluator uses the same registry defaults.",
  };
}
