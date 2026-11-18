import { createRenderer } from "@dungeon-manager/renderer";
import { convertFileSrc } from "@tauri-apps/api/core";
import { releaseVideo, type MapViewService } from "./map-images.js";

/** The URL of a library file on the read-only `dmlib` scheme (served by `protocol.rs`). */
export function libraryUrl(path: string): string {
  return convertFileSrc(path, "dmlib");
}

/** How long a video map may take to load its first frame. */
const VIDEO_LOAD_TIMEOUT_MS = 30_000;

/** Loads map images through the `dmlib` scheme and renders with PixiJS. */
export function createTauriMapViewService(): MapViewService {
  return {
    async loadImage(path) {
      const image = new Image();
      // WebGL only accepts CORS-clean images; the scheme answers with a matching header.
      image.crossOrigin = "anonymous";
      image.src = libraryUrl(path);
      await image.decode();
      return image;
    },
    async loadVideo(path) {
      const video = document.createElement("video");
      // Muted: browsers only autoplay muted video, and map videos have no sound to keep.
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = libraryUrl(path);
      await new Promise<void>((resolve, reject) => {
        // A stalled source fires neither event; give up instead of loading forever.
        const timeout = setTimeout(() => {
          // Stop fetching: the element would otherwise keep loading in the background.
          releaseVideo(video);
          reject(new Error(`The video map ${path} did not load in time.`));
        }, VIDEO_LOAD_TIMEOUT_MS);
        video.addEventListener(
          "loadeddata",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        video.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            releaseVideo(video);
            reject(new Error(`The video map ${path} could not be loaded.`));
          },
          { once: true },
        );
      });
      video.play().catch((error: unknown) => {
        // The map then shows its first frame, still under its fog; worth knowing, not fatal.
        console.warn(`The video map ${path} does not play.`, error);
      });
      return video;
    },
    createRenderer: (canvas, size) =>
      createRenderer({ canvas, size, resolution: window.devicePixelRatio }),
  };
}
