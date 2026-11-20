// Entry point of the E2E harness (T-130a): the real DM window with in-memory platform services.
import { renderDmWindow } from "../dm/render.js";
import {
  createE2eLibrary,
  createFirstStartLibrary,
  e2eDisplays,
  e2eMapView,
} from "./fake-platform.js";

let nextId = 0;

const options = new URLSearchParams(location.search);

renderDmWindow({
  displayService: e2eDisplays,
  // `?firstStart`: as on a new computer, before any library folder was chosen (T-153).
  // `?levels`: the scene's map has two levels (T-118c).
  // `?levelFiles`: the file dialog returns a map of another size, then one that fits (T-118d).
  libraryService: options.has("firstStart")
    ? createFirstStartLibrary()
    : await createE2eLibrary({
        levels: options.has("levels"),
        imports: options.has("levelFiles")
          ? ["library/maps/klein.png", "library/maps/gruft.png"]
          : [],
      }),
  mapViewService: e2eMapView,
  playerFeed: null,
  newId: () => `e2e-${String(++nextId)}`,
});
