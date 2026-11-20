import type { ResolvedMap } from "@dungeon-manager/core";
import type {
  AssetRef,
  Campaign,
  Player,
  Polygon,
  Scene,
  Session,
} from "@dungeon-manager/schema";
import {
  ContextMenu,
  IconButton,
  Popover,
  RibbonGroup,
  TreeList,
  type MenuItem,
  type MenuPoint,
} from "@dungeon-manager/ui";
import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  FilePlus,
  Link2,
  ListMinus,
  ListPlus,
  NotebookPen,
  Pencil,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  createNote,
  createScene,
  createSession,
  deleteSession,
  linkNote,
  loadCampaign,
  loadScene,
  loadSession,
  ownNotePath,
  readNote,
  saveCampaign,
  saveScene,
  saveSession,
  unlinkNote,
  type NoteResult,
} from "@dungeon-manager/storage";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import {
  listCampaignFiles,
  readNotesIndex,
  readScenes,
  readSessions,
  type NotesIndex,
  type SceneEntry,
  type SessionEntry,
} from "./campaign-data.js";
import { buildCampaignTree } from "./campaign-tree.js";
import { sceneHierarchy, scenePlaces, topScenes } from "./scene-hierarchy.js";
import { describeLibraryError } from "./describe-error.js";
import { noteTitle } from "./file-name.js";
import { describeItem } from "./details.js";
import { DetailsPanel } from "./DetailsPanel.js";
import { NewSceneForm } from "./NewSceneForm.js";
import { NoteView } from "./NoteView.js";
import { OpenScenePanel } from "./OpenScenePanel.js";
import { SceneTabs } from "./SceneTitle.js";
import {
  NO_SCENE_TABS,
  closeSceneTabs,
  openSceneTab,
  replaceSceneTab,
  selectSceneTab,
  sendSceneTabToTv,
  restoreSceneTabs,
  type RememberedSceneTabs,
  type SceneTabsState,
} from "./scene-tabs.js";
import { addScene, moveScene, removeScene } from "./session-ops.js";
import {
  AddToSessionForm,
  ConfirmForm,
  LinkNoteForm,
  SessionForm,
} from "./SessionForms.js";
import { ShellPortal } from "./shell/slots.js";
import {
  GROUP,
  noteNodeId,
  parseTreeId,
  sceneNodeId,
  sessionNodeId,
  type NoteOwnerRef,
  type SceneSlot,
} from "./tree-ids.js";
import { useLibraryChanges } from "./useLibraryChanges.js";

type Loaded<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly items: readonly T[] }
  | { readonly status: "error"; readonly error: unknown };

/** Reads a list of the campaign's documents; only the newest read lands, and it re-reads when
 * files under `folder` change. */
function useCampaignList<T>(
  service: LibraryService,
  folder: string,
  read: () => Promise<T[]>,
) {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const request = ++latest.current;
    try {
      const items = await read();
      if (request === latest.current) setState({ status: "ready", items });
    } catch (error) {
      if (request === latest.current) setState({ status: "error", error });
    }
  }, [read]);
  useEffect(() => {
    setState({ status: "loading" });
    void reload();
    return () => {
      // Results of this campaign must not land in the next one.
      latest.current++;
    };
  }, [reload]);
  useLibraryChanges(
    service,
    (path) => path.startsWith(folder),
    () => void reload(),
  );
  return [state, reload] as const;
}

/** Where a command was asked for: a ribbon button, or a context menu at a point. */
type Origin =
  | { readonly from: "ribbonScene" }
  | { readonly from: "ribbonSession" }
  | { readonly from: "context"; readonly at: MenuPoint };

/** The small popover a command opens (T-130c, T-160b). */
type Dialog =
  | {
      readonly kind: "newScene";
      readonly origin: Origin;
      /** Add the new scene to this session. */
      readonly sessionId?: string;
      /** Make it a sub-scene of this scene (T-152), shown under it at `slot`. */
      readonly parent?: { readonly sceneId: string; readonly slot: SceneSlot };
    }
  | { readonly kind: "newSession"; readonly origin: Origin }
  | {
      readonly kind: "editSession" | "deleteSession";
      readonly origin: Origin;
      readonly sessionId: string;
    }
  | {
      readonly kind: "addToSession";
      readonly origin: Origin;
      readonly sceneId: string;
    }
  | {
      readonly kind: "linkNote";
      readonly origin: Origin;
      readonly owner: NoteOwnerRef;
    };

/** An open context menu: its point, the tree item it belongs to and its name. */
interface ContextRequest {
  readonly at: MenuPoint;
  readonly item: HTMLElement;
  readonly treeId: string;
  readonly name: string;
}

/**
 * One campaign in the scene browser (T-130c, T-158, T-160b): the campaign tree with its
 * sessions and scenes, the open scene, the details panel, and the commands for scenes and
 * sessions (ribbon "Neu" and the tree's context menu, each opening a small popover).
 */
export function CampaignPanel({
  service,
  slug,
  name,
  newId,
  initialTabs = null,
  onTabsChange,
  onSceneOpen,
}: {
  readonly service: LibraryService;
  readonly slug: string;
  readonly name: string;
  readonly newId: () => string;
  /** Scene tabs to open once the campaign's lists are read (the last ones, T-153, T-114a). */
  readonly initialTabs?: RememberedSceneTabs | null;
  /** Told about the open tabs after each change, to open them again on the next start. */
  readonly onTabsChange?: (tabs: {
    readonly open: readonly string[];
    readonly active: string | null;
    /** On the TV; `null` while it is dark, so a dark TV is not lit by the next start. */
    readonly tv: string | null;
  }) => void;
  /** Told about each scene that goes on the TV, e.g. to reopen it on the next start. */
  readonly onSceneOpen?: (scene: { id: string; name: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const readSceneList = useCallback(
    () => readScenes(service, slug),
    [service, slug],
  );
  const readSessionList = useCallback(
    () => readSessions(service, slug),
    [service, slug],
  );
  const [scenesState, reloadScenes] = useCampaignList<SceneEntry>(
    service,
    `campaigns/${slug}/scenes/`,
    readSceneList,
  );
  const [sessionsState, reloadSessions] = useCampaignList<SessionEntry>(
    service,
    `campaigns/${slug}/sessions/`,
    readSessionList,
  );
  const scenes = scenesState.status === "ready" ? scenesState.items : null;
  const sessions =
    sessionsState.status === "ready" ? sessionsState.items : null;

  // The open scenes, as tabs in the title bar (T-223a), the shown one and the one on the TV.
  // Switching tabs never changes the TV (DM decision, 2026-11-20): only "Szene auf den TV" does,
  // or opening a scene while none is on it.
  const [tabs, setTabs] = useState<SceneTabsState>(NO_SCENE_TABS);
  const { open: openScenes, active: activeSceneId, tv: tvSceneId } = tabs;
  // Each open scene's save state, for its tab's dot (T-223b).
  const [saveStates, setSaveStates] = useState<
    Readonly<Record<string, { saving: boolean; saveFailed: boolean }>>
  >({});
  // Where keyboard focus goes once the tab bar shows again (it moves with the shown scene).
  const [tabFocus, setTabFocus] = useState<string | null>(null);
  const openScene =
    openScenes.find((each) => each.id === activeSceneId) ?? null;
  const isOpen = (sceneId: string) =>
    openScenes.some((each) => each.id === sceneId);
  /** Opens `scene` as a tab, or shows its tab if it is open (keeping its edits and history). */
  const showScene = (scene: Scene) => {
    setTabs((current) => openSceneTab(current, scene));
  };
  // Closing the tab that had focus: the keyboard goes on to the tab shown next.
  const focusShownTab = useRef(false);
  /** Takes tabs away; a neighbour shows, and the TV goes dark if its scene went. */
  const closeScenes = (sceneIds: readonly string[]) => {
    if (activeSceneId !== null && !sceneIds.includes(activeSceneId))
      // The shown tab stays: the keyboard goes to it (the closed tab's ✕ is gone).
      setTabFocus(activeSceneId);
    else focusShownTab.current = true;
    setTabs((current) => closeSceneTabs(current, sceneIds));
    setSaveStates((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => !sceneIds.includes(id)),
      ),
    );
  };
  useEffect(() => {
    // The tree shows the shown scene's live state; another one's is stale.
    setLive((current) =>
      current && current.scene.id !== activeSceneId ? null : current,
    );
    if (focusShownTab.current) {
      focusShownTab.current = false;
      setTabFocus(activeSceneId);
    }
  }, [activeSceneId]);
  // Where the open scene was opened in the tree (it may appear in several places).
  const [openAt, setOpenAt] = useState<string | null>(null);
  // The open scene as edited (fog, map), for its part of the tree.
  const [live, setLive] = useState<{
    readonly scene: Scene;
    readonly map: ResolvedMap | null;
    readonly revealed: readonly Polygon[];
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [context, setContext] = useState<ContextRequest | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [campaignFile, setCampaignFile] = useState<Campaign | null>(null);
  // Which fixed notes exist (T-161b); re-read when the notes folder changes.
  const [notesIndex, setNotesIndex] = useState<NotesIndex | null>(null);
  const latestNotes = useRef(0);
  const reloadNotes = useCallback(async () => {
    const request = ++latestNotes.current;
    const index = await readNotesIndex(service, slug).catch(
      (error: unknown) => {
        console.error("The notes folder cannot be listed.", error);
        return null;
      },
    );
    if (request === latestNotes.current) setNotesIndex(index);
  }, [service, slug]);
  useEffect(() => {
    void reloadNotes();
  }, [reloadNotes]);
  useLibraryChanges(
    service,
    (path) => path.startsWith(`campaigns/${slug}/notes/`),
    () => void reloadNotes(),
  );
  const players: readonly Player[] = campaignFile?.players ?? [];
  // What the details panel shows: a tree item id (T-159).
  const [inspected, setInspected] = useState<string | null>(null);
  const newSceneButton = useRef<HTMLButtonElement>(null);
  const newSessionButton = useRef<HTMLButtonElement>(null);
  const contextItem = useRef<HTMLElement | null>(null);
  const ribbonSceneId = useId();
  const ribbonSessionId = useId();

  // The players come from campaign.json; an unreadable file just shows none here (the library
  // list already reports it).
  const latestCampaign = useRef(0);
  const readCampaign = useCallback(async () => {
    const request = ++latestCampaign.current;
    const result = await loadCampaign(service.fs, slug).catch(() => null);
    if (request === latestCampaign.current)
      setCampaignFile(result?.status === "ok" ? result.value : null);
  }, [service, slug]);
  useEffect(() => {
    void readCampaign();
  }, [readCampaign]);
  useLibraryChanges(
    service,
    (path) => path === `campaigns/${slug}/campaign.json`,
    () => void readCampaign(),
  );

  // The inspected note's text, read as it is (T-161b); re-read when that file changes.
  const inspectedNote = (() => {
    const item = inspected ? parseTreeId(inspected) : null;
    return item?.kind === "note" ? item.path : null;
  })();
  const [noteText, setNoteText] = useState<{
    readonly path: string;
    readonly result: NoteResult;
  } | null>(null);
  const latestNoteText = useRef(0);
  const readInspectedNote = useCallback(async () => {
    const request = ++latestNoteText.current;
    if (!inspectedNote) {
      setNoteText(null);
      return;
    }
    const result = await readNote(service.fs, slug, inspectedNote);
    if (request === latestNoteText.current)
      setNoteText({ path: inspectedNote, result });
  }, [service, slug, inspectedNote]);
  useEffect(() => {
    void readInspectedNote();
  }, [readInspectedNote]);
  useLibraryChanges(
    service,
    // Sync clients and macOS may report decomposed umlauts; links are stored in NFC.
    (path) =>
      inspectedNote !== null &&
      path.normalize("NFC") ===
        `campaigns/${slug}/${inspectedNote}`.normalize("NFC"),
    () => void readInspectedNote(),
  );
  // The campaign's files, to find Obsidian targets by name (T-163); read while a note is
  // shown, again when files are added or removed (scene and session saves do not count).
  const [campaignFiles, setCampaignFiles] = useState<readonly string[]>([]);
  const latestFiles = useRef(0);
  const readFiles = useCallback(async () => {
    const request = ++latestFiles.current;
    const files = await listCampaignFiles(service, slug).catch(() => []);
    if (request === latestFiles.current) setCampaignFiles(files);
  }, [service, slug]);
  const showsNote = inspectedNote !== null;
  useEffect(() => {
    if (showsNote) void readFiles();
  }, [showsNote, readFiles]);
  useLibraryChanges(
    service,
    (path) =>
      showsNote &&
      path.startsWith(`campaigns/${slug}/`) &&
      !path.endsWith(".json"),
    () => void readFiles(),
  );

  /** A note's details: its rendered text, or why it cannot be shown. */
  const noteContent = (
    path: string,
  ): { body?: string; content?: ReactNode } => {
    if (noteText?.path !== path) return { body: t("campaign.noteLoading") };
    const result = noteText.result;
    if (result.status !== "ok")
      return { body: t(`campaign.noteStatus.${result.status}`) };
    return {
      content: (
        <NoteView
          text={result.text}
          notePath={path}
          slug={slug}
          service={service}
          files={campaignFiles}
          onOpenNote={(target) => {
            setInspected(noteNodeId({ kind: "campaign" }, target));
          }}
        />
      ),
    };
  };

  const hierarchy = sceneHierarchy(scenes ?? []);
  /** The tree places of a scene: its sessions, "Ohne Session", or under its parent (T-152). */
  const placesOf = (sceneId: string): string[] =>
    scenePlaces(hierarchy, scenes ?? [], sessions ?? [], sceneId).map((slot) =>
      sceneNodeId(slot, sceneId),
    );
  const openNodeId = (() => {
    if (!openScene) return null;
    const places = placesOf(openScene.id);
    return openAt && places.includes(openAt) ? openAt : (places[0] ?? null);
  })();

  // Maps used by this campaign's scenes, the open one as edited.
  const mapPaths = [
    ...new Set(
      (scenes ?? []).flatMap((entry) => {
        const scene = live?.scene.id === entry.id ? live.scene : entry.scene;
        return scene?.map ? [scene.map.asset.path] : [];
      }),
    ),
  ].sort();

  // A selected scene that moved (removed from or added to a session) is shown at a place it
  // still has.
  const selectedNodeId = (() => {
    if (!inspected) return openNodeId;
    const item = parseTreeId(inspected);
    if (item.kind !== "scene") return inspected;
    const places = placesOf(item.sceneId);
    return places.includes(inspected) ? inspected : (places[0] ?? null);
  })();

  const campaignTree = buildCampaignTree(t, {
    name,
    scenes,
    sessions,
    players,
    mapPaths,
    open:
      openScene && live?.scene.id === openScene.id && openNodeId
        ? { ...live, nodeId: openNodeId }
        : null,
    language: i18n.language,
    notes: { index: notesIndex, campaignLinks: campaignFile?.notes ?? [] },
  });

  const sessionById = (id: string): Session | null =>
    (sessions ?? []).find((entry) => entry.id === id)?.session ?? null;

  /** Saves a changed session and re-reads the list. @returns why it failed, or `null` */
  const changeSession = async (
    sessionId: string,
    change: (session: Session) => Session,
  ): Promise<string | null> => {
    // From the file, not the list in memory: another device (or a quick second command) may
    // have changed it since the last read, and saving would undo that.
    const loaded = await loadSession(service.fs, slug, sessionId).catch(
      () => null,
    );
    if (loaded?.status !== "ok")
      return t(
        loaded?.status === "notAvailable"
          ? "shell.tree.session.notAvailable"
          : "shell.tree.session.invalid",
        { id: sessionId },
      );
    const session = loaded.value;
    try {
      const changed = change(session);
      if (changed !== session) await saveSession(service.fs, slug, changed);
      await reloadSessions();
      return null;
    } catch (error) {
      return describeLibraryError(t, error);
    }
  };

  /** Closes the popover, with focus back where the command came from. */
  const closeDialog = (origin: Origin | undefined) => {
    (origin?.from === "context"
      ? contextItem.current
      : origin?.from === "ribbonSession"
        ? newSessionButton.current
        : newSceneButton.current
    )?.focus();
    setDialog(null);
  };

  const create = async (sceneName: string, map: AssetRef | null) => {
    const target = dialog?.kind === "newScene" ? dialog.sessionId : undefined;
    const parent = dialog?.kind === "newScene" ? dialog.parent : undefined;
    try {
      const scene = await createScene(service.fs, slug, {
        id: newId(),
        name: sceneName,
        parentSceneId: parent?.sceneId,
        // A map without data of its own starts with this level (ADR-0012).
        map: map && { asset: map, levelName: t("campaign.defaultLevel") },
      });
      const problem = target
        ? await changeSession(target, (session) => addScene(session, scene.id))
        : null;
      closeDialog(dialog?.origin);
      // The scene exists either way; say so, and why it is not in the session if that failed.
      setNotice(
        problem
          ? t("campaign.sceneCreatedNotAdded", { name: scene.name, problem })
          : t("campaign.sceneCreated", { name: scene.name }),
      );
      // A sub-scene shows under its parent, where the DM created it.
      const place = sceneNodeId(
        parent
          ? parent.slot
          : target && !problem
            ? { sessionId: target }
            : "unsorted",
        scene.id,
      );
      showScene(scene);
      setOpenAt(place);
      // The new scene is what the DM works on now: select it in the tree and the details.
      setInspected(place);
      await reloadScenes();
      return null;
    } catch (error) {
      return describeLibraryError(t, error);
    }
  };

  const createNewSession = async (
    sessionName: string,
    date: string | undefined,
  ) => {
    try {
      const session = await createSession(service.fs, slug, {
        id: newId(),
        name: sessionName,
        ...(date ? { date } : {}),
      });
      closeDialog(dialog?.origin);
      setNotice(t("campaign.sessionCreated", { name: session.name }));
      setInspected(sessionNodeId(session.id));
      await reloadSessions();
      return null;
    } catch (error) {
      return describeLibraryError(t, error);
    }
  };

  const open = (treeId: string) => {
    const item = parseTreeId(treeId);
    if (item.kind !== "scene") return;
    const entry = (scenes ?? []).find((each) => each.id === item.sceneId);
    if (!entry?.scene) return;
    setOpenAt(treeId);
    // An open scene is being edited: the list's copy may be older (a save still in flight)
    // and would replace the edits and their undo history, so its tab just shows.
    showScene(openScenes.find((each) => each.id === entry.id) ?? entry.scene);
  };

  // The last tabs open once, when the scenes are read and the sessions are read or failed (a
  // scene then goes under "Ohne Session"); a scene that is gone is skipped (T-114a).
  const pendingTabs = useRef(initialTabs);
  const sessionsSettled = sessionsState.status !== "loading";
  useEffect(() => {
    const remembered = pendingTabs.current;
    if (!remembered || !scenes || !sessionsSettled) return;
    pendingTabs.current = null;
    const readable = scenes.flatMap((each) => (each.scene ? [each.scene] : []));
    // Merged into what is open already (the DM may have opened a scene meanwhile).
    setTabs((current) => restoreSceneTabs(current, readable, remembered));
    const sceneId = remembered.active ?? remembered.open.at(-1) ?? null;
    if (sceneId === null || !readable.some((each) => each.id === sceneId))
      return;
    const slot =
      scenePlaces(sceneHierarchy(scenes), scenes, sessions ?? [], sceneId)[0] ??
      "unsorted";
    const place = sceneNodeId(slot, sceneId);
    setOpenAt(place);
    setInspected(place);
  }, [scenes, sessions, sessionsSettled]);

  const tabsChanged = useRef(onTabsChange);
  useEffect(() => {
    tabsChanged.current = onTabsChange;
  });
  const openIds = openScenes.map((each) => each.id).join("\n");
  // Whether a tab was open here yet: an empty start (remembered tabs not back yet, or a campaign
  // opened without them) must not forget the remembered ones; closing every tab does.
  const hadTabs = useRef(false);
  useEffect(() => {
    if (openIds !== "") hadTabs.current = true;
    if (pendingTabs.current || !hadTabs.current) return;
    tabsChanged.current?.({
      open: openIds === "" ? [] : openIds.split("\n"),
      active: activeSceneId,
      tv: tvSceneId,
    });
  }, [openIds, activeSceneId, tvSceneId]);

  const sceneOpened = useRef(onSceneOpen);
  useEffect(() => {
    sceneOpened.current = onSceneOpen;
  });
  // The scene to reopen on the next start is the TV's (it goes on the dark TV again).
  const tvScene = openScenes.find((each) => each.id === tvSceneId);
  const openSceneId = tvScene?.id;
  const openSceneName = tvScene?.name;
  useEffect(() => {
    if (openSceneId !== undefined && openSceneName !== undefined)
      sceneOpened.current?.({ id: openSceneId, name: openSceneName });
  }, [openSceneId, openSceneName]);

  /** Commands of a tree item's context menu (T-160b). */
  const commandsFor = (treeId: string): MenuItem[] => {
    const newScene = {
      id: "newScene",
      label: t("campaign.newScene"),
      icon: <FilePlus />,
    };
    const newSession = {
      id: "newSession",
      label: t("campaign.newSession"),
      icon: <CalendarPlus />,
    };
    const item = parseTreeId(treeId);
    // An open scene saves its whole state on every change, so its links wait until it is
    // closed (a link written meanwhile would be lost).
    const openSceneOwns = (owner: NoteOwnerRef) =>
      owner.kind === "scene" && isOpen(owner.id);
    const owner = noteOwnerOf(treeId);
    const noteCommands = [
      { id: "openNote", label: t("campaign.openNote"), icon: <NotebookPen /> },
      {
        id: "linkNote",
        label: t("campaign.linkNote"),
        icon: <Link2 />,
        disabled: owner !== null && openSceneOwns(owner),
      },
    ];
    if (item.kind === "note")
      return ownNotePath(item.owner) === item.path
        ? []
        : [
            {
              id: "unlinkNote",
              label: t("campaign.unlinkNote"),
              icon: <Unlink />,
              disabled: openSceneOwns(item.owner),
            },
          ];
    if (item.kind === "campaign")
      return [newScene, newSession, ...noteCommands];
    if (item.kind === "group" && item.id === GROUP.sessions)
      return [newSession];
    if (item.kind === "group" && item.id === GROUP.unsorted) return [newScene];
    if (item.kind === "missing")
      return [
        {
          id: "removeFromSession",
          label: t("campaign.removeFromSession"),
          icon: <ListMinus />,
        },
      ];
    if (item.kind === "session" && !sessionById(item.sessionId))
      // Unreadable: it can still go to the trash (that needs no parsing).
      return [
        {
          id: "deleteSession",
          label: t("campaign.deleteSession"),
          icon: <Trash2 />,
        },
      ];
    if (item.kind === "session")
      return [
        newScene,
        {
          id: "editSession",
          label: t("campaign.editSession"),
          icon: <Pencil />,
        },
        {
          id: "deleteSession",
          label: t("campaign.deleteSession"),
          icon: <Trash2 />,
        },
        ...noteCommands,
      ];
    if (item.kind === "scene") {
      const newSubScene = {
        id: "newSubScene",
        label: t("campaign.newSubScene"),
        icon: <FilePlus />,
        disabled: !scenes?.some(
          (each) => each.id === item.sceneId && each.scene,
        ),
      };
      const others = (sessions ?? []).filter(
        (entry) =>
          entry.session && !entry.session.sceneIds.includes(item.sceneId),
      );
      const addTo = {
        id: "addToSession",
        label: t("campaign.addToSession"),
        icon: <ListPlus />,
        disabled: others.length === 0,
      };
      if (item.slot === "unsorted")
        return [addTo, newScene, newSubScene, ...noteCommands];
      const ids = sessionById(item.slot.sessionId)?.sceneIds ?? [];
      const index = ids.indexOf(item.sceneId);
      // Shown under its parent (T-152), not at the session's top: its place in the session
      // list changes nothing visible, so moving and removing do not apply here.
      const nested = !topScenes(
        hierarchy,
        scenes ?? [],
        sessions ?? [],
        item.slot,
      ).includes(item.sceneId);
      return [
        {
          id: "moveUp",
          label: t("campaign.moveUp"),
          icon: <ArrowUp />,
          disabled: nested || index <= 0,
        },
        {
          id: "moveDown",
          label: t("campaign.moveDown"),
          icon: <ArrowDown />,
          disabled: nested || index < 0 || index >= ids.length - 1,
        },
        {
          id: "removeFromSession",
          label: t("campaign.removeFromSession"),
          icon: <ListMinus />,
          disabled: nested || index < 0,
        },
        addTo,
        newScene,
        newSubScene,
        ...noteCommands,
      ];
    }
    return [];
  };

  /** The owner of a tree item's notes, if it has any. */
  const noteOwnerOf = (treeId: string): NoteOwnerRef | null => {
    const item = parseTreeId(treeId);
    if (item.kind === "campaign") return { kind: "campaign" };
    if (item.kind === "session") return { kind: "session", id: item.sessionId };
    if (item.kind === "scene") return { kind: "scene", id: item.sceneId };
    if (item.kind === "note") return item.owner;
    return null;
  };

  const ownerName = (owner: NoteOwnerRef) =>
    owner.kind === "campaign"
      ? name
      : owner.kind === "session"
        ? (sessionById(owner.id)?.name ?? owner.id)
        : ((scenes ?? []).find((entry) => entry.id === owner.id)?.scene?.name ??
          owner.id);

  /** Opens the owner's own note, starting it with its title when it does not exist yet. */
  const openNote = async (owner: NoteOwnerRef) => {
    const path = ownNotePath(owner);
    try {
      await createNote(service.fs, slug, path, ownerName(owner));
      await reloadNotes();
      setInspected(noteNodeId(owner, path));
    } catch (error) {
      setNotice(describeLibraryError(t, error));
    }
  };

  /**
   * Adds or removes a linked note on the owner's file, read fresh from disk (another device
   * may have changed it). The open scene saves its whole state on every change, so its links
   * wait until it is closed. @returns why it failed, or `null`
   */
  const changeLinks = async (
    owner: NoteOwnerRef,
    action: "link" | "unlink",
    path: string,
  ): Promise<string | null> => {
    const change = <
      T extends { readonly notes?: readonly string[] | undefined },
    >(
      doc: T,
    ): T => (action === "link" ? linkNote(doc, path) : unlinkNote(doc, path));
    try {
      if (owner.kind === "session")
        return await changeSession(owner.id, (session) => change(session));
      if (owner.kind === "scene") {
        if (isOpen(owner.id)) return t("campaign.closeSceneToLink");
        const loaded = await loadScene(service.fs, slug, owner.id);
        if (loaded.status !== "ok")
          return t("campaign.scene.invalid", { id: owner.id });
        await saveScene(service.fs, slug, change(loaded.value));
        await reloadScenes();
        return null;
      }
      const loaded = await loadCampaign(service.fs, slug);
      if (loaded.status !== "ok")
        return t("library.campaign.invalid", { slug });
      await saveCampaign(service.fs, slug, change(loaded.value));
      await readCampaign();
      return null;
    } catch (error) {
      return describeLibraryError(t, error);
    }
  };

  const runCommand = (command: string, request: ContextRequest) => {
    contextItem.current = request.item;
    const origin: Origin = { from: "context", at: request.at };
    const item = parseTreeId(request.treeId);
    const sessionOfItem =
      item.kind === "session" || item.kind === "missing"
        ? item.sessionId
        : item.kind === "scene" && item.slot !== "unsorted"
          ? item.slot.sessionId
          : undefined;
    const report = (result: Promise<string | null>) => {
      void result.then((problem) => {
        if (problem) setNotice(problem);
      });
    };
    switch (command) {
      case "newScene":
        setDialog({
          kind: "newScene",
          origin,
          ...(sessionOfItem ? { sessionId: sessionOfItem } : {}),
        });
        return;
      case "newSubScene":
        if (item.kind === "scene")
          setDialog({
            kind: "newScene",
            origin,
            parent: { sceneId: item.sceneId, slot: item.slot },
          });
        return;
      case "newSession":
        setDialog({ kind: "newSession", origin });
        return;
      case "editSession":
      case "deleteSession":
        if (sessionOfItem)
          setDialog({ kind: command, origin, sessionId: sessionOfItem });
        return;
      case "addToSession":
        if (item.kind === "scene")
          setDialog({ kind: "addToSession", origin, sceneId: item.sceneId });
        return;
      case "openNote": {
        const owner = noteOwnerOf(request.treeId);
        if (owner) void openNote(owner);
        return;
      }
      case "linkNote": {
        const owner = noteOwnerOf(request.treeId);
        if (owner) setDialog({ kind: "linkNote", origin, owner });
        return;
      }
      case "unlinkNote":
        if (item.kind === "note") {
          const path = item.path;
          void changeLinks(item.owner, "unlink", path).then((problem) => {
            if (problem) setNotice(problem);
            else setInspected(null);
          });
        }
        return;
      case "moveUp":
      case "moveDown":
        if (item.kind === "scene" && sessionOfItem)
          report(
            changeSession(sessionOfItem, (session) =>
              moveScene(session, item.sceneId, command === "moveUp" ? -1 : 1),
            ),
          );
        return;
      case "removeFromSession":
        if ((item.kind === "scene" || item.kind === "missing") && sessionOfItem)
          report(
            changeSession(sessionOfItem, (session) =>
              removeScene(session, item.sceneId),
            ),
          );
        return;
    }
  };

  const removeSession = async (sessionId: string) => {
    const session = sessionById(sessionId);
    try {
      await deleteSession(service.fs, slug, sessionId);
      setNotice(
        t("campaign.sessionDeleted", { name: session?.name ?? sessionId }),
      );
      setInspected((current) =>
        current === sessionNodeId(sessionId) ? null : current,
      );
    } catch (error) {
      setNotice(describeLibraryError(t, error));
    }
    closeDialog(dialog?.origin);
    await reloadSessions();
  };

  const dialogContent = (current: Dialog) => {
    switch (current.kind) {
      case "newScene":
        return <NewSceneForm service={service} onCreate={create} />;
      case "newSession":
        return (
          <SessionForm
            submitLabel={t("campaign.createSession")}
            onSubmit={createNewSession}
          />
        );
      case "editSession": {
        const session = sessionById(current.sessionId);
        return (
          <SessionForm
            initialName={session?.name ?? ""}
            initialDate={session?.date ?? ""}
            submitLabel={t("campaign.saveSession")}
            onSubmit={async (sessionName, date) => {
              const problem = await changeSession(current.sessionId, (each) => {
                const next: Session = { ...each, name: sessionName.trim() };
                // An emptied date field removes the date.
                if (date) next.date = date;
                else delete next.date;
                return next;
              });
              if (!problem) closeDialog(current.origin);
              return problem;
            }}
          />
        );
      }
      case "deleteSession": {
        const session = sessionById(current.sessionId);
        return (
          <ConfirmForm
            question={t("campaign.confirmDeleteSession", {
              name: session?.name ?? current.sessionId,
            })}
            confirmLabel={t("campaign.deleteConfirmed")}
            onConfirm={() => removeSession(current.sessionId)}
            onCancel={() => {
              closeDialog(current.origin);
            }}
          />
        );
      }
      case "linkNote":
        return (
          <LinkNoteForm
            onSubmit={async (path) => {
              if (path.normalize("NFC") === ownNotePath(current.owner))
                return t("campaign.noteIsOwn");
              const found = await readNote(service.fs, slug, path);
              if (found.status === "invalid")
                return t("campaign.notePathInvalid");
              if (found.status === "unreadable")
                return t("campaign.noteStatus.unreadable");
              if (found.status === "missing")
                return t("campaign.noteNotFound", { path });
              const problem = await changeLinks(current.owner, "link", path);
              if (!problem) {
                closeDialog(current.origin);
                setInspected(noteNodeId(current.owner, path.normalize("NFC")));
              }
              return problem;
            }}
          />
        );
      case "addToSession":
        return (
          <AddToSessionForm
            sessions={(sessions ?? []).flatMap((entry) =>
              entry.session && !entry.session.sceneIds.includes(current.sceneId)
                ? [[entry.id, entry.session.name] as const]
                : [],
            )}
            onSubmit={async (sessionId) => {
              const problem = await changeSession(sessionId, (session) =>
                addScene(session, current.sceneId),
              );
              if (!problem) closeDialog(current.origin);
              return problem;
            }}
          />
        );
    }
  };

  const dialogLabel = (current: Dialog) =>
    current.kind === "newScene" && current.parent
      ? t("campaign.newSubScene")
      : t(
          {
            newScene: "campaign.newScene",
            newSession: "campaign.newSession",
            editSession: "campaign.editSession",
            deleteSession: "campaign.deleteSession",
            addToSession: "campaign.addToSession",
            linkNote: "campaign.linkNote",
          }[current.kind],
        );

  /** A note's details carry its text. */
  const withNoteBody = (details: ReturnType<typeof describeItem>) =>
    details && inspectedNote
      ? { ...details, ...noteContent(inspectedNote) }
      : details;

  const contextDialog = dialog?.origin.from === "context" ? dialog : null;
  const ribbonDialog = (from: Origin["from"]) =>
    dialog?.origin.from === from ? dialog : null;

  const toggleRibbon = (kind: "newScene" | "newSession") => {
    const from = kind === "newScene" ? "ribbonScene" : "ribbonSession";
    setDialog((current) =>
      current?.origin.from === from ? null : { kind, origin: { from } },
    );
  };

  const readyScenes = scenes ?? [];

  return (
    <>
      <TreeList
        label={t("shell.tree.browserTitle")}
        variant="compact"
        nodes={[campaignTree]}
        selectedId={selectedNodeId}
        onSelect={(id) => {
          setInspected(id);
          open(id);
        }}
        onItemContextMenu={(treeId, at, item) => {
          if (commandsFor(treeId).length === 0) return;
          const parsed = parseTreeId(treeId);
          const label =
            parsed.kind === "campaign"
              ? name
              : parsed.kind === "session"
                ? (sessionById(parsed.sessionId)?.name ?? treeId)
                : parsed.kind === "scene"
                  ? (readyScenes.find((entry) => entry.id === parsed.sceneId)
                      ?.scene?.name ?? parsed.sceneId)
                  : parsed.kind === "missing"
                    ? parsed.sceneId
                    : parsed.kind === "note"
                      ? noteTitle(parsed.path)
                      : treeId === GROUP.sessions
                        ? t("shell.tree.sessions")
                        : t("shell.tree.unsorted");
          setContext({ at, item, treeId, name: label });
        }}
      />
      {scenesState.status === "loading" && <p>{t("campaign.loading")}</p>}
      {scenesState.status === "error" && (
        <p role="alert">{describeLibraryError(t, scenesState.error)}</p>
      )}
      {sessionsState.status === "error" && (
        <p role="alert">{describeLibraryError(t, sessionsState.error)}</p>
      )}
      {scenes?.length === 0 && (
        <p className="dm-browser-hint">{t("campaign.noScenes")}</p>
      )}
      <ContextMenu
        at={context?.at ?? null}
        label={t("campaign.commands", { name: context?.name ?? name })}
        items={context ? commandsFor(context.treeId) : []}
        returnFocus={context?.item}
        onClose={() => {
          setContext(null);
        }}
        onSelect={(command) => {
          if (context) runCommand(command, context);
        }}
      />
      <Popover
        open={contextDialog !== null}
        at={
          contextDialog?.origin.from === "context"
            ? contextDialog.origin.at
            : undefined
        }
        anchor={contextItem}
        label={contextDialog ? dialogLabel(contextDialog) : ""}
        onClose={() => {
          setDialog(null);
        }}
      >
        {contextDialog && dialogContent(contextDialog)}
      </Popover>
      <ShellPortal slot="ribbonScene">
        <RibbonGroup caption={t("shell.groups.create")}>
          <IconButton
            ref={newSceneButton}
            showLabel
            icon={<FilePlus />}
            label={t("campaign.newScene")}
            aria-expanded={ribbonDialog("ribbonScene") !== null}
            aria-controls={
              ribbonDialog("ribbonScene") ? ribbonSceneId : undefined
            }
            onClick={() => {
              toggleRibbon("newScene");
            }}
          />
          <IconButton
            ref={newSessionButton}
            showLabel
            icon={<CalendarPlus />}
            label={t("campaign.newSession")}
            aria-expanded={ribbonDialog("ribbonSession") !== null}
            aria-controls={
              ribbonDialog("ribbonSession") ? ribbonSessionId : undefined
            }
            onClick={() => {
              toggleRibbon("newSession");
            }}
          />
          {(["ribbonScene", "ribbonSession"] as const).map((from) => {
            const current = ribbonDialog(from);
            return (
              <Popover
                key={from}
                id={from === "ribbonScene" ? ribbonSceneId : ribbonSessionId}
                open={current !== null}
                anchor={
                  from === "ribbonScene" ? newSceneButton : newSessionButton
                }
                label={current ? dialogLabel(current) : ""}
                align="start"
                onClose={() => {
                  setDialog(null);
                }}
              >
                {current && dialogContent(current)}
              </Popover>
            );
          })}
        </RibbonGroup>
      </ShellPortal>
      {openScenes.map((each) => (
        <OpenScenePanel
          key={each.id}
          service={service}
          slug={slug}
          scene={each}
          newId={newId}
          active={each.id === activeSceneId}
          onTv={each.id === tvSceneId}
          onSaveState={(state) => {
            setSaveStates((current) => ({ ...current, [each.id]: state }));
          }}
          onShowOnTv={() => {
            setTabs((current) => sendSceneTabToTv(current, each.id));
            setNotice(t("campaign.sceneShownOnTv", { name: each.name }));
          }}
          tabs={(busy) => (
            <SceneTabs
              tabs={openScenes.map((tab) => ({
                id: tab.id,
                name: tab.name,
                onTv: tab.id === tvSceneId,
                ...saveStates[tab.id],
              }))}
              activeId={activeSceneId}
              busy={busy}
              focus={tabFocus}
              onFocused={() => {
                setTabFocus(null);
              }}
              onSelect={(id) => {
                setTabs((current) => selectSceneTab(current, id));
                setTabFocus(id);
              }}
              onClose={(id) => {
                closeScenes([id]);
              }}
            />
          )}
          subScenes={{
            direct: hierarchy.childrenOf(each.id),
            all: hierarchy.descendantsOf(each.id),
            parentSceneId: hierarchy.parentOf(each.id),
            open: openScenes
              .filter((tab) =>
                hierarchy.descendantsOf(each.id).includes(tab.id),
              )
              .map((tab) => tab.name),
          }}
          onSceneChange={(scene, map, revealed) => {
            setLive({ scene, map, revealed });
          }}
          onChanged={(scene) => {
            setTabs((current) => replaceSceneTab(current, scene));
            void reloadScenes();
          }}
          onDeleted={(scene, deleted) => {
            closeScenes([scene.id, ...deleted]);
            setInspected((current) => {
              const item = current ? parseTreeId(current) : null;
              return item?.kind === "scene" && item.sceneId === scene.id
                ? null
                : current;
            });
            setNotice(t("campaign.sceneDeleted", { name: scene.name }));
            void reloadScenes();
            // Deleting a scene also takes it out of its sessions.
            void reloadSessions();
          }}
          onClose={() => {
            closeScenes([each.id]);
          }}
        />
      ))}
      <ShellPortal slot="details">
        <DetailsPanel
          details={
            inspected
              ? withNoteBody(
                  describeItem(t, inspected, {
                    name,
                    scenes: readyScenes,
                    sessions: sessions ?? [],
                    players,
                    mapPaths,
                    visibilityRules: Object.keys(
                      campaignFile?.visibilityDefaults ?? {},
                    ).length,
                    live,
                    openSceneId: openScene?.id ?? null,
                    language: i18n.language,
                    notesIndex,
                    campaignLinks: campaignFile?.notes ?? [],
                  }),
                )
              : null
          }
          selected={inspected !== null}
        />
      </ShellPortal>
      <ShellPortal slot="notices">
        <p role="status">{notice}</p>
      </ShellPortal>
    </>
  );
}
