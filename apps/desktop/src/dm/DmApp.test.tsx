import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
import {
  DisplayError,
  type Display,
  type DisplayService,
} from "../platform/displays.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { DmApp } from "./DmApp.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { memoryStorage } from "./memory-storage.test-data.js";

const laptop: Display = {
  id: "0",
  name: "Built-in Retina",
  width: 3024,
  height: 1964,
};
const tv: Display = { id: "1", name: null, width: 3840, height: 2160 };

function fakeService(displays: readonly Display[] = [laptop, tv]) {
  return {
    listDisplays: vi.fn<DisplayService["listDisplays"]>(() =>
      Promise.resolve(displays),
    ),
    openPlayerView: vi.fn<DisplayService["openPlayerView"]>(() =>
      Promise.resolve(),
    ),
  } satisfies DisplayService;
}

function renderDm(service: DisplayService, language: "de" | "en" = "de") {
  return render(
    <I18nextProvider i18n={createI18n(language)}>
      <DmApp
        displayService={service}
        libraryService={fakeLibraryService(null).service}
        newId={() => "id-1"}
      />
    </I18nextProvider>,
  );
}

const openButton = () =>
  screen.findByRole("button", { name: "Spieleransicht öffnen" });

describe("DmApp", () => {
  test("lists the displays and preselects the last one (usually the table TV)", async () => {
    renderDm(fakeService());

    const select = await screen.findByLabelText<HTMLSelectElement>(
      "Display für die Spieleransicht",
    );
    const options = [...select.options].map((option) => option.textContent);
    expect(options).toEqual([
      "Built-in Retina (3024 × 1964)",
      "Display 2 (3840 × 2160)",
    ]);
    expect(select.value).toBe("1");
  });

  test("opens the player view on the chosen display with a translated title", async () => {
    const service = fakeService();
    renderDm(service);

    fireEvent.change(
      await screen.findByLabelText("Display für die Spieleransicht"),
      { target: { value: "0" } },
    );
    fireEvent.click(await openButton());

    expect(
      await screen.findByText("Spieleransicht läuft auf Built-in Retina."),
    ).toBeDefined();
    expect(service.openPlayerView).toHaveBeenCalledWith(
      laptop,
      "Spieleransicht",
    );
  });

  test("ignores further clicks while the player view is being opened", async () => {
    const service = fakeService();
    let finish: () => void = () => undefined;
    service.openPlayerView.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderDm(service);

    const button = await openButton();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(service.openPlayerView).toHaveBeenCalledTimes(1);
    expect(button).toHaveProperty("disabled", true);
    finish();
    expect(
      await screen.findByText("Spieleransicht läuft auf Display 2."),
    ).toBeDefined();
    expect(button).toHaveProperty("disabled", false);
  });

  test("shows the error when the player view cannot be opened", async () => {
    const service = fakeService();
    service.openPlayerView.mockRejectedValueOnce(
      new Error("window creation denied"),
    );
    renderDm(service);

    fireEvent.click(await openButton());

    expect(
      await screen.findByText("Das hat nicht geklappt: window creation denied"),
    ).toBeDefined();
  });

  test("translates known display errors", async () => {
    const service = fakeService();
    service.openPlayerView.mockRejectedValueOnce(
      new DisplayError("unknownDisplay"),
    );
    renderDm(service);

    fireEvent.click(await openButton());

    expect(
      await screen.findByText(
        "Dieses Display ist nicht mehr verfügbar. Bitte Displays neu suchen.",
      ),
    ).toBeDefined();
  });

  test("searches displays again on request, e.g. after plugging in the TV", async () => {
    const service = fakeService([laptop]);
    renderDm(service);
    await openButton();
    service.listDisplays.mockResolvedValueOnce([laptop, tv]);

    fireEvent.click(screen.getByRole("button", { name: "Spieleransicht" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Displays neu suchen" }),
    );

    expect(
      await screen.findByRole("option", { name: "Display 2 (3840 × 2160)" }),
    ).toBeDefined();
    expect(service.listDisplays).toHaveBeenCalledTimes(2);
  });

  test("reports when listing displays fails", async () => {
    const service = fakeService();
    service.listDisplays.mockRejectedValueOnce(new Error("no monitor API"));
    renderDm(service);

    // The panel library has a live region of its own, so look for the text.
    const message = await screen.findByText(
      "Das hat nicht geklappt: no monitor API",
    );
    expect(message.closest('[role="alert"]')).not.toBeNull();
  });

  test("says so when no display is found", async () => {
    renderDm(fakeService([]));

    expect(await screen.findByText("Keine Displays gefunden.")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Spieleransicht öffnen" }),
    ).toBeNull();
  });

  test("renders in English", async () => {
    renderDm(fakeService(), "en");

    expect(
      await screen.findByRole("button", { name: "Open player view" }),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "Game master" })).toBeDefined();
  });

  test("rotates the TV view in quarter turns", () => {
    const rotate = vi.fn();
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <PlayerFeedContext
          value={{ show: vi.fn(), rotate, rotation: 270, calibrate: vi.fn() }}
        >
          <DmApp
            displayService={fakeService()}
            libraryService={fakeLibraryService(null).service}
            newId={() => "id-1"}
          />
        </PlayerFeedContext>
      </I18nextProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "TV-Ansicht drehen (jetzt 270°)" }),
    );
    expect(rotate).toHaveBeenCalledWith(0);
    expect(
      screen.getByRole("button", { name: "TV-Ansicht drehen (jetzt 0°)" }),
    ).toBeTruthy();
  });

  test("calibrates the TV per display; one cell has the size set in the settings (T-106a)", async () => {
    const calibrate = vi.fn();
    const storage = memoryStorage();
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <PlayerFeedContext
          value={{ show: vi.fn(), rotate: vi.fn(), rotation: 0, calibrate }}
        >
          <DmApp
            displayService={fakeService()}
            libraryService={fakeLibraryService(null).service}
            newId={() => "id-1"}
            storage={storage}
          />
        </PlayerFeedContext>
      </I18nextProvider>,
    );
    fireEvent.click(await openButton());
    await waitFor(() => {
      expect(calibrate).toHaveBeenLastCalledWith(null);
    });

    // The cell size, in the settings: 2.5 cm, kept on this device.
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("tab", { name: "Spieleransicht" }));
    fireEvent.change(screen.getByLabelText("Größe"), {
      target: { value: "2,5" },
    });
    fireEvent.change(screen.getByLabelText("Einheit"), {
      target: { value: "cm" },
    });
    expect(storage.getItem("dm.tvCellSize")).toBe('{"value":2.5,"unit":"cm"}');
    fireEvent.click(
      screen.getByRole("button", { name: "Einstellungen schließen" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "TV kalibrieren …" }));
    const popover = within(
      screen.getByRole("group", { name: "TV kalibrieren" }),
    );
    fireEvent.change(popover.getByLabelText("Bilddiagonale (Zoll)"), {
      target: { value: "55" },
    });
    const diagonalPx = Math.hypot(tv.width, tv.height);
    await waitFor(() => {
      expect(calibrate).toHaveBeenLastCalledWith({
        inchPx: diagonalPx / 55,
        cellInches: 2.5 / 2.54,
        checkSquare: false,
      });
    });
    fireEvent.change(popover.getByLabelText("Feinkorrektur (%)"), {
      target: { value: "2,5" },
    });
    fireEvent.click(
      popover.getByLabelText("Prüfquadrat (2 Zoll) auf dem TV zeigen"),
    );
    await waitFor(() => {
      expect(calibrate).toHaveBeenLastCalledWith({
        inchPx: (diagonalPx / 55) * 1.025,
        cellInches: 2.5 / 2.54,
        checkSquare: true,
      });
    });
    expect(
      JSON.parse(storage.getItem("dm.displayCalibration") ?? "{}"),
    ).toEqual({
      version: 1,
      displays: {
        "|3840x2160": { diagonalInches: 55, correctionPercent: 2.5 },
      },
    });

    // A mistyped correction is shown as wrong and never sent: the TV keeps the last good one.
    const sentBefore = calibrate.mock.calls.length;
    fireEvent.change(popover.getByLabelText("Feinkorrektur (%)"), {
      target: { value: "-100" },
    });
    expect(
      popover.getByText("Die Korrektur liegt zwischen −50 und +50 Prozent."),
    ).toBeTruthy();
    expect(calibrate.mock.calls.length).toBe(sentBefore);
    fireEvent.change(popover.getByLabelText("Feinkorrektur (%)"), {
      target: { value: "2,5" },
    });

    fireEvent.click(
      popover.getByRole("button", { name: "Kalibrierung entfernen" }),
    );
    await waitFor(() => {
      expect(calibrate).toHaveBeenLastCalledWith(null);
    });
    expect(
      popover.getByText("Ohne Kalibrierung zeigt der TV die ganze Karte."),
    ).toBeTruthy();
  });
});
