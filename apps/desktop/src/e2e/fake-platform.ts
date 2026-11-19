// In-memory platform services for the E2E harness (T-130a): the DM window runs in a plain
// browser, without Tauri. Only built in Vite's `e2e` mode (see vite.config.js).
import { createRenderer } from "@dungeon-manager/renderer";
import {
  createCampaign,
  createMemoryFileSystem,
  createScene,
  createSession,
  ensureLibraryLayout,
  newMap,
} from "@dungeon-manager/storage";
import type { DisplayService } from "../platform/displays.js";
import type { LibraryService } from "../platform/library.js";
import type { MapViewService } from "../platform/map-images.js";

/** A 120×60 gold PNG for the harness's note image (made by hand, no third-party content). */
const WAPPEN_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAIAAAAiz+n/AAAAaklEQVR42u3QQQ0AAAgEoKtmV0vZxhbOBxsJyHRxIApEi0a0aNEWRItGtGjRFkSLRrRo0YgWjWjRohEtGtGiRSNaNKJFi0a0aESLFo1o0YgWLRrRohEtWjSiRSNatGhEi0a0aNGIFo3oXxbxfwKg8w52OAAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

/** Library folder the harness pretends the DM chose. */
export const E2E_LIBRARY_ROOT = "/Bibliothek (E2E)";

const MAP_PATH = "library/maps/krypta.png";

/** A library with one campaign, one scene that has a map and one (still empty) session. */
export async function createE2eLibrary(): Promise<LibraryService> {
  const fs = createMemoryFileSystem();
  await ensureLibraryLayout(fs);
  const slug = await createCampaign(fs, {
    id: "e2e-campaign",
    name: "Fluch der Krypta",
  });
  await createScene(fs, slug, {
    id: "e2e-scene",
    name: "Krypta",
    map: newMap(
      { path: MAP_PATH, hash: `sha256:${"0".repeat(64)}` },
      { id: "e2e-level", name: "Ebene 1" },
    ),
  });
  // A campaign note with the Markdown the details panel renders (T-163).
  await fs.writeAtomic(
    `campaigns/${slug}/notes/campaign.md`,
    [
      "---",
      "system: D&D 5e",
      "tags:",
      "  - horror",
      "  - gruft",
      "---",
      "# Fluch der Krypta",
      "",
      "Die Gruppe sucht den **verschwundenen Priester**. Siehe [[Strahd]].",
      "",
      "> [!warning] Falle",
      "> Der Boden der Gruft gibt nach.",
      "",
      "| Ort | Gefahr |",
      "|---|---|",
      "| Krypta | hoch |",
      "",
      "![[wappen.png]]",
      "",
    ].join("\n"),
  );
  await fs.writeAtomic(`campaigns/${slug}/wiki/Strahd.md`, "# Strahd\n");
  // The memory file system holds text; the image's bytes come from `WAPPEN_PNG` below.
  await fs.writeAtomic(`campaigns/${slug}/bilder/wappen.png`, "png");
  await createSession(fs, slug, {
    id: "e2e-session",
    name: "Vorbereitung",
    date: "2026-11-28",
  });
  return {
    fs,
    currentRoot: () => Promise.resolve(E2E_LIBRARY_ROOT),
    chooseRoot: () => Promise.resolve(E2E_LIBRARY_ROOT),
    importMap: () => Promise.resolve(null),
    // Like the backend: only PNG here, by name, with real PNG bytes.
    readImage: async (path) => {
      const file = await fs.read(path);
      if (file.kind !== "ok" || !path.endsWith(".png"))
        throw new Error(`no image at ${path}`);
      return new Blob([WAPPEN_PNG], { type: "image/png" });
    },
    onChange: () => Promise.resolve(() => undefined),
  };
}

/** The very first start (T-153): no library folder chosen yet; the chosen one is empty. */
export function createFirstStartLibrary(): LibraryService {
  const fs = createMemoryFileSystem();
  let root: string | null = null;
  return {
    fs,
    currentRoot: () => Promise.resolve(root),
    chooseRoot: () => {
      root = E2E_LIBRARY_ROOT;
      return Promise.resolve(root);
    },
    importMap: () => Promise.resolve(null),
    readImage: (path) => Promise.reject(new Error(`no image at ${path}`)),
    onChange: () => Promise.resolve(() => undefined),
  };
}

export const e2eDisplays: DisplayService = {
  listDisplays: () =>
    Promise.resolve([
      { id: "laptop", name: "Notebook", width: 2560, height: 1600 },
      { id: "tv", name: "Tisch-TV", width: 3840, height: 2160 },
    ]),
  openPlayerView: () => Promise.resolve(),
};

/** A self-drawn map (rooms on a 100 px grid), so the harness needs no image file. */
function drawMap(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas not available");
  context.fillStyle = "#2b2622";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#b9a888";
  context.fillRect(100, 100, 500, 400);
  context.fillRect(600, 250, 400, 100);
  context.fillRect(1000, 100, 500, 800);
  return canvas;
}

export const e2eMapView: MapViewService = {
  loadImage: () => Promise.resolve(drawMap()),
  loadVideo: () =>
    Promise.reject(new Error("The E2E harness has no video maps.")),
  createRenderer: (canvas, size) =>
    createRenderer({ canvas, size, resolution: window.devicePixelRatio }),
};
