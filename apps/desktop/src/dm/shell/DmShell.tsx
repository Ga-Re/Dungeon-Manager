import { IconButton, Menu } from "@dungeon-manager/ui";
import {
  BookMarked,
  Boxes,
  Map as MapIcon,
  PanelLeft,
  Settings,
  Swords,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { ShellSlotsContext, type ShellSlot } from "./slots.js";
import { HudLayoutContext, useHudLayoutStore } from "./hud-layout.js";
import { FogLookContext } from "./fog-look.js";
import {
  FADE_MAX_SECONDS,
  FADE_STEP_SECONDS,
  readFogLook,
  saveFadeSeconds,
  saveSoftEdges,
} from "../../fog-settings.js";
import { SettingsDialog, type SettingsCategory } from "./SettingsDialog.js";
import { THEME_SETTINGS, useThemeSetting } from "./theme.js";
import { UI_SCALES, useUiScale } from "./ui-scale.js";
import {
  WORKSPACES,
  isWorkspace,
  readWorkspace,
  saveWorkspace,
  type Workspace,
} from "./workspace.js";

const MODES = ["scene", "fog", "display"] as const;
type Mode = (typeof MODES)[number];

const MODE_SLOT: Record<Mode, ShellSlot> = {
  scene: "ribbonScene",
  fog: "ribbonFog",
  display: "ribbonDisplay",
};

const WORKSPACE_ICON: Record<Workspace, ReactNode> = {
  mapForge: <MapIcon />,
  assetStudio: <Boxes />,
  campaignAtlas: <BookMarked />,
  gameMode: <Swords />,
};

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
}: {
  /** Content that only portals into slots (library, campaign, display controls). */
  readonly children?: ReactNode;
  /** Device-local storage for settings (the webview's `localStorage`). */
  readonly storage: Storage | undefined;
  /** Element that carries the theme attribute (the document root). */
  readonly root: HTMLElement;
}) {
  const { t } = useTranslation();
  const [panelOpen, setPanelOpen] = useState(true);
  const [mode, setMode] = useState<Mode>("display");
  const [workspace, setWorkspace] = useState(() => readWorkspace(storage));
  const inGame = workspace === "gameMode";
  const chooseWorkspace = (id: string) => {
    if (!isWorkspace(id)) return;
    setWorkspace(id);
    saveWorkspace(storage, id);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useThemeSetting(storage, root);
  const [uiScale, setUiScale] = useUiScale(storage, root);
  const [fogLook, setFogLook] = useState(() => readFogLook(storage));
  const hudLayout = useHudLayoutStore(storage);
  const [slots, setSlots] = useState<Partial<Record<ShellSlot, HTMLElement>>>(
    {},
  );
  const tabs = useRef(new Map<Mode, HTMLButtonElement>());
  const settingsButton = useRef<HTMLButtonElement>(null);
  const panelButton = useRef<HTMLButtonElement>(null);
  const dataPanelRef = useRef<HTMLElement>(null);
  const idPrefix = useId();

  // One stable ref callback per slot, so React does not re-register them on every render.
  const slotRefs = useMemo(() => {
    const refs = {} as Record<ShellSlot, (element: HTMLElement | null) => void>;
    const names: ShellSlot[] = [
      "titleScene",
      "ribbonScene",
      "ribbonFog",
      "ribbonDisplay",
      "canvas",
      "browser",
      "dataPanel",
      "settings",
      "details",
      "notices",
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

  const togglePanel = useCallback(() => {
    // Hiding the panel would drop focus inside it to <body>; keep it on the toggle instead.
    const active = document.activeElement;
    if (active && dataPanelRef.current?.contains(active))
      panelButton.current?.focus();
    setPanelOpen((open) => !open);
  }, []);

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
      togglePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [togglePanel]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = MODES.indexOf(mode);
    const next =
      event.key === "ArrowRight"
        ? MODES[(index + 1) % MODES.length]
        : event.key === "ArrowLeft"
          ? MODES[(index + MODES.length - 1) % MODES.length]
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
              onChange={(event) => {
                const softEdges = event.target.checked;
                setFogLook((look) => ({ ...look, softEdges }));
                saveSoftEdges(storage, softEdges);
              }}
            />
            {t("shell.fogLook.softEdges")}
          </label>
          <p className="dm-settings-hint">{t("shell.fogLook.softEdgesHint")}</p>
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
      id: "layout",
      label: t("shell.settingsCategory.layout"),
      content: (
        <fieldset className="dm-settings-group">
          <legend>{t("shell.layout.label")}</legend>
          <p className="dm-settings-hint">{t("shell.layout.hint")}</p>
          <button
            type="button"
            onClick={() => {
              hudLayout.reset();
            }}
          >
            {t("shell.layout.reset")}
          </button>
        </fieldset>
      ),
    },
  ];

  return (
    <ShellSlotsContext value={slots}>
      <HudLayoutContext value={hudLayout}>
        <div
          className="dm-shell dm-ui"
          data-panel={panelOpen ? "open" : "closed"}
        >
          <header className="dm-titlebar">
            <IconButton
              ref={panelButton}
              icon={<PanelLeft />}
              label={t("shell.toggleDataPanel")}
              pressed={panelOpen}
              aria-controls={`${idPrefix}-panel`}
              onClick={togglePanel}
            />
            <span className="dm-app-name">{t("app.title")}</span>
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
            </div>
          </header>
          <aside
            ref={dataPanelRef}
            id={`${idPrefix}-panel`}
            aria-label={t("shell.dataPanel")}
            className="dm-datapanel"
            hidden={!panelOpen}
          >
            <div ref={slotRefs.dataPanel} />
          </aside>
          <div className="dm-main">
            <div className="dm-ribbon">
              {/* Each workspace has its own tabs (T-156); Game Mode has today's tools. */}
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
                  items={WORKSPACES.map((each) => ({
                    id: each,
                    label: t(`shell.workspace.${each}`),
                    icon: WORKSPACE_ICON[each],
                  }))}
                  onSelect={chooseWorkspace}
                  className="dm-workspace-menu"
                />
              </div>
              <div className="dm-ribbon-body">
                {inGame ? (
                  <div
                    role="tablist"
                    aria-label={t("shell.modes")}
                    className="dm-ribbon-tabs"
                  >
                    {MODES.map((each) => (
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
                {MODES.map((each) => (
                  <div
                    key={each}
                    ref={slotRefs[MODE_SLOT[each]]}
                    id={`${idPrefix}-mode-${each}`}
                    role={inGame ? "tabpanel" : undefined}
                    aria-labelledby={
                      inGame ? `${idPrefix}-tab-${each}` : undefined
                    }
                    hidden={!inGame || mode !== each}
                    className="dm-ribbon-panel"
                    data-empty={t("shell.noScene")}
                  />
                ))}
                {!inGame && (
                  <p className="dm-ribbon-panel dm-ribbon-coming">
                    {t(`shell.workspace.coming.${workspace}`)}
                  </p>
                )}
              </div>
            </div>
            {/* The map area: the canvas fills it, HUD parts float over it (ADR-0014). */}
            <div className="dm-stage">
              <div ref={slotRefs.canvas} className="dm-canvas">
                <p className="dm-canvas-empty">{t("shell.noScene")}</p>
              </div>
              <div ref={slotRefs.browser} className="dm-browser" />
              <div ref={slotRefs.details} className="dm-details" />
              <div ref={slotRefs.notices} className="dm-notices" />
            </div>
          </div>
          {/* Children only portal into slots; `display: contents` keeps them out of the grid. */}
          <div className="dm-shell-content">
            {/* Context passes through portals: what the children render gets it too. */}
            <FogLookContext value={fogLook}>{children}</FogLookContext>
          </div>
        </div>
      </HudLayoutContext>
    </ShellSlotsContext>
  );
}
