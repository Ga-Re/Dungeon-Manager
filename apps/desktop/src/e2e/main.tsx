// Entry point of the E2E harness (T-130a): the real DM window with in-memory platform services.
import { renderDmWindow } from "../dm/render.js";
import { createE2eLibrary, e2eDisplays, e2eMapView } from "./fake-platform.js";

let nextId = 0;

renderDmWindow({
  displayService: e2eDisplays,
  libraryService: await createE2eLibrary(),
  mapViewService: e2eMapView,
  playerFeed: null,
  newId: () => `e2e-${String(++nextId)}`,
});
