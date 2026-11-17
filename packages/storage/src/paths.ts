import { isValidSlug } from "./layout.js";

/** What a changed library path means for the running app (e.g. reload a scene). */
export type LibraryPathKind =
  | { readonly kind: "campaign"; readonly slug: string }
  /**
   * A JSON file in a scenes folder: a scene or a conflict copy. Telling them apart needs the
   * neighbours and, for OneDrive, the content, so the watcher re-lists with `listScenes`.
   */
  | { readonly kind: "sceneFile"; readonly slug: string; readonly name: string }
  | { readonly kind: "asset"; readonly path: string }
  | { readonly kind: "other" };

/**
 * Classifies a library-relative path reported by the file watcher (T-103b). Temporary files of
 * atomic writes and generated previews are `other`, so the app does not react to its own writes.
 */
export function classifyLibraryPath(path: string): LibraryPathKind {
  const parts = path.split("/");
  const unsafe = (part: string) =>
    part === "" || part === "." || part === ".." || part.includes("\\");
  if (parts.some(unsafe) || path.endsWith(".tmp")) return { kind: "other" };
  const [root, second = "", third, fourth, ...rest] = parts;
  if (root === "library") {
    return parts.length > 1 && second !== ".previews"
      ? { kind: "asset", path }
      : { kind: "other" };
  }
  if (root !== "campaigns" || !isValidSlug(second)) return { kind: "other" };
  if (third === "campaign.json" && fourth === undefined)
    return { kind: "campaign", slug: second };
  if (
    third === "scenes" &&
    fourth?.endsWith(".json") === true &&
    rest.length === 0
  ) {
    return { kind: "sceneFile", slug: second, name: fourth };
  }
  return { kind: "other" };
}
