import { looksLikeConflictCopy } from "./conflicts.js";
import { isValidFileId, isValidSlug } from "./layout.js";

/** What a changed library path means for the running app (e.g. reload a scene). */
export type LibraryPathKind =
  | { readonly kind: "campaign"; readonly slug: string }
  | { readonly kind: "scene"; readonly slug: string; readonly sceneId: string }
  | {
      readonly kind: "conflictCopy";
      readonly slug: string;
      readonly name: string;
    }
  | { readonly kind: "asset"; readonly path: string }
  | { readonly kind: "other" };

/** Classifies a library-relative path reported by the file watcher (T-103b). */
export function classifyLibraryPath(path: string): LibraryPathKind {
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".."))
    return { kind: "other" };
  const [root, slug = "", second, third, ...rest] = parts;
  if (root === "library" && parts.length > 1) return { kind: "asset", path };
  if (root !== "campaigns" || !isValidSlug(slug)) return { kind: "other" };
  if (second === "campaign.json" && third === undefined)
    return { kind: "campaign", slug };
  if (
    second !== "scenes" ||
    third === undefined ||
    rest.length > 0 ||
    third.endsWith(".tmp")
  )
    return { kind: "other" };
  const sceneId = third.endsWith(".json")
    ? third.slice(0, -".json".length)
    : "";
  if (isValidFileId(sceneId)) return { kind: "scene", slug, sceneId };
  if (looksLikeConflictCopy(third))
    return { kind: "conflictCopy", slug, name: third };
  return { kind: "other" };
}
