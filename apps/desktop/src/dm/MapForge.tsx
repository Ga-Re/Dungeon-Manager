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
import {
  IconButton,
  RibbonGroup,
  TreeList,
  type TreeNode,
} from "@dungeon-manager/ui";
import {
  DoorOpen,
  Folder,
  Grid3x3,
  Layers,
  Map as MapIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { fileName } from "./file-name.js";
import { ItemInfoEditor } from "./ItemInfoEditor.js";
import { MapDataEditor } from "./MapDataEditor.js";
import {
  CalibrateCommand,
  type CalibrationChoice,
} from "./CalibrateCommand.js";
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
  // Grid calibration (T-177), a ribbon tool with its command panel (ADR-0020): whether it runs,
  // how the DM calibrates, the last grid calibrated on the map and the grid shown until OK.
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationChoice>({
    mode: "box",
    cells: CALIBRATION_CELLS.default,
  });
  const [gridBusy, setGridBusy] = useState(false);
  const [gridProblem, setGridProblem] = useState("");
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
  const endCalibration = useCallback(() => {
    setCalibrating(false);
    setProposal(null);
    setPreview(null);
    setGridProblem("");
    gridNow.current = null;
  }, []);
  useEffect(() => {
    endCalibration();
  }, [path, endCalibration]);
  const propose = useCallback((grid: Grid | null) => {
    if (!grid) return;
    gridNow.current = grid;
    setPreview(grid);
    setProposal((current) => ({ grid, seq: (current?.seq ?? 0) + 1 }));
  }, []);
  const onTyped = useCallback((grid: Grid | null) => {
    gridNow.current = grid ?? "invalid";
    if (grid) setPreview(grid);
  }, []);

  // Rooms (T-108c1): the level shown and drawn on, the shape being drawn, the selected room.
  const [levelChoice, setLevelChoice] = useState<string | null>(null);
  const [shape, setShape] = useState<RoomShape | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [justDrawn, setJustDrawn] = useState(false);
  const browser = useRef<HTMLDivElement>(null);
  const [focusTree, setFocusTree] = useState(false);
  useEffect(() => {
    if (!focusTree) return;
    setFocusTree(false);
    browser.current
      ?.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]')
      ?.focus();
  }, [focusTree]);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomProblem, setRoomProblem] = useState("");
  // The forge's own last write and the sidecar read before it: until a newer read arrives, the
  // map shows (and the next change starts from) what was written, so changes in quick
  // succession never take the forge's own write for a change from elsewhere.
  const ownWrite = useRef<{
    readonly data: MapData;
    readonly before: Sidecar | null;
  } | null>(null);
  useEffect(() => {
    setLevelChoice(null);
    setShape(null);
    setSelectedRoom(null);
    setRoomProblem("");
  }, [path]);
  // Drawing a room and calibrating both take the map's pointer: one at a time.
  const startCalibration = () => {
    setShape(null);
    setCalibrating(true);
  };
  const chooseShape = (next: RoomShape | null) => {
    setShape(next);
    if (next) endCalibration();
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

  /**
   * Saves a change of the map's data; `expected` keeps a change made elsewhere from being lost.
   * @returns whether it was saved; else `report` got why not.
   */
  const changeData = async (
    change: (current: MapData) => MapData,
    report: (problem: string) => void,
  ) => {
    try {
      const written = await updateMapData(
        service.fs,
        await catalogAsset(service, path),
        defaults,
        change,
        data,
      );
      if (written) ownWrite.current = { data: written, before: sidecar };
      loaded.reload();
      return true;
    } catch (error) {
      report(
        error instanceof MapDataChangedError
          ? t("forgeRooms.changedMeanwhile")
          : describeLibraryError(t, error),
      );
      loaded.reload();
      return false;
    }
  };
  const changeRooms = async (change: (rooms: readonly Room[]) => Room[]) => {
    setRoomBusy(true);
    setRoomProblem("");
    try {
      return await changeData(
        (current) => ({ ...current, rooms: change(current.rooms) }),
        setRoomProblem,
      );
    } finally {
      setRoomBusy(false);
    }
  };
  const saveGrid = async (grid: Grid) => {
    setGridBusy(true);
    setGridProblem("");
    try {
      const saved = await changeData(
        // Unknown grid fields (loose schema) stay.
        (current) => ({
          ...current,
          grid: {
            ...current.grid,
            cellSizePx: grid.cellSizePx,
            offsetXPx: grid.offsetXPx,
            offsetYPx: grid.offsetYPx,
          },
        }),
        setGridProblem,
      );
      if (saved) endCalibration();
    } finally {
      setGridBusy(false);
    }
  };
  // `free`: Alt was held as the shape was finished (taken from that event, so an Alt+Tab
  // never leaves rooms unsnapped).
  const addRoom = async (area: Polygon, free: boolean) => {
    if (!shape || roomBusy) return;
    // The saved grid: drawing a room ends a running calibration (one command at a time).
    const fitted = free ? area : snapArea(area, data.grid, shape);
    if (!fitted) {
      setRoomProblem(t("forgeRooms.tooSmall"));
      return;
    }
    const id = newRoomId(
      [...data.levels, ...data.rooms].map((each) => each.id),
      Math.random,
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
      {/* KARTE › RASTER (ADR-0020): the quick tool, and every command in the caption's menu. */}
      <ShellPortal slot="ribbonForgeMap">
        <RibbonGroup
          caption={t("forge.gridGroup")}
          menu={{
            items: [
              {
                id: "calibrate",
                label: t("forge.calibrate"),
                icon: <Grid3x3 />,
                disabled: loaded.status !== "ok",
              },
            ],
            onSelect: (id) => {
              if (id === "calibrate") startCalibration();
            },
          }}
        >
          <IconButton
            showLabel
            icon={<Grid3x3 />}
            label={t("forge.calibrate")}
            disabled={loaded.status !== "ok"}
            pressed={calibrating}
            onClick={() => {
              if (calibrating) endCalibration();
              else startCalibration();
            }}
          />
        </RibbonGroup>
      </ShellPortal>
      {calibrating && loaded.status === "ok" && (
        <CalibrateCommand
          stored={data.grid}
          choice={calibration}
          onChoice={setCalibration}
          proposal={proposal}
          onTyped={onTyped}
          busy={gridBusy}
          problem={gridProblem}
          onOk={(grid) => void saveGrid(grid)}
          onCancel={endCalibration}
        />
      )}
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
          onArea={(area, _tool, free) => void addRoom(area, free)}
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
            loaded.status === "ok" && calibrating
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
        <div ref={browser} className="dm-campaign-browser">
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
                      if (!done) return;
                      setSelectedRoom(null);
                      // The editor goes with the room: the keyboard moves to its level.
                      setFocusTree(true);
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
              />
            </>
          )}
        </div>
      </ShellPortal>
    </>
  );
}
