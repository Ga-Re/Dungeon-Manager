/** A physical display the player view can be shown on. */
export interface Display {
  /** Stable for the lifetime of the app session. */
  readonly id: string;
  /** Name reported by the operating system, if any. */
  readonly name: string | null;
  /** Resolution in physical pixels. */
  readonly width: number;
  readonly height: number;
}

/**
 * Platform adapter for displays and the player window (ARCHITECTURE §4: platform code
 * lives behind adapters). The Tauri implementation is in `tauri-displays.ts`.
 */
export interface DisplayService {
  listDisplays(): Promise<readonly Display[]>;
  /** Opens the player window fullscreen on `display`, or moves it there if already open. */
  openPlayerView(display: Display, title: string): Promise<void>;
}
