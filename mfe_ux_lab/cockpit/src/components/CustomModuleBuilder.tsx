// CustomModuleBuilder — author a module constrained to a per-level template. No free code: pick level →
// role → fill a parameterized form → explain (gate) → validate → save (SHADOW). Conditions read a fixed
// metric catalog. Executable levels (L0/L4/L5) run in the engine; L1/L2/L3/L6 are authored+advisory.
import { useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { L1ModuleSandbox } from "./L1ModuleSandbox.tsx";
import { ModuleIntentSandbox } from "./ModuleIntentSandbox.tsx";
import { buildMasterPrompt, buildOrchestratorPrompt, buildLayerPack, parseAiModule, explainSections, PACK_LAYERS, type PackLayer } from "../lib/aiContextPack.ts";
import { LEVEL_TEMPLATES, METRICS, metricsForScope, validateModule, loadCustomModules, saveCustomModules, MODULE_PRESETS, CREATABLE_LEVELS, EXECUTABLE_ROLES, type CustomModule, type Condition, type Level, type Role, type Op } from "../lib/customModule.ts";
import { listCustomMetrics, customMetricKeys } from "../lib/customMetricBridge.ts";

// step 1 = choose a layer. L1 opens the visual block Sandbox; L4/L5 use the condition form below.
const PICK_LEVELS: Level[] = [1, ...CREATABLE_LEVELS];

const OPS: Op[] = [">", "<", ">=", "<=", "==", "between", "outside"];
const inp: React.CSSProperties = { background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "4px 7px", fontSize: 12 };
const ROLE_LABEL: Record<Role, string> = { SAFETY_VETO: "Safety veto", FEATURE: "Feature", INDICATOR: "Indicator", ALGORITHM: "Algorithm", CONTEXT_GATE: "Context gate", TRIGGER: "Trigger (vote)", VETO: "Setup veto", CONFIRM: "Confirmation: scales weight without creating a setup", EXIT: "Simulated exit rule", ZONE: "Zone" };

export function CustomModuleBuilder({ onClose, onSaved, initialLevel }: { onClose: () => void; onSaved: (m: CustomModule) => void; initialLevel?: Level }) {
  const [level, setLevel] = useState<Level>(initialLevel ?? 5);
  const tmpl = LEVEL_TEMPLATES[level];
  const [role, setRole] = useState<Role>(tmpl.roles[0]);
  const [name, setName] = useState("");
  const [explain, setExplain] = useState("");
  const [why, setWhy] = useState("");
  const [logic, setLogic] = useState<"ALL" | "ANY">("ALL");
  const [conditions, setConditions] = useState<Condition[]>([{ metric: "rsi", op: ">", value: 70 }]);
  const [direction, setDirection] = useState<"LONG" | "SHORT" | "REGIME">("LONG");
  const [exitAction, setExitAction] = useState<"CLOSE" | "BREAKEVEN" | "LOCK_SL">("CLOSE");
  const [lockR, setLockR] = useState(0.5);
  // ── AI round-trip "vibe coding": user tả ý tưởng TỔNG QUÁT → master pack cho AI của họ → dán JSON về → hệ kiểm
  // → trích lời AI + popup 5-mục → thấy module chạy live. per-tầng là tuỳ-chọn nâng-cao (mặc định master). ──
  const [idea, setIdea] = useState("");
  const [advLayer, setAdvLayer] = useState<PackLayer>("L5");
  const [aiJson, setAiJson] = useState("");
  const [aiMsg, setAiMsg] = useState("");
  const [aiExpl, setAiExpl] = useState<string | undefined>(undefined);   // lời AI giải thích (trích khi import — hiển thị NGUYÊN VĂN)
  const [copied, setCopied] = useState<"" | "master" | "layer" | "orch">("");
  const [edited, setEdited] = useState(false);   // user đã sửa tay sau import? → giải thích theo block
  function copyText(t: string, which: "master" | "layer" | "orch") {
    try { navigator.clipboard?.writeText(t); } catch { /* clipboard chặn → user tự copy từ textarea nếu cần */ }
    setCopied(which); setTimeout(() => setCopied(""), 1600);
  }
  function importAi() {
    const r = parseAiModule(aiJson);
    if (!r.ok) { setAiMsg("⛔ " + r.errors.join(" · ")); setAiExpl(undefined); return; }
    const m = r.module!;
    applyPreset(m); setEdited(false); setAiExpl(r.aiExplanation);   // rơi vào form → validate + Intent Sandbox live
    setAiMsg(`Accepted “${m.name}" (L${m.level} · ${m.role})${r.strippedFields.length ? ` · removed fields outside role authority:${r.strippedFields.join(", ")}` : ""}`);
  }

  const scope = role === "EXIT" ? "exit" : "entry";
  const metricOpts = metricsForScope(scope);
  const evMetrics = useMemo(() => listCustomMetrics(), []);   // [[block-is-fixed-foundation-doctrine]] module evidence đã build → metric hạng nhất
  const evKeys = useMemo(() => customMetricKeys(), []);
  const condRole = (["SAFETY_VETO", "CONTEXT_GATE", "TRIGGER", "VETO", "EXIT"] as Role[]).includes(role);

  function pickLevel(l: Level) { setLevel(l); const r = LEVEL_TEMPLATES[l].roles[0]; setRole(r); }
  function applyPreset(d: Partial<CustomModule>) {
    if (d.level != null) setLevel(d.level); if (d.role) setRole(d.role);
    setName(d.name || ""); setExplain(d.explain || ""); setWhy(d.why || ""); setLogic(d.logic || "ALL");
    setConditions(d.conditions && d.conditions.length ? d.conditions : [{ metric: "rsi", op: ">", value: 70 }]);
    if (d.direction) setDirection(d.direction); if (d.exitAction) setExitAction(d.exitAction); if (typeof d.lockR === "number") setLockR(d.lockR);
  }
  const setCond = (i: number, patch: Partial<Condition>) => { setEdited(true); setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c))); };

  const draft: Partial<CustomModule> = { level, role, name, explain, why, conditions: condRole ? conditions : [], logic, direction: role === "TRIGGER" ? direction : undefined, exitAction: role === "EXIT" ? exitAction : undefined, lockR: role === "EXIT" && exitAction === "LOCK_SL" ? lockR : undefined };
  const v = useMemo(() => validateModule(draft, evKeys), [level, role, name, explain, why, conditions, logic, direction, exitAction, lockR, evKeys]);
  const mLabel = (k: string) => METRICS.find((x) => x.key === k)?.label || evMetrics.find((x) => x.key === k)?.label || k;
  const condText = (c: Condition) => `${mLabel(c.metric)} ${c.op} ${c.value}${c.op === "between" || c.op === "outside" ? ".." + (c.value2 ?? "?") : ""}`;
  const sentence = !condRole ? `(${ROLE_LABEL[role]} · reference context, not an executable contribution` :
    (role === "TRIGGER" ? `Vote ${direction} when ` : role === "EXIT" ? `${exitAction === "BREAKEVEN" ? "Move the simulated protective stop to break-even" : exitAction === "LOCK_SL" ? `Tighten the simulated stop to lock ${lockR}R` : "Close the simulated position"} when ` : role === "CONTEXT_GATE" ? "Allow a candidate when " : "Veto a candidate when ") + conditions.map(condText).join(logic === "ALL" ? " AND " : " OR ");
  // the machine rule the engine actually runs (auto-generated from your choices — this IS the "code")
  const action = role === "TRIGGER" ? `VOTE ${direction}` : role === "EXIT" ? (exitAction === "BREAKEVEN" ? "MOVE_SL→BREAKEVEN" : exitAction === "LOCK_SL" ? `LOCK_SL@+${lockR}R (protective)` : "CLOSE_POSITION") : role === "CONTEXT_GATE" ? "ALLOW_ENTRY" : "VETO_ENTRY";
  const condExpr = conditions.map((c) => `${c.metric} ${c.op} ${c.value}${c.op === "between" || c.op === "outside" ? ".." + (c.value2 ?? "?") : ""}`).join(logic === "ALL" ? " AND " : " OR ");
  const compiled = !condRole ? "(advisory — no executable rule in v1)" : role === "CONTEXT_GATE" ? `ENTRY allowed ONLY IF ( ${condExpr} )` : `IF ( ${condExpr} ) THEN ${action}`;

  function save() {
    if (!v.ok) return;
    const m: CustomModule = { id: "cm_" + Date.now().toString(36), level, role, name: name.trim(), explain: explain.trim(), why: why.trim(), conditions: condRole ? conditions : [], logic, direction: role === "TRIGGER" ? direction : undefined, exitAction: role === "EXIT" ? exitAction : undefined, lockR: role === "EXIT" && exitAction === "LOCK_SL" ? lockR : undefined, status: "SHADOW", createdAt: new Date().toISOString() };
    saveCustomModules([m, ...loadCustomModules()]); onSaved(m); onClose();
  }

  // L1 = visual block Sandbox (a different authoring surface from the L4/L5 condition form).
  if (level === 1) return <L1ModuleSandbox onClose={onClose} onSaved={() => { /* keep open for test + qualify */ }} />;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(2,6,12,.72)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="pc" style={{ width: 640, maxWidth: "100%", borderColor: "#43306a" }}>
        <div className="pc-h violet"><Glyph name="plus" size={12} /> Create module <span className="mut">from a parameterized layer template{level} · {tmpl.title}</span></div>

        <div className="pmut psm" style={{ marginBottom: 6 }}>{tmpl.role_desc} <b style={{ color: tmpl.executable ? TK.green : TK.orange }}>{tmpl.executable ? "Executable in the simulator" : "Reference context only"}</b></div>
        <div style={{ background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)", borderRadius: 7, padding: "7px 10px", marginBottom: 8, fontSize: 11, lineHeight: 1.5 }}>
          <b style={{ color: TK.cyan }}>No source code is required.</b> Compose <b>conditions</b> using a metric, comparison and value. The builder generates a <b>machine-readable rule</b> for each evaluated bar. The <b>purpose and rationale</b> are <b>validation metadata</b> used to reject unexplained definitions. <i>not</i> logic.
        </div>

        {/* ══ HERO: Vibe coding — tả ý tưởng → AI của bạn xây → dán về → thấy chạy. Đặt ĐẦU cho dễ thấy. ══ */}
        <div style={{ border: "1.5px solid #2f81f7", borderRadius: 10, padding: "9px 11px", marginBottom: 10, background: "linear-gradient(180deg, rgba(31,111,235,.10), rgba(31,111,235,.02))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <b style={{ fontSize: 13, color: "#5aa9ff" }}><Glyph name="robot" size={13} /> External authoring tools</b>
            <span className="pmut" style={{ fontSize: 10 }}>Describe an idea or import a parameterized definition</span>
          </div>
          {/* ① tả ý tưởng — nhập thẳng, tự đóng vào prompt */}
          <div className="pmut psm" style={{ marginBottom: 3 }}><b style={{ color: "#5aa9ff" }}>1. Describe your idea</b> (a broad idea is sufficient):</div>
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={"For example: require a resolved trend, avoid extended entries, and exit when momentum weakens."} style={{ ...inp, width: "100%", minHeight: 46, fontSize: 12.5, resize: "vertical", marginBottom: 6 }} />
          {/* ② copy prompt (đã nhét ý tưởng vào) → dán cho AI */}
          <div className="pmut psm" style={{ marginBottom: 3 }}><b style={{ color: "#5aa9ff" }}>② Copy prompt</b> The exported specification includes your idea. Use it with your own assistant:</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            <button style={{ ...inp, cursor: "pointer", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 800, padding: "6px 14px" }} onClick={() => copyText(buildMasterPrompt(idea), "master")}>{copied === "master" ? <><Glyph name="check" size={11} /> Copied — paste into your assistant</> : <><Glyph name="export" size={11} /> Copy prompt cho AI</>}</button>
            <button style={{ ...inp, cursor: "pointer", fontSize: 10.5, background: "rgba(167,139,250,.12)", color: "#a78bfa", borderColor: "#43306a" }} onClick={() => copyText(buildOrchestratorPrompt(idea), "orch")} title={"A multi-layer brief lets your external assistant request the specific layer contracts it needs."}>{copied === "orch" ? <><Glyph name="check" size={10} /> brief</> : <><Glyph name="score" size={10} /> Multi-layer brief</>}</button>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} title={"Export one layer specification"}>
              <button style={{ ...inp, cursor: "pointer", fontSize: 10.5 }} onClick={() => copyText(buildLayerPack(advLayer), "layer")}>{copied === "layer" ? <><Glyph name="check" size={10} /> layer {advLayer}</> : "by layer"}</button>
              <select style={{ ...inp, fontSize: 10.5 }} value={advLayer} onChange={(e) => setAdvLayer(e.target.value as PackLayer)}>{PACK_LAYERS.map((L) => <option key={L} value={L}>{L}</option>)}</select>
            </span>
          </div>
          <div className="pmut" style={{ fontSize: 9, marginBottom: 8, lineHeight: 1.5 }}><b>Copy prompt</b> requests a single module definition. <b><Glyph name="score" size={10} /> A multi-layer brief</b> can be followed by individual layer specifications. Select <b>by layer</b> the appropriate layer before importing the returned definition.</div>
          {/* ③ dán module AI trả về → hệ validate → thấy chạy ở dưới */}
          <div className="pmut psm" style={{ marginBottom: 3 }}><b style={{ color: "#5aa9ff" }}>3. Import the returned definition</b> The application validates its schema and role before showing the result.</div>
          <textarea value={aiJson} onChange={(e) => setAiJson(e.target.value)} placeholder={"Paste a parameterized module JSON definition with an explanation…"} style={{ ...inp, width: "100%", minHeight: 46, fontFamily: "var(--mfe-mono,monospace)", fontSize: 11, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button disabled={!aiJson.trim()} style={{ ...inp, cursor: aiJson.trim() ? "pointer" : "not-allowed", background: aiJson.trim() ? "#21D07A" : "var(--mfe-s3)", color: aiJson.trim() ? "#06101a" : "var(--mfe-muted)", border: "none", fontWeight: 800 }} onClick={importAi}><Glyph name="import" size={12} /> Validate imported module</button>
            {aiMsg && <span className="psm" style={{ color: aiMsg.startsWith("⛔") ? TK.orange : TK.green }}>{aiMsg}</span>}
          </div>
          {aiExpl && !edited && (
            <div style={{ marginTop: 6, background: "rgba(37,183,255,.06)", border: "1px solid #1c4a5b", borderRadius: 7, padding: "6px 9px" }}>
              <div className="psm" style={{ color: TK.text }}><b style={{ color: TK.cyan }}><Glyph name="chat" size={11} /> Source description:</b> {aiExpl}</div>
              <div className="pmut" style={{ fontSize: 9, marginTop: 3, fontStyle: "italic" }}><Glyph name="balance" size={9} /> The imported explanation describes intent. <b>Performance is measured only by a strategy run</b> . A valid definition does not establish an edge.</div>
            </div>
          )}
          <div className="pmut" style={{ fontSize: 9, marginTop: 6, fontStyle: "italic", textAlign: "center" }}>Or compose the conditions directly below</div>
        </div>

        {/* presets — one-click ready modules */}
        <div style={{ marginBottom: 8 }}>
          <div className="pmut psm" style={{ marginBottom: 4 }}><Glyph name="clipboard" size={11} /> Editable templates:</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {MODULE_PRESETS.map((p, i) => <button key={i} onClick={() => applyPreset(p.draft)} style={{ ...inp, cursor: "pointer", fontSize: 11, background: "rgba(33,208,122,.10)", color: TK.green, borderColor: "#1c5b3c" }}>{p.label}</button>)}
          </div>
        </div>

        {/* level — only the levels that ACTUALLY RUN are createable (L4 gate · L5 logic) */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
          <span className="pmut psm">Layer:</span>
          {PICK_LEVELS.map((l) => <button key={l} onClick={() => pickLevel(l)} style={{ ...inp, cursor: "pointer", fontWeight: 700, background: l === level ? "rgba(157,92,255,.22)" : "var(--mfe-s3)", color: l === level ? TK.purple : "var(--mfe-text2)" }}>L{l} {l === 1 ? <>Feature · Sandbox <Glyph name="puzzle" size={10} /></> : LEVEL_TEMPLATES[l].title.split("·")[1]?.trim()}</button>)}
          <span className="pmut" style={{ fontSize: 10 }}>L1 opens the graph sandbox. L4 and L5 use condition forms.</span>
        </div>
        {/* role */}
        {tmpl.roles.length > 1 && <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>{tmpl.roles.map((r) => <button key={r} onClick={() => setRole(r)} style={{ ...inp, cursor: "pointer", fontWeight: 700, background: r === role ? "rgba(37,183,255,.18)" : "var(--mfe-s3)", color: r === role ? TK.cyan : "var(--mfe-text2)" }}>{ROLE_LABEL[r]}</button>)}</div>}

        <label style={{ display: "block", marginBottom: 8 }}><div className="pmut psm">Module name</div><input style={{ ...inp, width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} placeholder={"For example: exclude a low-activity session"} /></label>

        {/* role-specific controls */}
        {role === "TRIGGER" && <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}><span className="pmut psm">Direction:</span>{(["LONG", "SHORT", "REGIME"] as const).map((d) => <button key={d} onClick={() => setDirection(d)} style={{ ...inp, cursor: "pointer", background: d === direction ? "rgba(33,208,122,.18)" : "var(--mfe-s3)", color: d === direction ? TK.green : "var(--mfe-text2)" }}>{d}</button>)}</div>}
        {role === "EXIT" && <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}><span className="pmut psm">Simulated action:</span>{(["CLOSE", "BREAKEVEN", "LOCK_SL"] as const).map((a) => <button key={a} onClick={() => setExitAction(a)} style={{ ...inp, cursor: "pointer", background: a === exitAction ? "rgba(33,208,122,.18)" : "var(--mfe-s3)", color: a === exitAction ? TK.green : "var(--mfe-text2)" }}>{a === "CLOSE" ? "Close simulated position" : a === "BREAKEVEN" ? "Protect at break-even" : "Tighten protective stop"}</button>)}{exitAction === "LOCK_SL" && <><span className="pmut psm">lock at +</span><input type="number" step={0.1} min={0} value={lockR} onChange={(e) => setLockR(+e.target.value || 0)} style={{ ...inp, width: 64 }} /><span className="pmut psm">R, tighten only</span></>}</div>}

        {/* conditions */}
        {condRole && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ fontWeight: 800, color: TK.cyan, fontSize: 12 }}>1. Executable conditions</span><span className="pmut" style={{ fontSize: 10 }}>(metric {scope})</span><div style={{ display: "inline-flex", border: "1px solid var(--mfe-border)", borderRadius: 6, overflow: "hidden", marginLeft: "auto" }}>{(["ALL", "ANY"] as const).map((g) => <button key={g} onClick={() => setLogic(g)} style={{ ...inp, border: "none", borderRadius: 0, cursor: "pointer", background: g === logic ? "rgba(37,183,255,.18)" : "transparent", color: g === logic ? TK.cyan : "var(--mfe-text2)" }}>{g === "ALL" ? "ALL" : "ANY"}</button>)}</div></div>
            {conditions.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 5, marginBottom: 4, alignItems: "center", flexWrap: "wrap" }}>
                <select style={{ ...inp, flex: "1 1 160px" }} value={c.metric} onChange={(e) => setCond(i, { metric: e.target.value })}><optgroup label="Metric built-in (29)">{metricOpts.map((m) => <option key={m.key} value={m.key}>{m.label} {m.unit ? "(" + m.unit + ")" : ""}</option>)}</optgroup>{evMetrics.length > 0 && <optgroup label={"Existing L1/L2/L3 evidence"}>{evMetrics.map((m) => <option key={m.key} value={m.key}>{m.label} · {m.layer}</option>)}</optgroup>}</select>
                <select style={inp} value={c.op} onChange={(e) => setCond(i, { op: e.target.value as Op })}>{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                <input style={{ ...inp, width: 70 }} type="number" value={c.value} onChange={(e) => setCond(i, { value: parseFloat(e.target.value) })} />
                {(c.op === "between" || c.op === "outside") && <input style={{ ...inp, width: 70 }} type="number" value={c.value2 ?? 0} onChange={(e) => setCond(i, { value2: parseFloat(e.target.value) })} />}
                {conditions.length > 1 && <button style={{ ...inp, cursor: "pointer", color: TK.red }} onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}><Glyph name="x" size={11} /></button>}
              </div>
            ))}
            <button style={{ ...inp, cursor: "pointer", color: TK.cyan }} onClick={() => setConditions((cs) => [...cs, { metric: metricOpts[0].key, op: ">", value: 0 }])}>Add condition</button>
            <div className="pmut" style={{ fontSize: 10, marginTop: 3 }}>{METRICS.find((m) => m.key === conditions[0]?.metric)?.hint}</div>
          </div>
        )}

        {/* explainability gate */}
        <div style={{ fontWeight: 800, color: TK.orange, fontSize: 12, marginBottom: 4 }}>2. Explanation <span className="pmut" style={{ fontWeight: 400, fontSize: 10 }}>Required metadata; not executable logic</span></div>
        <label style={{ display: "block", marginBottom: 6 }}><div className="pmut psm">Purpose, at least 12 characters</div><input style={{ ...inp, width: "100%" }} value={explain} onChange={(e) => setExplain(e.target.value)} /></label>
        <label style={{ display: "block", marginBottom: 8 }}><div className="pmut psm">Rationale, at least 12 characters</div><input style={{ ...inp, width: "100%" }} value={why} onChange={(e) => setWhy(e.target.value)} /></label>

        {/* popup 5-mục — user hiểu NGAY module làm gì (lời AI nếu chưa sửa; block-composed nếu đã sửa tay).
            AUTHORITY + VỊ-TRÍ derive từ type-system của HỆ, không tin AI tự khai. */}
        {condRole && v.ok && (() => { const s = explainSections(draft, edited ? undefined : aiExpl); return (
          <div className="pc" style={{ margin: "0 0 8px", borderColor: "#43306a", background: "var(--mfe-s2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><b style={{ fontSize: 12.5, color: "#a78bfa" }}>{name || "(module)"}</b><span className="pmut psm">L{level} · {ROLE_LABEL[role]}</span>{!edited && aiExpl && <span style={{ marginLeft: "auto", fontSize: 9, color: TK.cyan, border: "1px solid #1c4a5b", borderRadius: 4, padding: "0 5px" }}>imported explanation</span>}{edited && <span style={{ marginLeft: "auto", fontSize: 9, color: TK.orange, border: "1px solid #5a3a18", borderRadius: 4, padding: "0 5px" }}>edited explanation</span>}</div>
            <div className="psm" style={{ marginBottom: 3 }}><b style={{ color: TK.cyan }}><Glyph name="wrench" size={11} /> Purpose:</b> {s.whatItDoes}</div>
            <div className="psm" style={{ marginBottom: 3 }}><b style={{ color: TK.cyan }}><Glyph name="gear" size={11} /> Mechanism:</b> {s.mechanism}</div>
            <div className="psm" style={{ marginBottom: 3 }}><b style={{ color: TK.cyan }}><Glyph name="link" size={11} /> Layer:</b> {s.position}</div>
            <div className="psm" style={{ marginBottom: 3, color: "#f0d68a" }}><b style={{ color: TK.orange }}><Glyph name="shield" size={11} /> Authority:</b> {s.authority}</div>
            <div className="psm" style={{ color: "var(--mfe-muted)" }}><b><Glyph name="warning" size={10} /> Limitations:</b> {s.limits}</div>
          </div>
        ); })()}

        {/* Intent Sandbox — thấy module bắn ĐÚNG Ý trên nến thật (chỉ role chạy được: L0/L4/L5) */}
        {condRole && (
          <div className="pc" style={{ margin: "0 0 8px", borderColor: "#43306a", background: "var(--mfe-s2)" }}>
            <ModuleIntentSandbox draft={draft as CustomModule} valid={v.ok} />
          </div>
        )}

        {/* preview + validation */}
        <div className="pc" style={{ margin: 0, borderColor: v.ok ? "#1c5b3c" : "#5a3a1a", background: "var(--mfe-s2)" }}>
          <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}>Generated rule evaluated by the simulator</div>
          <div className="pmono" style={{ fontSize: 12, color: TK.green, margin: "3px 0 6px", wordBreak: "break-word" }}>{compiled}</div>
          <div className="psm"><b style={{ color: TK.cyan }}>Rule explanation:</b> {sentence}</div>
          {v.ok ? <div className="psm" style={{ color: TK.green, marginTop: 3 }}><Glyph name="check" size={11} /> Schema valid. The definition remains Shadow until the required validation is completed. <b>Valid does not mean profitable</b> . Run the combined Card to obtain measured evidence.</div>
            : <div style={{ marginTop: 3 }}>{v.errors.map((e, i) => <div key={i} className="psm" style={{ color: TK.orange }}><Glyph name="warning" size={10} /> {e}</div>)}</div>}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
          <button style={{ ...inp, cursor: "pointer" }} onClick={onClose}>Cancel</button>
          <button disabled={!v.ok} style={{ ...inp, cursor: v.ok ? "pointer" : "not-allowed", background: v.ok ? "#1f6feb" : "var(--mfe-s3)", color: v.ok ? "#fff" : "var(--mfe-muted)", border: "none", fontWeight: 800, padding: "6px 16px" }} onClick={save}>Save module</button>
        </div>
        <div className="pfoot" style={{ marginTop: 6 }}>A parameterized, interpretable definition; not arbitrary executable code. {EXECUTABLE_ROLES.includes(role) ? "This role is evaluated in simulation." : "This role provides reference context only."}</div>
      </div>
    </div>
  );
}
