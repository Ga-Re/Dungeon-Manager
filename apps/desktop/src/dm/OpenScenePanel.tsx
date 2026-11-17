import type { Size } from "@dungeon-manager/renderer";
import type { AssetRef, Polygon, Scene } from "@dungeon-manager/schema";
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
import { MapView, type MapTool } from "./MapView.js";
import { FogToolbar } from "./FogToolbar.js";
import { useSceneSession } from "./useSceneSession.js";

/** A rectangle polygon in map pixels. */
const rectangle = (size: Size): Polygon => ({
  outer: [
    [0, 0],
    [size.width, 0],
    [size.width, size.height],
    [0, size.height],
  ],
  holes: [],
});

/** Undo/redo keys, unless the DM is typing in a field (where they edit the text). */
function historyKey(event: KeyboardEvent): "undo" | "redo" | null {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, [contenteditable]")
  )
    return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

/**
 * The open scene: its map with fog tools (reveal/hide, undo), changing its map, deleting it (to
 * the trash, after confirming) and closing it. Fog edits are saved and reach the TV at once.
 */
export function OpenScenePanel({
  service,
  slug,
  scene: opened,
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
  const session = useSceneSession(service, slug, opened);
  const { scene, notOnTv } = session;
  const [tool, setTool] = useState<MapTool>("pan");
  const [mapSize, setMapSize] = useState<Size | null>(null);
  const levelId = scene.map?.levels[0]?.id;
  const revealed =
    levelId === undefined ? [] : (scene.fog.levels[levelId]?.revealed ?? []);

  const fogCommand = (type: "fog.reveal" | "fog.hide", area: Polygon) => {
    if (levelId === undefined) return;
    if (type === "fog.reveal") session.run({ type, levelId, area });
    // Memory fog arrives with T-109; until then hiding forgets.
    else session.run({ type, levelId, area, remember: false });
  };

  // Undo/redo from the keyboard anywhere in the DM window while the scene is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = historyKey(event);
      if (!action) return;
      event.preventDefault();
      if (action === "undo") session.undo();
      else session.redo();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });
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
      // Start from the file on disk (after our own pending fog saves): a newer version synced
      // from another device must not be overwritten with the copy loaded when it was opened.
      await session.flush();
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
      // A save still in flight would otherwise bring the file back after it went to the trash.
      await session.flush();
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
      {notOnTv && <p role="alert">{t("player.notShown")}</p>}
      {error && <p role="alert">{error}</p>}
      {session.saveFailed && <p role="alert">{t("fog.saveFailed")}</p>}
      {scene.map && (
        <>
          <FogToolbar
            tool={tool}
            onTool={setTool}
            disabled={mapSize === null || notOnTv}
            onRevealAll={() => {
              if (mapSize) fogCommand("fog.reveal", rectangle(mapSize));
            }}
            onCoverAll={() => {
              if (mapSize) fogCommand("fog.hide", rectangle(mapSize));
            }}
            canUndo={session.canUndo}
            canRedo={session.canRedo}
            onUndo={() => {
              session.undo();
            }}
            onRedo={() => {
              session.redo();
            }}
          />
          <MapView
            key={scene.map.asset.path}
            path={scene.map.asset.path}
            label={scene.name}
            fog={revealed}
            tool={tool}
            onArea={(area, kind) => {
              fogCommand(kind === "reveal" ? "fog.reveal" : "fog.hide", area);
            }}
            onMapSize={setMapSize}
          />
        </>
      )}
    </div>
  );
}
