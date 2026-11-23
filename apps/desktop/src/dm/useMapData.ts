import { levelsInUse } from "@dungeon-manager/core";
import type { MapData, Scene } from "@dungeon-manager/schema";
import {
  DEFAULT_LEVEL_ID,
  loadSidecar,
  settleLegacyMap,
  SIDECAR_SUFFIX,
} from "@dungeon-manager/storage";
import { useEffect, useRef, useState } from "react";
import type { LibraryService } from "../platform/library.js";
import { useLibraryChanges } from "./useLibraryChanges.js";

/** The global data of the open scene's map (ADR-0012), as far as it is known. */
export type MapDataState =
  | { readonly status: "noMap" }
  | { readonly status: "loading" }
  /**
   * `data` is `null` for a map without data yet (defaults apply). `legacy`: the scene plays its
   * own version 2 copy, because it differs from the map's data – the DM decides (T-134d).
   */
  | {
      readonly status: "ready";
      readonly data: MapData | null;
      readonly legacy: boolean;
    }
  /** The sidecar is not downloaded yet or broken: nothing is shown, nothing written. */
  | { readonly status: "unavailable" };

/** The open scene's map data, and a newer version that waits for the DM. */
export interface MapDataSession {
  /** What the scene plays (and the TV shows). */
  readonly data: MapDataState;
  /**
   * The map's data changed on disk (another device, another workspace) while the scene is on
   * the TV: it is applied only when the DM accepts it (ADR-0012).
   */
  readonly changed: boolean;
  readonly acceptChange: () => void;
  /**
   * Shows data the DM just wrote to the sidecar from this scene (T-118d), so its watcher echo
   * compares equal and is not held as a change from elsewhere.
   */
  readonly applyOwnEdit: (data: MapData) => void;
}

/**
 * Loads the open scene's map data from the map's sidecar. A later change of the sidecar on disk
 * waits for the DM (`changed`), because an open scene may be live on the TV and a global edit
 * must not change the table view by surprise (ADR-0012); a change to what is shown already is
 * taken silently. Every open scene tab holds such changes (T-223a), the one on the TV and the
 * ones prepared beside it; a tab shows the question when it is the shown one. A scene still carrying its version 2 copy (`legacyMap`) moves it into the sidecar
 * first (`settleLegacyMap`); `onSettled` then drops the copy from the scene and saves it.
 *
 * A missing sidecar means defaults – unless the scene refers to other levels than the default
 * one: then the sidecar most likely has not synced yet, and playing defaults would hide the
 * scene's fog and invite a placeholder sidecar that conflicts with the real one.
 */
export function useMapData(
  service: LibraryService,
  scene: Scene,
  onSettled: () => void,
): MapDataSession {
  const [state, setState] = useState<MapDataState>({ status: "loading" });
  const [pending, setPending] = useState<MapDataState | null>(null);
  // The map (and copy) the shown data belongs to: a reload of the same map waits for the DM.
  const loadedFor = useRef<string | null>(null);
  const shown = useRef(state);
  shown.current = state;
  const [version, setVersion] = useState(0);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });
  const path = scene.map?.asset.path;
  const legacy = scene.map?.legacyMap;
  // The latest scene for the settle step, without reloading on every fog edit.
  const latest = useRef(scene);
  latest.current = scene;

  useLibraryChanges(
    service,
    (changed) => path !== undefined && changed === `${path}${SIDECAR_SUFFIX}`,
    () => {
      setVersion((count) => count + 1);
    },
  );

  useEffect(() => {
    if (path === undefined) {
      loadedFor.current = null;
      setState({ status: "noMap" });
      setPending(null);
      return;
    }
    let active = true;
    const key = `${path}\n${legacy ? "legacy" : ""}`;
    const reload = loadedFor.current === key;
    if (!reload) {
      setState({ status: "loading" });
      setPending(null);
    }
    const load = async (): Promise<MapDataState> => {
      if (legacy) {
        const outcome = await settleLegacyMap(service.fs, latest.current).catch(
          (error: unknown) => {
            console.error("Moving the scene's map data failed.", error);
            return "unavailable" as const;
          },
        );
        if (outcome === "settled") {
          if (active) settled.current();
          return { status: "loading" };
        }
        // Its own copy is safe to play; only a real difference is the DM's to decide.
        return {
          status: "ready",
          data: { grid: legacy.grid, levels: legacy.levels, areas: [] },
          legacy: outcome === "differs",
        };
      }
      const loaded = await loadSidecar(service.fs, path);
      if (loaded.status === "ok")
        return {
          status: "ready",
          data: loaded.value.map ?? null,
          legacy: false,
        };
      if (loaded.status === "missing") {
        const unknown = [...levelsInUse(latest.current)].some(
          (id) => id !== DEFAULT_LEVEL_ID,
        );
        return unknown
          ? { status: "unavailable" }
          : { status: "ready", data: null, legacy: false };
      }
      return { status: "unavailable" };
    };
    load().then(
      (next) => {
        if (!active) return;
        loadedFor.current = key;
        const current = shown.current;
        if (!reload || current.status !== "ready") {
          setState(next);
          setPending(null);
        } else if (
          next.status !== "ready" ||
          JSON.stringify(next) === JSON.stringify(current)
        ) {
          // Our own write coming back from the watcher changes nothing; a sidecar that cannot
          // be read for a moment (evicted, mid-sync) keeps what the TV shows.
          setPending(null);
        } else setPending(next);
      },
      (error: unknown) => {
        console.error("The map data cannot be read.", error);
        if (!active) return;
        setPending(null);
        // As above: what is shown stays when only a reload fails.
        if (!reload || shown.current.status !== "ready")
          setState({ status: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [service, path, legacy, version]);

  return {
    data: state,
    changed: pending !== null,
    acceptChange: () => {
      if (!pending) return;
      setState(pending);
      setPending(null);
    },
    applyOwnEdit: (data) => {
      setState({ status: "ready", data, legacy: false });
      setPending(null);
    },
  };
}
