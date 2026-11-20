// Scene tabs (T-223a): several scenes open at once; the TV changes only on the DM's command.
import type { ViewerScene } from "@dungeon-manager/schema";
import { createI18n } from "@dungeon-manager/ui";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import type { PlayerFeedSender } from "../platform/player-feed.js";
import { CampaignPanel } from "./CampaignPanel.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { PlayerFeedContext } from "./player-feed-context.js";

const sceneFile = (id: string, name: string, parentSceneId?: string) =>
  JSON.stringify({
    schemaVersion: 3,
    id,
    name,
    ...(parentSceneId ? { parentSceneId } : {}),
    map: null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
  });

function renderCampaign() {
  const library = fakeLibraryService("/lib", {
    "campaigns/mine/campaign.json": JSON.stringify({
      schemaVersion: 2,
      id: "c",
      name: "Mine",
      players: [],
      visibilityDefaults: {},
    }),
    "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
    "campaigns/mine/scenes/b.json": sceneFile("b", "Gruft"),
    // A sub-scene of the Gruft (T-152).
    "campaigns/mine/scenes/c.json": sceneFile("c", "Sarg", "b"),
  });
  const shown: (ViewerScene | null)[] = [];
  const feed: PlayerFeedSender = {
    show: vi.fn((next: ViewerScene | null) => {
      shown.push(next);
    }),
    rotate: vi.fn(),
    rotation: 0,
    calibrate: vi.fn(),
    showCheckSquare: vi.fn(),
  };
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <PlayerFeedContext value={feed}>
        <CampaignPanel
          service={library.service}
          slug="mine"
          name="Mine"
          newId={() => "new"}
        />
      </PlayerFeedContext>
    </I18nextProvider>,
  );
  /** The scene the TV shows now (`null`: dark). */
  const onTv = () => shown.at(-1)?.name ?? null;
  return { onTv, library };
}

async function openScene(name: string) {
  fireEvent.click(
    await screen.findByText(name, { selector: ".dm-tree-label" }),
  );
  await screen.findByText(`Geöffnete Szene: ${name}`);
}

const tabs = () => within(screen.getByRole("group", { name: "Offene Szenen" }));
/** A tab's button (not its ✕), by the scene's name. */
const tab = (name: string): HTMLElement => {
  const found = tabs()
    .getAllByRole("button")
    .filter(
      (each) =>
        each.classList.contains("dm-scene-tab-name") &&
        each.textContent.startsWith(name),
    );
  if (found.length !== 1 || !found[0])
    throw new Error(`${String(found.length)} tabs named ${name}`);
  return found[0];
};
const currentTab = () =>
  tabs()
    .getAllByRole("button")
    .find((each) => each.getAttribute("aria-current") === "true")?.textContent;

describe("scene tabs (T-223a)", () => {
  test("open scenes are tabs; switching them never changes the TV", async () => {
    const { onTv } = renderCampaign();
    await openScene("Eingang");
    // Nothing was on the TV: the first scene opened goes there, as before.
    await waitFor(() => {
      expect(onTv()).toBe("Eingang");
    });

    await openScene("Gruft");
    expect(currentTab()).toBe("Gruft");
    expect(tab("Eingang").textContent).toBe("Eingang(auf dem TV)");
    expect(onTv()).toBe("Eingang");

    fireEvent.click(tab("Eingang"));
    expect(currentTab()).toBe("Eingang(auf dem TV)");
    expect(screen.getByText("Geöffnete Szene: Eingang")).toBeTruthy();
    expect(onTv()).toBe("Eingang");
    // Opening an open scene again shows its tab; no second tab.
    await openScene("Gruft");
    expect(tab("Gruft")).toBeTruthy();
  });

  test("the DM puts another scene on the TV; closing the TV's scene leaves the TV dark", async () => {
    const { onTv } = renderCampaign();
    await openScene("Eingang");
    await openScene("Gruft");
    const toTv = screen.getByRole("button", { name: "Szene auf den TV" });
    fireEvent.click(toTv);
    await waitFor(() => {
      expect(onTv()).toBe("Gruft");
    });
    expect(
      screen.getByRole("button", { name: "Szene auf den TV" }),
    ).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Gruft schließen" }));
    expect(onTv()).toBeNull();
    // The other tab shows; it was not on the TV and does not go there by itself.
    expect(currentTab()).toBe("Eingang");
    expect(screen.getByText("Geöffnete Szene: Eingang")).toBeTruthy();
    expect(onTv()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Eingang schließen" }));
    expect(screen.queryByRole("group", { name: "Offene Szenen" })).toBeNull();
  });

  test("showing an open scene from the tree leaves a dark TV dark", async () => {
    const { onTv } = renderCampaign();
    await openScene("Eingang");
    await openScene("Gruft");
    fireEvent.click(screen.getByRole("button", { name: "Eingang schließen" }));
    expect(onTv()).toBeNull();
    // Gruft is open already: clicking it in the tree switches to it, it does not open it.
    await openScene("Gruft");
    expect(onTv()).toBeNull();
  });

  test("keyboard focus stays in the tab bar when switching and closing", async () => {
    renderCampaign();
    await openScene("Eingang");
    await openScene("Gruft");
    fireEvent.click(tab("Eingang"));
    await waitFor(() => {
      expect(document.activeElement).toBe(tab("Eingang"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Eingang schließen" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(tab("Gruft"));
    });
    // Closing a tab that is not shown: the keyboard goes to the shown one.
    await openScene("Eingang");
    fireEvent.click(tab("Gruft"));
    fireEvent.click(screen.getByRole("button", { name: "Eingang schließen" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(tab("Gruft"));
    });
  });

  test("a scene is not deleted while one of its sub-scenes is open in another tab", async () => {
    const { library } = renderCampaign();
    await openScene("Sarg");
    await openScene("Gruft");
    fireEvent.click(screen.getByRole("button", { name: "Szene" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Szene löschen …" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    expect(
      await screen.findByText(
        "Schließe zuerst die offenen Unterszenen (Sarg), dann lässt sich die Szene löschen.",
      ),
    ).toBeTruthy();
    expect(library.fs.files().has("campaigns/mine/scenes/b.json")).toBe(true);
    expect(tab("Sarg")).toBeTruthy();
  });
});
