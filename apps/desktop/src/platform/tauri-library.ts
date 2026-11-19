import { assetRefSchema } from "@dungeon-manager/schema";
import type { DirEntry, ReadResult } from "@dungeon-manager/storage";
import { Channel, invoke } from "@tauri-apps/api/core";
import {
  LibraryError,
  type LibraryErrorCode,
  type LibraryService,
} from "./library.js";

const CODES: readonly string[] = [
  "noLibrary",
  "invalidPath",
  "forbidden",
  "unsupportedFile",
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
  const listeners = new Set<(paths: readonly string[]) => void>();
  let subscribed: Promise<unknown> | null = null;
  return {
    fs: {
      read: (path) => call<ReadResult>("library_read", { path }),
      writeAtomic: (path, text) => call("library_write", { path, text }),
      list: (path) =>
        call<readonly DirEntry[] | null>("library_list", { path }),
      makeDirectory: (path) => call("library_make_directory", { path }),
      moveToTrash: (path) => call<string>("library_move_to_trash", { path }),
    },
    currentRoot: () => call<string | null>("library_root"),
    chooseRoot: () => call<string | null>("library_choose"),
    async importMap(filterLabel) {
      const result = await call<unknown>("library_import_map", { filterLabel });
      // Validated at the edge like any file content: only a safe relative path and a hash.
      return assetRefSchema.nullable().parse(result);
    },
    async readImage(path) {
      // Raw bytes (not JSON): `library_read_image` answers with an ipc Response.
      const bytes = await call<ArrayBuffer>("library_read_image", { path });
      return new Blob([bytes]);
    },
    async onChange(listener) {
      // One channel per DM window, opened on first use and shared by all listeners. A channel,
      // not a global event: the player window can hear every global event (ARCHITECTURE §8).
      if (!subscribed) {
        const channel = new Channel<unknown>();
        channel.onmessage = (payload) => {
          if (!Array.isArray(payload)) return;
          const paths = payload.filter((path) => typeof path === "string");
          listeners.forEach((each) => {
            each(paths);
          });
        };
        subscribed = call<unknown>("library_subscribe", {
          onChange: channel,
        }).catch((error: unknown) => {
          // A later call may try again; no listener is left behind.
          subscribed = null;
          throw error;
        });
      }
      await subscribed;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
