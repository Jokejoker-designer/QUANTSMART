import { STD_BY_KEY } from "./blocks/stdIndicators.ts";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const safeDefinitionId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
export function normalizeOverlayDefinition(row: Record<string, unknown>) {
  if(row.overlayKey!==undefined&&row.overlayLines!==undefined)throw new Error("Choose one overlay recipe or explicit overlayLines; both formats cannot be active together.");
  if (
    typeof row.name !== "string" ||
    row.name.trim().length < 2 ||
    typeof row.explain !== "string" ||
    row.explain.trim().length < 8
  )
    throw new Error("Overlay name and explanation are required.");
  if (row.overlayKey) {
    if (
      typeof row.overlayKey !== "string" ||
      !Object.prototype.hasOwnProperty.call(STD_BY_KEY, row.overlayKey)
    )
      throw new Error("Unknown overlay recipe");
    if (
      row.overlayParams !== undefined &&
      (!record(row.overlayParams) ||
        Object.values(row.overlayParams).some(
          (v) =>
            typeof v !== "number" ||
            !Number.isFinite(v) ||
            Math.abs(v) > 100000,
        ))
    )
      throw new Error("Invalid overlay parameters");
    for(const [key,value]of Object.entries((row.overlayParams||{}) as Record<string,unknown>)){
      const parameter=STD_BY_KEY[row.overlayKey as string].params?.find(p=>p.name===key);
      if(!parameter||typeof value!=="number"||!Number.isFinite(value)||value<parameter.min||value>parameter.max||Number.isInteger(parameter.def)&&(parameter.step??1)>=1&&!Number.isInteger(value))throw new Error(`Overlay ${row.overlayKey}: expected exact params ${JSON.stringify(STD_BY_KEY[row.overlayKey as string].params||[])}; got ${JSON.stringify({[key]:value})}`);
    }
  } else {
    if (
      !Array.isArray(row.overlayLines) ||
      !row.overlayLines.length ||
      row.overlayLines.length > 32
    )
      throw new Error("Overlay requires 1–32 lines");
    for (const line of row.overlayLines) {
      if (
        !record(line) ||
        !safeDefinitionId(line.id) ||
        typeof line.name !== "string" ||
        typeof line.color !== "string" ||
        !/^#[0-9a-f]{3,8}$/i.test(line.color) ||
        !["close", "high", "low", "hl2"].includes(String(line.base)) ||
        !["raw", "sma", "ema", "rmax", "rmin"].includes(String(line.op)) ||
        !["none", "std", "atr"].includes(String(line.band)) ||
        !Number.isInteger(line.period) ||
        Number(line.period) < 1 ||
        Number(line.period) > 10000 ||
        !Number.isInteger(line.bandN) ||
        Number(line.bandN) < 1 ||
        Number(line.bandN) > 10000 ||
        typeof line.bandMult !== "number" ||
        !Number.isFinite(line.bandMult) ||
        Math.abs(line.bandMult) > 100
      )
        throw new Error("Malformed overlay line");
    }
  }
  return {
    ...row,
    name: row.name,
    explain: row.explain,
    featureKeys: [],
    weights: {},
    status: "SHADOW",
  };
}
