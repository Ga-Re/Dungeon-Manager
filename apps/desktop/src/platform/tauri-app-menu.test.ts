import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppMenuLabels } from "./app-menu.js";
import { createTauriAppMenu } from "./tauri-app-menu.js";

// vi.mock factories are hoisted above the imports, so their shared state is hoisted too.
const tauri = vi.hoisted(() => ({
  created: [] as unknown[],
  setAsAppMenu: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: vi.fn((options: unknown) => {
      tauri.created.push(options);
      return Promise.resolve({ setAsAppMenu: tauri.setAsAppMenu });
    }),
  },
}));

const LABELS: AppMenuLabels = {
  appName: "Dungeon Manager",
  about: "Über Dungeon Manager",
  settings: "Einstellungen …",
  services: "Dienste",
  hide: "Dungeon Manager ausblenden",
  hideOthers: "Andere ausblenden",
  showAll: "Alle einblenden",
  quit: "Dungeon Manager beenden",
  file: "Ablage",
  newCampaign: "Neue Kampagne …",
  welcome: "Willkommen …",
  closeWindow: "Fenster schließen",
  edit: "Bearbeiten",
  undo: "Widerrufen",
  redo: "Wiederholen",
  cut: "Ausschneiden",
  copy: "Kopieren",
  paste: "Einsetzen",
  selectAll: "Alles auswählen",
  window: "Fenster",
  minimize: "Im Dock ablegen",
  zoom: "Zoomen",
  fullscreen: "Vollbild",
};

interface Entry {
  id?: string;
  text?: string;
  item?: unknown;
  accelerator?: string;
  action?: () => void;
  items?: Entry[];
}

function builtMenu(): Entry[] {
  return (tauri.created.at(-1) as { items: Entry[] }).items;
}

describe("the native app menu (T-130d)", () => {
  beforeEach(() => {
    tauri.created.length = 0;
    tauri.setAsAppMenu.mockClear();
  });

  it("on macOS becomes the menu bar, in the DM's language, with the system items kept", async () => {
    const installed = await createTauriAppMenu("macos").install(
      LABELS,
      vi.fn(),
    );
    expect(installed).toBe(true);
    expect(tauri.setAsAppMenu).toHaveBeenCalledOnce();
    const menus = builtMenu();
    expect(menus.map((each) => each.text)).toEqual([
      "Dungeon Manager",
      "Ablage",
      "Bearbeiten",
      "Fenster",
    ]);
    // Text fields keep copy and paste once the default menu is replaced.
    expect(menus[2]?.items?.map((each) => each.item)).toEqual([
      "Undo",
      "Redo",
      "Separator",
      "Cut",
      "Copy",
      "Paste",
      "SelectAll",
    ]);
    expect(menus[0]?.items?.some((each) => each.item === "Quit")).toBe(true);
  });

  it("sends its commands to the DM window", async () => {
    const onCommand = vi.fn();
    await createTauriAppMenu("macos").install(LABELS, onCommand);
    const entries = builtMenu().flatMap((menu) => menu.items ?? []);
    const command = (id: string) => entries.find((each) => each.id === id);
    expect(command("newCampaign")?.text).toBe("Neue Kampagne …");
    expect(command("settings")?.accelerator).toBe("CmdOrCtrl+,");
    command("newCampaign")?.action?.();
    command("welcome")?.action?.();
    command("settings")?.action?.();
    expect(onCommand.mock.calls).toEqual([
      ["newCampaign"],
      ["welcome"],
      ["settings"],
    ]);
  });

  it("does not exist elsewhere: the DM window shows its menu button", async () => {
    const installed = await createTauriAppMenu("other").install(
      LABELS,
      vi.fn(),
    );
    expect(installed).toBe(false);
    expect(tauri.created).toHaveLength(0);
  });
});
