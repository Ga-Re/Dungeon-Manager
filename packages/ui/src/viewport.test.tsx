import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu.js";
import { Popover } from "./Popover.js";
import { clampPoint } from "./viewport.js";

/** Every element measures `width` × `height` px; jsdom’s window is 1024 × 768. */
function measureAs(width: number, height: number) {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ width, height } as DOMRect);
}

afterEach(() => {
  vi.restoreAllMocks();
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
