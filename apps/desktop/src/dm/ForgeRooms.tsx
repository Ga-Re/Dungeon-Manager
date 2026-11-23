import type { AreaShape } from "@dungeon-manager/core";
import type { Area, SidecarLevel } from "@dungeon-manager/schema";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToolCommand } from "./ToolCommand.js";

const SHAPES: readonly AreaShape[] = [
  "rectangle",
  "polygon",
  "ellipse",
  "lasso",
];

/** A room's name and whether it is secret, as the command panels edit them. */
export interface RoomFacts {
  readonly name: string;
  readonly secret: boolean;
}

/** Name and secret fields, shared by "Raum anlegen" and "Raum bearbeiten". */
function FactsFields({
  facts,
  onFacts,
}: {
  readonly facts: RoomFacts;
  readonly onFacts: (facts: RoomFacts) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <>
      <div className="dm-item-info-field">
        <label htmlFor={`${id}-name`}>{t("forgeRooms.name")}</label>
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
        {t("forgeRooms.secret")}
      </label>
    </>
  );
}

/**
 * "Raum anlegen" (T-254, ADR-0020): the DM picks the level and a shape and draws the room on
 * the map – again, until it fits – names it and confirms with OK. Corners snap to the grid; Alt
 * draws freely.
 */
export function AddRoomCommand({
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
  /** A room has been drawn on the map, so OK can create it. */
  readonly drawn: boolean;
  readonly facts: RoomFacts;
  readonly onFacts: (facts: RoomFacts) => void;
  readonly busy: boolean;
  readonly problem: string;
  readonly onOk: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <ToolCommand
      title={t("forgeRooms.add")}
      okDisabled={busy || !drawn || facts.name.trim() === ""}
      onOk={onOk}
      onCancel={onCancel}
    >
      {levels.length > 1 && (
        <div className="dm-item-info-field">
          <label htmlFor={`${id}-level`}>{t("forgeRooms.level")}</label>
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
        aria-label={t("forgeRooms.draw")}
        className="dm-forge-calibration"
      >
        {SHAPES.map((each) => (
          <button
            key={each}
            type="button"
            aria-pressed={shape === each}
            onClick={() => {
              onShape(each);
            }}
          >
            {t(`forgeRooms.shapes.${each}`)}
          </button>
        ))}
      </div>
      <FactsFields facts={facts} onFacts={onFacts} />
      {!drawn && (
        <p className="dm-catalog-notice">{t("forgeRooms.drawFirst")}</p>
      )}
      {problem && <p role="alert">{problem}</p>}
    </ToolCommand>
  );
}

/** "Raum bearbeiten" (T-254): a room's name and whether it is secret; OK saves both. */
export function EditRoomCommand({
  room,
  busy,
  problem,
  onOk,
  onCancel,
}: {
  readonly room: Area;
  readonly busy: boolean;
  readonly problem: string;
  readonly onOk: (facts: RoomFacts) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [facts, setFacts] = useState<RoomFacts>({
    name: room.name,
    secret: room.secret === true,
  });
  return (
    <ToolCommand
      title={t("forgeRooms.edit")}
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

/** "Raum löschen" (T-254): asks first; OK deletes the room for every scene of the map. */
export function DeleteRoomCommand({
  room,
  busy,
  problem,
  onOk,
  onCancel,
}: {
  readonly room: Area;
  readonly busy: boolean;
  readonly problem: string;
  readonly onOk: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ToolCommand
      title={t("forgeRooms.delete")}
      okDisabled={busy}
      onOk={onOk}
      onCancel={onCancel}
    >
      <p>{t("forgeRooms.deleteQuestion", { name: room.name })}</p>
      {problem && <p role="alert">{problem}</p>}
    </ToolCommand>
  );
}
