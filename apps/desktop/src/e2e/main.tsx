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
  libraryService: options.has("firstStart")
    ? createFirstStartLibrary()
    : await createE2eLibrary({ levels: options.has("levels") }),
  mapViewService: e2eMapView,
  playerFeed: null,
  newId: () => `e2e-${String(++nextId)}`,
});
