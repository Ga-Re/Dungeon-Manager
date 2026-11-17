import { beforeEach, describe, expect, test, vi } from "vitest";
import { LibraryError } from "./library.js";
import { createTauriLibraryService } from "./tauri-library.js";

const fake = vi.hoisted(() => {
  /** Stands in for Tauri's IPC channel; tests call `onmessage` like the backend would. */
  class FakeChannel {
    onmessage: (payload: unknown) => void = () => undefined;
  }
  return {
    invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
    Channel: FakeChannel,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: fake.invoke,
  Channel: fake.Channel,
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
    await fs.moveToTrash("campaigns/a/scenes/s.json");
    fake.invoke.mockResolvedValueOnce(null);
    await createTauriLibraryService().importMap("Karten");
    expect(fake.invoke.mock.calls).toEqual([
      ["library_read", { path: "campaigns/a/campaign.json" }],
      ["library_write", { path: "x.json", text: "{}" }],
      ["library_list", { path: "campaigns" }],
      ["library_make_directory", { path: "library/maps" }],
      ["library_move_to_trash", { path: "campaigns/a/scenes/s.json" }],
      ["library_import_map", { filterLabel: "Karten" }],
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

  test("validates the imported asset reference", async () => {
    fake.invoke.mockResolvedValue({ path: "../outside.png", hash: "x" });
    await expect(
      createTauriLibraryService().importMap("Karten"),
    ).rejects.toThrow();
    fake.invoke.mockResolvedValue(null);
    expect(await createTauriLibraryService().importMap("Karten")).toBeNull();
  });

  test("file changes arrive through one private channel, shared by all listeners", async () => {
    fake.invoke.mockResolvedValue(undefined);
    const service = createTauriLibraryService();
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = await service.onChange(first);
    await service.onChange(second);

    const subscriptions = fake.invoke.mock.calls.filter(
      ([command]) => command === "library_subscribe",
    );
    expect(subscriptions).toHaveLength(1);
    const channel = (
      subscriptions[0]?.[1] as { onChange: InstanceType<typeof fake.Channel> }
    ).onChange;
    channel.onmessage(["campaigns/a/campaign.json", 3]);
    channel.onmessage("not a list");
    expect(first.mock.calls).toEqual([[["campaigns/a/campaign.json"]]]);
    expect(second.mock.calls).toEqual([[["campaigns/a/campaign.json"]]]);

    stopFirst();
    channel.onmessage(["campaigns/b/campaign.json"]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  test("a failed subscription can be retried and leaves no listener behind", async () => {
    fake.invoke.mockRejectedValueOnce({ code: "forbidden" });
    const service = createTauriLibraryService();
    const listener = vi.fn();
    await expect(service.onChange(listener)).rejects.toBeInstanceOf(
      LibraryError,
    );

    fake.invoke.mockResolvedValue(undefined);
    await service.onChange(listener);
    const subscriptions = fake.invoke.mock.calls.filter(
      ([command]) => command === "library_subscribe",
    );
    expect(subscriptions).toHaveLength(2);
    const channel = (
      subscriptions[1]?.[1] as { onChange: InstanceType<typeof fake.Channel> }
    ).onChange;
    channel.onmessage(["campaigns/a/campaign.json"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
