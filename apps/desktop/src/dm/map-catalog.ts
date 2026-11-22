import type { AssetRef } from "@dungeon-manager/schema";
import {
  listLibraryMaps,
  previewFile,
  type CatalogMap,
} from "@dungeon-manager/storage";
import { useCallback, useEffect, useState } from "react";
import type { LibraryService } from "../platform/library.js";
import type { MapViewService } from "../platform/map-images.js";
import { renderPreview } from "./map-preview.js";

/** At most this many maps are hashed or drawn at once: a grid of videos must not stall the DM. */
const CONCURRENT = 2;

/** Per library service: hashes by path, so a map is hashed once per session, not per grid. */
interface CatalogStore {
  readonly hashes: Map<string, Promise<AssetRef>>;
  readonly previews: Map<string, Promise<Blob>>;
  readonly queue: (() => void)[];
  running: number;
}

const stores = new WeakMap<LibraryService, CatalogStore>();

function storeOf(service: LibraryService): CatalogStore {
  let store = stores.get(service);
  if (!store) {
    store = { hashes: new Map(), previews: new Map(), queue: [], running: 0 };
    stores.set(service, store);
  }
  return store;
}

/** Runs `work` once fewer than `CONCURRENT` other jobs of this store are running. */
function limited<T>(store: CatalogStore, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      store.running += 1;
      work()
        .then(resolve, reject)
        .finally(() => {
          store.running -= 1;
          store.queue.shift()?.();
        });
    };
    if (store.running < CONCURRENT) start();
    else store.queue.push(start);
  });
}

/** Remembers a promise until it fails, so a failure is tried again next time. */
function remembered<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  make: () => Promise<T>,
): Promise<T> {
  const known = cache.get(key);
  if (known) return known;
  const made = make();
  cache.set(key, made);
  made.catch(() => {
    if (cache.get(key) === made) cache.delete(key);
  });
  return made;
}

/** The asset reference of a catalog map (hashed by the backend once per session). */
export function catalogAsset(
  service: LibraryService,
  path: string,
): Promise<AssetRef> {
  const store = storeOf(service);
  return remembered(store.hashes, path, () =>
    limited(store, () => service.hashFile(path)),
  );
}

/**
 * A catalog map's preview: the stored one in `library/.previews/`, else drawn now (needs
 * `maps`) and stored for the next time and the other devices.
 */
export function catalogPreview(
  service: LibraryService,
  maps: MapViewService | null,
  map: CatalogMap,
): Promise<Blob> {
  const store = storeOf(service);
  return remembered(store.previews, map.path, async () => {
    const { hash } = await catalogAsset(service, map.path);
    try {
      return await service.readImage(previewFile(hash));
    } catch {
      // No preview yet (or an unreadable one): draw it below.
    }
    if (!maps) throw new Error(`No preview for ${map.path}.`);
    const blob = await limited(store, () => renderPreview(maps, map));
    await service.writePreview(hash, new Uint8Array(await blob.arrayBuffer()));
    return blob;
  });
}

/** Forgets what is known about changed files, so they are hashed and drawn again. */
function forget(service: LibraryService, paths: readonly string[]): void {
  const store = storeOf(service);
  for (const path of paths) {
    store.hashes.delete(path);
    store.previews.delete(path);
  }
}

/** The maps in the library (T-124), kept up to date with changes on disk. */
export type CatalogState =
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly maps: readonly CatalogMap[] }
  | { readonly status: "error"; readonly error: unknown };

/** Lists the library's maps while `ready`, again whenever a file under `library/` changes. */
export function useMapCatalog(
  service: LibraryService,
  ready: boolean,
): CatalogState & { readonly reload: () => void } {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    listLibraryMaps(service.fs).then(
      (maps) => {
        if (active) setState({ status: "ok", maps });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", error });
      },
    );
    return () => {
      active = false;
    };
  }, [service, ready, version]);

  useEffect(() => {
    if (!ready) return;
    let unsubscribe: (() => void) | null = null;
    let active = true;
    service
      .onChange((paths) => {
        const library = paths.filter((path) => path.startsWith("library/"));
        if (library.length === 0) return;
        forget(service, library);
        // A new preview is no new map: only list again when maps may have changed.
        if (library.some((path) => !path.startsWith("library/.previews/")))
          reload();
      })
      .then(
        (stop) => {
          if (active) unsubscribe = stop;
          else stop();
        },
        (error: unknown) => {
          // The catalog still works; it only misses changes made outside the app.
          console.warn("The map catalog does not see library changes.", error);
        },
      );
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [service, ready, reload]);

  return { ...state, reload };
}
