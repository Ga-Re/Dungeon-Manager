import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { HudPanel, type HudPlacement } from "./HudPanel.js";
import { TreeList } from "./TreeList.js";

const LABELS = {
  move: "Browser verschieben",
  collapse: "Browser einklappen",
  expand: "Browser ausklappen",
};

function Harness({
  onChange,
  initial = { x: 12, y: 20, collapsed: false },
}: {
  readonly onChange?: (placement: HudPlacement) => void;
  readonly initial?: HudPlacement;
}) {
  const [placement, setPlacement] = useState(initial);
  return (
    <HudPanel
      title="Browser"
      labels={LABELS}
      placement={placement}
      onPlacementChange={(next) => {
        onChange?.(next);
        setPlacement(next);
      }}
    >
      <p>Baum</p>
    </HudPanel>
  );
}

const region = () => screen.getByRole("region", { name: "Browser" });

describe("HudPanel", () => {
  it("is a named region placed at its position", () => {
    render(<Harness />);
    expect(region().style.left).toBe("12px");
    expect(region().style.top).toBe("20px");
    expect(screen.getByText("Baum")).toBeTruthy();
  });

  it("folds to its header bar and back", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Browser einklappen" }));
    expect(screen.getByText("Baum").closest("[hidden]")).not.toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({
      x: 12,
      y: 20,
      collapsed: true,
    });
    const expand = screen.getByRole("button", { name: "Browser ausklappen" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(screen.getByText("Baum").closest("[hidden]")).toBeNull();
  });

  it("moves with the arrow keys on its grip, further with Shift, never below 0", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const grip = screen.getByRole("button", { name: "Browser verschieben" });
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(region().style.left).toBe("28px");
    fireEvent.keyDown(grip, { key: "ArrowDown", shiftKey: true });
    expect(region().style.top).toBe("84px");
    fireEvent.keyDown(grip, { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(grip, { key: "ArrowUp", shiftKey: true });
    expect(region().style.top).toBe("0px");
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("follows a drag of its grip and reports the end position once", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const grip = screen.getByRole("button", { name: "Browser verschieben" });
    // jsdom has no pointer capture.
    grip.setPointerCapture = () => undefined;
    fireEvent.pointerDown(grip, { button: 0, clientX: 20, clientY: 30 });
    fireEvent.pointerMove(grip, { clientX: 120, clientY: 80 });
    expect(region().style.left).toBe("112px");
    expect(region().style.top).toBe("70px");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(grip);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      x: 112,
      y: 70,
      collapsed: false,
    });
  });
});

describe("TreeList compact variant", () => {
  it("uses chevrons instead of toggle boxes", () => {
    render(
      <TreeList
        label="Browser"
        variant="compact"
        nodes={[
          {
            id: "a",
            label: "Szenen",
            children: [{ id: "b", label: "Krypta" }],
          },
        ]}
      />,
    );
    const tree = screen.getByRole("tree", { name: "Browser" });
    expect(tree.className).toContain("dm-tree-compact");
    expect(tree.querySelector(".dm-tree-toggle path")?.getAttribute("d")).toBe(
      "M1.5 3l2.5 2.5 2.5-2.5",
    );
  });
});
