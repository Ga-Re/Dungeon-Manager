import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { createI18n } from "../i18n.js";
import { CampaignPanel } from "./CampaignPanel.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { RELOAD_DELAY_MS } from "./useLibraryChanges.js";

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
    // Another campaign's scenes do not concern this panel.
    library.emit(["campaigns/other/scenes/y.json"]);
    await new Promise((resolve) => setTimeout(resolve, RELOAD_DELAY_MS + 100));
    expect(screen.queryByRole("button", { name: "Neue Szene" })).toBeNull();

    library.emit(["campaigns/mine/scenes/x.json"]);
    expect(
      await screen.findByRole("button", { name: "Neue Szene" }),
    ).toBeTruthy();
  });

  test("keeps the typed name and explains when saving fails", async () => {
    const library = fakeLibraryService("/lib");
    library.fs.writeAtomic = () =>
      Promise.reject(new Error("Datenträger voll"));
    renderCampaign(library);
    const field = await screen.findByLabelText<HTMLInputElement>(
      "Name der neuen Szene",
    );
    fireEvent.change(field, { target: { value: "Eingang" } });
    fireEvent.click(screen.getByRole("button", { name: "Szene anlegen" }));
    expect(
      await screen.findByText("Das hat nicht geklappt: Datenträger voll"),
    ).toBeTruthy();
    expect(field.value).toBe("Eingang");
  });
});
