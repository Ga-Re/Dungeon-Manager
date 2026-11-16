// Smoke test for the E2E setup; replaced by real flows once the desktop web build exists.
import { expect, test } from "@playwright/test";
import { fixturePage } from "../fixture-pages.js";

test("clicking the button increments the counter", async ({ page }) => {
  await page.goto(fixturePage("counter.html"));

  await page.getByRole("button", { name: "Increment" }).click();
  await page.getByRole("button", { name: "Increment" }).click();

  await expect(page.getByLabel("count")).toHaveText("2");
});
