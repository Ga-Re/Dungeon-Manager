// The DM window in the browser harness (T-130a): real UI, in-memory library, no Tauri.
import { expect, test } from "@playwright/test";

const HARNESS = "http://localhost:4175/e2e.html";

test("the DM opens a campaign and a scene and sees its map", async ({
  page,
}) => {
  await page.goto(HARNESS);

  await expect(
    page.getByRole("heading", { name: "Spielleitung" }),
  ).toBeVisible();
  await expect(page.getByText("Ordner: /Bibliothek (E2E)")).toBeVisible();

  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("button", { name: "Krypta", exact: true }).click();

  // "Einpassen" is enabled only once the renderer has drawn the map; a load error shows an alert.
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const box = await page.locator(".map-view-canvas canvas").boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
});

test("the DM window lists the displays for the player view", async ({
  page,
}) => {
  await page.goto(HARNESS);

  const displays = page.getByRole("combobox", {
    name: "Display für die Spieleransicht",
  });
  await expect(displays).toHaveValue("tv");
  await page.getByRole("button", { name: "Spieleransicht öffnen" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Spieleransicht läuft auf Tisch-TV." }),
  ).toBeVisible();
});

test("the map fills the window whether the data panel is open or closed", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("button", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const mapFillsWindow = async () => {
    const box = await page.locator(".map-view-canvas canvas").boundingBox();
    expect(box).toEqual({ x: 0, y: 0, ...viewport });
  };
  const panel = page.getByRole("complementary", { name: "Datenpanel" });

  await expect(panel).toBeVisible();
  await mapFillsWindow();
  await page
    .getByRole("button", { name: /Datenpanel ein- oder ausblenden/ })
    .click();
  await expect(panel).toBeHidden();
  await mapFillsWindow();
  await page.keyboard.press("ControlOrMeta+KeyB");
  await expect(panel).toBeVisible();
  await mapFillsWindow();
});

test("the theme chosen in the settings survives a restart", async ({
  page,
}) => {
  await page.goto(HARNESS);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-dm-theme", "parchment");

  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("radio", { name: "Dunkel (Nacht)" }).check();
  await expect(html).toHaveAttribute("data-dm-theme", "night");

  await page.reload();
  await expect(html).toHaveAttribute("data-dm-theme", "night");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(
    page.getByRole("radio", { name: "Dunkel (Nacht)" }),
  ).toBeChecked();
});

test("ribbon commands work from the keyboard: menu, confirmation popover", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("button", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Szene" }).click();

  const sceneMenu = page.getByRole("button", { name: "Szene", exact: true });
  await sceneMenu.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Szene löschen …" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("group", { name: /wirklich löschen/ });
  await expect(confirm).toBeVisible();
  await expect(
    confirm.getByRole("button", { name: "Ja, löschen" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(sceneMenu).toBeFocused();
});
