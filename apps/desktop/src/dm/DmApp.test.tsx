import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { createI18n } from "../i18n.js";
import type { Display, DisplayService } from "../platform/displays.js";
import { DmApp } from "./DmApp.js";

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
      <DmApp displayService={service} />
    </I18nextProvider>,
  );
}

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
    fireEvent.click(
      screen.getByRole("button", { name: "Spieleransicht öffnen" }),
    );

    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "Spieleransicht läuft auf Built-in Retina.",
    );
    expect(service.openPlayerView).toHaveBeenCalledWith(
      laptop,
      "Spieleransicht",
    );
  });

  test("shows an actionable error when the player view cannot be opened", async () => {
    const service = fakeService();
    service.openPlayerView.mockRejectedValueOnce(
      new Error("window creation denied"),
    );
    renderDm(service);

    fireEvent.click(
      await screen.findByRole("button", { name: "Spieleransicht öffnen" }),
    );

    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "Das hat nicht geklappt: window creation denied",
    );
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
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("renders in English", async () => {
    renderDm(fakeService(), "en");

    expect(
      await screen.findByRole("button", { name: "Open player view" }),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "Game master" })).toBeDefined();
  });
});
