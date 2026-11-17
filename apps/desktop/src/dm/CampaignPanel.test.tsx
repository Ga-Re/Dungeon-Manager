import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { createI18n } from "../i18n.js";
import { CampaignPanel } from "./CampaignPanel.js";
import { fakeLibraryService } from "./fake-library.test-data.js";

const sceneFile = (id: string, name: string) =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    name,
    map: null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
  });

function renderCampaign(library: ReturnType<typeof fakeLibraryService>) {
  let next = 0;
  return render(
    <I18nextProvider i18n={createI18n("de")}>
      <CampaignPanel
        service={library.service}
        slug="mine"
        name="Die verlorene Mine"
        newId={() => `new-${String(++next)}`}
      />
    </I18nextProvider>,
  );
}

const sceneNames = async () =>
  within(await screen.findByRole("list", { name: "Szenen" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

describe("CampaignPanel", () => {
  test("lists the scenes by name, including unreadable ones", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/b.json": sceneFile("b", "Zwergenhalle"),
      "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
      "campaigns/mine/scenes/c.json": { placeholder: true },
    });
    renderCampaign(library);
    expect(await sceneNames()).toEqual([
      "c (noch nicht heruntergeladen)",
      "Eingang",
      "Zwergenhalle",
    ]);
  });

  test("creates a scene, then opens and closes it", async () => {
    const library = fakeLibraryService("/lib");
    renderCampaign(library);
    expect(
      await screen.findByText("Noch keine Szenen in dieser Kampagne."),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name der neuen Szene"), {
      target: { value: "Eingang" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Szene anlegen" }));
    expect(await sceneNames()).toEqual(["Eingang"]);
    expect(library.fs.files().has("campaigns/mine/scenes/new-1.json")).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eingang" }));
    expect(screen.getByText("Geöffnete Szene: Eingang")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Szene schließen" }));
    expect(screen.queryByText("Geöffnete Szene: Eingang")).toBeNull();
  });

  test("picks up scenes added on disk while the app runs", async () => {
    const library = fakeLibraryService("/lib");
    renderCampaign(library);
    await screen.findByText("Noch keine Szenen in dieser Kampagne.");

    await library.fs.writeAtomic(
      "campaigns/mine/scenes/x.json",
      sceneFile("x", "Neue Szene"),
    );
    library.emit(["campaigns/other/scenes/y.json"]);
    library.emit(["campaigns/mine/scenes/x.json"]);
    expect(
      await screen.findByRole("button", { name: "Neue Szene" }),
    ).toBeTruthy();
  });
});
