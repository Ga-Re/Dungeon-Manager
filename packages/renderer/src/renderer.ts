import type { Polygon } from "@dungeon-manager/schema";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Camera, Size } from "./camera.js";
import { createVideoGate, cssTransform, sameAspect } from "./video-layer.js";

/** An image the browser has loaded (or drawn), ready to become the map texture. */
export type MapImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface FogOptions {
  /** 1 for players (opaque, the default); less for the DM, who must see what lies beneath. */
  readonly opacity?: number;
}

export interface RendererOptions {
  /** The canvas to draw into; it is sized by the caller (CSS) and by `resize`. */
  readonly canvas: HTMLCanvasElement;
  readonly size: Size;
  /** Device pixels per CSS pixel (`devicePixelRatio`); 1 keeps tests deterministic. */
  readonly resolution?: number;
  /** Shown around the map; dark, so a TV in a dim room does not glare. */
  readonly background?: string;
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
  let map: Sprite | null = null;
  let fog: Container | null = null;
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

  const requestDraw = () => {
    if (frame !== null || destroyed) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      try {
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
      }
      requestDraw();
    },
    setFog(revealed, fogOptions) {
      // Build the new fog first: if that fails, the old fog stays in place and counts.
      const next = revealed
        ? drawFog(revealed, fogOptions?.opacity ?? 1)
        : null;
      if (fog) {
        world.removeChild(fog);
        fog.destroy({ children: true });
      }
      fog = next;
      if (fog) world.addChild(fog);
      gate.fogSet();
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
function drawFog(revealed: readonly Polygon[], opacity: number): Container {
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
