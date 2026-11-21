import {
  addLevel,
  clampGroupShift,
  rollInitiative,
  type Command,
  tokenVisibility,
  gridBounds,
  gridFootprint,
  middleCell,
  nearestFreeCell,
  renameLevel,
  tableLevels,
  type ResolvedMap,
} from "@dungeon-manager/core";
import { viewArea, type Point, type Size } from "@dungeon-manager/renderer";
import { gridModeSchema } from "@dungeon-manager/schema";
import type {
  AssetRef,
  Combatant,
  GridCell,
  GridMode,
  Player,
  Polygon,
  Scene,
  TokenSize,
} from "@dungeon-manager/schema";
import {
  deleteScene,
  ensureMapData,
  loadScene,
  mapDataForChange,
  mapKind,
  reparentScene,
  saveScene,
  type MapReset,
  withMap,
} from "@dungeon-manager/storage";
import { IconButton, Menu, Popover, RibbonGroup } from "@dungeon-manager/ui";
import { EyeOff, ImagePlus, Swords, Trash2, Tv, UserPlus } from "lucide-react";
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";
import { MapChangeChoice } from "./MapChangeChoice.js";
import { levelMedia } from "../level-media.js";
import { LevelGroup, type LevelFile } from "./LevelGroup.js";
import {
  MapView,
  MapViewContext,
  type MapTool,
  type TokenControl,
} from "./MapView.js";
import { releaseVideo } from "../platform/map-images.js";
import type { FogShape } from "./fog-shapes.js";
import { FogToolbar } from "./FogToolbar.js";
import { SceneTabs, SceneTitle } from "./SceneTitle.js";
import { ShellPortal } from "./shell/slots.js";
import { useSceneSession } from "./useSceneSession.js";
import { softEdgeWidth } from "../fog-settings.js";
import { FogLookContext } from "./shell/fog-look.js";
import { useActiveWorkspace } from "./shell/workspace.js";
import { NewTokenForm } from "./NewTokenForm.js";
import { InitiativePanel } from "./InitiativePanel.js";
import { tokenShapes } from "../token-shapes.js";
import { TvViewContext } from "./tv-view-context.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { SceneRescueContext } from "./rescue-copies.js";

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
const NOTHING_SELECTED: ReadonlySet<string> = new Set();
const NO_PLAYERS: readonly Player[] = [];
/** The grid modes a scene can have (T-233d), in the Raster menu's order. */
const GRID_MODES = gridModeSchema.options;

/** Undo/redo keys, unless the DM is typing in a field (where they edit the text). */
function historyKey(event: KeyboardEvent): "undo" | "redo" | null {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    // Text entry only: on a tool button, a switch or a slider the shortcuts still undo fog.
    target.closest(
      'input:not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="range"]), textarea, select, [contenteditable]',
    )
  )
    return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

/** The sub-scenes of the open scene (T-152). */
export interface SubScenes {
  /** Its direct sub-scenes: they move up to `parentSceneId` when the DM keeps them. */
  readonly direct: readonly string[];
  /** All sub-scenes below it, parents before children: they go when the DM deletes them too. */
  readonly all: readonly string[];
  /** The open scene's own parent, or `null` at the top. */
  readonly parentSceneId: string | null;
  /**
   * Names of sub-scenes open in other tabs (T-223a): the scene is not deleted while they are,
   * as their saves would bring deleted files back or undo the move to a new parent.
   */
  readonly open?: readonly string[];
}

const NO_SUB_SCENES: SubScenes = { direct: [], all: [], parentSceneId: null };

/**
 * The open scene: its map with fog tools (reveal/hide, undo), changing its map, deleting it (to
 * the trash, after confirming) and closing it. Fog edits are saved and reach the TV at once.
 */
export function OpenScenePanel({
  service,
  slug,
  scene: opened,
  newId,
  onSceneChange,
  onChanged,
  onDeleted,
  onClose,
  subScenes = NO_SUB_SCENES,
  active = true,
  onTv: sceneOnTv = true,
  onShowOnTv,
  onSaveState,
  tabs,
  campaignGridMode,
  random = Math.random,
  players = NO_PLAYERS,
}: {
  readonly service: LibraryService;
  readonly slug: string;
  readonly scene: Scene;
  readonly newId: () => string;
  /**
   * The scene as edited and the revealed fog of the level the DM works on (T-118c), after every
   * change (browser tree).
   */
  readonly onSceneChange?: (
    scene: Scene,
    map: ResolvedMap | null,
    revealed: readonly Polygon[],
  ) => void;
  readonly onChanged: (scene: Scene) => void;
  /** The scene went to the trash; `deleted`: the sub-scenes that went with it. */
  readonly onDeleted: (scene: Scene, deleted: readonly string[]) => void;
  readonly onClose: () => void;
  /** The scene's sub-scenes (T-152): asked about when it is deleted. */
  readonly subScenes?: SubScenes;
  /**
   * Whether its tab is the one shown (T-223a). Another open scene keeps its state and undo
   * history but shows nothing and ignores the keys.
   */
  readonly active?: boolean;
  /** Whether this scene is the one on the TV (T-223a): only that one feeds it. */
  readonly onTv?: boolean;
  /** "Szene auf den TV": the DM puts this scene on the TV. */
  readonly onShowOnTv?: (() => void) | undefined;
  /** Whether a save is pending or failed, after each change of either (T-223b: its tab's dot). */
  readonly onSaveState?:
    | ((state: {
        readonly saving: boolean;
        readonly saveFailed: boolean;
      }) => void)
    | undefined;
  /** The open scenes' tabs for the title bar; `busy`: this scene must not close now. */
  readonly tabs?: ((busy: boolean) => ReactNode) | undefined;
  /** The campaign's grid mode, as read now (T-233e): scenes "as the campaign" follow it. */
  readonly campaignGridMode?: GridMode | undefined;
  /** Dice for the initiative (T-111b); tests pass a fixed one. */
  readonly random?: () => number;
  /** The campaign's players, for the quick entry of their rolls (T-111d). */
  readonly players?: readonly Player[];
}) {
  const { t } = useTranslation();
  const fogLook = useContext(FogLookContext);
  const mapImages = useContext(MapViewContext);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // DM decision (T-152): keeping the sub-scenes is preselected.
  const [keepSubScenes, setKeepSubScenes] = useState(true);
  const [error, setError] = useState("");
  const [pendingMap, setPendingMap] = useState<AssetRef | null>(null);
  const session = useSceneSession(service, slug, opened, sceneOnTv);
  const rescue = useContext(SceneRescueContext);
  const reportSaveState = useRef(onSaveState);
  useEffect(() => {
    reportSaveState.current = onSaveState;
  });
  const { saving, saveFailed } = session;
  useEffect(() => {
    reportSaveState.current?.({ saving, saveFailed });
  }, [saving, saveFailed]);
  const { scene, map, notOnTv } = session;
  const [tool, setTool] = useState<MapTool>("pan");
  // The scene is the Game-Orchestrator's document (T-174): undo and redo act on it only while
  // that workspace shows, and leaving it drops a fog tool back to panning.
  const inGame = useActiveWorkspace() === "gameOrchestrator";
  useEffect(() => {
    if (!inGame) setTool("pan");
  }, [inGame]);
  const [shape, setShape] = useState<FogShape>("rectangle");
  const [brushCells, setBrushCells] = useState(1);
  const [mapSize, setMapSize] = useState<Size | null>(null);
  // The calibrated TV's view on this scene's map (T-106c): the DM moves it; the TV follows. Only
  // the scene on the TV has one; `null` centres the map.
  const tvView = useContext(TvViewContext);
  const feed = useContext(PlayerFeedContext);
  const [tvCenter, setTvCenter] = useState<Point | null>(null);
  // A new map has its own coordinates: the TV's view starts in its middle again.
  const tvMapPath = scene.map?.asset.path;
  useEffect(() => {
    setTvCenter(null);
  }, [tvMapPath]);
  /** The view's centre kept on the map, so the TV never shows only what lies beyond it. */
  const moveTvView = (next: Point) => {
    setTvCenter(
      mapSize
        ? {
            x: Math.min(Math.max(next.x, 0), mapSize.width),
            y: Math.min(Math.max(next.y, 0), mapSize.height),
          }
        : next,
    );
  };
  const tvOnThisMap = sceneOnTv && tvView !== null;
  useEffect(() => {
    if (tvOnThisMap) feed?.setViewCenter(tvCenter);
  }, [feed, tvOnThisMap, tvCenter]);
  // The DM works on a level of their choice, the TV's until they pick another (T-118c).
  const onTv = tableLevels(scene, map).current ?? undefined;
  const [picked, setPicked] = useState<string | null>(null);
  const levelId =
    picked !== null && map?.levels.some(({ id }) => id === picked)
      ? picked
      : onTv;
  const media = map ? levelMedia(map, levelId) : null;
  const revealed =
    (levelId === undefined ? undefined : scene.fog.levels[levelId]?.revealed) ??
    NOTHING_REVEALED;
  const mapPath = scene.map?.asset.path;
  const reportScene = useRef(onSceneChange);
  useEffect(() => {
    reportScene.current = onSceneChange;
  });
  useEffect(() => {
    // Only the shown tab speaks for the browser tree; again when it becomes the shown one.
    if (active) reportScene.current?.(scene, map, revealed);
  }, [scene, map, revealed, active]);
  // A new map (or a level with its own file) is measured again; until then "reveal all" has
  // no size to use.
  useEffect(() => {
    setMapSize(null);
  }, [mapPath, media?.path]);
  // Another scene or map starts on the TV's level again.
  useEffect(() => {
    setPicked(null);
  }, [scene.id, mapPath]);

  // Selected tokens (T-107b): of the level shown; another scene or level starts with none, and
  // removed tokens (also by undo) drop out.
  const [selection, setSelection] =
    useState<ReadonlySet<string>>(NOTHING_SELECTED);
  useEffect(() => {
    setSelection(NOTHING_SELECTED);
  }, [scene.id, levelId]);
  const selected = useMemo(() => {
    const here = scene.tokens.filter(
      (token) => token.levelId === levelId && selection.has(token.id),
    );
    return here.length === selection.size
      ? selection
      : new Set(here.map((token) => token.id));
  }, [scene.tokens, levelId, selection]);
  // Forgotten for good: a redo that brings a token back does not select it again.
  useEffect(() => {
    if (selected !== selection) setSelection(selected);
  }, [selected, selection]);
  const defaults = session.visibilityDefaults;
  const selectedTokens = scene.tokens.filter((token) => selected.has(token.id));
  const allHidden =
    selectedTokens.length > 0 &&
    selectedTokens.every(
      (token) => tokenVisibility(defaults, token) === "hidden",
    );

  // The token whose turn it is (T-111c): marked as on the TV.
  const activeTokenId =
    scene.initiative?.combatants.find(
      (each) => each.id === scene.initiative?.activeCombatantId,
    )?.tokenId ?? null;
  // New tokens (T-107a): on the free cell nearest the map's middle, on the level the DM works on.
  const newTokenButton = useRef<HTMLButtonElement>(null);
  const tokens = useMemo(
    () =>
      map && levelId !== undefined
        ? tokenShapes(
            scene.tokens,
            map.grid,
            levelId,
            selected,
            defaults,
            activeTokenId,
          )
        : [],
    [scene.tokens, map, levelId, selected, defaults, activeTokenId],
  );
  const [creatingToken, setCreatingToken] = useState(false);
  const addToken = (name: string, size: TokenSize): boolean => {
    if (!map || !mapSize || levelId === undefined) return false;
    const bounds = gridBounds(mapSize, map.grid);
    const footprint = gridFootprint(size);
    const others = scene.tokens
      .filter((token) => token.levelId === levelId)
      .map((token) => ({
        position: token.position,
        footprint: gridFootprint(token.size),
      }));
    const position = nearestFreeCell(
      middleCell(bounds, footprint),
      footprint,
      others,
      bounds,
    );
    if (!position) {
      setError(t("token.noFreeCell"));
      return false;
    }
    const added = session.run({
      type: "token.add",
      token: { id: newId(), name, size, position, levelId },
    });
    // Other messages (e.g. a failed map change) stay.
    if (!added) setError(t("token.notCreated"));
    return added;
  };

  // Moves tokens as one step; a group stops at the map's edge, keeping its formation (T-107b).
  // Until the map's size is known nothing moves: the edge is not known yet.
  const clampShift = (ids: readonly string[], shift: GridCell): GridCell =>
    map && mapSize
      ? clampGroupShift(
          scene.tokens
            .filter((token) => ids.includes(token.id))
            .map((token) => ({
              position: token.position,
              footprint: gridFootprint(token.size),
            })),
          shift,
          gridBounds(mapSize, map.grid),
        )
      : { col: 0, row: 0 };
  // How tokens move (T-233d): the scene's grid mode, else the campaign's, else free outside
  // combat and on cells in it.
  const gridMode = scene.gridMode ?? campaignGridMode ?? "gridInCombat";
  // What "as the campaign" means right now, for the Raster menu.
  const asCampaign = t("gridMode.asCampaign", {
    mode: t(`gridMode.modes.${campaignGridMode ?? "gridInCombat"}`),
  });
  const movesFreely =
    gridMode === "free" ||
    (gridMode === "gridInCombat" && scene.combat !== true);
  const moveTokens = (
    ids: readonly string[],
    shift: GridCell,
    free = false,
  ) => {
    const moving = scene.tokens.filter((token) => ids.includes(token.id));
    const clamped = clampShift(ids, shift);
    if (moving.length === 0 || (clamped.col === 0 && clamped.row === 0)) return;
    const moved = session.run({
      type: "token.moveMany",
      moves: moving.map((token) => ({
        tokenId: token.id,
        to: {
          col: token.position.col + clamped.col,
          row: token.position.row + clamped.row,
        },
      })),
      // Onto cells, never an occupied one (T-233c): a taken cell sends a token to the nearest
      // free one.
      ...(map && mapSize && { bounds: gridBounds(mapSize, map.grid) }),
      // Placed as they are, pushed off others just far enough (T-233d).
      ...(free && { free: true }),
    });
    if (!moved) setError(t("token.notMoved"));
  };
  // The initiative (T-111b): selected tokens not in it yet join it; creatures roll d20 + bonus
  // (0 until creature data reaches this window, T-180), a player's character carries its
  // player, who wins ties.
  const inInitiative = new Set(
    (scene.initiative?.combatants ?? []).flatMap((each) =>
      each.tokenId === undefined ? [] : [each.tokenId],
    ),
  );
  const toAdd = selectedTokens.filter((token) => !inInitiative.has(token.id));
  const addSelectedToInitiative = () => {
    if (toAdd.length === 0) return;
    const added = session.run({
      type: "initiative.addMany",
      combatants: toAdd.map((token) => ({
        id: newId(),
        name: token.name,
        tokenId: token.id,
        initiative: rollInitiative(0, random),
        initiativeBonus: 0,
        ...(token.ownerPlayerId !== undefined && {
          playerId: token.ownerPlayerId,
        }),
        conditions: [],
      })),
    });
    if (!added) setError(t("initiative.notApplied"));
  };
  // The players' rolls (T-111d): a character already in the order gets its new value, the
  // others join – with their token on this scene if they have one.
  // A player's character in the order: marked with the player, or found by the player's token.
  const characterOf = (playerId: string) =>
    scene.initiative?.combatants.find(
      (each) =>
        each.playerId === playerId ||
        (each.playerId === undefined &&
          each.tokenId !== undefined &&
          scene.tokens.find((token) => token.id === each.tokenId)
            ?.ownerPlayerId === playerId),
    );
  const playerCharacters = players.map((player) => ({
    playerId: player.id,
    name: player.characterName ?? player.name,
    initiative: characterOf(player.id)?.initiative,
  }));
  // The token a joining character brings: the player's on the shown level first, then one named
  // like the character; never one already in the order.
  const tokenOf = (player: Player) => {
    const own = scene.tokens.filter(
      (token) =>
        token.ownerPlayerId === player.id && !inInitiative.has(token.id),
    );
    const rank = (token: (typeof own)[number]) =>
      (token.levelId === levelId ? 0 : 2) +
      (token.name === (player.characterName ?? player.name) ? 0 : 1);
    return [...own].sort((a, b) => rank(a) - rank(b))[0];
  };
  const enterPlayerRolls = (
    rolls: readonly {
      readonly playerId: string;
      readonly initiative: number;
    }[],
  ) => {
    const add: Combatant[] = [];
    const values: {
      combatantId: string;
      initiative: number;
      playerId?: string;
    }[] = [];
    for (const roll of rolls) {
      const existing = characterOf(roll.playerId);
      if (existing) {
        values.push({
          combatantId: existing.id,
          initiative: roll.initiative,
          ...(existing.playerId === undefined && { playerId: roll.playerId }),
        });
        continue;
      }
      const player = players.find((each) => each.id === roll.playerId);
      if (!player) continue;
      const token = tokenOf(player);
      add.push({
        id: newId(),
        name: player.characterName ?? player.name,
        playerId: player.id,
        ...(token && { tokenId: token.id }),
        initiative: roll.initiative,
        initiativeBonus: 0,
        conditions: [],
      });
    }
    // All of it as one step (one undo).
    initiativeCommand({ type: "initiative.enterRolls", add, values });
  };
  const addInitiativeEntry = (name: string, initiative: number) => {
    initiativeCommand({
      type: "initiative.add",
      combatant: { id: newId(), name, initiative, conditions: [] },
    });
  };
  const initiativeCommand = (command: Command) => {
    if (!session.run(command)) setError(t("initiative.notApplied"));
  };
  const deleteTokens = (ids: readonly string[]) => {
    if (ids.length === 0) return;
    if (session.run({ type: "token.remove", tokenIds: ids }))
      setSelection(NOTHING_SELECTED);
  };
  const tokenControl: TokenControl | null = busy
    ? null
    : {
        selected,
        onSelect: setSelection,
        onMove: moveTokens,
        free: movesFreely,
        clampShift,
        onDelete: deleteTokens,
      };

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
      if (!action || busy || !inGame || !active) return;
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
  const sceneMenuButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  // Keyboard focus follows the confirmation step instead of falling back to the page.
  useEffect(() => {
    if (confirmingDelete) confirmButton.current?.focus();
    else if (asked.current) sceneMenuButton.current?.focus();
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
      // A new map without data of its own takes the current map's grid and levels (ADR-0012).
      await ensureMapData(
        service.fs,
        asset,
        // The old map as played, defaults included, so its fog and tokens keep their levels.
        mapDataForChange(session.map, t("campaign.defaultLevel"), reset),
      );
      const changed = withMap(
        current.status === "ok" ? current.value : scene,
        asset,
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

  // A level's own file must have the map's pixel size, so one calibration fits all (ADR-0012).
  const chooseLevelFile = async (): Promise<LevelFile | null> => {
    // Without the map's size nothing could be checked: ask before copying a file in.
    if (!mapSize || !mapImages)
      return { kind: "refused", message: t("level.sizeUnknown") };
    try {
      const asset = await service.importMap(t("campaign.mapFilter"));
      if (!asset) return null;
      let size: Size;
      if (mapKind(asset.path) === "video") {
        const video = await mapImages.loadVideo(asset.path);
        size = { width: video.videoWidth, height: video.videoHeight };
        releaseVideo(video);
      } else size = await mapImages.loadImage(asset.path);
      if (size.width === mapSize.width && size.height === mapSize.height)
        return { kind: "fits", asset };
      return {
        kind: "refused",
        message: t("level.wrongSize", {
          file: fileName(asset.path),
          width: size.width,
          height: size.height,
          mapWidth: mapSize.width,
          mapHeight: mapSize.height,
        }),
      };
    } catch (caught) {
      return { kind: "refused", message: describeLibraryError(t, caught) };
    }
  };

  const editLevels = async (change: Parameters<typeof session.editMap>[0]) => {
    setError("");
    try {
      const changed = await session.editMap(change);
      if (!changed) setError(t("level.notChanged"));
      return changed;
    } catch (caught) {
      setError(describeLibraryError(t, caught));
      return false;
    }
  };

  const remove = () => {
    const openSubScenes = subScenes.open ?? [];
    if (openSubScenes.length > 0) {
      setError(
        t("campaign.closeSubScenesFirst", {
          names: openSubScenes.join(", "),
        }),
      );
      return Promise.resolve();
    }
    return run(async () => {
      // A save still in flight would otherwise bring the file back after it went to the trash.
      await session.flush();
      // Sub-scenes first, so a failure leaves the scene itself in place.
      if (keepSubScenes)
        for (const child of subScenes.direct)
          await reparentScene(service.fs, slug, child, subScenes.parentSceneId);
      else
        for (const each of [...subScenes.all].reverse()) {
          // Already gone (e.g. trashed by an earlier try that failed later): nothing to do.
          if ((await loadScene(service.fs, slug, each)).status === "missing")
            continue;
          await deleteScene(service.fs, slug, each);
        }
      await deleteScene(service.fs, slug, scene.id);
      // A rescue copy of a deleted scene would bring it back (T-114b).
      for (const id of [scene.id, ...(keepSubScenes ? [] : subScenes.all)])
        rescue?.drop(slug, id);
      onDeleted(scene, keepSubScenes ? [] : subScenes.all);
    });
  };

  // Another tab shows: this scene keeps its session (and feeds the TV if it is on it).
  if (!active) return null;
  return (
    <div
      role="region"
      aria-label={t("campaign.openScene", { name: scene.name })}
    >
      <p className="visually-hidden">
        {t("campaign.openScene", { name: scene.name })}
      </p>
      <ShellPortal slot="titleScene">
        <SceneTitle
          tabs={
            tabs?.(busy) ?? (
              <SceneTabs
                tabs={[{ id: scene.id, name: scene.name, onTv: sceneOnTv }]}
                activeId={scene.id}
                busy={busy}
                onSelect={() => undefined}
                onClose={onClose}
              />
            )
          }
          canUndo={session.canUndo && !busy && inGame}
          canRedo={session.canRedo && !busy && inGame}
          onUndo={() => {
            session.undo();
          }}
          onRedo={() => {
            session.redo();
          }}
          saving={session.saving}
          saveFailed={session.saveFailed}
          onRetrySave={() => {
            session.retrySave();
          }}
        />
      </ShellPortal>
      <ShellPortal slot="ribbonScene">
        <RibbonGroup
          caption={t("shell.groups.scene")}
          menu={{
            items: [
              {
                id: "delete",
                label: t("campaign.deleteScene"),
                icon: <Trash2 />,
                disabled: busy,
              },
            ],
            onSelect: () => {
              // Every time anew: keeping the sub-scenes is preselected (T-152).
              setKeepSubScenes(true);
              setConfirmingDelete(true);
            },
            buttonRef: sceneMenuButton,
            // The group's popovers sit where the menu opens; one at a time.
            onOpen: () => {
              if (busy) return;
              setConfirmingDelete(false);
              setPendingMap(null);
            },
          }}
        >
          <IconButton
            ref={changeMapButton}
            showLabel
            icon={<ImagePlus />}
            label={
              scene.map ? t("campaign.changeMap") : t("campaign.chooseSceneMap")
            }
            disabled={busy}
            onClick={() => void changeMap()}
          />
          {onShowOnTv && (
            <IconButton
              showLabel
              icon={<Tv />}
              label={t("campaign.showSceneOnTv")}
              disabled={sceneOnTv}
              onClick={onShowOnTv}
            />
          )}
          <p className="dm-ribbon-meta">
            {scene.map
              ? t("campaign.map", { file: fileName(scene.map.asset.path) })
              : t("campaign.noMap")}
          </p>
          <Popover
            open={pendingMap !== null}
            onClose={() => {
              if (!busy) setPendingMap(null);
            }}
            anchor={changeMapButton}
            label={t("campaign.mapChange.title")}
            align="start"
          >
            {pendingMap && (
              <MapChangeChoice
                file={fileName(pendingMap.path)}
                busy={busy}
                onApply={(reset) => void applyMap(pendingMap, reset)}
                onCancel={() => {
                  setPendingMap(null);
                }}
              />
            )}
          </Popover>
          <Popover
            open={confirmingDelete}
            onClose={() => {
              if (!busy) setConfirmingDelete(false);
            }}
            anchor={sceneMenuButton}
            label={t("campaign.confirmDelete", { name: scene.name })}
            align="start"
          >
            <p>{t("campaign.confirmDelete", { name: scene.name })}</p>
            {subScenes.all.length > 0 && (
              <fieldset>
                <legend>
                  {t("campaign.subScenesOnDelete", {
                    count: subScenes.all.length,
                  })}
                </legend>
                <label>
                  <input
                    type="radio"
                    name="sub-scenes-on-delete"
                    checked={keepSubScenes}
                    onChange={() => {
                      setKeepSubScenes(true);
                    }}
                  />
                  {t("campaign.keepSubScenes")}
                </label>
                <label>
                  <input
                    type="radio"
                    name="sub-scenes-on-delete"
                    checked={!keepSubScenes}
                    onChange={() => {
                      setKeepSubScenes(false);
                    }}
                  />
                  {t("campaign.deleteSubScenes")}
                </label>
              </fieldset>
            )}
            <div className="dm-popover-actions">
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
          </Popover>
        </RibbonGroup>
        {map && levelId !== undefined && onTv !== undefined && (
          <LevelGroup
            levels={map.levels}
            working={levelId}
            onTv={onTv}
            disabled={busy || notOnTv}
            // Map data does not depend on the TV, so editing it does not wait for the campaign.
            canEdit={
              !busy &&
              session.mapData.status === "ready" &&
              !session.mapData.legacy &&
              !session.mapChanged
            }
            onWork={setPicked}
            onShow={() => {
              session.run({ type: "level.show", levelId });
            }}
            onChooseFile={chooseLevelFile}
            onAdd={async (name, asset) => {
              const id = newId();
              const added = await editLevels((data) =>
                addLevel(data, { id, name, ...(asset && { asset }) }),
              );
              // The DM goes on with the new level; the TV stays where it is (T-118c).
              if (added) setPicked(id);
              return added;
            }}
            onRename={(name) =>
              editLevels((data) => renameLevel(data, levelId, name))
            }
          />
        )}
        {/* The scene's grid mode (T-233d): how tokens move, in and out of combat. */}
        {map && (
          <RibbonGroup caption={t("gridMode.group")}>
            <Menu
              label={
                scene.gridMode === undefined
                  ? asCampaign
                  : t(`gridMode.modes.${scene.gridMode}`)
              }
              menuLabel={t("gridMode.pick")}
              items={[
                {
                  id: "campaign",
                  label: asCampaign,
                  checked: scene.gridMode === undefined,
                },
                ...GRID_MODES.map((mode) => ({
                  id: mode,
                  label: t(`gridMode.modes.${mode}`),
                  checked: scene.gridMode === mode,
                })),
              ]}
              onSelect={(id) => {
                if (busy) return;
                session.run({
                  type: "scene.setGridMode",
                  gridMode: GRID_MODES.find((mode) => mode === id) ?? null,
                });
              }}
            />
          </RibbonGroup>
        )}
        {/* Combat (T-233b): in play only; starting it snaps every token onto a free cell. */}
        {inGame && map && mapSize && (
          <RibbonGroup caption={t("combat.group")}>
            <IconButton
              showLabel
              icon={<Swords />}
              label={t("combat.toggle")}
              pressed={scene.combat === true}
              disabled={busy}
              onClick={() => {
                if (scene.combat === true) {
                  session.run({ type: "combat.end" });
                  return;
                }
                const started = session.run({
                  type: "combat.start",
                  bounds: gridBounds(mapSize, map.grid),
                });
                if (!started) setError(t("combat.noRoom"));
              }}
            />
          </RibbonGroup>
        )}
        {map && mapSize && levelId !== undefined && (
          <RibbonGroup caption={t("token.group")}>
            <IconButton
              ref={newTokenButton}
              showLabel
              icon={<UserPlus />}
              label={t("token.new")}
              aria-expanded={creatingToken}
              disabled={busy}
              onClick={() => {
                setCreatingToken((current) => !current);
              }}
            />
            <Popover
              open={creatingToken}
              onClose={() => {
                setCreatingToken(false);
              }}
              anchor={newTokenButton}
              label={t("token.new")}
              align="start"
            >
              {creatingToken && (
                <NewTokenForm
                  onCreate={(name, size) => {
                    const placed = addToken(name, size);
                    if (placed) setCreatingToken(false);
                    return placed;
                  }}
                />
              )}
            </Popover>
            <IconButton
              icon={<EyeOff />}
              label={t("token.hideOnTv")}
              pressed={allHidden}
              disabled={busy || selected.size === 0}
              onClick={() => {
                session.run({
                  type: "visibility.setTokens",
                  tokenIds: [...selected],
                  elementType: "token",
                  // Shown against a campaign that hides tokens by default: set, not cleared.
                  visibility: allHidden
                    ? defaults.token === "hidden"
                      ? "visible"
                      : null
                    : "hidden",
                });
              }}
            />
            <IconButton
              icon={<Trash2 />}
              label={t("token.delete")}
              aria-keyshortcuts="Delete"
              disabled={busy || selected.size === 0}
              onClick={() => {
                deleteTokens([...selected]);
              }}
            />
          </RibbonGroup>
        )}
      </ShellPortal>
      {/* The Initiative panel shows the scene the DM works on (T-111b). */}
      <ShellPortal slot="initiative">
        <InitiativePanel
          initiative={scene.initiative}
          canAddSelected={toAdd.length > 0}
          canStart={map !== null && mapSize !== null}
          busy={busy}
          onAddSelected={addSelectedToInitiative}
          onStart={() => {
            if (!map || !mapSize) return;
            if (
              !session.run({
                type: "initiative.start",
                bounds: gridBounds(mapSize, map.grid),
              })
            )
              setError(t("initiative.noRoom"));
          }}
          onCommand={initiativeCommand}
          players={playerCharacters}
          onPlayerRolls={enterPlayerRolls}
          onAddEntry={addInitiativeEntry}
        />
      </ShellPortal>
      <ShellPortal slot="notices">
        {notOnTv && <p role="alert">{t("player.notShown")}</p>}
        <MapDataNotice session={session} />
        {error && <p role="alert">{error}</p>}
      </ShellPortal>
      {map && media && (
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
              key={`${media.kind}:${media.path}`}
              path={media.path}
              kind={media.kind}
              label={scene.name}
              fog={revealed}
              tool={busy || !inGame ? "pan" : tool}
              shape={shape}
              // Brush size is chosen in grid cells (diameter), so it fits the map's scale.
              brushRadius={(brushCells * map.grid.cellSizePx) / 2}
              grid={map.grid}
              tokens={tokens}
              tokenControl={tokenControl}
              tvFrame={
                tvView && sceneOnTv && mapSize
                  ? {
                      area: viewArea(
                        tvView.display,
                        tvView.pxPerCell,
                        map.grid.cellSizePx,
                        tvView.rotation,
                      ),
                      center: tvCenter ?? {
                        x: mapSize.width / 2,
                        y: mapSize.height / 2,
                      },
                      onMove: moveTvView,
                    }
                  : null
              }
              // Slightly rounded rectangles, as wide as the soft fog edge (T-170).
              cornerRadius={map.grid.cellSizePx / 4}
              softEdge={softEdgeWidth(map.grid.cellSizePx, fogLook.softEdges)}
              fade={fogLook.fadeSeconds * 1000}
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

/**
 * What the DM should know about the map's data (ADR-0012): a change waiting to reach the TV, not
 * available yet (nothing is shown), the scene playing its own version 2 copy, or overrides whose
 * map element is gone.
 */
function MapDataNotice({
  session,
}: {
  readonly session: ReturnType<typeof useSceneSession>;
}) {
  const { t } = useTranslation();
  if (session.mapChanged)
    return (
      <p role="status">
        {t("campaign.mapData.changed")}{" "}
        <button
          type="button"
          onClick={() => {
            session.acceptMapChange();
          }}
        >
          {t("campaign.mapData.acceptChange")}
        </button>
      </p>
    );
  if (session.mapData.status === "unavailable")
    return <p role="alert">{t("campaign.mapData.unavailable")}</p>;
  if (session.mapData.status === "ready" && session.mapData.legacy)
    return <p role="status">{t("campaign.mapData.legacy")}</p>;
  if (session.orphanedOverrides.length > 0)
    return (
      <p role="status">
        {t("campaign.mapData.orphaned", {
          count: session.orphanedOverrides.length,
        })}
      </p>
    );
  return null;
}
