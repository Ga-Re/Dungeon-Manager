// Renderer screenshots (T-105a): the self-drawn fixture map in the DM view's camera states.
// The harness is built by `pnpm test:visual` before the container starts.
import { expect, test } from "@playwright/test";
import { fixturePage } from "../fixture-pages.js";

for (const scenario of ["fit", "zoomed", "rotated"]) {
  test(`DM view: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`dm-${scenario}.png`);
  });
}

// Fog (T-105b, T-108a): opaque for players, also rotated and for nested or touching areas;
// see-through for the DM.
for (const scenario of [
  "player",
  "player-rotated",
  "player-nested",
  "dm-fog",
]) {
  test(`player view: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}
