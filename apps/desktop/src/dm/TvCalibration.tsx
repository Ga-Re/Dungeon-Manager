import { IconButton, Popover } from "@dungeon-manager/ui";
import { Ruler } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  checkSquareSide,
  measuredInchPx,
  type Calibration,
  type DisplaySize,
  type Length,
} from "../display-calibration.js";

/**
 * "TV kalibrieren …" (T-106d, SPEC 2.2; DM decision 2026-11-20): while it is open the TV shows a
 * check square; the DM measures one side with a ruler and enters it, which gives the TV's pixels
 * per inch – the TV then shows one grid cell at the size set in the settings. Without a
 * calibration the TV shows the whole map.
 */
export function TvCalibration({
  display,
  displayLabel,
  running,
  calibration,
  unit,
  onOpenChange,
  onChange,
}: {
  readonly display: DisplaySize;
  /** Translated name of the display being calibrated. */
  readonly displayLabel: string;
  /** The player view runs on `display`, so the check square can show there. */
  readonly running: boolean;
  readonly calibration: Calibration | null;
  /** The unit offered first (the one of the cell size setting). */
  readonly unit: Length["unit"];
  /** The popover opened or closed: the TV shows the check square while it is open. */
  readonly onOpenChange: (open: boolean) => void;
  /** A valid calibration, or `null` to remove it. */
  readonly onChange: (calibration: Calibration | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [measured, setMeasured] = useState("");
  const [measuredUnit, setMeasuredUnit] = useState(unit);
  const [invalid, setInvalid] = useState(false);
  const toggle = (next: boolean) => {
    // Each time anew: the unit of the cell size setting, which may have changed meanwhile.
    if (next) setMeasuredUnit(unit);
    setOpen(next);
    onOpenChange(next);
  };
  const apply = () => {
    // Commas are what German keyboards type.
    const value = Number(measured.replace(",", "."));
    const inchPx = measuredInchPx(checkSquareSide(display), {
      value,
      unit: measuredUnit,
    });
    // Only a length that gives a usable scale is kept and sent (never a frozen TV).
    setInvalid(inchPx === null);
    if (inchPx !== null) onChange({ inchPx });
  };
  const pixels = (inchPx: number) =>
    inchPx.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
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
          toggle(!open);
        }}
      />
      <Popover
        open={open}
        onClose={() => {
          toggle(false);
        }}
        anchor={button}
        label={t("dm.calibration.title")}
        align="start"
      >
        <form
          id={id}
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <fieldset>
            <legend>
              {t("dm.calibration.display", { name: displayLabel })}
            </legend>
            <p className="dm-settings-hint">
              {running
                ? t("dm.calibration.measure")
                : t("dm.calibration.openFirst")}
            </p>
            <label htmlFor={`${id}-measured`}>
              {t("dm.calibration.measured")}
            </label>
            <input
              id={`${id}-measured`}
              inputMode="decimal"
              value={measured}
              disabled={!running}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
              onChange={(event) => {
                setMeasured(event.target.value);
                setInvalid(false);
              }}
            />
            <label htmlFor={`${id}-unit`}>{t("dm.cellSize.unit")}</label>
            <select
              id={`${id}-unit`}
              value={measuredUnit}
              disabled={!running}
              onChange={(event) => {
                setMeasuredUnit(event.target.value === "in" ? "in" : "cm");
              }}
            >
              <option value="cm">{t("dm.cellSize.centimetres")}</option>
              <option value="in">{t("dm.cellSize.inches")}</option>
            </select>
            {invalid && (
              <p id={`${id}-error`} role="alert">
                {t("dm.calibration.measuredInvalid")}
              </p>
            )}
          </fieldset>
          <p role="status">
            {calibration
              ? t("dm.calibration.current", {
                  pixels: pixels(calibration.inchPx),
                })
              : t("dm.calibration.none")}
          </p>
          <div className="dm-popover-actions">
            <button type="submit" disabled={!running || measured.trim() === ""}>
              {t("dm.calibration.apply")}
            </button>
            {calibration && (
              <button
                type="button"
                onClick={() => {
                  setMeasured("");
                  onChange(null);
                }}
              >
                {t("dm.calibration.remove")}
              </button>
            )}
          </div>
        </form>
      </Popover>
    </>
  );
}
