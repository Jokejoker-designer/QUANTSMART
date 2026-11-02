// Accept exactly the JSON object the prompt asks for, including one fenced block.
// Never search prose for an arbitrary substring that merely looks like JSON.
export function parseModuleJson(text: string): unknown {
  if (typeof text !== "string" || text.length > 8 * 1024 * 1024)
    throw new Error("Module JSON exceeds the 8 MiB text limit.");
  let source = text.replace(/^\uFEFF/, "").trim();
  if (source.startsWith("```")) {
    const match = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(source);
    if (!match || match[1].includes("```"))
      throw new Error(
        "Paste one JSON object, optionally inside one fenced JSON block; remove surrounding prose or additional blocks.",
      );
    source = match[1].trim();
  }
  const result: unknown = JSON.parse(source);
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const row = result as Record<string, unknown>;
    const kinds = [
      !!(row.ast || (row.rootNodeId && row.nodes)),
      !!(row.graph || (row.nodes && row.output)),
      !!(row.featureKeys || row.weights || row.overlayKey || row.overlayLines),
      !!row.anchor,
      !!(row.conditions || [0, 4, 5].includes(Number(row.level))),
    ].filter(Boolean);
    if (kinds.length > 1)
      throw new Error(
        "Ambiguous JSON mixes multiple layer formats. Import one module at a time, or use a versioned Strategy library bundle with definitions.",
      );
  }
  return result;
}
