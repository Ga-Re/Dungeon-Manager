import type { FogEffect } from "@dungeon-manager/schema";
import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { FOG_SPEED } from "../fog-settings.js";
import { FogToolbar } from "./FogToolbar.js";

function renderToolbar(
  speed: number,
  onSpeed = vi.fn(),
  biome: {
    fogEffect?: FogEffect | null;
    own?: boolean;
    onFogEffect?: () => void;
  } = {},
) {
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
        fogEffect={biome.fogEffect ?? null}
        ownFogEffect={biome.own ?? false}
        onFogEffect={biome.onFogEffect ?? vi.fn()}
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

describe("FogToolbar: biome (T-168)", () => {
  it("shows the biome as played and chooses another, keeping the strength", () => {
    const onFogEffect = vi.fn();
    renderToolbar(5, vi.fn(), {
      fogEffect: { biome: "schnee", strength: 0.6 },
      own: true,
      onFogEffect,
    });
    fireEvent.click(screen.getByRole("button", { name: "Schneesturm" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Glutasche" }));
    expect(onFogEffect).toHaveBeenLastCalledWith({
      biome: "asche",
      strength: 0.6,
    });
  });

  it("follows the map again, and applies the strength once the slider is let go", () => {
    const onFogEffect = vi.fn();
    renderToolbar(5, vi.fn(), {
      fogEffect: { biome: "arkan", strength: 1 },
      own: true,
      onFogEffect,
    });
    const slider = screen.getByRole("slider", { name: "Stärke" });
    fireEvent.change(slider, { target: { value: "0.3" } });
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(onFogEffect).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(onFogEffect).toHaveBeenCalledTimes(1);
    expect(onFogEffect).toHaveBeenLastCalledWith({
      biome: "arkan",
      strength: 0.4,
    });
    fireEvent.click(screen.getByRole("button", { name: "Arkaner Dunst" }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Wie die Karte" }),
    );
    expect(onFogEffect).toHaveBeenLastCalledWith(null);
  });

  it("applies the strength from the keyboard on key release and on leaving the slider", () => {
    const onFogEffect = vi.fn();
    renderToolbar(5, vi.fn(), {
      fogEffect: { biome: "schnee", strength: 1 },
      own: true,
      onFogEffect,
    });
    const slider = screen.getByRole("slider", { name: "Stärke" });
    expect(slider.getAttribute("aria-valuetext")).toBe("100 Prozent");
    fireEvent.change(slider, { target: { value: "0.9" } });
    fireEvent.keyUp(slider, { key: "ArrowLeft" });
    expect(onFogEffect).toHaveBeenLastCalledWith({
      biome: "schnee",
      strength: 0.9,
    });
    fireEvent.change(slider, { target: { value: "0.5" } });
    fireEvent.blur(slider);
    expect(onFogEffect).toHaveBeenLastCalledWith({
      biome: "schnee",
      strength: 0.5,
    });
    expect(onFogEffect).toHaveBeenCalledTimes(2);
  });
});
