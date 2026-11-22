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
        <MapForge service={library.service} path={path} onClose={onClose} />
      </ActiveWorkspaceContext>
    </I18nextProvider>,
  );
  return { library, onClose };
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

  test("a square box over the printed grid fills the grid fields and previews it; saving keeps it (T-177)", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    const cell =
      await screen.findByLabelText<HTMLInputElement>("Zellgröße (Pixel)");
    expect(view.calibration).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Box aufziehen" }));
    expect(view.calibration?.mode).toBe("box");

    act(() => {
      view.calibration?.onBox({ x: 130, y: 250 }, { x: 430, y: 550 });
    });
    expect(cell.value).toBe("100");
    expect(
      screen.getByLabelText<HTMLInputElement>("Versatz waagerecht (Pixel)")
        .value,
    ).toBe("30");
    await waitFor(() => {
      expect(screen.getByTestId("map-grid").textContent).toBe("100/30/50");
    });
    // A preview only: nothing is written before saving.
    expect(saved(library).map?.grid).toMatchObject({ cellSizePx: 70 });

    fireEvent.click(
      screen.getByRole("button", { name: "Kartendaten speichern" }),
    );
    await waitFor(() => {
      expect(saved(library).map?.grid).toEqual({
        cellSizePx: 100,
        offsetXPx: 30,
        offsetYPx: 50,
      });
    });
    // Saved: calibrating ends.
    expect(view.calibration).toBeNull();
  });

  test("the box may span another number of cells; moving the grid adds up every move", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.change(await screen.findByLabelText("Felder in der Box"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Box aufziehen" }));
    act(() => {
      view.calibration?.onBox({ x: 0, y: 0 }, { x: 300, y: 300 });
    });
    expect(
      screen.getByLabelText<HTMLInputElement>("Zellgröße (Pixel)").value,
    ).toBe("150");

    fireEvent.click(screen.getByRole("button", { name: "Raster verschieben" }));
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
    expect(
      screen.getByLabelText<HTMLInputElement>("Versatz waagerecht (Pixel)")
        .value,
    ).toBe("22");
    expect(
      screen.getByLabelText<HTMLInputElement>("Versatz senkrecht (Pixel)")
        .value,
    ).toBe("145");
  });

  test("while a grid field is invalid, moving the grid does not replace what is typed", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    const cell =
      await screen.findByLabelText<HTMLInputElement>("Zellgröße (Pixel)");
    fireEvent.click(screen.getByRole("button", { name: "Raster verschieben" }));
    fireEvent.change(cell, { target: { value: "" } });
    act(() => {
      view.calibration?.onShift(5, 0);
      view.calibration?.onDragStart();
      view.calibration?.onDrag(30, 0);
    });
    expect(cell.value).toBe("");
    expect(
      screen.getByLabelText<HTMLInputElement>("Versatz waagerecht (Pixel)")
        .value,
    ).toBe("0");
  });

  test("Verwerfen takes the stored grid back and ends calibrating", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(
      await screen.findByRole("button", { name: "Box aufziehen" }),
    );
    act(() => {
      view.calibration?.onBox({ x: 0, y: 0 }, { x: 300, y: 300 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(
      screen.getByLabelText<HTMLInputElement>("Zellgröße (Pixel)").value,
    ).toBe("70");
    expect(view.calibration).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId("map-grid").textContent).toBe("70/0/0");
    });
  });

  test("a room drawn on a level snaps to the grid, is saved and selected for naming (T-108c1)", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(await screen.findByRole("button", { name: "Rechteck" }));
    expect(view.tool).toBe("reveal");
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
    await waitFor(() => {
      expect(saved(library).map).toMatchObject({
        rooms: [
          {
            // A fresh random id, never one a deleted room had (ADR-0012 overrides).
            id: expect.stringMatching(/^room-[0-9a-z]{6}$/) as unknown,
            name: "Raum 1",
            levelId: "ground",
            // 70 px cells: corners on the nearest grid points.
            area: {
              outer: [
                [0, 0],
                [140, 0],
                [140, 140],
                [0, 140],
              ],
            },
          },
        ],
      });
    });
    // Ready to be named: the room's name field has the keyboard.
    const name = await screen.findByDisplayValue("Raum 1");
    expect(document.activeElement).toBe(name);
    expect(view.outlines).toEqual([
      expect.objectContaining({
        label: "Raum 1",
        selected: true,
      }),
    ]);
    const tree = screen.getByRole("tree", { name: "Karte" });
    expect(within(tree).getByText("Raum 1")).toBeTruthy();
  });

  test("Alt held as the shape is finished draws freely; a room that snaps flat is refused", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(await screen.findByRole("button", { name: "Polygon" }));
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
    expect(await screen.findByText(/Zu klein für einen Raum/)).toBeTruthy();
    expect(saved(library).map?.rooms).toEqual([]);

    act(() => {
      view.onArea?.(small, "reveal", true);
    });
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({ area: small }),
      ]);
    });
  });

  test("a room snaps to the grid the DM sees, an unsaved calibration included", async () => {
    const { library } = renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.change(await screen.findByLabelText("Zellgröße (Pixel)"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rechteck" }));
    act(() => {
      view.onArea?.(
        {
          outer: [
            [10, 10],
            [90, 10],
            [90, 90],
            [10, 90],
          ],
          holes: [],
        },
        "reveal",
        false,
      );
    });
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({
          area: {
            outer: [
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ],
            holes: [],
          },
        }),
      ]);
    });
  });
  test("a room is renamed, marked secret and deleted after confirming", async () => {
    const area = {
      outer: [
        [0, 0],
        [70, 0],
        [70, 70],
      ],
      holes: [],
    };
    const { library } = renderForge({
      [SIDECAR]: sidecar({
        rooms: [{ id: "hall", name: "Halle", area, levelId: "ground" }],
      }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    fireEvent.click(within(tree).getByText("Halle"));
    const name = screen.getByDisplayValue("Halle");
    fireEvent.change(name, { target: { value: "Thronsaal" } });
    fireEvent.blur(name);
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({ id: "hall", name: "Thronsaal" }),
      ]);
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Geheimraum/ }));
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({ id: "hall", secret: true }),
      ]);
    });
    expect(await within(tree).findByText("geheim")).toBeTruthy();

    // An emptied name shows the room's name again; nothing is saved.
    const renamed = screen.getByDisplayValue("Thronsaal");
    fireEvent.change(renamed, { target: { value: "  " } });
    fireEvent.blur(renamed);
    expect(screen.getByDisplayValue("Thronsaal")).toBeTruthy();

    // The keyboard follows the question: to "Behalten", back to "Raum löschen …".
    fireEvent.click(screen.getByRole("button", { name: "Raum löschen …" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Behalten" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Behalten" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Raum löschen …" }),
    );
    expect(saved(library).map?.rooms).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Raum löschen …" }));
    fireEvent.click(
      screen.getByRole("button", { name: "„Thronsaal“ löschen" }),
    );
    await waitFor(() => {
      expect(saved(library).map?.rooms).toEqual([]);
    });
    // The editor went with the room: the keyboard is on its level in the browser.
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("role")).toBe("treeitem");
    });
    expect(document.activeElement?.textContent).toContain("Erdgeschoss");
  });

  test("changes in quick succession never take the forge's own write for one from elsewhere", async () => {
    const area = {
      outer: [
        [0, 0],
        [70, 0],
        [70, 70],
      ],
      holes: [],
    };
    const { library } = renderForge({
      [SIDECAR]: sidecar({
        rooms: [{ id: "hall", name: "Halle", area, levelId: "ground" }],
      }),
    });
    const tree = await screen.findByRole("tree", { name: "Karte" });
    fireEvent.click(within(tree).getByText("Halle"));
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
    const name = screen.getByDisplayValue("Halle");
    fireEvent.change(name, { target: { value: "Thronsaal" } });
    fireEvent.blur(name);
    const secret = screen.getByRole("checkbox", { name: /Geheimraum/ });
    await waitFor(() => {
      expect(secret).toHaveProperty("disabled", false);
      expect(saved(library).map?.rooms).toEqual([
        expect.objectContaining({ name: "Thronsaal" }),
      ]);
    });
    fireEvent.click(secret);
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

  test("each level shows its own rooms and its own file", async () => {
    const area = {
      outer: [
        [0, 0],
        [70, 0],
        [70, 70],
      ],
      holes: [],
    };
    renderForge({
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
    await screen.findByRole("tree", { name: "Karte" });
    expect(view.outlines.map((each) => each.id)).toEqual(["hall"]);
    expect(view.path).toBe(MAP);
    fireEvent.change(screen.getByLabelText("Ebene"), {
      target: { value: "cellar" },
    });
    expect(view.outlines.map((each) => each.id)).toEqual(["vault"]);
    expect(view.path).toBe("library/maps/keller.png");
  });

  test("drawing a room and calibrating the grid take turns", async () => {
    renderForge({ [SIDECAR]: sidecar({}) });
    fireEvent.click(await screen.findByRole("button", { name: "Ellipse" }));
    fireEvent.click(screen.getByRole("button", { name: "Box aufziehen" }));
    expect(view.calibration?.mode).toBe("box");
    expect(
      screen
        .getByRole("button", { name: "Ellipse" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Lasso" }));
    expect(view.calibration).toBeNull();
    expect(view.tool).toBe("reveal");
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
