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
  ContextMenu,
  IconButton,
  RibbonGroup,
  TreeList,
  type MenuPoint,
  type TreeNode,
} from "@dungeon-manager/ui";
import {
  DoorOpen,
  Folder,
  Grid3x3,
  Layers,
  Map as MapIcon,
  Pencil,
  SquarePlus,
  Trash2,
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
import {
  AddRoomCommand,
  DeleteRoomCommand,
  EditRoomCommand,
  type RoomFacts,
} from "./ForgeRooms.js";
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
  // Leaving the Map Forge ends a running command: it would come back half-done.
  useEffect(() => {
    if (!shown) endCalibration();
  }, [shown, endCalibration]);
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

  // Rooms (T-108c1, T-254): the level shown and drawn on, the selected room, and the room
  // command running – "Raum anlegen" with its shape, drawn area and facts, or editing or
  // deleting a room – each a ribbon tool with its command panel (ADR-0020).
  const [levelChoice, setLevelChoice] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [roomCommand, setRoomCommand] = useState<
    | { readonly kind: "add" }
    | { readonly kind: "edit" | "delete"; readonly id: string }
    | null
  >(null);
  const [roomShape, setRoomShape] = useState<RoomShape>("rectangle");
  const [drawn, setDrawn] = useState<Polygon | null>(null);
  const [facts, setFacts] = useState<RoomFacts>({ name: "", secret: false });
  const [roomMenu, setRoomMenu] = useState<{
    readonly id: string;
    readonly at: MenuPoint;
    readonly item: HTMLElement;
  } | null>(null);
  const browser = useRef<HTMLDivElement>(null);
  const [focusTree, setFocusTree] = useState(false);
  useEffect(() => {
    if (!focusTree) return;
    setFocusTree(false);
    // The selected item, or – if it lies in a collapsed folder – the map at the top.
    (
      browser.current?.querySelector<HTMLElement>(
        '[role="treeitem"][aria-selected="true"]',
      ) ?? browser.current?.querySelector<HTMLElement>('[role="treeitem"]')
    )?.focus();
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
  const endRoomCommand = useCallback(() => {
    setRoomCommand(null);
    setDrawn(null);
    setRoomProblem("");
    setRoomMenu(null);
  }, []);
  useEffect(() => {
    setLevelChoice(null);
    setSelectedRoom(null);
    endRoomCommand();
  }, [path, endRoomCommand]);
  useEffect(() => {
    if (!shown) endRoomCommand();
  }, [shown, endRoomCommand]);
  // One command at a time: the registry cancels the one running when another starts.
  const startCalibration = () => {
    setCalibrating(true);
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
  const roomOf = (id: string) => data.rooms.find((each) => each.id === id);
  const commandRoom =
    roomCommand && roomCommand.kind !== "add"
      ? roomOf(roomCommand.id)
      : undefined;
  // Another level: nothing of the old one stays selected or drawn.
  const showLevel = (next: string) => {
    setLevelChoice(next);
    setSelectedRoom(null);
    setDrawn(null);
  };
  // A room being edited or deleted that is gone (e.g. on another device): its command ends.
  if (roomCommand && roomCommand.kind !== "add" && !commandRoom)
    setRoomCommand(null);
  const startAddRoom = () => {
    setDrawn(null);
    setRoomProblem("");
    setFacts({
      name: t("forgeRooms.defaultName", { number: levelRooms.length + 1 }),
      secret: false,
    });
    setRoomCommand({ kind: "add" });
  };
  const startOnRoom = (kind: "edit" | "delete", id: string) => {
    setRoomProblem("");
    setSelectedRoom(id);
    setRoomCommand({ kind, id });
  };

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
          ? t("forge.changedMeanwhile")
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
  // A drawn area becomes the room to create (redrawing replaces it). `free`: Alt was held as
  // it was finished (taken from that event, so an Alt+Tab never leaves rooms unsnapped).
  const drawRoom = (area: Polygon, free: boolean) => {
    const fitted = free ? area : snapArea(area, data.grid, roomShape);
    setRoomProblem(fitted ? "" : t("forgeRooms.tooSmall"));
    if (fitted) setDrawn(fitted);
  };
  const addRoom = async () => {
    if (!drawn || roomBusy) return;
    const id = newRoomId(
      [...data.levels, ...data.rooms].map((each) => each.id),
      Math.random,
    );
    const added = await changeRooms((rooms) => [
      ...rooms,
      {
        id,
        name: facts.name.trim(),
        area: drawn,
        levelId,
        ...(facts.secret && { secret: true }),
      },
    ]);
    if (!added) return;
    endRoomCommand();
    // The new room is selected in the browser, with the keyboard on it.
    setSelectedRoom(id);
    setFocusTree(true);
  };
  const editRoom = (id: string, edit: (room: Room) => Room | null) =>
    changeRooms((rooms) =>
      rooms.flatMap((each) => {
        if (each.id !== id) return [each];
        const next = edit(each);
        return next ? [next] : [];
      }),
    );
  const saveFacts = async (id: string, next: RoomFacts) => {
    const saved = await editRoom(id, (each) => {
      const changed: Room = { ...each, name: next.name };
      if (next.secret) changed.secret = true;
      else delete changed.secret;
      return changed;
    });
    if (saved) {
      endRoomCommand();
      setFocusTree(true);
    }
  };
  const deleteRoom = async (id: string) => {
    if (!(await editRoom(id, () => null))) return;
    endRoomCommand();
    setSelectedRoom(null);
    // The room is gone: the keyboard moves to its level.
    setFocusTree(true);
  };

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
      {/* RÄUME (ADR-0020, T-254): "Raum anlegen" as the quick tool; all room commands in
          the caption's menu. */}
      <ShellPortal slot="ribbonForgeRooms">
        <RibbonGroup
          caption={t("forgeRooms.title")}
          menu={{
            items: [
              {
                id: "add",
                label: t("forgeRooms.add"),
                icon: <SquarePlus />,
                disabled: loaded.status !== "ok",
              },
              {
                id: "edit",
                label: t("forgeRooms.edit"),
                icon: <Pencil />,
                disabled: !room,
              },
              {
                id: "delete",
                label: t("forgeRooms.delete"),
                icon: <Trash2 />,
                disabled: !room,
              },
            ],
            onSelect: (id) => {
              if (id === "add") startAddRoom();
              else if (room && (id === "edit" || id === "delete"))
                startOnRoom(id, room.id);
            },
          }}
        >
          <IconButton
            showLabel
            icon={<SquarePlus />}
            label={t("forgeRooms.add")}
            disabled={loaded.status !== "ok"}
            pressed={roomCommand?.kind === "add"}
            onClick={() => {
              if (roomCommand?.kind === "add") endRoomCommand();
              else startAddRoom();
            }}
          />
        </RibbonGroup>
      </ShellPortal>
      {roomCommand?.kind === "add" && loaded.status === "ok" && (
        <AddRoomCommand
          levels={levels}
          levelId={levelId}
          onLevel={showLevel}
          shape={roomShape}
          onShape={setRoomShape}
          drawn={drawn !== null}
          facts={facts}
          onFacts={setFacts}
          busy={roomBusy}
          problem={roomProblem}
          onOk={() => void addRoom()}
          onCancel={endRoomCommand}
        />
      )}
      {roomCommand?.kind === "edit" && commandRoom && (
        <EditRoomCommand
          key={commandRoom.id}
          room={commandRoom}
          busy={roomBusy}
          problem={roomProblem}
          onOk={(next) => void saveFacts(commandRoom.id, next)}
          onCancel={endRoomCommand}
        />
      )}
      {roomCommand?.kind === "delete" && commandRoom && (
        <DeleteRoomCommand
          room={commandRoom}
          busy={roomBusy}
          problem={roomProblem}
          onOk={() => void deleteRoom(commandRoom.id)}
          onCancel={endRoomCommand}
        />
      )}
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
          tool={roomCommand?.kind === "add" && !roomBusy ? "reveal" : "pan"}
          shape={roomShape}
          onArea={(area, _tool, free) => {
            drawRoom(area, free);
          }}
          toolHint={
            roomCommand?.kind === "add"
              ? t(
                  roomShape === "lasso"
                    ? "forgeRooms.hintFree"
                    : "forgeRooms.hint",
                )
              : undefined
          }
          outlines={[
            ...levelRooms.map((each) => ({
              id: each.id,
              label: each.name,
              area: each.area,
              selected: each.id === selectedRoom,
              secret: each.secret === true,
            })),
            // The room being created, until OK.
            ...(roomCommand?.kind === "add" && drawn
              ? [
                  {
                    id: "forge:new-room",
                    label: facts.name,
                    area: drawn,
                    selected: true,
                    secret: facts.secret,
                  },
                ]
              : []),
          ]}
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
                showLevel(id.slice("forge:level:".length));
              } else if (id.startsWith("forge:room:")) {
                const picked = roomOf(id.slice("forge:room:".length));
                if (!picked) return;
                setSelectedRoom(picked.id);
                setLevelChoice(picked.levelId ?? data.levels[0]?.id ?? null);
              }
            }}
            // A room opens its edit command by double-click or its context menu (ADR-0020).
            onItemActivate={(id) => {
              if (id.startsWith("forge:room:"))
                startOnRoom("edit", id.slice("forge:room:".length));
            }}
            onItemContextMenu={(id, at, item) => {
              if (id.startsWith("forge:room:"))
                setRoomMenu({ id: id.slice("forge:room:".length), at, item });
            }}
          />
          <ContextMenu
            at={roomMenu?.at ?? null}
            label={t("forgeRooms.kind")}
            items={[
              { id: "edit", label: t("forgeRooms.edit"), icon: <Pencil /> },
              { id: "delete", label: t("forgeRooms.delete"), icon: <Trash2 /> },
            ]}
            onSelect={(choice) => {
              if (roomMenu && (choice === "edit" || choice === "delete"))
                startOnRoom(choice, roomMenu.id);
            }}
            onClose={() => {
              setRoomMenu(null);
            }}
            returnFocus={roomMenu?.item}
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
                <dl className="dm-details-rows">
                  <div className="dm-details-row">
                    <dt>{t("forgeRooms.kind")}</dt>
                    <dd>{room.name}</dd>
                  </div>
                  {room.secret === true && (
                    <div className="dm-details-row">
                      <dt>{t("forgeRooms.secretLabel")}</dt>
                      <dd>{t("forgeRooms.yes")}</dd>
                    </div>
                  )}
                </dl>
              )}
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
