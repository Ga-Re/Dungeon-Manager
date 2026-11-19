import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu.js";
import { Popover } from "./Popover.js";
import { clampPoint } from "./viewport.js";

/** Every element measures `width` × `height` px at the top left; jsdom’s window is 1024 × 768. */
function measureAs(width: number, height: number) {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({
      width,
      height,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
    } as DOMRect);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A `ResizeObserver` stand-in (jsdom has none): `resize()` plays the browser's part and calls
 * back only observers that watch an element and are not disconnected.
 */
function fakeResizeObserver() {
  const watching = new Set<{ callback: () => void }>();
  class Observer {
    private readonly entry: { callback: () => void };
    constructor(callback: () => void) {
      this.entry = { callback };
    }
    observe() {
      watching.add(this.entry);
    }
    disconnect() {
      watching.delete(this.entry);
    }
  }
  vi.stubGlobal("ResizeObserver", Observer);
  return {
    resize: () => {
      act(() => {
        watching.forEach((entry) => {
          entry.callback();
        });
      });
    },
  };
}

describe("menus and popovers keep inside the window when they or the window change size (T-166)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves a context menu again when it grows", () => {
    const observer = fakeResizeObserver();
    const size = measureAs(200, 100);
    render(
      <ContextMenu
        at={{ x: 100, y: 600 }}
        label="Szene"
        items={[{ id: "new", label: "Neue Szene …" }]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const menu = screen.getByRole("menu", { name: "Szene" });
    expect(menu.style.top).toBe("600px");
    size.mockReturnValue({
      width: 200,
      height: 300,
      left: 0,
      top: 0,
      right: 200,
      bottom: 300,
    } as DOMRect);
    observer.resize();
    // 768 − 300 − 8
    expect(menu.style.top).toBe("460px");
  });

  it("moves a popover under its anchor again when the window gets smaller", () => {
    fakeResizeObserver();
    measureAs(300, 200);
    function Opened() {
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={anchor}>
            Anker
          </button>
          <Popover open anchor={anchor} label="Neue Szene" onClose={vi.fn()}>
            <input aria-label="Name" />
          </Popover>
        </>
      );
    }
    render(<Opened />);
    const popover = screen.getByRole("group", { name: "Neue Szene" });
    expect(popover.style.left).toBe("8px");
    vi.stubGlobal("innerHeight", 150);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    // Too small for it: its top stays reachable at the margin.
    expect(popover.style.top).toBe("8px");
  });

  it("moves a context menu again when the window gets smaller", () => {
    fakeResizeObserver();
    measureAs(200, 100);
    render(
      <ContextMenu
        at={{ x: 900, y: 100 }}
        label="Szene"
        items={[{ id: "new", label: "Neue Szene …" }]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const menu = screen.getByRole("menu", { name: "Szene" });
    expect(menu.style.left).toBe("816px");
    vi.stubGlobal("innerWidth", 600);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    // 600 − 200 − 8
    expect(menu.style.left).toBe("392px");
  });

  it("moves a popover under its anchor again when it grows, and stops watching once closed", () => {
    const observer = fakeResizeObserver();
    const size = measureAs(300, 200);
    function Toggled({ open }: { readonly open: boolean }) {
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={anchor}>
            Anker
          </button>
          <Popover
            open={open}
            anchor={anchor}
            label="Neue Szene"
            onClose={vi.fn()}
          >
            <input aria-label="Name" />
          </Popover>
        </>
      );
    }
    const { rerender } = render(<Toggled open />);
    const popover = screen.getByRole("group", { name: "Neue Szene" });
    // Under the 200 px tall anchor.
    expect(popover.style.top).toBe("204px");
    size.mockReturnValue({
      width: 300,
      height: 700,
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
    } as DOMRect);
    observer.resize();
    // 768 − 700 − 8
    expect(popover.style.top).toBe("60px");

    rerender(<Toggled open={false} />);
    size.mockClear();
    observer.resize();
    expect(size).not.toHaveBeenCalled();
  });

  it("works where there is no ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    measureAs(200, 100);
    render(
      <ContextMenu
        at={{ x: 100, y: 100 }}
        label="Szene"
        items={[{ id: "new", label: "Neue Szene …" }]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("menu", { name: "Szene" }).style.top).toBe("100px");
  });
});

describe("menus and popovers opened at a point stay inside the window (T-130d)", () => {
  it("moves a context menu opened near the bottom right corner", () => {
    measureAs(200, 300);
    render(
      <ContextMenu
        at={{ x: 1000, y: 700 }}
        label="Szene"
        items={[{ id: "new", label: "Neue Szene …" }]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const menu = screen.getByRole("menu", { name: "Szene" });
    expect(menu.style.left).toBe("816px");
    expect(menu.style.top).toBe("460px");
  });

  it("moves a popover opened at a point", () => {
    measureAs(300, 200);
    function Opened() {
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={anchor}>
            Anker
          </button>
          <Popover
            open
            anchor={anchor}
            label="Neue Szene"
            at={{ x: 900, y: 100 }}
            onClose={vi.fn()}
          >
            <input aria-label="Name" />
          </Popover>
        </>
      );
    }
    render(<Opened />);
    const popover = screen.getByRole("group", { name: "Neue Szene" });
    expect(popover.style.left).toBe("716px");
    expect(popover.style.top).toBe("100px");
  });
});

const viewport = { width: 1280, height: 800 };
const menu = { width: 200, height: 300 };

describe("clampPoint", () => {
  it("leaves a menu that fits where it was opened", () => {
    expect(clampPoint({ x: 100, y: 100 }, menu, viewport)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("moves a menu opened low or far right back into the window", () => {
    expect(clampPoint({ x: 1200, y: 700 }, menu, viewport)).toEqual({
      x: 1072,
      y: 492,
    });
  });

  it("keeps the start reachable when the window is smaller than the menu", () => {
    expect(
      clampPoint({ x: 50, y: 50 }, menu, { width: 150, height: 200 }),
    ).toEqual({ x: 8, y: 8 });
  });
});
