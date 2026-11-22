import { describe, expect, it } from "vitest";
import { LIVING_EDGE_MAX, livingReach, type LivingFog } from "./fog-living.js";

const living = (edge: number, cellSizePx = 100): LivingFog => ({
  quality: "medium",
  cellSizePx,
  edge,
  motion: 1,
});

/** How far the fog may creep into revealed area: the band plus half the warp. */
const reach = (fog: LivingFog) => {
  const { band, warp } = livingReach(fog);
  return band + warp / 2;
};

describe("livingReach", () => {
  it("keeps a one-cell corridor open in its middle at the largest edge wobble", () => {
    expect(reach(living(LIVING_EDGE_MAX))).toBeLessThanOrEqual(45);
    // From both walls together, less than the corridor's width.
    expect(2 * reach(living(LIVING_EDGE_MAX))).toBeLessThan(100);
  });

  it("grows with the edge wobble and clamps out-of-range values", () => {
    expect(reach(living(1.2))).toBeGreaterThan(reach(living(0)));
    expect(reach(living(9))).toBe(reach(living(LIVING_EDGE_MAX)));
    expect(livingReach(living(-1))).toEqual(livingReach(living(0)));
  });

  it("has no warp without edge wobble, only the soft edge's band", () => {
    const { band, warp } = livingReach(living(0));
    expect(warp).toBe(0);
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThanOrEqual(25);
  });

  it("scales with the grid, not the map image", () => {
    expect(reach(living(1.2, 200))).toBeCloseTo(2 * reach(living(1.2, 100)));
  });
});
