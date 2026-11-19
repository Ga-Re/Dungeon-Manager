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

/** Gap between an anchor and what opens under it, in CSS pixels. */
const GAP = 4;

/**
 * Where something opening under `anchor` goes, as a fixed viewport point (T-131): under the
 * anchor, lined up with its `align` edge, and kept inside the window. Fixed, so a container
 * that clips or scrolls (the ribbon's panel) never cuts it off; it follows the anchor on
 * scrolling and resizing. `undefined` while `active` is false.
 */
export function useAnchoredPoint(
  anchor: RefObject<HTMLElement | null>,
  element: RefObject<HTMLElement | null>,
  align: "start" | "end",
  active: boolean,
): MenuPoint | undefined {
  const [point, setPoint] = useState<MenuPoint | undefined>(undefined);
  useLayoutEffect(() => {
    if (!active) {
      setPoint(undefined);
      return;
    }
    const place = () => {
      // Without its anchor in the page (yet), the window's top left corner, never nowhere.
      const from = anchor.current?.getBoundingClientRect() ?? {
        left: 0,
        right: 0,
        bottom: 0,
      };
      const box = element.current?.getBoundingClientRect();
      const size = { width: box?.width ?? 0, height: box?.height ?? 0 };
      const at = {
        x: align === "end" ? from.right - size.width : from.left,
        y: from.bottom + GAP,
      };
      setPoint(
        clampPoint(at, size, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    };
    place();
    window.addEventListener("resize", place);
    // Capture: a scrolling container anywhere (the ribbon's panel) moves the anchor too.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, element, align, active]);
  return point;
}
