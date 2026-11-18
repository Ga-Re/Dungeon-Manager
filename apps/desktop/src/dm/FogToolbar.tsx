import { useTranslation } from "react-i18next";
import type { FogShape } from "./fog-shapes.js";
import type { MapTool } from "./MapView.js";

const TOOLS: readonly MapTool[] = ["pan", "reveal", "hide"];
const SHAPES: readonly FogShape[] = ["rectangle", "circle", "polygon", "brush"];

/**
 * Fog tools for the open scene (SPEC 4): what dragging does, reveal/cover all, undo/redo.
 * A labelled group; Tab moves between the controls.
 */
export function FogToolbar({
  tool,
  onTool,
  shape,
  onShape,
  brushCells,
  onBrushCells,
  disabled,
  onRevealAll,
  onCoverAll,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  readonly tool: MapTool;
  readonly onTool: (tool: MapTool) => void;
  readonly shape: FogShape;
  readonly onShape: (shape: FogShape) => void;
  /** Brush diameter in grid cells. */
  readonly brushCells: number;
  readonly onBrushCells: (cells: number) => void;
  /** No map (or not loaded yet), or the campaign is unreadable: nothing to edit. */
  readonly disabled: boolean;
  readonly onRevealAll: () => void;
  readonly onCoverAll: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("fog.toolbar")} className="fog-toolbar">
      <fieldset disabled={disabled}>
        <legend>{t("fog.tool")}</legend>
        {TOOLS.map((each) => (
          <label key={each}>
            <input
              type="radio"
              name="fog-tool"
              checked={tool === each}
              onChange={() => {
                onTool(each);
              }}
            />
            {t(`fog.tools.${each}`)}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={disabled || tool === "pan"}>
        <legend>{t("fog.shape")}</legend>
        {SHAPES.map((each) => (
          <label key={each}>
            <input
              type="radio"
              name="fog-shape"
              checked={shape === each}
              onChange={() => {
                onShape(each);
              }}
            />
            {t(`fog.shapes.${each}`)}
          </label>
        ))}
      </fieldset>
      {shape === "brush" && (
        <label>
          {t("fog.brushSize", {
            count: brushCells,
            cells: brushCells.toLocaleString(i18n.language),
          })}
          <input
            type="range"
            min={0.5}
            max={6}
            step={0.5}
            value={brushCells}
            disabled={disabled || tool === "pan"}
            onChange={(event) => {
              onBrushCells(Number(event.target.value));
            }}
          />
        </label>
      )}
      <button type="button" disabled={disabled} onClick={onRevealAll}>
        {t("fog.revealAll")}
      </button>
      <button type="button" disabled={disabled} onClick={onCoverAll}>
        {t("fog.coverAll")}
      </button>
      <button type="button" disabled={!canUndo} onClick={onUndo}>
        {t("fog.undo")}
      </button>
      <button type="button" disabled={!canRedo} onClick={onRedo}>
        {t("fog.redo")}
      </button>
    </div>
  );
}
