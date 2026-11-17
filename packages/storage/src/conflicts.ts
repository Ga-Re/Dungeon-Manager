/** A conflict copy created by a sync client next to (or instead of) the original file. */
export interface ConflictCopy {
  readonly copy: string;
  /** The file name the copy belongs to. */
  readonly original: string;
  readonly provider:
    "Dropbox" | "OneDrive" | "Google Drive" | "iCloud" | "Syncthing";
}

interface Pattern {
  readonly provider: ConflictCopy["provider"];
  /** Possible base names (without extension) of the original, longest match first. */
  readonly originals: (base: string) => readonly string[];
  /** Ambiguous patterns (e.g. "name 2") only count when the original exists next to them. */
  readonly needsOriginal: boolean;
}

/** Group 1 of `regex` as the only candidate. */
const captured =
  (regex: RegExp) =>
  (base: string): readonly string[] => {
    const original = regex.exec(base)?.[1];
    return original === undefined ? [] : [original];
  };

/**
 * OneDrive appends the computer name ("-DESKTOP-4F2KQ1", "-MacBook-Air"), which itself may
 * contain dashes, so every dash is a possible split point. Requiring an upper-case letter in the
 * suffix keeps lowercase ids such as "goblin-camp" from matching.
 */
const oneDriveOriginals = (base: string): readonly string[] =>
  [...base.matchAll(/-/g)]
    .map((match) => match.index)
    .filter(
      (index) =>
        index > 0 &&
        /^-[A-Za-z0-9][A-Za-z0-9-]*$/.test(base.slice(index)) &&
        /[A-Z]/.test(base.slice(index)),
    )
    .map((index) => base.slice(0, index))
    .reverse();

const PATTERNS: readonly Pattern[] = [
  {
    provider: "Dropbox",
    originals: captured(/^(.+) \((?:[^()]*'s )?conflicted copy[^()]*\)$/),
    needsOriginal: false,
  },
  {
    provider: "Dropbox",
    originals: captured(/^(.+) \(in Konflikt stehende Kopie[^()]*\)$/),
    needsOriginal: false,
  },
  {
    provider: "Syncthing",
    originals: captured(/^(.+)\.sync-conflict-\d{8}-\d{6}-[A-Z0-9]{7}$/),
    needsOriginal: false,
  },
  { provider: "OneDrive", originals: oneDriveOriginals, needsOriginal: true },
  {
    provider: "Google Drive",
    originals: captured(/^(.+) \(\d+\)$/),
    needsOriginal: true,
  },
  {
    provider: "iCloud",
    originals: captured(/^(.+) \d+$/),
    needsOriginal: true,
  },
];

function splitExtension(name: string): [base: string, extension: string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** The conflict copy `name` is, or `null`. */
function matchCopy(
  name: string,
  existing: ReadonlySet<string>,
): ConflictCopy | null {
  const [base, extension] = splitExtension(name);
  if (extension === ".tmp") return null;
  for (const pattern of PATTERNS) {
    for (const originalBase of pattern.originals(base)) {
      const original = `${originalBase}${extension}`;
      if (pattern.needsOriginal && !existing.has(original)) continue;
      return { copy: name, original, provider: pattern.provider };
    }
  }
  return null;
}

/**
 * Conflict copies among the file names of one directory (ARCHITECTURE §6.3), by name only.
 * Detection only: both versions are kept; merging is a later UI task. OneDrive names can also be
 * real ids (`keller-Ost`), so `listScenes` additionally checks the content of those.
 */
export function findConflictCopies(names: readonly string[]): ConflictCopy[] {
  const existing = new Set(names);
  return names.flatMap((name) => matchCopy(name, existing) ?? []);
}
