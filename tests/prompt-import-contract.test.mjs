import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "./module-chain-fixture.mjs";
import fs from "node:fs";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url));
const { build } = createRequire(app + "/package.json")("esbuild");
const built = await build({
  stdin: {
    contents:
      "export * from './src/lib/aiContextPack.ts'; export {moduleImportSchemas} from './src/lib/moduleJsonSchemas.ts'; export {BLOCKS} from './src/lib/blocks/blockLibrary.ts'; export {validateGraph,evalGraph} from './src/lib/blocks/featureGraph.ts'; export {validateAst} from './src/lib/blocks/quantAstSafety.ts'; export {compileL5,l5RecipeFromModule} from './src/lib/blocks/l5Compile.ts'; export {prepareDefinitionImport} from './src/lib/portableDefinitions.ts'; export {astToText} from './src/lib/blocks/quantFormulaText.ts'; export {parseFormula} from './src/lib/blocks/quantFormulaParser.ts'; export {evaluateSeries} from './src/lib/blocks/quantAstEvaluator.ts'; export {OP_SPEC} from './src/lib/blocks/quantAstTypes.ts'; export {SEED_MACROS} from './src/lib/blocks/quantMacroRegistry.ts';",
    resolveDir: app,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
globalThis.localStorage = { getItem: () => null, setItem() {} };
const graph = (params) => ({
  name: "Swing reference",
  explain: "Confirmed swing reference measurement",
  why: "Inspect a delayed causal structural reference",
  graph: {
    nodes: [
      { id: "s", blockId: "swing_high", params, inputs: [] },
      { id: "out", blockId: "emit_feature", inputs: ["s"] },
    ],
    output: "out",
  },
});
const formula = (ast) => ({
  name: "Formula contract",
  outputType: "SCORE",
  ast,
});
let failures = 0;
const cases = {
  "L3 JSON -> formula editor -> AST preserves every operation and output type"(){
    const inputs={close:Array.from({length:70},(_,i)=>Math.sin(i)*2+i/30)};
    for(const [op,spec]of Object.entries(api.OP_SPEC).filter(([op])=>op!=="MACRO_REF")){
      for(const outputType of ['SCORE','INDICATOR','EV_COMPONENT','PROBABILITY_LIKE_SCORE']){
        const args=Array.from({length:spec.arity},(_,i)=>i?0.6:'close');
        const original=api.parseAiFormula(JSON.stringify({name:'Editor round trip',outputType,ast:{op,args}}));
        assert.equal(original.ok,true,op+': '+original.errors.join(';'));
        assert.equal(original.ast.outputType,outputType,'JSON outputType must reach the actual AST');
        const text=api.astToText(original.ast,k=>k,api.SEED_MACROS);
        const parsed=api.parseFormula(text,['close']);assert.equal(parsed.errors.length,0,text+': '+parsed.errors.join(';'));
        const before=api.evaluateSeries(original.ast,inputs,70,api.SEED_MACROS).root;
        const after=api.evaluateSeries(parsed.ast,inputs,70,api.SEED_MACROS).root;
        assert.deepEqual(after,before,op+' changed through text editor');
      }
    }
    for(const macro of Object.values(api.SEED_MACROS))for(const window of [undefined,50]){
      if(macro.macroId==='safe_ratio'&&window!==undefined)continue;
      const original=api.parseAiFormula(JSON.stringify({name:'Macro editor round trip',ast:{op:'MACRO_REF',args:[macro.macroId,...macro.inputs.map((_,i)=>i?.6:'close')],...(window===undefined?{}:{params:{window}})}}));
      assert.equal(original.ok,true,original.errors.join(';'));
      const text=api.astToText(original.ast,k=>k,api.SEED_MACROS),parsed=api.parseFormula(text,['close']);
      assert.equal(parsed.errors.length,0,text+': '+parsed.errors.join(';'));
      assert.deepEqual(api.evaluateSeries(parsed.ast,inputs,70,api.SEED_MACROS).root,api.evaluateSeries(original.ast,inputs,70,api.SEED_MACROS).root,text);
    }
  },
  "Every parameterized L1 block accepts its declared bounds and rejects wrong types"() {
    for(const block of api.BLOCKS.filter(b=>b.parameters.length)){
      const ports=block.inputs.filter(p=>p.type!=="STREAM_OHLC");
      const nodes=[{id:"source",blockId:"const_value",inputs:[]},{id:"tested",blockId:block.blockId,params:Object.fromEntries(block.parameters.map(p=>[p.name,p.defaultValue])),inputs:ports.map(()=>"source")},{id:"out",blockId:"emit_feature",inputs:["tested"]}];
      const g={id:"bounds",name:"Bounds fixture",nodes,output:"out"};
      for(const parameter of block.parameters){
        for(const value of [parameter.defaultValue,parameter.min,parameter.max].filter(v=>v!==undefined)){
          const candidate=structuredClone(g);candidate.nodes[1].params[parameter.name]=value;
          // Cross-field constraints such as lo<=hi are tested separately.
          const result=api.validateGraph(candidate);
          assert.ok(!result.errors.some(e=>e.includes("expected case-sensitive params")),block.blockId+': '+result.errors.join(';'));
        }
        for(const value of ['wrong-type',parameter.min-1,parameter.max+1,...(parameter.type==='integer'?[parameter.defaultValue+.25]:[])]){
          const candidate=structuredClone(g);candidate.nodes[1].params[parameter.name]=value;
          assert.equal(api.validateGraph(candidate).ok,false,block.blockId+'.'+parameter.name+'='+value);
        }
      }
    }
  },
  "Mixed layer payloads and multiple fenced blocks are refused"(){
    for(const parse of [api.parseAiFeature,api.parseAiFormula,api.parseAiModule]){
      const result=parse(JSON.stringify({...api.L1_EXAMPLE,ast:api.L3_EXAMPLE.ast}));
      assert.equal(result.ok,false);assert.match(result.errors.join(' '),/Ambiguous/);
    }
    assert.equal(api.parseAiFeature('```json\n'+JSON.stringify(api.L1_EXAMPLE)+'\n```\n```json\n{}\n```').ok,false);
  },
  "Published swing-distance example validates and evaluates"(){
    const example=JSON.parse(fs.readFileSync(new URL('../docs/examples/confirmed-swing-distance.l1.json',import.meta.url)));
    const parsed=api.parseAiFeature(JSON.stringify(example));assert.equal(parsed.ok,true,parsed.errors.join(';'));
    const values=api.evalGraph(parsed.module.graph,syntheticBars(300));assert.equal(values.length,300);assert.ok(values.every(Number.isFinite));
  },
  "L1 exact parameter diagnostic"() {
    for (const key of ["window", "n", "w"]) {
      const r = api.parseAiFeature(JSON.stringify(graph({ [key]: 2 })));
      assert.equal(r.ok, false);
      assert.match(r.errors.join(" "), /W.*integer.*(3|default)/);
      assert.match(r.errors.join(" "), /got|received/i);
    }
  },
  "L1 fractional confirmation rejected"() {
    assert.equal(
      api.parseAiFeature(JSON.stringify(graph({ W: 1.5 }))).ok,
      false,
    );
  },
  "L1 placeholders cannot masquerade as measured evidence"() {
    const value = graph({ W: 2 });
    value.graph.nodes[0] = { id: "s", blockId: "m1_subbar", inputs: [] };
    const r = api.parseAiFeature(JSON.stringify(value));
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" "), /no numeric runtime/);
  },
  "L1 swing confirmation timing"() {
    const r = api.parseAiFeature(JSON.stringify(graph({ W: 2 })));
    assert.equal(r.ok, true);
    const bars = syntheticBars(12).map((b, i) => ({
      ...b,
      h: [10, 11, 20, 12, 13, 14, 15, 16, 17, 18, 19, 21][i],
      l: 1,
      o: 2,
      c: 3,
    }));
    const full = api.evalGraph(r.module.graph, bars);
    assert.equal(full[3], 12);
    assert.equal(full[4], 20);
    for (let i = 0; i < bars.length; i++)
      assert.equal(
        api.evalGraph(r.module.graph, bars.slice(0, i + 1)).at(-1),
        full[i],
      );
  },
  "L1 generated parameter schemas"() {
    assert.equal(typeof api.l1BlockContracts, "function");
    const contracts = api.l1BlockContracts();
    assert.equal(contracts.length, api.BLOCKS.length);
    for (const block of api.BLOCKS) {
      const contract = contracts.find((c) => c.blockId === block.blockId);
      assert.equal(contract.paramsSchema.additionalProperties, false);
      for (const p of block.parameters) {
        const spec = contract.paramsSchema.properties[p.name];
        assert.equal(spec.type, p.type);
        assert.equal(spec.default, p.defaultValue);
        assert.equal(spec.minimum, p.min);
        assert.equal(spec.maximum, p.max);
      }
    }
  },
  "Prompt examples import as fenced JSON"() {
    const pairs = [
      [api.parseAiFeature, api.L1_EXAMPLE],
      [api.parseAiIndicator, api.L2_EXAMPLE],
      [api.parseAiFormula, api.L3_EXAMPLE],
      [api.parseAiModule, api.FEW_SHOT_PRESETS[0].module],
      [api.parseAiModule, api.FEW_SHOT_PRESETS[1].module],
      [api.parseAiZone, api.L6_EXAMPLE],
    ];
    for (const [parse, example] of pairs) {
      const result = parse(
        "\uFEFF```json\n" + JSON.stringify(example) + "\n```",
      );
      assert.equal(result.ok, true, result.errors.join(";"));
    }
  },
  "L2 negative or unused weights rejected"() {
    for (const weights of [{ ema_slope: -1 }, { ema_slope: 1, typo: 2 }])
      assert.equal(
        api.parseAiIndicator(
          JSON.stringify({
            ...api.L2_EXAMPLE,
            featureKeys: ["ema_slope"],
            weights,
          }),
        ).ok,
        false,
      );
  },
  "L2 overlay parameters are exact and bounded"() {
    for (const params of [{ window: 20 }, { period: 0 }, { period: 2.5 }])
      assert.equal(
        api.parseAiIndicator(
          JSON.stringify({
            name: "EMA overlay",
            explain: "A causal EMA reference overlay",
            kind: "overlay",
            overlayKey: "ema",
            overlayParams: params,
          }),
        ).ok,
        false,
      );
  },
  "L3 malformed nested AST never throws"() {
    for (const ast of [
      { op: "ADD", args: [null, 1] },
      { op: "ADD", args: {} },
      { op: "CONST", args: [1, 2] },
      { op: "INPUT", args: ["close", "atr"] },
      { op: "MACRO_REF", args: ["close", 9] },
    ])
      assert.doesNotThrow(() =>
        assert.equal(
          api.parseAiFormula(JSON.stringify(formula(ast))).ok,
          false,
        ),
      );
  },
  "L3 nested macro window preserved"() {
    const r = api.parseAiFormula(
      JSON.stringify(
        formula({
          op: "MACRO_REF",
          args: ["zscore", "close"],
          params: { window: 50 },
        }),
      ),
    );
    assert.equal(r.ok, true);
    assert.equal(r.ast.nodes[r.ast.rootNodeId].params.window, 50);
  },
  "L3 unknown operation and inherited references refused"() {
    for (const ast of [
      {
        rootNodeId: "out",
        nodes: {
          out: {
            nodeId: "out",
            kind: "POINT_OP",
            op: "constructor",
            children: [],
          },
        },
      },
      { rootNodeId: "constructor", nodes: {} },
      {
        rootNodeId: "out",
        nodes: {
          out: {
            nodeId: "out",
            kind: "POINT_OP",
            op: "ABS",
            children: ["constructor"],
          },
        },
      },
    ])
      assert.equal(api.parseAiFormula(JSON.stringify(formula(ast))).ok, false);
  },
  "L3 unknown or silently clamped params refused"() {
    for (const ast of [
      { op: "ROLL_MEAN", args: ["close"], params: { wndow: 20 } },
      { op: "LAG", args: ["close"], params: { lag: 0 } },
      { op: "CLIP", args: ["close"], params: { min: 2, max: 1 } },
      { op: "MACRO_REF", args: ["zscore", "close", "atr"] },
    ])
      assert.equal(api.parseAiFormula(JSON.stringify(formula(ast))).ok, false);
  },
  "L3 nested complexity bounded before conversion"() {
    let tree = "close";
    for (let i = 0; i < 100; i++) tree = { op: "ABS", args: [tree] };
    assert.doesNotThrow(() =>
      assert.equal(api.parseAiFormula(JSON.stringify(formula(tree))).ok, false),
    );
  },
  "L6 malformed offset is not defaulted"() {
    assert.equal(
      api.parseAiZone(JSON.stringify({ ...api.L6_EXAMPLE, offsetAtr: "2" })).ok,
      false,
    );
  },
  "L5 imported recipe retains condition logic and parameters"() {
    const r = {
      name: "Imported rule",
      explain: "Imported logic and coefficients",
      why: "Preserve the actual imported research condition",
      terminal: "TRIGGER",
      direction: "LONG",
      logic: "ANY",
      weight: 0.2,
      reliability: 0.7,
      setup: [
        { blockId: "imported_condition", metric: "rsi", op: "<", value: 25 },
        { blockId: "imported_condition", metric: "rsi", op: ">", value: 75 },
      ],
      confirm: [],
    };
    const c = api.compileL5(r);
    assert.equal(c.module.logic, "ANY");
    assert.equal(c.module.weight, 0.2);
    assert.equal(c.module.reliability, 0.7);
    const p = api.prepareDefinitionImport(
      {
        mfe_custom_l5_recipe: [
          { ...r, id: "recipe", status: "SHADOW", createdAt: "2020-01-01" },
        ],
      },
      {},
    );
    assert.equal(p.stores.mfe_custom_l5_recipe[0].logic, "ANY");
  },
  "L5 JSON -> recipe -> compiled rule preserves semantics"() {
    for (const role of ["TRIGGER", "VETO", "EXIT"]) {
      const m = {
        id: "m",
        name: "Imported condition",
        explain: "Round trip without changing semantics",
        why: "Preserve imported conditions and coefficients",
        level: 5,
        role,
        conditions: [{ metric: "rsi", op: "<", value: 25 }],
        logic: "ANY",
        direction: "SHORT",
        weight: 0.25,
        reliability: 0.75,
        exitAction: "LOCK_SL",
        lockR: 0.7,
        status: "SHADOW",
      };
      const recipe = api.l5RecipeFromModule(m),
        c = api.compileL5(recipe).module;
      assert.equal(c.logic, m.logic);
      assert.deepEqual(c.conditions, m.conditions);
      if (role === "TRIGGER") {
        assert.equal(c.weight, m.weight);
        assert.equal(c.reliability, m.reliability);
        assert.equal(c.direction, m.direction);
      }
      if (role === "EXIT") {
        assert.equal(c.exitAction, m.exitAction);
        assert.equal(c.lockR, m.lockR);
      }
    }
  },
  "Exported schemas stay synchronized with executable catalogs"() {
    const saved = JSON.parse(
      fs.readFileSync(
        new URL(
          "../docs/schemas/module-import-contracts.json",
          import.meta.url,
        ),
      ),
    );
    assert.deepEqual(saved.schemas, api.moduleImportSchemas());
    assert.deepEqual(
      saved.L1Blocks,
      JSON.parse(JSON.stringify(api.l1BlockContracts())),
    );
  },
  "Every prompt states data and validation boundaries"() {
    for (const layer of ["L1", "L2", "L3", "L4", "L5", "L6"]) {
      const p = api.buildLayerPack(layer);
      assert.match(
        p,
        /tick.*(unavailable|not available|not measured|not supported)/i,
      );
      assert.match(p, /walk.forward/i);
      assert.match(p, /multiple.testing/i);
      assert.match(p, /256/);
    }
  },
};
for (const [name, test] of Object.entries(cases)) {
  try {
    test();
    console.log("PASS " + name);
  } catch (error) {
    failures++;
    console.error("FAIL " + name + ": " + error.message.slice(0, 170));
  }
}
delete globalThis.localStorage;
if(!failures)console.log(JSON.stringify({status:'PROMPT_IMPORT_CONTRACT_PASS',cases:Object.keys(cases).length,L1Blocks:api.BLOCKS.length,layers:6,operationOutputTypeRoundTrips:152,seedMacros:3}));
process.exitCode = failures ? 1 : 0;
