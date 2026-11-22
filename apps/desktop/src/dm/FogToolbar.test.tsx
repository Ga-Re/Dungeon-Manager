import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { FOG_SPEED } from "../fog-settings.js";
import { FogToolbar } from "./FogToolbar.js";

function renderToolbar(speed: number, onSpeed = vi.fn()) {
  render(
    <I18nextProvider i18n={createI18n()}>
      <FogToolbar
        tool="reveal"
        onTool={vi.fn()}
        shape="rectangle"
        onShape={vi.fn()}
        brushCells={1}
        onBrushCells={vi.fn()}
        disabled={false}
        onRevealAll={vi.fn()}
        onCoverAll={vi.fn()}
        speed={speed}
        onSpeed={onSpeed}
      />
    </I18nextProvider>,
  );
  return onSpeed;
}

describe("FogToolbar: spread speed (T-246)", () => {
  it("shows the speed in cells per second and sets another one", () => {
    const onSpeed = renderToolbar(5);
    const slider = screen.getByRole("slider", { name: "Tempo: 5 Felder/s" });
    expect(slider.getAttribute("aria-valuetext")).toBe("5 Felder pro Sekunde");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(onSpeed).toHaveBeenLastCalledWith(FOG_SPEED.min);
  });

  it("offers Sofort as the slider's last step", () => {
    const onSpeed = renderToolbar(Infinity);
    const slider = screen.getByRole("slider", { name: "Tempo: sofort" });
    expect((slider as HTMLInputElement).value).toBe(String(FOG_SPEED.steps));
    fireEvent.change(slider, {
      target: { value: String(FOG_SPEED.steps - 1) },
    });
    expect(onSpeed).toHaveBeenLastCalledWith(FOG_SPEED.max);
  });
});
