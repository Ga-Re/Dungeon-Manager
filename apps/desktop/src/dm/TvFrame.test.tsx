// The TV's view as a frame on the DM's map (T-106c): dragged or moved by keys, the TV follows.
import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { TvFrame } from "./TvFrame.js";

const camera = { centerX: 500, centerY: 500, zoom: 0.5, rotation: 0 as const };
const view = { width: 800, height: 600 };

function renderFrame(movable = true) {
  const onMove = vi.fn();
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <TvFrame
        camera={camera}
        view={view}
        area={{ width: 400, height: 200 }}
        center={{ x: 500, y: 500 }}
        cellSizePx={100}
        movable={movable}
        onMove={onMove}
      />
    </I18nextProvider>,
  );
  const frame = screen.getByRole("button", { name: /Ausschnitt des TVs/ });
  return { onMove, frame };
}

describe("the TV's frame on the DM's map", () => {
  test("covers the TV's area around its centre, through the DM's camera", () => {
    const { frame } = renderFrame();
    // 400 × 200 map pixels at zoom 0.5, centred in the 800 × 600 view.
    expect(frame.getAttribute("points")).toBe(
      "300,250 500,250 500,350 300,350",
    );
  });

  test("moves by one cell per arrow key, in map pixels", () => {
    const { frame, onMove } = renderFrame();
    fireEvent.keyDown(frame, { key: "ArrowRight" });
    expect(onMove).toHaveBeenLastCalledWith({ x: 600, y: 500 });
    fireEvent.keyDown(frame, { key: "ArrowUp" });
    expect(onMove).toHaveBeenLastCalledWith({ x: 500, y: 400 });
    fireEvent.keyDown(frame, { key: "a" });
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  test("follows a drag, converted from screen to map pixels", () => {
    const { frame, onMove } = renderFrame();
    frame.setPointerCapture = vi.fn();
    fireEvent.pointerDown(frame, {
      button: 0,
      pointerId: 1,
      clientX: 400,
      clientY: 300,
    });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 450, clientY: 320 });
    // 50 × 20 screen pixels at zoom 0.5: 100 × 40 map pixels.
    expect(onMove).toHaveBeenLastCalledWith({ x: 600, y: 540 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 500, clientY: 400 });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  test("is shown but not reachable while a fog tool draws", () => {
    const { frame } = renderFrame(false);
    expect(frame.getAttribute("tabindex")).toBe("-1");
    expect(frame.closest("svg")?.getAttribute("data-movable")).toBe("false");
  });
});
