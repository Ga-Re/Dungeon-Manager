import type { Camera, MapImage, Renderer } from "@dungeon-manager/renderer";
import { vi } from "vitest";
import type { MapViewService } from "./platform/map-images.js";

/** A renderer that records what it was asked to draw (jsdom has no WebGL). */
export function fakeRenderer(cameras: Camera[] = []) {
  return {
    setMap: vi.fn<Renderer["setMap"]>(),
    setVideo: vi.fn<Renderer["setVideo"]>(),
    setFog: vi.fn<Renderer["setFog"]>(),
    setGrid: vi.fn<Renderer["setGrid"]>(),
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
    loadVideo: vi.fn(() => {
      const video = document.createElement("video");
      // jsdom has no media: give the element the size a loaded video would report.
      Object.defineProperty(video, "videoWidth", { value: 320 });
      Object.defineProperty(video, "videoHeight", { value: 200 });
      video.pause = () => undefined;
      video.load = () => undefined;
      return Promise.resolve(video);
    }),
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
