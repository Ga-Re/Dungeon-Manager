import { IconButton, Popover } from "@dungeon-manager/ui";
import { Ruler } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
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
  calibration,
  checkSquare,
  onChange,
  onCheckSquare,
}: {
  readonly display: DisplaySize;
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
  const change = (nextDiagonal: string, nextCorrection: string) => {
    setDiagonal(nextDiagonal);
    setCorrection(nextCorrection);
    const entered = {
      diagonalInches: number(nextDiagonal),
      correctionPercent:
        nextCorrection.trim() === "" ? 0 : number(nextCorrection),
    };
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
        aria-haspopup="dialog"
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
        <label htmlFor={`${id}-diagonal`}>{t("dm.calibration.diagonal")}</label>
        <input
          id={`${id}-diagonal`}
          inputMode="decimal"
          value={diagonal}
          onChange={(event) => {
            change(event.target.value, correction);
          }}
        />
        <label htmlFor={`${id}-correction`}>
          {t("dm.calibration.correction")}
        </label>
        <input
          id={`${id}-correction`}
          inputMode="decimal"
          value={correction}
          onChange={(event) => {
            change(diagonal, event.target.value);
          }}
        />
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
        )}
      </Popover>
    </>
  );
}
