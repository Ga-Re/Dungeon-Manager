// Serves the production build (vite preview, see tooling/playwright/e2e.config.js) and checks
// that the static files work on their own – the way the desktop backend will serve them.
import { expect, test } from "@playwright/test";

const COMPANION_URL = "http://localhost:4174/";

test("the built companion shows its placeholder page", async ({ page }) => {
  await page.goto(COMPANION_URL);

  await expect(
    page.getByRole("heading", { name: "Dungeon Manager für Spieler" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Dungeon Manager für Spieler");
});
