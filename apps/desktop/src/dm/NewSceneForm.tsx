import type { AssetRef } from "@dungeon-manager/schema";
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";

/**
 * Content of the "Neue Szene" popover: a name and an optional map. Keeps both if creating
 * failed; the field gets focus when the popover opens.
 */
export function NewSceneForm({
  service,
  onCreate,
}: {
  readonly service: LibraryService;
  /** Resolves to whether the scene was created (the popover then closes). */
  readonly onCreate: (name: string, map: AssetRef | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [map, setMap] = useState<AssetRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    field.current?.focus();
  }, []);

  const chooseMap = async () => {
    setBusy(true);
    try {
      const asset = await service.importMap(t("campaign.mapFilter"));
      if (asset) {
        setMap(asset);
        setProblem("");
      }
    } catch (error) {
      setProblem(describeLibraryError(t, error));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === "" || busy) return;
    setBusy(true);
    try {
      await onCreate(name, map);
    } finally {
      setBusy(false);
    }
  };

  return (
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
        <button type="button" disabled={busy} onClick={() => void chooseMap()}>
          {t("campaign.importMap")}
        </button>
        <button type="submit" disabled={busy || name.trim() === ""}>
          {t("campaign.createScene")}
        </button>
      </div>
      {problem && <p role="alert">{problem}</p>}
    </form>
  );
}
