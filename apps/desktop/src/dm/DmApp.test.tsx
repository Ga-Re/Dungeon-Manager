import { fireEvent, render, screen } from "@testing-library/react";
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

    fireEvent.click(
      screen.getByRole("button", { name: "Displays neu suchen" }),
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

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Das hat nicht geklappt: no monitor API",
    );
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
        <PlayerFeedContext value={{ show: vi.fn(), rotate, rotation: 270 }}>
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
});
