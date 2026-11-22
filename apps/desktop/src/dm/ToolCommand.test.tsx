import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { ToolCommand } from "./ToolCommand.js";

// A ribbon tool's command (ADR-0020): Escape and Enter also reach it from the map.

function renderCommand(okDisabled = false) {
  const onOk = vi.fn();
  const onCancel = vi.fn();
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <div className="map-view-canvas" tabIndex={0} data-testid="map" />
      <ToolCommand
        title="Raster kalibrieren"
        okDisabled={okDisabled}
        onOk={onOk}
        onCancel={onCancel}
      >
        <input aria-label="Felder" />
      </ToolCommand>
    </I18nextProvider>,
  );
  return { onOk, onCancel, map: screen.getByTestId("map") };
}

describe("ToolCommand", () => {
  test("Escape and Enter on the map end the command as Abbrechen and OK do", () => {
    const { onOk, onCancel, map } = renderCommand();
    fireEvent.keyDown(map, { key: "Enter" });
    expect(onOk).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(map, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("a key the map used itself, or Enter while OK is off, does nothing", () => {
    const { onOk, onCancel, map } = renderCommand(true);
    map.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.preventDefault();
    });
    fireEvent.keyDown(map, { key: "Escape" });
    fireEvent.keyDown(map, { key: "Enter" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onOk).not.toHaveBeenCalled();
  });

  test("keys elsewhere in the window are not the command's", () => {
    const { onCancel } = renderCommand();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
