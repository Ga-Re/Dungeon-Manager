import type { MemoryFileContent } from "@dungeon-manager/storage";
import { createI18n } from "@dungeon-manager/ui";
import {
  act,
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
import {
  CommandRegistryContext,
  createCommandRegistry,
} from "./shell/command.js";
import type { Polygon } from "@dungeon-manager/schema";
import type { MapCalibration, MapOutline } from "./MapView.js";
import { ActiveWorkspaceContext, type Workspace } from "./shell/workspace.js";

// The Map Forge's document (T-176a): a library map opened without a scene.

// jsdom has no renderer: the map view is a stand-in that shows the grid it gets and plays the
// DM's calibration gestures (T-177). MapView's own pointer and key handling is tested in
// MapView.test.tsx (also on a turned view) and the E2E test.
const view = vi.hoisted(() => ({
  calibration: null as MapCalibration | null,
  tool: "pan",
  path: "",
  onArea: null as
    ((area: Polygon, tool: "reveal" | "hide", free: boolean) => void) | null,
  outlines: [] as readonly MapOutline[],
}));
vi.mock("./MapView.js", () => ({
  MapView: ({
    grid,
    calibration,
    tool,
    path,
    onArea,
    outlines,
  }: {
    grid: { cellSizePx: number; offsetXPx: number; offsetYPx: number } | null;
    calibration: MapCalibration | null;
    tool?: string;
    path: string;
    onArea?: (area: Polygon, tool: "reveal" | "hide", free: boolean) => void;
    outlines?: readonly MapOutline[];
  }) => {
    view.calibration = calibration;
    view.tool = tool ?? "pan";
    view.path = path;
    view.onArea = onArea ?? null;
    view.outlines = outlines ?? [];
    return (
      <p data-testid="map-grid">
        {grid
          ? `${String(grid.cellSizePx)}/${String(grid.offsetXPx)}/${String(grid.offsetYPx)}`
          : "none"}
      </p>
    );
  },
}));

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
        <CommandRegistryContext value={createCommandRegistry()}>
          <MapForge service={library.service} path={path} onClose={onClose} />
        </CommandRegistryContext>
      </ActiveWorkspaceContext>
    </I18nextProvider>,
  );
  return { library, onClose };
}

/** Like `renderForge`, and can show another workspace and come back. */
function renderForgeSwitchable(files: Record<string, MemoryFileContent>) {
  const library = fakeLibraryService("/lib", { [MAP]: "png", ...files });
  const registry = createCommandRegistry();
  const tree = (workspace: Workspace) => (
    <I18nextProvider i18n={createI18n("de")}>
      <ActiveWorkspaceContext value={workspace}>
        <CommandRegistryContext value={registry}>
          <MapForge service={library.service} path={MAP} onClose={vi.fn()} />
        </CommandRegistryContext>
      </ActiveWorkspaceContext>
    </I18nextProvider>
  );
  const { rerender } = render(tree("mapForge"));
  return {
    library,
    rerenderIn: (workspace: Workspace) => {
      rerender(tree(workspace));
    },
  };
}

const saved = (library: ReturnType<typeof fakeLibraryService>) =>
  JSON.parse(library.fs.files().get(SIDECAR) ?? "{}") as {
    map?: {
      grid: object;
      fogEffect?: object;
      levels: object[];
      rooms: object[];
    };
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
    // Each level says it has no rooms yet.
    expect(within(tree).getAllByText("Noch keine Räume")).toHaveLength(2);
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

  test("Raster kalibrieren is a ribbon tool: a square box fills its panel, the map previews it, OK saves (T-177, T-252)", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    expect(view.calibration).toBeNull();
    fireEvent.click(
      await screen.findByRole("button", { name: "Raster kalibrieren" }),
    );
    const panel = screen.getByRole("dialog", { name: "Raster kalibrieren" });
    expect(view.calibration?.mode).toBe("box");

    act(() => {
      view.calibration?.onBox({ x: 130, y: 250 }, { x: 430, y: 550 });
    });
    expect(
      within(panel).getByLabelText<HTMLInputElement>("Zellgröße (Pixel)").value,
    ).toBe("100");
    expect(
      within(panel).getByLabelText<HTMLInputElement>(
        "Versatz waagerecht (Pixel)",
      ).value,
    ).toBe("30");
    expect(screen.getByTestId("map-grid").textContent).toBe("100/30/50");
    // A preview only: nothing is written before OK.
    expect(saved(library).map?.grid).toMatchObject({ cellSizePx: 70 });

    fireEvent.click(within(panel).getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(saved(library).map?.grid).toEqual({
        cellSizePx: 100,
        offsetXPx: 30,
        offsetYPx: 50,
      });
    });
    // Saved: the tool ends and the map takes pointer input as a map again.
    expect(
      screen.queryByRole("dialog", { name: "Raster kalibrieren" }),
    ).toBeNull();
    expect(view.calibration).toBeNull();
  });

  test("the box may span another number of cells; moving the grid adds up every move", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(
      await screen.findByRole("button", { name: "Raster kalibrieren" }),
    );
    const panel = screen.getByRole("dialog", { name: "Raster kalibrieren" });
    fireEvent.change(within(panel).getByLabelText("Felder in der Box"), {
      target: { value: "2" },
    });
    act(() => {
      view.calibration?.onBox({ x: 0, y: 0 }, { x: 300, y: 300 });
    });
    const field = (name: string) =>
      within(panel).getByLabelText<HTMLInputElement>(name).value;
    expect(field("Zellgröße (Pixel)")).toBe("150");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Raster verschieben" }),
    );
    expect(view.calibration?.mode).toBe("move");
    act(() => {
      // A drag reports its whole way since the press; arrow keys add up step by step, also
      // before the next render.
      view.calibration?.onDragStart();
      view.calibration?.onDrag(10, 0);
      view.calibration?.onDrag(20, -5);
      view.calibration?.onShift(1, 0);
      view.calibration?.onShift(1, 0);
    });
    expect(field("Versatz waagerecht (Pixel)")).toBe("22");
    expect(field("Versatz senkrecht (Pixel)")).toBe("145");
  });

  test("Raster kalibrieren also starts from the RASTER caption's menu", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(await screen.findByRole("button", { name: "Raster" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Raster kalibrieren" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Raster kalibrieren" }),
    ).toBeTruthy();
    expect(view.calibration?.mode).toBe("box");
  });

  test("leaving the Map Forge ends a running calibration", async () => {
    const { rerenderIn } = renderForgeSwitchable({ [SIDECAR]: sidecar({}) });
    fireEvent.click(
      await screen.findByRole("button", { name: "Raster kalibrieren" }),
    );
    act(() => {
      view.calibration?.onBox({ x: 0, y: 0 }, { x: 300, y: 300 });
    });
    rerenderIn("gameOrchestrator");
    rerenderIn("mapForge");
    expect(
      screen.queryByRole("dialog", { name: "Raster kalibrieren" }),
    ).toBeNull();
    expect(screen.getByTestId("map-grid").textContent).toBe("70/0/0");
  });

  test("while a grid field is invalid, moving the grid does not replace what is typed", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(
      await screen.findByRole("button", { name: "Raster kalibrieren" }),
    );
    const panel = screen.getByRole("dialog", { name: "Raster kalibrieren" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Raster verschieben" }),
    );
    const cell =
      within(panel).getByLabelText<HTMLInputElement>("Zellgröße (Pixel)");
    fireEvent.change(cell, { target: { value: "" } });
    act(() => {
      view.calibration?.onShift(5, 0);
      view.calibration?.onDragStart();
      view.calibration?.onDrag(30, 0);
    });
    expect(cell.value).toBe("");
    expect(
      within(panel).getByLabelText<HTMLInputElement>(
        "Versatz waagerecht (Pixel)",
      ).value,
    ).toBe("0");
    expect(
      within(panel).getByRole<HTMLButtonElement>("button", { name: "OK" })
        .disabled,
    ).toBe(true);
  });

  test("Abbrechen or Escape discards the calibration and shows the saved grid again", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    const tool = await screen.findByRole("button", {
      name: "Raster kalibrieren",
    });
    fireEvent.click(tool);
    act(() => {
      view.calibration?.onBox({ x: 0, y: 0 }, { x: 300, y: 300 });
    });
    expect(screen.getByTestId("map-grid").textContent).toBe("100/0/0");
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(view.calibration).toBeNull();
    expect(screen.getByTestId("map-grid").textContent).toBe("70/0/0");

    fireEvent.click(tool);
    act(() => {
      view.calibration?.onBox({ x: 0, y: 0 }, { x: 300, y: 300 });
    });
    fireEvent.keyDown(screen.getByLabelText("Felder in der Box"), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("dialog", { name: "Raster kalibrieren" }),
    ).toBeNull();
    expect(screen.getByTestId("map-grid").textContent).toBe("70/0/0");
    expect(saved(library).map?.grid).toMatchObject({ cellSizePx: 70 });
  });

  /** Starts "Raum anlegen" from the ribbon and returns its command panel. */
  const startAddRoom = async () => {
    fireEvent.click(
      await screen.findByRole("button", { name: "Raum anlegen" }),
    );
    return screen.getByRole("dialog", { name: "Raum anlegen" });
  };
  const square = (x: number, y: number, size: number): Polygon => ({
    outer: [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
    ],
    holes: [],
  });

  test("Raum anlegen: draw (again), name it, OK creates the room on its level (T-254)", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    const panel = await startAddRoom();
    expect(view.tool).toBe("reveal");
    const ok = within(panel).getByRole<HTMLButtonElement>("button", {
      name: "OK",
    });
    // Nothing drawn yet: nothing to create.
    expect(ok.disabled).toBe(true);
    act(() => {
      view.onArea?.(square(100, 100, 40), "reveal", false);
    });
    // Drawn again: the new shape replaces the first. Corners snap to the 70 px grid.
    act(() => {
      view.onArea?.(
        {
          outer: [
            [10, 20],
            [150, 20],
            [150, 130],
            [10, 130],
          ],
          holes: [],
        },
        "reveal",
        false,
      );
    });
    expect(view.outlines).toEqual([
      expect.objectContaining({ label: "Raum 1", selected: true }),
    ]);
    fireEvent.change(within(panel).getByLabelText("Name"), {
      target: { value: "Gruft" },
    });
    fireEvent.click(
      within(panel).getByRole("checkbox", { name: /Geheimraum/ }),
    );
    // A preview only until OK.
    expect(saved(library).map?.rooms).toEqual([]);
    fireEvent.click(ok);
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        {
          // A fresh random id, never one a deleted room had (ADR-0012 overrides).
          id: expect.stringMatching(/^room-[0-9a-z]{6}$/) as unknown,
          name: "Gruft",
          levelId: "ground",
          secret: true,
          area: square(0, 0, 140),
        },
      ]);
    });
    expect(screen.queryByRole("dialog", { name: "Raum anlegen" })).toBeNull();
    // In the browser, selected, with the keyboard on it.
    const tree = screen.getByRole("tree", { name: "Karte" });
    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain("Gruft");
    });
    expect(within(tree).getByText("geheim")).toBeTruthy();
  });

  test("Alt held as the shape is finished draws freely; a room that snaps flat is refused", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    const panel = await startAddRoom();
    fireEvent.click(within(panel).getByRole("button", { name: "Polygon" }));
    const small = {
      outer: [
        [10, 10],
        [20, 10],
        [20, 20],
      ] as [number, number][],
      holes: [],
    };
    // An Alt pressed somewhere else (then Alt+Tab, no key-up) does not count.
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    act(() => {
      view.onArea?.(small, "reveal", false);
    });
    expect(within(panel).getByText(/Zu klein für einen Raum/)).toBeTruthy();
    act(() => {
      view.onArea?.(small, "reveal", true);
    });
    fireEvent.click(within(panel).getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({ area: small }),
      ]);
    });
  });

  test("one command at a time: Raum anlegen ends a calibration, and the other way round", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(
      await screen.findByRole("button", { name: "Raster kalibrieren" }),
    );
    act(() => {
      view.calibration?.onBox({ x: 0, y: 0 }, { x: 150, y: 150 });
    });
    await startAddRoom();
    expect(
      screen.queryByRole("dialog", { name: "Raster kalibrieren" }),
    ).toBeNull();
    expect(view.calibration).toBeNull();
    expect(screen.getByTestId("map-grid").textContent).toBe("70/0/0");

    fireEvent.click(screen.getByRole("button", { name: "Raster kalibrieren" }));
    expect(screen.queryByRole("dialog", { name: "Raum anlegen" })).toBeNull();
    expect(view.tool).toBe("pan");
  });

  test("another level, or leaving the Map Forge, drops a room drawn but not confirmed", async () => {
    const { library, rerenderIn } = renderForgeSwitchable({
      [SIDECAR]: sidecar({
        levels: [
          { id: "ground", name: "Erdgeschoss" },
          { id: "cellar", name: "Keller" },
        ],
        rooms: [
          {
            id: "hall",
            name: "Halle",
            area: square(0, 0, 70),
            levelId: "ground",
          },
        ],
      }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    fireEvent.click(within(tree).getByText("Halle"));
    fireEvent.click(screen.getByRole("button", { name: "Raum anlegen" }));
    const panel = screen.getByRole("dialog", { name: "Raum anlegen" });
    act(() => {
      view.onArea?.(square(0, 0, 140), "reveal", false);
    });
    fireEvent.change(within(panel).getByLabelText("Ebene"), {
      target: { value: "cellar" },
    });
    // Nothing of the old level stays drawn or selected.
    expect(view.outlines).toEqual([]);
    expect(
      within(panel).getByRole<HTMLButtonElement>("button", { name: "OK" })
        .disabled,
    ).toBe(true);

    act(() => {
      view.onArea?.(square(0, 0, 140), "reveal", false);
    });
    rerenderIn("gameOrchestrator");
    rerenderIn("mapForge");
    expect(screen.queryByRole("dialog", { name: "Raum anlegen" })).toBeNull();
    expect(saved(library).map?.rooms).toHaveLength(1);
  });

  test("Abbrechen discards a drawn room", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    const panel = await startAddRoom();
    act(() => {
      view.onArea?.(square(0, 0, 140), "reveal", false);
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Abbrechen" }));
    expect(view.outlines).toEqual([]);
    expect(view.tool).toBe("pan");
    expect(saved(library).map?.rooms).toEqual([]);
  });

  test("a room is edited by double-click and deleted from its context menu", async () => {
    const area = square(0, 0, 70);
    const { library } = renderForge({
      [SIDECAR]: sidecar({
        rooms: [{ id: "hall", name: "Halle", area, levelId: "ground" }],
      }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    fireEvent.doubleClick(within(tree).getByText("Halle"));
    const edit = screen.getByRole("dialog", { name: "Raum bearbeiten" });
    fireEvent.change(within(edit).getByLabelText("Name"), {
      target: { value: "Thronsaal" },
    });
    fireEvent.click(within(edit).getByRole("checkbox", { name: /Geheimraum/ }));
    fireEvent.click(within(edit).getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        {
          id: "hall",
          name: "Thronsaal",
          area,
          levelId: "ground",
          secret: true,
        },
      ]);
    });

    // The context menu, by keyboard: Shift+F10 on the room.
    const item = within(tree)
      .getByText("Thronsaal")
      .closest<HTMLElement>('[role="treeitem"]');
    if (!item) throw new Error("no tree item");
    fireEvent.keyDown(item, { key: "F10", shiftKey: true });
    fireEvent.click(screen.getByRole("menuitem", { name: "Raum löschen" }));
    const confirm = screen.getByRole("dialog", { name: "Raum löschen" });
    expect(within(confirm).getByText(/„Thronsaal“ löschen/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([]);
    });
    // The keyboard goes to the room's level.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain("Erdgeschoss");
    });
  });

  test("the RÄUME caption menu edits and deletes the selected room", async () => {
    renderForge({
      [SIDECAR]: sidecar({
        rooms: [
          {
            id: "hall",
            name: "Halle",
            area: square(0, 0, 70),
            levelId: "ground",
          },
        ],
      }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    fireEvent.click(screen.getByRole("button", { name: "Räume" }));
    expect(
      screen
        .getByRole("menuitem", { name: "Raum bearbeiten" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    fireEvent.click(within(tree).getByText("Halle"));
    fireEvent.click(screen.getByRole("button", { name: "Räume" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Raum bearbeiten" }));
    expect(
      screen.getByRole("dialog", { name: "Raum bearbeiten" }),
    ).toBeTruthy();
  });

  test("changes in quick succession never take the forge's own write for one from elsewhere", async () => {
    const area = square(0, 0, 70);
    const { library } = renderForge({
      [SIDECAR]: sidecar({
        rooms: [{ id: "hall", name: "Halle", area, levelId: "ground" }],
      }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    // The forge reads the sidecar back after its write only later: the next change comes first.
    const read = library.fs.read.bind(library.fs);
    const write = library.fs.writeAtomic.bind(library.fs);
    let holdNextRead = false;
    const slowReads: (() => void)[] = [];
    library.fs.writeAtomic = async (path, text) => {
      await write(path, text);
      holdNextRead = true;
    };
    library.fs.read = (path) => {
      if (!holdNextRead) return read(path);
      holdNextRead = false;
      return new Promise((resolve) => {
        slowReads.push(() => {
          void read(path).then(resolve);
        });
      });
    };
    fireEvent.doubleClick(within(tree).getByText("Halle"));
    let edit = screen.getByRole("dialog", { name: "Raum bearbeiten" });
    fireEvent.change(within(edit).getByLabelText("Name"), {
      target: { value: "Thronsaal" },
    });
    fireEvent.click(within(edit).getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({ name: "Thronsaal" }),
      ]);
    });
    fireEvent.doubleClick(within(tree).getByText("Thronsaal"));
    edit = screen.getByRole("dialog", { name: "Raum bearbeiten" });
    fireEvent.click(within(edit).getByRole("checkbox", { name: /Geheimraum/ }));
    fireEvent.click(within(edit).getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({ name: "Thronsaal", secret: true }),
      ]);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    library.fs.read = read;
    library.fs.writeAtomic = write;
    slowReads.forEach((resume) => {
      resume();
    });
  });

  test("each level shows its own rooms and its own file; a room is drawn on the level chosen", async () => {
    const area = square(0, 0, 70);
    const { library } = renderForge({
      [SIDECAR]: sidecar({
        levels: [
          { id: "ground", name: "Erdgeschoss" },
          {
            id: "cellar",
            name: "Keller",
            asset: { path: "library/maps/keller.png", hash: HASH },
          },
        ],
        rooms: [
          { id: "hall", name: "Halle", area },
          { id: "vault", name: "Gewölbe", area, levelId: "cellar" },
        ],
      }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    expect(view.outlines.map((each) => each.id)).toEqual(["hall"]);
    expect(view.path).toBe(MAP);
    fireEvent.click(within(tree).getByText("Keller"));
    expect(view.outlines.map((each) => each.id)).toEqual(["vault"]);
    expect(view.path).toBe("library/maps/keller.png");

    const panel = await startAddRoom();
    expect(within(panel).getByLabelText<HTMLSelectElement>("Ebene").value).toBe(
      "cellar",
    );
    fireEvent.change(within(panel).getByLabelText("Ebene"), {
      target: { value: "ground" },
    });
    expect(view.path).toBe(MAP);
    act(() => {
      view.onArea?.(square(0, 0, 140), "reveal", false);
    });
    fireEvent.click(within(panel).getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(saved(library).map?.rooms).toHaveLength(3);
    });
    expect(saved(library).map?.rooms[2]).toMatchObject({ levelId: "ground" });
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
