import type { Polygon } from "@dungeon-manager/schema";
import {
  Application,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Shader,
  Sprite,
  Text,
  Texture,
  UniformGroup,
} from "pixi.js";
import { TOKEN_RING, tokenColor, tokenInitials } from "./token-look.js";
import type { Camera, Size } from "./camera.js";
import { disposeFog } from "./fog-dispose.js";
import { easeOut, fadeProgress } from "./fog-fade.js";
import {
  coarseSpreadOrder,
  FRONT,
  sampleOrder,
  spreadMix,
  type Grid,
} from "./fog-spread.js";
import { softFogAlpha } from "./soft-mask.js";
import { createVideoGate, cssTransform, sameAspect } from "./video-layer.js";

/** An image the browser has loaded (or drawn), ready to become the map texture. */
export type MapImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface FogOptions {
  /** 1 for players (opaque, the default); less for the DM, who must see what lies beneath. */
  readonly opacity?: number;
  /**
   * Width of the soft edge in map pixels (T-136a); 0 or none draws hard edges. The softening
   * lies inside the revealed area, so it never shows more than the hard fog would.
   */
  readonly softEdge?: number;
  /**
   * Animate from the fog shown now to this one, in milliseconds (T-136b); 0 or none switches at
   * once. The change spreads (T-167): a reveal from the revealed area it touches, else from its
   * middle; a hide from the fog it touches, else from its edge. Only within the same map: the
   * first fog and the fog of a new map never animate. A pixel fogged before and after stays
   * fogged throughout.
   */
  readonly fade?: number;
}

export interface RendererOptions {
  /** The canvas to draw into; it is sized by the caller (CSS) and by `resize`. */
  readonly canvas: HTMLCanvasElement;
  readonly size: Size;
  /** Device pixels per CSS pixel (`devicePixelRatio`); 1 keeps tests deterministic. */
  readonly resolution?: number;
  /** Shown around the map; dark, so a TV in a dim room does not glare. */
  readonly background?: string;
  /** Milliseconds for fog animations; tests freeze it for screenshots mid-spread. */
  readonly now?: () => number;
}

/** A token as the renderer draws it (T-107a): where, how big, and what it shows. */
export interface TokenShape {
  readonly id: string;
  /** Its name, for the initials; absent when this viewer may not see it. */
  readonly name?: string | undefined;
  /** Its footprint's top left corner and size, in map pixels. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A map's grid, in map pixels (the sidecar's calibration), and how its lines look. */
export interface GridLines {
  readonly cellSizePx: number;
  readonly offsetXPx: number;
  readonly offsetYPx: number;
  /** `#rrggbb`; white by default. */
  readonly color?: string;
  /** 0–1; 0.35 by default, visible on dark and light maps without hiding them. */
  readonly alpha?: number;
}

/**
 * Most grid lines drawn per axis: more would freeze the view (a sidecar with a tiny cell size)
 * and could not be told apart on screen anyway.
 */
export const MAX_GRID_LINES = 2000;

/**
 * The x (or y) positions of grid lines across `length` map pixels; none when there would be
 * more than {@link MAX_GRID_LINES}.
 */
export function gridLinePositions(
  length: number,
  cellSizePx: number,
  offsetPx: number,
): number[] {
  if (!(cellSizePx > 0) || !(length > 0)) return [];
  if (length / cellSizePx > MAX_GRID_LINES) return [];
  const positions: number[] = [];
  // The first line inside the map: the offset moved back by whole cells.
  const first = offsetPx - Math.floor(offsetPx / cellSizePx) * cellSizePx;
  for (let at = first; at <= length; at += cellSizePx) positions.push(at);
  return positions;
}

/**
 * Draws one view of a scene (ARCHITECTURE §8). For now the map layer only; grid, tokens and
 * fog follow in later tasks. It draws on demand – once per change, in the next animation
 * frame – instead of every frame, so an idle DM window costs no GPU time.
 */
export interface Renderer {
  /** Replaces the map image (`null` removes it). The renderer owns the texture from now on. */
  setMap(image: MapImage | null): void;
  /**
   * Shows a video map (ADR-0010): `video` must lie directly under the canvas in the same
   * positioned box; the renderer sizes, transforms and shows it, the caller owns it (loading,
   * playing, removing). It stays hidden until a frame was drawn with the fog known, and on
   * resize, context loss and teardown. `null` removes it (and hides it).
   */
  setVideo(video: HTMLVideoElement | null): void;
  /**
   * Covers everything except `revealed` with opaque fog (the player view), or removes the fog
   * layer with `null` (the DM sees the whole map). Set it before or with the map: the player
   * view must never draw a map without its fog (ARCHITECTURE §5.1, ADR-0010).
   */
  setFog(revealed: readonly Polygon[] | null, options?: FogOptions): void;
  /**
   * Draws grid lines over the map (T-106b), under the fog – hidden areas stay covered, lines
   * included. `null` removes them.
   */
  setGrid(grid: GridLines | null): void;
  /**
   * Draws tokens (T-107a) over the map and grid, under the fog: a token in fog stays covered
   * on the TV. Replaces the tokens drawn before.
   */
  setTokens(tokens: readonly TokenShape[]): void;
  setCamera(camera: Camera): void;
  resize(size: Size): void;
  /** Resolves after the next draw has been submitted (for screenshots and tests). */
  drawn(): Promise<void>;
  destroy(): void;
}

/** Creates a renderer drawing into `options.canvas` (WebGL; WebGPU is not reliable yet, T-007). */
export async function createRenderer(
  options: RendererOptions,
): Promise<Renderer> {
  const background = options.background ?? "#111111";
  const now = options.now ?? (() => performance.now());
  const app = new Application();
  await app.init({
    canvas: options.canvas,
    width: options.size.width,
    height: options.size.height,
    resolution: options.resolution ?? 1,
    autoDensity: true,
    background,
    // The WebGL context only gets an alpha channel if the background starts transparent; video
    // maps need it (they lie under the canvas). Opaque again right below for image maps.
    backgroundAlpha: 0,
    preference: "webgl",
    antialias: false,
    // Drawing happens on demand (see `requestDraw`); no render loop, no resizeTo: the caller
    // owns the canvas and calls `resize`.
    autoStart: false,
  });

  app.renderer.background.alpha = 1;

  const world = new Container();
  app.stage.addChild(world);
  // Grid lines (T-106b): above the map (which goes in at index 0), below the fog (added last).
  const gridLayer = new Graphics();
  world.addChild(gridLayer);
  let gridInput: GridLines | null = null;
  // Tokens (T-107a): above the grid, below the fog.
  const tokenLayer = new Container();
  world.addChild(tokenLayer);
  let tokensBuiltFrom: string | null = null;
  const drawTokens = (tokens: readonly TokenShape[]) => {
    const key = JSON.stringify(tokens);
    if (key === tokensBuiltFrom) return;
    tokensBuiltFrom = key;
    for (const child of tokenLayer.removeChildren())
      child.destroy({ children: true, context: true, style: true });
    for (const token of tokens) {
      const radius = Math.min(token.width, token.height) / 2;
      const centerX = token.x + token.width / 2;
      const centerY = token.y + token.height / 2;
      // A little inside its footprint, so neighbours never touch.
      const disc = new Graphics()
        .circle(centerX, centerY, radius * 0.9)
        .fill(tokenColor(token.id))
        .stroke({ width: radius * 0.08, color: TOKEN_RING });
      tokenLayer.addChild(disc);
      const initials = tokenInitials(token.name);
      if (initials !== "") {
        const label = new Text({
          text: initials,
          style: {
            fill: "#ffffff",
            fontFamily: "system-ui, sans-serif",
            fontWeight: "600",
            fontSize: radius * (initials.length > 2 ? 0.55 : 0.8),
          },
          resolution: 2,
        });
        label.anchor.set(0.5);
        label.position.set(centerX, centerY);
        tokenLayer.addChild(label);
      }
    }
  };
  // What the drawn lines were built from: an equal request (the player view gets the whole
  // state with every message) keeps them instead of rebuilding.
  let gridBuiltFrom: string | null = null;
  let map: Sprite | null = null;
  let fog: Container | null = null;
  // The last fog asked for: rebuilt when the map changes, as soft edges follow the map's size.
  let fogInput: {
    readonly revealed: readonly Polygon[];
    readonly options: FogOptions;
  } | null = null;
  let mapSize: Size | null = null;
  // What the current fog was built from: an equal request (the player view gets the whole
  // scene with every message, also for a rotation) keeps it instead of rebuilding.
  let fogBuiltFrom: string | null = null;
  // The fog shown before the current request, and the map size it was shown on: fades start
  // from it.
  let shownFog: {
    readonly revealed: readonly Polygon[];
    readonly options: FogOptions;
    readonly map: Size;
  } | null = null;
  let fade: Fade | null = null;
  let size = options.size;
  let camera: Camera | null = null;
  let frame: number | null = null;
  let waiting: (() => void)[] = [];
  let destroyed = false;

  const applyCamera = () => {
    if (!camera) return;
    world.pivot.set(camera.centerX, camera.centerY);
    world.position.set(size.width / 2, size.height / 2);
    world.scale.set(camera.zoom);
    world.rotation = (camera.rotation * Math.PI) / 180;
  };

  let video: HTMLVideoElement | null = null;
  const gate = createVideoGate();
  // Hide first, decide later: the video may only show once the gate allows it again.
  const showVideo = () => {
    if (!video) return;
    if (camera) video.style.transform = cssTransform(camera, size);
    video.style.visibility = gate.visible() ? "visible" : "hidden";
  };
  const hideVideo = () => {
    if (video) video.style.visibility = "hidden";
  };
  // The element keeps the map size it had when handed over: fog and camera are in those map
  // pixels. Later frames of another resolution are stretched onto it (object-fit: fill).
  let videoSize = { width: 0, height: 0 };
  const onVideoResize = () => {
    if (!video) return;
    const frames = { width: video.videoWidth, height: video.videoHeight };
    gate.videoResized(sameAspect(frames, videoSize));
    if (!gate.visible()) hideVideo();
  };
  const onContextLost = () => {
    gate.contextLost();
    hideVideo();
  };
  const onContextRestored = () => {
    gate.contextRestored();
    requestDraw();
  };
  options.canvas.addEventListener("webglcontextlost", onContextLost);
  options.canvas.addEventListener("webglcontextrestored", onContextRestored);

  const drawGrid = () => {
    const key = JSON.stringify([gridInput, mapSize]);
    if (key === gridBuiltFrom) return;
    gridBuiltFrom = key;
    gridLayer.clear();
    if (!gridInput || !mapSize) return;
    const { cellSizePx, offsetXPx, offsetYPx } = gridInput;
    for (const x of gridLinePositions(mapSize.width, cellSizePx, offsetXPx))
      gridLayer.moveTo(x, 0).lineTo(x, mapSize.height);
    for (const y of gridLinePositions(mapSize.height, cellSizePx, offsetYPx))
      gridLayer.moveTo(0, y).lineTo(mapSize.width, y);
    // One device pixel wide at any zoom.
    gridLayer.stroke({
      width: 1,
      pixelLine: true,
      color: gridInput.color ?? "#ffffff",
      alpha: gridInput.alpha ?? 0.35,
    });
  };

  const replaceFog = (next: Container | null) => {
    if (fog) {
      world.removeChild(fog);
      disposeFog(fog);
    }
    fog = next;
    if (fog) world.addChild(fog);
  };

  /** A fade from the fog on screen to `target`, or `null` if this change must not fade. */
  const startFade = (target: NonNullable<typeof fogInput>): Fade | null => {
    const duration = target.options.fade ?? 0;
    const previous = shownFog;
    if (duration <= 0 || !previous || !mapSize || !fog) return null;
    if (!sameSize(previous.map, mapSize)) return null;
    const to = fogMask(target.revealed, mapSize, target.options.softEdge ?? 0);
    // From what is on screen: mid-fade, the mix reached so far.
    const from = fade
      ? {
          ...fade.to,
          alpha: spreadMix(
            fade.from.alpha,
            fade.to.alpha,
            sampleOrder(fade.order, fade.to.width, fade.to.height),
            easeOut(fadeProgress(fade.start, fade.duration, now())),
          ),
        }
      : fogMask(previous.revealed, mapSize, previous.options.softEdge ?? 0);
    const order = coarseSpreadOrder(gridOf(from), gridOf(to));
    // Fogged in every state of the fade: the exact hard fog covers it all along.
    const revealedAll = unique([
      ...(fade?.revealedAll ?? previous.revealed),
      ...target.revealed,
    ]);
    return {
      ...drawFadeFog(revealedAll, from, to, order, target.options.opacity ?? 1),
      from,
      to,
      order,
      revealedAll,
      start: now(),
      duration,
      final: drawFog(target.revealed, target.options, mapSize, to),
    };
  };

  /** Stops a running fade; its unused final layer goes. */
  const dropFade = () => {
    if (fade) disposeFog(fade.final);
    fade = null;
  };

  const applyFog = () => {
    // The fade duration is how to get there, not what is shown: it is not part of the key.
    const key = fogInput
      ? JSON.stringify([
          fogInput.revealed,
          { ...fogInput.options, fade: undefined },
          mapSize,
        ])
      : null;
    if (key !== null && key === fogBuiltFrom && fog) return;
    // Build the new fog first: if that fails, the old fog stays in place and counts.
    const fading = fogInput ? startFade(fogInput) : null;
    const next = fading
      ? fading.layer
      : fogInput
        ? drawFog(fogInput.revealed, fogInput.options, mapSize)
        : null;
    replaceFog(next);
    dropFade();
    fade = fading;
    fogBuiltFrom = key;
    shownFog = fogInput && mapSize ? { ...fogInput, map: mapSize } : null;
  };

  /** Advances a running fade; at its end the exact fog takes over. */
  const stepFade = () => {
    if (!fade) return;
    const progress = fadeProgress(fade.start, fade.duration, now());
    if (progress < 1) {
      fade.setMix(easeOut(progress));
      return;
    }
    // Shows the target, should swapping in the final layer fail.
    fade.setMix(1);
    const final = fade.final;
    fade = null;
    replaceFog(final);
  };

  const requestDraw = () => {
    if (frame !== null || destroyed) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      try {
        stepFade();
        applyCamera();
        app.render();
        gate.drawn();
        showVideo();
      } catch (error) {
        // ADR-0010: on renderer errors the raw video must not stay visible.
        gate.renderFailed();
        hideVideo();
        console.error("The renderer failed to draw a frame.", error);
      }
      const done = waiting;
      waiting = [];
      done.forEach((resolve) => {
        resolve();
      });
      // A fade draws every frame until it is over; otherwise drawing stays on demand.
      if (fade) requestDraw();
    });
  };

  return {
    setMap(image) {
      if (image && video) {
        // An image map replaces a video map: hide it and make the canvas opaque again.
        hideVideo();
        video.removeEventListener("resize", onVideoResize);
        video = null;
        app.renderer.background.color = background;
        app.renderer.background.alpha = 1;
      }
      if (map) {
        world.removeChild(map);
        map.destroy({ texture: true, textureSource: true });
        map = null;
      }
      if (image) {
        map = new Sprite(Texture.from(image, true));
        world.addChildAt(map, 0);
      }
      mapSize = map
        ? { width: map.width, height: map.height }
        : video
          ? videoSize
          : null;
      // A new map never fades: its fog is there at once, also if the map's size and fog are
      // the same as before (a running fade must not freeze half-way).
      dropFade();
      shownFog = null;
      fogBuiltFrom = null;
      if (fogInput) applyFog();
      drawGrid();
      requestDraw();
    },
    setVideo(next) {
      hideVideo();
      video?.removeEventListener("resize", onVideoResize);
      video = next;
      next?.addEventListener("resize", onVideoResize);
      gate.newVideo();
      // A video map lies under the canvas, so the canvas must be see-through around the fog –
      // cleared to black: with premultiplied alpha, any other colour at alpha 0 would be added
      // onto the video.
      app.renderer.background.color = next ? 0x000000 : background;
      app.renderer.background.alpha = next ? 0 : 1;
      if (next) {
        next.style.position = "absolute";
        next.style.left = "0";
        next.style.top = "0";
        videoSize = { width: next.videoWidth, height: next.videoHeight };
        next.style.width = `${String(videoSize.width)}px`;
        next.style.height = `${String(videoSize.height)}px`;
        next.style.objectFit = "fill";
        next.style.transformOrigin = "0 0";
        next.style.visibility = "hidden";
        mapSize = videoSize;
      } else if (!map) mapSize = null;
      dropFade();
      shownFog = null;
      fogBuiltFrom = null;
      if (fogInput) applyFog();
      drawGrid();
      requestDraw();
    },
    setFog(revealed, fogOptions) {
      fogInput = revealed ? { revealed, options: fogOptions ?? {} } : null;
      applyFog();
      gate.fogSet();
      requestDraw();
    },
    setTokens(next) {
      drawTokens(next);
      requestDraw();
    },
    setGrid(next) {
      gridInput = next;
      drawGrid();
      requestDraw();
    },
    setCamera(next) {
      camera = next;
      requestDraw();
    },
    resize(next) {
      if (next.width === size.width && next.height === size.height) return;
      size = next;
      gate.resized();
      hideVideo();
      app.renderer.resize(next.width, next.height);
      requestDraw();
    },
    drawn() {
      if (destroyed) return Promise.resolve();
      return new Promise((resolve) => {
        waiting.push(resolve);
        requestDraw();
      });
    },
    destroy() {
      destroyed = true;
      dropFade();
      // The fog's graphics contexts too, as on every rebuild; and the grid's (Pixi keeps a
      // Graphics' own context when destroyed with options).
      replaceFog(null);
      world.removeChild(gridLayer);
      gridLayer.destroy({ context: true });
      drawTokens([]);
      gate.destroyed();
      hideVideo();
      video?.removeEventListener("resize", onVideoResize);
      options.canvas.removeEventListener("webglcontextlost", onContextLost);
      options.canvas.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
      );
      if (frame !== null) cancelAnimationFrame(frame);
      waiting.forEach((resolve) => {
        resolve();
      });
      waiting = [];
      // Keep the canvas element: React owns and removes it.
      app.destroy(
        { removeView: false },
        { children: true, texture: true, textureSource: true },
      );
    },
  };
}

/** Fog reaches far beyond any map, so panning or rotating never shows an uncovered edge. */
const FOG_EXTENT = 1_000_000;
const FOG_COLOUR = 0x000000;

const flat = (ring: readonly (readonly [number, number])[]) =>
  ring.flatMap(([x, y]) => [x, y]);

/**
 * Fog: an opaque area with the revealed polygons as an inverse stencil mask. Each polygon is
 * filled on its own (holes cut only from their own outer ring), and the stencil adds them up, so
 * nested shapes (an island revealed inside a hidden hole), touching corners and overlaps are all
 * drawn correctly – no hole ever has to fit inside one shared outer shape.
 */
function drawHardFog(revealed: readonly Polygon[], opacity: number): Container {
  const layer = new Container();
  const cover = new Graphics()
    .rect(-FOG_EXTENT, -FOG_EXTENT, 2 * FOG_EXTENT, 2 * FOG_EXTENT)
    .fill({ color: FOG_COLOUR, alpha: opacity });
  const open = new Graphics();
  for (const polygon of revealed) {
    open.poly(flat(polygon.outer)).fill({ color: 0xffffff });
    for (const hole of polygon.holes) open.poly(flat(hole)).cut();
  }
  layer.addChild(cover, open);
  cover.setMask({ mask: open, inverse: true });
  return layer;
}

/**
 * Longest side of the soft mask in texels: enough for an edge, cheap to compute (about 13 ms
 * for the soft mask itself at 1024², measured in Node; plus rasterizing and one upload).
 */
const SOFT_MASK_SIDE = 1024;

/** The fog's alpha over the map, one texel per `texel` map pixels (255 = opaque). */
interface FogMask {
  readonly width: number;
  readonly height: number;
  readonly texel: number;
  readonly alpha: Uint8Array;
}

/** The polygons without repeats (a fade restarted many times repeats the same areas). */
function unique(polygons: readonly Polygon[]): Polygon[] {
  const seen = new Set<string>();
  return polygons.filter((polygon) => {
    const key = JSON.stringify(polygon);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const sameSize = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height;

/**
 * The revealed polygons rasterized into a small mask over the map: softened inside the revealed
 * area with a soft edge (T-136a), or as they are (hard, for fades without soft edges).
 */
function fogMask(
  revealed: readonly Polygon[],
  map: Size,
  softEdge: number,
): FogMask {
  const texel = Math.max(1, Math.max(map.width, map.height) / SOFT_MASK_SIDE);
  const width = Math.ceil(map.width / texel);
  const height = Math.ceil(map.height / texel);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas for the fog mask.");
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fff";
  // Each polygon is its own path (even-odd cuts only its own holes); paths add up.
  for (const polygon of revealed) {
    context.beginPath();
    for (const ring of [polygon.outer, ...polygon.holes]) {
      ring.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x / texel, y / texel);
        else context.lineTo(x / texel, y / texel);
      });
      context.closePath();
    }
    context.fill("evenodd");
  }
  const pixels = context.getImageData(0, 0, width, height).data;
  // Only fully covered texels count as revealed: anti-aliased edges stay hidden.
  const open = new Uint8Array(width * height);
  for (let index = 0; index < open.length; index++)
    open[index] = pixels[index * 4] === 255 ? 255 : 0;
  if (softEdge > 0) {
    const alpha = softFogAlpha(
      { width, height, data: open },
      // At least 2 texels, so there is a blur at all.
      Math.max(2, Math.round(softEdge / texel)),
    );
    return { width, height, texel, alpha };
  }
  return { width, height, texel, alpha: open.map((value) => 255 - value) };
}

/** A mask as a black texture with the mask's alpha (times `opacity`), linearly filtered. */
function maskTexture(mask: FogMask, opacity: number): Texture {
  return alphaTexture(gridOf(mask), opacity);
}

/** `grid` as the alpha of a black texture (times `scale`), linearly filtered. */
function alphaTexture(grid: Grid, scale: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the fog mask.");
  const pixels = context.createImageData(grid.width, grid.height);
  for (let index = 0; index < grid.data.length; index++)
    pixels.data[index * 4 + 3] = Math.round((grid.data[index] ?? 255) * scale);
  context.putImageData(pixels, 0, 0);
  return Texture.from(canvas);
}

function gridOf(mask: FogMask): Grid {
  return { width: mask.width, height: mask.height, data: mask.alpha };
}

/**
 * Soft fog over the map (T-136a): the revealed polygons rasterized into a small mask, softened
 * inside the revealed area (`softFogAlpha`) and stretched over the map with linear filtering.
 */
function drawSoftFog(mask: FogMask, opacity: number): Sprite {
  const sprite = new Sprite(maskTexture(mask, opacity));
  sprite.scale.set(mask.texel);
  return sprite;
}

/** A running fade (T-136b, spreading since T-167): its layer, where it goes, and how. */
interface Fade {
  readonly layer: Container;
  readonly setMix: (t: number) => void;
  readonly from: FogMask;
  readonly to: FogMask;
  /** When each part of the change turns over (coarse, see `coarseSpreadOrder`). */
  readonly order: Grid;
  /** Every revealed area of the fade's states: the hard fog covers the rest throughout. */
  readonly revealedAll: readonly Polygon[];
  readonly start: number;
  readonly duration: number;
  /** The exact fog shown once the fade is over, built at its start (no work at its end). */
  readonly final: Container;
}

// Blends two fog masks texel by texel on the GPU while a front passes in the spread order
// (`spreadMix` does the same on the CPU): linear, so fog in both stays fog.
const FADE_VERTEX = `in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;
const FADE_FRAGMENT = `in vec2 vUV;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uOrder;
uniform float uMix;
out vec4 finalColor;
void main() {
  float local = clamp(
    (uMix * (1.0 + ${FRONT.toFixed(3)}) - texture(uOrder, vUV).a) / ${FRONT.toFixed(3)},
    0.0,
    1.0
  );
  float alpha = mix(texture(uFrom, vUV).a, texture(uTo, vUV).a, local);
  finalColor = vec4(0.0, 0.0, 0.0, alpha);
}`;

/**
 * The fog during a fade: the exact hard fog over everything fogged in all of the fade's states
 * (player view), and over the map the masks before and after, mixed along `order`.
 */
function drawFadeFog(
  revealedAll: readonly Polygon[],
  from: FogMask,
  to: FogMask,
  order: Grid,
  opacity: number,
): { readonly layer: Container; readonly setMix: (t: number) => void } {
  const fromTexture = maskTexture(from, opacity);
  const toTexture = maskTexture(to, opacity);
  const orderTexture = alphaTexture(order, 1);
  const uniforms = new UniformGroup({ uMix: { value: 0, type: "f32" } });
  const width = to.width * to.texel;
  const height = to.height * to.texel;
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, width, 0, width, height, 0, height]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = Shader.from({
    gl: { vertex: FADE_VERTEX, fragment: FADE_FRAGMENT },
    resources: {
      uFrom: fromTexture.source,
      uTo: toTexture.source,
      uOrder: orderTexture.source,
      fadeUniforms: uniforms,
    },
  });
  const mesh = new Mesh({
    geometry,
    // Its own texture (the target): destroying the mesh with its texture must never reach a
    // shared default texture.
    texture: toTexture,
    shader,
  });
  const layer = opacity < 1 ? new Container() : drawHardFog(revealedAll, 1);
  layer.addChild(mesh);
  // The target texture goes with the mesh; the others, the geometry and the shader are not
  // destroyed by PixiJS with the mesh.
  layer.on("destroyed", () => {
    fromTexture.destroy(true);
    orderTexture.destroy(true);
    geometry.destroy();
    shader.destroy();
  });
  return {
    layer,
    setMix: (t) => {
      uniforms.uniforms.uMix = t;
    },
  };
}

/**
 * The fog layer. Soft edges need the map's size; without it (fog set before the map) the fog is
 * hard until the map arrives. The player view keeps the exact hard fog underneath the soft
 * one, so the result never shows more than the hard polygons. The see-through DM view gets the
 * soft layer alone, as two see-through layers would darken the hidden area.
 */
function drawFog(
  revealed: readonly Polygon[],
  options: FogOptions,
  map: Size | null,
  /** The soft mask if already computed (the target of a fade). */
  known?: FogMask,
): Container {
  const opacity = options.opacity ?? 1;
  const softEdge = options.softEdge ?? 0;
  // A map without size yet (e.g. a video before its metadata) gets hard fog for now.
  if (softEdge <= 0 || !map || map.width <= 0 || map.height <= 0)
    return drawHardFog(revealed, opacity);
  const soft = drawSoftFog(known ?? fogMask(revealed, map, softEdge), opacity);
  if (opacity < 1) {
    const layer = new Container();
    layer.addChild(soft);
    return layer;
  }
  const layer = drawHardFog(revealed, opacity);
  layer.addChild(soft);
  return layer;
}
