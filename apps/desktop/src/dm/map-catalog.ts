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

/** At most this many previews are made at once: a grid of videos must not stall the DM. */
const CONCURRENT = 2;

/** A preview being made, shared by every tile that shows it. */
interface PreviewJob {
  readonly promise: Promise<Blob>;
  /** Tiles waiting for it; with none left before it started, it never starts. */
  users: number;
}

/** Per library service, for this session: hashes and previews by map path. */
interface CatalogStore {
  readonly hashes: Map<string, Promise<AssetRef>>;
  readonly previews: Map<string, PreviewJob>;
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

/** Why a preview was never made: every tile that wanted it went away first. */
export class PreviewCancelled extends Error {
  constructor() {
    super("No tile shows this preview any more.");
    this.name = "PreviewCancelled";
  }
}

/**
 * Runs `work` once fewer than `CONCURRENT` other jobs of this store are running – unless
 * `wanted` says by then that nobody waits for it any more.
 */
function limited<T>(
  store: CatalogStore,
  wanted: () => boolean,
  work: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      if (!wanted()) {
        reject(new PreviewCancelled());
        store.queue.shift()?.();
        return;
      }
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

/** The asset reference of a catalog map (hashed by the backend once per session). */
export function catalogAsset(
  service: LibraryService,
  path: string,
): Promise<AssetRef> {
  const { hashes } = storeOf(service);
  const known = hashes.get(path);
  if (known) return known;
  const made = service.hashFile(path);
  hashes.set(path, made);
  // A failure is tried again next time.
  made.catch(() => {
    if (hashes.get(path) === made) hashes.delete(path);
  });
  return made;
}

/**
 * A catalog map's preview: the stored one in `library/.previews/`, else drawn now (needs
 * `maps`) and stored for the next time and the other devices. Hashing (which reads the whole
 * file) and drawing run only while some tile wants the preview: call `release` when it goes.
 */
export function catalogPreview(
  service: LibraryService,
  maps: MapViewService | null,
  map: CatalogMap,
): { readonly promise: Promise<Blob>; readonly release: () => void } {
  const store = storeOf(service);
  let job = store.previews.get(map.path);
  if (!job) {
    // Held before it may start: an idle queue starts the work at once.
    const wanted = { users: 1 };
    const created: PreviewJob = Object.assign(wanted, {
      promise: limited(
        store,
        () => wanted.users > 0,
        () => makePreview(service, maps, map),
      ),
    });
    job = created;
    store.previews.set(map.path, created);
    // A failure (or a cancelled job) is tried again next time.
    created.promise.catch(() => {
      if (store.previews.get(map.path) === created)
        store.previews.delete(map.path);
    });
  } else job.users += 1;
  const held = job;
  let released = false;
  return {
    promise: held.promise,
    release: () => {
      if (released) return;
      released = true;
      held.users -= 1;
    },
  };
}

async function makePreview(
  service: LibraryService,
  maps: MapViewService | null,
  map: CatalogMap,
): Promise<Blob> {
  const { hash } = await catalogAsset(service, map.path);
  try {
    return await service.readImage(previewFile(hash));
  } catch {
    // No preview yet (or an unreadable one): draw it below.
  }
  if (!maps) throw new Error(`No preview for ${map.path}.`);
  const blob = await renderPreview(maps, map);
  try {
    await service.writePreview(hash, new Uint8Array(await blob.arrayBuffer()));
  } catch (error) {
    // Shown all the same; it is drawn again next session.
    console.warn(`The preview of ${map.path} could not be stored.`, error);
  }
  return blob;
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

  // Another library (or none): its maps are not this one's.
  useEffect(() => {
    setState({ status: "loading" });
  }, [service, ready]);

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
