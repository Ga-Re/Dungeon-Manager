import type { AssetRef, Scene } from "@dungeon-manager/schema";
import {
  createScene,
  newMap,
  listScenes,
  loadScene,
} from "@dungeon-manager/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";
import { NameForm } from "./NameForm.js";
import { OpenScenePanel } from "./OpenScenePanel.js";
import { useLibraryChanges } from "./useLibraryChanges.js";

interface SceneEntry {
  readonly id: string;
  /** The scene's name, or why it could not be read (`null`). */
  readonly scene: Scene | null;
  readonly problem: "notAvailable" | "invalid" | null;
}

type ScenesState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly scenes: readonly SceneEntry[] }
  | { readonly status: "error"; readonly error: unknown };

async function readScenes(
  service: LibraryService,
  slug: string,
): Promise<SceneEntry[]> {
  const { sceneIds } = await listScenes(service.fs, slug);
  const entries = await Promise.all(
    sceneIds.map(async (id): Promise<SceneEntry> => {
      const result = await loadScene(service.fs, slug, id);
      if (result.status === "ok")
        return { id, scene: result.value, problem: null };
      return {
        id,
        scene: null,
        problem: result.status === "notAvailable" ? "notAvailable" : "invalid",
      };
    }),
  );
  return entries.sort((a, b) =>
    (a.scene?.name ?? a.id).localeCompare(b.scene?.name ?? b.id),
  );
}

/** One campaign: its scenes, creating a scene, opening and closing one. */
export function CampaignPanel({
  service,
  slug,
  name,
  newId,
}: {
  readonly service: LibraryService;
  readonly slug: string;
  readonly name: string;
  readonly newId: () => string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ScenesState>({ status: "loading" });
  const [openScene, setOpenScene] = useState<Scene | null>(null);
  const [notice, setNotice] = useState("");
  const [pendingMap, setPendingMap] = useState<AssetRef | null>(null);
  const [importing, setImporting] = useState(false);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    try {
      const scenes = await readScenes(service, slug);
      if (request === latest.current) setState({ status: "ready", scenes });
    } catch (error) {
      if (request === latest.current) setState({ status: "error", error });
    }
  }, [service, slug]);

  useEffect(() => {
    setOpenScene(null);
    setState({ status: "loading" });
    void reload();
    return () => {
      // Results of this campaign must not land in the next one.
      latest.current++;
    };
  }, [reload]);

  useLibraryChanges(
    service,
    (path) => path.startsWith(`campaigns/${slug}/scenes/`),
    () => void reload(),
  );

  const create = async (sceneName: string) => {
    try {
      const scene = await createScene(service.fs, slug, {
        id: newId(),
        name: sceneName,
        map:
          // The level id only has to be unique within this scene.
          pendingMap &&
          newMap(pendingMap, {
            id: newId(),
            name: t("campaign.defaultLevel"),
          }),
      });
      setPendingMap(null);
      setNotice(t("campaign.sceneCreated", { name: scene.name }));
      await reload();
      return true;
    } catch (error) {
      setNotice(describeLibraryError(t, error));
      return false;
    }
  };

  const importMap = async () => {
    setImporting(true);
    try {
      const asset = await service.importMap(t("campaign.mapFilter"));
      if (asset) {
        setPendingMap(asset);
        setNotice("");
      }
    } catch (error) {
      setNotice(describeLibraryError(t, error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section aria-labelledby="campaign-heading">
      <h3 id="campaign-heading">{t("campaign.heading", { name })}</h3>
      {openScene && (
        <OpenScenePanel
          key={openScene.id}
          service={service}
          slug={slug}
          scene={openScene}
          newId={newId}
          onChanged={(scene) => {
            setOpenScene(scene);
            void reload();
          }}
          onDeleted={(scene) => {
            setOpenScene(null);
            setNotice(t("campaign.sceneDeleted", { name: scene.name }));
            void reload();
          }}
          onClose={() => {
            setOpenScene(null);
          }}
        />
      )}
      {state.status === "loading" && <p>{t("campaign.loading")}</p>}
      {state.status === "error" && (
        <p role="alert">{describeLibraryError(t, state.error)}</p>
      )}
      {state.status === "ready" &&
        (state.scenes.length === 0 ? (
          <p>{t("campaign.noScenes")}</p>
        ) : (
          <ul aria-label={t("campaign.scenes")}>
            {state.scenes.map((entry) => (
              <li key={entry.id}>
                {entry.scene ? (
                  <button
                    type="button"
                    aria-pressed={openScene?.id === entry.id}
                    onClick={() => {
                      // The open scene is being edited: the list's copy may be older (a save
                      // still in flight) and would replace the edits and their undo history.
                      if (openScene?.id === entry.id) return;
                      setOpenScene(entry.scene);
                    }}
                  >
                    {entry.scene.name}
                  </button>
                ) : (
                  t(`campaign.scene.${entry.problem ?? "invalid"}`, {
                    id: entry.id,
                  })
                )}
              </li>
            ))}
          </ul>
        ))}
      <p>
        {pendingMap
          ? t("campaign.mapForNewScene", { file: fileName(pendingMap.path) })
          : t("campaign.noMapForNewScene")}
      </p>
      <button
        type="button"
        disabled={importing}
        onClick={() => void importMap()}
      >
        {t("campaign.importMap")}
      </button>
      <NameForm
        label={t("campaign.newSceneName")}
        submitLabel={t("campaign.createScene")}
        onSubmit={create}
      />
      <p role="status">{notice}</p>
    </section>
  );
}
