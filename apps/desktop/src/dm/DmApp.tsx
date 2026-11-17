import { useEffect, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Display, DisplayService } from "../platform/displays.js";

type DisplayState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly displays: readonly Display[] }
  | { readonly status: "error"; readonly message: string };

/** DM window: choose a display and open the player view on it. */
export function DmApp({
  displayService,
}: {
  readonly displayService: DisplayService;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<DisplayState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    displayService.listDisplays().then(
      (displays) => {
        if (!active) return;
        setState({ status: "ready", displays });
        // The table TV is usually the last, non-primary display.
        setSelectedId(displays.at(-1)?.id ?? "");
      },
      (error: unknown) => {
        if (active) setState({ status: "error", message: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [displayService]);

  const displayName = (display: Display, index: number) =>
    display.name ?? t("dm.unnamedDisplay", { number: index + 1 });

  const openPlayerView = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (state.status !== "ready") return;
    const index = state.displays.findIndex(
      (display) => display.id === selectedId,
    );
    const display = state.displays[index];
    if (!display) return;
    try {
      await displayService.openPlayerView(display, t("player.windowTitle"));
      setNotice(
        t("dm.playerViewOpened", { name: displayName(display, index) }),
      );
    } catch (error) {
      setNotice(t("dm.error", { message: errorMessage(error) }));
    }
  };

  return (
    <main>
      <h1>{t("dm.heading")}</h1>
      {state.status === "loading" && <p>{t("dm.loadingDisplays")}</p>}
      {state.status === "error" && (
        <p role="alert">{t("dm.error", { message: state.message })}</p>
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
          <button type="submit" id="open-player-view">
            {t("dm.openPlayerView")}
          </button>
        </form>
      )}
      {notice !== null && <p role="status">{notice}</p>}
    </main>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
