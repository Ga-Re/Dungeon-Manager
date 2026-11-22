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
  // The data panel's catalog draws its map preview once it is on screen (T-124).
  await expect(page.locator(".dm-catalog .dm-map-thumb img")).toBeVisible();
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

test("the map picker with previews (T-124)", async ({ page }) => {
  await openHarness(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Fluch der Krypta" }).focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Karte wählen …" }).click();
  const picker = page.getByRole("dialog", { name: "Karte wählen" });
  await expect(picker.locator(".dm-map-thumb img")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // The dialog alone: the tree behind it is covered by the other screenshots.
  await expect(picker).toHaveScreenshot("dm-window-map-picker.png");
});

test("a catalog map's details in Eigenschaften (T-125)", async ({ page }) => {
  await openHarness(page);
  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .click();
  await expect(page.getByLabel("Herkunft")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-item-info.png");
});

test("a map open in the Map Forge (T-176a)", async ({ page }) => {
  await openHarness(page);
  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .dblclick();
  await expect(page.getByLabel("Zellgröße (Pixel)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-map-forge.png");
});

test("a room being added in the Map Forge, before OK (T-108c1, T-254)", async ({
  page,
}) => {
  await openHarness(page);
  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .dblclick();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  await page.getByRole("tab", { name: "Räume" }).click();
  await page
    .getByRole("group", { name: "Räume" })
    .getByRole("button", { name: "Raum anlegen" })
    .click();
  const box = await page.locator(".map-view-canvas").boundingBox();
  if (!box) throw new Error("no map view");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.up();
  await expect(page.locator(".map-view-room")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-forge-room.png");
});

test("a ribbon tool's command panel over the map (T-252)", async ({ page }) => {
  await openHarness(page);
  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .dblclick();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  await page
    .getByRole("group", { name: "Raster" })
    .getByRole("button", { name: "Raster kalibrieren" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Raster kalibrieren" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot("dm-window-command-panel.png");
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
  await expect(page.locator(".dm-catalog .dm-map-thumb img")).toBeVisible();
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
