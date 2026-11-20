import { createI18n } from "@dungeon-manager/ui";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import type {
  AppCommand,
  AppMenuLabels,
  AppMenuService,
} from "../../platform/app-menu.js";
import { fakeLibraryService } from "../fake-library.test-data.js";
import { LibraryPanel } from "../LibraryPanel.js";
import { memoryStorage } from "../memory-storage.test-data.js";
import { DmShell } from "./DmShell.js";

const campaign = JSON.stringify({
  schemaVersion: 2,
  id: "c1",
  name: "Die verlorene Mine",
  players: [],
  visibilityDefaults: {},
});

function renderWindow(appMenu?: AppMenuService, welcome = false) {
  const library = fakeLibraryService("/lib", {
    "campaigns/mine/campaign.json": campaign,
  });
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <DmShell
        storage={memoryStorage()}
        root={document.createElement("html")}
        appMenu={appMenu}
      >
        <LibraryPanel
          service={library.service}
          newId={() => "id-1"}
          welcome={welcome}
        />
      </DmShell>
    </I18nextProvider>,
  );
}

/** A native menu bar that hands its labels and command callback to the test. */
function fakeNativeMenu() {
  let send: (command: AppCommand) => void = () => undefined;
  let labels: AppMenuLabels | null = null;
  const service: AppMenuService = {
    install: vi.fn(
      (given: AppMenuLabels, onCommand: (c: AppCommand) => void) => {
        labels = given;
        send = onCommand;
        return Promise.resolve(true);
      },
    ),
  };
  return {
    service,
    labels: () => labels,
    send: (command: AppCommand) => {
      send(command);
    },
  };
}

const menuButton = () => screen.getByRole("button", { name: "Menü" });

describe("app menu (T-130d)", () => {
  it("without a menu bar, the title bar's menu button opens the welcome dialog and the settings", async () => {
    renderWindow();
    await screen.findByText("Wähle eine Kampagne:");

    fireEvent.click(menuButton());
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Neue Kampagne …", "Willkommen …", "Einstellungen …"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Willkommen …" }));
    const welcome = screen.getByRole("dialog", { name: "Willkommen" });
    fireEvent.keyDown(welcome, { key: "Escape" });

    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("menuitem", { name: "Einstellungen …" }));
    expect(screen.getByRole("dialog", { name: "Einstellungen" })).toBeTruthy();
  });

  it("“Neue Kampagne …” asks for the name in the browser", async () => {
    renderWindow();
    await screen.findByText("Wähle eine Kampagne:");
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("menuitem", { name: "Neue Kampagne …" }));
    const form = screen.getByRole("group", { name: "Neue Kampagne …" });
    expect(
      within(form).getByRole("textbox", { name: "Name der neuen Kampagne" }),
    ).toBeTruthy();
  });

  it("with the native menu bar, there is no menu button and its commands reach the window", async () => {
    const native = fakeNativeMenu();
    renderWindow(native.service);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Menü" })).toBeNull();
    });
    expect(native.labels()).toMatchObject({
      file: "Ablage",
      newCampaign: "Neue Kampagne …",
      quit: "Dungeon Manager beenden",
    });
    await screen.findByText("Wähle eine Kampagne:");

    native.send("welcome");
    expect(
      await screen.findByRole("dialog", { name: "Willkommen" }),
    ).toBeTruthy();
  });

  it("closes the welcome dialog of the start before a menu command runs", async () => {
    const native = fakeNativeMenu();
    renderWindow(native.service, true);
    await screen.findByRole("list", { name: "Kampagnen in dieser Bibliothek" });
    await waitFor(() => {
      expect(native.labels()).not.toBeNull();
    });

    native.send("newCampaign");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const field = screen.getByRole("textbox", {
      name: "Name der neuen Kampagne",
    });
    expect(document.activeElement).toBe(field);

    // One dialog at a time: the settings replace the welcome dialog.
    native.send("welcome");
    expect(
      await screen.findByRole("dialog", { name: "Willkommen" }),
    ).toBeTruthy();
    native.send("settings");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Willkommen" })).toBeNull();
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Einstellungen" })).toBeTruthy();
  });

  it("falls back to the menu button when the menu bar cannot be installed", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderWindow({ install: () => Promise.reject(new Error("no menu")) });
    await waitFor(() => {
      expect(error).toHaveBeenCalled();
    });
    expect(menuButton()).toBeTruthy();
    error.mockRestore();
  });
});
