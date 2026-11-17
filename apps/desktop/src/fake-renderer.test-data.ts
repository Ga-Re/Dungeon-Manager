import type { Camera, MapImage, Renderer } from "@dungeon-manager/renderer";
import { vi } from "vitest";
import type { MapViewService } from "./platform/map-images.js";

/** A renderer that records what it was asked to draw (jsdom has no WebGL). */
export function fakeRenderer(cameras: Camera[] = []) {
  return {
    setMap: vi.fn<Renderer["setMap"]>(),
    setFog: vi.fn<Renderer["setFog"]>(),
    setCamera: vi.fn((camera: Camera) => {
      cameras.push(camera);
    }),
    resize: vi.fn<Renderer["resize"]>(),
    drawn: () => Promise.resolve(),
    destroy: vi.fn<Renderer["destroy"]>(),
  } satisfies Renderer;
}

/** A map service whose renderers are fakes; `views` lists them with their canvases. */
export function fakeMapService(load: (path: string) => Promise<MapImage>) {
  const cameras: Camera[] = [];
  const views: {
    canvas: HTMLCanvasElement;
    view: ReturnType<typeof fakeRenderer>;
  }[] = [];
  const service = {
    loadImage: vi.fn(load),
    createRenderer: vi.fn((canvas: HTMLCanvasElement) => {
      const view = fakeRenderer(cameras);
      views.push({ canvas, view });
      return Promise.resolve(view);
    }),
  } satisfies MapViewService;
  return {
    service,
    views,
    /** The most recently created renderer. */
    get view() {
      const last = views.at(-1);
      if (!last) throw new Error("no renderer yet");
      return last.view;
    },
    camera: () => cameras.at(-1),
  };
}
