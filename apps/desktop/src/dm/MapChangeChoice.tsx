import type { MapReset } from "@dungeon-manager/storage";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const OPTIONS = ["fog", "grid", "tokens"] as const;

/**
 * Asks what should happen to fog, grid and tokens when a scene gets a different map. Nothing is
 * reset unless the DM ticks it: a corrected version of the same map keeps everything.
 */
export function MapChangeChoice({
  file,
  busy,
  onApply,
  onCancel,
}: {
  readonly file: string;
  readonly busy: boolean;
  readonly onApply: (reset: MapReset) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [reset, setReset] = useState<MapReset>({});
  const first = useRef<HTMLInputElement>(null);

  // The choice appears after the file dialog closes; put the keyboard where the decision is.
  useEffect(() => {
    first.current?.focus();
  }, []);

  return (
    <fieldset disabled={busy}>
      <legend>{t("campaign.mapChange.question", { file })}</legend>
      {OPTIONS.map((option, index) => (
        <label key={option}>
          <input
            ref={index === 0 ? first : undefined}
            type="checkbox"
            checked={reset[option] === true}
            onChange={(event) => {
              setReset({ ...reset, [option]: event.target.checked });
            }}
          />
          {t(`campaign.mapChange.${option}`)}
        </label>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          onApply(reset);
        }}
      >
        {t("campaign.mapChange.apply")}
      </button>
      <button type="button" disabled={busy} onClick={onCancel}>
        {t("campaign.cancel")}
      </button>
    </fieldset>
  );
}
