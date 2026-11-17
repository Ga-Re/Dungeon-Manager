/** A physical display the player view can be shown on. */
export interface Display {
  /** Identifies the display within the most recent `listDisplays()` result. */
  readonly id: string;
  /** Name reported by the operating system, if any. */
  readonly name: string | null;
  /** Resolution in physical pixels. */
  readonly width: number;
  readonly height: number;
}

/** Known failure reasons; the UI translates them (no hard-coded strings). */
export type DisplayErrorCode = "unknownDisplay";

/** A display failure with a translatable code. */
export class DisplayError extends Error {
  constructor(readonly code: DisplayErrorCode) {
    super(code);
    this.name = "DisplayError";
  }
}

/**
 * Platform adapter for displays and the player window (ARCHITECTURE §4: platform code
 * lives behind adapters). The Tauri implementation is in `tauri-displays.ts`.
 */
export interface DisplayService {
  /** Lists the connected displays; call again after plugging in a display. */
  listDisplays(): Promise<readonly Display[]>;
  /** Opens the player window fullscreen on `display`, or moves it there if already open. */
  openPlayerView(display: Display, title: string): Promise<void>;
}
