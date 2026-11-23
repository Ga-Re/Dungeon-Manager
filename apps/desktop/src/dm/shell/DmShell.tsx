import { IconButton, Menu } from "@dungeon-manager/ui";
import {
  DockviewReact,
  type DockviewApi,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type DockviewMessages,
  type DockviewTheme,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import {
  BookMarked,
  BookOpen,
  Ellipsis,
  Boxes,
  FolderPlus,
  Map as MapIcon,
  LayoutPanelLeft,
  PanelLeft,
  PawPrint,
  Settings,
  Swords,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ShellSlotsContext, type ShellSlot } from "./slots.js";
import {
  isAppCommand,
  type AppCommand,
  type AppMenuLabels,
  type AppMenuService,
} from "../../platform/app-menu.js";
import { AppCommandsContext, createAppCommands } from "./app-commands.js";
import { CommandAnchorContext, CommandLayer } from "./command-layer.js";
import {
  EdgeBar,
  EdgeSheet,
  NO_EDGE_PANELS,
  edgeOf,
  readEdgePanels,
  saveEdgePanels,
  withEdgePanel,
  withoutEdgePanel,
  type Edge,
} from "./edge-panels.js";
import {
  PANELS,
  SlotHost,
  buildDefaultLayout,
  canFold,
  dockPanel,
  floatPanel,
  hidePanel,
  isFolded,
  settleFolds,
  settleFoldsOnLayout,
  toggleFold,
  type PanelEdge,
  readLayout,
  restoreLayout,
  saveLayout,
  edgeSideOf,
  setMapCanvas,
  showPanel,
  type PanelId,
} from "./panel-layout.js";
import { FogLookContext, SetFogSpeedContext } from "./fog-look.js";
import {
  FADE_MAX_SECONDS,
  FADE_STEP_SECONDS,
  FOG_EDGE,
  FOG_MOTION,
  FOG_QUALITIES,
  COVER_FROM,
  saveCoverFrom,
  readFogLook,
  saveFadeSeconds,
  saveFogEdge,
  saveFogMotion,
  saveFogQuality,
  saveFogSpeed,
  saveSoftEdges,
} from "../../fog-settings.js";
import { SettingsDialog, type SettingsCategory } from "./SettingsDialog.js";
import { NamedLayoutSettings, SaveLayoutDialog } from "./NamedLayouts.js";
import {
  readNamedLayouts,
  removeNamedLayout,
  renameNamedLayout,
  saveNamedLayout,
  writeNamedLayouts,
  type NamedLayout,
} from "./named-layouts.js";
import { THEME_SETTINGS, useThemeSetting } from "./theme.js";
import { UI_SCALES, useUiScale } from "./ui-scale.js";
import {
  WORKSPACES,
  isWorkspace,
  readWorkspace,
  saveWorkspace,
  type Workspace,
  ActiveWorkspaceContext,
  ChooseWorkspaceContext,
} from "./workspace.js";
import { CommandRegistryContext, createCommandRegistry } from "./command.js";

/** The panels' look comes from the design tokens; the colour scheme follows the app's theme. */
const PANEL_THEME: DockviewTheme = {
  name: "dungeon-manager",
  className: "dm-dockview-theme",
};

/** The app command that shows or hides each panel (View menu). */
const PANEL_COMMAND = {
  data: "toggleData",
  map: "toggleMap",
  browser: "toggleBrowser",
  details: "toggleDetails",
  initiative: "toggleInitiative",
  preview: "togglePreview",
} as const satisfies Record<PanelId, AppCommand>;

/**
 * Each workspace's ribbon tabs and the slots their tools render into (ADR-0020). A workspace
 * without tabs yet shows what is coming. Tabs are added as their tools move in: the Map Forge's
 * NEBEL follows with T-253.
 */
const RIBBON_TABS: Record<
  Workspace,
  readonly { readonly id: string; readonly slot: ShellSlot }[]
> = {
  mapForge: [
    { id: "forgeMap", slot: "ribbonForgeMap" },
    { id: "forgeAreas", slot: "ribbonForgeAreas" },
  ],
  assetVault: [],
  creatures: [],
  campaignAtlas: [],
  gameOrchestrator: [
    { id: "scene", slot: "ribbonScene" },
    { id: "fog", slot: "ribbonFog" },
    { id: "display", slot: "ribbonDisplay" },
  ],
};
const ALL_TABS = Object.entries(RIBBON_TABS).flatMap(([workspace, tabs]) =>
  tabs.map((tab) => ({ ...tab, workspace: workspace as Workspace })),
);
/** The tab each workspace starts on. */
const FIRST_TAB: Record<Workspace, string> = {
  mapForge: "forgeMap",
  assetVault: "",
  creatures: "",
  campaignAtlas: "",
  gameOrchestrator: "display",
};

const WORKSPACE_ICON: Record<Workspace, ReactNode> = {
  mapForge: <MapIcon />,
  assetVault: <Boxes />,
  creatures: <PawPrint />,
  campaignAtlas: <BookMarked />,
  gameOrchestrator: <Swords />,
};

/** The slots that live in panels: stable elements the panels adopt (T-172a). */
interface PanelHosts {
  readonly dataPanel: HTMLElement;
  readonly canvas: HTMLElement;
  readonly browser: HTMLElement;
  readonly details: HTMLElement;
  readonly initiative: HTMLElement;
  readonly preview: HTMLElement;
  readonly notices: HTMLElement;
  readonly dock: HTMLElement;
  readonly command: HTMLElement;
}

function createHost(className: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

const PanelHostsContext = createContext<PanelHosts | null>(null);

function usePanelHosts(): PanelHosts {
  const hosts = useContext(PanelHostsContext);
  if (!hosts) throw new Error("Panels render inside the DM shell");
  return hosts;
}

/**
 * The map panel: the canvas fills it; notices and the dock float at its bottom (ADR-0014). A
 * ribbon tool's command panel opens at its top right, in the shell's own layer (T-257).
 */
function MapPanel() {
  const hosts = usePanelHosts();
  const anchor = useContext(CommandAnchorContext);
  return (
    <div className="dm-stage" ref={anchor}>
      <SlotHost element={hosts.canvas} />
      <div className="dm-stage-bottom">
        <SlotHost element={hosts.notices} />
        <SlotHost element={hosts.dock} />
      </div>
    </div>
  );
}

/** What a panel's menu and tab can do (T-172b); the shell owns the layout. */
type PanelCommand =
  | "dockLeft"
  | "dockRight"
  | "dockBottom"
  | "float"
  | "fold"
  | "autoHide"
  | "hide";

interface PanelCommands {
  run(id: PanelId, command: PanelCommand): void;
  /** Whether the panel can fold now, and whether it is folded. */
  fold(id: PanelId): { readonly possible: boolean; readonly folded: boolean };
}

const PanelCommandsContext = createContext<PanelCommands | null>(null);

const isPanelId = (id: string): id is PanelId =>
  (PANELS as readonly string[]).includes(id);

/**
 * A panel's menu in its group's header (T-172b): dock it to an edge, let it float, fold it to
 * its title or hide it – everything dragging does, by keyboard too.
 */
function PanelMenu({ activePanel, containerApi }: IDockviewHeaderActionsProps) {
  const { t } = useTranslation();
  const commands = useContext(PanelCommandsContext);
  // dockview re-renders header actions only on their own group's events; whether the panel can
  // fold also depends on its neighbours (e.g. none once Eigenschaften is hidden).
  const [, setLayoutChanges] = useState(0);
  useEffect(() => {
    const subscription = containerApi.onDidLayoutChange(() => {
      setLayoutChanges((count) => count + 1);
    });
    return () => {
      subscription.dispose();
    };
  }, [containerApi]);
  const id = activePanel?.id;
  if (!commands || !activePanel || id === undefined || !isPanelId(id))
    return null;
  const fold = commands.fold(id);
  const floating = activePanel.api.location.type === "floating";
  return (
    <span className="dm-panel-menu">
      <Menu
        label={t("shell.panelMenu.label", { title: activePanel.title ?? "" })}
        icon={<Ellipsis />}
        items={[
          { id: "dockLeft", label: t("shell.panelMenu.dockLeft") },
          { id: "dockRight", label: t("shell.panelMenu.dockRight") },
          { id: "dockBottom", label: t("shell.panelMenu.dockBottom") },
          {
            id: "float",
            label: t("shell.panelMenu.float"),
            disabled: floating,
          },
          {
            id: "fold",
            label: fold.folded
              ? t("shell.panelMenu.unfold")
              : t("shell.panelMenu.fold"),
            disabled: !fold.possible && !fold.folded,
          },
          // Into an edge sidebar (T-259); the map stays in the layout.
          ...(id === "map"
            ? []
            : [{ id: "autoHide", label: t("shell.panelMenu.autoHide") }]),
          { id: "hide", label: t("shell.panelMenu.hide") },
        ]}
        onSelect={(command) => {
          commands.run(id, command as PanelCommand);
        }}
      />
    </span>
  );
}

/**
 * A panel's tab: its title and a ✕ that hides the panel the way the View menu does (the map
 * gets the room). Own markup in dockview's tab classes: its React tab names the ✕ in English.
 */
function PanelTab({ api }: IDockviewPanelHeaderProps) {
  const { t } = useTranslation();
  const commands = useContext(PanelCommandsContext);
  const [title, setTitle] = useState(api.title ?? "");
  useEffect(() => {
    setTitle(api.title ?? "");
    const subscription = api.onDidTitleChange((event) => {
      setTitle(event.title);
    });
    return () => {
      subscription.dispose();
    };
  }, [api]);
  const id = api.id;
  return (
    <div className="dv-default-tab">
      <span className="dv-default-tab-content">{title}</span>
      <button
        type="button"
        className="dv-default-tab-action"
        aria-label={t("shell.panelMessages.close", { title })}
        // Pressing the ✕ must not start dragging the tab.
        onPointerDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          if (isPanelId(id)) commands?.run(id, "hide");
        }}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/** What each panel shows, in the layout or slid out of an edge sidebar (T-259). */
const PANEL_BODIES: Record<PanelId, () => ReactNode> = {
  data: () => (
    <SlotHost
      element={usePanelHosts().dataPanel}
      className="dm-panel-body dm-datapanel"
    />
  ),
  map: () => <MapPanel />,
  browser: () => (
    <SlotHost
      element={usePanelHosts().browser}
      className="dm-panel-body dm-browser-panel"
    />
  ),
  details: () => (
    <SlotHost
      element={usePanelHosts().details}
      className="dm-panel-body dm-details-panel"
    />
  ),
  initiative: () => (
    <SlotHost
      element={usePanelHosts().initiative}
      className="dm-panel-body dm-initiative-panel"
    />
  ),
  preview: () => (
    <SlotHost
      element={usePanelHosts().preview}
      className="dm-panel-body dm-preview-panel"
    />
  ),
};

const PANEL_COMPONENTS: Record<
  PanelId,
  (props: IDockviewPanelProps) => ReactNode
> = PANEL_BODIES;

/** A panel's body by its id, as a component (hooks need a component of their own). */
function PanelBody({ id }: { readonly id: PanelId }) {
  const Body = PANEL_BODIES[id];
  return <Body />;
}

/** Cmd+B on macOS, Ctrl+B elsewhere; not in rich-text fields, where it means bold. */
function isPanelShortcut(event: globalThis.KeyboardEvent): boolean {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.repeat
  )
    return false;
  if (event.key.toLowerCase() !== "b") return false;
  return !(
    event.target instanceof HTMLElement && event.target.isContentEditable
  );
}

/**
 * Zone layout of the DM window (ADR-0011, ADR-0014, ARCHITECTURE §15): title bar on top, the
 * data panel as a full-height left column, the ribbon right of it and the map in the rest; the
 * scene browser, dock and notices float over the map. Nested components place their parts
 * with `ShellPortal`.
 */
export function DmShell({
  children,
  storage,
  root,
  appMenu,
}: {
  /** Content that only portals into slots (library, campaign, display controls). */
  readonly children?: ReactNode;
  /** Device-local storage for settings (the webview's `localStorage`). */
  readonly storage: Storage | undefined;
  /** Element that carries the theme attribute (the document root). */
  readonly root: HTMLElement;
  /** The native menu bar (macOS); without one, the title bar has a menu button (T-130d). */
  readonly appMenu?: AppMenuService | undefined;
}) {
  const { t } = useTranslation();
  const [panels, setPanels] = useState<DockviewApi | null>(null);
  const [shown, setShown] = useState<ReadonlySet<PanelId>>(new Set());
  // Edge sidebars (T-259): the panels in each, the one slid out, and what each sheet shows
  // (kept while it slides back).
  const [edges, setEdges] = useState(() => readEdgePanels(storage));
  const [openEdge, setOpenEdge] = useState<PanelId | null>(null);
  const [sheetShows, setSheetShows] = useState<
    Readonly<Record<Edge, PanelId | null>>
  >({ left: null, right: null });
  const edgeTabs = useRef(new Map<PanelId, HTMLButtonElement>());
  useEffect(() => {
    saveEdgePanels(storage, edges);
  }, [storage, edges]);
  // The shown ribbon tab of each workspace, kept while another workspace shows.
  const [tabOf, setTabOf] = useState<Record<Workspace, string>>(FIRST_TAB);
  const [workspace, setWorkspace] = useState(() => readWorkspace(storage));
  const ribbonTabs = RIBBON_TABS[workspace];
  const mode = tabOf[workspace];
  const setMode = (id: string) => {
    setTabOf((current) => ({ ...current, [workspace]: id }));
  };
  // The DM's named layouts of the current workspace (T-172c).
  const [namedLayouts, setNamedLayouts] = useState(() =>
    readNamedLayouts(storage, workspace),
  );
  // Stable: it is also handed down to the documents (T-176a).
  const chooseWorkspace = useCallback(
    (id: string) => {
      if (!isWorkspace(id)) return;
      setWorkspace(id);
      saveWorkspace(storage, id);
      setNamedLayouts(readNamedLayouts(storage, id));
    },
    [storage],
  );
  const [saveLayoutOpen, setSaveLayoutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const commands = useMemo(createAppCommands, []);
  // One ribbon command at a time (ADR-0020).
  const toolCommands = useMemo(createCommandRegistry, []);
  // The map panel's element: command panels open at its top right (T-257).
  const [mapStage, setMapStage] = useState<HTMLElement | null>(null);
  // A map panel's element, or its going: a late `null` from an old map panel does not drop a
  // new one that is already there (e.g. while dockview swaps layouts).
  const anchorCommands = useCallback((element: HTMLElement | null) => {
    setMapStage(
      (current) => element ?? (current?.isConnected === true ? current : null),
    );
  }, []);
  // With a menu service, whether it shows a menu bar is open until it says so: no menu button
  // flashes up on macOS before the menu bar is there.
  const [nativeMenu, setNativeMenu] = useState<boolean | "pending">(
    appMenu ? "pending" : false,
  );
  const [theme, setTheme] = useThemeSetting(storage, root);
  const [uiScale, setUiScale] = useUiScale(storage, root);
  const [fogLook, setFogLook] = useState(() => readFogLook(storage));
  const setFogSpeed = useCallback(
    (speed: number) => {
      setFogLook((look) => ({ ...look, speed }));
      saveFogSpeed(storage, speed);
    },
    [storage],
  );
  const [slots, setSlots] = useState<Partial<Record<ShellSlot, HTMLElement>>>(
    {},
  );
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const settingsButton = useRef<HTMLButtonElement>(null);
  const panelButton = useRef<HTMLButtonElement>(null);
  const idPrefix = useId();

  // One stable ref callback per slot, so React does not re-register them on every render.
  const slotRefs = useMemo(() => {
    const refs = {} as Record<ShellSlot, (element: HTMLElement | null) => void>;
    const names: ShellSlot[] = [
      "titleScene",
      "ribbonScene",
      "ribbonFog",
      "ribbonDisplay",
      "ribbonForgeMap",
      "ribbonForgeAreas",
      "settings",
      "settingsTv",
      "settingsCampaign",
    ];
    for (const name of names) {
      refs[name] = (element) => {
        setSlots((current) =>
          current[name] === (element ?? undefined)
            ? current
            : { ...current, [name]: element ?? undefined },
        );
      };
    }
    return refs;
  }, []);

  // The slots inside panels are created once, so their content survives hiding and moving.
  const hosts = useMemo<PanelHosts>(
    () => ({
      dataPanel: createHost("dm-datapanel-content"),
      canvas: createHost("dm-canvas"),
      browser: createHost("dm-browser"),
      details: createHost("dm-details"),
      initiative: createHost("dm-initiative"),
      preview: createHost("dm-preview"),
      notices: createHost("dm-notices"),
      dock: createHost("dm-dock"),
      command: createHost("dm-command"),
    }),
    [],
  );
  useEffect(() => {
    hosts.dock.setAttribute("role", "group");
    hosts.dock.setAttribute("aria-label", t("shell.dock"));
  }, [hosts, t]);
  const allSlots = useMemo(
    () => ({
      ...slots,
      dataPanel: hosts.dataPanel,
      canvas: hosts.canvas,
      browser: hosts.browser,
      details: hosts.details,
      initiative: hosts.initiative,
      preview: hosts.preview,
      notices: hosts.notices,
      dock: hosts.dock,
      command: hosts.command,
    }),
    [slots, hosts],
  );
  // What dockview says to screen readers and names its tab buttons with, in the DM's language.
  // The keyboard-docking messages belong to an enterprise module this app does not use.
  const panelMessages = useMemo<Partial<DockviewMessages>>(
    () => ({
      panelOpened: (title) => t("shell.panelMessages.opened", { title }),
      panelClosed: (title) => t("shell.panelMessages.closed", { title }),
      groupMaximized: (title) => t("shell.panelMessages.maximized", { title }),
      groupRestored: (title) => t("shell.panelMessages.restored", { title }),
      groupFloated: (title) => t("shell.panelMessages.floated", { title }),
      groupDocked: (title) => t("shell.panelMessages.docked", { title }),
      groupPoppedOut: (title) => t("shell.panelMessages.poppedOut", { title }),
      closeTab: (title) => t("shell.panelMessages.close", { title }),
      closeTabPlain: () => t("shell.panelMessages.closePlain"),
    }),
    [t],
  );
  const titles = useMemo<Record<PanelId, string>>(
    () => ({
      data: t("shell.panels.data"),
      map: t("shell.panels.map"),
      browser: t("shell.panels.browser"),
      details: t("shell.panels.details"),
      initiative: t("shell.panels.initiative"),
      preview: t("shell.panels.preview"),
    }),
    [t],
  );

  // Counts folds: a fold is no layout change dockview reports, so a new command object
  // re-renders the panel menus to offer "Ausklappen".
  const [foldings, setFoldings] = useState(0);
  // In the Map Forge the map is the canvas (T-258, ADR-0021); read by the layout's listeners.
  const mapIsCanvas = workspace === "mapForge";
  const canvasNow = useRef(mapIsCanvas);
  canvasNow.current = mapIsCanvas;
  const mapTitle = useRef(titles.map);
  mapTitle.current = titles.map;
  const onPanelsReady = (event: DockviewReadyEvent) => {
    const { api } = event;
    restoreLayout(api, readLayout(storage), titles);
    // Panels in an edge sidebar are not in the layout (T-259).
    for (const id of [...edges.left, ...edges.right]) hidePanel(api, id);
    const persist = () => {
      // Closing the window takes every panel down with it; that is no layout to keep. (A DM who
      // hides all panels gets the default back on the next start.)
      if (api.panels.length > 0) saveLayout(storage, api.toJSON());
    };
    const update = () => {
      const ids = api.panels.map((panel) => panel.id as PanelId);
      // Only a real change rebuilds the menus (a reset fires many events).
      setShown((current) =>
        current.size === ids.length && ids.every((id) => current.has(id))
          ? current
          : new Set(ids),
      );
      persist();
    };
    update();
    api.onDidAddPanel(update);
    api.onDidRemovePanel(update);
    // Sizes and moves; folded panels stay folded, and in the Map Forge the map stays the canvas
    // (also after a reset or a named layout).
    api.onDidLayoutChange(() => {
      settleFolds(api);
      if (canvasNow.current) setMapCanvas(api, true, mapTitle.current);
      persist();
    });
    settleFoldsOnLayout(api);
    setPanels(api);
  };
  // Entering or leaving the Map Forge makes the map its canvas or a panel again (T-258).
  useEffect(() => {
    if (panels) setMapCanvas(panels, mapIsCanvas, titles.map);
  }, [panels, mapIsCanvas, titles.map]);
  // Tab titles follow the language.
  useEffect(() => {
    for (const panel of panels?.panels ?? [])
      panel.api.setTitle(titles[panel.id as PanelId]);
  }, [panels, titles]);

  const togglePanel = useCallback(
    (id: PanelId) => {
      // The Map Forge's canvas is never hidden (T-258).
      if (!panels || (id === "map" && mapIsCanvas)) return;
      // A panel in an edge sidebar is shown: hiding it takes it out of the sidebar (T-259).
      if (edgeOf(edges, id)) {
        setEdges((current) => withoutEdgePanel(current, id));
        setOpenEdge((open) => (open === id ? null : open));
        return;
      }
      const panel = panels.getPanel(id);
      if (!panel) {
        showPanel(panels, id, titles[id]);
        return;
      }
      // Hiding a panel would drop focus inside it (also its tab or the map's dock) to <body>;
      // keep it in the title bar instead.
      const active = document.activeElement;
      if (active && panel.group.element.contains(active))
        panelButton.current?.focus();
      hidePanel(panels, id);
    },
    [panels, titles, mapIsCanvas, edges],
  );
  const resetLayout = useCallback(() => {
    if (!panels) return;
    setEdges(NO_EDGE_PANELS);
    setOpenEdge(null);
    buildDefaultLayout(panels, titles);
  }, [panels, titles]);

  // Panel changes are announced in one polite status line (T-172b). While a command of ours
  // rebuilds a panel (docking closes and adds it), dockview's own open/close messages are held
  // back and the command's own message is spoken instead.
  const [announcement, setAnnouncement] = useState("");
  const quiet = useRef(false);
  const announce = useCallback((message: string) => {
    // A repeated message must be spoken again: clear first, then set.
    setAnnouncement("");
    requestAnimationFrame(() => {
      setAnnouncement(message);
    });
  }, []);
  const getAnnouncement = useCallback(
    (): string | null | undefined => (quiet.current ? null : undefined),
    [],
  );
  const panelCommands = useMemo<PanelCommands>(
    () => ({
      run(id, command) {
        if (!panels) return;
        const title = titles[id];
        if (command === "hide") {
          togglePanel(id);
          return;
        }
        if (command === "autoHide") {
          const edge = edgeSideOf(panels, id);
          quiet.current = true;
          try {
            hidePanel(panels, id);
          } finally {
            quiet.current = false;
          }
          setEdges((current) => withEdgePanel(current, edge, id));
          announce(t("shell.panelMessages.autoHidden", { title }));
          // Its menu is gone: the keyboard goes to its tab in the sidebar.
          requestAnimationFrame(() => {
            edgeTabs.current.get(id)?.focus();
          });
          return;
        }
        if (command === "fold") {
          const folded = toggleFold(panels, id);
          // Only what happened is announced.
          if (folded === null) return;
          setFoldings((count) => count + 1);
          announce(
            t(
              folded
                ? "shell.panelMessages.folded"
                : "shell.panelMessages.unfolded",
              { title },
            ),
          );
          return;
        }
        quiet.current = true;
        try {
          if (command === "float") floatPanel(panels, id);
          else {
            const edge: PanelEdge =
              command === "dockLeft"
                ? "left"
                : command === "dockRight"
                  ? "right"
                  : "bottom";
            dockPanel(panels, id, title, edge);
          }
        } finally {
          quiet.current = false;
        }
        announce(
          t(
            command === "float"
              ? "shell.panelMessages.floated"
              : `shell.panelMessages.${command}`,
            { title },
          ),
        );
        // The panel's header was rebuilt: put the keyboard back on its menu.
        requestAnimationFrame(() => {
          panels
            .getPanel(id)
            ?.group.element.querySelector<HTMLButtonElement>(
              ".dm-panel-menu button",
            )
            ?.focus();
        });
      },
      fold(id) {
        return {
          possible: panels !== null && canFold(panels, id),
          folded: panels !== null && isFolded(panels, id),
        };
      },
    }),
    // `foldings` only renews the object, so menus read the fold state again.
    [panels, titles, togglePanel, announce, t, foldings],
  );

  // A panel docked again wins over a sidebar holding it (e.g. a named layout naming it).
  useEffect(() => {
    const clash = PANELS.filter((id) => shown.has(id) && edgeOf(edges, id));
    if (clash.length > 0)
      setEdges((current) => clash.reduce(withoutEdgePanel, current));
  }, [shown, edges]);
  const slidOut = openEdge !== null && edgeOf(edges, openEdge) ? openEdge : null;
  const toggleEdge = useCallback(
    (id: PanelId) => {
      const edge = edgeOf(edges, id);
      if (!edge) return;
      setSheetShows((current) => ({ ...current, [edge]: id }));
      setOpenEdge((open) => (open === id ? null : id));
    },
    [edges],
  );
  const closeEdge = useCallback(
    (toTab: boolean) => {
      const id = slidOut;
      setOpenEdge(null);
      if (toTab && id) edgeTabs.current.get(id)?.focus();
    },
    [slidOut],
  );
  const pinEdge = useCallback(
    (id: PanelId) => {
      if (!panels) return;
      setEdges((current) => withoutEdgePanel(current, id));
      setOpenEdge(null);
      showPanel(panels, id, titles[id]);
      announce(t("shell.panelMessages.pinned", { title: titles[id] }));
    },
    [panels, titles, announce, t],
  );
  /** Cmd/Ctrl+B and the title bar's button: the data panel, also out of its sidebar. */
  const toggleData = useCallback(() => {
    if (edgeOf(edges, "data")) toggleEdge("data");
    else togglePanel("data");
  }, [edges, toggleEdge, togglePanel]);
  const edgeTab = useCallback(
    (id: PanelId, element: HTMLButtonElement | null) => {
      if (element) edgeTabs.current.set(id, element);
      else edgeTabs.current.delete(id);
    },
    [],
  );
  const sheet = (edge: Edge) => {
    const shownId = sheetShows[edge];
    const live = shownId !== null && edgeOf(edges, shownId) === edge;
    return (
      <EdgeSheet
        edge={edge}
        shown={live ? shownId : null}
        open={live && slidOut === shownId}
        title={live ? titles[shownId] : ""}
        onClose={closeEdge}
        onPin={() => {
          if (live) pinEdge(shownId);
        }}
      >
        {live && <PanelBody id={shownId} />}
      </EdgeSheet>
    );
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // Cmd/Ctrl+, opens the settings, as in most desktop apps (T-155).
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === ","
      ) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (!isPanelShortcut(event)) return;
      event.preventDefault();
      toggleData();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [togglePanel]);

  const changeNamedLayouts = useCallback(
    (next: NamedLayout[]) => {
      setNamedLayouts(next);
      writeNamedLayouts(storage, workspace, next);
    },
    [storage, workspace],
  );
  const saveCurrentLayout = (name: string) => {
    if (!panels) return;
    changeNamedLayouts(
      saveNamedLayout(namedLayouts, name, panels.toJSON(), crypto.randomUUID()),
    );
    announce(t("shell.namedLayouts.saved", { name: name.trim() }));
  };
  const applyNamedLayout = useCallback(
    (id: string) => {
      const entry = namedLayouts.find((each) => each.id === id);
      if (!panels || !entry) return;
      // One message for the whole switch, not one per panel dockview rebuilds.
      quiet.current = true;
      let used: boolean;
      try {
        used = restoreLayout(panels, entry.layout, titles);
      } finally {
        quiet.current = false;
      }
      // A layout dockview cannot use (e.g. one without any panel) gives the default instead.
      announce(
        t(used ? "shell.namedLayouts.applied" : "shell.namedLayouts.unusable", {
          name: entry.name,
        }),
      );
    },
    [namedLayouts, panels, titles, announce, t],
  );

  useEffect(() => {
    const removeCommand = commands.register("settings", () => {
      setSettingsOpen(true);
    });
    const removeModal = commands.registerModal(() => {
      setSettingsOpen(false);
      setSaveLayoutOpen(false);
    });
    const removeView = [
      ...PANELS.map((id) =>
        commands.register(PANEL_COMMAND[id], () => {
          togglePanel(id);
        }),
      ),
      commands.register("resetLayout", resetLayout),
      commands.register("saveLayout", () => {
        setSaveLayoutOpen(true);
      }),
    ];
    return () => {
      removeCommand();
      removeModal();
      removeView.forEach((remove) => {
        remove();
      });
    };
  }, [commands, togglePanel, resetLayout]);

  // The native menu bar, again when the language changes; a menu button where there is none.
  useEffect(() => {
    if (!appMenu) return;
    let active = true;
    const labels: AppMenuLabels = {
      appName: t("app.title"),
      about: t("shell.appMenu.about"),
      settings: t("shell.appMenu.settings"),
      services: t("shell.appMenu.services"),
      hide: t("shell.appMenu.hide"),
      hideOthers: t("shell.appMenu.hideOthers"),
      showAll: t("shell.appMenu.showAll"),
      quit: t("shell.appMenu.quit"),
      file: t("shell.appMenu.file"),
      newCampaign: t("shell.appMenu.newCampaign"),
      welcome: t("shell.appMenu.welcome"),
      closeWindow: t("shell.appMenu.closeWindow"),
      edit: t("shell.appMenu.edit"),
      undo: t("shell.appMenu.undo"),
      redo: t("shell.appMenu.redo"),
      cut: t("shell.appMenu.cut"),
      copy: t("shell.appMenu.copy"),
      paste: t("shell.appMenu.paste"),
      selectAll: t("shell.appMenu.selectAll"),
      window: t("shell.appMenu.window"),
      minimize: t("shell.appMenu.minimize"),
      zoom: t("shell.appMenu.zoom"),
      fullscreen: t("shell.appMenu.fullscreen"),
      view: t("shell.appMenu.view"),
      panels: PANELS.map((id) => ({
        command: PANEL_COMMAND[id],
        text: titles[id],
        checked: shown.has(id) || edgeOf(edges, id) !== undefined,
      })),
      resetLayout: t("shell.appMenu.resetLayout"),
      layouts: namedLayouts.map((entry) => ({
        id: entry.id,
        text: t("shell.namedLayouts.menuItem", { name: entry.name }),
      })),
      saveLayout: t("shell.appMenu.saveLayout"),
    };
    appMenu
      .install(
        labels,
        (command) => {
          commands.run(command);
        },
        (id) => {
          commands.closeModals();
          applyNamedLayout(id);
        },
      )
      .then(
        (installed) => {
          if (active) setNativeMenu(installed);
        },
        (error: unknown) => {
          // Without the menu bar the menu button offers the same commands.
          console.error("The app menu could not be installed.", error);
          if (active) setNativeMenu(false);
        },
      );
    return () => {
      active = false;
    };
  }, [appMenu, commands, t, titles, shown, namedLayouts, applyNamedLayout]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const ids = ribbonTabs.map((tab) => tab.id);
    const index = ids.indexOf(mode);
    const next =
      event.key === "ArrowRight"
        ? ids[(index + 1) % ids.length]
        : event.key === "ArrowLeft"
          ? ids[(index + ids.length - 1) % ids.length]
          : undefined;
    if (!next) return;
    event.preventDefault();
    setMode(next);
    tabs.current.get(next)?.focus();
  };

  // The settings registry (T-155): one entry per category. Fog & animation (T-136) and the
  // player view join here as they get settings.
  const settingsCategories: SettingsCategory[] = [
    {
      id: "appearance",
      label: t("shell.settingsCategory.appearance"),
      content: (
        <>
          <fieldset className="dm-settings-group">
            <legend>{t("shell.theme.label")}</legend>
            {THEME_SETTINGS.map((each) => (
              <label key={each}>
                <input
                  type="radio"
                  name={`${idPrefix}-theme`}
                  checked={theme === each}
                  onChange={() => {
                    setTheme(each);
                  }}
                />
                {t(`shell.theme.${each}`)}
              </label>
            ))}
          </fieldset>
          <fieldset className="dm-settings-group">
            <legend>{t("shell.uiScale.label")}</legend>
            <div className="dm-settings-choices">
              {UI_SCALES.map((each) => (
                <label key={each}>
                  <input
                    type="radio"
                    name={`${idPrefix}-ui-scale`}
                    checked={uiScale === each}
                    onChange={() => {
                      setUiScale(each);
                    }}
                  />
                  {t("shell.uiScale.percent", {
                    percent: Math.round(each * 100),
                  })}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ),
    },
    {
      id: "fog",
      label: t("shell.settingsCategory.fog"),
      content: (
        <fieldset className="dm-settings-group">
          <legend>{t("shell.fogLook.label")}</legend>
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={fogLook.softEdges}
              // The living fog always has its own soft edge (T-245).
              disabled={fogLook.quality !== "off"}
              onChange={(event) => {
                const softEdges = event.target.checked;
                setFogLook((look) => ({ ...look, softEdges }));
                saveSoftEdges(storage, softEdges);
              }}
            />
            {t("shell.fogLook.softEdges")}
          </label>
          <p className="dm-settings-hint">
            {t(
              fogLook.quality === "off"
                ? "shell.fogLook.softEdgesHint"
                : "shell.fogLook.softEdgesLiving",
            )}
          </p>
          <div className="dm-settings-range">
            <span id={`${idPrefix}-fade`}>{t("shell.fogLook.fade")}</span>
            <input
              type="range"
              aria-labelledby={`${idPrefix}-fade`}
              min={0}
              max={FADE_MAX_SECONDS}
              step={FADE_STEP_SECONDS}
              value={fogLook.fadeSeconds}
              aria-valuetext={t("shell.fogLook.seconds", {
                seconds: fogLook.fadeSeconds,
              })}
              onChange={(event) => {
                const fadeSeconds = Number(event.target.value);
                setFogLook((look) => ({ ...look, fadeSeconds }));
                saveFadeSeconds(storage, fadeSeconds);
              }}
            />
            <output aria-hidden="true">
              {t("shell.fogLook.seconds", { seconds: fogLook.fadeSeconds })}
            </output>
          </div>
          <p className="dm-settings-hint">{t("shell.fogLook.fadeHint")}</p>
          <fieldset className="dm-settings-group">
            <legend>{t("shell.fogLook.quality")}</legend>
            <div className="dm-settings-choices">
              {FOG_QUALITIES.map((each) => (
                <label key={each}>
                  <input
                    type="radio"
                    name={`${idPrefix}-fog-quality`}
                    checked={fogLook.quality === each}
                    onChange={() => {
                      setFogLook((look) => ({ ...look, quality: each }));
                      saveFogQuality(storage, each);
                    }}
                  />
                  {t(`shell.fogLook.qualities.${each}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="dm-settings-hint">{t("shell.fogLook.qualityHint")}</p>
          <div className="dm-settings-range">
            <span id={`${idPrefix}-fog-edge`}>{t("shell.fogLook.edge")}</span>
            <input
              type="range"
              aria-labelledby={`${idPrefix}-fog-edge`}
              min={0}
              max={FOG_EDGE.max}
              step={FOG_EDGE.step}
              value={fogLook.edge}
              disabled={fogLook.quality === "off"}
              aria-valuetext={t("shell.fogLook.factor", {
                factor: fogLook.edge,
              })}
              onChange={(event) => {
                const edge = Number(event.target.value);
                setFogLook((look) => ({ ...look, edge }));
                saveFogEdge(storage, edge);
              }}
            />
            <output aria-hidden="true">
              {t("shell.fogLook.factor", { factor: fogLook.edge })}
            </output>
          </div>
          <div className="dm-settings-range">
            <span id={`${idPrefix}-fog-motion`}>
              {t("shell.fogLook.motion")}
            </span>
            <input
              type="range"
              aria-labelledby={`${idPrefix}-fog-motion`}
              min={0}
              max={FOG_MOTION.max}
              step={FOG_MOTION.step}
              value={fogLook.motion}
              disabled={fogLook.quality === "off"}
              aria-valuetext={t("shell.fogLook.factor", {
                factor: fogLook.motion,
              })}
              onChange={(event) => {
                const motion = Number(event.target.value);
                setFogLook((look) => ({ ...look, motion }));
                saveFogMotion(storage, motion);
              }}
            />
            <output aria-hidden="true">
              {t("shell.fogLook.factor", { factor: fogLook.motion })}
            </output>
          </div>
          <p className="dm-settings-hint">{t("shell.fogLook.livingHint")}</p>
          <fieldset className="dm-settings-group">
            <legend>{t("shell.fogLook.coverFrom")}</legend>
            <div className="dm-settings-choices">
              {COVER_FROM.map((each) => (
                <label key={each}>
                  <input
                    type="radio"
                    name={`${idPrefix}-fog-cover-from`}
                    checked={fogLook.coverFrom === each}
                    onChange={() => {
                      setFogLook((look) => ({ ...look, coverFrom: each }));
                      saveCoverFrom(storage, each);
                    }}
                  />
                  {t(`shell.fogLook.coverFromOptions.${each}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="dm-settings-hint">{t("shell.fogLook.coverFromHint")}</p>
        </fieldset>
      ),
    },
    {
      id: "library",
      label: t("shell.settingsCategory.library"),
      // The library panel puts the folder choice here (it owns the library state).
      content: <div ref={slotRefs.settings} />,
    },
    {
      id: "campaign",
      label: t("shell.settingsCategory.campaign"),
      // The open campaign's settings (T-233e) come from the campaign panel, which owns its file.
      content: (
        <>
          <p className="dm-settings-hint">{t("shell.campaignSettingsHint")}</p>
          <div
            ref={slotRefs.settingsCampaign}
            className="dm-settings-campaign"
          />
          {/* Hidden by CSS once the open campaign puts its settings into the slot. */}
          <p className="dm-settings-hint dm-settings-no-campaign">
            {t("shell.noCampaignOpen")}
          </p>
        </>
      ),
    },
    {
      id: "tv",
      label: t("shell.settingsCategory.tv"),
      // The player view's settings (T-106a) come from the DM app, which owns the TV state.
      content: <div ref={slotRefs.settingsTv} />,
    },
    {
      id: "layout",
      label: t("shell.settingsCategory.layout"),
      content: (
        <>
          <fieldset className="dm-settings-group">
            <legend>{t("shell.layout.label")}</legend>
            <p className="dm-settings-hint">{t("shell.layout.hint")}</p>
            <button type="button" onClick={resetLayout}>
              {t("shell.layout.reset")}
            </button>
          </fieldset>
          <NamedLayoutSettings
            workspaceName={t(`shell.workspace.${workspace}`)}
            layouts={namedLayouts}
            onSave={saveCurrentLayout}
            onApply={applyNamedLayout}
            onRename={(id, name) => {
              const before = namedLayouts.find((each) => each.id === id);
              changeNamedLayouts(renameNamedLayout(namedLayouts, id, name));
              if (before)
                announce(
                  t("shell.namedLayouts.renamed", {
                    before: before.name,
                    name: name.trim(),
                  }),
                );
            }}
            onRemove={(id) => {
              const entry = namedLayouts.find((each) => each.id === id);
              changeNamedLayouts(removeNamedLayout(namedLayouts, id));
              if (entry)
                announce(t("shell.namedLayouts.removed", { name: entry.name }));
            }}
          />
        </>
      ),
    },
  ];

  return (
    <ShellSlotsContext value={allSlots}>
      <PanelHostsContext value={hosts}>
        <PanelCommandsContext value={panelCommands}>
          <CommandAnchorContext value={anchorCommands}>
            <div className="dm-shell dm-ui">
              <header className="dm-titlebar">
                <IconButton
                  ref={panelButton}
                  icon={<PanelLeft />}
                  label={t("shell.toggleDataPanel")}
                  pressed={shown.has("data")}
                  onClick={() => {
                    toggleData();
                  }}
                />
                <span className="dm-app-name">{t("app.title")}</span>
                {nativeMenu === false && (
                  <Menu
                    label={t("shell.appMenu.button")}
                    items={[
                      {
                        id: "newCampaign",
                        label: t("shell.appMenu.newCampaign"),
                        icon: <FolderPlus />,
                      },
                      {
                        id: "welcome",
                        label: t("shell.appMenu.welcome"),
                        icon: <BookOpen />,
                      },
                      {
                        id: "settings",
                        label: t("shell.appMenu.settings"),
                        icon: <Settings />,
                      },
                      // The View menu's commands (T-172a): panels on and off, the default layout.
                      ...PANELS.map((id) => ({
                        id: PANEL_COMMAND[id],
                        label: titles[id],
                        checked:
                          shown.has(id) || edgeOf(edges, id) !== undefined,
                        toggle: true,
                        // The Map Forge's canvas stays (T-258).
                        disabled: id === "map" && mapIsCanvas,
                      })),
                      // Named layouts (T-172c) of this workspace.
                      ...namedLayouts.map((entry) => ({
                        id: `layout:${entry.id}`,
                        label: t("shell.namedLayouts.menuItem", {
                          name: entry.name,
                        }),
                      })),
                      {
                        id: "saveLayout",
                        label: t("shell.appMenu.saveLayout"),
                      },
                      {
                        id: "resetLayout",
                        label: t("shell.appMenu.resetLayout"),
                        icon: <LayoutPanelLeft />,
                      },
                    ]}
                    onSelect={(id) => {
                      if (isAppCommand(id)) commands.run(id);
                      else if (id.startsWith("layout:"))
                        applyNamedLayout(id.slice("layout:".length));
                    }}
                    className="dm-app-menu"
                  />
                )}
                <div ref={slotRefs.titleScene} className="dm-titlebar-scene" />
                <div className="dm-settings">
                  <IconButton
                    ref={settingsButton}
                    icon={<Settings />}
                    label={t("shell.settings")}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setSettingsOpen((open) => !open);
                    }}
                  />
                  <SettingsDialog
                    open={settingsOpen}
                    onClose={() => {
                      setSettingsOpen(false);
                    }}
                    returnFocus={settingsButton}
                    categories={settingsCategories}
                  />
                  <SaveLayoutDialog
                    open={saveLayoutOpen}
                    onClose={() => {
                      setSaveLayoutOpen(false);
                    }}
                    layouts={namedLayouts}
                    onSave={saveCurrentLayout}
                  />
                </div>
              </header>
              <div className="dm-main">
                <div className="dm-ribbon">
                  {/* Each workspace has its own tabs (T-156); the Game-Orchestrator has today's tools. */}
                  <div
                    role="group"
                    aria-labelledby={`${idPrefix}-workspace`}
                    className="dm-workspace"
                  >
                    <span
                      id={`${idPrefix}-workspace`}
                      className="dm-workspace-caption"
                    >
                      {t("shell.workspace.label")}
                    </span>
                    <Menu
                      label={t(`shell.workspace.${workspace}`)}
                      menuLabel={t("shell.workspace.label")}
                      items={WORKSPACES.map((each) => ({
                        id: each,
                        label: t(`shell.workspace.${each}`),
                        icon: WORKSPACE_ICON[each],
                        checked: each === workspace,
                      }))}
                      onSelect={chooseWorkspace}
                      className="dm-workspace-menu"
                    />
                  </div>
                  <div className="dm-ribbon-body">
                    {ribbonTabs.length > 0 ? (
                      <div
                        role="tablist"
                        aria-label={t("shell.modes")}
                        className="dm-ribbon-tabs"
                      >
                        {ribbonTabs.map(({ id: each }) => (
                          <button
                            key={each}
                            ref={(element) => {
                              if (element) tabs.current.set(each, element);
                              else tabs.current.delete(each);
                            }}
                            type="button"
                            role="tab"
                            id={`${idPrefix}-tab-${each}`}
                            aria-selected={mode === each}
                            aria-controls={`${idPrefix}-mode-${each}`}
                            tabIndex={mode === each ? 0 : -1}
                            className="dm-ribbon-tab"
                            onClick={() => {
                              setMode(each);
                            }}
                            onKeyDown={onTabKeyDown}
                          >
                            {t(`shell.mode.${each}`)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="dm-ribbon-tabs" />
                    )}
                    {/* Always mounted, only hidden: the tools portaled here keep their state. */}
                    {ALL_TABS.map((each) => {
                      const shownHere = each.workspace === workspace;
                      return (
                        <div
                          key={each.id}
                          ref={slotRefs[each.slot]}
                          id={`${idPrefix}-mode-${each.id}`}
                          role={shownHere ? "tabpanel" : undefined}
                          aria-labelledby={
                            shownHere ? `${idPrefix}-tab-${each.id}` : undefined
                          }
                          hidden={!shownHere || mode !== each.id}
                          className="dm-ribbon-panel"
                          data-empty={t(
                            each.workspace === "mapForge"
                              ? "forge.noMap"
                              : "shell.noScene",
                          )}
                        />
                      );
                    })}
                    {ribbonTabs.length === 0 && (
                      <p className="dm-ribbon-panel dm-ribbon-coming">
                        {t(`shell.workspace.coming.${workspace}`)}
                      </p>
                    )}
                  </div>
                </div>
                {/* Below the ribbon: the panels (T-172a, ADR-0017), the map one of them, with
                    edge sidebars on both sides (T-259). */}
                <div className="dm-workarea">
                  <EdgeBar
                    edge="left"
                    ids={edges.left}
                    open={slidOut}
                    titles={titles}
                    onToggle={toggleEdge}
                    tabRef={edgeTab}
                  />
                  <div className="dm-workarea-panels">
                <DockviewReact
                  className="dm-panels"
                  components={PANEL_COMPONENTS}
                  onReady={onPanelsReady}
                  // Our own theme class carries the design tokens (both themes, ADR-0015).
                  theme={PANEL_THEME}
                  messages={panelMessages}
                  defaultTabComponent={PanelTab}
                  rightHeaderActionsComponent={PanelMenu}
                  getAnnouncement={getAnnouncement}
                  announcer={(event) => {
                    announce(event.message);
                  }}
                />
                    {sheet("left")}
                    {sheet("right")}
                  </div>
                  <EdgeBar
                    edge="right"
                    ids={edges.right}
                    open={slidOut}
                    titles={titles}
                    onToggle={toggleEdge}
                    tabRef={edgeTab}
                  />
                </div>
                <p role="status" className="visually-hidden">
                  {announcement}
                </p>
              </div>
              {createPortal(
                <p className="dm-canvas-empty">{t("shell.noScene")}</p>,
                hosts.canvas,
              )}
              {/* Children only portal into slots; `display: contents` keeps them out of the grid. */}
              <div className="dm-shell-content">
                {/* Context passes through portals: what the children render gets it too. */}
                <AppCommandsContext value={commands}>
                  <FogLookContext value={fogLook}>
                    <SetFogSpeedContext value={setFogSpeed}>
                      <ActiveWorkspaceContext value={workspace}>
                        <ChooseWorkspaceContext value={chooseWorkspace}>
                          <CommandRegistryContext value={toolCommands}>
                            {children}
                          </CommandRegistryContext>
                        </ChooseWorkspaceContext>
                      </ActiveWorkspaceContext>
                    </SetFogSpeedContext>
                  </FogLookContext>
                </AppCommandsContext>
              </div>
              <CommandLayer host={hosts.command} anchor={mapStage} />
            </div>
          </CommandAnchorContext>
        </PanelCommandsContext>
      </PanelHostsContext>
    </ShellSlotsContext>
  );
}
