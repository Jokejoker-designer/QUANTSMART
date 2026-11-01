// Validate portable definitions before any browser or backend state is changed.
import {
  parseAiFeature,
  parseAiIndicator,
  parseAiFormula,
  parseAiModule,
  parseAiZone,
  KNOWN_L3_INPUTS,
} from "./aiContextPack.ts";
import { L1_PICKABLE, availableInputs } from "./blocks/l2Eval.ts";
import { L3_AUTHORITY, astHash } from "./blocks/customL3.ts";
import { QUANT_AUTHORITY } from "./blocks/quantAstTypes.ts";
import { suggestRoles, USAGE_ROLES } from "./blocks/featureRoles.ts";
import { normalizeOverlayDefinition } from "./overlayDefinition.ts";
export const DEFINITION_KEYS = [
  "mfe_custom_modules",
  "mfe_custom_l1",
  "mfe_custom_l2",
  "mfe_custom_l3",
  "mfe_custom_l4_recipe",
  "mfe_custom_l5_recipe",
  "mfe_custom_l6",
];
export const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function safeDefinitionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,149}$/.test(value) &&
    !["constructor", "prototype", "__proto__"].includes(value)
  );
}
export function canonicalDefinition(value: unknown): string {
  const ignored = new Set([
    "createdAt",
    "updatedAt",
    "roles",
    "status",
    "validation",
    "validationReport",
    "validationReceipt",
    "oos",
    "astHash",
    "version",
    "safety",
    "authority",
  ]);
  const stable = (value:unknown,parent=""):unknown => {
    if(Array.isArray(value))return value.map(x=>stable(x,parent));
    if(!record(value))return value;
    let v=value;
    if(Array.isArray(v.featureKeys)&&record(v.weights)){
      const keys=v.featureKeys.filter((x):x is string=>typeof x==="string");
      const weights=v.weights;const weightSrc=v.weightSrc;
      v={...v,weights:Object.fromEntries(keys.map(key=>[key,weights[key]])),...(record(weightSrc)?{weightSrc:Object.fromEntries(keys.filter(key=>key in weightSrc).map(key=>[key,weightSrc[key]]))}:{})};
    }
    return Object.fromEntries(Object.keys(v).sort().filter(key=>!ignored.has(key)&&!(parent==="graph"&&key==="id")).map(key=>[key,stable(v[key],key)]));
  };
  return JSON.stringify(stable(value));
}
function rows(value: unknown, key: string): Record<string, unknown>[] {
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((row) => !record(row) || !safeDefinitionId(row.id))
  )
    throw new Error("Invalid definition collection: " + key);
  const ids = value.map((row) => row.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate definition IDs in " + key);
  return value;
}

export function prepareDefinitionImport(
  input: unknown,
  storage: Record<string, string>,
) {
  if (!record(input)) throw new Error("Definitions must be an object");
  const incoming: Record<string, Record<string, unknown>[]> =
    Object.fromEntries(
      Object.entries(input).map(([key, value]) => {
        if (!DEFINITION_KEYS.includes(key))
          throw new Error("Unknown definition store: " + key);
        return [key, rows(value, key)];
      }),
    );
  const current: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    DEFINITION_KEYS.map((key) => [
      key,
      rows(JSON.parse(storage[key] || "[]"), key),
    ]),
  );
  const all = (key: string) => [...current[key], ...(incoming[key] || [])];
  const l1 = all("mfe_custom_l1").map((row) => String(row.id)),
    l2 = all("mfe_custom_l2")
      .filter((row) => row.kind !== "overlay")
      .map((row) => String(row.id)),
    l3 = all("mfe_custom_l3").map((row) => String(row.id));
  const evidence = [...l1, ...l2, ...l3];
  const formulaInputs = [
    ...KNOWN_L3_INPUTS,
    ...L1_PICKABLE.map((x) => x.key),
    ...availableInputs()
      .filter(
        (x) =>
          x.layer === "L1" ||
          !all("mfe_custom_l2").some(
            (row) => row.id === x.key && row.kind === "overlay",
          ),
      )
      .map((x) => x.key),
    ...l1,
    ...l2,
  ];
  const normalized: Record<string, Record<string, unknown>[]> = {};
  for (const key of DEFINITION_KEYS) {
    if (!incoming[key]) continue;
    normalized[key] = incoming[key].map((row) => {
      let output: Record<string, unknown>;
      if (key === "mfe_custom_l1") {
        const parsed = parseAiFeature(JSON.stringify(row));
        if (!parsed.ok || !parsed.module)
          throw new Error(
            "Invalid L1 " + row.id + ": " + parsed.errors.join("; "),
          );
        output = {
          ...row,
          ...parsed.module,
          roles: suggestRoles(parsed.module.graph),
          graph: {
            ...parsed.module.graph,
            id:
              record(row.graph) && typeof row.graph.id === "string"
                ? row.graph.id
                : parsed.module.graph.id,
            description:
              record(row.graph) && typeof row.graph.description === "string"
                ? row.graph.description
                : parsed.module.graph.description,
          },
        };
      } else if (key === "mfe_custom_l2") {
        if (row.kind === "overlay") output = normalizeOverlayDefinition(row);
        else {
          const parsed = parseAiIndicator(JSON.stringify(row), l1);
          if (!parsed.ok || !parsed.module)
            throw new Error(
              "Invalid L2 " + row.id + ": " + parsed.errors.join("; "),
            );
          output = { ...row, ...parsed.module };
        }
      } else if (key === "mfe_custom_l3") {
        const parsed = parseAiFormula(JSON.stringify(row), formulaInputs);
        if (!parsed.ok || !parsed.ast)
          throw new Error(
            "Invalid L3 " + row.id + ": " + parsed.errors.join("; "),
          );
        const ast = {
          ...parsed.ast,
          authority: QUANT_AUTHORITY,
          status: "SHADOW" as const,
        };
        output = {
          ...row,
          ast,
          astHash: astHash(ast),
          authority: L3_AUTHORITY,
          status: "SHADOW",
          validation: {
            structuralStatus: "PASS",
            oosStatus: "NOT_RUN",
            walkForwardStatus: "NOT_RUN",
            monteCarloStatus: "NOT_RUN",
            eraStabilityStatus: "NOT_RUN",
          },
          validationReport: undefined,
          safety: {
            parsePass: true,
            finiteOutput: false,
            kidiSafe: false,
            noLookahead: false,
            causalSafe: false,
            authorityLocked: true,
          },
        };
      } else if (key === "mfe_custom_l6") {
        const parsed = parseAiZone(JSON.stringify(row), evidence);
        if (!parsed.ok || !parsed.zone)
          throw new Error(
            "Invalid L6 " + row.id + ": " + parsed.errors.join("; "),
          );
        output = { ...parsed.zone };
      } else if (key === "mfe_custom_l4_recipe") {
        const parsed = parseAiModule(
          JSON.stringify({ ...row, level: 4, role: "CONTEXT_GATE" }),
          evidence,
        );
        if (!parsed.ok || !parsed.module)
          throw new Error(
            "Invalid L4 recipe " + row.id + ": " + parsed.errors.join("; "),
          );
        output = {
          ...row,
          conditions: parsed.module.conditions,
          status: "SHADOW",
        };
      } else if (key === "mfe_custom_l5_recipe") {
        if (
          !["TRIGGER", "VETO", "EXIT"].includes(String(row.terminal)) ||
          !Array.isArray(row.setup) ||
          !Array.isArray(row.confirm)
        )
          throw new Error("Invalid L5 recipe " + row.id);
        const parsed = parseAiModule(
          JSON.stringify({
            ...row,
            level: 5,
            role: row.terminal,
            logic: "ALL",
            conditions: [...row.setup, ...row.confirm],
          }),
          evidence,
        );
        if (!parsed.ok)
          throw new Error(
            "Invalid L5 recipe " + row.id + ": " + parsed.errors.join("; "),
          );
        output = { ...row, status: "SHADOW" };
      } else {
        const parsed = parseAiModule(JSON.stringify(row), evidence);
        if (!parsed.ok || !parsed.module)
          throw new Error(
            "Invalid rule " + row.id + ": " + parsed.errors.join("; "),
          );
        output = { ...parsed.module };
      }
      if (
        output.primaryRole !== undefined &&
        !USAGE_ROLES.includes(
          output.primaryRole as (typeof USAGE_ROLES)[number],
        )
      )
        throw new Error("Unknown intended feature role");
      return {
        ...output,
        id: row.id,
        createdAt:
          typeof row.createdAt === "string"
            ? row.createdAt
            : new Date().toISOString(),
      };
    });
  }
  const updates: Record<string, string> = {};
  for (const [key, items] of Object.entries(normalized)) {
    const merged = new Map(current[key].map((row) => [String(row.id), row]));
    for (const item of items) {
      const previous = merged.get(String(item.id));
      if (
        previous &&
        canonicalDefinition(previous) !== canonicalDefinition(item)
      )
        throw new Error(
          "Module ID conflict: " +
            item.id +
            ". Rename the imported definition.",
        );
      if (!previous) merged.set(String(item.id), item);
    }
    updates[key] = JSON.stringify([...merged.values()]);
  }
  return {
    updates,
    stores: Object.fromEntries(
      DEFINITION_KEYS.map((key) => [
        key,
        JSON.parse(updates[key] || storage[key] || "[]") as Record<
          string,
          unknown
        >[],
      ]),
    ),
  };
}
