// Smoke test for the screenshot setup; renderer fixtures replace it (T-105).
import { expect, test } from "@playwright/test";
import { fixturePage } from "../fixture-pages.js";

test("shapes page matches the golden screenshot", async ({ page }) => {
  await page.goto(fixturePage("shapes.html"));

  await expect(page).toHaveScreenshot("shapes.png");
});
