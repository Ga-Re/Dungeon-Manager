// Entry point of the E2E harness (T-130a): the real DM window with in-memory platform services.
import { renderDmWindow } from "../dm/render.js";
import {
  createE2eLibrary,
  createFirstStartLibrary,
  e2eDisplays,
  e2eMapView,
  e2ePlayerFeed,
} from "./fake-platform.js";

let nextId = 0;

const options = new URLSearchParams(location.search);

renderDmWindow({
  displayService: e2eDisplays,
  // `?firstStart`: as on a new computer, before any library folder was chosen (T-153).
  // `?levels`: the scene's map has two levels (T-118c).
  // `?levelFiles`: the file dialog returns a map of another size, then one that fits (T-118d).
  // `?failSaves`: saving a scene fails, as on a full disk (T-223b).
  // `?freeToken`: the scene has a token standing between cells (T-233b).
  libraryService: options.has("firstStart")
    ? createFirstStartLibrary()
    : await createE2eLibrary({
        levels: options.has("levels"),
        imports: options.has("levelFiles")
          ? ["library/maps/klein.png", "library/maps/gruft.png"]
          : [],
        failSceneSaves: options.has("failSaves"),
        freeToken: options.has("freeToken"),
      }),
  mapViewService: e2eMapView,
  playerFeed: e2ePlayerFeed,
  newId: () => `e2e-${String(++nextId)}`,
});
