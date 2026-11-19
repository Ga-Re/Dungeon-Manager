import type { HudPlacement } from "@dungeon-manager/ui";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const STORAGE_PREFIX = "dm.hud.";

/** Placements of the tool windows over the map, remembered per device (DM decision, T-158). */
export interface HudLayout {
  /** The stored placement of `id`, or `fallback` when there is none. */
  get(id: string, fallback: HudPlacement): HudPlacement;
  set(id: string, placement: HudPlacement): void;
  /** Forgets every stored placement: all tool windows return to their defaults. */
  reset(): void;
}

function isPlacement(value: unknown): value is HudPlacement {
  if (typeof value !== "object" || value === null) return false;
  const { x, y, collapsed } = value as Record<string, unknown>;
  return (
    typeof x === "number" &&
    Number.isFinite(x) &&
    typeof y === "number" &&
    Number.isFinite(y) &&
    typeof collapsed === "boolean"
  );
}

/** Reads a stored placement; anything unreadable counts as none (device storage is an edge). */
function readPlacement(
  storage: Storage | undefined,
  id: string,
): HudPlacement | null {
  try {
    const raw = storage?.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isPlacement(value) ? value : null;
  } catch {
    return null;
  }
}

/** The shell's layout store, backed by the webview's storage (OS app data, not the library). */
export function useHudLayoutStore(storage: Storage | undefined): HudLayout {
  const [placements, setPlacements] = useState<Record<string, HudPlacement>>(
    {},
  );
  const get = useCallback(
    (id: string, fallback: HudPlacement) =>
      placements[id] ?? readPlacement(storage, id) ?? fallback,
    [placements, storage],
  );
  const set = useCallback(
    (id: string, placement: HudPlacement) => {
      setPlacements((current) => ({ ...current, [id]: placement }));
      try {
        storage?.setItem(STORAGE_PREFIX + id, JSON.stringify(placement));
      } catch {
        // Not persisted (storage disabled); the placement still holds until the window closes.
      }
    },
    [storage],
  );
  const reset = useCallback(() => {
    try {
      const keys = Array.from({ length: storage?.length ?? 0 }, (_, index) =>
        storage?.key(index),
      ).filter(
        (key): key is string => key?.startsWith(STORAGE_PREFIX) ?? false,
      );
      for (const key of keys) storage?.removeItem(key);
    } catch {
      // Nothing stored to forget.
    }
    // Nothing in memory or storage any more: every tool window gets its default again.
    setPlacements({});
  }, [storage]);
  return useMemo(() => ({ get, set, reset }), [get, set, reset]);
}

/** Outside a shell (component tests) placements live only in memory. */
const memoryLayout: HudLayout = {
  get: (_id, fallback) => fallback,
  set: () => undefined,
  reset: () => undefined,
};

export const HudLayoutContext = createContext<HudLayout>(memoryLayout);

/** The placement of one tool window and its setter. */
export function useHudPlacement(
  id: string,
  fallback: HudPlacement,
): readonly [HudPlacement, (placement: HudPlacement) => void] {
  const layout = useContext(HudLayoutContext);
  const [local, setLocal] = useState<HudPlacement | null>(null);
  // In a shell the store holds it; outside one (tests) this component does.
  const placement =
    layout === memoryLayout ? (local ?? fallback) : layout.get(id, fallback);
  const update = useCallback(
    (next: HudPlacement) => {
      if (layout === memoryLayout) setLocal(next);
      else layout.set(id, next);
    },
    [layout, id],
  );
  return [placement, update];
}
