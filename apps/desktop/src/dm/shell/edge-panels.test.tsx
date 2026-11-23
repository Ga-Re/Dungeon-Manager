import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import {
  EdgeSheet,
  NO_EDGE_PANELS,
  edgeOf,
  readEdgePanels,
  saveEdgePanels,
  withEdgePanel,
  withoutEdgePanel,
} from "./edge-panels.js";

// Edge sidebars (T-259): what is kept on the device, and when Escape slides a sheet back.

const storageWith = (raw: string | null): Storage =>
  ({
    getItem: () => raw,
    setItem: vi.fn(),
  }) as unknown as Storage;

describe("edge sidebars in device storage", () => {
  it("keep only known panels, each once, never the map", () => {
    expect(
      readEdgePanels(
        storageWith(
          JSON.stringify({
            left: ["data", "map", "nope", 3],
            right: ["browser", "data"],
          }),
        ),
      ),
    ).toEqual({ left: ["data"], right: ["browser"] });
  });

  it("fall back to none for anything unreadable", () => {
    for (const raw of [null, "{", "[]", '"x"', "null"])
      expect(readEdgePanels(storageWith(raw))).toEqual(NO_EDGE_PANELS);
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readEdgePanels(refusing)).toEqual(NO_EDGE_PANELS);
    expect(() => {
      saveEdgePanels(refusing, NO_EDGE_PANELS);
    }).not.toThrow();
  });

  it("move a panel between sidebars and out again", () => {
    const left = withEdgePanel(NO_EDGE_PANELS, "left", "data");
    expect(left).toEqual({ left: ["data"], right: [] });
    const right = withEdgePanel(left, "right", "data");
    expect(right).toEqual({ left: [], right: ["data"] });
    expect(edgeOf(right, "data")).toBe("right");
    expect(edgeOf(withoutEdgePanel(right, "data"), "data")).toBeUndefined();
  });
});

describe("an edge sheet", () => {
  const renderSheet = (onClose: (toTab: boolean) => void) =>
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <EdgeSheet
          edge="right"
          shown="browser"
          open
          title="Browser"
          onClose={onClose}
          onPin={vi.fn()}
        >
          <input aria-label="Notiz" />
          <button
            type="button"
            onKeyDown={(event) => {
              // Like a menu or popover inside: it uses Escape itself.
              if (event.key === "Escape") event.preventDefault();
            }}
          >
            Menü
          </button>
          <span>Inhalt</span>
        </EdgeSheet>
      </I18nextProvider>,
    );

  it("slides back on Escape from its content", async () => {
    const onClose = vi.fn();
    renderSheet(onClose);
    fireEvent.keyDown(screen.getByText("Inhalt"), { key: "Escape" });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
  });

  it("leaves Escape to a field being edited and to content that uses it (T-259 review)", async () => {
    const onClose = vi.fn();
    renderSheet(onClose);
    fireEvent.keyDown(screen.getByLabelText("Notiz"), { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Menü" }), {
      key: "Escape",
    });
    // Give the deferred decision its turn.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open for a press in a dialog over everything", () => {
    const onClose = vi.fn();
    renderSheet(onClose);
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    fireEvent.pointerDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledWith(false);
    dialog.remove();
  });
});
