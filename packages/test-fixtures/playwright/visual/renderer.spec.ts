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
  // Soft edges (T-136a): softened inside the revealed area only.
  "player-soft",
  "player-nested-soft",
  "dm-fog-soft",
]) {
  test(`player view: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}

// Spreading fog (T-167), frozen half-way: a reveal opens from the revealed room it touches, an
// isolated one from its middle; a hide comes in from the fog side.
for (const scenario of ["spread-adjacent", "spread-isolated", "spread-hide"]) {
  test(`fog change: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    // Half-way, the start of the spread shows the map and its end is still fogged.
    await expect(page.locator("body")).toHaveAttribute(
      "data-spread-start",
      "open",
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-spread-end",
      "fogged",
    );
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}

// Grid lines (T-106b): over the map in the DM view, also zoomed and rotated; under the fog in
// the player view, so hidden areas stay black, lines included.
for (const scenario of ["grid", "grid-zoomed", "grid-rotated", "player-grid"]) {
  test(`grid lines: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}

// Video maps (T-105c, ADR-0010): the video under opaque fog, also rotated; without any fog the
// video must stay hidden (black screen).
for (const scenario of [
  "player-video",
  "player-video-rotated",
  "video-no-fog",
]) {
  test(`video map: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}

// Soft edges never show what the hard fog covers (T-136a, fail-closed): the same nested fog,
// drawn hard and then soft, compared pixel by pixel – zoomed in, so edges span many pixels.
test("soft fog edges never reveal more than hard ones", async ({ page }) => {
  await page.goto(`${fixturePage("renderer.html")}#fail-closed`);
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-ready", "true");
  await expect(body).toHaveAttribute("data-violations", "0");
  expect(Number(await body.getAttribute("data-softened"))).toBeGreaterThan(0);
});

// Fades (T-136b): a pixel fogged before and after a change never shows the map on the way.
test("fog fades never show what stays fogged", async ({ page }) => {
  await page.goto(`${fixturePage("renderer.html")}#fade-fail-closed`);
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-ready", "true");
  await expect(body).toHaveAttribute("data-violations", "0");
  expect(Number(await body.getAttribute("data-between"))).toBeGreaterThan(0);
});
