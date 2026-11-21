import type { Command } from "@dungeon-manager/core";
import type { InitiativeState } from "@dungeon-manager/schema";
import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { InitiativePanel } from "./InitiativePanel.js";

// The Initiative panel's own actions (T-111b); the scene's side is in useSceneSession.test.

const initiative: InitiativeState = {
  round: 1,
  activeCombatantId: "aria",
  order: ["aria", "goblin"],
  combatants: [
    { id: "aria", name: "Aria", initiative: 15, conditions: [] },
    {
      id: "goblin",
      name: "Goblin",
      initiative: 11,
      conditions: [],
      ready: true,
    },
  ],
};

function renderPanel(
  canStart = true,
  state: InitiativeState | null = initiative,
) {
  const onCommand = vi.fn<(command: Command) => void>();
  const onStart = vi.fn<() => void>();
  const onPlayerRolls =
    vi.fn<
      (rolls: readonly { playerId: string; initiative: number }[]) => void
    >();
  const onAddEntry = vi.fn<(name: string, initiative: number) => void>();
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <InitiativePanel
        initiative={state}
        canAddSelected={false}
        canStart={canStart}
        busy={false}
        onAddSelected={() => undefined}
        onStart={onStart}
        onCommand={onCommand}
        players={[
          { playerId: "p1", name: "Aria", initiative: 15 },
          { playerId: "p2", name: "Bran" },
        ]}
        onPlayerRolls={onPlayerRolls}
        onAddEntry={onAddEntry}
      />
    </I18nextProvider>,
  );
  return { onCommand, onStart, onPlayerRolls, onAddEntry };
}

describe("InitiativePanel", () => {
  test("moves up and takes a held action back", () => {
    const { onCommand } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Goblin nach oben" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "initiative.move",
      combatantId: "goblin",
      index: 0,
    });
    const ready = screen.getByRole("button", {
      name: "Goblin hält eine Aktion bereit",
    });
    expect(ready.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(ready);
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "initiative.ready",
      combatantId: "goblin",
      ready: false,
    });
    // The first one cannot go further up, the last one not further down.
    expect(
      screen.getByRole("button", { name: "Aria nach oben" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Goblin nach unten" }),
    ).toHaveProperty("disabled", true);
  });

  test("a value is taken when the field is left; Escape and an empty field keep the old one", () => {
    const { onCommand } = renderPanel();
    const value = screen.getByRole("spinbutton", {
      name: "Initiative von Goblin",
    });
    fireEvent.change(value, { target: { value: "1" } });
    fireEvent.change(value, { target: { value: "17" } });
    // Not while typing.
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.blur(value);
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({
      type: "initiative.setValue",
      combatantId: "goblin",
      initiative: 17,
    });
    fireEvent.change(value, { target: { value: "3" } });
    fireEvent.keyDown(value, { key: "Escape" });
    fireEvent.blur(value);
    fireEvent.change(value, { target: { value: "" } });
    fireEvent.blur(value);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect((value as HTMLInputElement).value).toBe("11");
  });

  test("start waits for the map's cells and for combatants", () => {
    const notStarted = { ...initiative, round: 0, activeCombatantId: null };
    renderPanel(false, notStarted);
    expect(
      screen.getByRole("button", { name: "Initiative starten" }),
    ).toHaveProperty("disabled", true);
  });

  test("quick entry of the players' rolls by keyboard only (T-111d)", () => {
    const { onPlayerRolls } = renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Spielerwürfe eintragen …" }),
    );
    // The first field has the focus and the value already in the order.
    const aria = screen.getByLabelText("Aria");
    expect(document.activeElement).toBe(aria);
    expect((aria as HTMLInputElement).value).toBe("15");
    fireEvent.change(aria, { target: { value: "17" } });
    const bran = screen.getByLabelText("Bran");
    fireEvent.change(bran, { target: { value: "9" } });
    fireEvent.submit(bran);
    expect(onPlayerRolls).toHaveBeenCalledExactlyOnceWith([
      { playerId: "p1", initiative: 17 },
      { playerId: "p2", initiative: 9 },
    ]);
    // The form closes after entering.
    expect(screen.queryByLabelText("Bran")).toBeNull();
  });

  test("a free entry needs a name and a value (T-111d)", () => {
    const { onAddEntry } = renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Eintrag hinzufügen …" }),
    );
    const name = screen.getByLabelText("Name");
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: "Hort-Aktion" } });
    fireEvent.submit(name);
    expect(onAddEntry).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Initiative" }), {
      target: { value: "20" },
    });
    fireEvent.submit(name);
    expect(onAddEntry).toHaveBeenCalledExactlyOnceWith("Hort-Aktion", 20);
  });

  test("dragging a row onto another moves it to that place (T-111d)", () => {
    const { onCommand } = renderPanel();
    const rows = document.querySelectorAll("li.dm-initiative-row");
    const [aria, goblin] = [...rows];
    if (!aria || !goblin) throw new Error("rows missing");
    const dataTransfer = { effectAllowed: "", setData: () => undefined };
    fireEvent.dragStart(goblin, { dataTransfer });
    fireEvent.dragOver(aria, { dataTransfer });
    fireEvent.drop(aria, { dataTransfer });
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({
      type: "initiative.move",
      combatantId: "goblin",
      index: 0,
    });
  });
});
