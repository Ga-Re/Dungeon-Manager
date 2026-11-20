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

/**
 * Loads the open scene's map data from the map's sidecar and reloads it when the sidecar changes
 * on disk. A scene still carrying its version 2 copy (`legacyMap`) moves it into the sidecar
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
): MapDataState {
  const [state, setState] = useState<MapDataState>({ status: "loading" });
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
      setState({ status: "noMap" });
      return;
    }
    let active = true;
    setState({ status: "loading" });
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
          data: { grid: legacy.grid, levels: legacy.levels, rooms: [] },
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
        if (active) setState(next);
      },
      (error: unknown) => {
        console.error("The map data cannot be read.", error);
        if (active) setState({ status: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [service, path, legacy, version]);

  return state;
}
