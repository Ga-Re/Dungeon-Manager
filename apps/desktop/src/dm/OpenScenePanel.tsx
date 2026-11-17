import type { Scene } from "@dungeon-manager/schema";
import { deleteScene, saveScene, withMap } from "@dungeon-manager/storage";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";

/** The open scene: change its map, delete it (to the trash, after confirming) or close it. */
export function OpenScenePanel({
  service,
  slug,
  scene,
  newId,
  onChanged,
  onDeleted,
  onClose,
}: {
  readonly service: LibraryService;
  readonly slug: string;
  readonly scene: Scene;
  readonly newId: () => string;
  readonly onChanged: (scene: Scene) => void;
  readonly onDeleted: (scene: Scene) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(describeLibraryError(t, caught));
    } finally {
      setBusy(false);
    }
  };

  const changeMap = () =>
    run(async () => {
      const asset = await service.importMap(t("campaign.mapFilter"));
      if (!asset) return;
      const changed = withMap(scene, asset, {
        id: newId(),
        name: t("campaign.defaultLevel"),
      });
      await saveScene(service.fs, slug, changed);
      onChanged(changed);
    });

  const remove = () =>
    run(async () => {
      await deleteScene(service.fs, slug, scene.id);
      onDeleted(scene);
    });

  return (
    <div
      role="region"
      aria-label={t("campaign.openScene", { name: scene.name })}
    >
      <p>{t("campaign.openScene", { name: scene.name })}</p>
      <p>
        {scene.map
          ? t("campaign.map", { file: fileName(scene.map.asset.path) })
          : t("campaign.noMap")}
      </p>
      <button type="button" disabled={busy} onClick={() => void changeMap()}>
        {scene.map ? t("campaign.changeMap") : t("campaign.importMap")}
      </button>
      {confirmingDelete ? (
        <div
          role="group"
          aria-label={t("campaign.confirmDelete", { name: scene.name })}
        >
          <p>{t("campaign.confirmDelete", { name: scene.name })}</p>
          <button type="button" disabled={busy} onClick={() => void remove()}>
            {t("campaign.deleteConfirmed")}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(false);
            }}
          >
            {t("campaign.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirmingDelete(true);
          }}
        >
          {t("campaign.deleteScene")}
        </button>
      )}
      <button type="button" onClick={onClose}>
        {t("campaign.closeScene")}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
