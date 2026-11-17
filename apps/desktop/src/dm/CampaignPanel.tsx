import type { Scene } from "@dungeon-manager/schema";
import { createScene, listScenes, loadScene } from "@dungeon-manager/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { NameForm } from "./NameForm.js";
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

  useLibraryChanges(service, `campaigns/${slug}/scenes/`, () => void reload());

  const create = async (sceneName: string) => {
    try {
      const scene = await createScene(service.fs, slug, {
        id: newId(),
        name: sceneName,
      });
      setNotice(t("campaign.sceneCreated", { name: scene.name }));
      await reload();
    } catch (error) {
      setNotice(describeLibraryError(t, error));
    }
  };

  return (
    <section aria-labelledby="campaign-heading">
      <h2 id="campaign-heading">{t("campaign.heading", { name })}</h2>
      {openScene && (
        <div>
          <p>{t("campaign.openScene", { name: openScene.name })}</p>
          <button
            type="button"
            onClick={() => {
              setOpenScene(null);
            }}
          >
            {t("campaign.closeScene")}
          </button>
        </div>
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
      <NameForm
        label={t("campaign.newSceneName")}
        submitLabel={t("campaign.createScene")}
        onSubmit={create}
      />
      <p role="status">{notice}</p>
    </section>
  );
}
