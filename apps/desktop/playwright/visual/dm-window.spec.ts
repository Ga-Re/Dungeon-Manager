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

async function openHarness(page: Page) {
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
  await page.goto(`${ORIGIN}/e2e.html`);
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
