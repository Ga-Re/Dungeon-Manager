// Screenshot harness for the renderer (T-105a): renders the fixture map through the real
// `@dungeon-manager/renderer` with the camera named in the URL hash, then sets
// `document.body.dataset.ready`. Built to a classic script so it runs from file:// URLs.
import {
  createRenderer,
  fitCamera,
  rotateBy,
  zoomAt,
  type Camera,
} from "@dungeon-manager/renderer";
import { drawFixtureMap, FIXTURE_MAP } from "./fixture-map.js";

const view = { width: 640, height: 360 };

function cameraFor(scenario: string): Camera {
  const fitted = fitCamera(FIXTURE_MAP, view, 0);
  switch (scenario) {
    case "zoomed":
      // Zoomed in on the pool, as the DM would with the mouse wheel.
      return zoomAt(fitted, 3, { x: 500, y: 240 }, view);
    case "rotated":
      return fitCamera(FIXTURE_MAP, view, rotateBy(fitted, 90).rotation);
    default:
      return fitted;
  }
}

type Ring = [number, number][];
const rect = (x: number, y: number, width: number, height: number): Ring => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
];

/**
 * What the players may see in the "player" scenarios: the left room and the corridor, and the
 * right room except a square around the pool (hidden again, i.e. a hole). The rest is fog.
 */
const REVEALED = [
  { outer: rect(100, 100, 500, 400), holes: [] },
  { outer: rect(600, 250, 400, 100), holes: [] },
  { outer: rect(1000, 100, 500, 800), holes: [rect(1100, 500, 300, 300)] },
];

async function main() {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw new Error("canvas missing");
  const renderer = await createRenderer({ canvas, size: view, resolution: 1 });
  const scenario = location.hash.slice(1);
  // The player view always gets its fog with (never after) the map.
  if (scenario.startsWith("player")) renderer.setFog(REVEALED);
  renderer.setMap(drawFixtureMap());
  renderer.setCamera(cameraFor(scenario.replace(/^player-?/, "")));
  await renderer.drawn();
  document.body.dataset["ready"] = "true";
}

main().catch((error: unknown) => {
  document.body.dataset["error"] = String(error);
});
