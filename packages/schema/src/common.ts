import { z } from "zod";

// All object schemas are "loose": fields this version does not know are kept on round-trip,
// so a file written by a newer app (or edited by hand) never loses data when an older app saves it.
//
// HIDDEN DATA: because they pass unknown fields through, these schemas must never be used to
// filter data that leaves the host (player window, companions). `projectForViewer` (core) builds
// its output from an explicit allow-list with strict viewer schemas (ARCHITECTURE §5.1).

/**
 * Stable identifier of an entity, unique within its campaign. Restricted to characters that are
 * safe in file names, because storage derives names such as `scenes/<id>.json` from it.
 */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "must be 1–64 letters, digits, '-' or '_'");

/** A grid cell in game coordinates (ARCHITECTURE §5.2); map pixels are a rendering concern. */
export const gridCellSchema = z.looseObject({
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
});

/** A point in map pixels. */
export const pointSchema = z.tuple([z.number(), z.number()]);

/** A closed ring of at least three points in map pixels (first point not repeated at the end). */
export const ringSchema = z.array(pointSchema).min(3);

/**
 * A polygon in map pixels: an outer ring with optional holes, as produced by polygon clipping
 * (e.g. a hidden island inside a revealed room).
 */
export const polygonSchema = z.looseObject({
  outer: ringSchema,
  holes: z.array(ringSchema),
});

// Characters that are invalid or dangerous in file names on Windows, macOS or Linux.
// eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected here
const FORBIDDEN_IN_SEGMENT = /[\u0000-\u001f\u007f<>:"|?*\\]/;

function isSafeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    segment.trim() === segment &&
    !segment.endsWith(".") &&
    !segment.startsWith("~") &&
    !segment.includes("%") &&
    !FORBIDDEN_IN_SEGMENT.test(segment)
  );
}

/**
 * Reference to a file in the library: a relative path from the library root plus a content
 * hash, so moved or renamed files can be re-linked (ARCHITECTURE §6.3).
 *
 * The path check is an allow-list per `/`-separated segment. It is defence in depth only:
 * storage must still resolve the path (including symlinks) and verify it stays inside the
 * library root, and HTTP routes must decode URLs before checking.
 */
export const assetRefSchema = z.looseObject({
  path: z.string().refine((path) => path.split("/").every(isSafeSegment), {
    message: "must be a relative path inside the library with safe segments",
  }),
  hash: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/, "must be sha256:<64 hex digits>"),
});

/** How much players see of an element (SPEC §6). */
export const visibilitySchema = z.enum(["visible", "hidden", "approximate"]);

export type GridCell = z.infer<typeof gridCellSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Ring = z.infer<typeof ringSchema>;
export type Polygon = z.infer<typeof polygonSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
