// Display calibration (T-106a, SPEC 2.2; DM decision 2026-11-20): the DM enters the TV's
// diagonal in inches; with its resolution that gives its pixels per inch, so one grid cell can
// measure exactly one inch on the table. A fine correction in percent fixes what a check square
// measured on the TV shows. Kept per display on this device (screens differ), never in the library.

/** A display as far as its size goes. */
export interface DisplaySize {
  readonly name: string | null;
  /** Physical pixels. */
  readonly width: number;
  readonly height: number;
}

/** What the DM entered for a display. */
export interface Calibration {
  readonly diagonalInches: number;
  /** Positive: cells were too small on the TV, so they grow. */
  readonly correctionPercent: number;
}

const STORAGE_KEY = "dm.displayCalibration";

/** The fine correction stays within ± this many percent: anything beyond is a typing error. */
export const MAX_CORRECTION_PERCENT = 50;

/** Whether a correction can be right. */
export const isValidCorrection = (percent: number) =>
  Number.isFinite(percent) && Math.abs(percent) <= MAX_CORRECTION_PERCENT;
const VERSION = 1;

/** Physical pixels per inch of `display`, or `null` if the numbers cannot be right. */
export function pixelsPerInch(
  display: DisplaySize,
  calibration: Calibration,
): number | null {
  const { diagonalInches, correctionPercent } = calibration;
  const diagonalPixels = Math.hypot(display.width, display.height);
  if (
    !Number.isFinite(diagonalInches) ||
    diagonalInches <= 0 ||
    !isValidCorrection(correctionPercent) ||
    display.width <= 0 ||
    display.height <= 0
  )
    return null;
  const result =
    (diagonalPixels / diagonalInches) * (1 + correctionPercent / 100);
  // Never zero, negative or infinite: the TV refuses such a message and would stop updating.
  return Number.isFinite(result) && result > 0 ? result : null;
}

/**
 * Identifies a display across starts: its name and resolution (the system's ids change when a
 * display is plugged in again).
 */
export function calibrationKey(display: DisplaySize): string {
  return `${display.name ?? ""}|${String(display.width)}x${String(display.height)}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCalibration = (value: unknown): value is Calibration =>
  isRecord(value) &&
  typeof value["diagonalInches"] === "number" &&
  Number.isFinite(value["diagonalInches"]) &&
  value["diagonalInches"] > 0 &&
  typeof value["correctionPercent"] === "number" &&
  isValidCorrection(value["correctionPercent"]);

/** The calibrations on this device, by `calibrationKey`; anything unusable is skipped. */
export function readCalibrations(
  storage: Storage | undefined,
): Record<string, Calibration> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored["version"] !== VERSION) return {};
    const displays = stored["displays"];
    if (!isRecord(displays)) return {};
    return Object.fromEntries(
      Object.entries(displays).filter(([, value]) => isCalibration(value)),
    ) as Record<string, Calibration>;
  } catch {
    return {};
  }
}

/** Stores (or with `null` removes) the calibration of one display; a refusing storage is ignored. */
export function saveCalibration(
  storage: Storage | undefined,
  key: string,
  calibration: Calibration | null,
): void {
  const others = Object.entries(readCalibrations(storage)).filter(
    ([each]) => each !== key,
  );
  const displays = Object.fromEntries(
    calibration ? [...others, [key, calibration]] : others,
  );
  try {
    storage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: VERSION, displays }),
    );
  } catch {
    // Not kept: the TV shows the whole map, as without a calibration.
  }
}

/** The size of one grid cell on the TV (DM, 2026-11-20): 1 inch by default, or in centimetres. */
export interface CellSize {
  readonly value: number;
  readonly unit: "in" | "cm";
}

const CELL_SIZE_KEY = "dm.tvCellSize";
export const DEFAULT_CELL_SIZE: CellSize = { value: 1, unit: "in" };

/** `size` in inches. */
export function cellInches(size: CellSize): number {
  return size.unit === "cm" ? size.value / 2.54 : size.value;
}

/** The cell size set on this device; the default when none (or nothing usable) is stored. */
export function readCellSize(storage: Storage | undefined): CellSize {
  try {
    const raw = storage?.getItem(CELL_SIZE_KEY);
    if (!raw) return DEFAULT_CELL_SIZE;
    const stored: unknown = JSON.parse(raw);
    if (
      isRecord(stored) &&
      typeof stored["value"] === "number" &&
      Number.isFinite(stored["value"]) &&
      stored["value"] > 0 &&
      (stored["unit"] === "in" || stored["unit"] === "cm")
    )
      return { value: stored["value"], unit: stored["unit"] };
    return DEFAULT_CELL_SIZE;
  } catch {
    return DEFAULT_CELL_SIZE;
  }
}

/** Stores the cell size on this device; a refusing storage is ignored. */
export function saveCellSize(
  storage: Storage | undefined,
  size: CellSize,
): void {
  try {
    storage?.setItem(CELL_SIZE_KEY, JSON.stringify(size));
  } catch {
    // Not kept: the size still applies until the window closes.
  }
}
