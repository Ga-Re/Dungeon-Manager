import type { AssetRef } from "@dungeon-manager/schema";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { fileName } from "./file-name.js";
import { MapPicker } from "./MapPicker.js";

/**
 * Content of the "Neue Szene" popover: a name and an optional map. Keeps both if creating
 * failed; the field gets focus when the popover opens.
 */
export function NewSceneForm({
  service,
  onCreate,
}: {
  readonly service: LibraryService;
  /** Resolves to `null` once the scene exists (the popover then closes), else why not. */
  readonly onCreate: (
    name: string,
    map: AssetRef | null,
  ) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const field = useRef<HTMLInputElement>(null);
  const mapButton = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [map, setMap] = useState<AssetRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    field.current?.focus();
  }, []);

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === "" || busy) return;
    setBusy(true);
    try {
      setProblem((await onCreate(name, map)) ?? "");
    } finally {
      setBusy(false);
    }
  };

  return (
    // The picker is outside the form: Enter in its search must not create the scene.
    <>
      <form className="dm-new-scene" onSubmit={(event) => void submit(event)}>
        <label htmlFor={inputId}>{t("campaign.newSceneName")}</label>
        <input
          ref={field}
          id={inputId}
          value={name}
          maxLength={200}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <p>
          {map
            ? t("campaign.mapForNewScene", { file: fileName(map.path) })
            : t("campaign.noMapForNewScene")}
        </p>
        <div className="dm-popover-actions">
          <button
            ref={mapButton}
            type="button"
            disabled={busy}
            onClick={() => {
              setPicking(true);
            }}
          >
            {t("campaign.importMap")}
          </button>
          <button type="submit" disabled={busy || name.trim() === ""}>
            {t("campaign.createScene")}
          </button>
        </div>
        {problem && <p role="alert">{problem}</p>}
      </form>
      <MapPicker
        service={service}
        open={picking}
        returnFocus={mapButton}
        onClose={() => {
          setPicking(false);
        }}
        onChoose={(asset) => {
          setMap(asset);
          setProblem("");
          setPicking(false);
        }}
      />
    </>
  );
}
