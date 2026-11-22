// In-memory platform services for the E2E harness (T-130a): the DM window runs in a plain
// browser, without Tauri. Only built in Vite's `e2e` mode (see vite.config.js).
import { createRenderer } from "@dungeon-manager/renderer";
import {
  createCampaign,
  createMemoryFileSystem,
  createScene,
  createSession,
  ensureLibraryLayout,
  ensureMapData,
  newMapData,
} from "@dungeon-manager/storage";
import type { DisplayService } from "../platform/displays.js";
import type { LibraryService } from "../platform/library.js";
import type { MapViewService } from "../platform/map-images.js";
import {
  createPlayerFeedSender,
  type PlayerFeedSender,
} from "../platform/player-feed.js";

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

/**
 * A library with one campaign, one scene that has a map and one (still empty) session. With
 * `levels`, the scene's map has a second level, a cellar (T-118c). `imports` are the files the
 * file dialog returns, one per call; after them it is cancelled. With `failSceneSaves`, writing
 * a scene file fails once the library is set up, as on a full disk (T-223b). `tokens` start on
 * the scene: "free" a Goblin standing between cells, as placed freely (T-233b); "arranged" Tiny
 * ones sharing cells and a Small one next to a Medium one (T-233c).
 */
export async function createE2eLibrary({
  levels = false,
  imports = [],
  failSceneSaves = false,
  tokens = "none",
}: {
  readonly levels?: boolean;
  readonly imports?: readonly string[];
  readonly failSceneSaves?: boolean;
  readonly tokens?: "none" | "free" | "arranged";
} = {}): Promise<LibraryService> {
  const queued = [...imports];
  const fs = createMemoryFileSystem();
  await ensureLibraryLayout(fs);
  const slug = await createCampaign(fs, {
    id: "e2e-campaign",
    name: "Fluch der Krypta",
  });
  const asset = { path: MAP_PATH, hash: `sha256:${"0".repeat(64)}` };
  // The map is in the library like any imported one (its pixels are drawn by `drawMap`).
  await fs.writeAtomic(MAP_PATH, "png");
  // The map's grid and levels live in its sidecar (ADR-0012).
  const data = newMapData("Ebene 1");
  if (levels)
    await ensureMapData(fs, asset, {
      ...data,
      levels: [...data.levels, { id: "e2e-cellar", name: "Gruftkeller" }],
    });
  await createScene(fs, slug, {
    id: "e2e-scene",
    name: "Krypta",
    map: { asset, levelName: "Ebene 1" },
  });
  if (tokens !== "none") {
    const path = `campaigns/${slug}/scenes/e2e-scene.json`;
    const file = await fs.read(path);
    if (file.kind !== "ok") throw new Error("the E2E scene is missing");
    const scene = JSON.parse(file.text) as { tokens: unknown[] };
    const levelId = data.levels[0]?.id ?? "";
    const at = (
      id: string,
      name: string,
      size: string,
      col: number,
      row: number,
    ) => ({ id, name, size, position: { col, row }, levelId });
    scene.tokens.push(
      ...(tokens === "free"
        ? [at("e2e-goblin", "Goblin", "medium", 3.4, 2.3)]
        : [
            // Around the map's middle (cell 8, 5 of 16 × 10), where zooming in keeps them.
            at("e2e-rat-1", "Ratte 1", "tiny", 6, 4),
            at("e2e-rat-2", "Ratte 2", "tiny", 7, 4),
            at("e2e-rat-3", "Ratte 3", "tiny", 7, 4),
            at("e2e-rat-4", "Ratte 4", "tiny", 8, 4),
            at("e2e-rat-5", "Ratte 5", "tiny", 8, 4),
            at("e2e-rat-6", "Ratte 6", "tiny", 8, 4),
            at("e2e-rat-7", "Ratte 7", "tiny", 9, 4),
            at("e2e-rat-8", "Ratte 8", "tiny", 9, 4),
            at("e2e-rat-9", "Ratte 9", "tiny", 9, 4),
            at("e2e-rat-10", "Ratte 10", "tiny", 9, 4),
            at("e2e-kobold", "Kobold", "small", 7, 5),
            at("e2e-aria", "Aria", "medium", 8, 5),
          ]),
    );
    await fs.writeAtomic(path, JSON.stringify(scene));
  }
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
  if (failSceneSaves) {
    const write = fs.writeAtomic.bind(fs);
    fs.writeAtomic = (path, ...rest) =>
      /\/scenes\//.test(path)
        ? Promise.reject(new Error("Datenträger voll"))
        : write(path, ...rest);
  }
  return {
    fs,
    currentRoot: () => Promise.resolve(E2E_LIBRARY_ROOT),
    chooseRoot: () => Promise.resolve(E2E_LIBRARY_ROOT),
    importMap: async () => {
      const path = queued.shift();
      if (path === undefined) return null;
      // Like an import: the file is in the library afterwards (its pixels are drawn below).
      await fs.writeAtomic(path, "png");
      return { path, hash: `sha256:${"1".repeat(64)}` };
    },
    // Like the backend: only PNG here, by name, with real PNG bytes.
    readImage: async (path) => {
      const file = await fs.read(path);
      if (file.kind !== "ok" || !path.endsWith(".png"))
        throw new Error(`no image at ${path}`);
      return new Blob([WAPPEN_PNG], { type: "image/png" });
    },
    hashFile: async (path) => {
      if ((await fs.read(path)).kind !== "ok")
        throw new Error(`no file at ${path}`);
      return { path, hash: `sha256:${"2".repeat(64)}` };
    },
    // Previews are made but not kept: the harness has no WebP to show back.
    writePreview: () => Promise.resolve(),
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
    hashFile: (path) => Promise.reject(new Error(`no file at ${path}`)),
    writePreview: () => Promise.resolve(),
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

/**
 * A self-drawn map (rooms on a 100 px grid), so the harness needs no image file. A file named
 * `klein…` is smaller, as a level image that does not fit the map (T-118d).
 */
function drawMap(path: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const small = path.split("/").at(-1)?.startsWith("klein") === true;
  canvas.width = small ? 800 : 1600;
  canvas.height = small ? 500 : 1000;
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

/**
 * The TV's feed (T-233b): what the TV was last sent is noted on the page, so E2E tests can check
 * what reaches the players without a second window.
 */
export const e2ePlayerFeed: PlayerFeedSender = createPlayerFeedSender(
  (message) => {
    document.body.dataset["e2eTv"] = JSON.stringify(message.scene);
    document.body.dataset["e2eBlackout"] = String(message.blackout === true);
  },
  () => undefined,
);

export const e2eMapView: MapViewService = {
  loadImage: (path) => Promise.resolve(drawMap(path)),
  loadVideo: () =>
    Promise.reject(new Error("The E2E harness has no video maps.")),
  // The real renderer; its camera and tokens are noted on the page so E2E tests can check the
  // view's transform (zoom, fit) and where tokens are drawn without reading pixels.
  createRenderer: async (canvas, size) => {
    const renderer = await createRenderer({
      canvas,
      size,
      resolution: window.devicePixelRatio,
    });
    return {
      ...renderer,
      setCamera(camera) {
        document.body.dataset["e2eCamera"] = JSON.stringify(camera);
        renderer.setCamera(camera);
      },
      setTokens(tokens, tokenOptions) {
        document.body.dataset["e2eTokens"] = JSON.stringify(tokens);
        renderer.setTokens(tokens, tokenOptions);
      },
    };
  },
};
