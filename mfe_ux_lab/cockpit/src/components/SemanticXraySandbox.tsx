// SemanticXraySandbox — a single visual contract across Block, Module and Strategy Card.
// Presentation/research only. TRACE_UNAVAILABLE is shown instead of inventing runtime evidence.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { BlockPlayground } from "./BlockPlayground.tsx";
import { ModuleIntentSandbox } from "./ModuleIntentSandbox.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { L1PrimitiveBlockSpec } from "../lib/blocks/blockTypes.ts";
import type { CustomModule } from "../lib/customModule.ts";
import type { ModuleCensusEntry } from "../lib/cardBeastV2/moduleRoleCensus.ts";
import { MODULE_CENSUS } from "../lib/cardBeastV2/moduleRoleCensus.ts";
import type { StrategyCardArtifactRecord } from "../lib/artifactRegistry.ts";
import {
  STAGE_META, projectBlock, projectCustomModule, projectEngineModule, projectStrategyCard,
  type SemanticProjection, type SemanticStage,
} from "../lib/semanticSandboxModel.ts";

export type SemanticSandboxTarget =
  | { kind: "BLOCK"; block: L1PrimitiveBlockSpec }
  | { kind: "ENGINE_MODULE"; module: ModuleCensusEntry }
  | { kind: "CUSTOM_MODULE"; module: CustomModule }
  | { kind: "STRATEGY_CARD"; card: StrategyCardArtifactRecord; customModules?: CustomModule[] };

const ORDER: SemanticStage[] = ["INPUT", "MEASURE", "CONTEXT", "CANDIDATE", "GATE", "WEIGHT", "FUSION", "EXIT", "OUTPUT", "UNKNOWN"];
const chip = (text: string, color: string) => <span style={{ border: "1px solid " + color + "66", background: color + "14", color, borderRadius: 5, padding: "2px 7px", fontSize: 9.5, fontWeight: 800 }}>{text}</span>;

function projectionOf(target: SemanticSandboxTarget): SemanticProjection {
  if (target.kind === "BLOCK") return projectBlock(target.block);
  if (target.kind === "ENGINE_MODULE") return projectEngineModule(target.module);
  if (target.kind === "CUSTOM_MODULE") return projectCustomModule(target.module);
  return projectStrategyCard(target.card, MODULE_CENSUS, target.customModules || []);
}

function FlowMap({ projection }: { projection: SemanticProjection }) {
  const used = ORDER.filter((stage) => projection.nodes.some((n) => n.stage === stage));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, used.length)}, minmax(145px,1fr))`, gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {used.map((stage) => {
          const meta = STAGE_META[stage], nodes = projection.nodes.filter((n) => n.stage === stage);
          return (
            <div key={stage} style={{ minWidth: 145, border: "1px solid " + meta.color + "55", borderRadius: 9, background: "#0a1119", overflow: "hidden" }}>
              <div style={{ background: meta.color + "18", borderBottom: "1px solid " + meta.color + "44", color: meta.color, padding: "6px 8px", fontSize: 10.5, fontWeight: 850 }}>
                {meta.label} <span style={{ float: "right", opacity: .75 }}>{nodes.length}</span>
              </div>
              <div style={{ padding: 7, display: "flex", flexDirection: "column", gap: 6 }}>
                {nodes.map((node) => (
                  <div key={node.id} title={node.detail} style={{ border: "1px solid " + (meta.color), background: "#111a24", borderRadius: 4, padding: "6px 7px" }}>
                    <div style={{ color: "#e7eef6", fontSize: 10.5, fontWeight: 750, overflowWrap: "anywhere" }}>{node.label}</div>
                    <div style={{ color: TK.muted, fontSize: 9, lineHeight: 1.35, marginTop: 2 }}>{node.detail}</div>
                    {node.warning && <div style={{ color: TK.orange, fontSize: 8.5, marginTop: 3 }}><Glyph name="warning" size={9} /> {node.warning}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
        {projection.links.map((link, i) => <span key={i} style={{ fontSize: 9, color: TK.text2, border: "1px solid #22303f", borderRadius: 4, padding: "2px 6px", fontFamily: "var(--mfe-mono)" }}>{link.from} → {link.to} · {link.label}</span>)}
      </div>
    </div>
  );
}

function ImpactMatrix({ projection }: { projection: SemanticProjection }) {
  const moduleNodes = projection.nodes.filter((n) => n.source === "MODULE");
  const columns: SemanticStage[] = ["MEASURE", "CONTEXT", "CANDIDATE", "GATE", "WEIGHT", "FUSION", "EXIT"];
  if (!moduleNodes.length) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 9.5 }}>
        <thead><tr><th style={{ textAlign: "left", padding: 5, color: TK.muted }}>Module</th>{columns.map((c) => <th key={c} style={{ padding: 5, color: STAGE_META[c].color }}>{STAGE_META[c].label}</th>)}</tr></thead>
        <tbody>{moduleNodes.map((node) => <tr key={node.id} style={{ borderTop: "1px solid #182331" }}>
          <td style={{ padding: "5px 6px", color: TK.text, fontFamily: "var(--mfe-mono)" }}>{node.label}</td>
          {columns.map((c) => <td key={c} style={{ textAlign: "center", padding: 4 }}><span title={node.stage === c ? node.detail : "No authority at this stage"} style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: node.stage === c ? STAGE_META[c].color : "#151e28", border: "1px solid " + (node.stage === c ? STAGE_META[c].color : "#263443") }} /></td>)}
        </tr>)}</tbody>
      </table>
    </div>
  );
}

function RuntimeEvidence({ target, projection, bars }: { target: SemanticSandboxTarget; projection: SemanticProjection; bars: OhlcBar[] }) {
  if (target.kind === "BLOCK") return bars.length ? <BlockPlayground block={target.block} bars={bars} W={560} H={120} /> : <div className="pmut">Loading completed M15 observations…</div>;
  if (target.kind === "CUSTOM_MODULE") return <ModuleIntentSandbox draft={target.module} valid />;
  if (target.kind === "ENGINE_MODULE") return (
    <div style={{ border: "1px dashed #4a3b22", borderRadius: 8, padding: 10, background: "#17130c" }}>
      <div style={{ color: TK.orange, fontWeight: 800, fontSize: 11 }}><Glyph name="warning" size={11} /> TRACE_UNAVAILABLE</div>
      <div style={{ color: TK.text2, fontSize: 10.5, marginTop: 4 }}>The engine census identifies this mechanism, but a separate per-bar trace is unavailable. Only its contract is displayed; no event marker is invented.</div>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 7 }}>
      {projection.metrics.length ? projection.metrics.map((m) => <div key={m.label} style={{ background: "#0b141e", border: "1px solid #233244", borderRadius: 8, padding: 8 }}>
        <div style={{ color: TK.muted, fontSize: 9 }}>{m.label}</div><div style={{ color: TK.text, fontSize: 17, fontFamily: "var(--mfe-mono)", fontWeight: 800 }}>{m.value}</div>
        <div style={{ color: m.provenance === "ARTIFACT" ? TK.green : TK.cyan, fontSize: 8.5 }}>{m.provenance}</div>
      </div>) : <div style={{ color: TK.orange, fontSize: 10.5 }}>No verified Card metrics are available. Run validation to obtain a receipt instead of a structural performance estimate.</div>}
    </div>
  );
}

export function SemanticXraySandbox({ target, onClose }: { target: SemanticSandboxTarget; onClose: () => void }) {
  const projection = useMemo(() => projectionOf(target), [target]);
  const [bars, setBars] = useState<OhlcBar[]>([]);
  useEffect(() => { let live = true; loadSimOhlc("M15", false).then((d) => { if (live) setBars((d?.bars || []).slice(-320)); }); return () => { live = false; }; }, []);
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  const traceColor = projection.traceStatus === "TRACE_UNAVAILABLE" ? TK.orange : projection.traceStatus === "ARTIFACT_METRICS" ? TK.green : TK.cyan;

  return (
    <div role="dialog" aria-modal="true" aria-label="Semantic X-Ray Sandbox" style={{ position: "fixed", inset: 0, zIndex: 190, background: "#060a0fee", backdropFilter: "blur(4px)", overflowY: "auto", padding: 12, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", background: "#090f17", border: "1px solid #29425b", borderRadius: 12, boxShadow: "0 18px 70px #000b", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "9px 12px", borderBottom: "1px solid #243343", background: "#0d1620" }}>
          <Glyph name="microscope" size={15} /> <b style={{ color: "#dcecff", fontSize: 14 }}>Semantic X-Ray Sandbox</b>
          {chip(projection.kind, TK.cyan)} {chip(projection.layer, TK.purple)} {chip(projection.role, "#ff9f43")} {chip(projection.traceStatus, traceColor)}
          <span style={{ color: TK.muted, fontSize: 10 }}>SHADOW_ONLY · NO_DECISION · visualization ≠ edge</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "#121c27", border: "1px solid #35495d", color: TK.text, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}><Glyph name="x" size={11} /> Close</button>
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(260px,.32fr)", gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 850, color: "#eef6ff" }}>{projection.name}</div>
              <div style={{ fontSize: 11.5, color: TK.text2, margin: "3px 0 10px" }}>{projection.summary}</div>
              <div className="pc" style={{ margin: 0 }}><div className="pc-h">Source, mechanism and effect</div><FlowMap projection={projection} /></div>
              {projection.kind === "STRATEGY_CARD" && <div className="pc" style={{ margin: "10px 0 0" }}><div className="pc-h">Module authority matrix</div><ImpactMatrix projection={projection} /></div>}
              <div className="pc" style={{ margin: "10px 0 0" }}><div className="pc-h">Runtime evidence <span className="mut">Only source-backed observations are displayed. Missing traces remain unavailable.</span></div><RuntimeEvidence target={target} projection={projection} bars={bars} /></div>
            </div>
            <div>
              <div className="pc" style={{ margin: 0 }}>
                <div className="pc-h">Inspector contract</div>
                <div style={{ marginBottom: 8 }}>{chip(projection.mechanism, "#8295aa")}</div>
                <div style={{ fontSize: 9.5, color: TK.muted, textTransform: "uppercase", marginBottom: 3 }}>Inputs</div>
                {projection.inputs.map((x) => <div key={x} style={{ fontSize: 10.5, padding: "2px 0", color: TK.text2 }}>→ {x}</div>)}
                <div style={{ fontSize: 9.5, color: TK.muted, textTransform: "uppercase", margin: "9px 0 3px" }}>Outputs</div>
                {projection.outputs.map((x) => <div key={x} style={{ fontSize: 10.5, padding: "2px 0", color: TK.green }}>← {x}</div>)}
                <div style={{ fontSize: 9.5, color: TK.muted, textTransform: "uppercase", margin: "9px 0 3px" }}>Authority & safety</div>
                {projection.authority.map((x) => <div key={x} style={{ fontSize: 10.5, padding: "2px 0", color: /no |cannot|false/i.test(x) ? TK.orange : TK.text2 }}><Glyph name="check" size={9} /> {x}</div>)}
                <div style={{ fontSize: 9.5, color: TK.muted, textTransform: "uppercase", margin: "9px 0 3px" }}>Lineage</div>
                <div style={{ color: TK.cyan, fontFamily: "var(--mfe-mono)", fontSize: 9.5, overflowWrap: "anywhere" }}>{projection.lineage.join(" → ")}</div>
              </div>
              <div className="pc" style={{ margin: "10px 0 0" }}>
                <div className="pc-h">Mechanism reference</div>
                {ORDER.filter((s) => projection.nodes.some((n) => n.stage === s)).map((s) => <div key={s} style={{ display: "grid", gridTemplateColumns: "10px 85px 1fr", gap: 6, alignItems: "start", marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: STAGE_META[s].color, marginTop: 3 }} /><b style={{ color: STAGE_META[s].color, fontSize: 9.5 }}>{STAGE_META[s].label}</b><span style={{ color: TK.muted, fontSize: 9.5 }}>{STAGE_META[s].meaning}</span>
                </div>)}
              </div>
              {projection.warnings.length > 0 && <div className="pc" style={{ margin: "10px 0 0", borderColor: TK.orange + "66" }}><div className="pc-h" style={{ color: TK.orange }}>Limitations</div>{projection.warnings.map((w, i) => <div key={i} style={{ color: TK.text2, fontSize: 10.5, marginBottom: 6 }}><Glyph name="warning" size={10} /> {w}</div>)}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
