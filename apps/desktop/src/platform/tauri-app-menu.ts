import { Menu } from "@tauri-apps/api/menu";
import type { AppMenuService } from "./app-menu.js";
import type { PlatformFamily } from "./tauri-displays.js";

/**
 * The native menu bar on macOS (T-130d), built from translated labels. It replaces Tauri's
 * default menu, so it keeps that menu's system items (edit commands for text fields, window
 * commands, quit) and adds the app's commands. Elsewhere there is no menu bar.
 */
export function createTauriAppMenu(platform: PlatformFamily): AppMenuService {
  // The menu bar shown now; a newer one (new language) replaces and closes it.
  let current: Menu | null = null;
  let installs = 0;
  return {
    async install(labels, onCommand) {
      if (platform !== "macos") return false;
      const install = ++installs;
      const menu = await Menu.new({
        items: [
          {
            text: labels.appName,
            items: [
              { item: { About: null }, text: labels.about },
              { item: "Separator" },
              {
                id: "settings",
                text: labels.settings,
                accelerator: "CmdOrCtrl+,",
                action: () => {
                  onCommand("settings");
                },
              },
              { item: "Separator" },
              { item: "Services", text: labels.services },
              { item: "Separator" },
              { item: "Hide", text: labels.hide },
              { item: "HideOthers", text: labels.hideOthers },
              { item: "ShowAll", text: labels.showAll },
              { item: "Separator" },
              { item: "Quit", text: labels.quit },
            ],
          },
          {
            text: labels.file,
            items: [
              {
                id: "newCampaign",
                text: labels.newCampaign,
                action: () => {
                  onCommand("newCampaign");
                },
              },
              {
                id: "welcome",
                text: labels.welcome,
                action: () => {
                  onCommand("welcome");
                },
              },
              { item: "Separator" },
              { item: "CloseWindow", text: labels.closeWindow },
            ],
          },
          {
            text: labels.edit,
            items: [
              { item: "Undo", text: labels.undo },
              { item: "Redo", text: labels.redo },
              { item: "Separator" },
              { item: "Cut", text: labels.cut },
              { item: "Copy", text: labels.copy },
              { item: "Paste", text: labels.paste },
              { item: "SelectAll", text: labels.selectAll },
            ],
          },
          {
            text: labels.window,
            items: [
              { item: "Minimize", text: labels.minimize },
              { item: "Maximize", text: labels.zoom },
              { item: "Separator" },
              { item: "Fullscreen", text: labels.fullscreen },
            ],
          },
        ],
      });
      // Two quick language changes: only the newest menu may become the menu bar.
      if (install !== installs) {
        await menu.close();
        return true;
      }
      await menu.setAsAppMenu();
      const previous = current;
      current = menu;
      await previous?.close();
      return true;
    },
  };
}
