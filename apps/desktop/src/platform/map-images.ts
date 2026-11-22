import type { MapImage, Renderer, Size } from "@dungeon-manager/renderer";

/**
 * Platform adapter for showing maps (ARCHITECTURE §4): loading a library image and creating a
 * renderer. The Tauri implementation is in `tauri-map-images.ts`; component tests use fakes,
 * since jsdom has no WebGL.
 */
export interface MapViewService {
  /** Loads `library/…` (an `AssetRef.path`) as an image the renderer can upload. */
  loadImage(path: string): Promise<MapImage>;
  /**
   * Loads a video map (`library/…`), muted and looping, playing once loaded. The caller puts
   * it under the canvas and hands it to the renderer, which decides when it may be seen.
   * With `still`, it loads CORS-clean and does not play: its first frame is drawn into a
   * canvas that must stay readable (catalog previews, T-124).
   */
  loadVideo(
    path: string,
    options?: { readonly still?: boolean },
  ): Promise<HTMLVideoElement>;
  createRenderer(canvas: HTMLCanvasElement, size: Size): Promise<Renderer>;
}

/** Stops a video map and frees its decoder (removing the source is the documented way). */
export function releaseVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.remove();
}
