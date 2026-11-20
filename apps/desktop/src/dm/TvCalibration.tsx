import { IconButton, Popover } from "@dungeon-manager/ui";
import { Ruler } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MAX_CORRECTION_PERCENT,
  isValidCorrection,
  pixelsPerInch,
  type Calibration,
  type DisplaySize,
} from "../display-calibration.js";

/**
 * "TV kalibrieren …" (T-106a, SPEC 2.2; DM decision 2026-11-20): the DM enters the display's
 * diagonal in inches, checks a square on the TV with a ruler and corrects in percent. Without a
 * calibration the TV shows the whole map.
 */
export function TvCalibration({
  display,
  displayLabel,
  calibration,
  checkSquare,
  onChange,
  onCheckSquare,
}: {
  readonly display: DisplaySize;
  /** Translated name of the display being calibrated (the TV's while the player view runs). */
  readonly displayLabel: string;
  readonly calibration: Calibration | null;
  readonly checkSquare: boolean;
  /** A valid calibration, or `null` to remove it. */
  readonly onChange: (calibration: Calibration | null) => void;
  readonly onCheckSquare: (show: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [diagonal, setDiagonal] = useState(
    calibration ? String(calibration.diagonalInches) : "",
  );
  const [correction, setCorrection] = useState(
    calibration ? String(calibration.correctionPercent) : "0",
  );
  // Commas are what German keyboards type.
  const number = (text: string) => Number(text.replace(",", "."));
  const diagonalValue = number(diagonal);
  const correctionValue = correction.trim() === "" ? 0 : number(correction);
  const diagonalInvalid =
    diagonal.trim() !== "" &&
    !(Number.isFinite(diagonalValue) && diagonalValue > 0);
  const correctionInvalid = !isValidCorrection(correctionValue);
  const change = (nextDiagonal: string, nextCorrection: string) => {
    setDiagonal(nextDiagonal);
    setCorrection(nextCorrection);
    const entered = {
      diagonalInches: number(nextDiagonal),
      correctionPercent:
        nextCorrection.trim() === "" ? 0 : number(nextCorrection),
    };
    // Only a calibration that gives a usable scale is kept and sent (never a frozen TV).
    if (nextDiagonal.trim() !== "" && pixelsPerInch(display, entered) !== null)
      onChange(entered);
  };
  const inchPx = calibration ? pixelsPerInch(display, calibration) : null;
  return (
    <>
      <IconButton
        ref={button}
        showLabel
        icon={<Ruler />}
        label={t("dm.calibration.open")}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
      />
      <Popover
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        anchor={button}
        label={t("dm.calibration.title")}
        align="start"
      >
        <form
          id={id}
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <fieldset>
            <legend>
              {t("dm.calibration.display", { name: displayLabel })}
            </legend>
            <label htmlFor={`${id}-diagonal`}>
              {t("dm.calibration.diagonal")}
            </label>
            <input
              id={`${id}-diagonal`}
              inputMode="decimal"
              value={diagonal}
              aria-invalid={diagonalInvalid || undefined}
              aria-describedby={
                diagonalInvalid ? `${id}-diagonal-error` : undefined
              }
              onChange={(event) => {
                change(event.target.value, correction);
              }}
            />
            {diagonalInvalid && (
              <p id={`${id}-diagonal-error`} role="alert">
                {t("dm.calibration.diagonalInvalid")}
              </p>
            )}
            <label htmlFor={`${id}-correction`}>
              {t("dm.calibration.correction")}
            </label>
            <input
              id={`${id}-correction`}
              inputMode="decimal"
              value={correction}
              aria-invalid={correctionInvalid || undefined}
              aria-describedby={
                correctionInvalid ? `${id}-correction-error` : undefined
              }
              onChange={(event) => {
                change(diagonal, event.target.value);
              }}
            />
            {correctionInvalid && (
              <p id={`${id}-correction-error`} role="alert">
                {t("dm.calibration.correctionInvalid", {
                  max: MAX_CORRECTION_PERCENT,
                })}
              </p>
            )}
            <label>
              <input
                type="checkbox"
                checked={checkSquare}
                disabled={inchPx === null}
                onChange={(event) => {
                  onCheckSquare(event.target.checked);
                }}
              />
              {t("dm.calibration.checkSquare")}
            </label>
          </fieldset>
          <p role="status">
            {inchPx === null
              ? t("dm.calibration.none")
              : t("dm.calibration.current", {
                  pixels: inchPx.toLocaleString(i18n.language, {
                    maximumFractionDigits: 1,
                  }),
                })}
          </p>
          {calibration && (
            <div className="dm-popover-actions">
              <button
                type="button"
                onClick={() => {
                  setDiagonal("");
                  setCorrection("0");
                  onChange(null);
                }}
              >
                {t("dm.calibration.remove")}
              </button>
            </div>
          )}
        </form>
      </Popover>
    </>
  );
}
