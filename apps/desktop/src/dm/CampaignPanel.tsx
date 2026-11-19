import type { AssetRef, Polygon, Scene } from "@dungeon-manager/schema";
import {
  ContextMenu,
  IconButton,
  Popover,
  RibbonGroup,
  TreeList,
  type MenuPoint,
  type TreeNode,
} from "@dungeon-manager/ui";
import { BookOpen, FilePlus, ScrollText } from "lucide-react";
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
import { NewSceneForm } from "./NewSceneForm.js";
import { OpenScenePanel } from "./OpenScenePanel.js";
import { sceneContentNodes } from "./scene-tree.js";
import { ShellPortal } from "./shell/slots.js";
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

const CAMPAIGN_NODE = "campaign";
const SCENE_PREFIX = "scene:";
const sceneNode = (id: string) => `${SCENE_PREFIX}${id}`;

/** Where "Neue Szene" was asked for: the ribbon button, or a context menu at a point. */
type NewSceneOrigin =
  | { readonly from: "ribbon" }
  | { readonly from: "context"; readonly at: MenuPoint };

/** An open context menu: its point and the tree item that gets focus back. */
interface ContextRequest {
  readonly at: MenuPoint;
  readonly item: HTMLElement;
}

/**
 * One campaign in the scene browser (DM decision, T-130c): a tree of the campaign, its scenes
 * and the open scene's content. Clicking a scene opens it; "Neue Szene" comes from the ribbon
 * or the context menu of the tree and opens a small popover.
 */
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
  // The open scene as edited (fog, map), for its part of the tree.
  const [live, setLive] = useState<{
    readonly scene: Scene;
    readonly revealed: readonly Polygon[];
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [context, setContext] = useState<ContextRequest | null>(null);
  const [newScene, setNewScene] = useState<NewSceneOrigin | null>(null);
  const newSceneButton = useRef<HTMLButtonElement>(null);
  const contextItem = useRef<HTMLElement | null>(null);
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

  const create = async (sceneName: string, map: AssetRef | null) => {
    try {
      const scene = await createScene(service.fs, slug, {
        id: newId(),
        name: sceneName,
        map:
          // The level id only has to be unique within this scene.
          map && newMap(map, { id: newId(), name: t("campaign.defaultLevel") }),
      });
      setNewScene(null);
      setNotice(t("campaign.sceneCreated", { name: scene.name }));
      setOpenScene(scene);
      await reload();
      return true;
    } catch (error) {
      setNotice(describeLibraryError(t, error));
      return false;
    }
  };

  const open = (id: string) => {
    if (!id.startsWith(SCENE_PREFIX) || state.status !== "ready") return;
    const entry = state.scenes.find(
      (each) => sceneNode(each.id) === id && each.scene,
    );
    // The open scene is being edited: the list's copy may be older (a save still in flight)
    // and would replace the edits and their undo history.
    if (!entry?.scene || openScene?.id === entry.id) return;
    setOpenScene(entry.scene);
  };

  const sceneNodes: TreeNode[] =
    state.status === "ready"
      ? state.scenes.map((entry): TreeNode => {
          const isOpen = openScene?.id === entry.id;
          return {
            id: sceneNode(entry.id),
            label: entry.scene
              ? isOpen && live
                ? live.scene.name
                : entry.scene.name
              : t(`campaign.scene.${entry.problem ?? "invalid"}`, {
                  id: entry.id,
                }),
            icon: <ScrollText />,
            children:
              isOpen && live
                ? sceneContentNodes(t, live.scene, live.revealed)
                : undefined,
          };
        })
      : [];

  const newSceneForm = <NewSceneForm service={service} onCreate={create} />;

  return (
    <>
      <TreeList
        label={t("campaign.scenes")}
        nodes={[
          {
            id: CAMPAIGN_NODE,
            label: name,
            icon: <BookOpen />,
            children: sceneNodes,
          },
        ]}
        selectedId={openScene ? sceneNode(openScene.id) : null}
        onSelect={open}
        onItemContextMenu={(_id, at, item) => {
          setContext({ at, item });
        }}
      />
      {state.status === "loading" && <p>{t("campaign.loading")}</p>}
      {state.status === "error" && (
        <p role="alert">{describeLibraryError(t, state.error)}</p>
      )}
      {state.status === "ready" && state.scenes.length === 0 && (
        <p className="dm-browser-hint">{t("campaign.noScenes")}</p>
      )}
      <ContextMenu
        at={context?.at ?? null}
        label={t("campaign.commands", { name })}
        items={[
          { id: "newScene", label: t("campaign.newScene"), icon: <FilePlus /> },
        ]}
        returnFocus={context?.item}
        onClose={() => {
          setContext(null);
        }}
        onSelect={() => {
          if (!context) return;
          contextItem.current = context.item;
          setNewScene({ from: "context", at: context.at });
        }}
      />
      <Popover
        open={newScene?.from === "context"}
        at={newScene?.from === "context" ? newScene.at : undefined}
        anchor={contextItem}
        label={t("campaign.newScene")}
        onClose={() => {
          setNewScene(null);
        }}
      >
        {newSceneForm}
      </Popover>
      <ShellPortal slot="ribbonScene">
        <RibbonGroup caption={t("shell.groups.create")}>
          <IconButton
            ref={newSceneButton}
            showLabel
            icon={<FilePlus />}
            label={t("campaign.newScene")}
            onClick={() => {
              setNewScene((current) =>
                current?.from === "ribbon" ? null : { from: "ribbon" },
              );
            }}
          />
          <Popover
            open={newScene?.from === "ribbon"}
            anchor={newSceneButton}
            label={t("campaign.newScene")}
            align="start"
            onClose={() => {
              setNewScene(null);
            }}
          >
            {newSceneForm}
          </Popover>
        </RibbonGroup>
      </ShellPortal>
      {openScene && (
        <OpenScenePanel
          key={openScene.id}
          service={service}
          slug={slug}
          scene={openScene}
          newId={newId}
          onSceneChange={(scene, revealed) => {
            setLive({ scene, revealed });
          }}
          onChanged={(scene) => {
            setOpenScene(scene);
            void reload();
          }}
          onDeleted={(scene) => {
            setOpenScene(null);
            setLive(null);
            setNotice(t("campaign.sceneDeleted", { name: scene.name }));
            void reload();
          }}
          onClose={() => {
            setOpenScene(null);
            setLive(null);
          }}
        />
      )}
      <ShellPortal slot="notices">
        <p role="status">{notice}</p>
      </ShellPortal>
    </>
  );
}
