import type { RoomShape } from "@dungeon-manager/core";
import type { Room, SidecarLevel } from "@dungeon-manager/schema";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

const SHAPES: readonly RoomShape[] = [
  "rectangle",
  "polygon",
  "ellipse",
  "lasso",
];

/**
 * Drawing rooms in the Map Forge (T-108c1): the level they are drawn on and the shape. While a
 * shape is chosen, the map draws a room with it; corners snap to the grid, Alt draws freely.
 */
export function RoomTools({
  levels,
  levelId,
  onLevel,
  shape,
  onShape,
  disabled,
}: {
  readonly levels: readonly SidecarLevel[];
  readonly levelId: string;
  readonly onLevel: (levelId: string) => void;
  readonly shape: RoomShape | null;
  readonly onShape: (shape: RoomShape | null) => void;
  readonly disabled: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="dm-item-info">
      <p className="dm-details-kind">{t("forgeRooms.title")}</p>
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
            disabled={disabled}
            onClick={() => {
              onShape(shape === each ? null : each);
            }}
          >
            {t(`forgeRooms.shapes.${each}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The selected room's name, whether it is secret, and deleting it (T-108c1). Every change is
 * saved in the map's sidecar at once, for every scene of the map.
 */
export function RoomEditor({
  room,
  busy,
  focusName,
  onRename,
  onSecret,
  onDelete,
}: {
  readonly room: Room;
  readonly busy: boolean;
  /** Put the keyboard in the name field (a room just drawn gets its name next). */
  readonly focusName: boolean;
  readonly onRename: (name: string) => void;
  readonly onSecret: (secret: boolean) => void;
  readonly onDelete: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(room.name);
  const [confirming, setConfirming] = useState(false);
  // The keyboard follows the question: to "Behalten" while asking, back after it.
  const keepButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!asked) return;
    (confirming ? keepButton : deleteButton).current?.focus();
  }, [asked, confirming]);
  // Another room, or this one renamed elsewhere: the field shows its name.
  const [shownFor, setShownFor] = useState(`${room.id}:${room.name}`);
  if (shownFor !== `${room.id}:${room.name}`) {
    setShownFor(`${room.id}:${room.name}`);
    setName(room.name);
    setConfirming(false);
  }
  useEffect(() => {
    if (!focusName) return;
    field.current?.focus();
    field.current?.select();
  }, [focusName, room.id]);

  const rename = (event: SyntheticEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    // A room needs a name: an emptied field shows the current one again.
    if (trimmed === "") setName(room.name);
    else if (trimmed !== room.name) onRename(trimmed);
  };

  return (
    <form className="dm-item-info" noValidate onSubmit={rename}>
      <p className="dm-details-heading">
        <span className="dm-details-kind">{t("forgeRooms.kind")}</span>
        {room.name}
      </p>
      <div className="dm-item-info-field">
        <label htmlFor={`${id}-name`}>{t("forgeRooms.name")}</label>
        <input
          ref={field}
          id={`${id}-name`}
          value={name}
          maxLength={200}
          onChange={(event) => {
            setName(event.target.value);
          }}
          onBlur={rename}
        />
      </div>
      <label className="dm-forge-check">
        <input
          type="checkbox"
          checked={room.secret === true}
          disabled={busy}
          onChange={(event) => {
            onSecret(event.target.checked);
          }}
        />
        {t("forgeRooms.secret")}
      </label>
      <div className="dm-item-info-actions">
        {confirming ? (
          <>
            <button
              ref={keepButton}
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t("forgeRooms.keep")}
            </button>
            <button type="button" disabled={busy} onClick={onDelete}>
              {t("forgeRooms.deleteConfirm", { name: room.name })}
            </button>
          </>
        ) : (
          <button
            ref={deleteButton}
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirming(true);
              setAsked(true);
            }}
          >
            {t("forgeRooms.delete")}
          </button>
        )}
      </div>
    </form>
  );
}
