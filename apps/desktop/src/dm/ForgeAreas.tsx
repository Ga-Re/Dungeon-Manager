import type { AreaShape } from "@dungeon-manager/core";
import type { Area, SidecarLevel } from "@dungeon-manager/schema";
import { IconButton } from "@dungeon-manager/ui";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SHAPE_ICONS } from "./shape-icons.js";
import { ToolCommand } from "./ToolCommand.js";

/** In the fog toolbar's order, with its icons and names (T-260). */
const SHAPES: readonly AreaShape[] = [
  "rectangle",
  "ellipse",
  "polygon",
  "lasso",
];

/** An area's name and whether it is secret, as the command panels edit them. */
export interface AreaFacts {
  readonly name: string;
  readonly secret: boolean;
}

/** Name and secret fields, shared by "Bereich anlegen" and "Bereich bearbeiten". */
function FactsFields({
  facts,
  onFacts,
}: {
  readonly facts: AreaFacts;
  readonly onFacts: (facts: AreaFacts) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <>
      <div className="dm-item-info-field">
        <label htmlFor={`${id}-name`}>{t("forgeAreas.name")}</label>
        <input
          id={`${id}-name`}
          value={facts.name}
          maxLength={200}
          onChange={(event) => {
            onFacts({ ...facts, name: event.target.value });
          }}
        />
      </div>
      <label className="dm-forge-check">
        <input
          type="checkbox"
          checked={facts.secret}
          onChange={(event) => {
            onFacts({ ...facts, secret: event.target.checked });
          }}
        />
        {t("forgeAreas.secret")}
      </label>
    </>
  );
}

/**
 * "Bereich anlegen" (T-254, T-260, ADR-0020): the DM picks the level and a shape and draws the
 * area on the map. Shapes add up – one overlapping or sharing an edge joins the area, one apart
 * from it starts anew (`addToArea`) – until the DM names it and confirms with OK. Corners snap to
 * the grid; Alt draws freely.
 */
export function AddAreaCommand({
  levels,
  levelId,
  onLevel,
  shape,
  onShape,
  drawn,
  facts,
  onFacts,
  busy,
  problem,
  onOk,
  onCancel,
}: {
  readonly levels: readonly SidecarLevel[];
  readonly levelId: string;
  readonly onLevel: (levelId: string) => void;
  readonly shape: AreaShape;
  readonly onShape: (shape: AreaShape) => void;
  /** An area has been drawn on the map, so OK can create it. */
  readonly drawn: boolean;
  readonly facts: AreaFacts;
  readonly onFacts: (facts: AreaFacts) => void;
  readonly busy: boolean;
  readonly problem: string;
  readonly onOk: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <ToolCommand
      title={t("forgeAreas.add")}
      okDisabled={busy || !drawn || facts.name.trim() === ""}
      onOk={onOk}
      onCancel={onCancel}
    >
      {levels.length > 1 && (
        <div className="dm-item-info-field">
          <label htmlFor={`${id}-level`}>{t("forgeAreas.level")}</label>
          <select
            id={`${id}-level`}
            value={levelId}
            onChange={(event) => {
              onLevel(event.target.value);
            }}
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div
        role="group"
        aria-label={t("forgeAreas.draw")}
        className="dm-command-panel-tools"
      >
        {SHAPES.map((each) => (
          <IconButton
            key={each}
            showLabel
            icon={SHAPE_ICONS[each]}
            label={t(`fog.shapes.${each}`)}
            pressed={shape === each}
            onClick={() => {
              onShape(each);
            }}
          />
        ))}
      </div>
      <FactsFields facts={facts} onFacts={onFacts} />
      <p className="dm-catalog-notice">
        {t(drawn ? "forgeAreas.drawMore" : "forgeAreas.drawFirst")}
      </p>
      {problem && <p role="alert">{problem}</p>}
    </ToolCommand>
  );
}

/** "Bereich bearbeiten" (T-254): an area's name and whether it is secret; OK saves both. */
export function EditAreaCommand({
  area,
  busy,
  problem,
  onOk,
  onCancel,
}: {
  readonly area: Area;
  readonly busy: boolean;
  readonly problem: string;
  readonly onOk: (facts: AreaFacts) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [facts, setFacts] = useState<AreaFacts>({
    name: area.name,
    secret: area.secret === true,
  });
  return (
    <ToolCommand
      title={t("forgeAreas.edit")}
      okDisabled={busy || facts.name.trim() === ""}
      onOk={() => {
        onOk({ ...facts, name: facts.name.trim() });
      }}
      onCancel={onCancel}
    >
      <FactsFields facts={facts} onFacts={setFacts} />
      {problem && <p role="alert">{problem}</p>}
    </ToolCommand>
  );
}

/** "Bereich löschen" (T-254): asks first; OK deletes the area for every scene of the map. */
export function DeleteAreaCommand({
  area,
  busy,
  problem,
  onOk,
  onCancel,
}: {
  readonly area: Area;
  readonly busy: boolean;
  readonly problem: string;
  readonly onOk: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ToolCommand
      title={t("forgeAreas.delete")}
      okDisabled={busy}
      onOk={onOk}
      onCancel={onCancel}
    >
      <p>{t("forgeAreas.deleteQuestion", { name: area.name })}</p>
      {problem && <p role="alert">{problem}</p>}
    </ToolCommand>
  );
}
