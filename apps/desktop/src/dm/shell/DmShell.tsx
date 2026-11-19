import { IconButton, Popover } from "@dungeon-manager/ui";
import { PanelLeft, Settings } from "lucide-react";
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
import { THEME_SETTINGS, useThemeSetting } from "./theme.js";

const MODES = ["scene", "fog", "display"] as const;
type Mode = (typeof MODES)[number];

const MODE_SLOT: Record<Mode, ShellSlot> = {
  scene: "ribbonScene",
  fog: "ribbonFog",
  display: "ribbonDisplay",
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useThemeSetting(storage, root);
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
                aria-expanded={settingsOpen}
                aria-controls={`${idPrefix}-settings`}
                onClick={() => {
                  setSettingsOpen((open) => !open);
                }}
              />
              <Popover
                open={settingsOpen}
                onClose={() => {
                  setSettingsOpen(false);
                }}
                anchor={settingsButton}
                label={t("shell.settings")}
                id={`${idPrefix}-settings`}
              >
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
                <fieldset className="dm-settings-group dm-settings-more">
                  <legend>{t("shell.layout.label")}</legend>
                  <button
                    type="button"
                    onClick={() => {
                      hudLayout.reset();
                    }}
                  >
                    {t("shell.layout.reset")}
                  </button>
                </fieldset>
                <div ref={slotRefs.settings} className="dm-settings-more" />
              </Popover>
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
              {MODES.map((each) => (
                <div
                  key={each}
                  ref={slotRefs[MODE_SLOT[each]]}
                  id={`${idPrefix}-mode-${each}`}
                  role="tabpanel"
                  aria-labelledby={`${idPrefix}-tab-${each}`}
                  hidden={mode !== each}
                  className="dm-ribbon-panel"
                  data-empty={t("shell.noScene")}
                />
              ))}
            </div>
            {/* The map area: the canvas fills it, HUD parts float over it (ADR-0014). */}
            <div className="dm-stage">
              <div ref={slotRefs.canvas} className="dm-canvas">
                <p className="dm-canvas-empty">{t("shell.noScene")}</p>
              </div>
              <div ref={slotRefs.browser} className="dm-browser" />
              <div ref={slotRefs.notices} className="dm-notices" />
            </div>
          </div>
          {/* Children only portal into slots; `display: contents` keeps them out of the grid. */}
          <div className="dm-shell-content">{children}</div>
        </div>
      </HudLayoutContext>
    </ShellSlotsContext>
  );
}
