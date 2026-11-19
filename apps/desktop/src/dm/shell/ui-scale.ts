import { useCallback, useState } from "react";

/** Interface sizes the DM can choose (T-162), relative to the compact base size. */
export const UI_SCALES = [0.9, 1, 1.1, 1.25] as const;
export type UiScale = (typeof UI_SCALES)[number];

const STORAGE_KEY = "dm.uiScale";
const DEFAULT_SCALE: UiScale = 1;

function isUiScale(value: number): value is UiScale {
  return (UI_SCALES as readonly number[]).includes(value);
}

/** The stored size on this device; anything unreadable or unknown is the default. */
export function readUiScale(storage: Storage | undefined): UiScale {
  try {
    const value = Number(storage?.getItem(STORAGE_KEY));
    return isUiScale(value) ? value : DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

/** Sets the factor every rem of the DM window follows (`--dm-ui-scale`, see dm.css). */
export function applyUiScale(scale: UiScale, root: HTMLElement): void {
  root.style.setProperty("--dm-ui-scale", String(scale));
}

/** The current size and a setter that applies and stores it per device. */
export function useUiScale(
  storage: Storage | undefined,
  root: HTMLElement,
): readonly [UiScale, (scale: UiScale) => void] {
  const [scale, setScale] = useState(() => readUiScale(storage));
  const update = useCallback(
    (next: UiScale) => {
      applyUiScale(next, root);
      setScale(next);
      try {
        storage?.setItem(STORAGE_KEY, String(next));
      } catch {
        // Not persisted; the size still applies until the window closes.
      }
    },
    [storage, root],
  );
  return [scale, update];
}
