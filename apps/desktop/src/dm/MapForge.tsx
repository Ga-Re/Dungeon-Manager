import {
  CALIBRATION_CELLS,
  gridFromBox,
  newRoomId,
  roomsOnLevel,
  shiftGrid,
  snapArea,
  type RoomShape,
} from "@dungeon-manager/core";
import type {
  Grid,
  MapData,
  Polygon,
  Room,
  Sidecar,
} from "@dungeon-manager/schema";
import {
  loadSidecar,
  mapKind,
  MapDataChangedError,
  newMapData,
  SIDECAR_SUFFIX,
  updateMapData,
} from "@dungeon-manager/storage";
import { IconButton, TreeList, type TreeNode } from "@dungeon-manager/ui";
import { DoorOpen, Folder, Layers, Map as MapIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { fileName } from "./file-name.js";
import { ItemInfoEditor } from "./ItemInfoEditor.js";
import { MapDataEditor, type CalibrationChoice } from "./MapDataEditor.js";
import { MapView } from "./MapView.js";
import { describeLibraryError } from "./describe-error.js";
import { RoomEditor, RoomTools } from "./ForgeRooms.js";
import { catalogAsset } from "./map-catalog.js";
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
  // Kept with the path it belongs to: right after another map opens, the old one's state is
  // never shown for the new one.
  const [state, setState] = useState<{
    readonly path: string | null;
    readonly value: SidecarState;
  }>({ path, value: { status: "loading" } });
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
    if (path === null) return;
    let active = true;
    loadSidecar(service.fs, path).then(
      (loaded) => {
        if (!active) return;
        setState({
          path,
          value:
            loaded.status === "ok"
              ? { status: "ok", sidecar: loaded.value }
              : loaded.status === "missing"
                ? { status: "ok", sidecar: null }
                : { status: "unavailable" },
        });
      },
      () => {
        if (active) setState({ path, value: { status: "unavailable" } });
      },
    );
    return () => {
      active = false;
    };
  }, [service, path, version]);
  return {
    ...(state.path === path ? state.value : { status: "loading" }),
    reload,
  };
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
  // Grid calibration (T-177): how the DM calibrates, the last grid calibrated on the map and
  // the grid the fields describe, shown on the map until saved or discarded.
  const [calibration, setCalibration] = useState<CalibrationChoice>({
    mode: null,
    cells: CALIBRATION_CELLS.default,
  });
  const [proposal, setProposal] = useState<{
    readonly grid: Grid;
    readonly seq: number;
  } | null>(null);
  const [preview, setPreview] = useState<Grid | null>(null);
  // What a grid drag or an arrow key starts from, known at once (not one render later): the
  // last calibrated or typed grid, "invalid" while the fields are, `null` for the stored one.
  const gridNow = useRef<Grid | "invalid" | null>(null);
  // A grid drag moves the grid it started from by the whole way since its start.
  const dragBase = useRef<Grid | null>(null);
  useEffect(() => {
    setCalibration((current) => ({ ...current, mode: null }));
    setProposal(null);
    setPreview(null);
    gridNow.current = null;
  }, [path]);
  const propose = useCallback((grid: Grid | null) => {
    if (!grid) return;
    gridNow.current = grid;
    setProposal((current) => ({ grid, seq: (current?.seq ?? 0) + 1 }));
  }, []);
  const onTyped = useCallback((grid: Grid | null | undefined) => {
    gridNow.current = grid === undefined ? null : (grid ?? "invalid");
  }, []);

  // Rooms (T-108c1): the level shown and drawn on, the shape being drawn, the selected room.
  const [levelChoice, setLevelChoice] = useState<string | null>(null);
  const [shape, setShape] = useState<RoomShape | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [justDrawn, setJustDrawn] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomProblem, setRoomProblem] = useState("");
  // The forge's own last write and the sidecar read before it: until a newer read arrives, the
  // map shows (and the next change starts from) what was written, so changes in quick
  // succession never take the forge's own write for a change from elsewhere.
  const ownWrite = useRef<{
    readonly data: MapData;
    readonly before: Sidecar | null;
  } | null>(null);
  // Alt draws a room freely, without snapping to the grid.
  const altDown = useRef(false);
  useEffect(() => {
    const track = (event: KeyboardEvent) => {
      altDown.current = event.altKey;
    };
    window.addEventListener("keydown", track);
    window.addEventListener("keyup", track);
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("keyup", track);
    };
  }, []);
  useEffect(() => {
    setLevelChoice(null);
    setShape(null);
    setSelectedRoom(null);
    setRoomProblem("");
  }, [path]);
  // Drawing a room and calibrating both take the map's pointer: one at a time.
  const chooseCalibration = useCallback((choice: CalibrationChoice) => {
    setCalibration(choice);
    if (choice.mode) setShape(null);
  }, []);
  const chooseShape = (next: RoomShape | null) => {
    setShape(next);
    if (next) setCalibration((current) => ({ ...current, mode: null }));
  };

  if (!shown) return null;
  if (path === null)
    return (
      <>
        <ShellPortal slot="canvas">
          <p className="dm-forge-empty">{t("forge.empty")}</p>
        </ShellPortal>
        <ShellPortal slot="browser">
          <p className="dm-forge-browser-empty">{t("forge.noMap")}</p>
        </ShellPortal>
      </>
    );

  const defaults = newMapData(t("campaign.defaultLevel"));
  const sidecar = loaded.status === "ok" ? loaded.sidecar : null;
  if (ownWrite.current && ownWrite.current.before !== sidecar)
    ownWrite.current = null;
  const data = ownWrite.current?.data ?? sidecar?.map ?? defaults;
  const info = sidecar?.info;
  const name = info?.name ?? fileName(path);
  const levels = data.levels.filter((level) => level.archived !== true);
  const level =
    levels.find((each) => each.id === levelChoice) ??
    levels[0] ??
    data.levels[0];
  const levelId = level?.id ?? "";
  // A level with its own file shows that file (ADR-0012: same size, one calibration).
  const shownPath = level?.asset?.path ?? path;
  const kind = mapKind(shownPath);
  const levelRooms = roomsOnLevel(data.rooms, data.levels, levelId);
  const room = data.rooms.find((each) => each.id === selectedRoom) ?? null;

  /** Saves a change of the rooms; `expected` keeps a change made elsewhere from being lost. */
  const changeRooms = async (change: (rooms: readonly Room[]) => Room[]) => {
    setRoomBusy(true);
    setRoomProblem("");
    try {
      const written = await updateMapData(
        service.fs,
        await catalogAsset(service, path),
        defaults,
        (current: MapData) => ({ ...current, rooms: change(current.rooms) }),
        data,
      );
      if (written) ownWrite.current = { data: written, before: sidecar };
      loaded.reload();
      return true;
    } catch (error) {
      setRoomProblem(
        error instanceof MapDataChangedError
          ? t("forgeRooms.changedMeanwhile")
          : describeLibraryError(t, error),
      );
      loaded.reload();
      return false;
    } finally {
      setRoomBusy(false);
    }
  };
  const addRoom = async (area: Polygon) => {
    if (!shape || roomBusy) return;
    const fitted = altDown.current ? area : snapArea(area, data.grid, shape);
    if (!fitted) {
      setRoomProblem(t("forgeRooms.tooSmall"));
      return;
    }
    const id = newRoomId(
      [...data.levels, ...data.rooms].map((each) => each.id),
    );
    const added = await changeRooms((rooms) => [
      ...rooms,
      {
        id,
        name: t("forgeRooms.defaultName", { number: levelRooms.length + 1 }),
        area: fitted,
        levelId,
      },
    ]);
    if (added) {
      setSelectedRoom(id);
      setJustDrawn(true);
    }
  };
  const editRoom = (id: string, edit: (room: Room) => Room | null) =>
    changeRooms((rooms) =>
      rooms.flatMap((each) => {
        if (each.id !== id) return [each];
        const next = edit(each);
        return next ? [next] : [];
      }),
    );

  const tree: TreeNode = {
    id: "forge:map",
    label: name,
    icon: <MapIcon />,
    children: [
      {
        id: "forge:levels",
        label: t("forge.levels"),
        icon: <Folder />,
        children: levels.map((each) => {
          const rooms = roomsOnLevel(data.rooms, data.levels, each.id);
          return {
            id: `forge:level:${each.id}`,
            label: each.name,
            icon: <Layers />,
            ...(rooms.length > 0
              ? {
                  children: rooms.map((each) => ({
                    id: `forge:room:${each.id}`,
                    label: each.name,
                    icon: <DoorOpen />,
                    ...(each.secret === true && {
                      meta: t("forgeRooms.secretMeta"),
                    }),
                  })),
                }
              : { meta: t("forge.noRooms") }),
          };
        }),
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
          key={shownPath}
          path={shownPath}
          kind={kind}
          label={name}
          fog={null}
          tool={shape && !roomBusy ? "reveal" : "pan"}
          shape={shape ?? "rectangle"}
          onArea={(area) => void addRoom(area)}
          toolHint={
            shape
              ? t(shape === "lasso" ? "forgeRooms.hintFree" : "forgeRooms.hint")
              : undefined
          }
          outlines={levelRooms.map((each) => ({
            id: each.id,
            label: each.name,
            area: each.area,
            selected: each.id === selectedRoom,
            secret: each.secret === true,
          }))}
          // Placeholder data is no grid of this map: none until its sidecar is read.
          grid={loaded.status === "ok" ? (preview ?? data.grid) : null}
          calibration={
            loaded.status === "ok" && calibration.mode
              ? {
                  mode: calibration.mode,
                  cells: calibration.cells,
                  onBox: (a, b) => {
                    propose(
                      gridFromBox([a.x, a.y], [b.x, b.y], calibration.cells),
                    );
                  },
                  // While the fields are invalid, moving would silently replace what is typed.
                  onShift: (dx, dy) => {
                    const from = gridNow.current ?? data.grid;
                    if (from !== "invalid") propose(shiftGrid(from, dx, dy));
                  },
                  onDragStart: () => {
                    const from = gridNow.current ?? data.grid;
                    dragBase.current = from === "invalid" ? null : from;
                  },
                  onDrag: (dx, dy) => {
                    if (dragBase.current)
                      propose(shiftGrid(dragBase.current, dx, dy));
                  },
                }
              : null
          }
        />
      </ShellPortal>
      <ShellPortal slot="browser">
        <div className="dm-campaign-browser">
          <TreeList
            label={t("forge.tree")}
            variant="compact"
            nodes={[tree]}
            selectedId={
              room ? `forge:room:${room.id}` : `forge:level:${levelId}`
            }
            onSelect={(id) => {
              if (id.startsWith("forge:level:")) {
                setLevelChoice(id.slice("forge:level:".length));
                setSelectedRoom(null);
              } else if (id.startsWith("forge:room:")) {
                const picked = data.rooms.find(
                  (each) => each.id === id.slice("forge:room:".length),
                );
                if (!picked) return;
                setSelectedRoom(picked.id);
                setJustDrawn(false);
                setLevelChoice(picked.levelId ?? data.levels[0]?.id ?? null);
              }
            }}
          />
        </div>
      </ShellPortal>
      <ShellPortal slot="details">
        <div className="dm-forge-details">
          {loaded.status === "unavailable" && (
            <p role="alert">{t("campaign.mapData.notReadable")}</p>
          )}
          {loaded.status === "ok" && (
            <>
              {room && (
                <RoomEditor
                  room={room}
                  busy={roomBusy}
                  focusName={justDrawn}
                  onRename={(next) =>
                    void editRoom(room.id, (each) => ({ ...each, name: next }))
                  }
                  onSecret={(secret) =>
                    void editRoom(room.id, (each) => {
                      const next: Room = { ...each };
                      if (secret) next.secret = true;
                      else delete next.secret;
                      return next;
                    })
                  }
                  onDelete={() => {
                    void editRoom(room.id, () => null).then((done) => {
                      if (done) setSelectedRoom(null);
                    });
                  }}
                />
              )}
              <RoomTools
                levels={levels}
                levelId={levelId}
                onLevel={(next) => {
                  setLevelChoice(next);
                  setSelectedRoom(null);
                }}
                shape={shape}
                onShape={chooseShape}
                disabled={roomBusy}
              />
              {roomProblem && <p role="alert">{roomProblem}</p>}
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
                proposal={proposal}
                onPreview={setPreview}
                onTyped={onTyped}
                calibration={calibration}
                onCalibration={chooseCalibration}
              />
            </>
          )}
        </div>
      </ShellPortal>
    </>
  );
}
