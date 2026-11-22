import type { AssetRef } from "@dungeon-manager/schema";
import type { CatalogMap } from "@dungeon-manager/storage";
import { describe, expect, test, vi } from "vitest";
import type { MapViewService } from "../platform/map-images.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { catalogPreview, PreviewCancelled } from "./map-catalog.js";

vi.mock("./map-preview.js", () => ({
  renderPreview: vi.fn(() =>
    Promise.resolve(new Blob(["drawn"], { type: "image/jpeg" })),
  ),
}));

const maps = {} as MapViewService;
const map = (name: string): CatalogMap => ({
  path: `library/maps/${name}.png`,
  kind: "image",
  sidecarConflicts: [],
});

describe("catalogPreview", () => {
  test("never hashes a map whose tiles went away while it waited", async () => {
    const library = fakeLibraryService("/lib");
    // Two slow hashes fill both slots; the third waits.
    const pending: ((asset: AssetRef) => void)[] = [];
    library.service.hashFile.mockImplementation(
      (path) =>
        new Promise((resolve) => {
          pending.push(() => {
            resolve({ path, hash: `sha256:${"c".repeat(64)}` });
          });
        }),
    );
    const first = catalogPreview(library.service, maps, map("a"));
    catalogPreview(library.service, maps, map("b"));
    const third = catalogPreview(library.service, maps, map("c"));
    await Promise.resolve();
    expect(library.service.hashFile).toHaveBeenCalledTimes(2);

    third.release();
    pending.forEach((resolve) => {
      resolve({ path: "", hash: "" });
    });
    await first.promise;
    await expect(third.promise).rejects.toBeInstanceOf(PreviewCancelled);
    expect(library.service.hashFile).toHaveBeenCalledTimes(2);
  });

  test("tiles of the same map share one preview; it is not cancelled while one remains", async () => {
    const library = fakeLibraryService("/lib", {
      "library/maps/a.png": "png",
    });
    const panel = catalogPreview(library.service, maps, map("a"));
    const picker = catalogPreview(library.service, maps, map("a"));
    picker.release();
    expect(picker.promise).toBe(panel.promise);
    expect((await panel.promise).size).toBeGreaterThan(0);
    expect(library.service.writePreview).toHaveBeenCalledTimes(1);
  });

  test("shows a drawn preview even if storing it fails", async () => {
    const library = fakeLibraryService("/lib", {
      "library/maps/a.png": "png",
    });
    library.service.writePreview.mockRejectedValue(new Error("read-only"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const blob = await catalogPreview(library.service, maps, map("a")).promise;
    expect(await blob.text()).toBe("drawn");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
