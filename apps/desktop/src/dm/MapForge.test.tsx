import type { MemoryFileContent } from "@dungeon-manager/storage";
import { createI18n } from "@dungeon-manager/ui";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { MapForge } from "./MapForge.js";
import { ActiveWorkspaceContext, type Workspace } from "./shell/workspace.js";

// The Map Forge's document (T-176a): a library map opened without a scene.

const MAP = "library/maps/turm.png";
const SIDECAR = `${MAP}.dm.json`;
const HASH = `sha256:${"b".repeat(64)}`;

const sidecar = (map: object, info?: object) =>
  JSON.stringify({
    schemaVersion: 1,
    original: { hash: HASH },
    map: {
      grid: { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 },
      levels: [
        { id: "ground", name: "Erdgeschoss" },
        { id: "cellar", name: "Keller" },
      ],
      rooms: [],
      ...map,
    },
    ...(info && { info }),
  });

function renderForge(
  files: Record<string, MemoryFileContent>,
  path: string | null = MAP,
  workspace: Workspace = "mapForge",
) {
  const library = fakeLibraryService("/lib", { [MAP]: "png", ...files });
  const onClose = vi.fn();
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <ActiveWorkspaceContext value={workspace}>
        <MapForge service={library.service} path={path} onClose={onClose} />
      </ActiveWorkspaceContext>
    </I18nextProvider>,
  );
  return { library, onClose };
}

const saved = (library: ReturnType<typeof fakeLibraryService>) =>
  JSON.parse(library.fs.files().get(SIDECAR) ?? "{}") as {
    map?: { grid: object; fogEffect?: object; levels: object[] };
    info?: object;
  };

describe("MapForge", () => {
  test("shows the open map's name, its levels and rooms; closing asks the owner", async () => {
    const { onClose } = renderForge({
      [SIDECAR]: sidecar({}, { name: "Turm der Magier" }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    expect(within(tree).getByText("Turm der Magier")).toBeTruthy();
    expect(within(tree).getByText("Erdgeschoss")).toBeTruthy();
    expect(within(tree).getByText("Keller")).toBeTruthy();
    expect(within(tree).getByText("Noch keine Räume")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Turm der Magier schließen" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  test("edits the grid and the default biome in the sidecar, keeping the rest", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    const cell =
      await screen.findByLabelText<HTMLInputElement>("Zellgröße (Pixel)");
    expect(cell.value).toBe("70");
    fireEvent.change(cell, { target: { value: "140" } });
    fireEvent.change(screen.getByLabelText("Versatz waagerecht (Pixel)"), {
      target: { value: "12.5" },
    });
    fireEvent.change(screen.getByLabelText("Standard-Biom aller Szenen"), {
      target: { value: "schnee" },
    });
    fireEvent.change(screen.getByLabelText("Stärke: 100 %"), {
      target: { value: "60" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    await waitFor(() => {
      expect(saved(library).map).toMatchObject({
        grid: { cellSizePx: 140, offsetXPx: 12.5, offsetYPx: 0 },
        fogEffect: { biome: "schnee", strength: 0.6 },
        levels: [{ id: "ground" }, { id: "cellar" }],
      });
    });

    // "Keins" takes the biome out again.
    fireEvent.change(screen.getByLabelText("Standard-Biom aller Szenen"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    await waitFor(() => {
      expect(saved(library).map?.fogEffect).toBeUndefined();
    });
  });

  test("a save of the grid alone keeps the stored biome and unknown fields exactly", async () => {
    const { library } = renderForge({
      [SIDECAR]: sidecar({
        grid: { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0, unit: "ft" },
        fogEffect: { biome: "schnee", strength: 0.333, wind: 3 },
      }),
    });
    fireEvent.change(await screen.findByLabelText("Zellgröße (Pixel)"), {
      target: { value: "80" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    await waitFor(() => {
      expect(saved(library).map).toMatchObject({
        grid: { cellSizePx: 80, unit: "ft" },
        fogEffect: { biome: "schnee", strength: 0.333, wind: 3 },
      });
    });
    // A changed biome keeps the unknown fields too.
    fireEvent.change(screen.getByLabelText("Standard-Biom aller Szenen"), {
      target: { value: "asche" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    await waitFor(() => {
      expect(saved(library).map?.fogEffect).toEqual({
        biome: "asche",
        strength: 0.33,
        wind: 3,
      });
    });
  });

  test("a map without a sidecar gets one with the edited data", async () => {
    const { library } = renderForge({});
    fireEvent.change(await screen.findByLabelText("Zellgröße (Pixel)"), {
      target: { value: "50" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    await waitFor(() => {
      expect(saved(library)).toMatchObject({
        original: { hash: HASH },
        map: {
          grid: { cellSizePx: 50 },
          levels: [{ id: "level-1", name: "Erdgeschoss" }],
        },
      });
    });
  });

  test("an invalid cell size cannot be saved", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.change(await screen.findByLabelText("Zellgröße (Pixel)"), {
      target: { value: "0" },
    });
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Kartendaten speichern",
      }).disabled,
    ).toBe(true);
    expect(screen.getByText(/Zellgröße muss größer als 0/)).toBeTruthy();
  });

  test("a change on disk shows while untouched and is not overwritten under edits", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    const cell =
      await screen.findByLabelText<HTMLInputElement>("Zellgröße (Pixel)");
    await library.fs.writeAtomic(
      SIDECAR,
      sidecar({ grid: { cellSizePx: 90, offsetXPx: 0, offsetYPx: 0 } }),
    );
    library.emit([SIDECAR]);
    await waitFor(() => {
      expect(cell.value).toBe("90");
    });

    fireEvent.change(cell, { target: { value: "120" } });
    await library.fs.writeAtomic(
      SIDECAR,
      sidecar({ grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 } }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    expect(
      await screen.findByText(
        /Kartendaten wurden inzwischen woanders geändert/,
      ),
    ).toBeTruthy();
    expect(saved(library).map?.grid).toMatchObject({ cellSizePx: 100 });
    // Saving again replaces it, as the message says.
    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    await waitFor(() => {
      expect(saved(library).map?.grid).toMatchObject({ cellSizePx: 120 });
    });
  });

  test("an unreadable sidecar is reported and never overwritten", async () => {
    const { library } = renderForge({ [SIDECAR]: "{ broken" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("Zellgröße (Pixel)")).toBeNull();
    expect(library.fs.files().get(SIDECAR)).toBe("{ broken");
  });

  test("without an open map it shows how to open one", () => {
    renderForge({}, null);
    expect(screen.getByText(/Doppelklicke im Katalog/)).toBeTruthy();
    expect(screen.getByText("Keine Karte geöffnet.")).toBeTruthy();
  });

  test("outside the Map Forge it shows nothing", () => {
    renderForge({ [SIDECAR]: sidecar({}) }, MAP, "gameOrchestrator");
    expect(screen.queryByRole("tree")).toBeNull();
    expect(screen.queryByLabelText("Zellgröße (Pixel)")).toBeNull();
  });
});
