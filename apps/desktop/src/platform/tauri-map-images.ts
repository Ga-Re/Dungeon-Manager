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
    createRenderer: (canvas, size) =>
      createRenderer({ canvas, size, resolution: window.devicePixelRatio }),
  };
}
