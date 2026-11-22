import type { Sidecar } from "@dungeon-manager/schema";
import {
  loadSidecar,
  mapKind,
  newMapData,
  SIDECAR_SUFFIX,
} from "@dungeon-manager/storage";
import { IconButton, TreeList, type TreeNode } from "@dungeon-manager/ui";
import { DoorOpen, Folder, Layers, Map as MapIcon, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { fileName } from "./file-name.js";
import { ItemInfoEditor } from "./ItemInfoEditor.js";
import { MapDataEditor } from "./MapDataEditor.js";
import { MapView } from "./MapView.js";
import { ShellPortal } from "./shell/slots.js";
import { useActiveWorkspace } from "./shell/workspace.js";
import { useLibraryChanges } from "./useLibraryChanges.js";

/** A map's sidecar as the Map Forge reads it: `null` while it has none. */
type SidecarState =
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly sidecar: Sidecar | null }
  | { readonly status: "unavailable" };

/** Reads a map's sidecar, again whenever it changes on disk. */
function useSidecar(
  service: LibraryService,
  path: string | null,
): SidecarState & { readonly reload: () => void } {
  const [state, setState] = useState<SidecarState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);
  useLibraryChanges(
    service,
    (changed) => path !== null && changed === `${path}${SIDECAR_SUFFIX}`,
    reload,
  );
  useEffect(() => {
    setState({ status: "loading" });
  }, [path]);
  useEffect(() => {
    if (path === null) return;
    let active = true;
    loadSidecar(service.fs, path).then(
      (loaded) => {
        if (!active) return;
        setState(
          loaded.status === "ok"
            ? { status: "ok", sidecar: loaded.value }
            : loaded.status === "missing"
              ? { status: "ok", sidecar: null }
              : { status: "unavailable" },
        );
      },
      () => {
        if (active) setState({ status: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [service, path, version]);
  return { ...state, reload };
}

/**
 * The Map Forge's document (T-176a, ADR-0017): a library map opened without a scene. While the
 * Map Forge shows, it fills the title bar's tab, the map panel (the map with its grid, no fog),
 * the browser (its levels and rooms) and the Eigenschaften panel (its metadata, stored in its
 * sidecar for every scene, ADR-0012).
 */
export function MapForge({
  service,
  path,
  onClose,
}: {
  readonly service: LibraryService;
  /** The open map (`library/…`), or `null`. */
  readonly path: string | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const shown = useActiveWorkspace() === "mapForge";
  const loaded = useSidecar(service, path);
  if (!shown) return null;
  if (path === null)
    return (
      <ShellPortal slot="canvas">
        <p className="dm-forge-empty">{t("forge.empty")}</p>
      </ShellPortal>
    );

  const defaults = newMapData(t("campaign.defaultLevel"));
  const sidecar = loaded.status === "ok" ? loaded.sidecar : null;
  const data = sidecar?.map ?? defaults;
  const info = sidecar?.info;
  const name = info?.name ?? fileName(path);
  const kind = mapKind(path);
  const tree: TreeNode = {
    id: "forge:map",
    label: name,
    icon: <MapIcon />,
    children: [
      {
        id: "forge:levels",
        label: t("forge.levels"),
        icon: <Folder />,
        children: data.levels
          .filter((level) => level.archived !== true)
          .map((level) => ({
            id: `forge:level:${level.id}`,
            label: level.name,
            icon: <Layers />,
          })),
      },
      data.rooms.length > 0
        ? {
            id: "forge:rooms",
            label: t("forge.rooms"),
            icon: <Folder />,
            children: data.rooms.map((room) => ({
              id: `forge:room:${room.id}`,
              label: room.name,
              icon: <DoorOpen />,
            })),
          }
        : {
            id: "forge:rooms",
            label: t("forge.rooms"),
            icon: <Folder />,
            meta: t("forge.noRooms"),
          },
    ],
  };

  return (
    <>
      <ShellPortal slot="titleScene">
        <span
          role="group"
          aria-label={t("forge.openMap")}
          className="dm-scene-tabs"
        >
          <span className="dm-scene-tab" data-current="true">
            <span className="dm-scene-tab-name" aria-current="true">
              {name}
            </span>
            <IconButton
              icon={<X />}
              label={t("forge.close", { name })}
              onClick={onClose}
            />
          </span>
        </span>
      </ShellPortal>
      <ShellPortal slot="canvas">
        <MapView
          key={path}
          path={path}
          kind={kind}
          label={name}
          fog={null}
          grid={data.grid}
        />
      </ShellPortal>
      <ShellPortal slot="browser">
        <div className="dm-campaign-browser">
          <TreeList label={t("forge.tree")} variant="compact" nodes={[tree]} />
        </div>
      </ShellPortal>
      <ShellPortal slot="details">
        <div className="dm-forge-details">
          {loaded.status === "unavailable" && (
            <p role="alert">{t("campaign.mapData.notReadable")}</p>
          )}
          {loaded.status === "ok" && (
            <>
              <ItemInfoEditor
                key={`info:${path}`}
                service={service}
                map={{
                  path,
                  kind,
                  sidecarConflicts: [],
                  ...(info && { info }),
                }}
                onSaved={loaded.reload}
              />
              <MapDataEditor
                key={`data:${path}`}
                service={service}
                path={path}
                data={data}
                defaults={defaults}
                onSaved={loaded.reload}
              />
            </>
          )}
        </div>
      </ShellPortal>
    </>
  );
}
