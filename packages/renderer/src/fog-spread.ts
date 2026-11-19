// Spreading fog changes (T-167): when each texel of a fog change turns over, computed once per
// change (never per frame); the renderer mixes the two masks on the GPU in this order.

/** Fog alpha from which a texel counts as fogged (255 = opaque). */
const FOGGED = 128;
/**
 * Width of the moving front as a share of the whole spread: a texel turns over from when the
 * front reaches it until `FRONT` later, so the edge of the spread is soft.
 */
export const FRONT = 0.2;
// Chamfer steps (3 straight, 4 diagonal ≈ 3·√2): fronts close to round, in integers.
const STRAIGHT = 3;
const DIAGONAL = 4;
const NEIGHBOURS = [
  [-1, 0, STRAIGHT],
  [1, 0, STRAIGHT],
  [0, -1, STRAIGHT],
  [0, 1, STRAIGHT],
  [-1, -1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [1, 1, DIAGONAL],
] as const;

const UNCHANGED = 0;
const REVEAL = 1;
const HIDE = 2;

/**
 * When each texel of the change from `from` to `to` (fog alpha per texel, 255 = opaque) turns
 * over: 0 first … 255 last; 0 for texels that do not change. A change is spread on its own
 * (connected texels changing the same way), over its whole length:
 *
 * - a reveal from the revealed area it touches, else from its middle outward;
 * - a hide from the fog it touches, else from its edge inward.
 *
 * Distances run inside the change, so a spread follows the shape around corners.
 */
export function spreadOrder(
  width: number,
  height: number,
  from: Uint8Array,
  to: Uint8Array,
): Uint8Array {
  const count = width * height;
  const kind = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    const a = from[index] ?? 255;
    const b = to[index] ?? 255;
    kind[index] = b < a ? REVEAL : b > a ? HIDE : UNCHANGED;
  }
  const component = labelComponents(width, height, kind);
  const sourced = new Set<number>();
  const seeds: number[] = [];
  const edges: number[] = [];
  const around = new Int32Array(8);
  const steps = new Int32Array(8);
  for (let index = 0; index < count; index++) {
    const own = kind[index];
    if (own === UNCHANGED) continue;
    let touchesSource = false;
    let onEdge = false;
    const found = neighbours(width, height, index, around, steps);
    // The mask's border is an edge too (a change over the whole map has no other), but never
    // something to spread from.
    if (found < NEIGHBOURS.length) onEdge = true;
    for (let k = 0; k < found; k++) {
      const neighbour = around[k] ?? 0;
      if (kind[neighbour] === own) continue;
      onEdge = true;
      if (kind[neighbour] !== UNCHANGED) continue;
      // An unchanged neighbour that already is what the change becomes: revealed for a
      // reveal, fogged for a hide.
      const fogged = (from[neighbour] ?? 255) >= FOGGED;
      if (fogged === (own === HIDE)) touchesSource = true;
    }
    if (touchesSource) {
      seeds.push(index);
      sourced.add(component[index] ?? 0);
    }
    if (onEdge) edges.push(index);
  }
  // Changes that touch nothing to spread from start at their edge instead (and are reversed
  // below for reveals: middle first).
  for (const index of edges)
    if (!sourced.has(component[index] ?? 0)) seeds.push(index);
  const distance = distances(width, height, component, seeds);
  const longest = new Map<number, number>();
  for (let index = 0; index < count; index++) {
    if (kind[index] === UNCHANGED) continue;
    const label = component[index] ?? 0;
    longest.set(label, Math.max(longest.get(label) ?? 0, distance[index] ?? 0));
  }
  const order = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    if (kind[index] === UNCHANGED) continue;
    const label = component[index] ?? 0;
    const max = longest.get(label) ?? 0;
    // A change with no length (one texel, a one-texel line) turns over at once.
    if (max === 0) continue;
    const share = (distance[index] ?? 0) / max;
    const middleFirst = kind[index] === REVEAL && !sourced.has(label);
    order[index] = Math.round(255 * (middleFirst ? 1 - share : share));
  }
  // Unchanged texels next to a change take its order: the GPU filters the order linearly, and
  // a 0 there would pull the change's edge ahead of its front.
  const padded = order.slice();
  for (let index = 0; index < count; index++) {
    if (kind[index] !== UNCHANGED) continue;
    const found = neighbours(width, height, index, around, steps);
    let nearest = -1;
    for (let k = 0; k < found; k++) {
      const neighbour = around[k] ?? 0;
      if (kind[neighbour] === UNCHANGED) continue;
      const value = order[neighbour] ?? 0;
      if (nearest === -1 || value < nearest) nearest = value;
    }
    if (nearest !== -1) padded[index] = nearest;
  }
  return padded;
}

/** A raster of one value per texel, row by row. */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Longest side of the order grid: the order only sets the timing (the mix keeps fog safe), so a
 * coarse one suffices and stays cheap (about 5 ms at 256², measured in Node).
 */
export const ORDER_SIDE = 256;

/**
 * The spread order of the change from `from` to `to` (same size), on a grid at most
 * `ORDER_SIDE` texels long: each of its texels averages the block of mask texels it covers.
 */
export function coarseSpreadOrder(from: Grid, to: Grid): Grid {
  const factor = Math.max(
    1,
    Math.ceil(Math.max(to.width, to.height) / ORDER_SIDE),
  );
  const coarseFrom = shrink(from, factor);
  const coarseTo = shrink(to, factor);
  return {
    width: coarseTo.width,
    height: coarseTo.height,
    data: spreadOrder(
      coarseTo.width,
      coarseTo.height,
      coarseFrom.data,
      coarseTo.data,
    ),
  };
}

/** `grid` scaled down by `factor`, each texel the rounded mean of its block. */
function shrink(grid: Grid, factor: number): Grid {
  if (factor === 1) return grid;
  const width = Math.ceil(grid.width / factor);
  const height = Math.ceil(grid.height / factor);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (
        let fy = y * factor;
        fy < Math.min(grid.height, (y + 1) * factor);
        fy++
      )
        for (
          let fx = x * factor;
          fx < Math.min(grid.width, (x + 1) * factor);
          fx++
        ) {
          sum += grid.data[fy * grid.width + fx] ?? 255;
          count++;
        }
      data[y * width + x] = Math.round(sum / count);
    }
  return { width, height, data };
}

/** `order` stretched to `width`×`height` (nearest texel), for mixing at the masks' size. */
export function sampleOrder(
  order: Grid,
  width: number,
  height: number,
): Uint8Array {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const oy = Math.min(
      order.height - 1,
      Math.floor((y * order.height) / height),
    );
    for (let x = 0; x < width; x++) {
      const ox = Math.min(
        order.width - 1,
        Math.floor((x * order.width) / width),
      );
      data[y * width + x] = order.data[oy * order.width + ox] ?? 0;
    }
  }
  return data;
}

/**
 * The fog on screen at `t` (0…1) of a spread: per texel a linear mix from `from` to `to` while
 * the front passes it. The renderer's shader does the same on the GPU. Linear, so a texel
 * opaque before and after stays opaque throughout.
 */
export function spreadMix(
  from: Uint8Array,
  to: Uint8Array,
  order: Uint8Array,
  t: number,
): Uint8Array {
  const mixed = new Uint8Array(to.length);
  for (let index = 0; index < to.length; index++) {
    const a = from[index] ?? 255;
    const b = to[index] ?? 255;
    const local = Math.min(
      1,
      Math.max(0, (t * (1 + FRONT) - (order[index] ?? 0) / 255) / FRONT),
    );
    mixed[index] = Math.round(a + (b - a) * local);
  }
  return mixed;
}

/**
 * Neighbour offsets and chamfer steps for texel `index`; texels on the border skip the
 * neighbours outside the mask (returned count).
 */
function neighbours(
  width: number,
  height: number,
  index: number,
  into: Int32Array,
  steps: Int32Array,
): number {
  const x = index % width;
  const y = (index - x) / width;
  let count = 0;
  for (const [dx, dy, step] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    into[count] = ny * width + nx;
    steps[count] = step;
    count++;
  }
  return count;
}

/** Connected texels changing the same way share a label (1, 2, …); unchanged ones have 0. */
function labelComponents(
  width: number,
  height: number,
  kind: Uint8Array,
): Int32Array {
  const label = new Int32Array(width * height);
  const around = new Int32Array(8);
  const steps = new Int32Array(8);
  const stack = new Int32Array(width * height);
  let next = 0;
  for (let start = 0; start < kind.length; start++) {
    if (kind[start] === UNCHANGED || label[start] !== 0) continue;
    label[start] = ++next;
    let top = 0;
    stack[top++] = start;
    while (top > 0) {
      const index = stack[--top] ?? 0;
      const count = neighbours(width, height, index, around, steps);
      for (let k = 0; k < count; k++) {
        const neighbour = around[k] ?? 0;
        if (label[neighbour] !== 0 || kind[neighbour] !== kind[index]) continue;
        label[neighbour] = next;
        stack[top++] = neighbour;
      }
    }
  }
  return label;
}

/**
 * Chamfer distance from the nearest seed, walking only within each seed's own change (a
 * Dijkstra over integer steps with a bucket queue: linear in the changed texels).
 */
function distances(
  width: number,
  height: number,
  component: Int32Array,
  seeds: readonly number[],
): Int32Array {
  const distance = new Int32Array(width * height).fill(-1);
  const around = new Int32Array(8);
  const steps = new Int32Array(8);
  const buckets: number[][] = [[...seeds]];
  for (const seed of seeds) distance[seed] = 0;
  for (let current = 0; current < buckets.length; current++) {
    const bucket = buckets[current] ?? [];
    for (const index of bucket) {
      if (distance[index] !== current) continue;
      const own = component[index];
      const count = neighbours(width, height, index, around, steps);
      for (let k = 0; k < count; k++) {
        const neighbour = around[k] ?? 0;
        // Unchanged texels have label 0, never a change's own label.
        if (component[neighbour] !== own) continue;
        const reached = current + (steps[k] ?? 0);
        const known = distance[neighbour] ?? -1;
        if (known !== -1 && known <= reached) continue;
        distance[neighbour] = reached;
        (buckets[reached] ??= []).push(neighbour);
      }
    }
  }
  return distance;
}
