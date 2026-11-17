import {
  createHistory,
  execute,
  projectForViewer,
  redo,
  undo,
  type Command,
  type History,
  type SessionState,
} from "@dungeon-manager/core";
import type { Campaign, Scene } from "@dungeon-manager/schema";
import { loadCampaign, saveScene } from "@dungeon-manager/storage";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { LibraryService } from "../platform/library.js";
import { PlayerFeedContext } from "./player-feed-context.js";

/** Time and randomness for core commands (ARCHITECTURE §4: injected, never read inside core). */
const ctx = { now: () => Date.now(), random: () => Math.random() };

export interface SceneSession {
  /** The scene as edited so far (saved after every change). */
  readonly scene: Scene;
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
  const [scene, setScene] = useState(opened);
  const [history, setHistory] = useState<History>(createHistory);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [notOnTv, setNotOnTv] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
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

  // The TV follows every state; nothing while the campaign is unknown, nothing after closing.
  useEffect(() => {
    if (!feed || !campaign) return;
    try {
      feed.show(projectForViewer({ campaign, scene }, { kind: "table" }));
      setNotOnTv(false);
    } catch (error) {
      console.error("The scene cannot be shown on the TV.", error);
      feed.show(null);
      setNotOnTv(true);
    }
  }, [feed, campaign, scene]);
  useEffect(
    () => () => {
      feed?.show(null);
    },
    [feed],
  );

  const save = useCallback(
    (next: Scene) => {
      // Chained, so writes land in the order the DM made the changes.
      saving.current = saving.current.then(() =>
        saveScene(service.fs, slug, next).then(
          () => {
            failed.current = false;
            setSaveFailed(false);
          },
          (error: unknown) => {
            console.error("Saving the scene failed.", error);
            failed.current = true;
            setSaveFailed(true);
          },
        ),
      );
    },
    [service, slug],
  );

  const commit = (state: SessionState, nextHistory: History) => {
    setScene(state.scene);
    setHistory(nextHistory);
    save(state.scene);
  };

  // Commands only touch the scene here; the campaign is read-only in this session.
  const state = (): SessionState | null =>
    campaign ? { campaign, scene } : null;

  return {
    scene,
    run(command) {
      const current = state();
      if (!current) return false;
      const result = execute(current, history, command, ctx);
      if (!result.ok) return false;
      commit(result.state, result.history);
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
    retrySave() {
      save(scene);
    },
    async flush() {
      await saving.current;
      return !failed.current;
    },
  };
}
