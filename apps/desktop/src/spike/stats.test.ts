import { describe, expect, test } from "vitest";
import { percentile, summarize } from "./stats.js";

describe("percentile", () => {
  test("uses the nearest rank", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile(sorted, 10)).toBe(1);
  });

  test("is NaN for no data", () => {
    expect(percentile([], 50)).toBeNaN();
  });
});

describe("summarize", () => {
  test("reports percentiles, fps and janks of frame intervals", () => {
    const intervals = [...Array<number>(98).fill(16), 30, 50];

    const stats = summarize(intervals);

    expect(stats).toMatchObject({
      frames: 100,
      p50: 16,
      p95: 16,
      p99: 30,
      max: 50,
      janks: 2,
    });
    expect(stats.averageFps).toBeCloseTo(100_000 / (98 * 16 + 80));
  });
});
