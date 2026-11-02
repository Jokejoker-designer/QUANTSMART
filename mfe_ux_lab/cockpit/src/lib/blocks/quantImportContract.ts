import { OP_SPEC } from "./quantAstTypes.ts";
export const MAX_QUANT_NODES = 256;
export const MAX_QUANT_DEPTH = 64;
type Parameter = {
  type: "number" | "integer" | "string";
  default?: number;
  minimum?: number;
  maximum?: number;
};
export function quantOperationParams(op: string): Record<string, Parameter> {
  if (!Object.prototype.hasOwnProperty.call(OP_SPEC, op)) return {};
  if (op === "MACRO_REF")
    return {
      macroId: { type: "string" },
      window: { type: "integer", default: 20, minimum: 2, maximum: 10000 },
    };
  if (op === "LAG" || op === "DELTA")
    return { lag: { type: "integer", default: 1, minimum: 1, maximum: 10000 } };
  if (op === "CLIP")
    return {
      min: { type: "number", default: -1 },
      max: { type: "number", default: 1 },
    };
  if (OP_SPEC[op as keyof typeof OP_SPEC].windowed)
    return {
      window: { type: "integer", default: 20, minimum: 2, maximum: 10000 },
      ...(["QUANTILE", "WINSOR"].includes(op)
        ? {
            q: {
              type: "number" as const,
              default: op === "QUANTILE" ? 0.5 : 0.05,
              minimum: 0,
              maximum: op === "QUANTILE" ? 1 : 0.5,
            },
          }
        : {}),
    };
  return {};
}
export function quantParameterErrors(op: string, params: unknown): string[] {
  if (params === undefined) return [];
  if (!params || typeof params !== "object" || Array.isArray(params))
    return ["params must be an object"];
  const schema = quantOperationParams(op),
    errors: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if(value===undefined&&Object.prototype.hasOwnProperty.call(schema,key))continue; // optional native AST fields disappear in JSON
    const p = schema[key];
    const valid =
      Object.prototype.hasOwnProperty.call(schema, key) &&
      (p.type === "string"
        ? typeof value === "string"
        : typeof value === "number" &&
          Number.isFinite(value) &&
          (p.type !== "integer" || Number.isInteger(value)) &&
          (p.minimum === undefined || value >= p.minimum) &&
          (p.maximum === undefined || value <= p.maximum));
    if (!valid)
      errors.push(
        `${op}: expected params ${JSON.stringify(schema)}; got ${JSON.stringify({ [key]: value })}`,
      );
  }
  const values = params as Record<string, unknown>;
  if(op==="MACRO_REF"&&values.macroId==="safe_ratio"&&values.window!==undefined)errors.push("safe_ratio has no window parameter; supply exactly its two numeric inputs.");
  if (op === "CLIP" && Number(values.min ?? -1) > Number(values.max ?? 1))
    errors.push(
      "CLIP: min must be less than or equal to max, including defaults",
    );
  return errors;
}
