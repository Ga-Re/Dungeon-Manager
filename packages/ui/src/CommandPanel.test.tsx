import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CommandPanel } from "./CommandPanel.js";

// The command panel of a ribbon tool (ADR-0020): floating, not modal, OK and Abbrechen.

function Harness({
  onOk,
  onCancel,
  okDisabled = false,
}: {
  readonly onOk: () => void;
  readonly onCancel: () => void;
  readonly okDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Raster kalibrieren
      </button>
      <button type="button">Karte</button>
      {open && (
        <CommandPanel
          title="Raster kalibrieren"
          okLabel="OK"
          cancelLabel="Abbrechen"
          moveLabel="Verschieben"
          okDisabled={okDisabled}
          onOk={() => {
            onOk();
            setOpen(false);
          }}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        >
          <label>
            Felder
            <input defaultValue="3" />
          </label>
        </CommandPanel>
      )}
    </>
  );
}

const open = () => {
  const tool = screen.getByRole("button", { name: "Raster kalibrieren" });
  // A click focuses a button in a browser; jsdom does not.
  tool.focus();
  fireEvent.click(tool);
  return screen.getByRole("dialog", { name: "Raster kalibrieren" });
};

describe("CommandPanel", () => {
  it("is a named, non-modal panel with its first control focused", () => {
    render(<Harness onOk={vi.fn()} onCancel={vi.fn()} />);
    const panel = open();
    expect(panel.getAttribute("aria-modal")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Felder"));
    // The rest of the window stays usable.
    expect(
      screen.getByRole("button", { name: "Karte" }).closest("[inert]"),
    ).toBeNull();
  });

  it("Enter or OK applies; Escape or Abbrechen discards; focus returns to the tool", () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onOk={onOk} onCancel={onCancel} />);
    open();
    fireEvent.keyDown(screen.getByLabelText("Felder"), { key: "Enter" });
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Raster kalibrieren" }),
    );

    open();
    fireEvent.keyDown(screen.getByLabelText("Felder"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    open();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onOk).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("does not take the keyboard back from where the DM went meanwhile", () => {
    render(<Harness onOk={vi.fn()} onCancel={vi.fn()} />);
    open();
    const elsewhere = screen.getByRole("button", { name: "Karte" });
    elsewhere.focus();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(document.activeElement).toBe(elsewhere);
  });

  it("does not apply while OK is disabled", () => {
    const onOk = vi.fn();
    render(<Harness onOk={onOk} onCancel={vi.fn()} okDisabled />);
    open();
    fireEvent.keyDown(screen.getByLabelText("Felder"), { key: "Enter" });
    expect(onOk).not.toHaveBeenCalled();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "OK" }).disabled,
    ).toBe(true);
  });

  it("is moved by dragging its title bar", () => {
    render(<Harness onOk={vi.fn()} onCancel={vi.fn()} />);
    const panel = open();
    const handle = screen.getByTitle("Verschieben");
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 70, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 70, clientY: 140, pointerId: 1 });
    expect(panel.style.transform).toBe("translate(-30px, 40px)");
  });

  it("stays in the window however far it is dragged (T-257)", () => {
    render(<Harness onOk={vi.fn()} onCancel={vi.fn()} />);
    const panel = open();
    // Where the panel stands before the drag: near the window's right edge.
    panel.getBoundingClientRect = () =>
      ({
        left: 700,
        right: 900,
        top: 50,
        bottom: 350,
        width: 200,
        height: 300,
      }) as DOMRect;
    const handle = screen.getByTitle("Verschieben");
    fireEvent.pointerDown(handle, { clientX: 800, clientY: 60, pointerId: 1 });
    // Far past the right and bottom edges of the window (1024 × 768 in jsdom).
    fireEvent.pointerMove(handle, {
      clientX: 2000,
      clientY: 2000,
      pointerId: 1,
    });
    expect(panel.style.transform).toBe("translate(124px, 418px)");
    // And past the top-left corner.
    fireEvent.pointerMove(handle, {
      clientX: -2000,
      clientY: -2000,
      pointerId: 1,
    });
    expect(panel.style.transform).toBe("translate(-700px, -50px)");
  });

  it("comes back into the window when the window shrinks or it opens partly outside (T-257)", () => {
    // jsdom has no IntersectionObserver: a stand-in that reports when asked.
    let report: (() => void) | null = null;
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(callback: () => void) {
        report = callback;
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      render(<Harness onOk={vi.fn()} onCancel={vi.fn()} />);
      const panel = open();
      // Past the right and bottom edges of the 1024 × 768 window.
      panel.getBoundingClientRect = () =>
        ({
          left: 900,
          right: 1100,
          top: 600,
          bottom: 900,
          width: 200,
          height: 300,
        }) as DOMRect;
      act(() => report?.());
      expect(panel.style.transform).toBe("translate(-76px, -132px)");
      // Taller than the window: the title bar stays reachable at the top.
      panel.getBoundingClientRect = () =>
        ({
          left: 0,
          right: 200,
          top: -50,
          bottom: 950,
          width: 200,
          height: 1000,
        }) as DOMRect;
      act(() => report?.());
      expect(panel.style.transform).toBe("translate(-76px, -82px)");
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});
