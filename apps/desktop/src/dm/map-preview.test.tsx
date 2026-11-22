import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MapViewService } from "../platform/map-images.js";
import { PREVIEW_MAX_PX, previewSize, renderPreview } from "./map-preview.js";

describe("previewSize", () => {
  test("fits the longer side into the preview, keeping the aspect ratio", () => {
    expect(previewSize({ width: 4000, height: 2000 })).toEqual({
      width: PREVIEW_MAX_PX,
      height: PREVIEW_MAX_PX / 2,
    });
    expect(previewSize({ width: 1000, height: 3000 })).toEqual({
      width: 128,
      height: PREVIEW_MAX_PX,
    });
  });

  test("never enlarges a small map and never gets empty", () => {
    expect(previewSize({ width: 100, height: 50 })).toEqual({
      width: 100,
      height: 50,
    });
    expect(previewSize({ width: 0, height: 0 })).toEqual({
      width: 1,
      height: 1,
    });
  });
});

describe("renderPreview", () => {
  const drawImage = vi.fn();
  let encodedAs = "image/jpeg";

  beforeEach(() => {
    drawImage.mockClear();
    encodedAs = "image/jpeg";
    // jsdom has no canvas: a 2D context that records what is drawn, an encoder that answers.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      fillRect: vi.fn(),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => {
        callback(new Blob(["x"], { type: encodedAs }));
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mapsWith = (part: Partial<MapViewService>) => part as MapViewService;

  test("draws an image map small, as JPEG", async () => {
    const image = { width: 3840, height: 2160 } as HTMLImageElement;
    const blob = await renderPreview(
      mapsWith({ loadImage: () => Promise.resolve(image) }),
      { path: "library/maps/turm.png", kind: "image", sidecarConflicts: [] },
    );
    expect(blob.type).toBe("image/jpeg");
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 384, 216);
  });

  test("draws a video map's first frame and frees the video", async () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "videoWidth", { value: 1920 });
    Object.defineProperty(video, "videoHeight", { value: 1080 });
    video.src = "dmlib://library/maps/see.webm";
    vi.spyOn(video, "load").mockReturnValue();
    const loadVideo = vi.fn(() => Promise.resolve(video));
    await renderPreview(mapsWith({ loadVideo }), {
      path: "library/maps/see.webm",
      kind: "video",
      sidecarConflicts: [],
    });
    // A still: loaded CORS-clean and not played (the canvas could not be read otherwise).
    expect(loadVideo).toHaveBeenCalledWith("library/maps/see.webm", {
      still: true,
    });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 384, 216);
    expect(video.hasAttribute("src")).toBe(false);
  });

  test("refuses when the webview cannot encode JPEG", async () => {
    encodedAs = "image/png";
    await expect(
      renderPreview(
        mapsWith({
          loadImage: () =>
            Promise.resolve({ width: 10, height: 10 } as HTMLImageElement),
        }),
        { path: "library/maps/turm.png", kind: "image", sidecarConflicts: [] },
      ),
    ).rejects.toThrow(/JPEG/);
  });
});
