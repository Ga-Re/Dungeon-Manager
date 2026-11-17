import { availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Display, DisplayService } from "./displays.js";

const PLAYER_LABEL = "player";

/** Displays and the player window via the Tauri window API. */
export function createTauriDisplayService(): DisplayService {
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

    async openPlayerView(display: Display, title: string) {
      const monitor = monitors.get(display.id);
      if (!monitor) throw new Error(`Unknown display ${display.id}`);

      const window =
        (await WebviewWindow.getByLabel(PLAYER_LABEL)) ??
        (await createPlayerWindow(title));
      // Leave fullscreen first: most platforms only move a windowed window between displays.
      await window.setFullscreen(false);
      await window.setPosition(monitor.position);
      await window.setFullscreen(true);
      await window.setFocus();
    },
  };
}

function createPlayerWindow(title: string): Promise<WebviewWindow> {
  const window = new WebviewWindow(PLAYER_LABEL, {
    url: "player.html",
    title,
    decorations: false,
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
