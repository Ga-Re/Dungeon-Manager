import {
  createMemoryFileSystem,
  type MemoryFileContent,
} from "@dungeon-manager/storage";
import { vi } from "vitest";
import type { LibraryService } from "../platform/library.js";

/** An in-memory library plus a way to simulate watcher events. */
export function fakeLibraryService(
  root: string | null,
  files: Record<string, MemoryFileContent> = {},
) {
  const fs = createMemoryFileSystem(files);
  let current = root;
  const listeners = new Set<(paths: readonly string[]) => void>();
  const service = {
    fs,
    currentRoot: vi.fn(() => Promise.resolve(current)),
    chooseRoot: vi.fn<LibraryService["chooseRoot"]>(() =>
      Promise.resolve(null),
    ),
    importMap: vi.fn<LibraryService["importMap"]>(() => Promise.resolve(null)),
    // Images come from the memory file system as their text, enough for the UI to show them.
    readImage: vi.fn(async (path: string) => {
      const file = await fs.read(path);
      if (file.kind !== "ok") throw new Error(`no image at ${path}`);
      return new Blob([file.text], { type: "image/png" });
    }),
    hashFile: vi.fn(async (path: string) => {
      if ((await fs.read(path)).kind !== "ok")
        throw new Error(`no file at ${path}`);
      return { path, hash: `sha256:${"b".repeat(64)}` };
    }),
    writePreview: vi.fn<LibraryService["writePreview"]>(() =>
      Promise.resolve(),
    ),
    onChange: vi.fn((listener: (paths: readonly string[]) => void) => {
      listeners.add(listener);
      return Promise.resolve(() => listeners.delete(listener));
    }),
  } satisfies LibraryService;
  return {
    service,
    fs,
    setRoot: (next: string | null) => {
      current = next;
    },
    emit: (paths: readonly string[]) => {
      listeners.forEach((listener) => {
        listener(paths);
      });
    },
    listenerCount: () => listeners.size,
  };
}
