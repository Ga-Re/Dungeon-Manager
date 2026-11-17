/** Result of reading a file from the library. */
export type ReadResult =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "missing" }
  /** The file exists but its content is not on this device yet (cloud on-demand placeholder). */
  | { readonly kind: "notAvailable" };

/** An entry of a directory listing. */
export interface DirEntry {
  readonly name: string;
  readonly kind: "file" | "directory";
}

/**
 * Injected file access (ARCHITECTURE §6): `storage` never touches a real file system itself.
 * All paths are relative to the library root and use `/` separators; the adapter confines them
 * to the root. The desktop implements it in Rust (T-103b), tests use `createMemoryFileSystem`.
 */
export interface FileSystem {
  read(path: string): Promise<ReadResult>;
  /** Writes atomically: to a temporary file first, then renamed over the target. */
  writeAtomic(path: string, text: string): Promise<void>;
  /** Lists a directory, or returns `null` if it does not exist. */
  list(path: string): Promise<readonly DirEntry[] | null>;
  /** Creates a directory and its parents; existing directories are fine. */
  makeDirectory(path: string): Promise<void>;
  /**
   * Moves a file inside a campaign (`campaigns/<slug>/…`) into that campaign's `.trash/`
   * folder under a new, unique name (ARCHITECTURE §6.6); nothing is ever deleted outright.
   * @returns the file's path in the trash. @throws if the file does not exist
   */
  moveToTrash(path: string): Promise<string>;
}
