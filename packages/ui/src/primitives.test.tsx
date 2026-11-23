import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { FloatingPanel } from "./FloatingPanel.js";
import { createI18n } from "./i18n.js";
import { IconButton } from "./IconButton.js";
import { TreeList, type TreeListProps, type TreeNode } from "./TreeList.js";

function renderWithI18n(ui: ReactElement, language: "de" | "en" = "de") {
  return render(
    <I18nextProvider i18n={createI18n(language)}>{ui}</I18nextProvider>,
  );
}

const Icon = () => <svg data-testid="icon" />;

describe("IconButton", () => {
  it("is labelled by its label when only the icon is shown", () => {
    render(<IconButton icon={<Icon />} label="Rückgängig" />);
    const button = screen.getByRole("button", { name: "Rückgängig" });
    expect(button.getAttribute("title")).toBe("Rückgängig");
    expect(
      within(button)
        .getByTestId("icon")
        .parentElement?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("shows the label under the icon for ribbon tools", () => {
    render(<IconButton icon={<Icon />} label="Pinsel" showLabel />);
    const button = screen.getByRole("button", { name: "Pinsel" });
    expect(within(button).getByText("Pinsel")).toBeTruthy();
    expect(button.hasAttribute("title")).toBe(false);
  });

  it("exposes a pressed state for toggle tools and stays a plain button otherwise", () => {
    const { rerender } = render(
      <IconButton icon={<Icon />} label="Rechteck" pressed />,
    );
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe(
      "true",
    );
    rerender(<IconButton icon={<Icon />} label="Rechteck" />);
    expect(screen.getByRole("button").hasAttribute("aria-pressed")).toBe(false);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("forwards clicks", () => {
    const onClick = vi.fn();
    render(<IconButton icon={<Icon />} label="Speichern" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("FloatingPanel", () => {
  it("is a region named by its heading", () => {
    renderWithI18n(<FloatingPanel title="Szene">Inhalt</FloatingPanel>);
    const region = screen.getByRole("region", { name: "Szene" });
    expect(within(region).getByRole("heading", { name: "Szene" })).toBeTruthy();
    expect(within(region).getByText("Inhalt")).toBeTruthy();
  });

  it("shows a translated, pluralised item count", () => {
    const { unmount } = renderWithI18n(
      <FloatingPanel title="Szene" count={1}>
        x
      </FloatingPanel>,
    );
    expect(screen.getByText("1 Objekt")).toBeTruthy();
    unmount();
    renderWithI18n(
      <FloatingPanel title="Scene" count={14}>
        x
      </FloatingPanel>,
      "en",
    );
    expect(screen.getByText("14 items")).toBeTruthy();
  });

  it("renders header actions", () => {
    renderWithI18n(
      <FloatingPanel
        title="Szene"
        headerActions={<button type="button">Neu</button>}
      >
        x
      </FloatingPanel>,
    );
    expect(screen.getByRole("button", { name: "Neu" })).toBeTruthy();
  });
});

const nodes: TreeNode[] = [
  {
    id: "crypt",
    label: "Krypta",
    children: [
      { id: "map", label: "krypta.webp", mono: true, meta: <span>4K</span> },
      {
        id: "rooms",
        label: "Räume",
        children: [
          { id: "chamber", label: "Grabkammer" },
          { id: "passage", label: "Geheimgang" },
        ],
      },
    ],
  },
  {
    id: "tokens",
    label: "Tokens",
    children: [{ id: "guard", label: "Wächter" }],
  },
];

function item(name: string) {
  return screen.getByRole("treeitem", { name });
}

describe("TreeList", () => {
  it("renders a labelled tree with levels and expanded folders", () => {
    render(<TreeList label="Szene" nodes={nodes} />);
    expect(screen.getByRole("tree", { name: "Szene" })).toBeTruthy();
    expect(item("Krypta").getAttribute("aria-level")).toBe("1");
    expect(item("Grabkammer").getAttribute("aria-level")).toBe("3");
    expect(item("Krypta").getAttribute("aria-expanded")).toBe("true");
    expect(item("Grabkammer").hasAttribute("aria-expanded")).toBe(false);
    expect(screen.getByText("4K")).toBeTruthy();
  });

  it("asks for a context menu on right-click and on Shift+F10 / the context-menu key", () => {
    const onItemContextMenu =
      vi.fn<NonNullable<TreeListProps["onItemContextMenu"]>>();
    render(
      <TreeList
        label="Szene"
        nodes={nodes}
        onItemContextMenu={onItemContextMenu}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Grabkammer"), {
      clientX: 30,
      clientY: 40,
    });
    expect(onItemContextMenu).toHaveBeenLastCalledWith(
      "chamber",
      { x: 30, y: 40 },
      item("Grabkammer"),
    );
    expect(document.activeElement).toBe(item("Grabkammer"));
    fireEvent.keyDown(item("Krypta"), { key: "F10", shiftKey: true });
    const [id, point, owner] = onItemContextMenu.mock.lastCall ?? [];
    expect(id).toBe("crypt");
    // Below the row, where jsdom (no layout) puts every box: at the origin.
    expect(point).toEqual({ x: 0, y: 0 });
    expect(owner).toBe(item("Krypta"));
    fireEvent.keyDown(item("Krypta"), { key: "ContextMenu" });
    expect(onItemContextMenu).toHaveBeenCalledTimes(3);
  });

  it("opens an item on double-click, not a folder's toggle or a nested item's (ADR-0020)", () => {
    const onItemActivate = vi.fn();
    render(
      <TreeList label="Szene" nodes={nodes} onItemActivate={onItemActivate} />,
    );
    fireEvent.doubleClick(screen.getByText("Grabkammer"));
    expect(onItemActivate).toHaveBeenLastCalledWith("chamber");
    const toggle = item("Krypta").querySelector(".dm-tree-toggle");
    if (!toggle) throw new Error("no toggle");
    fireEvent.doubleClick(toggle);
    expect(onItemActivate).toHaveBeenCalledTimes(1);
  });

  it("opens the focused item with Enter too; Space only selects it (T-253)", () => {
    const onItemActivate = vi.fn();
    const onSelect = vi.fn();
    render(
      <TreeList
        label="Szene"
        nodes={nodes}
        onSelect={onSelect}
        onItemActivate={onItemActivate}
      />,
    );
    fireEvent.keyDown(item("Grabkammer"), { key: " " });
    expect(onSelect).toHaveBeenLastCalledWith("chamber");
    expect(onItemActivate).not.toHaveBeenCalled();
    fireEvent.keyDown(item("Grabkammer"), { key: "Enter" });
    expect(onItemActivate).toHaveBeenLastCalledWith("chamber");
  });

  it("opens the context menu beside a narrow row and swallows the key's own contextmenu", () => {
    const onItemContextMenu =
      vi.fn<NonNullable<TreeListProps["onItemContextMenu"]>>();
    render(
      <TreeList
        label="Szene"
        nodes={nodes}
        onItemContextMenu={onItemContextMenu}
      />,
    );
    // On the item line itself, not on its row.
    fireEvent.contextMenu(item("Grabkammer"), { clientX: 5, clientY: 6 });
    expect(onItemContextMenu).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(item("Grabkammer"), { key: "ContextMenu" });
    expect(onItemContextMenu).toHaveBeenCalledTimes(2);
    fireEvent.contextMenu(item("Grabkammer"));
    expect(onItemContextMenu).toHaveBeenCalledTimes(2);
  });

  it("selects an item on click", () => {
    const onSelect = vi.fn();
    render(
      <TreeList
        label="Szene"
        nodes={nodes}
        selectedId="map"
        onSelect={onSelect}
      />,
    );
    expect(item("krypta.webp").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByText("Grabkammer"));
    expect(onSelect).toHaveBeenCalledWith("chamber");
  });

  it("collapses and expands a folder with its toggle box without selecting it", () => {
    const onSelect = vi.fn();
    render(<TreeList label="Szene" nodes={nodes} onSelect={onSelect} />);
    const toggle = item("Räume").querySelector<HTMLElement>(".dm-tree-toggle");
    if (!toggle) throw new Error("toggle box missing");
    fireEvent.click(toggle);
    expect(item("Räume").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: "Grabkammer" })).toBeNull();
    fireEvent.click(toggle);
    expect(item("Grabkammer")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps exactly one item in the tab order (roving focus)", () => {
    render(<TreeList label="Szene" nodes={nodes} selectedId="passage" />);
    const tabbable = screen
      .getAllByRole("treeitem")
      .filter((element) => element.tabIndex === 0);
    expect(tabbable.map((element) => element.getAttribute("data-id"))).toEqual([
      "passage",
    ]);
  });

  describe("keyboard", () => {
    function setup() {
      const onSelect = vi.fn();
      render(<TreeList label="Szene" nodes={nodes} onSelect={onSelect} />);
      item("Krypta").focus();
      return onSelect;
    }
    const press = (key: string) => {
      const target = document.activeElement;
      if (!target) throw new Error("nothing focused");
      fireEvent.keyDown(target, { key });
    };
    const focused = () => document.activeElement?.getAttribute("data-id");

    it("moves through visible items with the arrow keys, Home and End", () => {
      setup();
      press("ArrowDown");
      expect(focused()).toBe("map");
      press("ArrowDown");
      press("ArrowDown");
      expect(focused()).toBe("chamber");
      press("End");
      expect(focused()).toBe("guard");
      press("ArrowUp");
      expect(focused()).toBe("tokens");
      press("Home");
      expect(focused()).toBe("crypt");
      press("ArrowUp");
      expect(focused()).toBe("crypt");
    });

    it("collapses with ArrowLeft, then moves to the parent; ArrowRight expands, then enters", () => {
      setup();
      press("ArrowDown");
      press("ArrowDown");
      expect(focused()).toBe("rooms");
      press("ArrowLeft");
      expect(item("Räume").getAttribute("aria-expanded")).toBe("false");
      expect(focused()).toBe("rooms");
      press("ArrowLeft");
      expect(focused()).toBe("crypt");
      press("ArrowDown");
      press("ArrowDown");
      press("ArrowRight");
      expect(item("Räume").getAttribute("aria-expanded")).toBe("true");
      press("ArrowRight");
      expect(focused()).toBe("chamber");
      press("ArrowRight");
      expect(focused()).toBe("chamber");
    });

    it("skips children of collapsed folders", () => {
      setup();
      press("ArrowLeft");
      press("ArrowDown");
      expect(focused()).toBe("tokens");
    });

    it("selects the focused item with Enter or Space", () => {
      const onSelect = setup();
      press("Enter");
      expect(onSelect).toHaveBeenLastCalledWith("crypt");
      press("ArrowDown");
      press(" ");
      expect(onSelect).toHaveBeenLastCalledWith("map");
    });
  });

  it("never selects an item when one of its actions is clicked", () => {
    const onSelect = vi.fn();
    render(
      <TreeList
        label="Szene"
        nodes={nodes}
        onSelect={onSelect}
        renderActions={(node) => (
          <button
            type="button"
            tabIndex={-1}
          >{`Entfernen ${node.label}`}</button>
        )}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Entfernen Grabkammer" }),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps focus on a folder when its focused descendant is collapsed away", () => {
    render(<TreeList label="Szene" nodes={nodes} />);
    item("Grabkammer").focus();
    const toggle = item("Krypta").querySelector<HTMLElement>(".dm-tree-toggle");
    if (!toggle) throw new Error("toggle box missing");
    fireEvent.click(toggle);
    expect(document.activeElement?.getAttribute("data-id")).toBe("crypt");
  });

  it("expands folders that appear later, but keeps folders the DM collapsed", () => {
    const { rerender } = render(<TreeList label="Szene" nodes={nodes} />);
    const toggle = item("Tokens").querySelector<HTMLElement>(".dm-tree-toggle");
    if (!toggle) throw new Error("toggle box missing");
    fireEvent.click(toggle);
    rerender(
      <TreeList
        label="Szene"
        nodes={[
          ...nodes,
          {
            id: "notes",
            label: "Notizen",
            children: [{ id: "n1", label: "Rätsel" }],
          },
        ]}
      />,
    );
    expect(item("Notizen").getAttribute("aria-expanded")).toBe("true");
    expect(item("Tokens").getAttribute("aria-expanded")).toBe("false");
  });

  it("can be controlled", () => {
    const onExpandedChange = vi.fn();
    render(
      <TreeList
        label="Szene"
        nodes={nodes}
        expandedIds={new Set(["crypt"])}
        onExpandedChange={onExpandedChange}
      />,
    );
    expect(item("Räume").getAttribute("aria-expanded")).toBe("false");
    const toggle = item("Räume").querySelector<HTMLElement>(".dm-tree-toggle");
    if (!toggle) throw new Error("toggle box missing");
    fireEvent.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(new Set(["crypt", "rooms"]));
    expect(item("Räume").getAttribute("aria-expanded")).toBe("false");
  });

  it("renders trailing actions per item", () => {
    render(
      <TreeList
        label="Szene"
        nodes={nodes}
        renderActions={(node) =>
          node.children ? null : (
            <button type="button">{`Sichtbarkeit ${node.label}`}</button>
          )
        }
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sichtbarkeit Grabkammer" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Sichtbarkeit Krypta" }),
    ).toBeNull();
  });
});
