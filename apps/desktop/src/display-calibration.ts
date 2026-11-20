// Display calibration (T-106d, SPEC 2.2; DM decision 2026-11-20): the TV shows a check square of
// a known number of pixels; the DM measures it with a ruler and enters the length, which gives
// the TV's pixels per inch – so one grid cell has the size set in the settings on the table.
// Kept per display on this device (screens differ), never in the library.

/** A display as far as its size goes. */
export interface DisplaySize {
  readonly name: string | null;
  /** Physical pixels. */
  readonly width: number;
  readonly height: number;
}

/** A display's calibration: its physical pixels per inch, measured by the DM (T-106d). */
export interface Calibration {
  readonly inchPx: number;
}

const STORAGE_KEY = "dm.displayCalibration";
/** Version 2 keeps the measured pixels per inch; version 1 kept diagonal and correction. */
const VERSION = 2;

/** Pixels per inch outside this range cannot be a TV or monitor: a measuring or typing error. */
const MIN_INCH_PX = 10;
const MAX_INCH_PX = 2000;

const isUsableInchPx = (inchPx: number) =>
  Number.isFinite(inchPx) && inchPx >= MIN_INCH_PX && inchPx <= MAX_INCH_PX;

/**
 * The check square's side on `display`, in physical pixels (T-106d): a third of the shorter
 * side, large enough to measure precisely with a ruler.
 */
export function checkSquareSide(display: DisplaySize): number {
  return Math.round(Math.min(display.width, display.height) / 3);
}

/** A length the DM measured, in centimetres or inches. */
export interface Length {
  readonly value: number;
  readonly unit: "in" | "cm";
}

/** `length` in inches. */
export const inches = (length: Length) =>
  length.unit === "cm" ? length.value / 2.54 : length.value;

/**
 * The display's pixels per inch from the check square (`sidePx` physical pixels) and the side
 * the DM measured on the TV; `null` if that cannot be right (never sent to the TV, which would
 * refuse the message and stop updating).
 */
export function measuredInchPx(
  sidePx: number,
  measured: Length,
): number | null {
  const measuredInches = inches(measured);
  if (!Number.isFinite(measuredInches) || measuredInches <= 0) return null;
  const inchPx = sidePx / measuredInches;
  return isUsableInchPx(inchPx) ? inchPx : null;
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

/** A version 1 entry (diagonal and correction, T-106a) as pixels per inch, using the key's resolution. */
function fromVersion1(key: string, value: unknown): Calibration | null {
  const size = /\|(\d+)x(\d+)$/.exec(key);
  if (!size || !isRecord(value)) return null;
  const diagonal = value["diagonalInches"];
  const correction = value["correctionPercent"];
  if (typeof diagonal !== "number" || typeof correction !== "number")
    return null;
  if (!(diagonal > 0) || !(Math.abs(correction) <= 50)) return null;
  const inchPx =
    (Math.hypot(Number(size[1]), Number(size[2])) / diagonal) *
    (1 + correction / 100);
  return isUsableInchPx(inchPx) ? { inchPx } : null;
}

/** The calibrations on this device, by `calibrationKey`; anything unusable is skipped. */
export function readCalibrations(
  storage: Storage | undefined,
): Record<string, Calibration> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || !isRecord(stored["displays"])) return {};
    const entries = Object.entries(stored["displays"]);
    if (stored["version"] === 1)
      return Object.fromEntries(
        entries.flatMap(([key, value]) => {
          const calibration = fromVersion1(key, value);
          return calibration ? [[key, calibration]] : [];
        }),
      );
    if (stored["version"] !== VERSION) return {};
    return Object.fromEntries(
      entries.flatMap(([key, value]) =>
        isRecord(value) &&
        typeof value["inchPx"] === "number" &&
        isUsableInchPx(value["inchPx"])
          ? [[key, { inchPx: value["inchPx"] }]]
          : [],
      ),
    );
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
