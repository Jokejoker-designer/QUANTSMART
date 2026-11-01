import {
  prepareDefinitionImport,
  DEFINITION_KEYS,
} from "./portableDefinitions.ts";
import { useState } from "react";
import {
  initializeWorkspace,
  flushWorkspace,
  notifyWorkspaceChange,
} from "./workspaceClient.ts";
import { reloadCustomL1 } from "./blocks/customL1.ts";
import { reloadCustomL2 } from "./blocks/customL2.ts";
import { reloadCustomL3 } from "./blocks/customL3.ts";
import { reloadCustomL4 } from "./blocks/customL4.ts";
import { reloadCustomL5 } from "./blocks/customL5.ts";
import { reloadCustomL6 } from "./blocks/customL6.ts";
export const refreshDefinitionCaches = () => {
  reloadCustomL1();
  reloadCustomL2();
  reloadCustomL3();
  reloadCustomL4();
  reloadCustomL5();
  reloadCustomL6();
};
export async function commitDefinitionChange(
  action: () => void,
  keys: string[],
) {
  await initializeWorkspace();
  const before = Object.fromEntries(
    keys.map((key) => [key, localStorage.getItem(key)]),
  );
  try {
    action();
    const storage = Object.fromEntries(
      DEFINITION_KEYS.map((key) => [key, localStorage.getItem(key) || "[]"]),
    );
    prepareDefinitionImport(
      Object.fromEntries(
        keys
          .filter((key) => DEFINITION_KEYS.includes(key))
          .map((key) => [key, JSON.parse(storage[key])]),
      ),
      storage,
    );
    notifyWorkspaceChange();
    await flushWorkspace();
  } catch (error) {
    for (const [key, value] of Object.entries(before))
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    refreshDefinitionCaches();
    throw error;
  }
}
export function useDefinitionPersistence() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return {
    busy,
    error,
    commit: async (action: () => void, keys: string[]) => {
      if (busy) return false;
      setBusy(true);
      setError("");
      try {
        await commitDefinitionChange(action, keys);
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
