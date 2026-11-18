import { IconButton } from "@dungeon-manager/ui";
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
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
    return false;
  if (event.key.toLowerCase() !== "b") return false;
  return !(
    event.target instanceof HTMLElement && event.target.isContentEditable
  );
}

/**
 * Zone layout of the DM window (ADR-0011, ARCHITECTURE §15): the map fills the window; title
 * bar, ribbon, data panel and scene browser float over it. Nested components place their parts
 * with `ShellPortal`.
 */
export function DmShell({
  dataPanel,
  children,
  storage,
  root,
}: {
  /** Library and campaign, shown in the collapsible left panel. */
  readonly dataPanel: ReactNode;
  /** Content that only portals into slots (e.g. display controls). */
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
  const [slots, setSlots] = useState<Partial<Record<ShellSlot, HTMLElement>>>(
    {},
  );
  const tabs = useRef(new Map<Mode, HTMLButtonElement>());
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsPanel = useRef<HTMLDivElement>(null);
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

  // The settings popover closes on Escape and on a click outside it.
  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      settingsButton.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !settingsPanel.current?.contains(target) &&
        !settingsButton.current?.contains(target)
      )
        setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [settingsOpen]);

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
      <div className="dm-shell" data-panel={panelOpen ? "open" : "closed"}>
        <div ref={slotRefs.canvas} className="dm-canvas">
          <p className="dm-canvas-empty">{t("shell.noScene")}</p>
        </div>
        <div className="dm-overlay">
          <header className="dm-titlebar">
            <IconButton
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
              {settingsOpen && (
                <div
                  ref={settingsPanel}
                  id={`${idPrefix}-settings`}
                  role="dialog"
                  aria-label={t("shell.settings")}
                  className="dm-popover"
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
                </div>
              )}
            </div>
          </header>
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
          <div className="dm-workspace">
            <aside
              id={`${idPrefix}-panel`}
              aria-label={t("shell.dataPanel")}
              className="dm-datapanel"
              hidden={!panelOpen}
            >
              {dataPanel}
            </aside>
            <div ref={slotRefs.browser} className="dm-browser" />
          </div>
          <div ref={slotRefs.notices} className="dm-notices" />
        </div>
        {children}
      </div>
    </ShellSlotsContext>
  );
}
