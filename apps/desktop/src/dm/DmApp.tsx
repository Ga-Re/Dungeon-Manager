import { useContext, useEffect, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DisplayError,
  type Display,
  type DisplayService,
} from "../platform/displays.js";
import type { LibraryService } from "../platform/library.js";
import { LibraryPanel } from "./LibraryPanel.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { DmShell } from "./shell/DmShell.js";
import { ShellPortal } from "./shell/slots.js";

type DisplayState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly displays: readonly Display[] }
  | { readonly status: "error"; readonly error: unknown };

/** DM window: choose a display and open the player view on it; manage the library. */
export function DmApp({
  displayService,
  libraryService,
  newId,
  storage = globalThis.localStorage,
  root = document.documentElement,
}: {
  readonly displayService: DisplayService;
  readonly libraryService: LibraryService;
  readonly newId: () => string;
  /** Device-local settings storage; the webview's `localStorage` by default. */
  readonly storage?: Storage | undefined;
  /** Element that carries the theme attribute; the document root by default. */
  readonly root?: HTMLElement;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<DisplayState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const [searchCount, setSearchCount] = useState(0);
  const playerFeed = useContext(PlayerFeedContext);
  const [rotation, setRotation] = useState(playerFeed?.rotation ?? 0);

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

  const displayName = (display: Display, index: number) =>
    display.name ?? t("dm.unnamedDisplay", { number: index + 1 });

  const openPlayerView = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (state.status !== "ready" || opening) return;
    const index = state.displays.findIndex(
      (display) => display.id === selectedId,
    );
    const display = state.displays[index];
    if (!display) return;
    setOpening(true);
    try {
      await displayService.openPlayerView(display, t("player.windowTitle"));
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
      <DmShell
        storage={storage}
        root={root}
        dataPanel={<LibraryPanel service={libraryService} newId={newId} />}
      >
        <ShellPortal slot="ribbonDisplay">
          <div className="dm-ribbon-group">
            {state.status === "loading" && <p>{t("dm.loadingDisplays")}</p>}
            {state.status === "error" && (
              <p role="alert">{describeError(state.error)}</p>
            )}
            {state.status === "ready" && state.displays.length === 0 && (
              <p>{t("dm.noDisplays")}</p>
            )}
            {state.status === "ready" && state.displays.length > 0 && (
              <form onSubmit={(event) => void openPlayerView(event)}>
                <label>
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
                <button type="submit" id="open-player-view" disabled={opening}>
                  {t("dm.openPlayerView")}
                </button>
              </form>
            )}
            {playerFeed && (
              <button type="button" onClick={rotateTv}>
                {t("dm.rotateTv", { degrees: rotation })}
              </button>
            )}
            <button
              type="button"
              disabled={state.status === "loading"}
              onClick={() => {
                setSearchCount((count) => count + 1);
              }}
            >
              {t("dm.refreshDisplays")}
            </button>
            {/* Always rendered: screen readers only announce changes to an existing live region. */}
            <p role="status">{notice}</p>
          </div>
        </ShellPortal>
      </DmShell>
    </main>
  );
}
