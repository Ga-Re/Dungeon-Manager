import type {
  Camera,
  MapImage,
  Renderer,
  Size,
} from "@dungeon-manager/renderer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createI18n } from "../i18n.js";
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

function fakeService(load: () => Promise<MapImage>) {
  const cameras: Camera[] = [];
  const view = {
    setMap: vi.fn(),
    setCamera: vi.fn((camera: Camera) => cameras.push(camera)),
    resize: vi.fn(),
    drawn: () => Promise.resolve(),
    destroy: vi.fn(),
  } satisfies Renderer;
  const service = {
    loadImage: vi.fn(load),
    createRenderer: vi.fn(() => Promise.resolve(view)),
  } satisfies MapViewService;
  return { service, view, camera: () => cameras.at(-1) };
}

const image = { width: 1600, height: 800 } as unknown as MapImage;

function renderView(service: MapViewService) {
  return render(
    <I18nextProvider i18n={createI18n("de")}>
      <MapViewContext value={service}>
        <MapView path="library/maps/hoehle.png" label="Höhle" />
      </MapViewContext>
    </I18nextProvider>,
  );
}

const area = () =>
  screen.getByRole("application", { name: "Karte der Szene „Höhle“" });

describe("MapView", () => {
  test("loads the map and fits it into the view", async () => {
    const fake = fakeService(() => Promise.resolve(image));
    renderView(fake.service);
    await waitFor(() => {
      expect(fake.view.setMap).toHaveBeenCalledWith(image);
    });
    expect(fake.service.loadImage).toHaveBeenCalledWith(
      "library/maps/hoehle.png",
    );
    expect(fake.camera()).toEqual({
      centerX: 800,
      centerY: 400,
      zoom: 0.5,
      rotation: 0,
    });
  });

  test("zooms, pans, rotates and fits with keys, wheel and drag", async () => {
    const fake = fakeService(() => Promise.resolve(image));
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
    const fake = fakeService(() => Promise.reject(new Error("404")));
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
    const fake = fakeService(() => Promise.resolve(image));
    const { unmount } = renderView(fake.service);
    await waitFor(() => {
      expect(fake.view.setMap).toHaveBeenCalled();
    });
    unmount();
    expect(fake.view.destroy).toHaveBeenCalled();
  });
});
