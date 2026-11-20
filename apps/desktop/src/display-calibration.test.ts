import { describe, expect, it } from "vitest";
import {
  DEFAULT_CELL_SIZE,
  calibrationKey,
  cellInches,
  readCellSize,
  saveCellSize,
  pixelsPerInch,
  readCalibrations,
  saveCalibration,
} from "./display-calibration.js";
import { memoryStorage } from "./dm/memory-storage.test-data.js";

// Display calibration (T-106a, SPEC 2.2): the TV's size gives its pixels per inch, so one grid
// cell can measure exactly one inch and physical minis fit.

const tv = { name: "Tisch-TV", width: 3840, height: 2160 };

describe("pixels per inch", () => {
  it("follow from the resolution and the diagonal", () => {
    // A 55″ 4K TV: √(3840² + 2160²) / 55 ≈ 80.1 physical pixels per inch.
    expect(
      pixelsPerInch(tv, { diagonalInches: 55, correctionPercent: 0 }),
    ).toBeCloseTo(80.106, 3);
  });

  it("are adjusted by the fine correction measured on the TV", () => {
    expect(
      pixelsPerInch(tv, { diagonalInches: 55, correctionPercent: 2 }),
    ).toBeCloseTo(80.106 * 1.02, 3);
  });

  it("are unknown for a correction beyond ±50 % (a typing error would freeze the TV)", () => {
    for (const correctionPercent of [-100, -150, 51, Number.NaN])
      expect(
        pixelsPerInch(tv, { diagonalInches: 55, correctionPercent }),
      ).toBeNull();
    expect(
      pixelsPerInch(tv, { diagonalInches: 55, correctionPercent: -50 }),
    ).toBeGreaterThan(0);
  });

  it("are unknown for a diagonal that cannot be right", () => {
    expect(
      pixelsPerInch(tv, { diagonalInches: 0, correctionPercent: 0 }),
    ).toBeNull();
    expect(
      pixelsPerInch(tv, { diagonalInches: -3, correctionPercent: 0 }),
    ).toBeNull();
    expect(
      pixelsPerInch(tv, { diagonalInches: Number.NaN, correctionPercent: 0 }),
    ).toBeNull();
    expect(
      pixelsPerInch(
        { ...tv, width: 0 },
        { diagonalInches: 55, correctionPercent: 0 },
      ),
    ).toBeNull();
  });
});

describe("calibrations on this device", () => {
  it("are kept per display (name and resolution) and survive a restart", () => {
    const storage = memoryStorage();
    saveCalibration(storage, calibrationKey(tv), {
      diagonalInches: 55,
      correctionPercent: -1.5,
    });
    saveCalibration(storage, calibrationKey({ ...tv, name: null }), {
      diagonalInches: 43,
      correctionPercent: 0,
    });
    const read = readCalibrations(storage);
    expect(read[calibrationKey(tv)]).toEqual({
      diagonalInches: 55,
      correctionPercent: -1.5,
    });
    expect(read[calibrationKey({ ...tv, name: null })]?.diagonalInches).toBe(
      43,
    );
    // Removing one leaves the others.
    saveCalibration(storage, calibrationKey(tv), null);
    expect(Object.keys(readCalibrations(storage))).toHaveLength(1);
  });

  it("skip what cannot be used", () => {
    const stored = (value: unknown) =>
      memoryStorage({ "dm.displayCalibration": JSON.stringify(value) });
    expect(
      readCalibrations(memoryStorage({ "dm.displayCalibration": "{" })),
    ).toEqual({});
    expect(readCalibrations(stored({ version: 2, displays: {} }))).toEqual({});
    expect(
      readCalibrations(
        stored({
          version: 1,
          displays: {
            a: { diagonalInches: 55, correctionPercent: 0 },
            b: { diagonalInches: "55" },
            c: { diagonalInches: -1, correctionPercent: 0 },
            d: { diagonalInches: 55, correctionPercent: -100 },
          },
        }),
      ),
    ).toEqual({ a: { diagonalInches: 55, correctionPercent: 0 } });
  });
});

describe("the cell size on the TV", () => {
  it("is one inch by default and may be set in inches or centimetres", () => {
    const storage = memoryStorage();
    expect(readCellSize(storage)).toEqual(DEFAULT_CELL_SIZE);
    expect(cellInches(DEFAULT_CELL_SIZE)).toBe(1);
    saveCellSize(storage, { value: 2.5, unit: "cm" });
    expect(readCellSize(storage)).toEqual({ value: 2.5, unit: "cm" });
    expect(cellInches({ value: 2.54, unit: "cm" })).toBeCloseTo(1);
    expect(cellInches({ value: 1.25, unit: "in" })).toBe(1.25);
  });

  it("falls back to the default for what cannot be used", () => {
    const stored = (value: string) => memoryStorage({ "dm.tvCellSize": value });
    expect(readCellSize(stored("{"))).toEqual(DEFAULT_CELL_SIZE);
    expect(readCellSize(stored('{"value":0,"unit":"in"}'))).toEqual(
      DEFAULT_CELL_SIZE,
    );
    expect(readCellSize(stored('{"value":2,"unit":"mm"}'))).toEqual(
      DEFAULT_CELL_SIZE,
    );
  });
});
