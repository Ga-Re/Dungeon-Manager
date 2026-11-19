import { useLayoutEffect, useState, type RefObject } from "react";

/** A point in viewport pixels, e.g. where a context menu opens. */
export interface MenuPoint {
  x: number;
  y: number;
}

/** Distance kept from the window's edges, in CSS pixels. */
const MARGIN = 8;

/**
 * Where something of `size` opened at `at` fits into the viewport: moved left and up as far as
 * needed (T-130d), but never past the top left margin, so its start stays reachable.
 */
export function clampPoint(
  at: MenuPoint,
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
): MenuPoint {
  return {
    x: Math.max(MARGIN, Math.min(at.x, viewport.width - size.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(at.y, viewport.height - size.height - MARGIN)),
  };
}

/**
 * `at`, moved so the element in `ref` lies inside the viewport. Measured before paint, so it
 * never shows at the overflowing spot first.
 */
export function useClampedPoint(
  ref: RefObject<HTMLElement | null>,
  at: MenuPoint | undefined,
): MenuPoint | undefined {
  const [clamped, setClamped] = useState(at);
  const x = at?.x;
  const y = at?.y;
  useLayoutEffect(() => {
    const element = ref.current;
    if (x === undefined || y === undefined) {
      setClamped(undefined);
      return;
    }
    const box = element?.getBoundingClientRect();
    setClamped(
      clampPoint(
        { x, y },
        { width: box?.width ?? 0, height: box?.height ?? 0 },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [ref, x, y]);
  return clamped;
}
