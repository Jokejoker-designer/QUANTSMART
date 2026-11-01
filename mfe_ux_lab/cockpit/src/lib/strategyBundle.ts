// Portable strategy definitions. Imported performance claims are not trusted receipts.
import {
  readStrategyCards,
  writeStrategyCards,
  type StrategyCardArtifactRecord,
} from "./artifactRegistry.ts";
import {
  initializeWorkspace,
  flushWorkspace,
  notifyWorkspaceChange,
} from "./workspaceClient.ts";
import {
  prepareDefinitionImport,
  DEFINITION_KEYS,
  safeDefinitionId,
  record,
} from "./portableDefinitions.ts";
import { reloadCustomL1 } from "./blocks/customL1.ts";
import { reloadCustomL2 } from "./blocks/customL2.ts";
import { reloadCustomL3 } from "./blocks/customL3.ts";
import { reloadCustomL4 } from "./blocks/customL4.ts";
import { reloadCustomL5 } from "./blocks/customL5.ts";
import { reloadCustomL6 } from "./blocks/customL6.ts";
const KEYS = DEFINITION_KEYS;
const refresh = () => {
  reloadCustomL1();
  reloadCustomL2();
  reloadCustomL3();
  reloadCustomL4();
  reloadCustomL5();
  reloadCustomL6();
};
const baseId = (id: string) => id.replace(/^myL[123456]_/, "");
export function exportStrategyBundle(
  cards: StrategyCardArtifactRecord[] = readStrategyCards(),
) {
  const available = Object.fromEntries(
    KEYS.map((key) => [
      key,
      JSON.parse(localStorage.getItem(key) || "[]") as { id: string }[],
    ]),
  );
  const needed = new Set(cards.flatMap((card) => card.modules).map(baseId));
  const included: Record<string, unknown[]> = {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, items] of Object.entries(available))
      for (const item of items)
        if (
          needed.has(item.id) &&
          !(included[key] || []).some((x: any) => x.id === item.id)
        ) {
          (included[key] ||= []).push(item);
          const strings: string[] = [];
          const walk = (value: unknown) => {
            if (typeof value === "string") strings.push(baseId(value));
            else if (value && typeof value === "object")
              Object.values(value).forEach(walk);
          };
          walk(item);
          for (const value of strings)
            if (
              Object.values(available).some((list) =>
                list.some((row) => row.id === value),
              ) &&
              !needed.has(value)
            ) {
              needed.add(value);
              changed = true;
            }
        }
  }
  return {
    schema: "mfe.strategy-library/2",
    exported_at: new Date().toISOString(),
    cards,
    definitions: included,
    receipt_policy: "Definitions only; validate in the receiving workspace.",
  };
}
export async function importStrategyBundle(input: unknown) {
  await initializeWorkspace();
  const bundle = record(input) ? input : {};
  const incoming = Array.isArray(input) ? input : Array.isArray(bundle.cards)?bundle.cards:record(bundle.card)?[bundle.card]:Array.isArray(bundle.modules)?[bundle]:bundle.cards;
  if (!Array.isArray(incoming) || !incoming.length || incoming.length > 1000)
    throw new Error("The file must contain 1–1,000 Strategy Cards.");
  if (bundle.schema !== undefined && bundle.schema !== "mfe.strategy-library/2")
    throw new Error("Unsupported Strategy bundle schema.");
  const ids = new Set<string>();
  const cards = incoming.map((value) => {
    if (
      !record(value) ||
      !safeDefinitionId(value.id) ||
      ids.has(value.id) ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      !Array.isArray(value.modules) ||
      value.modules.some((id) => typeof id !== "string")
    )
      throw new Error("Invalid or duplicate Card definition.");
    const periods:Record<string,number>={M1:1,M5:5,M15:15,H1:60,H4:240,D1:1440};
    if(value.symbol!==undefined&&(typeof value.symbol!=="string"||!/^[A-Z0-9]{3,12}$/.test(value.symbol))||value.design_tf!==undefined&&(typeof value.design_tf!=="string"||!Object.prototype.hasOwnProperty.call(periods,value.design_tf))||value.execution_tf!==undefined&&(typeof value.execution_tf!=="string"||!Object.prototype.hasOwnProperty.call(periods,value.execution_tf))||typeof value.execution_tf==="string"&&typeof value.design_tf==="string"&&periods[value.execution_tf]>periods[value.design_tf])throw new Error("Invalid imported Card operating context.");
    ids.add(value.id);
    return {
      ...value,
      id: value.id,
      name: value.name,
      modules: value.modules.map(id=>id.replace(/^myL6_/, "")).filter(
        (id): id is string => typeof id === "string",
      ),
      validationReceipt: undefined,
      oos: undefined,
      n: 0,
      netR: 0,
      winRate: 0,
      maxDD: 0,
      evidence_status: "NOT_VALIDATED",
      bt_window: "NO_DATA",
      status: "DRAFT",
      authority: "SHADOW_ONLY",
      decision: "NO_DECISION",
    } satisfies StrategyCardArtifactRecord;
  });
  const storage = Object.fromEntries(
    KEYS.map((key) => [key, localStorage.getItem(key) || "[]"]),
  );
  const { updates, stores } = prepareDefinitionImport(
    bundle.definitions || {},
    storage,
  );
  for (const card of cards)
    for (const id of card.modules) {
      const match = id.match(/^myL([123456])_(.+)$/);
      if (
        match &&
        !stores["mfe_custom_l" + match[1]]?.some((row) => row.id === match[2])
      )
        throw new Error("Missing module dependency: " + id);
      if (
        !match &&
        /^(cm_|l4_|l5_|l6_)/.test(id) &&
        !Object.values(stores).some((rows) => rows.some((row) => row.id === id))
      )
        throw new Error("Missing module dependency: " + id);
    }
  const current = readStrategyCards();
  const existing = new Set(current.map((card) => card.id));
  const added = cards.filter((card) => !existing.has(card.id));
  const before = Object.fromEntries(
    [...Object.keys(updates), "mfe_strategy_cards"].map((key) => [
      key,
      localStorage.getItem(key),
    ]),
  );
  try {
    for (const [key, value] of Object.entries(updates))
      localStorage.setItem(key, value);
    refresh();
    writeStrategyCards([...added, ...current]);
    notifyWorkspaceChange();
    await flushWorkspace();
  } catch (error) {
    for (const [key, value] of Object.entries(before))
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    refresh();
    throw error;
  }
  return { added: added.length, skipped: cards.length - added.length };
}
