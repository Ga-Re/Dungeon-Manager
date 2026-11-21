import { IconButton, RibbonGroup } from "@dungeon-manager/ui";
import { MonitorUp, MonitorX, RefreshCw, RotateCwSquare } from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DisplayError,
  type Display,
  type DisplayService,
} from "../platform/displays.js";
import type { LibraryService } from "../platform/library.js";
import type { AppMenuService } from "../platform/app-menu.js";
import { LibraryPanel } from "./LibraryPanel.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { DmShell } from "./shell/DmShell.js";
import { ShellPortal } from "./shell/slots.js";
import { deviceStorage } from "./shell/theme.js";
import { TvCalibration } from "./TvCalibration.js";
import { MapViewContext } from "./MapView.js";
import { TvPreview } from "./TvPreview.js";
import { TvViewContext, type TvView } from "./tv-view-context.js";
import {
  calibrationKey,
  cellInches,
  checkSquareSide,
  readCalibrations,
  readCellSize,
  saveCalibration,
  saveCellSize,
  type CellSize,
} from "../display-calibration.js";

type DisplayState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly displays: readonly Display[] }
  | { readonly status: "error"; readonly error: unknown };

/** DM window: choose a display and open the player view on it; manage the library. */

export function DmApp({
  displayService,
  libraryService,
  newId,
  storage = deviceStorage(),
  root = document.documentElement,
  welcome = true,
  appMenu,
  afterCrash = false,
}: {
  readonly displayService: DisplayService;
  readonly libraryService: LibraryService;
  readonly newId: () => string;
  /** Device-local settings storage; the webview's `localStorage` by default. */
  readonly storage?: Storage | undefined;
  /** Element that carries the theme attribute; the document root by default. */
  readonly root?: HTMLElement;
  /** Open the welcome dialog first (T-153); on by default, as on every start. */
  readonly welcome?: boolean;
  /** The native menu bar (macOS, T-130d); without it the title bar has a menu button. */
  readonly appMenu?: AppMenuService | undefined;
  /** The last session did not end cleanly (T-114a): the TV stays dark until the DM sends a scene. */
  readonly afterCrash?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<DisplayState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const [searchCount, setSearchCount] = useState(0);
  const playerFeed = useContext(PlayerFeedContext);
  const [rotation, setRotation] = useState(playerFeed?.rotation ?? 0);
  // TV calibration (T-106a): per display on this device; sent for the display the player view
  // runs on.
  const [calibrations, setCalibrations] = useState(() =>
    readCalibrations(storage),
  );
  // Grid lines on the TV: off by default (T-106b, DM decision 2026-11-20).
  const [tvGrid, setTvGrid] = useState(false);
  useEffect(() => {
    playerFeed?.showGrid(tvGrid);
  }, [playerFeed, tvGrid]);
  // Blackout (T-113a): the TV black at once, from the dock or with "." (DM decision
  // 2026-11-21, as in presentation programs); again brings the picture back.
  const [blackout, setBlackout] = useState(false);
  useEffect(() => {
    playerFeed?.blackout(blackout);
  }, [playerFeed, blackout]);
  useEffect(() => {
    if (!playerFeed) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      // Held down, it would flicker the TV on every repeat.
      if (
        event.key !== "." ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      // Typing a "." into a field is typing, not a blackout.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      event.preventDefault();
      setBlackout((current) => !current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [playerFeed]);
  // The calibration popover is open: the TV shows the check square to measure (T-106d).
  const [measuring, setMeasuring] = useState(false);
  // How big one cell is on the TV (DM, 2026-11-20): 1 inch by default, or in centimetres.
  const [cellSize, setCellSize] = useState<CellSize>(() =>
    readCellSize(storage),
  );
  const [cellSizeText, setCellSizeText] = useState(() =>
    String(cellSize.value),
  );
  const changeCellSize = (next: CellSize) => {
    setCellSize(next);
    saveCellSize(storage, next);
  };
  const [tvDisplay, setTvDisplay] = useState<Display | null>(null);
  const tvInchPx = tvDisplay
    ? (calibrations[calibrationKey(tvDisplay)]?.inchPx ?? null)
    : null;
  useEffect(() => {
    playerFeed?.calibrate(
      tvInchPx === null
        ? null
        : { inchPx: tvInchPx, cellInches: cellInches(cellSize) },
    );
  }, [playerFeed, tvInchPx, cellSize]);
  // The calibrated TV for the DM's map (T-106c): its view shows there as a frame to move.
  const tvView = useMemo<TvView | null>(
    () =>
      tvDisplay && tvInchPx !== null
        ? {
            display: { width: tvDisplay.width, height: tvDisplay.height },
            pxPerCell: tvInchPx * cellInches(cellSize),
            rotation,
          }
        : null,
    [tvDisplay, tvInchPx, cellSize, rotation],
  );

  const mapViewService = useContext(MapViewContext);
  // Players sit around the table; the TV view turns in quarter steps (SPEC 2.2).
  const rotateTv = () => {
    const next = ((rotation + 90) % 360) as typeof rotation;
    setRotation(next);
    playerFeed?.rotate(next);
  };

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    displayService.listDisplays().then(
      (displays) => {
        if (!active) return;
        setState({ status: "ready", displays });
        // The table TV is usually the last, non-primary display.
        setSelectedId(displays.at(-1)?.id ?? "");
      },
      (error: unknown) => {
        if (active) setState({ status: "error", error });
      },
    );
    return () => {
      active = false;
    };
  }, [displayService, searchCount]);

  const describeError = (error: unknown) =>
    error instanceof DisplayError
      ? t(`dm.errors.${error.code}`)
      : t("dm.error", {
          message: error instanceof Error ? error.message : String(error),
        });

  const selectedDisplay =
    state.status === "ready"
      ? state.displays.find((display) => display.id === selectedId)
      : undefined;
  // While the player view runs, its display is the one being calibrated (the dropdown may show
  // another one); before that, the chosen one.
  const calibrated =
    (state.status === "ready" &&
      state.displays.find((display) => display.id === tvDisplay?.id)) ||
    selectedDisplay;
  // The square the TV shows while the DM measures: from the same display entry the popover
  // computes with, and only on the display the player view runs on.
  const checkSquarePx =
    measuring && calibrated && tvDisplay?.id === calibrated.id
      ? checkSquareSide(calibrated)
      : null;
  useEffect(() => {
    playerFeed?.showCheckSquare(checkSquarePx);
  }, [playerFeed, checkSquarePx]);
  const displayName = (display: Display, index: number) =>
    display.name ?? t("dm.unnamedDisplay", { number: index + 1 });

  const openPlayerView = async () => {
    if (state.status !== "ready" || opening) return;
    const index = state.displays.findIndex(
      (display) => display.id === selectedId,
    );
    const display = state.displays[index];
    if (!display) return;
    setOpening(true);
    try {
      await displayService.openPlayerView(display, t("player.windowTitle"));
      setTvDisplay(display);
      setNotice(
        t("dm.playerViewOpened", { name: displayName(display, index) }),
      );
    } catch (error) {
      setNotice(describeError(error));
    } finally {
      setOpening(false);
    }
  };

  return (
    <main>
      <h1 className="visually-hidden">{t("dm.heading")}</h1>
      <DmShell storage={storage} root={root} appMenu={appMenu}>
        <TvViewContext value={tvView}>
          <LibraryPanel
            service={libraryService}
            newId={newId}
            welcome={welcome}
            storage={storage}
            afterCrash={afterCrash}
          />
        </TvViewContext>
        <ShellPortal slot="ribbonDisplay">
          <RibbonGroup
            caption={t("shell.groups.playerView")}
            menu={{
              items: [
                {
                  id: "refresh",
                  label: t("dm.refreshDisplays"),
                  icon: <RefreshCw />,
                  disabled: state.status === "loading",
                },
              ],
              onSelect: () => {
                setSearchCount((count) => count + 1);
              },
            }}
          >
            {state.status === "loading" && <p>{t("dm.loadingDisplays")}</p>}
            {state.status === "error" && (
              <p role="alert">{describeError(state.error)}</p>
            )}
            {state.status === "ready" && state.displays.length === 0 && (
              <p>{t("dm.noDisplays")}</p>
            )}
            {state.status === "ready" && state.displays.length > 0 && (
              <>
                <label className="dm-ribbon-field">
                  {t("dm.displayLabel")}
                  <select
                    value={selectedId}
                    onChange={(event) => {
                      setSelectedId(event.target.value);
                    }}
                  >
                    {state.displays.map((display, index) => (
                      <option key={display.id} value={display.id}>
                        {t("dm.displayOption", {
                          name: displayName(display, index),
                          width: display.width,
                          height: display.height,
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <IconButton
                  id="open-player-view"
                  showLabel
                  icon={<MonitorUp />}
                  label={t("dm.openPlayerView")}
                  disabled={opening}
                  onClick={() => void openPlayerView()}
                />
                {playerFeed && (
                  <label>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={tvGrid}
                      onChange={(event) => {
                        setTvGrid(event.target.checked);
                      }}
                    />
                    {t("dm.tvGrid")}
                  </label>
                )}
                {calibrated && (
                  <TvCalibration
                    key={calibrationKey(calibrated)}
                    display={calibrated}
                    displayLabel={displayName(
                      calibrated,
                      state.displays.indexOf(calibrated),
                    )}
                    running={tvDisplay?.id === calibrated.id}
                    calibration={
                      calibrations[calibrationKey(calibrated)] ?? null
                    }
                    unit={cellSize.unit}
                    onOpenChange={setMeasuring}
                    onChange={(next) => {
                      saveCalibration(
                        storage,
                        calibrationKey(calibrated),
                        next,
                      );
                      setCalibrations(readCalibrations(storage));
                    }}
                  />
                )}
              </>
            )}
          </RibbonGroup>
        </ShellPortal>
        <ShellPortal slot="settingsTv">
          <fieldset className="dm-settings-group">
            <legend>{t("dm.cellSize.label")}</legend>
            <p className="dm-settings-hint">{t("dm.cellSize.hint")}</p>
            <div className="dm-settings-choices">
              <label>
                {t("dm.cellSize.value")}
                <input
                  inputMode="decimal"
                  size={5}
                  value={cellSizeText}
                  onChange={(event) => {
                    const text = event.target.value;
                    setCellSizeText(text);
                    // Commas are what German keyboards type.
                    const value = Number(text.replace(",", "."));
                    if (Number.isFinite(value) && value > 0)
                      changeCellSize({ ...cellSize, value });
                  }}
                />
              </label>
              <label>
                {t("dm.cellSize.unit")}
                <select
                  value={cellSize.unit}
                  onChange={(event) => {
                    changeCellSize({
                      ...cellSize,
                      unit: event.target.value === "cm" ? "cm" : "in",
                    });
                  }}
                >
                  <option value="in">{t("dm.cellSize.inches")}</option>
                  <option value="cm">{t("dm.cellSize.centimetres")}</option>
                </select>
              </label>
            </div>
          </fieldset>
        </ShellPortal>
        {/* The TV preview (T-113b): the player view drawn from exactly the messages the TV
            gets, a scale model of the chosen TV. */}
        {playerFeed && mapViewService && (
          <ShellPortal slot="preview">
            <TvPreview feed={playerFeed} maps={mapViewService} tv={tvDisplay} />
          </ShellPortal>
        )}
        {/* The TV in the dock (T-131): its rotation and what happened to the player view. */}
        <ShellPortal slot="dock">
          {playerFeed && (
            <div className="dm-dock-group dm-dock-tv">
              <IconButton
                icon={<RotateCwSquare />}
                label={t("dm.rotateTv", { degrees: rotation })}
                onClick={rotateTv}
              />
              <IconButton
                icon={<MonitorX />}
                label={t("dm.blackout")}
                aria-keyshortcuts="."
                pressed={blackout}
                onClick={() => {
                  setBlackout((current) => !current);
                }}
              />
            </div>
          )}
          {/* Always rendered: screen readers only announce changes to an existing live region. */}
          <p role="status" className="dm-dock-status">
            {notice}
          </p>
        </ShellPortal>
      </DmShell>
    </main>
  );
}
