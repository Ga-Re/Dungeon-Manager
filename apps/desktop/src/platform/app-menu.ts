// The app's commands outside any panel (T-130d): on macOS in the native menu bar, elsewhere in
// a menu button in the DM window's title bar (DM decision, 2026-11-19).

/** Commands the app menu offers; the DM window decides what they do. */
export const APP_COMMANDS = [
  "newCampaign",
  "welcome",
  "settings",
  // View menu (T-172a): panels on and off, back to the default layout.
  "toggleData",
  "toggleMap",
  "toggleBrowser",
  "toggleDetails",
  "resetLayout",
  // Named layouts (T-172c): save the current one; choosing one is `onLayout`.
  "saveLayout",
] as const;
export type AppCommand = (typeof APP_COMMANDS)[number];

/** Whether `value` is one of the app's commands (e.g. a menu item's id). */
export function isAppCommand(value: string): value is AppCommand {
  return (APP_COMMANDS as readonly string[]).includes(value);
}

/** Translated texts of the native menu bar. */
export interface AppMenuLabels {
  readonly appName: string;
  readonly about: string;
  readonly settings: string;
  readonly services: string;
  readonly hide: string;
  readonly hideOthers: string;
  readonly showAll: string;
  readonly quit: string;
  readonly file: string;
  readonly newCampaign: string;
  readonly welcome: string;
  readonly closeWindow: string;
  readonly edit: string;
  readonly undo: string;
  readonly redo: string;
  readonly cut: string;
  readonly copy: string;
  readonly paste: string;
  readonly selectAll: string;
  readonly window: string;
  readonly minimize: string;
  readonly zoom: string;
  readonly fullscreen: string;
  readonly view: string;
  /** The View menu's panel entries: their command, name and whether the panel shows. */
  readonly panels: readonly {
    readonly command: AppCommand;
    readonly text: string;
    readonly checked: boolean;
  }[];
  readonly resetLayout: string;
  /** The View menu's named layouts of the workspace (T-172c): their id and entry text. */
  readonly layouts: readonly { readonly id: string; readonly text: string }[];
  readonly saveLayout: string;
}

/** The platform's app menu. */
export interface AppMenuService {
  /**
   * Shows the native menu bar with `labels`, calling `onCommand` for the app's commands and
   * `onLayout` with the id of a named layout chosen in the View menu.
   * Resolves to `false` where there is none (Windows, Linux): the DM window shows its own
   * menu button instead.
   */
  install(
    labels: AppMenuLabels,
    onCommand: (command: AppCommand) => void,
    onLayout: (id: string) => void,
  ): Promise<boolean>;
}
