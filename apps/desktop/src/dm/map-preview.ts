import type { Size } from "@dungeon-manager/renderer";
import type { CatalogMap } from "@dungeon-manager/storage";
import { releaseVideo, type MapViewService } from "../platform/map-images.js";

/** The longest side of a catalog preview, in pixels: sharp in a grid cell on a HiDPI screen. */
export const PREVIEW_MAX_PX = 384;

/** JPEG quality of a preview: small files, good enough for a thumbnail. */
const PREVIEW_QUALITY = 0.8;

/** A preview's size: the map's aspect ratio, never larger than the map or `PREVIEW_MAX_PX`. */
export function previewSize(map: Size): Size {
  const scale = Math.min(
    1,
    PREVIEW_MAX_PX / Math.max(map.width, map.height, 1),
  );
  return {
    width: Math.max(1, Math.round(map.width * scale)),
    height: Math.max(1, Math.round(map.height * scale)),
  };
}

/**
 * Draws a map (an image, or a video's first frame – DM decision T-124) small and encodes it as
 * JPEG, in the webview: no new image library in the backend. JPEG, not WebP: WebKit (macOS,
 * Linux) cannot encode WebP, and maps are opaque anyway.
 */
export async function renderPreview(
  maps: MapViewService,
  map: CatalogMap,
): Promise<Blob> {
  if (map.kind === "video") {
    const video = await maps.loadVideo(map.path, { still: true });
    try {
      return await encode(video, {
        width: video.videoWidth,
        height: video.videoHeight,
      });
    } finally {
      releaseVideo(video);
    }
  }
  const image = await maps.loadImage(map.path);
  return encode(image, { width: image.width, height: image.height });
}

async function encode(source: CanvasImageSource, size: Size): Promise<Blob> {
  const target = previewSize(size);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the map preview.");
  context.imageSmoothingQuality = "high";
  // JPEG has no transparency: a transparent pixel (e.g. of a video) becomes black, not noise.
  context.fillStyle = "#000";
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0, target.width, target.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", PREVIEW_QUALITY);
  });
  // The backend stores only JPEG; anything else is a webview we do not know.
  if (!blob || blob.type !== "image/jpeg")
    throw new Error("This webview cannot encode JPEG previews.");
  return blob;
}
