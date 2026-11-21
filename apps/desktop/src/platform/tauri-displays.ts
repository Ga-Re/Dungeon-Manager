import { availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { DisplayError, type DisplayService } from "./displays.js";

const PLAYER_LABEL = "player";

/** Operating system family; window placement differs on macOS. */
export type PlatformFamily = "macos" | "other";

/** Detects the platform from the webview's user agent (WKWebView on macOS). */
export function detectPlatformFamily(userAgent: string): PlatformFamily {
  return userAgent.includes("Macintosh") ? "macos" : "other";
}

/**
 * Displays and the player window via the Tauri window API.
 * @param playerPage page loaded in the player window (the renderer benchmark swaps it, T-105d)
 */
export function createTauriDisplayService(
  platform: PlatformFamily,
  playerPage = "player.html",
): DisplayService {
  let monitors = new Map<string, Monitor>();

  return {
    async listDisplays() {
      const found = await availableMonitors();
      monitors = new Map(
        found.map((monitor, index) => [String(index), monitor]),
      );
      return found.map((monitor, index) => ({
        id: String(index),
        name: monitor.name,
        width: monitor.size.width,
        height: monitor.size.height,
      }));
    },

    async openPlayerView(display, title) {
      const monitor = monitors.get(display.id);
      if (!monitor) throw new DisplayError("unknownDisplay");

      const window =
        (await WebviewWindow.getByLabel(PLAYER_LABEL)) ??
        (await createHiddenPlayerWindow(title, playerPage));
      // Leave fullscreen first: windows are only moved between displays while windowed.
      await setFullscreen(window, platform, false);
      await window.setPosition(originOf(monitor, platform));
      await setFullscreen(window, platform, true);
      await window.show();
      await window.setFocus();
    },
  };
}

/**
 * The monitor's top-left corner in the units `setPosition` expects. On macOS the reported
 * physical position is the logical origin scaled by *that* monitor's factor, while
 * `setPosition` converts physical values with the *window's* factor – so mixed Retina/TV
 * setups need the logical origin. Elsewhere physical desktop coordinates are exact.
 */
function originOf(monitor: Monitor, platform: PlatformFamily) {
  return platform === "macos"
    ? monitor.position.toLogical(monitor.scaleFactor)
    : monitor.position;
}

/**
 * macOS: "simple" fullscreen avoids a separate Space and its animation, during which
 * further window commands are ignored. Elsewhere regular fullscreen is immediate.
 */
function setFullscreen(
  window: WebviewWindow,
  platform: PlatformFamily,
  fullscreen: boolean,
): Promise<void> {
  return platform === "macos"
    ? window.setSimpleFullscreen(fullscreen)
    : window.setFullscreen(fullscreen);
}

/** Created hidden so it does not flash on the DM's screen before it is moved. */
function createHiddenPlayerWindow(
  title: string,
  url: string,
): Promise<WebviewWindow> {
  const window = new WebviewWindow(PLAYER_LABEL, {
    url,
    title,
    decorations: false,
    visible: false,
    // No drag & drop: its file-path events would go on the global event bus (ARCHITECTURE §8).
    dragDropEnabled: false,
  });
  return new Promise((resolve, reject) => {
    void window.once("tauri://created", () => {
      resolve(window);
    });
    void window.once<string>("tauri://error", (event) => {
      reject(new Error(event.payload));
    });
  });
}
