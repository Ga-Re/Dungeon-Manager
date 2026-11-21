import {
  createHistory,
  execute,
  projectForViewer,
  redo,
  resolveMap,
  undo,
  type Command,
  type History,
  type ResolvedMap,
  type SessionState,
} from "@dungeon-manager/core";
import type {
  Campaign,
  GridMode,
  MapData,
  Scene,
  VisibilityRules,
} from "@dungeon-manager/schema";
import {
  DEFAULT_LEVEL_ID,
  loadCampaign,
  newMapData,
  saveScene,
  updateMapData,
  withoutLegacyMap,
} from "@dungeon-manager/storage";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { SceneRescueContext } from "./rescue-copies.js";
import { useMapData, type MapDataState } from "./useMapData.js";

const NO_DEFAULTS: VisibilityRules = {};

/** Time and randomness for core commands (ARCHITECTURE §4: injected, never read inside core). */
const ctx = { now: () => Date.now(), random: () => Math.random() };

export interface SceneSession {
  /** The scene as edited so far (saved after every change). */
  readonly scene: Scene;
  /**
   * The scene's map as played: its map's data with the scene's overrides (ADR-0012); `null`
   * without a map, while the map data loads or when it is not available (`mapData`).
   */
  readonly map: ResolvedMap | null;
  /** The map's global data and whether it can be used. */
  readonly mapData: MapDataState;
  /** Overrides of the scene whose map element is gone (shown to the DM as a hint). */
  readonly orphanedOverrides: readonly string[];
  /** The map's data changed on disk; the scene keeps the old until `acceptMapChange`. */
  readonly mapChanged: boolean;
  acceptMapChange(): void;
  /**
   * Changes the map's global data in its sidecar from this scene (T-118d) and shows the result at
   * once. Only while the scene plays the map's data (not its own version 2 copy or a held change).
   * @returns whether something was written. @throws when the sidecar cannot be read or written
   */
  editMap(change: (data: MapData) => MapData | null): Promise<boolean>;
  /** Applies a command; `false` if core rejected it (state unchanged). */
  run(command: Command): boolean;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** The TV shows nothing because the campaign could not be read or projected. */
  readonly notOnTv: boolean;
  /** The campaign's visibility defaults (`{}` until it is read): what a token without its own follows. */
  readonly visibilityDefaults: VisibilityRules;
  /** The campaign's grid mode for scenes without their own (T-233d); `undefined` until read. */
  readonly campaignGridMode: GridMode | undefined;
  /** Saving the last change failed (it stays in memory; the next change or `retrySave` retries). */
  readonly saveFailed: boolean;
  /** A write is queued or in flight, so the file does not have the latest change yet. */
  readonly saving: boolean;
  /** Writes the current scene again, e.g. after a failed save. */
  retrySave(): void;
  /**
   * Resolves once every change so far has been written – before reading or moving the file.
   * @returns whether the last write succeeded (`false`: the file lacks the latest changes)
   */
  flush(): Promise<boolean>;
}

/**
 * The open scene while the DM works on it (ARCHITECTURE §5.1): commands go through core with an
 * undo history, every change is saved to the scene file in order, and the table TV gets the
 * projection of each state – synchronously, so edits never blank it. The campaign (visibility
 * defaults) is read once per open scene; until then, and if it cannot be read, the TV shows
 * nothing (fail closed). Only the scene `onTv` feeds the TV (T-223a): several may be open.
 */
export function useSceneSession(
  service: LibraryService,
  slug: string,
  opened: Scene,
  onTv = true,
): SceneSession {
  const feed = useContext(PlayerFeedContext);
  const { t } = useTranslation();
  const [scene, setScene] = useState(opened);
  const latestScene = useRef(scene);
  latestScene.current = scene;
  const [history, setHistory] = useState<History>(createHistory);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [notOnTv, setNotOnTv] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const failed = useRef(false);

  // A scene opened (or replaced from outside, e.g. a new map) starts a fresh history.
  useEffect(() => {
    setScene(opened);
    setHistory(createHistory());
    // Replaced from outside (e.g. a restored rescue copy, written already): saved as it is.
    failed.current = false;
    setSaveFailed(false);
  }, [opened]);

  useEffect(() => {
    let active = true;
    setCampaign(null);
    setNotOnTv(false);
    loadCampaign(service.fs, slug).then(
      (result) => {
        if (!active) return;
        if (result.status === "ok") setCampaign(result.value);
        else setNotOnTv(true);
      },
      () => {
        if (active) setNotOnTv(true);
      },
    );
    return () => {
      active = false;
    };
  }, [service, slug]);

  // A scene moving its version 2 copy of grid and levels into the sidecar is saved without it,
  // outside the history: it happens on opening, before any edit.
  const {
    data: mapData,
    changed: mapChanged,
    acceptChange,
    applyOwnEdit,
  } = useMapData(service, scene, () => {
    // The scene as it is now: only the copy goes, nothing else from when the settling began.
    const settled = withoutLegacyMap(latestScene.current);
    setScene(settled);
    save(settled);
  });
  const defaultLevelName = t("campaign.defaultLevel");
  const resolved = useMemo(() => {
    if (!scene.map || mapData.status !== "ready") return null;
    return resolveMap({
      kind: scene.map.kind,
      asset: scene.map.asset,
      data: mapData.data,
      overrides: scene.map.overrides,
      defaultLevel: { id: DEFAULT_LEVEL_ID, name: defaultLevelName },
    });
  }, [scene.map, mapData, defaultLevelName]);
  const map = resolved?.map ?? null;
  const mapLoading = mapData.status === "loading";

  // The TV follows every state of the scene on it (T-223a: one of the open scenes, chosen by
  // the DM); nothing while the campaign is unknown or the map loads, nothing after closing it.
  const shownOnTv = useRef(onTv);
  shownOnTv.current = onTv;
  // Whether this scene has shown on the TV since it was sent there: until then, a scene that
  // is not ready (campaign unread, map loading) darkens the TV instead of leaving the previous
  // scene frozen on it (fail closed). A later map change keeps the TV as it is, as before.
  const shownSinceSent = useRef(false);
  useEffect(() => {
    if (!onTv) {
      shownSinceSent.current = false;
      setNotOnTv(false);
      return;
    }
    if (!feed) return;
    if (!campaign || mapLoading) {
      if (!shownSinceSent.current) feed.show(null);
      return;
    }
    shownSinceSent.current = true;
    try {
      feed.show(projectForViewer({ campaign, scene, map }, { kind: "table" }));
      setNotOnTv(false);
    } catch (error) {
      console.error("The scene cannot be shown on the TV.", error);
      feed.show(null);
      setNotOnTv(true);
    }
  }, [onTv, feed, campaign, scene, map, mapLoading]);
  useEffect(
    () => () => {
      // Another open scene leaves the TV alone (the one on it may already be showing).
      if (shownOnTv.current) feed?.show(null);
    },
    [feed],
  );

  const rescue = useContext(SceneRescueContext);
  // Whether this session kept a rescue copy (T-114b): only then does a later successful save
  // drop it. A copy from an earlier session is newer than the scene opened from disk.
  const keptRescue = useRef(false);
  const save = useCallback(
    (next: Scene) => {
      // Chained, so writes land in the order the DM made the changes.
      setPendingWrites((count) => count + 1);
      saving.current = saving.current.then(() =>
        saveScene(service.fs, slug, next)
          .then(
            () => {
              failed.current = false;
              setSaveFailed(false);
              if (keptRescue.current) {
                keptRescue.current = false;
                rescue?.drop(slug, next.id);
              }
            },
            (error: unknown) => {
              console.error("Saving the scene failed.", error);
              failed.current = true;
              setSaveFailed(true);
              // Kept on this device until it is saved (T-114b): a crash now loses nothing.
              rescue?.keep(slug, next);
              keptRescue.current = rescue !== null;
            },
          )
          .finally(() => {
            setPendingWrites((count) => count - 1);
          }),
      );
    },
    [service, slug, rescue],
  );

  const commit = (state: SessionState, nextHistory: History) => {
    setScene(state.scene);
    setHistory(nextHistory);
    save(state.scene);
  };

  // Commands only touch the scene here; the campaign and the map's data are read-only in this
  // session. Undo restores scenes and always plays them on the current map data.
  const state = (): SessionState | null =>
    campaign ? { campaign, scene, map } : null;

  return {
    scene,
    map,
    mapData,
    orphanedOverrides: resolved?.orphanedOverrides ?? [],
    mapChanged,
    acceptMapChange: acceptChange,
    async editMap(change) {
      const ref = scene.map;
      if (!ref || mapData.status !== "ready" || mapData.legacy || mapChanged)
        return false;
      const defaults = newMapData(defaultLevelName);
      // Written only onto what the DM sees, so a change from elsewhere still waits (ADR-0012).
      const written = await updateMapData(
        service.fs,
        ref.asset,
        defaults,
        change,
        mapData.data ?? defaults,
      );
      if (!written) return false;
      applyOwnEdit(written);
      return true;
    },
    run(command) {
      const current = state();
      if (!current) return false;
      const result = execute(current, history, command, ctx);
      if (!result.ok) return false;
      // A command that changes nothing (e.g. showing the level already on the TV) writes nothing.
      if (result.state !== current) commit(result.state, result.history);
      return true;
    },
    undo() {
      const current = state();
      const result = current && undo(current, history);
      if (result) commit(result.state, result.history);
    },
    redo() {
      const current = state();
      const result = current && redo(current, history);
      if (result) commit(result.state, result.history);
    },
    canUndo: campaign !== null && history.past.length > 0,
    canRedo: campaign !== null && history.future.length > 0,
    notOnTv,
    visibilityDefaults: campaign?.visibilityDefaults ?? NO_DEFAULTS,
    campaignGridMode: campaign?.gridMode,
    saveFailed,
    saving: pendingWrites > 0,
    retrySave() {
      save(scene);
    },
    async flush() {
      await saving.current;
      return !failed.current;
    },
  };
}
