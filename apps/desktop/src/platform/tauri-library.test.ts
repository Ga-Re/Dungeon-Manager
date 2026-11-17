import { beforeEach, describe, expect, test, vi } from "vitest";
import { LibraryError } from "./library.js";
import { createTauriLibraryService } from "./tauri-library.js";

const fake = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
  handler: null as ((event: { payload: unknown }) => void) | null,
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: fake.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: { payload: unknown }) => void) => {
    expect(event).toBe("library-changed");
    fake.handler = handler;
    return Promise.resolve(fake.unlisten);
  },
}));

describe("createTauriLibraryService", () => {
  beforeEach(() => {
    fake.invoke.mockReset();
  });

  test("maps the file system to the library commands", async () => {
    fake.invoke.mockResolvedValue({ kind: "ok", text: "{}" });
    const { fs } = createTauriLibraryService();
    expect(await fs.read("campaigns/a/campaign.json")).toEqual({
      kind: "ok",
      text: "{}",
    });
    await fs.writeAtomic("x.json", "{}");
    await fs.list("campaigns");
    await fs.makeDirectory("library/maps");
    await createTauriLibraryService().importMap();
    expect(fake.invoke.mock.calls).toEqual([
      ["library_read", { path: "campaigns/a/campaign.json" }],
      ["library_write", { path: "x.json", text: "{}" }],
      ["library_list", { path: "campaigns" }],
      ["library_make_directory", { path: "library/maps" }],
      ["library_import_map", undefined],
    ]);
  });

  test.each([
    [{ code: "invalidPath", message: "../x" }, "invalidPath", "../x"],
    [{ code: "noLibrary" }, "noLibrary", "noLibrary"],
    [{ code: "io", message: "Permission denied" }, "io", "Permission denied"],
    [{ code: "unexpected" }, "io", "[object Object]"],
    ["boom", "io", "boom"],
  ])("turns rejection %j into a LibraryError", async (raw, code, message) => {
    fake.invoke.mockRejectedValue(raw);
    const error: unknown = await createTauriLibraryService()
      .currentRoot()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LibraryError);
    expect(error).toMatchObject({ code, message });
  });

  test("passes only string paths of change events on", async () => {
    const listener = vi.fn();
    const stop = await createTauriLibraryService().onChange(listener);
    fake.handler?.({ payload: ["campaigns/a/campaign.json", 3] });
    fake.handler?.({ payload: "not a list" });
    expect(listener.mock.calls).toEqual([[["campaigns/a/campaign.json"]]]);
    expect(stop).toBe(fake.unlisten);
  });
});
