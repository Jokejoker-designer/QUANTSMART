/**
 * useElementSize — measure a container with ResizeObserver so canvases/3D views
 * can size to the available width (wide-layout patch). Falls back gracefully if
 * ResizeObserver is unavailable.
 */
import { useCallback, useLayoutEffect, useState } from 'react';
import { observeElementSize, type ElementSize } from './observeElementSize.ts';

export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  const [size, setSize] = useState<ElementSize>({ width: 600, height: 420, dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1 });

  useLayoutEffect(() => {
    if (!element) return;
    return observeElementSize(element, next => setSize(previous => previous.width === next.width && previous.height === next.height && previous.dpr === next.dpr ? previous : next));
  }, [element]);

  return { ref, size };
}
