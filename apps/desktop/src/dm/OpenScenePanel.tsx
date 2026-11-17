import type { AssetRef, Scene } from "@dungeon-manager/schema";
import {
  deleteScene,
  loadScene,
  saveScene,
  withMap,
  type MapReset,
} from "@dungeon-manager/storage";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";
import { MapChangeChoice } from "./MapChangeChoice.js";
import { MapView } from "./MapView.js";

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
  const [pendingMap, setPendingMap] = useState<AssetRef | null>(null);
  const changeMapButton = useRef<HTMLButtonElement>(null);
  const choosing = useRef(false);

  // After the map question closes, keyboard focus returns to the button that opened it.
  useEffect(() => {
    if (pendingMap === null && choosing.current)
      changeMapButton.current?.focus();
    choosing.current = pendingMap !== null;
  }, [pendingMap]);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  // Keyboard focus follows the confirmation step instead of falling back to the page.
  useEffect(() => {
    if (confirmingDelete) confirmButton.current?.focus();
    else if (asked.current) deleteButton.current?.focus();
    asked.current = confirmingDelete || asked.current;
  }, [confirmingDelete]);

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

  const applyMap = (asset: AssetRef, reset: MapReset) =>
    run(async () => {
      // Start from the file on disk: a newer version synced from another device must not be
      // overwritten with the copy loaded when the scene was opened.
      const current = await loadScene(service.fs, slug, scene.id);
      const changed = withMap(
        current.status === "ok" ? current.value : scene,
        asset,
        { id: newId(), name: t("campaign.defaultLevel") },
        reset,
      );
      await saveScene(service.fs, slug, changed);
      setPendingMap(null);
      onChanged(changed);
    });

  const changeMap = () =>
    run(async () => {
      const asset = await service.importMap(t("campaign.mapFilter"));
      if (!asset) return;
      // Without a map there is nothing to keep or reset.
      if (scene.map) setPendingMap(asset);
      else await applyMap(asset, {});
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
      {pendingMap ? (
        <MapChangeChoice
          file={fileName(pendingMap.path)}
          busy={busy}
          onApply={(reset) => void applyMap(pendingMap, reset)}
          onCancel={() => {
            setPendingMap(null);
          }}
        />
      ) : (
        <button
          ref={changeMapButton}
          type="button"
          disabled={busy}
          onClick={() => void changeMap()}
        >
          {scene.map ? t("campaign.changeMap") : t("campaign.chooseSceneMap")}
        </button>
      )}
      {confirmingDelete ? (
        <div
          role="group"
          aria-label={t("campaign.confirmDelete", { name: scene.name })}
        >
          <p>{t("campaign.confirmDelete", { name: scene.name })}</p>
          <button
            ref={confirmButton}
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
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
          ref={deleteButton}
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirmingDelete(true);
          }}
        >
          {t("campaign.deleteScene")}
        </button>
      )}
      <button type="button" disabled={busy} onClick={onClose}>
        {t("campaign.closeScene")}
      </button>
      {error && <p role="alert">{error}</p>}
      {scene.map && (
        <MapView
          key={scene.map.asset.path}
          path={scene.map.asset.path}
          label={scene.name}
        />
      )}
    </div>
  );
}
