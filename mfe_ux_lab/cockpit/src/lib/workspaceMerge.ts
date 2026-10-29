// Three-way workspace merge. Conflicting edits are never silently overwritten.
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function stable(value: unknown): string {
  if (value === undefined) return "<absent>";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function keyed(value: unknown): Map<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  const result = new Map<string, unknown>();
  for (const item of value) { if (!record(item) || typeof item.id !== "string" || result.has(item.id)) return null; result.set(item.id, item); }
  return result;
}
function merge(base: unknown, local: unknown, remote: unknown, path: string): unknown {
  if (stable(local) === stable(remote)) return local;
  if (stable(local) === stable(base)) return remote;
  if (stable(remote) === stable(base)) return local;
  if (record(local) && record(remote) && (base === undefined || record(base))) {
    const original = record(base) ? base : {};
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(original), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = merge(original[key], local[key], remote[key], `${path}.${key}`); if (value !== undefined) result[key] = value;
    }
    return result;
  }
  const a = keyed(base === undefined ? [] : base), b = keyed(local), c = keyed(remote);
  if (a && b && c) {
    const result: unknown[] = [];
    for (const id of new Set([...c.keys(), ...b.keys()])) { const value = merge(a.get(id), b.get(id), c.get(id), `${path}[${id}]`); if (value !== undefined) result.push(value); }
    return result;
  }
  throw new Error(`WORKSPACE_CONFLICT_REVIEW_REQUIRED: ${path}`);
}
export function mergeWorkspace(base: Record<string, string>, local: Record<string, string>, remote: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  const parse = (value?: string): unknown => value === undefined ? undefined : JSON.parse(value);
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const value = merge(parse(base[key]), parse(local[key]), parse(remote[key]), key);
    if (value !== undefined) result[key] = JSON.stringify(value);
  }
  return result;
}
