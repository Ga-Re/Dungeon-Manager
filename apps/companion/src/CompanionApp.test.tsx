import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { CompanionApp } from "./CompanionApp.js";
import { createI18n } from "./i18n.js";

test("shows the placeholder in German by default", () => {
  render(
    <I18nextProvider i18n={createI18n()}>
      <CompanionApp />
    </I18nextProvider>,
  );

  expect(
    screen.getByRole("heading", { name: "Dungeon Manager für Spieler" }),
  ).toBeDefined();
  expect(
    screen.getByText("Hier kannst du bald dem Spieltisch beitreten."),
  ).toBeDefined();
});

test("renders in English", () => {
  render(
    <I18nextProvider i18n={createI18n("en")}>
      <CompanionApp />
    </I18nextProvider>,
  );

  expect(
    screen.getByRole("heading", { name: "Dungeon Manager for players" }),
  ).toBeDefined();
});
