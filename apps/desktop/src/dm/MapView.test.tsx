import type { MapImage, Size } from "@dungeon-manager/renderer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { StrictMode, type ComponentProps } from "react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createI18n } from "../i18n.js";
import { fakeMapService } from "../fake-renderer.test-data.js";
import type { MapViewService } from "../platform/map-images.js";
import { MapView, MapViewContext } from "./MapView.js";

// jsdom does no layout; give every element the size of the view box.
const VIEW: Size = { width: 800, height: 400 };
const originals = {
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  height: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  ),
};
beforeAll(() => {
  // jsdom implements no pointer capture.
  HTMLElement.prototype.setPointerCapture = () => undefined;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => VIEW.width,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => VIEW.height,
  });
});
afterAll(() => {
  if (originals.width)
    Object.defineProperty(
      HTMLElement.prototype,
      "clientWidth",
      originals.width,
    );
  if (originals.height)
    Object.defineProperty(
      HTMLElement.prototype,
      "clientHeight",
      originals.height,
    );
});

const image = { width: 1600, height: 800 } as unknown as MapImage;

function tree(
  service: MapViewService,
  path = "library/maps/hoehle.png",
  props: Partial<ComponentProps<typeof MapView>> = {},
) {
  return (
    <StrictMode>
      <I18nextProvider i18n={createI18n("de")}>
        <MapViewContext value={service}>
          <MapView path={path} label="Höhle" {...props} />
        </MapViewContext>
      </I18nextProvider>
    </StrictMode>
  );
}

function renderView(
  service: MapViewService,
  props: Partial<ComponentProps<typeof MapView>> = {},
) {
  return render(tree(service, undefined, props));
}

const area = () =>
  screen.getByRole("application", { name: "Karte der Szene „Höhle“" });

describe("MapView", () => {
  test("loads the map and fits it into the view", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    renderView(fake.service);
    // The camera is set in the render after the map: wait for it, not just for the map.
    await waitFor(() => {
      expect(fake.camera()).toEqual({
        centerX: 800,
        centerY: 400,
        zoom: 0.5,
        rotation: 0,
      });
    });
    expect(fake.view.setMap).toHaveBeenCalledWith(image);
    expect(fake.service.loadImage).toHaveBeenCalledWith(
      "library/maps/hoehle.png",
    );
  });

  test("zooms, pans, rotates and fits with keys, wheel and drag", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    renderView(fake.service);
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });

    fireEvent.keyDown(area(), { key: "+" });
    expect(fake.camera()?.zoom).toBeCloseTo(0.625);
    fireEvent.keyDown(area(), { key: "ArrowRight" });
    expect(fake.camera()?.centerX).toBeGreaterThan(800);
    fireEvent.wheel(area(), { deltaY: -200, clientX: 400, clientY: 200 });
    expect(fake.camera()?.zoom).toBeGreaterThan(0.625);
    fireEvent.pointerDown(area(), { clientX: 100, clientY: 100, pointerId: 1 });
    const beforeDrag = fake.camera();
    fireEvent.pointerMove(area(), { clientX: 150, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    expect(fake.camera()?.centerX).toBeLessThan(beforeDrag?.centerX ?? 0);
    fireEvent.keyDown(area(), { key: "r" });
    expect(fake.camera()?.rotation).toBe(90);

    fireEvent.keyDown(area(), { key: "0" });
    expect(fake.camera()).toEqual({
      centerX: 800,
      centerY: 400,
      zoom: 0.25,
      rotation: 90,
    });
    fireEvent.click(screen.getByRole("button", { name: "Drehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Einpassen" }));
    expect(fake.camera()).toEqual({
      centerX: 800,
      centerY: 400,
      zoom: 0.5,
      rotation: 180,
    });
  });

  test("explains a map that cannot be loaded", async () => {
    const fake = fakeMapService(() => Promise.reject(new Error("404")));
    renderView(fake.service);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Die Karte konnte nicht geladen werden",
    );
    expect(screen.getByRole("button", { name: "Einpassen" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  test("releases the renderer when it goes away", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const { unmount } = renderView(fake.service);
    await waitFor(() => {
      expect(fake.view.setMap).toHaveBeenCalled();
    });
    unmount();
    await waitFor(() => {
      expect(fake.view.destroy).toHaveBeenCalled();
    });
  });

  test("releases the renderer when the map cannot be loaded", async () => {
    const fake = fakeMapService(() => Promise.reject(new Error("404")));
    const { unmount } = renderView(fake.service);
    await screen.findByRole("alert");
    unmount();
    await waitFor(() => {
      expect(fake.view.destroy).toHaveBeenCalled();
    });
  });

  test("gives every renderer its own canvas and releases the old one", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const { rerender } = renderView(fake.service);
    await waitFor(() => {
      expect(fake.views[0]?.view.setMap).toHaveBeenCalledWith(image);
    });
    rerender(tree(fake.service, "library/maps/andere.png"));
    await waitFor(() => {
      expect(fake.views[1]?.view.setMap).toHaveBeenCalledWith(image);
    });
    const [first, second] = fake.views;
    expect(first?.canvas).not.toBe(second?.canvas);
    expect(first?.view.destroy).toHaveBeenCalled();
    expect(first?.canvas.isConnected).toBe(false);
    expect(second?.view.destroy).not.toHaveBeenCalled();
    expect(second?.canvas.isConnected).toBe(true);
  });

  test("leaves browser shortcuts and secondary buttons alone", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    renderView(fake.service);
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    const before = fake.camera();
    fireEvent.keyDown(area(), { key: "0", ctrlKey: true });
    fireEvent.keyDown(area(), { key: "+", metaKey: true });
    fireEvent.pointerDown(area(), {
      button: 2,
      clientX: 0,
      clientY: 0,
      pointerId: 2,
    });
    fireEvent.pointerMove(area(), { clientX: 300, clientY: 0, pointerId: 2 });
    expect(fake.camera()).toEqual(before);
    const wheel = new WheelEvent("wheel", { deltaY: -100, cancelable: true });
    area().dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
  });

  test("the reveal tool turns a dragged rectangle into a map area", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    renderView(fake.service, { tool: "reveal", onArea, fog: [] });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    // The DM sees the fog see-through.
    expect(fake.view.setFog).toHaveBeenLastCalledWith([], { opacity: 0.55 });

    // Fitted: zoom 0.5, map centre (800, 400) in the view centre (400, 200).
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(area(), { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    expect(onArea).toHaveBeenCalledExactlyOnceWith(
      {
        outer: [
          [200, 200],
          [600, 200],
          [600, 400],
          [200, 400],
        ],
        holes: [],
      },
      "reveal",
    );
    // The camera did not move: marking is not panning.
    expect(fake.camera()).toEqual({
      centerX: 800,
      centerY: 400,
      zoom: 0.5,
      rotation: 0,
    });
  });

  test("tiny drags and Escape mark nothing; a rotated view still marks map rectangles", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    renderView(fake.service, { tool: "hide", onArea });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(area(), { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.keyDown(area(), { key: "Escape" });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    expect(onArea).not.toHaveBeenCalled();

    fireEvent.keyDown(area(), { key: "r" });
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 300,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(area(), { clientX: 500, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    const [polygon, tool] = onArea.mock.calls[0] as [
      { outer: [number, number][] },
      string,
    ];
    expect(tool).toBe("hide");
    const xs = polygon.outer.map(([x]) => Math.round(x));
    const ys = polygon.outer.map(([, y]) => Math.round(y));
    // Rotated by 90°: screen x runs along map y, screen y against map x.
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([600, 1000]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([200, 600]);
  });
});
