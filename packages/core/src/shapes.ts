import type { Point, Polygon } from "@dungeon-manager/schema";
import { union, type Geom } from "polyclip-ts";

// Shapes the DM draws fog with (SPEC 4), in map pixels. Pure; never call polyclip's setPrecision.

/** Corners of the circle approximation: smooth enough on a 4K TV, cheap for the fog ops. */
const CIRCLE_SEGMENTS = 48;

/** A circle as a regular polygon (all corners on the circle). */
export function circleArea(
  [cx, cy]: readonly [number, number],
  radius: number,
  segments = CIRCLE_SEGMENTS,
): Polygon {
  const outer = Array.from(
    { length: segments },
    (_, index): [number, number] => {
      const angle = (2 * Math.PI * index) / segments;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    },
  );
  return { outer, holes: [] };
}

/** Corners of a capsule's half circles: a brush edge stays smooth at TV size. */
const CAPSULE_HALF_SEGMENTS = 16;

/** The convex hull of the circles of `radius` around a and b: one stroke segment. */
function capsule(
  a: readonly [number, number],
  b: readonly [number, number],
  radius: number,
): [number, number][] {
  const direction = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const ring: [number, number][] = [];
  for (const [centre, start] of [
    [b, direction - Math.PI / 2],
    [a, direction + Math.PI / 2],
  ] as const) {
    for (let step = 0; step <= CAPSULE_HALF_SEGMENTS; step++) {
      const angle = start + (Math.PI * step) / CAPSULE_HALF_SEGMENTS;
      ring.push([
        centre[0] + radius * Math.cos(angle),
        centre[1] + radius * Math.sin(angle),
      ]);
    }
  }
  return ring;
}

/**
 * Distance from p to the segment a–b (not to the infinite line: a stroke that runs back over
 * itself has points beyond the segment's ends, which must not count as "on the line").
 */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas–Peucker: drops points that lie within `tolerance` of the line through their kept
 * neighbours. A capsule covers its whole segment, so fewer points lose no coverage.
 */
function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points];
  const keep = points.map(
    (_, index) => index === 0 || index === points.length - 1,
  );
  const pending: [number, number][] = [[0, points.length - 1]];
  for (let span = pending.pop(); span; span = pending.pop()) {
    const [from, to] = span;
    const a = points[from] ?? [0, 0];
    const b = points[to] ?? [0, 0];
    let farthest = -1;
    let distance = 0;
    for (let index = from + 1; index < to; index++) {
      const d = segmentDistance(points[index] ?? a, a, b);
      if (d > distance) {
        distance = d;
        farthest = index;
      }
    }
    if (distance > tolerance) {
      keep[farthest] = true;
      pending.push([from, farthest], [farthest, to]);
    }
  }
  return points.filter((point, index) => {
    if (!keep[index]) return false;
    const previous = points[index - 1];
    // Repeated points would make zero-length segments.
    return (
      !previous ||
      index === 0 ||
      previous[0] !== point[0] ||
      previous[1] !== point[1]
    );
  });
}

/**
 * The area a brush of `radius` covers along `points` (a pointer stroke), in map pixels: the
 * stroke is simplified (within a quarter radius) and covered with one capsule per segment. A
 * stroke is connected, so the result is one area (with holes where it encloses some) – one fog
 * command, one undo step. Measured on smooth strokes of up to 600 pointer events: ~30 ms on
 * average, under 100 ms at worst in CI-class hardware.
 * @returns `null` for an empty stroke or a non-positive radius
 */
export function strokeArea(
  points: readonly Point[],
  radius: number,
): Polygon | null {
  if (points.length === 0 || !(radius > 0)) return null;
  const kept = simplify(points, radius / 4);
  // polyclip-ts can fail on floating-point noise where arcs cross ("Unable to complete output
  // ring"). Snapping every corner to a grid makes shared and crossing points exact; a coarser
  // grid is the fallback (a thousandth of a map pixel is invisible, a whole one too).
  for (const grid of [1 / 1024, 1 / 16, 1]) {
    try {
      return unite(kept, radius, grid);
    } catch {
      // Try the next, coarser grid.
    }
  }
  return null;
}

function unite(
  points: readonly Point[],
  radius: number,
  grid: number,
): Polygon | null {
  const snap = (
    ring: readonly (readonly [number, number])[],
  ): [number, number][] =>
    ring.map(([x, y]) => [
      Math.round(x / grid) * grid,
      Math.round(y / grid) * grid,
    ]);
  const [single] = points;
  let geoms: Geom[] =
    points.length === 1 && single
      ? [[snap(circleArea(single, radius).outer)]]
      : points.slice(1).map((point, index) => {
          const previous = points[index] ?? point;
          return [snap(capsule(previous, point, radius))];
        });
  // Pairwise, like a tournament: unions stay balanced, which is faster and more robust than
  // adding one part after another to an ever larger area.
  while (geoms.length > 1) {
    const next: Geom[] = [];
    for (let index = 0; index < geoms.length; index += 2) {
      const a = geoms[index];
      const b = geoms[index + 1];
      if (a) next.push(b ? union(a, b) : a);
    }
    geoms = next;
  }
  const [first] = geoms;
  if (!first) return null;
  const [merged] = union(first);
  if (!merged) return null;
  const [outer = [], ...holes] = merged;
  return { outer: open(outer), holes: holes.map(open) };
}

/** polyclip closes rings by repeating the first point; the schema keeps them open. */
function open(ring: [number, number][]): [number, number][] {
  const first = ring[0];
  const last = ring.at(-1);
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : ring;
}
