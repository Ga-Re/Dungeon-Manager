/** The last segment of a library path, for display. */
export const fileName = (path: string) => path.split("/").at(-1) ?? path;

/** The file name of a note without `.md`, for labels (T-161b). */
export const noteTitle = (path: string) => fileName(path).replace(/\.md$/, "");

/**
 * The notes linked from a document, each once (compared in NFC) and without the document's
 * own fixed note, which is listed by itself – files edited by hand or on other devices may
 * repeat a path.
 */
export function linkedNotes(
  links: readonly string[] | undefined,
  ownPath: string,
): string[] {
  const seen = new Set([ownPath.normalize("NFC")]);
  return (links ?? []).filter((path) => {
    const key = path.normalize("NFC");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
