// strategyRenderFeed (P7) — PURE/testable: gộp L1→L6 của một chiến-lược thành MỘT feed để vẽ trên ChartPane (kit) =
// "TradingView của chiến-lược". Chỉ ĐỌC các hàm pure đã có: stdIndicators (overlay + live-param + custom màu) ·
// l6Eval (zone band) · previewMarginSeries/previewModule (L4/L5 margin + fires, KHOÁ từ P5) · customMetricSeries
// (evidence L1/L2/L3 → oscillator). KHÔNG engine, KHÔNG order, causal. Byte-identical: không đụng compile/engine.
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { ChartOverlay, ChartMarker, ChartOscillator } from "../../components/vizkit/ChartPane.tsx";   // type-only → erased, no React runtime
import { STD_BY_KEY } from "./stdIndicators.ts";
import { zoneCenterSeries, atrOf } from "./l6Eval.ts";
import { previewMarginSeries, previewModule } from "../moduleIntentPreview.ts";
import { customMetricSeries } from "../customMetricBridge.ts";
import { computeSignature } from "./sandboxSignature.ts";
import type { CustomL6Zone } from "./customL6.ts";
import type { CustomModule } from "../customModule.ts";

export interface RenderIndicator { key: string; params?: Record<string, number>; color?: string }
export interface StrategyRenderInput {
  bars: OhlcBar[];
  indicators?: RenderIndicator[];       // std price overlays (live-param + custom màu)
  zones?: CustomL6Zone[];               // L6 zone bands
  decisionModule?: CustomModule | null; // L4/L5 module → margin oscillator + fires markers
  scoreMetric?: string | null;          // evidence L1/L2/L3 id → oscillator (khi không có decisionModule)
}
export type RenderLayerKind = "line" | "band" | "zone" | "level" | "osc" | "marker";
export interface RenderLayer { id: string; label: string; kind: RenderLayerKind; color: string }
export interface StrategyRenderFeed {
  overlays: ChartOverlay[];
  markers: ChartMarker[];
  oscillator?: ChartOscillator;
  layers: RenderLayer[];
  warnings: string[];
}

const ZONE_ROLE_COL: Record<string, string> = { OBSERVE: "#5aa9ff", RISK: "#f7768e", DEMAND: "#3fb950", INVALIDATE: "#d29922" };

export function strategyRenderFeed(input: StrategyRenderInput): StrategyRenderFeed {
  const bars = input.bars || [];
  const overlays: ChartOverlay[] = []; const markers: ChartMarker[] = []; const layers: RenderLayer[] = []; const warnings: string[] = [];
  let oscillator: ChartOscillator | undefined;
  const n = bars.length;
  if (n < 2) return { overlays, markers, layers, warnings: ["chưa đủ nến"] };

  // ── std indicator overlays (custom màu + live-param) — price-space ──
  for (const ind of input.indicators ?? []) {
    const spec = STD_BY_KEY[ind.key];
    if (!spec) { warnings.push("indicator lạ: " + ind.key); continue; }
    const ov = spec.compute(bars, ind.params);
    (ov.lines ?? []).forEach((ln, k) => { const color = ind.color ?? ln.color; overlays.push({ id: `${ind.key}_l${k}`, points: ln.series, color, label: ln.name }); layers.push({ id: `${ind.key}_l${k}`, label: `${spec.name} · ${ln.name}`, kind: "line", color }); });
    if (ov.bands) { const color = ind.color ?? ov.bands.color; overlays.push({ id: `${ind.key}_b`, points: ov.bands.mid ?? [], color, band: { lo: ov.bands.lower, hi: ov.bands.upper }, label: spec.name }); layers.push({ id: `${ind.key}_b`, label: `${spec.name} (band)`, kind: "band", color }); }
    (ov.bandList ?? []).forEach((bd, k) => { const color = ind.color ?? bd.color; overlays.push({ id: `${ind.key}_bl${k}`, points: bd.mid ?? [], color, band: { lo: bd.lower, hi: bd.upper } }); layers.push({ id: `${ind.key}_bl${k}`, label: `${spec.name} band ${k + 1}`, kind: "band", color }); });
    if (ov.cloud) { const color = ind.color ?? ov.cloud.up; const cl = ov.cloud; const lo = cl.a.map((a, i) => Math.min(a, cl.b[i])); const hi = cl.a.map((a, i) => Math.max(a, cl.b[i])); overlays.push({ id: `${ind.key}_cloud`, points: [], color, band: { lo, hi }, label: spec.name + " cloud" }); layers.push({ id: `${ind.key}_cloud`, label: spec.name + " cloud", kind: "band", color }); }
    (ov.levels ?? []).forEach((lv, k) => { const color = ind.color ?? lv.color; overlays.push({ id: `${ind.key}_lv${k}`, points: new Array<number>(n).fill(lv.price), color, label: lv.label }); layers.push({ id: `${ind.key}_lv${k}`, label: `${spec.name} ${lv.label}`, kind: "level", color }); });
    // ov.sub = sub-panel oscillators (MACD/stoch) — không phải price overlay → Hub bỏ qua (thuộc lane dưới)
  }

  // ── L6 zone bands (center ± widthAtr·ATR) ──
  for (const z of input.zones ?? []) {
    const center = zoneCenterSeries(z, bars);
    const lo = center.map((c, i) => c - z.widthAtr * atrOf(bars, i));
    const hi = center.map((c, i) => c + z.widthAtr * atrOf(bars, i));
    const color = ZONE_ROLE_COL[z.role] ?? "#5aa9ff";
    overlays.push({ id: "zone_" + z.id, points: center, color, band: { lo, hi }, label: z.name });
    layers.push({ id: "zone_" + z.id, label: `Zone ${z.name} · ${z.role}`, kind: "zone", color });
  }

  // ── oscillator lane: L4/L5 decision margin (ưu tiên) HOẶC evidence score ──
  if (input.decisionModule) {
    const mr = previewMarginSeries(bars, input.decisionModule, customMetricSeries);
    if (mr.previewable) {
      const sig = computeSignature(mr.series, { warmup: 40 });
      oscillator = { series: mr.series, states: sig.states, color: "#79c0ff", label: "decision-margin", signed: true };
      layers.push({ id: "osc_decision", label: "Decision margin (" + input.decisionModule.role + ")", kind: "osc", color: "#79c0ff" });
      const fires = previewModule(bars, input.decisionModule).fires;
      for (const f of fires) markers.push({ i: f.i, kind: "buy" });
      if (fires.length) layers.push({ id: "mk_fires", label: "Quyết định bắn (" + fires.length + ")", kind: "marker", color: "#2BB673" });
    } else warnings.push("decision NO_DATA (metric cần trạng thái lệnh): " + mr.naMetrics.join(","));
  } else if (input.scoreMetric) {
    const s = customMetricSeries(input.scoreMetric, bars);
    if (s && s.length === n) { const sig = computeSignature(s, { warmup: 5 }); oscillator = { series: s, states: sig.states, color: "#a371f7", label: input.scoreMetric, signed: true }; layers.push({ id: "osc_score", label: "Score " + input.scoreMetric, kind: "osc", color: "#a371f7" }); }
    else warnings.push("scoreMetric không resolve: " + input.scoreMetric);
  }

  return { overlays, markers, oscillator, layers, warnings };
}
