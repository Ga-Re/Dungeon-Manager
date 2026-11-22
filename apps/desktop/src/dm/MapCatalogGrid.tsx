import type { CatalogMap } from "@dungeon-manager/storage";
import { CircleAlert, Film, Image as ImageIcon } from "lucide-react";
import { useContext, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { fileName } from "./file-name.js";
import { catalogPreview, PreviewCancelled } from "./map-catalog.js";
import { MapViewContext } from "./MapView.js";

const MAPS_FOLDER = "library/maps/";

/** The folder a map lies in below `library/maps/`, or "" at its top. */
function folderOf(path: string): string {
  const inside = path.slice(MAPS_FOLDER.length);
  const slash = inside.lastIndexOf("/");
  return slash < 0 ? "" : inside.slice(0, slash);
}

/** Maps whose path contains every word of `query`, ignoring case. */
export function filterMaps(
  maps: readonly CatalogMap[],
  query: string,
): readonly CatalogMap[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return maps;
  return maps.filter((map) => {
    const path = map.path.slice(MAPS_FOLDER.length).toLocaleLowerCase();
    return words.every((word) => path.includes(word));
  });
}

/** Calls back once the element is (nearly) on screen; at once where nothing can tell. */
function useOnScreen(element: HTMLElement | null): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!element || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      // A little ahead of scrolling, so previews are there when the tile shows.
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element, seen]);
  return seen;
}

/**
 * A map's preview, loaded or drawn once the tile comes on screen (hashing reads the whole
 * file); its kind's icon until then or if it cannot be drawn.
 */
function MapThumbnail({
  service,
  path,
  kind,
}: {
  readonly service: LibraryService;
  readonly path: string;
  readonly kind: CatalogMap["kind"];
}) {
  const maps = useContext(MapViewContext);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const onScreen = useOnScreen(element);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!onScreen) return;
    let active = true;
    let objectUrl: string | null = null;
    // Path and kind, not the list's object: a reread list must not redraw every tile.
    const preview = catalogPreview(service, maps, {
      path,
      kind,
      sidecarConflicts: [],
    });
    preview.promise.then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      (error: unknown) => {
        // The tile keeps its icon; the map can still be picked.
        if (active && !(error instanceof PreviewCancelled))
          console.warn(`No preview for ${path}.`, error);
      },
    );
    return () => {
      active = false;
      preview.release();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [service, maps, path, kind, onScreen]);

  return (
    <span ref={setElement} className="dm-map-thumb" aria-hidden="true">
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : kind === "video" ? (
        <Film />
      ) : (
        <ImageIcon />
      )}
    </span>
  );
}

/** A tile's text: file name, folder, and what to know about it. */
function TileText({ map }: { readonly map: CatalogMap }) {
  const { t } = useTranslation();
  const folder = folderOf(map.path);
  return (
    <span className="dm-map-tile-text">
      <span className="dm-map-tile-name">{fileName(map.path)}</span>
      {folder && <span className="dm-map-tile-folder">{folder}</span>}
      {map.kind === "video" && (
        <span className="dm-map-tile-badge">
          <Film aria-hidden="true" />
          {t("catalog.video")}
        </span>
      )}
      {map.sidecarConflicts.length > 0 && (
        <span
          className="dm-map-tile-badge dm-map-tile-warning"
          title={map.sidecarConflicts.join("\n")}
        >
          <CircleAlert aria-hidden="true" />
          {t("catalog.sidecarConflicts", {
            count: map.sidecarConflicts.length,
          })}
        </span>
      )}
    </span>
  );
}

/**
 * The maps of the library as a grid of previews with a search (T-124): in the data panel to
 * look through, in the map picker to choose from (`onPick`).
 */
export function MapCatalogGrid({
  service,
  maps,
  onPick,
  disabled = false,
}: {
  readonly service: LibraryService;
  readonly maps: readonly CatalogMap[];
  readonly onPick?: (map: CatalogMap) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslation();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const shown = filterMaps(maps, query);

  return (
    <div className="dm-map-catalog">
      <label htmlFor={searchId} className="visually-hidden">
        {t("catalog.search")}
      </label>
      <input
        id={searchId}
        type="search"
        className="dm-map-search"
        placeholder={t("catalog.search")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {maps.length === 0 ? (
        <p className="dm-catalog-notice">{t("catalog.empty.maps")}</p>
      ) : shown.length === 0 ? (
        <p className="dm-catalog-notice">{t("catalog.noMatch")}</p>
      ) : (
        <ul className="dm-map-grid" aria-label={t("catalog.groups.maps")}>
          {shown.map((map) => (
            <li key={map.path} title={map.path}>
              {onPick ? (
                <button
                  type="button"
                  className="dm-map-tile"
                  disabled={disabled}
                  onClick={() => {
                    onPick(map);
                  }}
                >
                  <MapThumbnail
                    service={service}
                    path={map.path}
                    kind={map.kind}
                  />
                  <TileText map={map} />
                </button>
              ) : (
                <div className="dm-map-tile">
                  <MapThumbnail
                    service={service}
                    path={map.path}
                    kind={map.kind}
                  />
                  <TileText map={map} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
