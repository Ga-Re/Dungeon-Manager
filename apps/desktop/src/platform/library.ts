import type { AssetRef } from "@dungeon-manager/schema";
import type { FileSystem } from "@dungeon-manager/storage";

/** Known failure reasons from the desktop backend; the UI translates them. */
export type LibraryErrorCode =
  "noLibrary" | "invalidPath" | "forbidden" | "unsupportedFile" | "io";

/** A library failure with a translatable code (and the OS message for `io`). */
export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "LibraryError";
  }
}

/**
 * Platform adapter for the library folder (ARCHITECTURE §4, §6). The Tauri implementation is
 * in `tauri-library.ts`; files are only reachable inside the folder the DM chose.
 */
export interface LibraryService {
  /** File access relative to the library root, for `@dungeon-manager/storage`. */
  readonly fs: FileSystem;
  /** The open library's folder, or `null` if none has been chosen on this device. */
  currentRoot(): Promise<string | null>;
  /** Asks the DM for a folder (native dialog); `null` if cancelled. */
  chooseRoot(): Promise<string | null>;
  /**
   * Asks the DM for a map image (native dialog) and copies it into `library/maps/`;
   * `null` if cancelled. An identical file already there is reused.
   * @param filterLabel translated name of the file type filter shown in the dialog
   */
  importMap(filterLabel: string): Promise<AssetRef | null>;
  /**
   * An image shown in a note (T-163), by its library-relative path: only real images (PNG,
   * JPEG, WebP, GIF) up to 20 MB, checked by the backend.
   */
  readImage(path: string): Promise<Blob>;
  /** Calls `listener` with library-relative paths changed on disk; resolves to an unsubscribe. */
  onChange(listener: (paths: readonly string[]) => void): Promise<() => void>;
}
