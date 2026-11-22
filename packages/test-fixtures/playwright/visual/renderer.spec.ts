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

// A map larger than the texture limit (T-127) is drawn in tiles: fitted and zoomed in on a tile
// corner, it looks like one texture. Tiles sample with their own coordinates, so thin lines of the
// map may differ slightly when it is scaled down (measured: 8–9 of 255 at most); seams – tiles
// without their neighbours' edge pixels – differ by about 49. The bound sits clearly between.
const TILES_MAX_DIFF = 12;
test("map in tiles looks like one texture", async ({ page }) => {
  await page.goto(`${fixturePage("renderer.html")}#tiles`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  const maxDiff = Number(
    await page.locator("body").getAttribute("data-tiles-max-diff"),
  );
  expect(
    maxDiff,
    (await page.locator("body").getAttribute("data-tiles-diff-at")) ?? "",
  ).toBeLessThanOrEqual(TILES_MAX_DIFF);
});

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
// "spread-ragged" (T-246): at a speed, with a ragged front.
for (const scenario of [
  "spread-adjacent",
  "spread-isolated",
  "spread-hide",
  "spread-hide-isolated",
  "spread-ragged",
]) {
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

// "Sofort" without a transition (T-246): the change is complete in its first frame.
test("fog change at Sofort switches at once", async ({ page }) => {
  await page.goto(`${fixturePage("renderer.html")}#spread-instant`);
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-ready", "true");
  await expect(body).toHaveAttribute("data-spread-start", "open");
  await expect(body).toHaveAttribute("data-spread-end", "open");
  await expect(page).toHaveScreenshot("spread-instant.png");
});

// Grid lines (T-106b): over the map in the DM view, also zoomed and rotated; under the fog in
// the player view, so hidden areas stay black, lines included.
for (const scenario of ["grid", "grid-zoomed", "grid-rotated", "player-grid"]) {
  test(`grid lines: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}

// Tokens (T-107a): placeholder discs with initials and a ring; under the fog on the TV. Selected
// and hidden ones in the DM window, zoomed in: initials stay sharp (T-107b). A token half-way
// through its glide to a new place (T-233b). The token whose turn it is shines on the TV (T-111c).
for (const scenario of [
  "tokens",
  "tokens-rotated",
  "player-tokens",
  "tokens-selected",
  "tokens-glide",
  "player-tokens-active",
]) {
  test(`tokens: ${scenario}`, async ({ page }) => {
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
test("soft fog edges and grid lines never reveal more than hard fog", async ({
  page,
}) => {
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

// Living fog (T-245), frozen at one moment: for players in both qualities and see-through for
// the DM; it reaches into revealed area only a little, never out of the fog.
for (const scenario of ["living-high", "living-medium", "living-dm"]) {
  test(`living fog: ${scenario}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#${scenario}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}

// The living fog never shows what the hard fog covers (T-245, fail-closed): at the largest edge
// wobble, in both qualities and at several moments, a hidden pixel looks the same over a black
// and a white map.
test("living fog never shows what the hard fog covers", async ({ page }) => {
  await page.goto(`${fixturePage("renderer.html")}#living-fail-closed`);
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(body).toHaveAttribute("data-violations", "0");
  expect(Number(await body.getAttribute("data-living"))).toBeGreaterThan(0);
});

// "Alles verdecken" from a random point (T-249): used even when a revealed sliver beyond the
// map's border is left – the frames from the middle and from the random point differ.
test("cover-all starts at the chosen point even with slivers beyond the map", async ({
  page,
}) => {
  await page.goto(`${fixturePage("renderer.html")}#cover-random`);
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-ready", "true");
  await expect(body).toHaveAttribute("data-cover-differs", "yes");
});

// Biomes (T-168), frozen at one moment over the fixture map: colours, wind streaks, particles
// and underglow; particles only over the fog and next to its edge.
for (const biome of [
  "nebel",
  "schnee",
  "wueste",
  "asche",
  "sumpf",
  "kueste",
  "arkan",
  "dunkel",
]) {
  test(`fog biome: ${biome}`, async ({ page }) => {
    await page.goto(`${fixturePage("renderer.html")}#living-biome-${biome}`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveScreenshot(`living-biome-${biome}.png`);
  });
}
