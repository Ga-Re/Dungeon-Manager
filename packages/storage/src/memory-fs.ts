import type { DirEntry, FileSystem, ReadResult } from "./fs.js";

/** Initial content: file text, or a cloud placeholder whose content is not downloaded. */
export type MemoryFileContent = string | { readonly placeholder: true };

/** An in-memory `FileSystem` for tests, with helpers to inspect what was written. */
export interface MemoryFileSystem extends FileSystem {
  files(): ReadonlyMap<string, string>;
  directories(): readonly string[];
}

/** Creates an in-memory file system, e.g. for tests of code that uses `storage`. */
export function createMemoryFileSystem(
  initial: Readonly<Record<string, MemoryFileContent>> = {},
): MemoryFileSystem {
  const files = new Map<string, MemoryFileContent>(Object.entries(initial));
  const directories = new Set<string>();
  const parentsOf = (path: string) =>
    path
      .split("/")
      .slice(0, -1)
      .map((_, i, parts) => parts.slice(0, i + 1).join("/"));
  for (const path of files.keys())
    parentsOf(path).forEach((dir) => directories.add(dir));

  return {
    read(path): Promise<ReadResult> {
      const content = files.get(path);
      if (content === undefined) return Promise.resolve({ kind: "missing" });
      if (typeof content !== "string")
        return Promise.resolve({ kind: "notAvailable" });
      return Promise.resolve({ kind: "ok", text: content });
    },
    writeAtomic(path, text) {
      files.set(path, text);
      parentsOf(path).forEach((dir) => directories.add(dir));
      return Promise.resolve();
    },
    list(path) {
      if (!directories.has(path)) return Promise.resolve(null);
      const prefix = `${path}/`;
      const entries = new Map<string, DirEntry>();
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const [name = "", ...rest] = file.slice(prefix.length).split("/");
        entries.set(name, {
          name,
          kind: rest.length > 0 ? "directory" : "file",
        });
      }
      for (const dir of directories) {
        if (dir.startsWith(prefix) && !dir.slice(prefix.length).includes("/")) {
          entries.set(dir.slice(prefix.length), {
            name: dir.slice(prefix.length),
            kind: "directory",
          });
        }
      }
      return Promise.resolve([...entries.values()]);
    },
    makeDirectory(path) {
      [...parentsOf(path), path].forEach((dir) => directories.add(dir));
      return Promise.resolve();
    },
    files: () =>
      new Map(
        [...files].flatMap(([path, content]) =>
          typeof content === "string" ? [[path, content]] : [],
        ),
      ),
    directories: () => [...directories].sort(),
  };
}
