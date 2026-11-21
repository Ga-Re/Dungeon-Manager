import type { TokenSize } from "@dungeon-manager/schema";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

const SIZES: readonly TokenSize[] = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
];

/**
 * A new token's name and size (T-107a). It appears on the free cell nearest the map's middle;
 * until the creature library (T-180) it is a disc with its initials (DM decision, 2026-11-21).
 */
export function NewTokenForm({
  onCreate,
}: {
  /** `false`: it could not be placed (e.g. no free cell); the form keeps what was entered. */
  readonly onCreate: (name: string, size: TokenSize) => boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [size, setSize] = useState<TokenSize>("medium");
  useEffect(() => {
    field.current?.focus();
  }, []);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    if (onCreate(name.trim(), size)) setName("");
  };
  return (
    <form onSubmit={submit}>
      <label htmlFor={`${id}-name`}>{t("token.name")}</label>
      <input
        ref={field}
        id={`${id}-name`}
        value={name}
        maxLength={60}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <label htmlFor={`${id}-size`}>{t("token.size")}</label>
      <select
        id={`${id}-size`}
        value={size}
        onChange={(event) => {
          setSize(event.target.value as TokenSize);
        }}
      >
        {SIZES.map((each) => (
          <option key={each} value={each}>
            {t(`token.sizes.${each}`)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={name.trim() === ""}>
        {t("token.create")}
      </button>
    </form>
  );
}
