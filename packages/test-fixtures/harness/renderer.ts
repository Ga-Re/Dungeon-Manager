// Screenshot harness for the renderer (T-105a): renders the fixture map through the real
// `@dungeon-manager/renderer` with the camera named in the URL hash, then sets
// `document.body.dataset.ready`. Built to a classic script so it runs from file:// URLs.
import {
  createRenderer,
  fitCamera,
  mapToScreen,
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
    case "selected":
      // Zoomed in close on Aria, so its initials must stay sharp (T-107b).
      return zoomAt(
        fitted,
        5,
        mapToScreen(fitted, view, { x: 300, y: 250 }),
        view,
      );
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

/**
 * Shapes the fog must handle (T-108a): a revealed island inside a hidden hole (the pool), and two
 * areas touching at a single corner (top left), as unions and differences of fog edits produce.
 */
const REVEALED_NESTED = [
  ...REVEALED.slice(1),
  { outer: rect(1200, 600, 100, 100), holes: [] },
  { outer: rect(100, 100, 200, 200), holes: [] },
  { outer: rect(300, 300, 200, 200), holes: [] },
];

/** Width of the soft fog edge in the "-soft" scenarios (T-136a), in map pixels. */
const SOFT_EDGE = 40;

/**
 * Fog per scenario: the player view sees opaque fog, the DM view a see-through version; "-soft"
 * scenarios have soft edges.
 */
function fogFor(scenario: string) {
  const softEdge = scenario.includes("-soft") ? SOFT_EDGE : 0;
  if (scenario.startsWith("player-nested"))
    return { revealed: REVEALED_NESTED, opacity: 1, softEdge };
  if (scenario.startsWith("player"))
    return { revealed: REVEALED, opacity: 1, softEdge };
  if (scenario.startsWith("dm-fog"))
    return { revealed: REVEALED, opacity: 0.5, softEdge };
  return null;
}

/** The canvas's pixels right after a draw, before the browser composites (and clears) them. */
function capture(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d");
  if (!context) throw new Error("2D canvas missing");
  context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, copy.width, copy.height).data;
}

/**
 * "fail-closed" (T-136a): draws the nested fog hard, then soft, and counts pixels that the soft
 * fog shows although the hard fog covers them (must be none) and pixels it softens (must be
 * some). The results land in `data-violations` and `data-softened`.
 */
async function failClosedScenario(canvas: HTMLCanvasElement) {
  const renderer = await createRenderer({ canvas, size: view, resolution: 1 });
  renderer.setFog(REVEALED_NESTED, { opacity: 1 });
  renderer.setMap(drawFixtureMap());
  renderer.setCamera(cameraFor("zoomed"));
  await renderer.drawn();
  const hard = capture(canvas);
  // With grid lines too (T-106b): they lie under the fog, so none may show where it covers.
  renderer.setGrid({ cellSizePx: 100, offsetXPx: 50, offsetYPx: 0 });
  renderer.setFog(REVEALED_NESTED, { opacity: 1, softEdge: SOFT_EDGE });
  await renderer.drawn();
  const soft = capture(canvas);
  let violations = 0;
  let softened = 0;
  for (let index = 0; index < hard.length; index += 4) {
    const hidden =
      hard[index] === 0 && hard[index + 1] === 0 && hard[index + 2] === 0;
    const shown =
      soft[index] !== 0 || soft[index + 1] !== 0 || soft[index + 2] !== 0;
    if (hidden && shown) violations++;
    if (!hidden && soft[index] !== hard[index]) softened++;
  }
  document.body.dataset["violations"] = String(violations);
  document.body.dataset["softened"] = String(softened);
}

/** Living fog (T-245) in the harness: the fixture map's 100-px cells, the largest edge wobble. */
const livingFog = (quality: "high" | "medium", edge = 1.2) => ({
  quality,
  cellSizePx: 100,
  edge,
  motion: 1,
});

/**
 * "living-…" (T-245): the living fog at a frozen moment (12.5 s of drift) – for players in both
 * qualities, and see-through for the DM.
 */
async function livingScenario(scenario: string, canvas: HTMLCanvasElement) {
  let time = 0;
  const renderer = await createRenderer({
    canvas,
    size: view,
    resolution: 1,
    now: () => time,
  });
  const quality = scenario.includes("medium") ? "medium" : "high";
  const opacity = scenario.includes("dm") ? 0.5 : 1;
  renderer.setFog(REVEALED, { opacity, living: livingFog(quality) });
  renderer.setMap(drawFixtureMap());
  renderer.setCamera(cameraFor("fit"));
  time = 12_500;
  await renderer.drawn();
}

/** A map of the fixture's size in one colour: what shows of it is the map, not the fog. */
function plainMap(colour: string): HTMLCanvasElement {
  const map = document.createElement("canvas");
  map.width = FIXTURE_MAP.width;
  map.height = FIXTURE_MAP.height;
  const context = map.getContext("2d");
  if (!context) throw new Error("2D canvas missing");
  context.fillStyle = colour;
  context.fillRect(0, 0, map.width, map.height);
  return map;
}

/**
 * "living-fail-closed" (T-245): the nested fog drawn hard marks what is hidden; then the living
 * fog with the largest edge wobble, in both qualities and at several moments of its drift (the
 * clock only moves forward, so each run draws later moments), over a black and a white map. A
 * hidden pixel that differs between the two shows the map (`data-violations`, must be none);
 * revealed pixels the living fog changes (`data-living`) show that it was drawn. Then the same
 * during a spread (`livingSpreadViolations`).
 */
async function livingFailClosedScenario(canvas: HTMLCanvasElement) {
  let time = 0;
  const renderer = await createRenderer({
    canvas,
    size: view,
    resolution: 1,
    now: () => time,
  });
  const camera = cameraFor("zoomed");
  renderer.setFog(REVEALED_NESTED, { opacity: 1 });
  renderer.setMap(plainMap("#ffffff"));
  renderer.setCamera(camera);
  await renderer.drawn();
  const hard = capture(canvas);
  const hidden = (index: number) => hard[index] === 0;
  let violations = 0;
  let living = 0;
  for (const quality of ["high", "medium"] as const)
    for (const seconds of [0, 7.3, 31.9, 140.6]) {
      const shots = [];
      for (const colour of ["#000000", "#ffffff"]) {
        renderer.setFog(REVEALED_NESTED, {
          opacity: 1,
          living: livingFog(quality, 2.5),
        });
        renderer.setMap(plainMap(colour));
        time = seconds * 1000;
        await renderer.drawn();
        shots.push(capture(canvas));
      }
      const [black, white] = shots;
      if (!black || !white) throw new Error("capture missing");
      for (let index = 0; index < black.length; index += 4) {
        const differs =
          black[index] !== white[index] ||
          black[index + 1] !== white[index + 1] ||
          black[index + 2] !== white[index + 2];
        if (hidden(index) && differs) violations++;
        if (!hidden(index) && white[index] !== 255) living++;
      }
    }
  const hiddenAfter = await hardCapture(REVEALED);
  violations += await livingSpreadViolations(hard, hiddenAfter);
  document.body.dataset["violations"] = String(violations);
  document.body.dataset["living"] = String(living);
}

/** The hard fog `revealed` over a white map, zoomed in (black = hidden). */
async function hardCapture(
  revealed: typeof REVEALED,
): Promise<Uint8ClampedArray> {
  const canvas = document.createElement("canvas");
  const renderer = await createRenderer({ canvas, size: view, resolution: 1 });
  renderer.setFog(revealed, { opacity: 1 });
  renderer.setMap(plainMap("#ffffff"));
  renderer.setCamera(cameraFor("zoomed"));
  await renderer.drawn();
  const pixels = capture(canvas);
  renderer.destroy();
  return pixels;
}

/**
 * A living spread from the nested fog to the plain one, at the largest edge wobble, over a black
 * and a white map with the same frozen clock: a pixel hidden before and after that differs
 * between the two shows the map. Returns how many such pixels the frames had.
 */
async function livingSpreadViolations(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
): Promise<number> {
  const moments = [0, 150, 400, 700, 1100];
  const frames: Uint8ClampedArray[][] = [];
  for (const colour of ["#000000", "#ffffff"]) {
    let time = 0;
    const canvas = document.createElement("canvas");
    const renderer = await createRenderer({
      canvas,
      size: view,
      resolution: 1,
      now: () => time,
    });
    const living = livingFog("medium", 2.5);
    renderer.setFog(REVEALED_NESTED, { opacity: 1, living });
    renderer.setMap(plainMap(colour));
    renderer.setCamera(cameraFor("zoomed"));
    await renderer.drawn();
    renderer.setFog(REVEALED, { opacity: 1, living, fade: 1000 });
    const shots: Uint8ClampedArray[] = [];
    for (const moment of moments) {
      time = moment;
      await renderer.drawn();
      shots.push(capture(canvas));
    }
    frames.push(shots);
    renderer.destroy();
  }
  let violations = 0;
  moments.forEach((_, frame) => {
    const black = frames[0]?.[frame];
    const white = frames[1]?.[frame];
    if (!black || !white) throw new Error("capture missing");
    for (let index = 0; index < black.length; index += 4) {
      if (before[index] !== 0 || after[index] !== 0) continue;
      if (
        black[index] !== white[index] ||
        black[index + 1] !== white[index + 1] ||
        black[index + 2] !== white[index + 2]
      )
        violations++;
    }
  });
  return violations;
}

/** The video fixture (`pages/media/fixture-map.webm`, 320 × 200) and what is revealed of it. */
const VIDEO = { width: 320, height: 200 };
const VIDEO_REVEALED = [
  { outer: rect(20, 20, 160, 120), holes: [] },
  { outer: rect(180, 80, 120, 100), holes: [] },
];

/** Loads the fixture video, paused on its first frame, so screenshots are deterministic. */
async function fixtureVideo(): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = "./media/fixture-map.webm";
  await new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", resolve, { once: true });
    video.addEventListener(
      "error",
      () => {
        reject(new Error("video failed to load"));
      },
      { once: true },
    );
  });
  return video;
}

/**
 * Video maps (T-105c): "player-video" shows the video under opaque fog; "video-no-fog" never
 * sets any fog, so the video must stay hidden (black) – the fail-closed rule of ADR-0010.
 */
async function videoScenario(scenario: string, canvas: HTMLCanvasElement) {
  const renderer = await createRenderer({ canvas, size: view, resolution: 1 });
  const video = await fixtureVideo();
  canvas.before(video);
  if (scenario.startsWith("player-video")) renderer.setFog(VIDEO_REVEALED);
  renderer.setVideo(video);
  const rotation = scenario.endsWith("rotated") ? 90 : 0;
  renderer.setCamera(fitCamera(VIDEO, view, rotation));
  await renderer.drawn();
  // One more frame: the browser composites the now visible video with the canvas.
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * "fade-fail-closed" (T-136b): fades from the nested fog to the plain one (soft edges on) and
 * captures frames along the way; then starts the same hide again and swaps in a map of the same
 * size, after which the plain fog must be there at once. `data-violations` counts pixels that show the map although
 * the hard fog covers them before and after (must be none), `data-between` pixels on their way
 * between both states (must be some, or nothing faded).
 */
async function fadeFailClosedScenario(canvas: HTMLCanvasElement) {
  const renderer = await createRenderer({ canvas, size: view, resolution: 1 });
  renderer.setFog(REVEALED_NESTED, { opacity: 1 });
  renderer.setMap(drawFixtureMap());
  renderer.setCamera(cameraFor("zoomed"));
  await renderer.drawn();
  const before = capture(canvas);
  renderer.setFog(REVEALED, { opacity: 1 });
  await renderer.drawn();
  const after = capture(canvas);
  renderer.setFog(REVEALED_NESTED, { opacity: 1, softEdge: SOFT_EDGE });
  await renderer.drawn();
  renderer.setFog(REVEALED, { opacity: 1, softEdge: SOFT_EDGE, fade: 400 });
  const hidden = (pixels: Uint8ClampedArray, index: number) =>
    pixels[index] === 0 && pixels[index + 1] === 0 && pixels[index + 2] === 0;
  let violations = 0;
  let between = 0;
  for (let frame = 0; frame < 12; frame++) {
    await renderer.drawn();
    const pixels = capture(canvas);
    for (let index = 0; index < pixels.length; index += 4) {
      const shown = !hidden(pixels, index);
      if (hidden(before, index) && hidden(after, index) && shown) violations++;
      const value = pixels[index] ?? 0;
      const low = Math.min(before[index] ?? 0, after[index] ?? 0);
      const high = Math.max(before[index] ?? 0, after[index] ?? 0);
      if (high - low > 40 && value > low + 10 && value < high - 10) between++;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  // The same hide at a speed with a ragged front (T-246).
  renderer.setFog(REVEALED_NESTED, { opacity: 1, softEdge: SOFT_EDGE });
  await renderer.drawn();
  renderer.setFog(REVEALED, {
    opacity: 1,
    softEdge: SOFT_EDGE,
    fade: 150,
    speed: SPEED,
  });
  for (let frame = 0; frame < 12; frame++) {
    await renderer.drawn();
    const pixels = capture(canvas);
    for (let index = 0; index < pixels.length; index += 4)
      if (
        hidden(before, index) &&
        hidden(after, index) &&
        !hidden(pixels, index)
      )
        violations++;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  // A new map of the same size mid-hide (the island in the pool): its fog is there at once,
  // not frozen half-way.
  renderer.setFog(REVEALED_NESTED, { opacity: 1, softEdge: SOFT_EDGE });
  await renderer.drawn();
  renderer.setFog(REVEALED, { opacity: 1, softEdge: SOFT_EDGE, fade: 400 });
  await renderer.drawn();
  renderer.setMap(drawFixtureMap());
  await renderer.drawn();
  await renderer.drawn();
  const settled = capture(canvas);
  for (let index = 0; index < settled.length; index += 4)
    if (hidden(after, index) && !hidden(settled, index)) violations++;
  document.body.dataset["violations"] = String(violations);
  document.body.dataset["between"] = String(between);
}

const LEFT_ROOM = { outer: rect(100, 100, 500, 400), holes: [] };
const CORRIDOR = { outer: rect(600, 250, 400, 100), holes: [] };
const RIGHT_ROOM = { outer: rect(1000, 100, 500, 800), holes: [] };
/** The right room with a square in it hidden again (T-249). */
const RIGHT_ROOM_HOLE = {
  outer: RIGHT_ROOM.outer,
  holes: [rect(1100, 400, 300, 300)],
};

/**
 * Before and after of the "spread-" scenarios (T-167), and two map points that half-way must
 * show the map (`open`) and still be fogged (`fogged`): where the spread starts and ends.
 */
const SPREADS = {
  // The corridor and the right room open from the left room they touch.
  "spread-adjacent": {
    before: [LEFT_ROOM],
    after: [LEFT_ROOM, CORRIDOR, RIGHT_ROOM],
    open: [700, 300],
    fogged: [1450, 850],
  },
  // The right room touches nothing revealed: it clears from its middle.
  "spread-isolated": {
    before: [LEFT_ROOM],
    after: [LEFT_ROOM, RIGHT_ROOM],
    open: [1250, 450],
    fogged: [1040, 140],
  },
  // Hiding the corridor and the right room: the fog comes in from the fog around them.
  "spread-hide": {
    before: [LEFT_ROOM, CORRIDOR, RIGHT_ROOM],
    after: [LEFT_ROOM],
    open: [1250, 450],
    fogged: [1040, 140],
  },
  // An isolated hide (T-249): a square inside the revealed right room closes from its middle –
  // half-way its middle is fogged and its edge still open.
  "spread-hide-isolated": {
    before: [RIGHT_ROOM],
    after: [RIGHT_ROOM_HOLE],
    open: [1110, 410],
    fogged: [1250, 550],
  },
  // At a speed (T-246): the same reveal at 10 cells of 100 px per second with a ragged front,
  // 700 ms in – the corridor is open, the far corner of the right room still fogged.
  "spread-ragged": {
    before: [LEFT_ROOM],
    after: [LEFT_ROOM, CORRIDOR, RIGHT_ROOM],
    open: [700, 300],
    fogged: [1450, 850],
  },
  // "Sofort" without a transition (T-246): the whole change is there in its first frame, the
  // far corner too (`fogged` names it; the spec expects it open).
  "spread-instant": {
    before: [LEFT_ROOM],
    after: [LEFT_ROOM, CORRIDOR, RIGHT_ROOM],
    open: [700, 300],
    fogged: [1450, 850],
  },
} as const;

/** The speed of the "spread-ragged" scenario and of the speed pass of "fade-fail-closed". */
const SPEED = { cellsPerSecond: 10, cellSizePx: 100 };

/**
 * "spread-…" (T-167): a fog change with soft edges, frozen half-way (the renderer's clock is
 * the harness's), so the screenshot shows where the change starts.
 */
async function spreadScenario(
  scenario: keyof typeof SPREADS,
  canvas: HTMLCanvasElement,
) {
  let time = 0;
  const renderer = await createRenderer({
    canvas,
    size: view,
    resolution: 1,
    now: () => time,
  });
  const { before, after, open, fogged } = SPREADS[scenario];
  const camera = cameraFor("fit");
  renderer.setFog(before, { opacity: 1, softEdge: SOFT_EDGE });
  renderer.setMap(drawFixtureMap());
  renderer.setCamera(camera);
  await renderer.drawn();
  if (scenario === "spread-instant") {
    renderer.setFog(after, {
      opacity: 1,
      softEdge: SOFT_EDGE,
      fade: 0,
      speed: { cellsPerSecond: Infinity, cellSizePx: 100 },
    });
  } else if (scenario === "spread-ragged") {
    renderer.setFog(after, {
      opacity: 1,
      softEdge: SOFT_EDGE,
      fade: 300,
      speed: SPEED,
    });
    time = 700;
  } else {
    renderer.setFog(after, { opacity: 1, softEdge: SOFT_EDGE, fade: 1000 });
    // Eased, 206 of 1000 ms is half-way (1 − 0.794³ ≈ 0.5).
    time = 206;
  }
  await renderer.drawn();
  const pixels = capture(canvas);
  // Red of the map pixel at `point`: 0 under the fog (unrotated camera).
  const red = ([x, y]: readonly [number, number]) => {
    const sx = Math.round((x - camera.centerX) * camera.zoom + view.width / 2);
    const sy = Math.round((y - camera.centerY) * camera.zoom + view.height / 2);
    return pixels[(sy * view.width + sx) * 4] ?? -1;
  };
  document.body.dataset["spreadStart"] = red(open) > 20 ? "open" : "fogged";
  document.body.dataset["spreadEnd"] = red(fogged) === 0 ? "fogged" : "open";
}

/**
 * "cover-random" (T-249): a map revealed beyond its border (a sliver outside stays revealed),
 * then everything hidden at a speed, frozen early – once from the middle, once from the random
 * point. The two frames must differ (`data-cover-differs`): the random start is used although
 * a revealed polygon is left outside the map.
 */
async function coverRandomScenario() {
  const frames: Uint8ClampedArray[] = [];
  for (const coverFrom of ["middle", "random"] as const) {
    let time = 0;
    // A canvas each: a second renderer on the same canvas would share the first one's context.
    const canvas = document.createElement("canvas");
    const renderer = await createRenderer({
      canvas,
      size: view,
      resolution: 1,
      now: () => time,
    });
    const beyond = [{ outer: rect(-50, -50, 1700, 1100), holes: [] }];
    const all = [{ outer: rect(0, 0, 1600, 1000), holes: [] }];
    renderer.setFog(beyond, { opacity: 1 });
    renderer.setMap(drawFixtureMap());
    renderer.setCamera(cameraFor("fit"));
    await renderer.drawn();
    // Hiding the map leaves the sliver beyond its border revealed (polygons are not clipped).
    renderer.setFog(polygonsWithout(all), {
      opacity: 1,
      fade: 100,
      speed: { cellsPerSecond: 10, cellSizePx: 100 },
      coverFrom,
    });
    time = 400;
    await renderer.drawn();
    frames.push(capture(canvas));
    renderer.destroy();
  }
  const [middle, random] = frames;
  let differs = 0;
  if (middle && random)
    for (let index = 0; index < middle.length; index++)
      if (middle[index] !== random[index]) differs++;
  document.body.dataset["coverDiffers"] = differs > 0 ? "yes" : "no";
}

/** The sliver of `beyond` around the map once the map itself is hidden. */
function polygonsWithout(all: { outer: Ring; holes: never[] }[]) {
  return [
    { outer: rect(-50, -50, 1700, 1100), holes: all.map((each) => each.outer) },
  ];
}

/**
 * "tokens-glide" (T-233b): Aria glides from the left room towards the pool, frozen half-way;
 * the Goblin, which did not move, stays put.
 */
async function glideScenario(canvas: HTMLCanvasElement) {
  let time = 0;
  const renderer = await createRenderer({
    canvas,
    size: view,
    resolution: 1,
    now: () => time,
  });
  const goblin = {
    id: "g12",
    name: "Goblin 12",
    x: 300,
    y: 200,
    width: 100,
    height: 100,
  };
  const aria = { id: "aria", name: "Aria", width: 100, height: 100 };
  renderer.setMap(drawFixtureMap());
  renderer.setCamera(cameraFor("fit"));
  renderer.setTokens([{ ...aria, x: 200, y: 200 }, goblin]);
  await renderer.drawn();
  renderer.setTokens([{ ...aria, x: 1100, y: 600 }, goblin], { glide: 1000 });
  // Eased, 206 of 1000 ms is half-way (1 − 0.794³ ≈ 0.5).
  time = 206;
  await renderer.drawn();
}

/**
 * "tiles" (T-127): the fixture map drawn as one texture and in 256-px tiles (as a map beyond the
 * GPU's texture limit is), fitted and zoomed in on a tile corner; the largest difference of any
 * channel goes to `data-tiles-max-diff`. Tiles sample with their own coordinates, so thin lines may
 * differ a few levels when scaled down; a seam differs by far more (see the visual test).
 */
async function tilesScenario(canvas: HTMLCanvasElement) {
  const fitted = cameraFor("fit");
  const cameras = [
    fitted,
    // The tile corner at map (1280, 768), across the pool's edge.
    zoomAt(fitted, 5, mapToScreen(fitted, view, { x: 1280, y: 768 }), view),
  ];
  const draw = async (maxTextureSize?: number) => {
    const target = document.createElement("canvas");
    canvas.replaceWith(target);
    const renderer = await createRenderer({
      canvas: target,
      size: view,
      resolution: 1,
      ...(maxTextureSize !== undefined && { maxTextureSize }),
    });
    renderer.setMap(drawFixtureMap());
    const shots: Uint8ClampedArray[] = [];
    for (const camera of cameras) {
      renderer.setCamera(camera);
      await renderer.drawn();
      shots.push(capture(target));
    }
    renderer.destroy();
    target.replaceWith(canvas);
    return shots;
  };
  const whole = await draw();
  const tiled = await draw(256);
  let maxDiff = 0;
  const where: string[] = [];
  whole.forEach((shot, index) => {
    const other = tiled[index];
    if (!other || other.length !== shot.length) {
      maxDiff = 255;
      return;
    }
    for (let i = 0; i < shot.length; i++) {
      const diff = Math.abs((shot[i] ?? 0) - (other[i] ?? 0));
      if (diff > 2 && where.length < 20) {
        const pixel = Math.floor(i / 4);
        where.push(
          `${String(index)}:${String(pixel % view.width)},${String(Math.floor(pixel / view.width))}=${String(diff)}`,
        );
      }
      maxDiff = Math.max(maxDiff, diff);
    }
  });
  document.body.dataset["tilesMaxDiff"] = String(maxDiff);
  // Where it differs by more than 2 (camera index: x,y = difference), for a failing run.
  document.body.dataset["tilesDiffAt"] = where.join(" ");
}

async function main() {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw new Error("canvas missing");
  const scenario = location.hash.slice(1);
  if (scenario in SPREADS) {
    await spreadScenario(scenario as keyof typeof SPREADS, canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario === "tiles") {
    await tilesScenario(canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario === "cover-random") {
    await coverRandomScenario();
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario === "tokens-glide") {
    await glideScenario(canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario === "fade-fail-closed") {
    await fadeFailClosedScenario(canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario === "living-fail-closed") {
    await livingFailClosedScenario(canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario.startsWith("living-")) {
    await livingScenario(scenario, canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario === "fail-closed") {
    await failClosedScenario(canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  if (scenario.includes("video")) {
    await videoScenario(scenario, canvas);
    document.body.dataset["ready"] = "true";
    return;
  }
  const renderer = await createRenderer({ canvas, size: view, resolution: 1 });
  // "-grid" (T-106b): the fixture map's grid lines, 100 px cells shifted by half a cell to the
  // right, so the test shows that offsets are followed.
  const withGrid = scenario.includes("grid");
  // "-tokens" (T-107a): placeholder tokens of every kind – a name, two words with a number, a
  // large one, a Tiny one, one without a visible name – one of them in the fog.
  const withTokens = scenario.includes("tokens");
  // "tokens-selected" (T-107b): the DM window's look – Aria and the Ogre selected, Goblin 12
  // hidden from the players (faded).
  const selected = new Set(
    scenario.endsWith("selected") ? ["aria", "ogre"] : [],
  );
  const hidden = new Set(scenario.endsWith("selected") ? ["g12"] : []);
  // "player-tokens-active" (T-111c): the Ogre's turn, its token shining on the TV.
  const active = new Set(scenario.endsWith("active") ? ["ogre"] : []);
  const base = scenario.replace(/^(grid|tokens)-?|-(grid|tokens)/, "");
  // The player view always gets its fog with (never after) the map.
  const fog = fogFor(base);
  if (fog)
    renderer.setFog(fog.revealed, {
      opacity: fog.opacity,
      softEdge: fog.softEdge,
    });
  renderer.setMap(drawFixtureMap());
  if (withGrid)
    renderer.setGrid({ cellSizePx: 100, offsetXPx: 50, offsetYPx: 0 });
  if (withTokens)
    renderer.setTokens(
      [
        { id: "aria", name: "Aria", x: 200, y: 200, width: 100, height: 100 },
        {
          id: "g12",
          name: "Goblin 12",
          x: 300,
          y: 200,
          width: 100,
          height: 100,
        },
        { id: "ogre", name: "Oger", x: 1100, y: 200, width: 200, height: 200 },
        { id: "rat", name: "Ratte", x: 225, y: 325, width: 50, height: 50 },
        { id: "unnamed", x: 400, y: 300, width: 100, height: 100 },
        // In the fog of the player scenarios: covered there.
        {
          id: "hidden",
          name: "Späher",
          x: 700,
          y: 600,
          width: 100,
          height: 100,
        },
      ].map((token) => ({
        ...token,
        ...(selected.has(token.id) && { selected: true }),
        ...(hidden.has(token.id) && { hidden: true }),
        ...(active.has(token.id) && { active: true }),
      })),
    );
  renderer.setCamera(
    cameraFor(
      base.replace(/^(player-nested|player|dm-fog)-?/, "").replace("soft", ""),
    ),
  );
  await renderer.drawn();
  document.body.dataset["ready"] = "true";
}

main().catch((error: unknown) => {
  document.body.dataset["error"] = String(error);
});
