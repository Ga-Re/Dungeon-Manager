// Screenshot of the DM window's zone layout (T-130), from the E2E harness build (T-130a).
// run-visual.sh builds the harness on the host; inside the pinned container the files are
// served straight from disk through page.route, so no bundler or server runs there.
import { expect, test, type Page } from "@playwright/test";

const ORIGIN = "http://dm-harness.test";

/** Path on disk of a file in the harness build (`apps/desktop/dist-e2e`). */
function harnessFile(pathname: string): string {
  return decodeURIComponent(
    new URL(`../../dist-e2e${pathname}`, import.meta.url).pathname,
  );
}

test.use({ viewport: { width: 1280, height: 800 } });

// The living fog (T-245) drifts with the real clock: still fog keeps these runs deterministic
// and light on the software GPU. The renderer harness covers the living fog at frozen moments.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("dm.fog.quality") === null)
      localStorage.setItem("dm.fog.quality", "off");
  });
});

async function loadHarness(page: Page, search = "") {
  // Playwright reads the file and sets the content type from its extension.
  await page.route(`${ORIGIN}/**`, async (route) => {
    try {
      await route.fulfill({
        path: harnessFile(new URL(route.request().url()).pathname),
      });
    } catch {
      // Not in the build (e.g. a favicon request): answer instead of leaving it hanging.
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto(`${ORIGIN}/e2e.html${search}`);
}

/** The harness past the welcome dialog of every start (T-153). */
async function openHarness(page: Page, search = "") {
  await loadHarness(page, search);
  const welcome = page.getByRole("dialog", { name: "Willkommen" });
  await expect(welcome).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(welcome).toBeHidden();
}

test("zone layout with an open scene", async ({ page }) => {
  await openHarness(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-scene.png");
});

test("a campaign note rendered as Markdown", async ({ page }) => {
  await openHarness(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Kampagnennotiz" }).click();
  await expect(page.getByRole("img", { name: "wappen.png" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-note.png");
});

test("the settings dialog", async ({ page }) => {
  await openHarness(page);
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(
    page.getByRole("dialog", { name: "Einstellungen" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-settings.png");
});

test("the welcome dialog with recent campaigns", async ({ page }) => {
  // One campaign worked on before, one that is gone from the library since.
  await page.addInitScript(() => {
    const entry = (slug: string, name: string, scene: string | null) => ({
      root: "/Bibliothek (E2E)",
      slug,
      name,
      sceneId: scene ? "e2e-scene" : null,
      sceneName: scene,
      openedAt: "2026-11-18T19:30:00.000Z",
    });
    localStorage.setItem(
      "dm.recentCampaigns",
      JSON.stringify([
        entry("fluch-der-krypta", "Fluch der Krypta", "Krypta"),
        entry("alte-runde", "Die alte Runde", null),
      ]),
    );
  });
  await loadHarness(page);
  await expect(
    page.getByRole("list", { name: "Zuletzt bearbeitet" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-welcome.png");
});

test("the welcome dialog on the very first start", async ({ page }) => {
  await loadHarness(page, "?firstStart");
  await expect(
    page.getByRole("heading", { name: "Willkommen beim Dungeon Manager" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-first-start.png");
});

test("the workspace menu", async ({ page }) => {
  await openHarness(page);
  await page
    .getByRole("group", { name: "Arbeitsbereich" })
    .getByRole("button")
    .click();
  await expect(
    page.getByRole("menuitemradio", { name: "Map Forge" }),
  ).toBeFocused();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-workspaces.png");
});

test("Tiny tokens sharing a cell arrange by count; a Small one is smaller (T-233c)", async ({
  page,
}) => {
  await openHarness(page, "?arrangedTokens");
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  const map = page.getByRole("application", { name: /Krypta/ });
  // Zoomed in on the tokens: one to four Tiny ones per cell, the Small one beside a Medium one.
  await map.focus();
  for (let step = 0; step < 4; step++) await page.keyboard.press("+");
  await page.evaluate(() => document.fonts.ready);

  await expect(map).toHaveScreenshot("dm-window-tokens-arranged.png");
});
