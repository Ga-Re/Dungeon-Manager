import type { MapImage, Size } from "@dungeon-manager/renderer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { StrictMode, type ComponentProps } from "react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
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

  test("the dock's buttons zoom around the view's centre and fit the map again (T-131)", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    renderView(fake.service);
    await waitFor(() => {
      expect(fake.camera()?.zoom).toBe(0.5);
    });
    fireEvent.click(screen.getByRole("button", { name: "Vergrößern" }));
    const zoomed = fake.camera()?.zoom ?? 0;
    expect(zoomed).toBeGreaterThan(0.5);
    // Around the centre: the map's centre stays where it was.
    expect(fake.camera()).toMatchObject({ centerX: 800, centerY: 400 });
    fireEvent.click(screen.getByRole("button", { name: "Verkleinern" }));
    expect(fake.camera()?.zoom).toBeCloseTo(0.5);
    fireEvent.click(screen.getByRole("button", { name: "Vergrößern" }));
    fireEvent.click(screen.getByRole("button", { name: "Einpassen" }));
    expect(fake.camera()).toEqual({
      centerX: 800,
      centerY: 400,
      zoom: 0.5,
      rotation: 0,
    });
  });

  test("draws the map's grid lines, switched in the dock (T-106b)", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const grid = { cellSizePx: 100, offsetXPx: 10, offsetYPx: 0 };
    renderView(fake.service, { grid });
    await waitFor(() => {
      expect(fake.view.setGrid).toHaveBeenLastCalledWith(grid);
    });
    const button = screen.getByRole("button", { name: "Raster anzeigen" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(fake.view.setGrid).toHaveBeenLastCalledWith(null);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(fake.view.setGrid).toHaveBeenLastCalledWith(grid);
  });

  test("shows the drawing tool's instructions while it is active (T-131)", () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    renderView(fake.service, { tool: "reveal", shape: "polygon" });
    expect(
      screen.getByText(/Klicken setzt Punkte; Doppelklick, Enter/),
    ).toBeTruthy();
  });

  test("fades fog changes and draws soft edges as asked (T-136)", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const { rerender } = renderView(fake.service, {
      fog: [],
      softEdge: 25,
      fade: 650,
    });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    const revealed = [
      {
        outer: [
          [0, 0],
          [10, 0],
          [10, 10],
        ] as [number, number][],
        holes: [],
      },
    ];
    rerender(
      tree(fake.service, undefined, { fog: revealed, softEdge: 25, fade: 650 }),
    );
    expect(fake.view.setFog).toHaveBeenLastCalledWith(revealed, {
      opacity: 0.55,
      softEdge: 25,
      fade: 650,
    });
  });

  test("the reveal tool turns a dragged rectangle into a map area", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    renderView(fake.service, { tool: "reveal", onArea, fog: [] });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    // The DM sees the fog see-through.
    expect(fake.view.setFog).toHaveBeenLastCalledWith([], {
      opacity: 0.55,
      softEdge: 0,
    });

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

  test("a video map lies under its own canvas and is released with the view", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const { unmount } = renderView(fake.service, { kind: "video", fog: [] });
    await waitFor(() => {
      expect(fake.view.setVideo).toHaveBeenCalled();
    });
    const video = fake.view.setVideo.mock.calls.at(-1)?.[0];
    expect(fake.service.loadVideo).toHaveBeenCalledWith(
      "library/maps/hoehle.png",
    );
    expect(fake.service.loadImage).not.toHaveBeenCalled();
    // Fog first, then the video (the renderer keeps it hidden until both are drawn).
    const fogOrder = fake.view.setFog.mock.invocationCallOrder[0] ?? Infinity;
    expect(fogOrder).toBeLessThan(
      fake.view.setVideo.mock.invocationCallOrder[0] ?? -1,
    );
    expect(video?.nextElementSibling?.tagName).toBe("CANVAS");
    await waitFor(() => {
      expect(fake.camera()).toEqual({
        centerX: 160,
        centerY: 100,
        zoom: 2,
        rotation: 0,
      });
    });
    unmount();
    expect(video?.isConnected).toBe(false);
    expect(video?.hasAttribute("src")).toBe(false);
  });

  const ready = async () => {
    await waitFor(() => {
      expect(area().dataset["tool"]).toBeDefined();
    });
  };
  const click = (x: number, y: number) => {
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1,
    });
    fireEvent.pointerUp(area(), { pointerId: 1 });
  };

  test("the circle tool draws from the centre outwards", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    renderView(fake.service, { tool: "reveal", shape: "circle", onArea });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    // Fitted: zoom 0.5, view centre (400, 200) shows map point (800, 400).
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 400,
      clientY: 200,
      pointerId: 1,
    });
    fireEvent.pointerMove(area(), { clientX: 430, clientY: 240, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    const [circle, tool] = onArea.mock.calls[0] as [
      { outer: [number, number][] },
      string,
    ];
    expect(tool).toBe("reveal");
    // 50 screen pixels = 100 map pixels around map point (800, 400).
    for (const [x, y] of circle.outer)
      expect(Math.hypot(x - 800, y - 400)).toBeCloseTo(100, 6);
  });

  test("the polygon tool: clicked corners, closed by Enter, the first corner or a double click", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    renderView(fake.service, { tool: "hide", shape: "polygon", onArea });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    await ready();

    click(100, 100);
    click(300, 100);
    click(300, 300);
    click(100, 300);
    fireEvent.keyDown(area(), { key: "Backspace" });
    fireEvent.keyDown(area(), { key: "Enter" });
    expect(onArea).toHaveBeenCalledTimes(1);
    expect(onArea.mock.calls[0]).toEqual([
      {
        outer: [
          [200, 200],
          [600, 200],
          [600, 600],
        ],
        holes: [],
      },
      "hide",
    ]);

    click(100, 100);
    click(300, 100);
    click(300, 300);
    click(104, 103); // close to the first corner: closes
    expect(onArea).toHaveBeenCalledTimes(2);
    expect(
      (onArea.mock.calls[1]?.[0] as { outer: unknown[] }).outer,
    ).toHaveLength(3);

    click(100, 100);
    click(300, 100);
    click(300, 300);
    fireEvent.doubleClick(area());
    expect(onArea).toHaveBeenCalledTimes(3);

    click(100, 100);
    click(300, 100);
    fireEvent.keyDown(area(), { key: "Escape" });
    fireEvent.keyDown(area(), { key: "Enter" });
    expect(onArea).toHaveBeenCalledTimes(3);
  });

  test("a brush stroke is one area along the stroke", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    renderView(fake.service, {
      tool: "reveal",
      shape: "brush",
      brushRadius: 20,
      onArea,
    });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(area(), { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(area(), { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(area(), { pointerId: 1 });
    expect(onArea).toHaveBeenCalledTimes(1);
    const [stroke] = onArea.mock.calls[0] as [{ outer: [number, number][] }];
    const xs = stroke.outer.map(([x]) => x);
    const ys = stroke.outer.map(([, y]) => y);
    // Screen (100,100)→(200,200) is map (200,200)→(400,400), plus the 20 px radius.
    expect(Math.round(Math.min(...xs))).toBe(180);
    expect(Math.round(Math.max(...ys))).toBe(420);
  });

  test("the rectangle's preview has the rounded corners it marks (T-170)", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    const { container } = renderView(fake.service, {
      tool: "reveal",
      shape: "rectangle",
      cornerRadius: 20,
      onArea,
    });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(area(), { clientX: 200, clientY: 150, pointerId: 1 });
    // 20 map pixels at zoom 0.5.
    expect(container.querySelector("rect")?.getAttribute("rx")).toBe("10");
    fireEvent.pointerUp(area(), { pointerId: 1 });
    const [rounded] = onArea.mock.calls[0] as [{ outer: [number, number][] }];
    expect(rounded.outer.length).toBeGreaterThan(4);
  });

  test("the brush shows its outline at the pointer, at the size it paints (T-170)", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const { rerender } = renderView(fake.service, {
      tool: "reveal",
      shape: "brush",
      brushRadius: 20,
    });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    expect(screen.queryByTestId("brush-cursor")).toBeNull();
    fireEvent.pointerMove(area(), { clientX: 120, clientY: 80 });
    const cursor = screen.getByTestId("brush-cursor");
    // 20 map pixels at the fitted zoom of 0.5.
    expect(cursor.getAttribute("r")).toBe("10");
    expect(cursor.getAttribute("cx")).toBe("120");
    expect(cursor.getAttribute("cy")).toBe("80");
    // It stays with the pointer while painting.
    fireEvent.pointerDown(area(), {
      button: 0,
      clientX: 120,
      clientY: 80,
      pointerId: 1,
    });
    fireEvent.pointerMove(area(), { clientX: 160, clientY: 90, pointerId: 1 });
    expect(screen.getByTestId("brush-cursor").getAttribute("cx")).toBe("160");
    fireEvent.pointerUp(area(), { pointerId: 1 });
    fireEvent.pointerLeave(area());
    expect(screen.queryByTestId("brush-cursor")).toBeNull();
    // Other shapes have no outline.
    rerender(
      tree(fake.service, undefined, { tool: "reveal", shape: "rectangle" }),
    );
    fireEvent.pointerMove(area(), { clientX: 120, clientY: 80 });
    expect(screen.queryByTestId("brush-cursor")).toBeNull();
  });

  test("a real double click (two clicks on one spot, then dblclick) adds one corner", async () => {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onArea = vi.fn();
    renderView(fake.service, { tool: "reveal", shape: "polygon", onArea });
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
    click(100, 100);
    click(300, 100);
    click(300, 300);
    click(301, 300);
    fireEvent.doubleClick(area());
    expect(
      (onArea.mock.calls[0]?.[0] as { outer: unknown[] }).outer,
    ).toHaveLength(3);

    // Only two distinct corners: nothing enclosed, no command.
    click(100, 100);
    click(300, 100);
    click(300, 100);
    fireEvent.doubleClick(area());
    expect(onArea).toHaveBeenCalledTimes(1);
  });
});

describe("MapView tokens (T-107b)", () => {
  // The 1600 × 800 map fills the 800 × 400 view at zoom 0.5: a 100 px cell is 50 screen px.
  const grid = { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 };
  const goblin = {
    id: "goblin",
    name: "Goblin",
    x: 200,
    y: 200,
    width: 100,
    height: 100,
  };
  const ogre = {
    id: "ogre",
    name: "Oger",
    x: 600,
    y: 200,
    width: 200,
    height: 200,
  };
  // Screen points: the goblin's centre, the ogre's centre, an empty cell.
  const onGoblin = { clientX: 125, clientY: 125 };
  const onOgre = { clientX: 350, clientY: 150 };

  function renderTokens(
    initial: ReadonlySet<string> = new Set(),
    clampShift?: (
      ids: readonly string[],
      shift: { col: number; row: number },
    ) => { col: number; row: number },
  ) {
    const fake = fakeMapService(() => Promise.resolve(image));
    const onMove =
      vi.fn<
        (ids: readonly string[], shift: { col: number; row: number }) => void
      >();
    const onDelete = vi.fn<(ids: readonly string[]) => void>();
    const onSelect = vi.fn<(ids: ReadonlySet<string>) => void>();
    let selected = initial;
    const props = (): Partial<ComponentProps<typeof MapView>> => ({
      grid,
      tokens: [goblin, ogre],
      tokenControl: {
        selected,
        onSelect: (ids) => {
          onSelect(ids);
          selected = ids;
          result.rerender(tree(fake.service, undefined, props()));
        },
        onMove,
        onDelete,
        ...(clampShift && { clampShift }),
      },
    });
    const result = render(tree(fake.service, undefined, props()));
    return {
      fake,
      onMove,
      onDelete,
      onSelect,
      selected: () => [...selected].sort(),
    };
  }
  const ready = async (fake: ReturnType<typeof fakeMapService>) => {
    await waitFor(() => {
      expect(fake.camera()).toBeDefined();
    });
  };
  const click = (at: { clientX: number; clientY: number }, extra = {}) => {
    fireEvent.pointerDown(area(), { ...at, pointerId: 1, ...extra });
    fireEvent.pointerUp(area(), { ...at, pointerId: 1, ...extra });
  };

  test("a click selects a token, Shift adds one, a click on empty map clears the selection", async () => {
    const view = renderTokens();
    await ready(view.fake);
    click(onGoblin, { pointerType: "mouse" });
    expect(view.selected()).toEqual(["goblin"]);
    click(onOgre, { pointerType: "mouse", shiftKey: true });
    expect(view.selected()).toEqual(["goblin", "ogre"]);
    // Shift-click on a selected one takes it out again.
    click(onOgre, { pointerType: "mouse", shiftKey: true });
    expect(view.selected()).toEqual(["goblin"]);
    click({ clientX: 700, clientY: 350 }, { pointerType: "mouse" });
    expect(view.selected()).toEqual([]);
    expect(view.onMove).not.toHaveBeenCalled();
  });

  test("dragging a token moves the selection by whole cells, shown while dragging", async () => {
    const view = renderTokens(new Set(["ogre"]));
    await ready(view.fake);
    fireEvent.pointerDown(area(), {
      ...onGoblin,
      pointerId: 1,
      shiftKey: true,
    });
    // 2.4 cells right and 0.6 down (50 screen px per cell) snap to 2 and 1.
    fireEvent.pointerMove(area(), { clientX: 245, clientY: 155, pointerId: 1 });
    await waitFor(() => {
      expect(view.fake.view.setTokens.mock.lastCall?.[0]).toEqual([
        { ...goblin, x: 400, y: 300 },
        { ...ogre, x: 800, y: 300 },
      ]);
    });
    // The preview follows the pointer at once, it never glides.
    expect(view.fake.view.setTokens.mock.lastCall?.[1]).toEqual({ glide: 0 });
    fireEvent.pointerUp(area(), { clientX: 245, clientY: 155, pointerId: 1 });
    expect(view.onMove).toHaveBeenCalledExactlyOnceWith(["ogre", "goblin"], {
      col: 2,
      row: 1,
    });
    // Dragging is no panning.
    expect(view.fake.camera()).toEqual({
      centerX: 800,
      centerY: 400,
      zoom: 0.5,
      rotation: 0,
    });
  });

  test("a drag that ends on its own cell moves nothing", async () => {
    const view = renderTokens();
    await ready(view.fake);
    fireEvent.pointerDown(area(), { ...onGoblin, pointerId: 1 });
    fireEvent.pointerMove(area(), { clientX: 140, clientY: 125, pointerId: 1 });
    fireEvent.pointerUp(area(), { clientX: 140, clientY: 125, pointerId: 1 });
    expect(view.onMove).not.toHaveBeenCalled();
    expect(view.selected()).toEqual(["goblin"]);
  });

  test("with touch: tap a token, then tap the cell it goes to", async () => {
    const view = renderTokens();
    await ready(view.fake);
    click(onGoblin, { pointerType: "touch" });
    expect(view.selected()).toEqual(["goblin"]);
    // Cell (6, 5): screen 325, 275.
    click({ clientX: 325, clientY: 275 }, { pointerType: "touch" });
    expect(view.onMove).toHaveBeenCalledExactlyOnceWith(["goblin"], {
      col: 4,
      row: 3,
    });
    // Tapping the only selected token again lets it go.
    click(onGoblin, { pointerType: "touch" });
    expect(view.selected()).toEqual([]);
  });

  test("arrow keys move the selection by a cell, Delete removes it, Escape lets it go", async () => {
    const view = renderTokens(new Set(["goblin", "ogre"]));
    await ready(view.fake);
    fireEvent.keyDown(area(), { key: "ArrowLeft" });
    expect(view.onMove).toHaveBeenLastCalledWith(["goblin", "ogre"], {
      col: -1,
      row: 0,
    });
    // Shift + arrow still pans.
    fireEvent.keyDown(area(), { key: "ArrowLeft", shiftKey: true });
    expect(view.onMove).toHaveBeenCalledTimes(1);
    expect(view.fake.camera()?.centerX).toBeLessThan(800);
    fireEvent.keyDown(area(), { key: "Delete" });
    expect(view.onDelete).toHaveBeenCalledExactlyOnceWith(["goblin", "ogre"]);
    fireEvent.keyDown(area(), { key: "Escape" });
    expect(view.selected()).toEqual([]);
    // Without a selection the arrows pan again.
    fireEvent.keyDown(area(), { key: "ArrowUp" });
    expect(view.onMove).toHaveBeenCalledTimes(1);
  });

  test("dragging empty map still pans", async () => {
    const view = renderTokens(new Set(["goblin"]));
    await ready(view.fake);
    fireEvent.pointerDown(area(), { clientX: 700, clientY: 350, pointerId: 1 });
    fireEvent.pointerMove(area(), { clientX: 650, clientY: 350, pointerId: 1 });
    fireEvent.pointerUp(area(), { clientX: 650, clientY: 350, pointerId: 1 });
    expect(view.fake.camera()?.centerX).toBeGreaterThan(800);
    // A pan is no click: the selection stays.
    expect(view.selected()).toEqual(["goblin"]);
    expect(view.onMove).not.toHaveBeenCalled();
  });

  test("the drag's preview stops where the move would, and a second finger does not take it over", async () => {
    // At most one cell to the right, as at a map's edge.
    const view = renderTokens(new Set(), (_ids, shift) => ({
      col: Math.min(shift.col, 1),
      row: shift.row,
    }));
    await ready(view.fake);
    fireEvent.pointerDown(area(), { ...onGoblin, pointerId: 1 });
    fireEvent.pointerMove(area(), { clientX: 275, clientY: 125, pointerId: 1 });
    await waitFor(() => {
      expect(view.fake.view.setTokens.mock.lastCall?.[0]).toEqual([
        { ...goblin, x: 300 },
        ogre,
      ]);
    });
    // Another finger moves and lifts: the drag goes on.
    fireEvent.pointerMove(area(), { clientX: 125, clientY: 300, pointerId: 2 });
    fireEvent.pointerUp(area(), { clientX: 125, clientY: 300, pointerId: 2 });
    expect(view.onMove).not.toHaveBeenCalled();
    fireEvent.pointerUp(area(), { clientX: 275, clientY: 125, pointerId: 1 });
    expect(view.onMove).toHaveBeenCalledExactlyOnceWith(["goblin"], {
      col: 1,
      row: 0,
    });
  });
});
