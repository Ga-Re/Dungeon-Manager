import { describe, expect, it } from "vitest";
import {
  coarseSpreadOrder,
  ORDER_SIDE,
  sampleOrder,
  spreadMix,
  spreadOrder,
} from "./fog-spread.js";

const FOG = 255;
const OPEN = 0;

/** A mask of `width`×`height` texels, fogged except where `open(x, y)`. */
function mask(
  width: number,
  height: number,
  open: (x: number, y: number) => boolean,
) {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      alpha[y * width + x] = open(x, y) ? OPEN : FOG;
  return alpha;
}

const at = (order: Uint8Array, width: number, x: number, y: number) =>
  order[y * width + x] ?? Number.NaN;

describe("spreadOrder", () => {
  it("spreads a reveal from the revealed area it touches", () => {
    // Columns 0–3 were revealed; the reveal adds columns 4–15.
    const from = mask(16, 8, (x) => x < 4);
    const to = mask(16, 8, () => true);
    const order = spreadOrder(16, 8, from, to);
    expect(at(order, 16, 4, 4)).toBe(0);
    expect(at(order, 16, 15, 4)).toBe(255);
    for (let x = 4; x < 15; x++)
      expect(at(order, 16, x, 4)).toBeLessThan(at(order, 16, x + 1, 4));
  });

  it("clears an isolated reveal from its middle outward", () => {
    const from = mask(17, 17, () => false);
    const to = mask(17, 17, (x, y) => x >= 2 && x <= 14 && y >= 2 && y <= 14);
    const order = spreadOrder(17, 17, from, to);
    expect(at(order, 17, 8, 8)).toBe(0);
    expect(at(order, 17, 2, 8)).toBe(255);
    expect(at(order, 17, 5, 8)).toBeLessThan(at(order, 17, 3, 8));
    // Fog that stays is not part of the spread.
    expect(at(order, 17, 0, 0)).toBe(0);
  });

  it("spreads a hide from the fog side", () => {
    // Columns 0–1 are fogged; the hide covers columns 2–9 as well.
    const from = mask(16, 8, (x) => x >= 2);
    const to = mask(16, 8, (x) => x >= 10);
    const order = spreadOrder(16, 8, from, to);
    expect(at(order, 16, 2, 4)).toBe(0);
    expect(at(order, 16, 9, 4)).toBe(255);
    for (let x = 2; x < 9; x++)
      expect(at(order, 16, x, 4)).toBeLessThan(at(order, 16, x + 1, 4));
  });

  it("closes a hide with no fog next to it from its edge inward", () => {
    const from = mask(17, 17, () => true);
    const to = mask(
      17,
      17,
      (x, y) => !(x >= 4 && x <= 12 && y >= 4 && y <= 12),
    );
    const order = spreadOrder(17, 17, from, to);
    expect(at(order, 17, 4, 8)).toBe(0);
    expect(at(order, 17, 8, 8)).toBe(255);
  });

  it("follows the shape around corners, not straight through the fog", () => {
    // An L: revealed foot at the bottom left; the reveal adds the leg going up and over.
    const from = mask(12, 12, (x, y) => x < 3 && y >= 9);
    const to = mask(12, 12, (x, y) => (x < 3 && y >= 0) || (y < 3 && x < 12));
    const order = spreadOrder(12, 12, from, to);
    // The top right end is farther along the L than the corner.
    expect(at(order, 12, 11, 1)).toBeGreaterThan(at(order, 12, 1, 1));
    expect(at(order, 12, 1, 1)).toBeGreaterThan(at(order, 12, 1, 8));
  });

  it("never spreads from one change into a neighbouring opposite one", () => {
    // Fog | hide (2–5) | reveal (6–17) | open, as a change during a running spread can make.
    const from = mask(20, 6, (x) => (x >= 2 && x <= 5) || x >= 18);
    const to = mask(20, 6, (x) => x >= 6);
    const order = spreadOrder(20, 6, from, to);
    for (let x = 2; x < 5; x++)
      expect(at(order, 20, x, 3)).toBeLessThan(at(order, 20, x + 1, 3));
    for (let x = 17; x > 6; x--)
      expect(at(order, 20, x, 3)).toBeLessThan(at(order, 20, x - 1, 3));
  });

  it("times each separate change on its own, so all finish together", () => {
    const from = mask(30, 9, () => false);
    // A small and a large isolated reveal.
    const to = mask(
      30,
      9,
      (x, y) =>
        (x >= 1 && x <= 5 && y >= 1 && y <= 5) ||
        (x >= 10 && x <= 28 && y >= 0),
    );
    const order = spreadOrder(30, 9, from, to);
    expect(at(order, 30, 1, 3)).toBe(255);
    expect(at(order, 30, 10, 4)).toBe(255);
  });
});

describe("spreadMix", () => {
  const from = Uint8Array.from([255, 255, 0, 100]);
  const to = Uint8Array.from([255, 0, 255, 100]);

  it("starts at the old fog and ends at the new one", () => {
    const order = Uint8Array.from([0, 128, 255, 0]);
    expect([...spreadMix(from, to, order, 0)]).toEqual([...from]);
    expect([...spreadMix(from, to, order, 1)]).toEqual([...to]);
  });

  it("changes early texels first", () => {
    const order = Uint8Array.from([0, 0, 255, 0]);
    const half = spreadMix(from, to, order, 0.5);
    // Texel 1 (early) is revealed by now; texel 2 (late) has not started to hide.
    expect(half[1]).toBe(0);
    expect(half[2]).toBe(0);
  });

  it("keeps fog that is fog before and after at every moment", () => {
    for (const t of [0, 0.1, 0.33, 0.5, 0.77, 0.99, 1])
      for (const step of [0, 77, 255])
        expect(
          spreadMix(from, to, Uint8Array.from([step, 0, 0, 0]), t)[0],
        ).toBe(255);
  });
});

describe("coarseSpreadOrder", () => {
  it("works on a grid at most ORDER_SIDE long, spreading the same way", () => {
    const width = 4 * ORDER_SIDE;
    const height = 8;
    // Revealed on the left quarter; the reveal opens the rest.
    const from = mask(width, height, (x) => x < ORDER_SIDE);
    const to = mask(width, height, () => true);
    const order = coarseSpreadOrder(
      { width, height, data: from },
      { width, height, data: to },
    );
    expect(order.width).toBe(ORDER_SIDE);
    expect(order.height).toBe(2);
    const fine = sampleOrder(order, width, height);
    expect(fine).toHaveLength(width * height);
    expect(at(fine, width, ORDER_SIDE + 10, 4)).toBeLessThan(
      at(fine, width, width - 10, 4),
    );
  });

  it("keeps small masks as they are", () => {
    const from = mask(10, 10, () => false);
    const to = mask(10, 10, (x, y) => x > 2 && x < 8 && y > 2 && y < 8);
    const order = coarseSpreadOrder(
      { width: 10, height: 10, data: from },
      { width: 10, height: 10, data: to },
    );
    expect([...order.data]).toEqual([...spreadOrder(10, 10, from, to)]);
    expect([...sampleOrder(order, 10, 10)]).toEqual([...order.data]);
  });
});
