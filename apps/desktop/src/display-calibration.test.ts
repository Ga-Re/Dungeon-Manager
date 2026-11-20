import { describe, expect, it } from "vitest";
import {
  DEFAULT_CELL_SIZE,
  calibrationKey,
  cellInches,
  readCellSize,
  saveCellSize,
  checkSquareSide,
  measuredInchPx,
  readCalibrations,
  saveCalibration,
} from "./display-calibration.js";
import { memoryStorage } from "./dm/memory-storage.test-data.js";

// Display calibration (T-106d, SPEC 2.2): a check square measured on the TV gives its pixels per
// inch, so one grid cell has the set size and physical minis fit.

const tv = { name: "Tisch-TV", width: 3840, height: 2160 };

describe("calibration by measuring a check square (T-106d)", () => {
  it("shows a square of a third of the shorter side", () => {
    expect(checkSquareSide(tv)).toBe(720);
  });

  it("gives the pixels per inch from the measured side, in cm or inches", () => {
    // 720 px measured as 9 inches: 80 px per inch; 22.86 cm is the same 9 inches.
    expect(measuredInchPx(720, { value: 9, unit: "in" })).toBeCloseTo(80);
    expect(measuredInchPx(720, { value: 22.86, unit: "cm" })).toBeCloseTo(80);
  });

  it("refuses a length that cannot be right (it would freeze the TV)", () => {
    expect(measuredInchPx(720, { value: 0, unit: "cm" })).toBeNull();
    expect(measuredInchPx(720, { value: -3, unit: "cm" })).toBeNull();
    expect(measuredInchPx(720, { value: Number.NaN, unit: "in" })).toBeNull();
    // 720 px over 1 mm, or over 10 m: no display has that many or few pixels per inch.
    expect(measuredInchPx(720, { value: 0.1, unit: "cm" })).toBeNull();
    expect(measuredInchPx(720, { value: 1000, unit: "cm" })).toBeNull();
  });
});

describe("calibrations on this device", () => {
  it("are kept per display (name and resolution) and survive a restart", () => {
    const storage = memoryStorage();
    saveCalibration(storage, calibrationKey(tv), { inchPx: 80 });
    saveCalibration(storage, calibrationKey({ ...tv, name: null }), {
      inchPx: 100,
    });
    const read = readCalibrations(storage);
    expect(read[calibrationKey(tv)]).toEqual({ inchPx: 80 });
    expect(read[calibrationKey({ ...tv, name: null })]).toEqual({
      inchPx: 100,
    });
    saveCalibration(storage, calibrationKey(tv), null);
    expect(Object.keys(readCalibrations(storage))).toHaveLength(1);
  });

  it("from before (diagonal and correction) are converted, not lost", () => {
    const storage = memoryStorage({
      "dm.displayCalibration": JSON.stringify({
        version: 1,
        displays: {
          "Tisch-TV|3840x2160": { diagonalInches: 55, correctionPercent: 0 },
          "x|100x100": { diagonalInches: 55, correctionPercent: -100 },
        },
      }),
    });
    const read = readCalibrations(storage);
    expect(read["Tisch-TV|3840x2160"]?.inchPx).toBeCloseTo(80.106, 3);
    expect(read["x|100x100"]).toBeUndefined();
  });

  it("skip what cannot be used", () => {
    const stored = (value: unknown) =>
      memoryStorage({ "dm.displayCalibration": JSON.stringify(value) });
    expect(
      readCalibrations(memoryStorage({ "dm.displayCalibration": "{" })),
    ).toEqual({});
    expect(readCalibrations(stored({ version: 3, displays: {} }))).toEqual({});
    expect(
      readCalibrations(
        stored({
          version: 2,
          displays: {
            a: { inchPx: 80 },
            b: { inchPx: "80" },
            c: { inchPx: 0 },
            d: { inchPx: 1e9 },
          },
        }),
      ),
    ).toEqual({ a: { inchPx: 80 } });
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
