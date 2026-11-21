import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

/** A player's character as the quick entry lists it (T-111d). */
export interface PlayerCharacter {
  readonly playerId: string;
  /** The character's name, else the player's. */
  readonly name: string;
  /** Its initiative if it is in the order already: the field starts with it. */
  readonly initiative?: number | undefined;
}

/** A number typed into a field, or `null` for an empty or unusable one. */
function typedNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * The players' rolls told at the table (T-111d): one field per character, filled one after
 * another by keyboard; Enter takes them all. Empty fields are left out.
 */
export function PlayerRollsForm({
  players,
  onEnter,
}: {
  readonly players: readonly PlayerCharacter[];
  readonly onEnter: (
    rolls: readonly {
      readonly playerId: string;
      readonly initiative: number;
    }[],
  ) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const first = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      players.map((player) => [
        player.playerId,
        player.initiative === undefined ? "" : String(player.initiative),
      ]),
    ),
  );
  useEffect(() => {
    first.current?.focus();
  }, []);
  if (players.length === 0)
    return <p className="dm-settings-hint">{t("initiative.noPlayers")}</p>;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const rolls = players.flatMap((player) => {
      const value = typedNumber(values[player.playerId] ?? "");
      return value === null
        ? []
        : [{ playerId: player.playerId, initiative: value }];
    });
    if (rolls.length > 0) onEnter(rolls);
  };
  return (
    <form className="dm-initiative-form" onSubmit={submit}>
      {players.map((player, index) => (
        <label key={player.playerId} htmlFor={`${id}-${player.playerId}`}>
          {player.name}
          <input
            ref={index === 0 ? first : undefined}
            id={`${id}-${player.playerId}`}
            type="number"
            value={values[player.playerId] ?? ""}
            onChange={(event) => {
              const text = event.target.value;
              setValues((current) => ({ ...current, [player.playerId]: text }));
            }}
          />
        </label>
      ))}
      <p className="dm-settings-hint">{t("initiative.rollsHint")}</p>
      <button type="submit">{t("initiative.enterRolls")}</button>
    </form>
  );
}

/** A free entry without a token (T-111d), e.g. a lair action: its name and initiative. */
export function FreeEntryForm({
  onAdd,
}: {
  readonly onAdd: (name: string, initiative: number) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    field.current?.focus();
  }, []);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const initiative = typedNumber(value);
    if (name.trim() === "" || initiative === null) return;
    onAdd(name.trim(), initiative);
  };
  return (
    <form className="dm-initiative-form" onSubmit={submit}>
      <label htmlFor={`${id}-name`}>
        {t("initiative.entryName")}
        <input
          ref={field}
          id={`${id}-name`}
          value={name}
          maxLength={60}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      <label htmlFor={`${id}-value`}>
        {t("initiative.entryValue")}
        <input
          id={`${id}-value`}
          type="number"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </label>
      <p className="dm-settings-hint">{t("initiative.entryHint")}</p>
      <button type="submit">{t("initiative.addEntry")}</button>
    </form>
  );
}
