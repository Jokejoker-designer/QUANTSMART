import { importAnyLayer, type ImportResult } from "./aiContextPack.ts";
import {
  prepareDefinitionImport,
  DEFINITION_KEYS,
  record,
  safeDefinitionId,
} from "./portableDefinitions.ts";
import {
  commitDefinitionChange,
  refreshDefinitionCaches,
} from "./definitionPersistence.ts";
export async function importModuleDefinition(
  text: string,
): Promise<ImportResult> {
  let result: ImportResult = {
    ok: false,
    errors: ["Import did not complete."],
  };
  try {
    const raw: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
    await commitDefinitionChange(() => {
      let key = "";
      if (record(raw) && safeDefinitionId(raw.id)) {
        if (raw.graph) key = "mfe_custom_l1";
        else if (raw.ast) key = "mfe_custom_l3";
        else if (raw.featureKeys || raw.overlayKey || raw.overlayLines)
          key = "mfe_custom_l2";
        else if (raw.anchor) key = "mfe_custom_l6";
        else if (raw.level !== undefined && raw.role)
          key = "mfe_custom_modules";
      }
      if (key) {
        const storage = Object.fromEntries(
          DEFINITION_KEYS.map((k) => [k, localStorage.getItem(k) || "[]"]),
        );
        const prepared = prepareDefinitionImport({ [key]: [raw] }, storage);
        for (const [k, value] of Object.entries(prepared.updates))
          localStorage.setItem(k, value);
        const layer =
          key === "mfe_custom_modules"
            ? Number(record(raw) ? raw.level : 0)
            : Number(key.slice(-1));
        result = {
          ok: true,
          layer: ("L" + layer) as "L1" | "L2" | "L3" | "L4" | "L5" | "L6",
          id: String(record(raw) ? raw.id : ""),
          name: String(record(raw) ? raw.name : ""),
          errors: [],
        };
        refreshDefinitionCaches();
      } else {
        result = importAnyLayer(text.replace(/^\uFEFF/, ""));
        if (!result.ok) throw new Error(result.errors.join("; "));
      }
    }, DEFINITION_KEYS);
    return result;
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
