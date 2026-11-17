import { createRenderer } from "@dungeon-manager/renderer";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MapViewService } from "./map-images.js";

/** The URL of a library file on the read-only `dmlib` scheme (served by `protocol.rs`). */
export function libraryUrl(path: string): string {
  return convertFileSrc(path, "dmlib");
}

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
        video.addEventListener(
          "loadeddata",
          () => {
            resolve();
          },
          { once: true },
        );
        video.addEventListener(
          "error",
          () => {
            reject(new Error(`The video map ${path} could not be loaded.`));
          },
          { once: true },
        );
      });
      void video.play().catch(() => undefined);
      return video;
    },
    createRenderer: (canvas, size) =>
      createRenderer({ canvas, size, resolution: window.devicePixelRatio }),
  };
}
