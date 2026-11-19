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
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(page.getByText("Ordner: /Bibliothek (E2E)")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();

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

test("the map fills the area right of the data panel and below the ribbon (ADR-0014)", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const box = async (selector: string) => {
    const found = await page.locator(selector).boundingBox();
    if (!found) throw new Error(`${selector} not laid out`);
    return found;
  };
  /** Within a pixel: the canvas size is whole pixels, chrome heights can be fractional. */
  const near = (actual: number, expected: number) => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
  };
  /** The canvas starts where panel and ribbon end and reaches the window's right and bottom. */
  const mapFillsFreeArea = async (panelOpen: boolean) => {
    const canvas = await box(".map-view-canvas canvas");
    const ribbon = await box(".dm-ribbon");
    const left = panelOpen ? (await box(".dm-datapanel")).width : 0;
    near(canvas.x, left);
    near(canvas.y, ribbon.y + ribbon.height);
    near(canvas.x + canvas.width, viewport.width);
    near(canvas.y + canvas.height, viewport.height);
    near(ribbon.x, left);
    return canvas.width;
  };
  const panel = page.getByRole("complementary", { name: "Datenpanel" });

  await expect(panel).toBeVisible();
  // The panel spans everything below the title bar.
  const panelBox = await box(".dm-datapanel");
  const titlebar = await box(".dm-titlebar");
  near(panelBox.y, titlebar.height);
  near(panelBox.y + panelBox.height, viewport.height);
  const narrow = await mapFillsFreeArea(true);

  await page
    .getByRole("button", { name: /Datenpanel ein- oder ausblenden/ })
    .click();
  await expect(panel).toBeHidden();
  // The renderer follows the canvas size on the next frame.
  await expect
    .poll(async () => (await box(".map-view-canvas canvas")).width)
    .toBeGreaterThan(narrow);
  await mapFillsFreeArea(false);
  await page.keyboard.press("ControlOrMeta+KeyB");
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => (await box(".map-view-canvas canvas")).width)
    .toBeCloseTo(narrow, 0);
  await mapFillsFreeArea(true);
});

test("the theme chosen in the settings survives a restart", async ({
  page,
}) => {
  await page.goto(HARNESS);
  const html = page.locator("html");
  // Dark workshop on first start (ADR-0015).
  await expect(html).toHaveAttribute("data-dm-theme", "workshop");

  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("radio", { name: "Hell (Pergament)" }).check();
  await expect(html).toHaveAttribute("data-dm-theme", "parchment");

  await page.reload();
  await expect(html).toHaveAttribute("data-dm-theme", "parchment");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(
    page.getByRole("radio", { name: "Hell (Pergament)" }),
  ).toBeChecked();
});

test("ribbon commands work from the keyboard: menu, confirmation popover", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
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

test("the DM creates a scene from the browser's context menu, by keyboard", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const campaign = page.getByRole("treeitem", { name: "Fluch der Krypta" });
  await campaign.focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Neue Szene …" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const field = page.getByLabel("Name der neuen Szene");
  await expect(field).toBeFocused();
  await field.fill("Grabkammer");
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("treeitem", { name: "Grabkammer" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Szene „Grabkammer“ angelegt.")).toBeVisible();
});

test("the browser can be dragged and folded, and stays so after a restart", async ({
  page,
}) => {
  await page.goto(HARNESS);
  const browser = page.getByRole("region", { name: "Browser" });
  const start = await browser.boundingBox();
  if (!start) throw new Error("browser not laid out");

  const grip = page.getByRole("button", { name: /Browser verschieben/ });
  const gripBox = await grip.boundingBox();
  if (!gripBox) throw new Error("grip not laid out");
  await page.mouse.move(gripBox.x + 5, gripBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + 205, gripBox.y + 105, { steps: 5 });
  await page.mouse.up();
  const moved = await browser.boundingBox();
  expect(Math.round((moved?.x ?? 0) - start.x)).toBe(200);
  expect(Math.round((moved?.y ?? 0) - start.y)).toBe(100);

  const fold = page.getByRole("button", {
    name: "Browser ein- oder ausklappen",
  });
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Fluch der Krypta")).toBeHidden();

  await page.reload();
  const again = await page
    .getByRole("region", { name: "Browser" })
    .boundingBox();
  expect(Math.round(again?.x ?? 0)).toBe(Math.round(moved?.x ?? 0));
  const foldAgain = page.getByRole("button", {
    name: "Browser ein- oder ausklappen",
  });
  await expect(foldAgain).toHaveAttribute("aria-expanded", "false");
  await foldAgain.click();
  await expect(
    page.getByRole("button", { name: "Fluch der Krypta" }),
  ).toBeVisible();
});

test("the browser stays inside the map area; a smaller window does not change its remembered place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(HARNESS);
  const browser = page.getByRole("region", { name: "Browser" });
  const grip = page.getByRole("button", { name: /Browser verschieben/ });
  const gripBox = await grip.boundingBox();
  if (!gripBox) throw new Error("grip not laid out");
  // Far past the right and bottom edges of the map area.
  await page.mouse.move(gripBox.x + 5, gripBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + 3000, gripBox.y + 3000, { steps: 5 });
  await page.mouse.up();
  const stage = await page.locator(".dm-stage").boundingBox();
  const placed = await browser.boundingBox();
  if (!stage || !placed) throw new Error("not laid out");
  expect(placed.x + placed.width).toBeLessThanOrEqual(
    stage.x + stage.width + 1,
  );
  expect(placed.y + placed.height).toBeLessThanOrEqual(
    stage.y + stage.height + 1,
  );
  const remembered = await page.evaluate(() =>
    localStorage.getItem("dm.hud.browser"),
  );

  await page.setViewportSize({ width: 900, height: 600 });
  // The panel moves in once the resize has been observed.
  await expect
    .poll(async () => {
      const small = await browser.boundingBox();
      const smallStage = await page.locator(".dm-stage").boundingBox();
      if (!small || !smallStage) return Infinity;
      return small.x + small.width - (smallStage.x + smallStage.width);
    })
    .toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => localStorage.getItem("dm.hud.browser")),
  ).toBe(remembered);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(async () => (await browser.boundingBox())?.x)
    .toBeCloseTo(placed.x, 0);
});

test("selecting a scene in the browser shows its properties on the right", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const details = page.getByRole("region", { name: "Eigenschaften" });
  await expect(
    details.getByText("Wähle im Browser einen Eintrag."),
  ).toBeVisible();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(details.getByText("krypta.png")).toBeVisible();

  // It sits at the right of the map area.
  const stage = await page.locator(".dm-stage").boundingBox();
  const box = await details.boundingBox();
  if (!stage || !box) throw new Error("not laid out");
  expect(stage.x + stage.width - (box.x + box.width)).toBeLessThan(40);
});

test("the properties panel folds and remembers it apart from the browser", async ({
  page,
}) => {
  await page.goto(HARNESS);
  // The panel belongs to an open campaign.
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const fold = page.getByRole("button", {
    name: "Eigenschaften ein- oder ausklappen",
  });
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await expect(
    page.getByRole("button", { name: "Eigenschaften ein- oder ausklappen" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "Browser ein- oder ausklappen" }),
  ).toHaveAttribute("aria-expanded", "true");
  const stored = await page.evaluate(() => ({
    details: localStorage.getItem("dm.hud.details"),
    browser: localStorage.getItem("dm.hud.browser"),
  }));
  expect(stored.details).toContain('"collapsed":true');
  expect(stored.browser).toBeNull();
});

test("the DM plans a session and adds a scene to it from the browser", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("tab", { name: "Szene" }).click();
  await page.getByRole("button", { name: "Neue Session …" }).click();
  await page.getByLabel("Name der Session").fill("Spielabend 1");
  await page.keyboard.press("Enter");
  const session = page.getByRole("treeitem", { name: "Spielabend 1" });
  await expect(session).toBeVisible();

  const scene = page.getByRole("treeitem", { name: "Krypta", exact: true });
  await scene.focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Zu Session hinzufügen …" }).click();
  await page.getByLabel("Session", { exact: true }).selectOption({
    label: "Spielabend 1",
  });
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(
    session.getByRole("treeitem", { name: "Krypta", exact: true }),
  ).toBeVisible();
});

test("the interface size scales the chrome but never the map area (T-162)", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  const box = async (selector: string) => {
    const found = await page.locator(selector).boundingBox();
    if (!found) throw new Error(`${selector} not laid out`);
    return found;
  };
  const titleBefore = (await box(".dm-titlebar")).height;

  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("radio", { name: "125 %" }).check();
  await page.keyboard.press("Escape");

  await expect
    .poll(async () => (await box(".dm-titlebar")).height)
    .toBeGreaterThan(titleBefore);
  // The canvas still fills exactly the (now smaller) map area.
  await expect
    .poll(async () => {
      const canvas = await box(".map-view-canvas canvas");
      const stage = await box(".dm-stage");
      return (
        Math.abs(canvas.y - stage.y) + Math.abs(canvas.height - stage.height)
      );
    })
    .toBeLessThanOrEqual(1);
});

test("the DM opens the campaign note from the browser (T-161b)", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const campaign = page.getByRole("treeitem", { name: "Fluch der Krypta" });
  await campaign.focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Notiz öffnen" }).click();
  const details = page.getByRole("region", { name: "Eigenschaften" });
  await expect(
    details.getByRole("heading", { name: "Fluch der Krypta" }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: "Kampagnennotiz" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a note renders as Markdown with its image, and a wiki link opens the linked note (T-163)", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Kampagnennotiz" }).click();
  const details = page.getByRole("region", { name: "Eigenschaften" });
  await expect(
    details.getByRole("heading", { name: "Fluch der Krypta" }),
  ).toBeVisible();
  await expect(details.getByRole("img", { name: "wappen.png" })).toBeVisible();
  await expect(details.getByText("horror, gruft")).toBeVisible();
  await details.getByRole("button", { name: "Strahd" }).click();
  await expect(details.getByRole("heading", { name: "Strahd" })).toBeVisible();
});
