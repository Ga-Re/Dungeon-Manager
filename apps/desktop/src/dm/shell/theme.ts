import { useCallback, useState } from "react";

/** The DM's choice of appearance (ADR-0011): follow the OS, or always light or dark. */
export type ThemeSetting = "system" | "light" | "dark";

export const THEME_SETTINGS: readonly ThemeSetting[] = [
  "system",
  "light",
  "dark",
];

const STORAGE_KEY = "dm.theme";

/** Parchment unless the DM chose otherwise on this device (ADR-0011: parchment is the default). */
const DEFAULT_THEME: ThemeSetting = "light";

/** The webview's `localStorage`; even reading it throws when storage is disabled. */
export function deviceStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isThemeSetting(value: unknown): value is ThemeSetting {
  return THEME_SETTINGS.includes(value as ThemeSetting);
}

/**
 * Reads the device-local setting. The webview's storage lives in the OS app-data directory,
 * not in the synced library (ARCHITECTURE §6.2). Unavailable storage means the default.
 */
export function readThemeSetting(storage: Storage | undefined): ThemeSetting {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return isThemeSetting(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function saveThemeSetting(storage: Storage | undefined, setting: ThemeSetting) {
  try {
    storage?.setItem(STORAGE_KEY, setting);
  } catch {
    // Not persisted (e.g. storage disabled); the choice still applies until the window closes.
  }
}

/** Sets the theme attribute the token sheet reacts to (`packages/ui/styles/tokens.css`). */
export function applyTheme(setting: ThemeSetting, root: HTMLElement): void {
  root.dataset["dmTheme"] =
    setting === "light" ? "parchment" : setting === "dark" ? "night" : "system";
}

/** The current setting and a setter that applies and stores it. */
export function useThemeSetting(
  storage: Storage | undefined,
  root: HTMLElement,
): readonly [ThemeSetting, (setting: ThemeSetting) => void] {
  const [setting, setSetting] = useState(() => readThemeSetting(storage));
  const change = useCallback(
    (next: ThemeSetting) => {
      setSetting(next);
      applyTheme(next, root);
      saveThemeSetting(storage, next);
    },
    [storage, root],
  );
  return [setting, change];
}
