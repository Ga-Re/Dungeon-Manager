import {
  createContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { SlotHost } from "./panel-layout.js";

/**
 * Lets the map panel name its element, so a command panel opens at its top right (T-257).
 * `null` while the map panel is closed.
 */
export const CommandAnchorContext = createContext<
  ((element: HTMLElement | null) => void) | null
>(null);

interface Anchor {
  readonly top: number;
  readonly right: number;
}

/**
 * The layer a ribbon tool's command panel lives in (ADR-0020, ADR-0021, T-257): over the whole
 * window, above every panel and below menus, so the panel can be moved anywhere – over the
 * browser as over the map. It opens at the map panel's top right corner (else at the panels'
 * top right) and follows that corner when the layout changes size.
 */
export function CommandLayer({
  host,
  anchor,
}: {
  /** The `command` slot's element. */
  readonly host: HTMLElement;
  /** The map panel's element, if it is open. */
  readonly anchor: HTMLElement | null;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<Anchor>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    const own = layer.current;
    if (!own) return;
    const target = (): Element | null =>
      anchor?.isConnected === true
        ? anchor
        : (own.parentElement?.querySelector(".dm-panels") ?? null);
    const measure = () => {
      const element = target();
      if (!element) return;
      const outer = own.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      const next = {
        top: inner.top - outer.top,
        right: outer.right - inner.right,
      };
      setCorner((current) =>
        current.top === next.top && current.right === next.right
          ? current
          : next,
      );
    };
    measure();
    // A command opening, the window or the map panel changing size: the corner may have moved.
    const opened = new MutationObserver(measure);
    opened.observe(host, { childList: true });
    const resized =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    resized?.observe(own);
    const element = target();
    if (element) resized?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      opened.disconnect();
      resized?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [host, anchor]);

  const style: CSSProperties = {
    top: `${String(corner.top)}px`,
    right: `${String(corner.right)}px`,
    maxHeight: `calc(100% - ${String(corner.top)}px)`,
  };
  return (
    <div ref={layer} className="dm-command-layer">
      <div className="dm-command-anchor" style={style}>
        <SlotHost element={host} />
      </div>
    </div>
  );
}
