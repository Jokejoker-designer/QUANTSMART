export function moduleChain(api) {
  const now = "2020-01-01T00:00:00.000Z";
  const l1 = {
    id: "l1_fixture",
    name: "Rejection feature",
    explain: "Geometric candle rejection measurement",
    why: "A causal candle geometry research hypothesis",
    graph: structuredClone(api.FEATURE_TEMPLATES[0].graph),
    family: "CUSTOM",
    status: "PROMOTED",
    createdAt: now,
  };
  const l2 = {
    id: "l2_fixture",
    name: "Rejection context",
    explain: "Weighted rejection context from the L1 feature",
    kind: "indicator",
    featureKeys: [l1.id],
    weights: { [l1.id]: 1 },
    status: "PROMOTED",
    createdAt: now,
  };
  const ast = {
    formulaId: "fixture_ast",
    name: "Centered rejection",
    version: "1",
    rootNodeId: "out",
    nodes: {
      feature: {
        nodeId: "feature",
        kind: "INPUT",
        inputRef: l2.id,
        safety: { causalOnly: true },
      },
      half: {
        nodeId: "half",
        kind: "CONST",
        constValue: 0.5,
        safety: { causalOnly: true },
      },
      out: {
        nodeId: "out",
        kind: "POINT_OP",
        op: "SUB",
        children: ["feature", "half"],
        safety: { causalOnly: true },
      },
    },
    outputType: "SCORE",
    authority: api.QUANT_AUTHORITY,
    status: "SHADOW",
  };
  const l3 = {
    id: "l3_fixture",
    name: "Centered rejection",
    layer: "L3",
    moduleType: "QUANT_FORMULA_AST",
    formulaText: "score = l2_fixture - 0.5",
    ast,
    astHash: "forged",
    version: "1",
    inputSources: [],
    outputType: "SCORE",
    status: "SHADOW",
    authority: api.L3_AUTHORITY,
    safety: { parsePass: true },
    validation: { structuralStatus: "PASS", oosStatus: "PASS" },
    createdAt: now,
    updatedAt: now,
  };
  const l4 = {
    id: "l4_fixture",
    name: "Rejection context gate",
    level: 4,
    role: "CONTEXT_GATE",
    conditions: [{ metric: l3.id, op: ">=", value: -0.45 }],
    logic: "ALL",
    explain: "Gate on the imported centered rejection score",
    why: "A context hypothesis requiring combined strategy research",
    status: "SHADOW",
    createdAt: now,
  };
  const l5 = {
    id: "l5_fixture",
    name: "Rejection event trigger",
    level: 5,
    role: "TRIGGER",
    direction: "LONG",
    conditions: [{ metric: l1.id, op: ">=", value: 0.04 }],
    logic: "ALL",
    explain: "A simulated trigger using the imported L1 measurement",
    why: "Explicit candidate hypothesis for test-only strategy wiring",
    status: "SHADOW",
    createdAt: now,
  };
  const l6 = {
    id: "l6_fixture",
    name: "Evidence reference zone",
    explain: "Reference band anchored to the imported score",
    anchor: "evidence",
    anchorRef: l3.id,
    role: "OBSERVE",
    offsetAtr: 0,
    widthAtr: 0.4,
    status: "SHADOW",
    createdAt: now,
  };
  const definitions = {
    mfe_custom_l1: [l1],
    mfe_custom_l2: [l2],
    mfe_custom_l3: [l3],
    mfe_custom_modules: [l4, l5],
    mfe_custom_l6: [l6],
  };
  const card = {
    id: "chain_fixture_card",
    name: "L1 to L6 research fixture",
    symbol: "XAUUSD",
    design_tf: "H1",
    execution_tf: "H1",
    modules: [
      "myL1_" + l1.id,
      "myL2_" + l2.id,
      "myL3_" + l3.id,
      l4.id,
      l5.id,
      "myL6_" + l6.id,
    ],
    netR: 999,
    n: 999,
    validationReceipt: { verified: true, job_id: "forged" },
  };
  return { schema: "mfe.strategy-library/2", cards: [card], definitions };
}
export function syntheticBars(length = 1200) {
  return Array.from({ length }, (_, i) => {
    const o = 100 + Math.sin(i / 9) * 3,
      c = 100 + Math.sin((i + 1) / 9) * 3,
      w = 0.15 + (i % 13) / 20;
    return {
      i,
      t: new Date(Date.UTC(2020, 0, 1) + i * 3600000)
        .toISOString()
        .slice(0, 19),
      o,
      h: Math.max(o, c) + 0.2,
      l: Math.min(o, c) - w,
      c,
      r: "N",
    };
  });
}
