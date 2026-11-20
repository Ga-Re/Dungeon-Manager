// The scene tabs' unsaved-changes dot and closing (T-223b).
import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { SceneTabs, type SceneTabEntry } from "./SceneTitle.js";

function renderTabs(tabs: readonly SceneTabEntry[]) {
  const onClose = vi.fn();
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <SceneTabs
        tabs={tabs}
        activeId={tabs[0]?.id ?? null}
        busy={false}
        onSelect={vi.fn()}
        onClose={onClose}
      />
    </I18nextProvider>,
  );
  return { onClose };
}

const tabs: readonly SceneTabEntry[] = [
  { id: "a", name: "Eingang", onTv: true },
  { id: "b", name: "Gruft", onTv: false, saving: true },
  { id: "c", name: "Turm", onTv: false, saveFailed: true },
];

const group = () =>
  within(screen.getByRole("group", { name: "Offene Szenen" }));

describe("scene tabs (T-223b)", () => {
  it("mark a tab with a dot while its save is pending or failed", () => {
    renderTabs(tabs);
    const names = group()
      .getAllByRole("button")
      .filter((each) => each.classList.contains("dm-scene-tab-name"));
    expect(names.map((each) => each.textContent)).toEqual([
      "Eingang(auf dem TV)",
      "Gruft(speichert)",
      "Turm(nicht gespeichert)",
    ]);
    expect(document.querySelectorAll(".dm-scene-tab-dot")).toHaveLength(2);
  });

  it("close at once while saved or saving; ask first after a failed save", () => {
    const { onClose } = renderTabs(tabs);
    fireEvent.click(screen.getByRole("button", { name: "Eingang schließen" }));
    fireEvent.click(screen.getByRole("button", { name: "Gruft schließen" }));
    expect(onClose.mock.calls).toEqual([["a"], ["b"]]);
    expect(screen.queryByRole("dialog")).toBeNull();

    const close = screen.getByRole("button", { name: "Turm schließen" });
    fireEvent.click(close);
    const dialog = within(
      screen.getByRole("dialog", { name: "Szene schließen?" }),
    );
    expect(
      dialog.getByText(
        "Die letzten Änderungen an Turm konnten nicht gespeichert werden. Beim Schließen gehen sie verloren.",
      ),
    ).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Offen lassen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(close);

    fireEvent.click(close);
    fireEvent.click(screen.getByRole("button", { name: "Trotzdem schließen" }));
    expect(onClose).toHaveBeenLastCalledWith("c");
  });
});
