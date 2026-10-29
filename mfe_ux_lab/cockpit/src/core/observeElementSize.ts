// Presentation-only dimensions. CSS size and physical density are separate inputs.
export interface ElementSize { width: number; height: number; dpr: number }
// One lightweight fallback per document for engines that miss a resolution event
// when only the monitor density changes. It never schedules work for hidden tabs.
const densityListeners = new Set<() => void>();
let densityTimer: ReturnType<typeof setInterval> | undefined;
let lastDensity = 1;
function watchDensity(listener: () => void): () => void {
  densityListeners.add(listener);
  if (!densityTimer) {
    lastDensity = window.devicePixelRatio || 1;
    densityTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const next = window.devicePixelRatio || 1;
      if (next !== lastDensity) { lastDensity = next; densityListeners.forEach(notify => notify()); }
    }, 250);
  }
  return () => { densityListeners.delete(listener); if (!densityListeners.size && densityTimer) { clearInterval(densityTimer); densityTimer = undefined; } };
}
export function canvasBackingSize(width: number, height: number, dpr: number) {
  const density = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return { width: Math.max(1, Math.floor(width * density)), height: Math.max(1, Math.floor(height * density)) };
}
export function resizeCanvasBacking(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  const next = canvasBackingSize(width, height, dpr);
  if (canvas.width !== next.width) canvas.width = next.width;
  if (canvas.height !== next.height) canvas.height = next.height;
}
export function observeElementSize(element: HTMLElement, onSize: (size: ElementSize) => void): () => void {
  let disposed = false, frame = 0, query: MediaQueryList | null = null;
  const measure = () => {
    frame = 0; if (disposed) return;
    onSize({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight), dpr: window.devicePixelRatio || 1 });
  };
  const schedule = () => { if (!disposed && !frame) frame = window.requestAnimationFrame(measure); };
  const bindDensity = () => { query?.removeEventListener("change", densityChanged); query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) || null; query?.addEventListener("change", densityChanged); };
  const densityChanged = () => { bindDensity(); if (frame) window.cancelAnimationFrame(frame); measure(); };
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  observer?.observe(element); bindDensity(); measure();
  const stopDensity = watchDensity(densityChanged);
  window.addEventListener("resize", schedule); window.visualViewport?.addEventListener("resize", schedule);
  return () => { disposed = true; stopDensity(); observer?.disconnect(); query?.removeEventListener("change", densityChanged); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); if (frame) window.cancelAnimationFrame(frame); };
}
