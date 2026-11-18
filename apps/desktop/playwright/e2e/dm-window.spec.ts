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

  const canvas = page.locator(".map-view-canvas canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
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
  await expect(page.getByRole("status").first()).toHaveText(
    "Spieleransicht läuft auf Tisch-TV.",
  );
});
