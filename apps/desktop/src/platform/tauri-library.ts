import type { DirEntry, ReadResult } from "@dungeon-manager/storage";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  LibraryError,
  type LibraryErrorCode,
  type LibraryService,
} from "./library.js";

const CODES: readonly string[] = [
  "noLibrary",
  "invalidPath",
  "io",
] satisfies LibraryErrorCode[];

/** Turns the backend's `{ code, message }` rejection into a `LibraryError`. */
function toLibraryError(error: unknown): LibraryError {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code, message } = error as { code: unknown; message?: unknown };
    if (typeof code === "string" && CODES.includes(code)) {
      return new LibraryError(
        code as LibraryErrorCode,
        typeof message === "string" ? message : code,
      );
    }
  }
  return new LibraryError("io", String(error));
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toLibraryError(error);
  }
}

/** Library access via the desktop backend's `library_*` commands (Rust, T-103b). */
export function createTauriLibraryService(): LibraryService {
  return {
    fs: {
      read: (path) => call<ReadResult>("library_read", { path }),
      writeAtomic: (path, text) => call("library_write", { path, text }),
      list: (path) =>
        call<readonly DirEntry[] | null>("library_list", { path }),
      makeDirectory: (path) => call("library_make_directory", { path }),
    },
    currentRoot: () => call<string | null>("library_root"),
    chooseRoot: () => call<string | null>("library_choose"),
    async onChange(listener) {
      return listen<unknown>("library-changed", ({ payload }) => {
        if (Array.isArray(payload))
          listener(payload.filter((path) => typeof path === "string"));
      });
    },
  };
}
