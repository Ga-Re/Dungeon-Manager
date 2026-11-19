import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog.js";

function Harness({ onClose }: { readonly onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Einstellungen
      </button>
      <Dialog
        open={open}
        title="Einstellungen"
        closeLabel="Schließen"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button type="button">Erste</button>
        <button type="button">Letzte</button>
      </Dialog>
    </>
  );
}

const opener = () => screen.getByRole("button", { name: "Einstellungen" });

describe("Dialog", () => {
  it("is a named modal dialog with focus on its first control", () => {
    render(<Harness />);
    fireEvent.click(opener());
    const dialog = screen.getByRole("dialog", { name: "Einstellungen" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Schließen" }),
    );
  });

  it("keeps Tab inside, both ways", () => {
    render(<Harness />);
    fireEvent.click(opener());
    const close = screen.getByRole("button", { name: "Schließen" });
    const last = screen.getByRole("button", { name: "Letzte" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("wraps at the last tab stop, skipping skipped tabs and unchecked radios", () => {
    render(
      <Dialog
        open
        title="Einstellungen"
        closeLabel="Schließen"
        onClose={vi.fn()}
      >
        <label>
          <input type="radio" name="theme" defaultChecked /> Dunkel
        </label>
        <label>
          <input type="radio" name="theme" /> Hell
        </label>
        <button type="button" tabIndex={-1}>
          Inaktiv
        </button>
      </Dialog>,
    );
    const close = screen.getByRole("button", { name: "Schließen" });
    const dark = screen.getByRole("radio", { name: "Dunkel" });
    dark.focus();
    fireEvent.keyDown(dark, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(dark);
  });

  it("closes on Escape, the close button and the backdrop, with focus back on the opener", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    opener().focus();
    fireEvent.click(opener());
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener());

    fireEvent.click(opener());
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(opener());
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.pointerDown(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("returns focus to a given element even if the opener never had it", () => {
    function WithTarget() {
      const [open, setOpen] = useState(true);
      const target = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={target} type="button">
            Zahnrad
          </button>
          <Dialog
            open={open}
            title="Einstellungen"
            closeLabel="Schließen"
            returnFocus={target}
            onClose={() => {
              setOpen(false);
            }}
          >
            <p>Inhalt</p>
          </Dialog>
        </>
      );
    }
    render(<WithTarget />);
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Zahnrad" }),
    );
  });

  it("does not close on a press inside the panel", () => {
    render(<Harness />);
    fireEvent.click(opener());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Erste" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
