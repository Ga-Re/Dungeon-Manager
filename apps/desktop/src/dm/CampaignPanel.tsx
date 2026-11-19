import type { AssetRef, Player, Polygon, Scene } from "@dungeon-manager/schema";
import {
  ContextMenu,
  IconButton,
  Popover,
  RibbonGroup,
  TreeList,
  type MenuPoint,
  type TreeNode,
} from "@dungeon-manager/ui";
import {
  BookOpen,
  FilePlus,
  Folder,
  Image as ImageIcon,
  NotebookPen,
  ScrollText,
  Settings2,
  UserRound,
  Users,
} from "lucide-react";
import {
  createScene,
  newMap,
  listScenes,
  loadCampaign,
  loadScene,
} from "@dungeon-manager/storage";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";
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
/** Groups under the campaign (DM decision, T-158); ids never collide with `scene:` ids. */
const GROUP = {
  settings: "group:settings",
  scenes: "group:scenes",
  maps: "group:maps",
  players: "group:players",
  handouts: "group:handouts",
  notes: "group:notes",
} as const;
const SCENE_PREFIX = "scene:";
const sceneNode = (id: string) => `${SCENE_PREFIX}${id}`;

/** Where "Neue Szene" was asked for: the ribbon button, or a context menu at a point. */
type NewSceneOrigin =
  | { readonly from: "ribbon" }
  | { readonly from: "context"; readonly at: MenuPoint };

/** An open context menu: its point, the tree item that gets focus back, and its name. */
interface ContextRequest {
  readonly at: MenuPoint;
  readonly item: HTMLElement;
  readonly name: string;
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
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const newSceneButton = useRef<HTMLButtonElement>(null);
  const contextItem = useRef<HTMLElement | null>(null);
  const latest = useRef(0);
  const ribbonPopoverId = useId();

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

  // The players come from campaign.json; an unreadable file just shows none here (the library
  // list already reports it).
  const latestPlayers = useRef(0);
  const readPlayers = useCallback(async () => {
    // Only the newest read may land: two quick changes can resolve out of order.
    const request = ++latestPlayers.current;
    const result = await loadCampaign(service.fs, slug).catch(() => null);
    if (request === latestPlayers.current)
      setPlayers(result?.status === "ok" ? result.value.players : []);
  }, [service, slug]);
  useEffect(() => {
    void readPlayers();
  }, [readPlayers]);
  useLibraryChanges(
    service,
    (path) => path === `campaigns/${slug}/campaign.json`,
    () => void readPlayers(),
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
      // The popover with the focused form goes away: focus back where it was asked for.
      (newScene?.from === "context"
        ? contextItem.current
        : newSceneButton.current
      )?.focus();
      setNewScene(null);
      setNotice(t("campaign.sceneCreated", { name: scene.name }));
      setOpenScene(scene);
      await reload();
      return null;
    } catch (error) {
      return describeLibraryError(t, error);
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
          // Until the newly opened scene reports itself, `live` is still the previous one.
          const current = isOpen && live?.scene.id === entry.id ? live : null;
          return {
            id: sceneNode(entry.id),
            label: entry.scene
              ? (current?.scene.name ?? entry.scene.name)
              : t(`campaign.scene.${entry.problem ?? "invalid"}`, {
                  id: entry.id,
                }),
            icon: <ScrollText />,
            children: current
              ? sceneContentNodes(t, current.scene, current.revealed)
              : undefined,
          };
        })
      : [];

  // Maps used by this campaign's scenes, the open one as edited.
  const mapPaths = [
    ...new Set(
      state.status === "ready"
        ? state.scenes.flatMap((entry) => {
            const scene =
              live && live.scene.id === entry.id ? live.scene : entry.scene;
            return scene?.map ? [scene.map.asset.path] : [];
          })
        : [],
    ),
  ].sort();

  /** A group that is still empty shows why instead of an empty folder. */
  const group = (
    id: string,
    label: string,
    icon: TreeNode["icon"],
    children: TreeNode[],
    empty?: string,
  ): TreeNode =>
    children.length === 0 && empty !== undefined
      ? { id, label, icon, meta: empty }
      : { id, label, icon, children };

  const campaignTree: TreeNode = {
    id: CAMPAIGN_NODE,
    label: name,
    icon: <BookOpen />,
    children: [
      {
        id: GROUP.settings,
        label: t("shell.tree.settings"),
        icon: <Settings2 />,
      },
      group(
        GROUP.scenes,
        t("shell.tree.scenes"),
        <Folder />,
        sceneNodes,
        state.status === "ready" ? t("shell.tree.noScenes") : undefined,
      ),
      group(
        GROUP.maps,
        t("shell.tree.maps"),
        <Folder />,
        mapPaths.map((path) => ({
          id: `map:${path}`,
          label: fileName(path),
          icon: <ImageIcon />,
          mono: true,
        })),
        t("shell.tree.noMaps"),
      ),
      group(
        GROUP.players,
        t("shell.tree.players"),
        <Users />,
        players.map((player) => ({
          id: `player:${player.id}`,
          label: player.name,
          icon: <UserRound />,
          meta: player.characterName,
        })),
        t("shell.tree.noPlayers"),
      ),
      group(
        GROUP.handouts,
        t("shell.tree.handouts"),
        <Folder />,
        [],
        t("shell.tree.noHandouts"),
      ),
      group(
        GROUP.notes,
        t("shell.tree.notes"),
        <NotebookPen />,
        [],
        t("shell.tree.noNotes"),
      ),
    ],
  };

  const newSceneForm = <NewSceneForm service={service} onCreate={create} />;

  return (
    <>
      <TreeList
        label={t("shell.tree.browserTitle")}
        variant="compact"
        nodes={[campaignTree]}
        selectedId={openScene ? sceneNode(openScene.id) : null}
        onSelect={open}
        onItemContextMenu={(id, at, item) => {
          // Only the campaign and its scenes have commands; the open scene's content not yet.
          if (id === CAMPAIGN_NODE) setContext({ at, item, name });
          else if (id === GROUP.scenes)
            setContext({ at, item, name: t("shell.tree.scenes") });
          else if (id.startsWith(SCENE_PREFIX) && state.status === "ready") {
            const entry = state.scenes.find(
              (each) => sceneNode(each.id) === id,
            );
            if (entry?.scene) setContext({ at, item, name: entry.scene.name });
          }
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
        label={t("campaign.commands", { name: context?.name ?? name })}
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
            aria-expanded={newScene?.from === "ribbon"}
            aria-controls={
              newScene?.from === "ribbon" ? ribbonPopoverId : undefined
            }
            onClick={() => {
              setNewScene((current) =>
                current?.from === "ribbon" ? null : { from: "ribbon" },
              );
            }}
          />
          <Popover
            id={ribbonPopoverId}
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
