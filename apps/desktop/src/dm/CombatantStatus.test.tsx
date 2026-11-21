import type { Command } from "@dungeon-manager/core";
import type { Combatant } from "@dungeon-manager/schema";
import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { CombatantStatus } from "./CombatantStatus.js";

// HP and conditions in an Initiative row (T-112b).

function renderStatus(combatant: Combatant) {
  const onCommand = vi.fn<(command: Command) => void>();
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <CombatantStatus
        combatant={combatant}
        busy={false}
        onCommand={onCommand}
      />
    </I18nextProvider>,
  );
  return onCommand;
}

const goblin: Combatant = {
  id: "goblin",
  name: "Goblin",
  initiative: 12,
  conditions: [{ type: "poisoned", remainingRounds: 2 }, { type: "prone" }],
  hp: { current: 5, max: 7, temp: 2 },
};

describe("CombatantStatus", () => {
  test("shows HP with temporary ones and the conditions with their rounds", () => {
    renderStatus(goblin);
    expect(
      screen.getByRole("button", { name: /^Trefferpunkte von Goblin/ })
        .textContent,
    ).toBe("5/7 TP (+2)");
    expect(
      [...document.querySelectorAll(".dm-initiative-condition")].map(
        (each) => each.textContent,
      ),
    ).toEqual(["Vergiftet (2)", "Liegend"]);
  });

  test("damage, healing and temporary HP go out as commands", () => {
    const onCommand = renderStatus(goblin);
    const open = () => {
      fireEvent.click(
        screen.getByRole("button", { name: /^Trefferpunkte von Goblin/ }),
      );
    };
    open();
    fireEvent.change(screen.getByLabelText("Betrag"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schaden" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "hp.change",
      combatantId: "goblin",
      amount: -3,
    });
    open();
    fireEvent.change(screen.getByLabelText("Betrag"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Heilung" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "hp.change",
      combatantId: "goblin",
      amount: 4,
    });
    open();
    fireEvent.change(screen.getByLabelText("Temporäre TP"), {
      target: { value: "5" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Temporäre TP setzen" }),
    );
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "hp.setTemp",
      combatantId: "goblin",
      temp: 5,
    });
    // No amount, no command.
    open();
    fireEvent.click(screen.getByRole("button", { name: "Schaden" }));
    expect(onCommand).toHaveBeenCalledTimes(3);
  });

  test("HP of a combatant without them start being tracked", () => {
    const onCommand = renderStatus({
      ...goblin,
      hp: undefined,
      conditions: [],
    });
    fireEvent.click(
      screen.getByRole("button", { name: /^Trefferpunkte von Goblin/ }),
    );
    expect(screen.queryByRole("button", { name: "Schaden" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Aktuell"), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText("Maximum"), {
      target: { value: "11" },
    });
    fireEvent.click(screen.getByRole("button", { name: "TP verfolgen" }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({
      type: "hp.set",
      combatantId: "goblin",
      current: 11,
      max: 11,
    });
  });

  test("conditions are added with or without rounds and removed", () => {
    const onCommand = renderStatus(goblin);
    fireEvent.click(
      screen.getByRole("button", { name: "Zustand für Goblin hinzufügen" }),
    );
    fireEvent.change(screen.getByLabelText("Zustand"), {
      target: { value: "frightened" },
    });
    fireEvent.change(screen.getByLabelText("Runden"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "condition.add",
      combatantId: "goblin",
      condition: { type: "frightened", remainingRounds: 3 },
    });
    // Focus goes back to the button.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Zustand für Goblin hinzufügen" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Zustand für Goblin hinzufügen" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "condition.add",
      combatantId: "goblin",
      condition: { type: "blinded" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Vergiftet von Goblin entfernen" }),
    );
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "condition.remove",
      combatantId: "goblin",
      conditionType: "poisoned",
    });
  });

  test("HP are corrected; without temporary HP or HP at all the button says so", () => {
    const onCommand = renderStatus({
      ...goblin,
      hp: { current: 5, max: 7, temp: 0 },
    });
    const button = screen.getByRole("button", {
      name: "Trefferpunkte von Goblin: 5/7 TP",
    });
    fireEvent.click(button);
    // The amount has the focus.
    expect(document.activeElement).toBe(screen.getByLabelText("Betrag"));
    fireEvent.change(screen.getByLabelText("Maximum"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    // A maximum of 0 is refused before it is sent.
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Maximum"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({
      type: "hp.set",
      combatantId: "goblin",
      current: 5,
      max: 9,
    });
    // Focus is back on the HP button.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Trefferpunkte von Goblin/ }),
    );
  });

  test("temporary HP are set with Enter; without HP the button says they are not tracked", () => {
    const onCommand = renderStatus(goblin);
    fireEvent.click(
      screen.getByRole("button", { name: /^Trefferpunkte von Goblin/ }),
    );
    const temp = screen.getByLabelText("Temporäre TP");
    fireEvent.change(temp, { target: { value: "4" } });
    fireEvent.submit(temp);
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({
      type: "hp.setTemp",
      combatantId: "goblin",
      temp: 4,
    });
  });
});

describe("CombatantStatus without HP", () => {
  test("says HP are not tracked and shows no empty condition list", () => {
    renderStatus({ ...goblin, hp: undefined, conditions: [] });
    expect(
      screen.getByRole("button", {
        name: "Trefferpunkte von Goblin: TP nicht verfolgt",
      }),
    ).toBeTruthy();
    expect(document.querySelector(".dm-initiative-conditions")).toBeNull();
  });
});
