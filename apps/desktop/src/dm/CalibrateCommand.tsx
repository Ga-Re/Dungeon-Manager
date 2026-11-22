import { CALIBRATION_CELLS } from "@dungeon-manager/core";
import type { Grid } from "@dungeon-manager/schema";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { gridOfFields, shownOffset, shownValue } from "./grid-fields.js";
import { ToolCommand } from "./ToolCommand.js";

/** How the DM calibrates on the map (T-177): drag a box over the printed grid, or move it. */
export interface CalibrationChoice {
  readonly mode: "box" | "move";
  readonly cells: number;
}

interface Fields {
  readonly cellSizePx: string;
  readonly offsetXPx: string;
  readonly offsetYPx: string;
}

const fieldsOf = (grid: Grid): Fields => ({
  cellSizePx: shownValue(grid.cellSizePx),
  offsetXPx: shownOffset(grid.offsetXPx, grid.cellSizePx),
  offsetYPx: shownOffset(grid.offsetYPx, grid.cellSizePx),
});

/**
 * "Raster kalibrieren" (T-177, ADR-0020): the command panel of the Map Forge's ribbon tool.
 * The DM drags a box over the printed grid or moves the grid on the map, or types its values;
 * the map shows the result. OK saves it for every scene of the map, Abbrechen discards it.
 */
export function CalibrateCommand({
  stored,
  choice,
  onChoice,
  proposal,
  onTyped,
  busy,
  problem,
  onOk,
  onCancel,
}: {
  /** The map's saved grid: the fields start from it. */
  readonly stored: Grid;
  readonly choice: CalibrationChoice;
  readonly onChoice: (choice: CalibrationChoice) => void;
  /** The last grid calibrated on the map: fills the fields. */
  readonly proposal: { readonly grid: Grid; readonly seq: number } | null;
  /** The grid the fields describe as they are typed; `null` while invalid. */
  readonly onTyped: (grid: Grid | null) => void;
  readonly busy: boolean;
  readonly problem: string;
  /** Saves `grid` (the fields' grid). */
  readonly onOk: (grid: Grid) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [fields, setFields] = useState<Fields>(() =>
    fieldsOf(proposal?.grid ?? stored),
  );
  const [applied, setApplied] = useState(proposal?.seq ?? 0);
  if (proposal && proposal.seq !== applied) {
    setApplied(proposal.seq);
    setFields(fieldsOf(proposal.grid));
  }
  const grid = gridOfFields(fields, stored);
  const changed =
    grid !== null &&
    (grid.cellSizePx !== stored.cellSizePx ||
      grid.offsetXPx !== stored.offsetXPx ||
      grid.offsetYPx !== stored.offsetYPx);

  const field = (key: keyof Fields, min?: number) => (
    <div className="dm-item-info-field">
      <label htmlFor={`${id}-${key}`}>{t(`forge.${key}`)}</label>
      <input
        id={`${id}-${key}`}
        type="number"
        inputMode="decimal"
        step="any"
        min={min}
        value={fields[key]}
        onChange={(event) => {
          const next = { ...fields, [key]: event.target.value };
          setFields(next);
          onTyped(gridOfFields(next, stored));
        }}
      />
    </div>
  );

  return (
    <ToolCommand
      title={t("forge.calibrate")}
      okDisabled={busy || !changed}
      onOk={() => {
        if (grid) onOk(grid);
      }}
      onCancel={onCancel}
    >
      <div
        role="group"
        aria-label={t("forge.calibrationMode")}
        className="dm-forge-calibration"
      >
        {(["box", "move"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={choice.mode === mode}
            onClick={() => {
              onChoice({ ...choice, mode });
            }}
          >
            {t(`forge.calibration.${mode}`)}
          </button>
        ))}
      </div>
      {choice.mode === "box" && (
        <div className="dm-item-info-field">
          <label htmlFor={`${id}-cells`}>{t("forge.calibration.cells")}</label>
          <select
            id={`${id}-cells`}
            value={choice.cells}
            onChange={(event) => {
              onChoice({ ...choice, cells: Number(event.target.value) });
            }}
          >
            {Array.from(
              { length: CALIBRATION_CELLS.max - CALIBRATION_CELLS.min + 1 },
              (_, i) => CALIBRATION_CELLS.min + i,
            ).map((cells) => (
              <option key={cells} value={cells}>
                {t("forge.calibration.cellsValue", { cells })}
              </option>
            ))}
          </select>
        </div>
      )}
      {field("cellSizePx", 1)}
      {field("offsetXPx")}
      {field("offsetYPx")}
      {grid === null && (
        <p className="dm-catalog-notice">{t("forge.invalid")}</p>
      )}
      {problem && <p role="alert">{problem}</p>}
    </ToolCommand>
  );
}
