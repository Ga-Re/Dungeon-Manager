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
import type { FogShape } from "./fog-shapes.js";
import { FogToolbar } from "./FogToolbar.js";
import { SceneBrowser } from "./SceneBrowser.js";
import { SceneTitle } from "./SceneTitle.js";
import { ShellPortal } from "./shell/slots.js";
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

/** One shared empty list, so an unrevealed level does not rebuild the fog on every render. */
const NOTHING_REVEALED: readonly Polygon[] = [];

/** Undo/redo keys, unless the DM is typing in a field (where they edit the text). */
function historyKey(event: KeyboardEvent): "undo" | "redo" | null {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    // Text entry only: on a tool radio button the shortcuts still undo fog edits.
    target.closest(
      'input:not([type="radio"]):not([type="checkbox"]):not([type="button"]), textarea, select, [contenteditable]',
    )
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
  const [shape, setShape] = useState<FogShape>("rectangle");
  const [brushCells, setBrushCells] = useState(1);
  const [mapSize, setMapSize] = useState<Size | null>(null);
  const levelId = scene.map?.levels[0]?.id;
  const revealed =
    (levelId === undefined ? undefined : scene.fog.levels[levelId]?.revealed) ??
    NOTHING_REVEALED;
  const mapPath = scene.map?.asset.path;
  // A new map is measured again; until then "reveal all" has no size to use.
  useEffect(() => {
    setMapSize(null);
  }, [mapPath]);

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
      // While the map changes or the scene is deleted, edits could land after the file moved.
      if (!action || busy) return;
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
      // If fog edits could not be saved, the file lacks them: stop instead of dropping them.
      if (!(await session.flush())) {
        setError(t("fog.unsavedBeforeMapChange"));
        return;
      }
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
      <ShellPortal slot="titleScene">
        <SceneTitle
          name={scene.name}
          busy={busy}
          onClose={onClose}
          canUndo={session.canUndo && !busy}
          canRedo={session.canRedo && !busy}
          onUndo={() => {
            session.undo();
          }}
          onRedo={() => {
            session.redo();
          }}
          saveFailed={session.saveFailed}
          onRetrySave={() => {
            session.retrySave();
          }}
        />
      </ShellPortal>
      <ShellPortal slot="ribbonScene">
        <div className="dm-ribbon-group">
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
              {scene.map
                ? t("campaign.changeMap")
                : t("campaign.chooseSceneMap")}
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
        </div>
      </ShellPortal>
      <ShellPortal slot="notices">
        {notOnTv && <p role="alert">{t("player.notShown")}</p>}
        {error && <p role="alert">{error}</p>}
      </ShellPortal>
      <ShellPortal slot="browser">
        <SceneBrowser scene={scene} revealed={revealed} />
      </ShellPortal>
      {scene.map && (
        <>
          <ShellPortal slot="ribbonFog">
            <FogToolbar
              tool={tool}
              onTool={setTool}
              shape={shape}
              onShape={setShape}
              brushCells={brushCells}
              onBrushCells={setBrushCells}
              disabled={mapSize === null || notOnTv || busy}
              onRevealAll={() => {
                if (mapSize) fogCommand("fog.reveal", rectangle(mapSize));
              }}
              onCoverAll={() => {
                if (mapSize) fogCommand("fog.hide", rectangle(mapSize));
              }}
            />
          </ShellPortal>
          <ShellPortal slot="canvas">
            <MapView
              key={`${scene.map.kind}:${scene.map.asset.path}`}
              path={scene.map.asset.path}
              kind={scene.map.kind}
              label={scene.name}
              fog={revealed}
              tool={busy ? "pan" : tool}
              shape={shape}
              // Brush size is chosen in grid cells (diameter), so it fits the map's scale.
              brushRadius={(brushCells * scene.map.grid.cellSizePx) / 2}
              onArea={(area, kind) => {
                if (!busy)
                  fogCommand(
                    kind === "reveal" ? "fog.reveal" : "fog.hide",
                    area,
                  );
              }}
              onMapSize={setMapSize}
            />
          </ShellPortal>
        </>
      )}
    </div>
  );
}
