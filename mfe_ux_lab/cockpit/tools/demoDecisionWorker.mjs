import { parentPort, workerData } from "node:worker_threads";
import { evaluateDemoCard } from "../src/lib/demoCardDecision.ts";
globalThis.localStorage = {
  getItem: (key) => workerData.storage[key] ?? null,
  setItem: () => {
    throw Error("FROZEN_DEMO_DEFINITION");
  },
  removeItem: () => {
    throw Error("FROZEN_DEMO_DEFINITION");
  },
};
try {
  parentPort.postMessage({ result: evaluateDemoCard(workerData.input) });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
