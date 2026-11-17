import type { MapImage, Renderer, Size } from "@dungeon-manager/renderer";

/**
 * Platform adapter for showing maps (ARCHITECTURE §4): loading a library image and creating a
 * renderer. The Tauri implementation is in `tauri-map-images.ts`; component tests use fakes,
 * since jsdom has no WebGL.
 */
export interface MapViewService {
  /** Loads `library/…` (an `AssetRef.path`) as an image the renderer can upload. */
  loadImage(path: string): Promise<MapImage>;
  createRenderer(canvas: HTMLCanvasElement, size: Size): Promise<Renderer>;
}
