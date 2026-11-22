// The DM window in the browser harness (T-130a): real UI, in-memory library, no Tauri.
import { expect, test, type Page } from "@playwright/test";

// The living fog (T-245) drifts with the real clock: still fog keeps these runs deterministic
// and light on the software GPU. The renderer harness covers the living fog at frozen moments.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("dm.fog.quality") === null)
      localStorage.setItem("dm.fog.quality", "off");
  });
});

const HARNESS = "http://localhost:4175/e2e.html";

/** Closes the welcome dialog of every start (T-153) into the empty window. */
async function closeWelcome(page: Page) {
  const welcome = page.getByRole("dialog", { name: "Willkommen" });
  await expect(welcome).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(welcome).toBeHidden();
}

/** The DM window as after a start, past the welcome dialog. */
async function openDmWindow(page: Page) {
  await page.goto(HARNESS);
  await closeWelcome(page);
}

test("the DM opens a campaign and a scene and sees its map", async ({
  page,
}) => {
  await openDmWindow(page);

  await expect(
    page.getByRole("heading", { name: "Spielleitung" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("tab", { name: "Bibliothek" }).click();
  await expect(page.getByText("Ordner: /Bibliothek (E2E)")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();

  // "Einpassen" is enabled only once the renderer has drawn the map; a load error shows an alert.
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  // No load error; the panel library's own live regions stay empty.
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(
    0,
  );
  const box = await page.locator(".map-view-canvas canvas").boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
});

test("the DM window lists the displays for the player view", async ({
  page,
}) => {
  await openDmWindow(page);

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

test("the map fills its panel, and grows when the data panel is hidden (ADR-0014, T-172a)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();

  const box = async (selector: string) => {
    const found = await page.locator(selector).boundingBox();
    if (!found) throw new Error(`${selector} not laid out`);
    return found;
  };
  /** Within a pixel: the canvas size is whole pixels, panel sizes can be fractional. */
  const near = (actual: number, expected: number) => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
  };
  /** The canvas covers exactly the map panel's content: fit and zoom need no insets. */
  const mapFillsItsPanel = async () => {
    const canvas = await box(".map-view-canvas canvas");
    const stage = await box(".dm-stage");
    near(canvas.x, stage.x);
    near(canvas.y, stage.y);
    near(canvas.width, stage.width);
    near(canvas.height, stage.height);
    return canvas.width;
  };
  // Default layout (DM decision): Daten left of the map, the map below the ribbon.
  const ribbon = await box(".dm-ribbon");
  const data = await box(".dm-datapanel");
  const stage = await box(".dm-stage");
  expect(data.x + data.width).toBeLessThanOrEqual(stage.x + 1);
  expect(stage.y).toBeGreaterThanOrEqual(ribbon.y + ribbon.height - 1);
  const narrow = await mapFillsItsPanel();

  await page
    .getByRole("button", { name: /Daten ein- oder ausblenden/ })
    .click();
  await expect(page.locator(".dm-datapanel")).toHaveCount(0);
  // The renderer follows the canvas size on the next frame.
  await expect
    .poll(async () => (await box(".map-view-canvas canvas")).width)
    .toBeGreaterThan(narrow);
  await mapFillsItsPanel();
  await page.keyboard.press("ControlOrMeta+KeyB");
  await expect(page.locator(".dm-datapanel")).toHaveCount(1);
  await expect
    .poll(async () => (await box(".map-view-canvas canvas")).width)
    .toBeLessThan(narrow + 2);
  await mapFillsItsPanel();
});

test("the theme chosen in the settings survives a restart", async ({
  page,
}) => {
  await openDmWindow(page);
  const html = page.locator("html");
  // Dark workshop on first start (ADR-0015).
  await expect(html).toHaveAttribute("data-dm-theme", "workshop");

  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("radio", { name: "Hell (Pergament)" }).check();
  await expect(html).toHaveAttribute("data-dm-theme", "parchment");

  await page.reload();
  await closeWelcome(page);
  await expect(html).toHaveAttribute("data-dm-theme", "parchment");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(
    page.getByRole("radio", { name: "Hell (Pergament)" }),
  ).toBeChecked();
});

test("ribbon commands work from the keyboard: menu, confirmation popover", async ({
  page,
}) => {
  await openDmWindow(page);
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
  await openDmWindow(page);
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

test("the DM picks a scene's map from the library catalog; deleting the scene keeps the map (T-124)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const campaign = page.getByRole("treeitem", { name: "Fluch der Krypta" });
  await campaign.focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("Enter");
  await page.getByLabel("Name der neuen Szene").fill("Gruft");
  await page.getByRole("button", { name: "Karte wählen …" }).click();

  const picker = page.getByRole("dialog", { name: "Karte wählen" });
  const tile = picker.getByRole("button", { name: /krypta\.png/ });
  // The preview is drawn in the webview from the map itself.
  await expect(tile.locator("img")).toBeVisible();
  await tile.click();
  await expect(picker).toBeHidden();
  await expect(
    page.getByText("Karte für die neue Szene: krypta.png"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Szene anlegen" }).click();
  await page.getByRole("tab", { name: "Szene" }).click();
  await expect(page.getByText("Karte: krypta.png")).toBeVisible();

  await page.getByRole("button", { name: "Szene", exact: true }).click();
  await page.getByRole("menuitem", { name: "Szene löschen …" }).click();
  await page.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(
    page.getByText("Szene „Gruft“ ist im Papierkorb der Kampagne."),
  ).toBeVisible();
  // The data panel's catalog still has the map, for every campaign.
  await expect(
    page
      .getByRole("list", { name: "Karten" })
      .getByRole("listitem")
      .filter({ hasText: "krypta.png" }),
  ).toBeVisible();
});

test("a catalog map's name and license are edited in Eigenschaften; the browser takes it back (T-125)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const details = page.getByRole("region", { name: "Eigenschaften" });

  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .click();
  await details.getByLabel("Name").fill("Gruft der Ahnen");
  await details.getByLabel("Lizenz / Nutzungsrechte").fill("selbst gezeichnet");
  await details.getByRole("button", { name: "Speichern" }).click();
  await expect(
    details.getByText("Gespeichert – gilt in allen Kampagnen."),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Karten" }).getByText("Gruft der Ahnen"),
  ).toBeVisible();

  // Selecting in the browser shows its item again.
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(details.getByLabel("Name")).toHaveCount(0);
  await expect(details.getByText("Szene", { exact: true })).toBeVisible();
});

test("a map opened in the Map Forge gets a new grid; the scene on the TV takes it after the DM confirms (T-176a)", async ({
  page,
}) => {
  // `?tv`: a TV is connected, and what it is sent is noted on the page.
  await page.goto(`${HARNESS}?tv`);
  await closeWelcome(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  const tvGrid = () =>
    page.evaluate(
      () =>
        (
          JSON.parse(document.body.dataset["e2eTv"] ?? "null") as {
            map?: { grid: { cellSizePx: number } };
          } | null
        )?.map?.grid.cellSizePx,
    );
  await expect.poll(tvGrid).toBe(100);

  // A double-click on the catalog tile opens the map in the Map Forge.
  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .dblclick();
  await expect(
    page.getByRole("group", { name: "Arbeitsbereich" }).getByRole("button"),
  ).toHaveText("Map Forge");
  await expect(
    page.getByRole("group", { name: "Geöffnete Karte" }),
  ).toContainText("krypta.png");
  await expect(page.getByRole("tree", { name: "Karte" })).toContainText(
    "Ebene 1",
  );
  const details = page.getByRole("region", { name: "Eigenschaften" });
  await details.getByLabel("Zellgröße (Pixel)").fill("50");
  await details.getByRole("button", { name: "Kartendaten speichern" }).click();
  await expect(
    details.getByText(/Gespeichert – gilt für jede Szene/),
  ).toBeVisible();
  // The scene on the TV keeps its grid until the DM takes the change.
  expect(await tvGrid()).toBe(100);

  const workspace = page
    .getByRole("group", { name: "Arbeitsbereich" })
    .getByRole("button");
  await workspace.click();
  await page.getByRole("menuitemradio", { name: "Game-Orchestrator" }).click();
  await page.getByRole("button", { name: "Änderung übernehmen" }).click();
  await expect.poll(tvGrid).toBe(50);
});

test("the grid is calibrated by a box over 3 × 3 printed cells and moved by arrow keys (T-177)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .dblclick();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  const details = page.getByRole("region", { name: "Eigenschaften" });
  await details.getByRole("button", { name: "Box aufziehen" }).click();

  // Where map pixels are on screen (rotation 0): the view's centre shows the camera's centre.
  const canvas = page.locator(".map-view-canvas");
  const box = await canvas.boundingBox();
  const camera = await page.evaluate(
    () =>
      JSON.parse(document.body.dataset["e2eCamera"] ?? "null") as {
        centerX: number;
        centerY: number;
        zoom: number;
      },
  );
  if (!box) throw new Error("no map view");
  const screen = (x: number, y: number) => ({
    x: box.x + box.width / 2 + (x - camera.centerX) * camera.zoom,
    y: box.y + box.height / 2 + (y - camera.centerY) * camera.zoom,
  });
  // The harness map's own cells are 100 px; drag over 3 × 3 of them from (200, 300).
  const from = screen(200, 300);
  const to = screen(500, 600);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();

  const cell = details.getByLabel("Zellgröße (Pixel)");
  await expect
    .poll(async () => Math.abs(Number(await cell.inputValue()) - 100))
    .toBeLessThan(1.5);
  const offsetX = details.getByLabel("Versatz waagerecht (Pixel)");
  const x = Number(await offsetX.inputValue());

  // Fine adjustment: arrow keys move the grid by a pixel.
  await details.getByRole("button", { name: "Raster verschieben" }).click();
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => Number(await offsetX.inputValue()))
    .toBeCloseTo((x + 1) % Number(await cell.inputValue()), 1);

  await details.getByRole("button", { name: "Kartendaten speichern" }).click();
  await expect(
    details.getByText(/Gespeichert – gilt für jede Szene/),
  ).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Raster verschieben" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("a room drawn in the Map Forge is named and shows in every scene of the map (T-108c1)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page
    .getByRole("list", { name: "Karten" })
    .getByRole("button", { name: /krypta\.png/ })
    .dblclick();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  const details = page.getByRole("region", { name: "Eigenschaften" });
  await details.getByRole("button", { name: "Rechteck" }).click();

  const canvas = page.locator(".map-view-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no map view");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.up();

  // The new room has the keyboard for its name.
  const roomForm = details.locator("form", {
    has: page.locator(".dm-details-kind", { hasText: /^Raum$/ }),
  });
  const name = roomForm.getByLabel("Name");
  await expect(name).toHaveValue("Raum 1");
  await expect(name).toBeFocused();
  await name.fill("Gruft");
  await name.press("Enter");
  const forgeTree = page.getByRole("tree", { name: "Karte" });
  await expect(forgeTree.getByText("Gruft")).toBeVisible();

  // Every scene of the map has it: here the campaign's scene Krypta.
  await page
    .getByRole("group", { name: "Arbeitsbereich" })
    .getByRole("button")
    .click();
  await page.getByRole("menuitemradio", { name: "Game-Orchestrator" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "Gruft", exact: true }),
  ).toBeVisible();
});

test("the empty Map Forge says how to open a map, without the scene hint (T-176a)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page
    .getByRole("group", { name: "Arbeitsbereich" })
    .getByRole("button")
    .click();
  await page.getByRole("menuitemradio", { name: "Map Forge" }).click();
  await expect(
    page.getByText(
      "Keine Karte geöffnet. Doppelklicke im Katalog auf eine Karte.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/Keine Szene geöffnet/)).toBeHidden();
});

test("panels are hidden and shown from the View menu; the layout survives a restart (T-172a)", async ({
  page,
}) => {
  await openDmWindow(page);
  const campaign = page.getByRole("button", { name: "Fluch der Krypta" });
  await expect(campaign).toBeVisible();

  await page.getByRole("button", { name: "Menü" }).click();
  const browserItem = page.getByRole("menuitemcheckbox", { name: "Browser" });
  await expect(browserItem).toHaveAttribute("aria-checked", "true");
  await browserItem.click();
  await expect(campaign).toBeHidden();

  await page.reload();
  await closeWelcome(page);
  await expect(
    page.getByRole("button", { name: "Fluch der Krypta" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Menü" }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Browser" }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("menuitem", { name: "Layout zurücksetzen" }).click();
  await expect(
    page.getByRole("button", { name: "Fluch der Krypta" }),
  ).toBeVisible();
});

test("hiding and showing the map keeps its renderer and its zoom (T-172a)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  await page.getByRole("button", { name: "Vergrößern" }).click();
  const camera = () =>
    page.evaluate(() => document.body.dataset["e2eCamera"] ?? "");
  const zoomed = await camera();
  await page.evaluate(() => {
    (window as unknown as { e2eCanvas?: Element | null }).e2eCanvas =
      document.querySelector(".map-view-canvas canvas");
  });

  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Karte" }).click();
  await expect(page.locator(".map-view-canvas canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Karte" }).click();

  await expect(page.locator(".map-view-canvas canvas")).toHaveCount(1);
  // The very same canvas: the renderer was never torn down, the view keeps its zoom.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { e2eCanvas?: Element | null }).e2eCanvas ===
        document.querySelector(".map-view-canvas canvas"),
    ),
  ).toBe(true);
  expect(await camera()).toBe(zoomed);
});

test("a panel is resized by dragging its edge, and keeps its size after a restart (T-172a)", async ({
  page,
}) => {
  await openDmWindow(page);
  const data = page.locator(".dm-datapanel");
  const before = await data.boundingBox();
  if (!before) throw new Error("data panel not laid out");
  // The edge between Daten and the map.
  const edgeX = before.x + before.width;
  const y = before.y + before.height / 2;
  await page.mouse.move(edgeX, y);
  await page.mouse.down();
  await page.mouse.move(edgeX + 120, y, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await data.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 100);
  const resized = (await data.boundingBox())?.width ?? 0;

  await page.reload();
  await closeWelcome(page);
  await expect
    .poll(
      async () =>
        (await page.locator(".dm-datapanel").boundingBox())?.width ?? 0,
    )
    .toBeGreaterThan(resized - 2);
});

test("selecting a scene in the browser shows its properties on the right", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const details = page.getByRole("tabpanel", { name: "Eigenschaften" });
  await expect(
    details.getByText("Wähle im Browser einen Eintrag."),
  ).toBeVisible();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(details.getByText("krypta.png")).toBeVisible();

  // Default layout (DM decision, T-172a): right of the map, below the browser.
  const stage = await page.locator(".dm-stage").boundingBox();
  const box = await details.boundingBox();
  const browser = await page
    .getByRole("tabpanel", { name: "Browser" })
    .boundingBox();
  if (!stage || !box || !browser) throw new Error("not laid out");
  expect(box.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
  expect(box.y).toBeGreaterThanOrEqual(browser.y + browser.height - 1);
});

test("the DM plans a session and adds a scene to it from the browser", async ({
  page,
}) => {
  await openDmWindow(page);
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
  await openDmWindow(page);
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
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const campaign = page.getByRole("treeitem", { name: "Fluch der Krypta" });
  await campaign.focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Notiz öffnen" }).click();
  const details = page.getByRole("tabpanel", { name: "Eigenschaften" });
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
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Kampagnennotiz" }).click();
  const details = page.getByRole("tabpanel", { name: "Eigenschaften" });
  await expect(
    details.getByRole("heading", { name: "Fluch der Krypta" }),
  ).toBeVisible();
  await expect(details.getByRole("img", { name: "wappen.png" })).toBeVisible();
  await expect(details.getByText("horror, gruft")).toBeVisible();
  await details.getByRole("button", { name: "Strahd" }).click();
  await expect(details.getByRole("heading", { name: "Strahd" })).toBeVisible();
});

test("the settings dialog opens with Cmd/Ctrl+, and keeps the keyboard inside (T-155)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.keyboard.press("ControlOrMeta+Comma");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  // Tab cycles within the dialog.
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Einstellungen" }),
  ).toBeFocused();
});

test("the welcome dialog opens the last campaign and scene after a restart (T-153)", async ({
  page,
}) => {
  await page.goto(HARNESS);
  const welcome = page.getByRole("dialog", { name: "Willkommen" });
  await welcome.getByRole("button", { name: "Fluch der Krypta" }).click();
  await expect(welcome).toBeHidden();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();

  await page.reload();
  const recent = welcome.getByRole("list", { name: "Zuletzt bearbeitet" });
  const campaign = recent.getByRole("button", { name: /Fluch der Krypta/ });
  await expect(campaign).toContainText("Krypta ·");
  await expect(campaign).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(welcome).toBeHidden();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  await expect(
    page.getByRole("treeitem", { name: "Krypta", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("on the very first start the DM chooses a folder and creates a campaign (T-153)", async ({
  page,
}) => {
  await page.goto(`${HARNESS}?firstStart`);
  const welcome = page.getByRole("dialog", { name: "Willkommen" });
  await expect(
    welcome.getByRole("heading", { name: "Willkommen beim Dungeon Manager" }),
  ).toBeVisible();
  await welcome
    .getByRole("button", { name: "Bibliotheksordner wählen …" })
    .click();

  const name = welcome.getByRole("textbox", {
    name: "Name der neuen Kampagne",
  });
  await expect(name).toBeFocused();
  await name.fill("Die erste Runde");
  await page.keyboard.press("Enter");

  await expect(welcome).toBeHidden();
  await expect(
    page.getByRole("treeitem", { name: "Die erste Runde" }),
  ).toBeVisible();
});

test("the workspace selector switches the ribbon by keyboard and is remembered (T-156)", async ({
  page,
}) => {
  await openDmWindow(page);
  const workspace = page
    .getByRole("group", { name: "Arbeitsbereich" })
    .getByRole("button");
  await expect(workspace).toHaveText("Game-Orchestrator");

  await workspace.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitemradio", { name: "Map Forge" }),
  ).toBeFocused();
  await expect(
    page
      .getByRole("menu", { name: "Arbeitsbereich" })
      .getByRole("menuitemradio", { name: "Game-Orchestrator" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(workspace).toHaveText("Asset Vault");
  await expect(workspace).toBeFocused();
  await expect(
    page.getByRole("tablist", { name: "Werkzeugleisten" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Hier verwaltest du bald Requisiten, Handouts und Sounds."),
  ).toBeVisible();

  await page.reload();
  await closeWelcome(page);
  await expect(workspace).toHaveText("Asset Vault");
});

test("the title bar's menu button opens the welcome dialog again and starts a new campaign (T-130d)", async ({
  page,
}) => {
  await openDmWindow(page);
  const menu = page.getByRole("button", { name: "Menü" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Willkommen …" }).click();
  const welcome = page.getByRole("dialog", { name: "Willkommen" });
  await expect(welcome).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(welcome).toBeHidden();

  await menu.click();
  await page.getByRole("menuitem", { name: "Neue Kampagne …" }).click();
  const name = page.getByRole("textbox", { name: "Name der neuen Kampagne" });
  await expect(name).toBeFocused();
  await name.fill("Zweite Runde");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("treeitem", { name: "Zweite Runde" }),
  ).toBeVisible();
});

test("the ribbon keeps one height in every tab and workspace, so the map never moves (T-131)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Einpassen" })).toBeEnabled();
  const ribbon = page.locator(".dm-ribbon");
  const height = async () => (await ribbon.boundingBox())?.height ?? 0;
  const first = await height();

  for (const tab of ["Szene", "Nebel", "Anzeige"]) {
    await page.getByRole("tab", { name: tab }).click();
    expect(await height()).toBeCloseTo(first, 0);
  }
  await page.getByRole("tab", { name: "Nebel" }).click();
  await page.getByRole("button", { name: "Aufdecken", exact: true }).click();
  await page.getByRole("button", { name: "Pinsel" }).click();
  await expect(page.getByRole("slider", { name: /Pinselgröße/ })).toBeVisible();
  expect(await height()).toBeCloseTo(first, 0);

  const workspace = page
    .getByRole("group", { name: "Arbeitsbereich" })
    .getByRole("button");
  await workspace.click();
  await page.getByRole("menuitemradio", { name: "Map Forge" }).click();
  expect(await height()).toBeCloseTo(first, 0);
});

test("the ellipse reveals and the lasso hides, each one undo step (T-247)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Nebel" }).click();
  const undo = page.getByRole("button", { name: "Rückgängig" });
  const map = page.getByRole("application", { name: /Karte der Szene/ });
  await expect(
    page.getByRole("button", { name: "Alles aufdecken" }),
  ).toBeEnabled();
  const box = await map.boundingBox();
  if (!box) throw new Error("The map has no box.");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Kreis is gone; the ellipse takes its place.
  await expect(page.getByRole("button", { name: "Kreis" })).toHaveCount(0);
  await page.getByRole("button", { name: "Aufdecken", exact: true }).click();
  await page.getByRole("button", { name: "Ellipse" }).click();
  // From the middle outwards.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
  await page.mouse.up();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();

  await page.getByRole("button", { name: "Alles aufdecken" }).click();
  await page.getByRole("button", { name: "Verdecken", exact: true }).click();
  // The shape by its key (T-247).
  await page.keyboard.press("l");
  await expect(page.getByRole("button", { name: "Lasso" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.mouse.move(cx - 60, cy - 40);
  await page.mouse.down();
  for (const [dx, dy] of [
    [60, -40],
    [60, 40],
    [-60, 40],
  ] as const)
    await page.mouse.move(cx + dx, cy + dy, { steps: 3 });
  await page.mouse.up();
  // Two steps: the lasso's hide on top of revealing everything.
  await undo.click();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
});

test("the DM picks the scene's fog biome in the ribbon, one undo step (T-168)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Nebel" }).click();
  const undo = page.getByRole("button", { name: "Rückgängig" });
  // No biome of its own and none on the map: Bodennebel.
  await page.getByRole("button", { name: "Bodennebel" }).click();
  await page.getByRole("menuitemradio", { name: "Schneesturm" }).click();
  await expect(page.getByRole("button", { name: "Schneesturm" })).toBeVisible();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole("button", { name: "Bodennebel" })).toBeVisible();
});

test("N hides the fog in the DM window only, and shows it again (T-248)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Nebel" }).click();
  const toggle = page.getByRole("button", { name: "Nebel ausblenden" });
  const undo = page.getByRole("button", { name: "Rückgängig" });
  // One fog edit to undo: hiding the fog adds no step of its own.
  await page.getByRole("button", { name: "Alles aufdecken" }).click();
  await expect(undo).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("n");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await undo.click();
  await expect(undo).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("the dock zooms and fits the DM's view of the map (T-131)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  const dock = page.getByRole("group", { name: "Ansicht und TV" });
  const fit = dock.getByRole("button", { name: "Einpassen" });
  await expect(fit).toBeEnabled();
  // The camera the renderer got last (noted by the E2E harness).
  const camera = async () =>
    JSON.parse(
      (await page.locator("body").getAttribute("data-e2e-camera")) ?? "null",
    ) as { zoom: number; rotation: number } | null;
  const fitted = await camera();
  expect(fitted?.zoom).toBeGreaterThan(0);

  await dock.getByRole("button", { name: "Vergrößern" }).click();
  await expect
    .poll(async () => (await camera())?.zoom)
    .toBeGreaterThan(fitted?.zoom ?? 0);
  await fit.click();
  await expect
    .poll(async () => (await camera())?.zoom)
    .toBeCloseTo(fitted?.zoom ?? 0, 5);

  await dock.getByRole("button", { name: "Drehen" }).click();
  await expect.poll(async () => (await camera())?.rotation).toBe(90);
});

test("menus and popovers of the ribbon are not cut off by its fixed height (T-131)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Szene" }).click();
  /** Whether a click at the middle of `name` really reaches it (nothing covers or clips it). */
  const reachable = (name: string) =>
    page.getByRole("button", { name, exact: true }).evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit !== null && button.contains(hit);
    });

  await page.getByRole("button", { name: "Szene", exact: true }).click();
  const remove = page.getByRole("menuitem", { name: "Szene löschen …" });
  await expect(remove).toBeVisible();
  expect(
    await remove.evaluate((item) => {
      const box = item.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit !== null && item.contains(hit);
    }),
  ).toBe(true);
  await remove.click();
  await expect(page.getByRole("button", { name: "Ja, löschen" })).toBeVisible();
  expect(await reachable("Ja, löschen")).toBe(true);
  expect(await reachable("Abbrechen")).toBe(true);
});

test("the DM creates a sub-scene from a scene's context menu; it shows nested under it (T-152)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  const krypta = page.getByRole("treeitem", { name: "Krypta", exact: true });
  await krypta.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Neue Unterszene …" }).click();
  const name = page.getByLabel("Name der neuen Szene");
  await expect(name).toBeFocused();
  await name.fill("Geheimkammer");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Geöffnete Szene: Geheimkammer")).toBeVisible();
  const chamber = krypta.getByRole("treeitem", { name: "Geheimkammer" });
  await expect(chamber).toBeVisible();
  const level = Number(await krypta.getAttribute("aria-level"));
  await expect(chamber).toHaveAttribute("aria-level", String(level + 1));
});

test("the DM works on another level and shows it on the TV when ready (T-118c)", async ({
  page,
}) => {
  await page.goto(`${HARNESS}?levels`);
  await closeWelcome(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();

  await page.getByRole("tab", { name: "Szene" }).click();
  const show = page.getByRole("button", { name: "Auf TV zeigen" });
  await expect(page.getByText("Auf dem TV: Ebene 1")).toBeVisible();
  await expect(show).toBeDisabled();
  await page.getByRole("button", { name: "Ebene 1", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Gruftkeller" }).click();
  await expect(
    page.getByRole("button", { name: "Gruftkeller", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Auf dem TV: Ebene 1")).toBeVisible();

  await show.click();
  await expect(page.getByText("Auf dem TV: Gruftkeller")).toBeVisible();
  await expect(show).toBeDisabled();
  // The browser marks the TV's level and the one shown before it.
  await expect(
    page.getByRole("treeitem", { name: /Gruftkeller/ }),
  ).toContainText("auf dem TV");
  await expect(page.getByRole("treeitem", { name: /Ebene 1/ })).toContainText(
    "freigegeben",
  );
});

test("the DM adds a level to a one-level map and renames it (T-118d)", async ({
  page,
}) => {
  await page.goto(HARNESS);
  await closeWelcome(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Szene" }).click();
  // One level: nothing to switch yet, but the group's menu adds one.
  await expect(page.getByRole("button", { name: "Auf TV zeigen" })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Ebene", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ebene hinzufügen …" }).click();
  await page.getByLabel("Name der Ebene").fill("Glockenturm");
  await page.getByRole("button", { name: "Ebene anlegen" }).click();
  // The DM works on the new level; the TV stays on the first one.
  await expect(
    page.getByRole("button", { name: "Glockenturm", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Auf dem TV: Ebene 1")).toBeVisible();

  await page.getByRole("button", { name: "Ebene", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ebene umbenennen …" }).click();
  await page.getByLabel("Name der Ebene").fill("Turmspitze");
  await page.getByRole("button", { name: "Umbenennen" }).click();
  await expect(
    page.getByRole("button", { name: "Turmspitze", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: /Turmspitze/ }),
  ).toBeVisible();
});

test("a level's own image must have the map's size (T-118d)", async ({
  page,
}) => {
  await page.goto(`${HARNESS}?levelFiles`);
  await closeWelcome(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Szene" }).click();
  await page.getByRole("button", { name: "Ebene", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ebene hinzufügen …" }).click();

  const choose = page.getByRole("button", {
    name: "Eigenes Bild oder Video wählen …",
  });
  await choose.click();
  await expect(
    page.getByText(
      /klein\.png ist 800 × 500 Pixel groß, die Karte 1600 × 1000/,
    ),
  ).toBeVisible();
  await choose.click();
  await expect(page.getByText("Eigene Datei: gruft.png")).toBeVisible();
  await page.getByLabel("Name der Ebene").fill("Gruft");
  await page.getByRole("button", { name: "Ebene anlegen" }).click();
  await expect(
    page.getByRole("button", { name: "Gruft", exact: true }),
  ).toBeVisible();
});

test("panels are folded, docked and hidden with the keyboard only (T-172b)", async ({
  page,
}) => {
  await openDmWindow(page);
  const menu = page.getByRole("button", { name: "Panel Browser" });
  const choose = async (item: string) => {
    await menu.focus();
    await page.keyboard.press("Enter");
    const entry = page.getByRole("menuitem", { name: item });
    // Down from the first entry until the wanted one has the focus.
    for (let step = 0; step < 6; step++) {
      if (await entry.evaluate((element) => element === document.activeElement))
        break;
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
  };
  const browserPanel = page.getByRole("tabpanel", { name: "Browser" });
  const before = await browserPanel.boundingBox();
  if (!before) throw new Error("browser not laid out");

  // Fold to its title: Eigenschaften below takes the room; unfold again.
  await choose("Einklappen");
  await expect(
    page.getByRole("status").filter({ hasText: "Browser eingeklappt" }),
  ).toHaveCount(1);
  await expect
    .poll(async () => (await browserPanel.boundingBox())?.height ?? 0)
    .toBeLessThan(10);
  await choose("Ausklappen");
  await expect
    .poll(async () => (await browserPanel.boundingBox())?.height ?? 0)
    .toBeGreaterThan(before.height - 2);

  // Dock it left of everything; the keyboard stays on its menu.
  await choose("Links andocken");
  await expect(menu).toBeFocused();
  const map = await page.locator(".dm-stage").boundingBox();
  const docked = await browserPanel.boundingBox();
  expect((docked?.x ?? 0) + (docked?.width ?? 0)).toBeLessThanOrEqual(
    (map?.x ?? 0) + 1,
  );

  // Hide it; the keyboard moves to the title bar.
  await choose("Ausblenden");
  await expect(page.getByRole("button", { name: "Panel Browser" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /Daten ein- oder ausblenden/ }),
  ).toBeFocused();
});

test("a folded panel stays folded on the next start and unfolds when alone in its column (T-172b)", async ({
  page,
}) => {
  await openDmWindow(page);
  const browserPanel = page.getByRole("tabpanel", { name: "Browser" });
  const height = async () => (await browserPanel.boundingBox())?.height ?? 0;
  const menu = page.getByRole("button", { name: "Panel Browser" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Einklappen" }).click();
  await expect.poll(height).toBeLessThan(10);

  await page.reload();
  await closeWelcome(page);
  await expect.poll(height).toBeLessThan(10);
  // A bigger window shares out height, never to a folded panel.
  await page.setViewportSize({ width: 1400, height: 1000 });
  await expect.poll(height).toBeLessThan(10);
  await menu.click();
  await expect(
    page.getByRole("menuitem", { name: "Ausklappen" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Without Eigenschaften, TV-Vorschau and Initiative below it, Browser has the column: unfolded, nothing
  // to fold, and choosing it anyway announces nothing.
  await page.getByRole("button", { name: "Eigenschaften ausblenden" }).click();
  await page.getByRole("button", { name: "Initiative ausblenden" }).click();
  await page.getByRole("button", { name: "TV-Vorschau ausblenden" }).click();
  await expect.poll(height).toBeGreaterThan(200);
  await menu.click();
  await expect(
    page.getByRole("menuitem", { name: "Einklappen" }),
  ).toHaveAttribute("aria-disabled", "true");
});

test("a floating panel's menu opens at its button (T-172b)", async ({
  page,
}) => {
  await openDmWindow(page);
  const menu = page.getByRole("button", { name: "Panel Browser" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Schwebend" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Browser schwebt" }),
  ).toHaveCount(1);

  await menu.click();
  const button = await menu.boundingBox();
  const list = await page
    .getByRole("menu", { name: "Panel Browser" })
    .boundingBox();
  if (!button || !list) throw new Error("menu not laid out");
  // Right under the button (4 px gap), not shifted by the floating window's position.
  expect(Math.abs(list.y - (button.y + button.height + 4))).toBeLessThan(2);
  expect(list.x).toBeLessThanOrEqual(button.x + 1);
  expect(list.x + list.width).toBeGreaterThan(button.x);

  // Back into the grid from its own menu.
  await page.getByRole("menuitem", { name: "Rechts andocken" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Browser rechts angedockt" }),
  ).toHaveCount(1);
});

test("the DM saves, switches, renames and deletes named layouts; they survive a restart (T-172c)", async ({
  page,
}) => {
  await openDmWindow(page);
  const menuButton = page.getByRole("button", { name: "Menü" });
  const browserShown = async () => {
    await menuButton.click();
    const checked = await page
      .getByRole("menuitemcheckbox", { name: "Browser" })
      .getAttribute("aria-checked");
    await page.keyboard.press("Escape");
    return checked === "true";
  };

  // "Kampf": without the browser, saved from the View menu.
  await page.getByRole("button", { name: "Browser ausblenden" }).click();
  await menuButton.click();
  await page.getByRole("menuitem", { name: "Layout speichern …" }).click();
  await page.getByLabel("Name des Layouts").fill("Kampf");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Layout „Kampf“ gespeichert" }),
  ).toHaveCount(1);

  // Back to the default, then switch to "Kampf" from the View menu.
  await menuButton.click();
  await page.getByRole("menuitem", { name: "Layout zurücksetzen" }).click();
  expect(await browserShown()).toBe(true);
  await menuButton.click();
  await page.getByRole("menuitem", { name: "Layout „Kampf“" }).click();
  expect(await browserShown()).toBe(false);

  // After a restart: still there; renamed and deleted in the settings.
  await page.reload();
  await closeWelcome(page);
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("tab", { name: "Panels" }).click();
  const saved = page.getByRole("group", { name: "Gespeicherte Layouts" });
  await saved.getByRole("button", { name: "Kampf umbenennen" }).click();
  await saved.getByLabel("Name des Layouts").first().fill("Gefecht");
  await saved.getByRole("button", { name: "Umbenennen" }).click();
  await expect(saved.getByText("Gefecht")).toBeVisible();
  await saved.getByRole("button", { name: "Gefecht löschen" }).click();
  await expect(
    saved.getByText("Noch keine Layouts gespeichert."),
  ).toBeVisible();
});

test("scenes open as tabs, switched and closed by keyboard; the TV stays until the DM sends another (T-223a)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  // An edit in Krypta: its own undo history.
  await page.getByRole("tab", { name: "Nebel" }).click();
  const revealAll = page.getByRole("button", { name: "Alles aufdecken" });
  await expect(revealAll).toBeEnabled();
  await revealAll.click();
  const undo = page.getByRole("button", { name: "Rückgängig" });
  await expect(undo).toBeEnabled();
  await page.getByRole("tab", { name: "Szene" }).click();
  await page.getByRole("button", { name: "Neue Szene …" }).click();
  await page.getByLabel("Name der neuen Szene").fill("Turm");
  await page.getByRole("button", { name: "Szene anlegen" }).click();

  const tabs = page.getByRole("group", { name: "Offene Szenen" });
  const tab = (name: string) =>
    tabs.locator(".dm-scene-tab-name", { hasText: name });
  await expect(tab("Turm")).toHaveAttribute("aria-current", "true");
  // Krypta was on the TV and stays there.
  await expect(tab("Krypta")).toContainText("auf dem TV");
  await expect(tab("Turm")).not.toContainText("auf dem TV");
  // The new scene has nothing to undo; Krypta keeps its history.
  await expect(undo).toBeDisabled();

  // Keyboard only: to Krypta's tab and back to Turm; focus stays in the tab bar.
  await tab("Krypta").focus();
  await page.keyboard.press("Enter");
  await expect(tab("Krypta")).toHaveAttribute("aria-current", "true");
  await expect(tab("Krypta")).toBeFocused();
  await expect(page.getByText("Geöffnete Szene: Krypta")).toBeAttached();
  await expect(undo).toBeEnabled();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(tab("Turm")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tab("Turm")).toHaveAttribute("aria-current", "true");
  await expect(tab("Turm")).toBeFocused();

  // Turm to the TV, then closed with its ✕ from the keyboard: the TV goes dark.
  await page.getByRole("button", { name: "Szene auf den TV" }).click();
  await expect(tab("Turm")).toContainText("auf dem TV");
  await expect(tab("Krypta")).not.toContainText("auf dem TV");
  await tab("Turm").focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Turm schließen" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tab("Turm")).toHaveCount(0);
  await expect(tab("Krypta")).toHaveAttribute("aria-current", "true");
  await expect(tab("Krypta")).toBeFocused();
  await expect(tab("Krypta")).not.toContainText("auf dem TV");
});

test("a tab whose save failed shows a dot and asks before closing (T-223b)", async ({
  page,
}) => {
  await page.goto(`${HARNESS}?failSaves`);
  await closeWelcome(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  const tab = page
    .getByRole("group", { name: "Offene Szenen" })
    .locator(".dm-scene-tab-name", { hasText: "Krypta" });
  await expect(tab.locator(".dm-scene-tab-dot")).toHaveCount(0);

  await page.getByRole("tab", { name: "Nebel" }).click();
  const revealAll = page.getByRole("button", { name: "Alles aufdecken" });
  await expect(revealAll).toBeEnabled();
  await revealAll.click();
  await expect(tab).toContainText("nicht gespeichert");
  await expect(tab.locator(".dm-scene-tab-dot")).toHaveCount(1);

  const close = page.getByRole("button", { name: "Krypta schließen" });
  await close.click();
  const dialog = page.getByRole("dialog", { name: "Szene schließen?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Offen lassen" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tab).toHaveCount(1);
  await expect(close).toBeFocused();

  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog", { name: "Szene schließen?" })
    .getByRole("button", { name: "Trotzdem schließen" })
    .click();
  await expect(tab).toHaveCount(0);
});

test("after a crash the scene tabs come back and the TV stays dark until the DM sends a scene (T-114a)", async ({
  page,
  context,
  browser,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  const tabIn = (each: typeof page) =>
    each
      .getByRole("group", { name: "Offene Szenen" })
      .locator(".dm-scene-tab-name", { hasText: "Krypta" });
  await expect(tabIn(page)).toContainText("auf dem TV");

  // A forced kill: the device storage as it is mid-session, with nothing run on the way out,
  // is what the next start finds – a new window on exactly that storage.
  const killed = await context.storageState();
  const next = await (
    await browser.newContext({ storageState: killed })
  ).newPage();
  await next.goto(HARNESS);
  await next
    .getByRole("dialog", { name: "Willkommen" })
    .getByRole("button", { name: /Fluch der Krypta/ })
    .click();
  await expect(tabIn(next)).toHaveAttribute("aria-current", "true");
  await expect(tabIn(next)).not.toContainText("auf dem TV");
  await next.getByRole("tab", { name: "Szene" }).click();
  await next.getByRole("button", { name: "Szene auf den TV" }).click();
  await expect(tabIn(next)).toContainText("auf dem TV");

  // A clean restart puts the TV's scene back on the TV.
  // Remembered (an effect after the render) before the window closes.
  await expect
    .poll(() => next.evaluate(() => localStorage.getItem("dm.recentCampaigns")))
    .toContain('"tvSceneId":"e2e-scene"');
  await next.reload();
  await next
    .getByRole("dialog", { name: "Willkommen" })
    .getByRole("button", { name: /Fluch der Krypta/ })
    .click();
  await expect(tabIn(next)).toContainText("auf dem TV");
  await next.context().close();
});

test("changes whose save failed survive a forced kill and are restored on the next start (T-114b)", async ({
  page,
  context,
  browser,
}) => {
  await page.goto(`${HARNESS}?failSaves`);
  await closeWelcome(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Nebel" }).click();
  const revealAll = page.getByRole("button", { name: "Alles aufdecken" });
  await expect(revealAll).toBeEnabled();
  await revealAll.click();
  await expect(
    page.getByRole("group", { name: "Offene Szenen" }),
  ).toContainText("nicht gespeichert");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("dm.rescueCopies")))
    .toContain("Krypta");

  // Killed, then started again where saving works.
  const killed = await context.storageState();
  const next = await (
    await browser.newContext({ storageState: killed })
  ).newPage();
  await next.goto(HARNESS);
  await next
    .getByRole("dialog", { name: "Willkommen" })
    .getByRole("button", { name: /Fluch der Krypta/ })
    .click();
  await expect(
    next.getByRole("treeitem", { name: /Nebel/ }).first(),
  ).toContainText("0 Bereiche aufgedeckt");
  await next
    .getByRole("button", { name: "Änderungen an Krypta wiederherstellen" })
    .click();
  await expect(
    next.getByText("Änderungen an Krypta wiederhergestellt"),
  ).toBeVisible();
  await expect(
    next.getByRole("treeitem", { name: /Nebel/ }).first(),
  ).toContainText("1 Bereich aufgedeckt");
  await next.context().close();
});

test("the calibrated TV's view is a frame the DM moves by its border; the inside still pans the map (T-106c)", async ({
  page,
}) => {
  // The 4K "Tisch-TV" of the harness, calibrated: 400 px per inch, so its view is small enough
  // to lie on the map.
  await page.addInitScript(() => {
    localStorage.setItem(
      "dm.displayCalibration",
      JSON.stringify({
        version: 2,
        displays: { "Tisch-TV|3840x2160": { inchPx: 400 } },
      }),
    );
  });
  await openDmWindow(page);
  await page.getByRole("button", { name: "Spieleransicht öffnen" }).click();
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();

  const frame = page.getByRole("button", { name: /Ausschnitt des TVs/ });
  await expect(frame).toBeAttached();
  const corners = async () =>
    ((await frame.getAttribute("points")) ?? "")
      .split(" ")
      .map((pair) => pair.split(",").map(Number) as [number, number]);
  const box = await page.locator(".map-view-tv-frame").boundingBox();
  if (!box) throw new Error("frame not laid out");
  const fit = page.getByRole("button", { name: "Einpassen" });
  const at = ([x, y]: [number, number]) => ({ x: box.x + x, y: box.y + y });
  const drag = async (from: { x: number; y: number }, dx: number) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx / 2, from.y, { steps: 3 });
    await page.mouse.move(from.x + dx, from.y, { steps: 3 });
    await page.mouse.up();
  };
  const start = await corners();
  const [topLeft, , , bottomLeft] = start;
  if (!topLeft || !bottomLeft) throw new Error("no frame corners");

  // Inside the frame: the DM's own view pans; after "Einpassen" the frame is where it was.
  const middle = start.reduce<[number, number]>(
    ([x, y], [cx, cy]) => [x + cx / 4, y + cy / 4] as [number, number],
    [0, 0],
  );
  await drag(at(middle), 80);
  await fit.click();
  await expect.poll(corners).toEqual(start);

  // By its border: the TV's view moves; it stays moved after "Einpassen".
  await drag(at([topLeft[0], (topLeft[1] + bottomLeft[1]) / 2]), 80);
  await fit.click();
  await expect
    .poll(async () => (await corners())[0]?.[0] ?? 0)
    .toBeGreaterThan(topLeft[0] + 20);
});

test("the DM drags a token by mouse, moves it with the keys and deletes it (T-107b)", async ({
  page,
}) => {
  await openDmWindow(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  await page.getByRole("tab", { name: "Szene" }).click();
  await page.getByRole("button", { name: "Token anlegen …" }).click();
  await page.getByLabel("Name").fill("Goblin");
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  // On the grid: moves go by whole cells (T-233d; outside combat they are free by default).
  await page.getByRole("button", { name: /Wie Kampagne/ }).click();
  await page.getByRole("menuitemradio", { name: "Immer Raster" }).click();

  interface Drawn {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly selected?: boolean;
  }
  // What the real renderer was last asked to draw, and with which camera (see fake-platform).
  const drawn = () =>
    page.evaluate(
      () => JSON.parse(document.body.dataset["e2eTokens"] ?? "[]") as Drawn[],
    );
  await expect.poll(async () => (await drawn()).length).toBe(1);
  const [token] = await drawn();
  if (!token) throw new Error("no token drawn");
  const camera = await page.evaluate(
    () =>
      JSON.parse(document.body.dataset["e2eCamera"] ?? "{}") as {
        centerX: number;
        centerY: number;
        zoom: number;
      },
  );
  const box = await page.locator(".map-view-canvas canvas").boundingBox();
  if (!box) throw new Error("map not laid out");
  // The view is not rotated: map pixels to page pixels.
  const onPage = (x: number, y: number) => ({
    x: box.x + box.width / 2 + (x - camera.centerX) * camera.zoom,
    y: box.y + box.height / 2 + (y - camera.centerY) * camera.zoom,
  });
  const centre = onPage(token.x + token.width / 2, token.y + token.height / 2);
  const cell = token.width;

  // Dragged two cells left: it snaps to them and is selected.
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - cell * camera.zoom, centre.y, { steps: 4 });
  await page.mouse.move(centre.x - 2.2 * cell * camera.zoom, centre.y, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await drawn())[0])
    .toMatchObject({ x: token.x - 2 * cell, y: token.y, selected: true });

  // The arrow keys move the selection a cell, Delete removes it.
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(async () => (await drawn())[0])
    .toMatchObject({ x: token.x - 2 * cell, y: token.y + cell });
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await drawn()).length).toBe(0);
  // Undone, it is back where it was.
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => (await drawn())[0])
    .toMatchObject({ x: token.x - 2 * cell, y: token.y + cell });
});

test("the DM starts a combat: tokens snap onto cells, and the TV learns of it (T-233b)", async ({
  page,
}) => {
  await page.goto(`${HARNESS}?freeToken&tv`);
  await closeWelcome(page);
  await page.getByRole("button", { name: "Fluch der Krypta" }).click();
  await page.getByRole("treeitem", { name: "Krypta", exact: true }).click();
  // The first scene opened goes to the TV by itself.

  // What the TV was last sent (see fake-platform).
  const tv = () =>
    page.evaluate(
      () =>
        JSON.parse(document.body.dataset["e2eTv"] ?? "null") as {
          combat?: true;
          tokens: { position: { col: number; row: number } }[];
        } | null,
    );
  const position = async () => (await tv())?.tokens[0]?.position;
  // The players see tokens in revealed fog only.
  await page.getByRole("tab", { name: "Nebel" }).click();
  await page.getByRole("button", { name: "Alles aufdecken" }).click();
  await expect.poll(position).toEqual({ col: 3.4, row: 2.3 });
  await expect.poll(async () => (await tv())?.combat).toBeUndefined();

  await page.getByRole("tab", { name: "Szene" }).click();
  const combat = page.getByRole("button", { name: "Kampf", exact: true });
  await combat.click();
  await expect(combat).toHaveAttribute("aria-pressed", "true");
  await expect.poll(position).toEqual({ col: 3, row: 2 });
  await expect.poll(async () => (await tv())?.combat).toBe(true);

  // Ending it leaves the token where it is.
  await combat.click();
  await expect(combat).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await tv())?.combat).toBeUndefined();
  expect(await position()).toEqual({ col: 3, row: 2 });
});

test('the DM blacks the TV out with "." and the dock\'s button (T-113a)', async ({
  page,
}) => {
  await page.goto(`${HARNESS}?tv`);
  await closeWelcome(page);
  const black = () =>
    page.evaluate(() => document.body.dataset["e2eBlackout"] ?? "");
  const button = page.getByRole("button", { name: "TV schwarz (.)" });
  await expect.poll(black).toBe("false");
  await page.keyboard.press(".");
  await expect.poll(black).toBe("true");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();
  await expect.poll(black).toBe("false");
});
