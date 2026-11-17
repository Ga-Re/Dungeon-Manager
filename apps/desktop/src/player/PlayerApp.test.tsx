import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { createI18n } from "../i18n.js";
import { PlayerApp } from "./PlayerApp.js";

test("player view has no controls", () => {
  render(
    <I18nextProvider i18n={createI18n()}>
      <PlayerApp />
    </I18nextProvider>,
  );

  expect(screen.getByRole("main", { name: "Spieleransicht" })).toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
});
