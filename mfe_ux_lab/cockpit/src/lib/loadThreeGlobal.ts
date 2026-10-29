// Lazy npm-backed renderer; the source release needs no private/vendor script.
let threeLoad: Promise<void> | null = null;
export function loadThreeGlobal(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Three.js requires a browser."));
  if (window.THREE) return Promise.resolve();
  if (!threeLoad) threeLoad = import("three").then((three) => { window.THREE = three; }).catch((error) => { threeLoad = null; throw error; });
  return threeLoad;
}
