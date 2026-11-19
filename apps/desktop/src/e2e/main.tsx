// Entry point of the E2E harness (T-130a): the real DM window with in-memory platform services.
import { renderDmWindow } from "../dm/render.js";
import {
  createE2eLibrary,
  createFirstStartLibrary,
  e2eDisplays,
  e2eMapView,
} from "./fake-platform.js";

let nextId = 0;

renderDmWindow({
  displayService: e2eDisplays,
  // `?firstStart`: as on a new computer, before any library folder was chosen (T-153).
  libraryService: new URLSearchParams(location.search).has("firstStart")
    ? createFirstStartLibrary()
    : await createE2eLibrary(),
  mapViewService: e2eMapView,
  playerFeed: null,
  newId: () => `e2e-${String(++nextId)}`,
});
