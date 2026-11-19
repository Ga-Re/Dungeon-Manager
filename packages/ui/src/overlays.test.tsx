import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu.js";
import { Menu, type MenuItem } from "./Menu.js";
import { Popover } from "./Popover.js";
import { RibbonGroup } from "./RibbonGroup.js";

const ITEMS: readonly MenuItem[] = [
  { id: "rename", label: "Umbenennen" },
  { id: "archive", label: "Archivieren", disabled: true },
  { id: "delete", label: "Löschen …" },
];

const menuButton = () => screen.getByRole("button", { name: "Szene" });
const item = (name: string) => screen.getByRole("menuitem", { name });

describe("Menu", () => {
  it("opens on click with focus on the first item and closes with Escape", () => {
    render(<Menu label="Szene" items={ITEMS} onSelect={vi.fn()} />);
    expect(menuButton().getAttribute("aria-haspopup")).toBe("menu");
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu", { name: "Szene" })).toBeTruthy();
    expect(document.activeElement).toBe(item("Umbenennen"));
    fireEvent.keyDown(item("Umbenennen"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("moves with the arrow keys, Home and End, wrapping around", () => {
    render(<Menu label="Szene" items={ITEMS} onSelect={vi.fn()} />);
    fireEvent.keyDown(menuButton(), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Löschen …"));
    fireEvent.keyDown(item("Löschen …"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Umbenennen"));
    fireEvent.keyDown(item("Umbenennen"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Löschen …"));
    fireEvent.keyDown(item("Löschen …"), { key: "Home" });
    expect(document.activeElement).toBe(item("Umbenennen"));
    fireEvent.keyDown(item("Umbenennen"), { key: "End" });
    expect(document.activeElement).toBe(item("Löschen …"));
  });

  it("reports the chosen item, closes and returns focus to its button", () => {
    const onSelect = vi.fn();
    render(<Menu label="Szene" items={ITEMS} onSelect={onSelect} />);
    fireEvent.keyDown(menuButton(), { key: "ArrowDown" });
    fireEvent.click(item("Löschen …"));
    expect(onSelect).toHaveBeenCalledWith("delete");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("ignores disabled items", () => {
    const onSelect = vi.fn();
    render(<Menu label="Szene" items={ITEMS} onSelect={onSelect} />);
    fireEvent.click(menuButton());
    expect(item("Archivieren").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(item("Archivieren"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("closes on Tab and on a press outside", () => {
    render(<Menu label="Szene" items={ITEMS} onSelect={vi.fn()} />);
    fireEvent.click(menuButton());
    fireEvent.keyDown(item("Umbenennen"), { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(menuButton());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

function PopoverHarness({ onClose }: { readonly onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button
        ref={anchor}
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        Einstellungen
      </button>
      <Popover
        open={open}
        anchor={anchor}
        label="Darstellung"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <input aria-label="Name" />
      </Popover>
      <p data-testid="map">Karte</p>
    </div>
  );
}

describe("Popover", () => {
  it("is a named group that closes on Escape from inside, focusing its anchor", () => {
    render(<PopoverHarness />);
    const group = screen.getByRole("group", { name: "Darstellung" });
    const field = within(group).getByRole("textbox", { name: "Name" });
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Darstellung" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Einstellungen" }),
    );
  });

  it("closes on Escape from its anchor", () => {
    render(<PopoverHarness />);
    const anchor = screen.getByRole("button", { name: "Einstellungen" });
    fireEvent.keyDown(anchor, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Darstellung" })).toBeNull();
  });

  it("keeps focus inside when the owner refuses to close", () => {
    const anchor = { current: null };
    render(
      <Popover open anchor={anchor} label="Karte ändern" onClose={vi.fn()}>
        <input aria-label="Name" />
      </Popover>,
    );
    const field = screen.getByRole("textbox", { name: "Name" });
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(document.activeElement).toBe(field);
  });

  it("leaves Escape elsewhere to its owner", () => {
    const onClose = vi.fn();
    render(<PopoverHarness onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("map"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a press outside but not on its anchor", () => {
    const onClose = vi.fn();
    render(<PopoverHarness onClose={onClose} />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Einstellungen" }),
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId("map"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("RibbonGroup", () => {
  it("names the group by its caption and shows the tools", () => {
    render(
      <RibbonGroup caption="Karte">
        <button type="button">Karte ändern …</button>
      </RibbonGroup>,
    );
    const group = screen.getByRole("group", { name: "Karte" });
    expect(
      within(group).getByRole("button", { name: "Karte ändern …" }),
    ).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Karte" })).toBeNull();
  });

  it("turns the caption into a menu of less frequent commands", () => {
    const onSelect = vi.fn();
    render(
      <RibbonGroup caption="Szene" menu={{ items: ITEMS, onSelect }}>
        <button type="button">Karte ändern …</button>
      </RibbonGroup>,
    );
    fireEvent.click(menuButton());
    fireEvent.click(item("Umbenennen"));
    expect(onSelect).toHaveBeenCalledWith("rename");
  });
});

describe("ContextMenu", () => {
  function setup(onSelect = vi.fn(), onClose = vi.fn()) {
    const owner = document.createElement("button");
    document.body.append(owner);
    render(
      <ContextMenu
        at={{ x: 40, y: 60 }}
        label="Szene"
        items={ITEMS}
        onSelect={onSelect}
        onClose={onClose}
        returnFocus={owner}
      />,
    );
    return { owner, onSelect, onClose };
  }

  it("opens at the point with focus on the first item", () => {
    setup();
    const menu = screen.getByRole("menu", { name: "Szene" });
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.left).toBe("40px");
    expect(menu.style.top).toBe("60px");
    expect(document.activeElement).toBe(item("Umbenennen"));
  });

  it("returns focus to its owner on a choice and on Escape", () => {
    const { owner, onSelect, onClose } = setup();
    fireEvent.click(item("Löschen …"));
    expect(onSelect).toHaveBeenCalledWith("delete");
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(owner);
    item("Umbenennen").focus();
    fireEvent.keyDown(item("Umbenennen"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(owner);
  });

  it("renders nothing without a point", () => {
    render(
      <ContextMenu
        at={null}
        label="Szene"
        items={ITEMS}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Popover at a point", () => {
  it("is placed at the viewport point", () => {
    render(
      <Popover
        open
        anchor={{ current: null }}
        label="Neue Szene"
        at={{ x: 12, y: 34 }}
        onClose={vi.fn()}
      >
        <p>Inhalt</p>
      </Popover>,
    );
    const group = screen.getByRole("group", { name: "Neue Szene" });
    expect(group.className).toContain("dm-popover-at");
    expect(group.style.left).toBe("12px");
    expect(group.style.top).toBe("34px");
  });
});
