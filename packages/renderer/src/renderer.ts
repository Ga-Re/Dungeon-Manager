import type { Polygon } from "@dungeon-manager/schema";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Camera, Size } from "./camera.js";

/** An image the browser has loaded (or drawn), ready to become the map texture. */
export type MapImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

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
   * Covers everything except `revealed` with opaque fog (the player view), or removes the fog
   * layer with `null` (the DM sees the whole map). Set it before or with the map: the player
   * view must never draw a map without its fog (ARCHITECTURE §5.1, ADR-0010).
   */
  setFog(revealed: readonly Polygon[] | null): void;
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
  const app = new Application();
  await app.init({
    canvas: options.canvas,
    width: options.size.width,
    height: options.size.height,
    resolution: options.resolution ?? 1,
    autoDensity: true,
    background: options.background ?? "#111111",
    preference: "webgl",
    antialias: false,
    // Drawing happens on demand (see `requestDraw`); no render loop, no resizeTo: the caller
    // owns the canvas and calls `resize`.
    autoStart: false,
  });

  const world = new Container();
  app.stage.addChild(world);
  let map: Sprite | null = null;
  let fog: Graphics | null = null;
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

  const requestDraw = () => {
    if (frame !== null || destroyed) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      applyCamera();
      app.render();
      const done = waiting;
      waiting = [];
      done.forEach((resolve) => {
        resolve();
      });
    });
  };

  return {
    setMap(image) {
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
    setFog(revealed) {
      if (fog) {
        world.removeChild(fog);
        fog.destroy();
        fog = null;
      }
      if (revealed) {
        fog = drawFog(revealed);
        world.addChild(fog);
      }
      requestDraw();
    },
    setCamera(next) {
      camera = next;
      requestDraw();
    },
    resize(next) {
      size = next;
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
 * Opaque fog with the revealed areas cut out. Revealed polygons come from a union (core/fog),
 * so they never overlap; holes inside them (hidden again) are filled with fog once more.
 */
function drawFog(revealed: readonly Polygon[]): Graphics {
  const graphics = new Graphics();
  graphics
    .rect(-FOG_EXTENT, -FOG_EXTENT, 2 * FOG_EXTENT, 2 * FOG_EXTENT)
    .fill({ color: FOG_COLOUR });
  for (const polygon of revealed) graphics.poly(flat(polygon.outer)).cut();
  for (const polygon of revealed) {
    for (const hole of polygon.holes)
      graphics.poly(flat(hole)).fill({ color: FOG_COLOUR });
  }
  return graphics;
}
