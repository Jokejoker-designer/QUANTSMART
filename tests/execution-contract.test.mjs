import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const app = fileURLToPath(new URL("../mfe_ux_lab/cockpit", import.meta.url)),
  require = createRequire(app + "/package.json"),
  { build } = require("esbuild"),
  baseline = process.argv.includes("--baseline");
const plugins = baseline
  ? [
      {
        name: "contract-baseline",
        setup(b) {
          b.onLoad(
            {
              filter:
                /realisticStrategySim\.ts$|intrabarM1Resolver\.ts$|resampleM1\.ts$/,
            },
            (args) => ({
              contents: execFileSync(
                "git",
                [
                  "show",
                  "efa8194:mfe_ux_lab/cockpit/" +
                    args.path.slice(app.length + 1).replaceAll("\\", "/"),
                ],
                { encoding: "utf8" },
              ),
              loader: "ts",
            }),
          );
        },
      },
    ]
  : [];
const b = await build({
  stdin: {
    contents:
      "export * from './src/lib/intrabarM1Resolver.ts';export * from './src/lib/resampleM1.ts';export * from './src/lib/realisticStrategySim.ts';export * from './src/lib/simConfig.ts';export * from './src/lib/symbolSpec.ts';",
    resolveDir: app,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
  plugins,
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
globalThis.localStorage = { getItem: () => null };
const candle = (i, o = 100, h = 101, l = 99, c = 100) => ({
  i,
  t: new Date(Date.UTC(2020, 0, 1) + i * 60000).toISOString(),
  o,
  h,
  l,
  c,
  r: "N",
});
const cases = {
  specification() {
    const bars = Array.from({ length: 100 }, (_, i) => ({
        ...candle(i),
        t: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
      })),
      cfg = api.cloneSimConfig();
    const opts = {
      cfg,
      spec: api.getSymbolSpec("EURUSD"),
      designTf: "H1",
      symbol: "EURUSD",
      cardId: "MISSING_SPEC",
    };
    assert.throws(
      () => api.runRealisticSim(bars, [], false, opts),
      /INSUFFICIENT_SPEC/,
    );
    assert.throws(
      () =>
        api.runRealisticSim(bars, [], false, {
          ...opts,
          spec: api.XAUUSD_PROVISIONAL_SPEC,
        }),
      /SYMBOL_SPEC_MISMATCH/,
    );
    assert.throws(
      () =>
        api.runRealisticSim(bars, [], false, {
          ...opts,
          symbol: "XAUUSD",
          spec: { ...api.XAUUSD_PROVISIONAL_SPEC, tickSize: 0 },
        }),
      /INSUFFICIENT_SPEC/,
    );
  },

  gaps() {
    const gap = api.resampleM1([candle(0), candle(4)], "M5");
    assert.equal(gap.bars[0].complete, true);
    assert.equal(gap.bars[0].hasGap, true);
    assert.throws(
      () => api.completeBarsOnly(gap),
      /M1_INCOMPLETE_CLOSED_BUCKET/,
    );
    const duplicate = api.resampleM1(
      [candle(0), candle(1), candle(1), candle(3), candle(4)],
      "M5",
    );
    assert.equal(duplicate.bars[0].hasGap, true);
    assert.throws(
      () => api.completeBarsOnly(duplicate),
      /M1_INCOMPLETE_CLOSED_BUCKET/,
    );
    assert.equal(
      api.completeBarsOnly(
        api.resampleM1(
          Array.from({ length: 5 }, (_, i) => candle(i)),
          "M5",
        ),
      ).bars.length,
      1,
    );
  },
  policies() {
    for (const policy of ["EXCLUDE_AMBIGUOUS", "TICK_REQUIRED"])
      assert.throws(
        () =>
          api.resolveIntrabarM1(
            "BUY",
            98,
            104,
            [candle(0, 100, 105, 97)],
            policy,
          ),
        /EXCLUDE_AMBIGUOUS_IS_REPORT_ONLY|TICK_REQUIRED_FOR_AMBIGUOUS_PATH/,
      );
    assert.equal(
      api.resolveIntrabarM1(
        "BUY",
        98,
        104,
        [candle(0, 100, 105, 99)],
        "TICK_REQUIRED",
      ).outcome,
      "TP_FIRST",
    );
  },
  floor() {
    for (const direction of ["LONG", "SHORT"]) {
      const flip = (b) =>
        direction === "LONG"
          ? b
          : { ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c };
      const bars = Array.from({ length: 100 }, (_, i) => ({
        ...candle(i),
        t: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
      }));
      bars[30].h = 104;
      const custom = {
        id: "rr_fixture",
        name: "fixture",
        level: 5,
        role: "TRIGGER",
        conditions: [{ metric: "hour", op: "==", value: 16 }],
        logic: "ALL",
        direction,
        status: "SHADOW",
        createdAt: "",
      };
      const cfg = api.cloneSimConfig();
      cfg.minStopAtrK = 10;
      cfg.risk.sizingMode = "FIXED_R";
      const r = api.runRealisticSim(
        bars.map(flip),
        [custom.id, "auto_rr"],
        true,
        {
          cfg,
          spec: api.XAUUSD_PROVISIONAL_SPEC,
          designTf: "H1",
          symbol: "XAUUSD",
          cardId: "RR",
          customModules: [custom],
        },
      );
      assert.ok(
        !r.events.some(
          (e) =>
            e.event_type === "POSITION_OPENED_MODELED" && e.bar_index === 41,
        ),
        "post-floor reward/risk must qualify",
      );
    }
    const bars = Array.from({ length: 85 }, (_, i) => {
      const o = 100 + i * 0.2,
        c = o + 0.2;
      return {
        ...candle(i, o, c + 0.1, o - 0.1, c),
        t: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
      };
    });
    bars[30].h = 115;
    const kids = Array.from({ length: 60 }, (_, m) => ({
      ...candle(m, 109.2, 109.3, 109.1, 109.2),
      t: new Date(Date.parse(bars[41].t) + m * 60000).toISOString(),
    }));
    const exec = bars.map(() => []);
    exec[41] = [{ ...kids[0], l: 106 }];
    const m1 = bars.map((b) => [b]);
    m1[41] = kids;
    const cfg = api.cloneSimConfig();
    cfg.executionTf = "M5";
    cfg.minStopAtrK = 10;
    const r = api.runRealisticSim(bars, ["trend_pullback", "auto_rr"], true, {
      cfg,
      spec: api.XAUUSD_PROVISIONAL_SPEC,
      designTf: "H1",
      symbol: "XAUUSD",
      cardId: "INTRABAR_RR",
      execByDesign: exec,
      m1ByDesign: m1,
    });
    assert.ok(
      !r.events.some(
        (e) => e.event_type === "POSITION_OPENED_MODELED" && e.bar_index === 41,
      ),
      "intrabar final R:R must qualify",
    );
  },
};
let failed = 0;
for (const [name, test] of Object.entries(cases)) {
  try {
    test();
    console.log("PASS " + name);
  } catch (error) {
    failed++;
    console.error("FAIL " + name + ": " + error.message.split("\n")[0]);
  }
}
process.exitCode = failed ? 1 : 0;
