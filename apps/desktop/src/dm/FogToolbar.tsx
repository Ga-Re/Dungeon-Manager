import { useTranslation } from "react-i18next";
import type { MapTool } from "./MapView.js";

const TOOLS: readonly MapTool[] = ["pan", "reveal", "hide"];

/** Fog tools for the open scene (a labelled group; Tab moves between them) (SPEC 4): what dragging does, reveal/cover all, undo/redo. */
export function FogToolbar({
  tool,
  onTool,
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
  /** No map (or not loaded yet), or the campaign is unreadable: nothing to edit. */
  readonly disabled: boolean;
  readonly onRevealAll: () => void;
  readonly onCoverAll: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}) {
  const { t } = useTranslation();
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
