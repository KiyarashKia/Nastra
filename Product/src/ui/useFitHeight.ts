'use client';
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Sizes a child (e.g. a chart's `height` prop) so its container fills the available space without
 * overflowing: measures the container's overflow and corrects the height in one step on every resize.
 */
export function useFitHeight<T extends HTMLElement>(initial = 280, min = 160, deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [h, setH] = useState(initial);
  const [w, setW] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Content height = sum of children (scrollHeight never reports content smaller than the box).
    const fit = () => {
      const content = [...el.children].reduce((sum, c) => sum + (c as HTMLElement).getBoundingClientRect().height, 0);
      setW(el.clientWidth || undefined);
      setH((prev) => Math.max(min, Math.floor(prev + (el.clientHeight - content) - 2)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ref, height: h, width: w };
}
