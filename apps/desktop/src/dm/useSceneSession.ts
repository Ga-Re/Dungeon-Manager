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
import type { Campaign, Scene } from "@dungeon-manager/schema";
import {
  DEFAULT_LEVEL_ID,
  loadCampaign,
  saveScene,
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
import { useMapData, type MapDataState } from "./useMapData.js";

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
  /** Applies a command; `false` if core rejected it (state unchanged). */
  run(command: Command): boolean;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** The TV shows nothing because the campaign could not be read or projected. */
  readonly notOnTv: boolean;
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
 * nothing (fail closed).
 */
export function useSceneSession(
  service: LibraryService,
  slug: string,
  opened: Scene,
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
  const mapData = useMapData(service, scene, () => {
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

  // The TV follows every state; nothing while the campaign is unknown or the map loads, nothing
  // after closing.
  useEffect(() => {
    if (!feed || !campaign || mapLoading) return;
    try {
      feed.show(projectForViewer({ campaign, scene, map }, { kind: "table" }));
      setNotOnTv(false);
    } catch (error) {
      console.error("The scene cannot be shown on the TV.", error);
      feed.show(null);
      setNotOnTv(true);
    }
  }, [feed, campaign, scene, map, mapLoading]);
  useEffect(
    () => () => {
      feed?.show(null);
    },
    [feed],
  );

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
            },
            (error: unknown) => {
              console.error("Saving the scene failed.", error);
              failed.current = true;
              setSaveFailed(true);
            },
          )
          .finally(() => {
            setPendingWrites((count) => count - 1);
          }),
      );
    },
    [service, slug],
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
