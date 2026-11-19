import { describe, expect, it } from "vitest";
import { easeOut, fadeProgress, mixAlpha } from "./fog-fade.js";

describe("fog fades", () => {
  it("eases out: fast at first, settling at the end", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it("runs from 0 to 1 over the duration", () => {
    expect(fadeProgress(1000, 500, 1000)).toBe(0);
    expect(fadeProgress(1000, 500, 1250)).toBe(0.5);
    expect(fadeProgress(1000, 500, 1600)).toBe(1);
    // A zero duration is over at once.
    expect(fadeProgress(1000, 0, 1000)).toBe(1);
  });

  it("mixes two fog masks per texel, so fog in both stays fog throughout", () => {
    const from = Uint8Array.from([255, 255, 0, 0, 100]);
    const to = Uint8Array.from([255, 0, 255, 0, 200]);
    expect([...mixAlpha(from, to, 0)]).toEqual([255, 255, 0, 0, 100]);
    expect([...mixAlpha(from, to, 0.5)]).toEqual([255, 128, 128, 0, 150]);
    expect([...mixAlpha(from, to, 1)]).toEqual([255, 0, 255, 0, 200]);
    for (const t of [0.1, 0.33, 0.77, 0.99])
      expect(mixAlpha(from, to, t)[0]).toBe(255);
  });
});
