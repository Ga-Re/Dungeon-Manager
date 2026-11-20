import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
import { CampaignPanel } from "./CampaignPanel.js";
import { fakeLibraryService } from "./fake-library.test-data.js";

const sceneFile = (id: string, name: string, parentSceneId?: string) =>
  JSON.stringify({
    schemaVersion: 2,
    id,
    name,
    map: null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
    ...(parentSceneId ? { parentSceneId } : {}),
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

const stored = (library: ReturnType<typeof fakeLibraryService>, id: string) =>
  JSON.parse(
    library.fs.files().get(`campaigns/mine/scenes/${id}.json`) ?? "null",
  ) as Record<string, unknown> | null;

/** The tree items directly under `name` (sub-scenes and the open scene's content). */
const childrenOf = (name: string) => {
  const item = screen.getByRole("treeitem", { name });
  const level = Number(item.getAttribute("aria-level"));
  return within(item)
    .queryAllByRole("treeitem")
    .filter((each) => Number(each.getAttribute("aria-level")) === level + 1)
    .map((each) => each.querySelector(".dm-tree-label")?.textContent);
};

const askToDelete = () => {
  fireEvent.click(screen.getByRole("button", { name: "Szene" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Szene löschen …" }));
};

describe("sub-scenes (T-152)", () => {
  test("shows sub-scenes under their parent, at any depth", async () => {
    renderCampaign(
      fakeLibraryService("/lib", {
        "campaigns/mine/scenes/burg.json": sceneFile("burg", "Burg"),
        "campaigns/mine/scenes/keller.json": sceneFile(
          "keller",
          "Keller",
          "burg",
        ),
        "campaigns/mine/scenes/gang.json": sceneFile(
          "gang",
          "Geheimgang",
          "keller",
        ),
      }),
    );
    await screen.findByRole("treeitem", { name: "Burg" });
    expect(childrenOf("Burg")).toEqual(["Keller"]);
    expect(childrenOf("Keller")).toEqual(["Geheimgang"]);
    expect(childrenOf("Ohne Session")).toEqual(["Burg"]);
  });

  test("a right click on a scene creates a sub-scene, which opens under it", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/krypta.json": sceneFile("krypta", "Krypta"),
    });
    renderCampaign(library);
    fireEvent.contextMenu(
      await screen.findByText("Krypta", { selector: ".dm-tree-label" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Neue Unterszene …" }),
    );
    const popover = within(
      screen.getByRole("group", { name: "Neue Unterszene …" }),
    );
    fireEvent.change(popover.getByLabelText("Name der neuen Szene"), {
      target: { value: "Geheimkammer" },
    });
    fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));

    expect(
      await screen.findByText("Geöffnete Szene: Geheimkammer"),
    ).toBeTruthy();
    expect(stored(library, "new-1")).toMatchObject({
      name: "Geheimkammer",
      parentSceneId: "krypta",
    });
    await waitFor(() => {
      expect(childrenOf("Krypta")).toEqual(["Geheimkammer"]);
    });
  });

  test("deleting a scene keeps its sub-scenes by default, one level up", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/burg.json": sceneFile("burg", "Burg"),
      "campaigns/mine/scenes/keller.json": sceneFile(
        "keller",
        "Keller",
        "burg",
      ),
      "campaigns/mine/scenes/gang.json": sceneFile(
        "gang",
        "Geheimgang",
        "keller",
      ),
    });
    renderCampaign(library);
    fireEvent.click(
      await screen.findByText("Keller", { selector: ".dm-tree-label" }),
    );
    await screen.findByText("Geöffnete Szene: Keller");

    askToDelete();
    const keep = screen.getByRole("radio", {
      name: "Unterszenen behalten (eine Ebene nach oben)",
    });
    expect((keep as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Sie hat eine Unterszene:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));

    await waitFor(() => {
      expect(stored(library, "keller")).toBeNull();
    });
    expect(stored(library, "gang")).toMatchObject({ parentSceneId: "burg" });
    await waitFor(() => {
      expect(childrenOf("Burg")).toEqual(["Geheimgang"]);
    });
  });

  test("deleting a scene with its sub-scenes moves them all into the trash", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/burg.json": sceneFile("burg", "Burg"),
      "campaigns/mine/scenes/keller.json": sceneFile(
        "keller",
        "Keller",
        "burg",
      ),
      "campaigns/mine/scenes/gang.json": sceneFile(
        "gang",
        "Geheimgang",
        "keller",
      ),
    });
    renderCampaign(library);
    fireEvent.click(
      await screen.findByText("Burg", { selector: ".dm-tree-label" }),
    );
    await screen.findByText("Geöffnete Szene: Burg");

    askToDelete();
    expect(screen.getByText("Sie hat 2 Unterszenen:")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Unterszenen mit löschen (in den Papierkorb)",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));

    expect(
      await screen.findByText("Noch keine Szenen in dieser Kampagne."),
    ).toBeTruthy();
    const trashed = [...library.fs.files().keys()].filter((path) =>
      path.startsWith("campaigns/mine/.trash/"),
    );
    expect(trashed).toHaveLength(3);
  });

  test("“delete too” also takes the sub-scenes out of their sessions; cancelling preselects “keep” again", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/burg.json": sceneFile("burg", "Burg"),
      "campaigns/mine/scenes/keller.json": sceneFile(
        "keller",
        "Keller",
        "burg",
      ),
      "campaigns/mine/sessions/abend.json": JSON.stringify({
        schemaVersion: 2,
        id: "abend",
        name: "Abend",
        sceneIds: ["keller"],
      }),
    });
    renderCampaign(library);
    fireEvent.click(
      (await screen.findAllByText("Burg", { selector: ".dm-tree-label" }))[0] ??
        document.body,
    );
    await screen.findByText("Geöffnete Szene: Burg");

    askToDelete();
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Unterszenen mit löschen (in den Papierkorb)",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    askToDelete();
    expect(
      screen.getByRole<HTMLInputElement>("radio", {
        name: "Unterszenen behalten (eine Ebene nach oben)",
      }).checked,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Unterszenen mit löschen (in den Papierkorb)",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    await waitFor(() => {
      expect(stored(library, "keller")).toBeNull();
    });
    const session = JSON.parse(
      library.fs.files().get("campaigns/mine/sessions/abend.json") ?? "{}",
    ) as { sceneIds: string[] };
    expect(session.sceneIds).toEqual([]);
  });
});
