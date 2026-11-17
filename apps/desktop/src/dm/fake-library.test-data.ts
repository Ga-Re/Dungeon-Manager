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
