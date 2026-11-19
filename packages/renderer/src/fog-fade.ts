// Fog fades (T-136b): pure timing and mixing; the renderer blends the masks on the GPU.

/** Ease-out (cubic): the change shows at once and settles softly. */
export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** How far a fade started at `start` (ms) and lasting `duration` (ms) is at `now`, 0…1. */
export function fadeProgress(
  start: number,
  duration: number,
  now: number,
): number {
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / duration));
}

/**
 * The fog alpha between two masks of the same size, texel by texel, at `t` (0 = `from`,
 * 1 = `to`). Linear, so a texel opaque in both stays opaque at every `t` – unlike two
 * see-through layers on top of each other, which would let the map shimmer through.
 */
export function mixAlpha(
  from: Uint8Array,
  to: Uint8Array,
  t: number,
): Uint8Array {
  const mixed = new Uint8Array(to.length);
  for (let index = 0; index < to.length; index++) {
    const a = from[index] ?? 255;
    const b = to[index] ?? 255;
    mixed[index] = Math.round(a + (b - a) * t);
  }
  return mixed;
}
