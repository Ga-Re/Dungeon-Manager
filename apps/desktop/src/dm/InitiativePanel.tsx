import type { Command } from "@dungeon-manager/core";
import type { InitiativeState } from "@dungeon-manager/schema";
import { IconButton, Popover } from "@dungeon-manager/ui";
import {
  ArrowDown,
  ArrowUp,
  Hand,
  Hourglass,
  ListPlus,
  Plus,
  Users,
  Play,
  SkipForward,
  Square,
  X,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { CombatantStatus } from "./CombatantStatus.js";
import {
  FreeEntryForm,
  PlayerRollsForm,
  type PlayerCharacter,
} from "./InitiativeEntry.js";
import { useTranslation } from "react-i18next";

/**
 * The open scene's initiative in the "Initiative" panel (T-111b): round and order with the
 * active turn, and the tracker's actions. It only sends commands; the scene decides.
 */
export function InitiativePanel({
  initiative,
  canAddSelected,
  canStart,
  busy,
  onAddSelected,
  onStart,
  onCommand,
  players,
  onPlayerRolls,
  onAddEntry,
}: {
  readonly initiative: InitiativeState | null;
  /** Selected tokens that are not in the initiative yet. */
  readonly canAddSelected: boolean;
  /** Whether combat can start: the map's cells are known. */
  readonly canStart: boolean;
  readonly busy: boolean;
  readonly onAddSelected: () => void;
  /** Starts the initiative and combat (the scene knows the map's cells). */
  readonly onStart: () => void;
  readonly onCommand: (command: Command) => void;
  /** The campaign's player characters, for the quick entry of their rolls (T-111d). */
  readonly players: readonly PlayerCharacter[];
  readonly onPlayerRolls: (
    rolls: readonly {
      readonly playerId: string;
      readonly initiative: number;
    }[],
  ) => void;
  /** A free entry without a token, e.g. a lair action (T-111d). */
  readonly onAddEntry: (name: string, initiative: number) => void;
}) {
  const { t } = useTranslation();
  const order = initiative?.order ?? [];
  const byId = new Map(
    (initiative?.combatants ?? []).map((each) => [each.id, each]),
  );
  const round = initiative?.round ?? 0;
  const running = round > 0;
  const [form, setForm] = useState<"rolls" | "entry" | null>(null);
  const rollsButton = useRef<HTMLButtonElement>(null);
  const entryButton = useRef<HTMLButtonElement>(null);
  // Reordering by drag (T-111d): the row being dragged.
  const [dragged, setDragged] = useState<string | null>(null);
  return (
    <section className="dm-initiative" aria-label={t("initiative.label")}>
      <div className="dm-initiative-toolbar">
        <span className="dm-initiative-round">
          {running
            ? t("initiative.round", { round })
            : t("initiative.notStarted")}
        </span>
        <IconButton
          icon={<ListPlus />}
          label={t("initiative.addSelected")}
          disabled={busy || !canAddSelected}
          onClick={onAddSelected}
        />
        <span>
          <IconButton
            ref={rollsButton}
            icon={<Users />}
            label={t("initiative.playerRolls")}
            aria-expanded={form === "rolls"}
            disabled={busy}
            onClick={() => {
              setForm((current) => (current === "rolls" ? null : "rolls"));
            }}
          />
          <Popover
            open={form === "rolls"}
            onClose={() => {
              setForm(null);
            }}
            anchor={rollsButton}
            label={t("initiative.playerRolls")}
            align="start"
          >
            {form === "rolls" && (
              <PlayerRollsForm
                players={players}
                onEnter={(rolls) => {
                  onPlayerRolls(rolls);
                  setForm(null);
                  // Keyboard only: focus goes back to the button, not lost with the form.
                  rollsButton.current?.focus();
                }}
              />
            )}
          </Popover>
        </span>
        <span>
          <IconButton
            ref={entryButton}
            icon={<Plus />}
            label={t("initiative.newEntry")}
            aria-expanded={form === "entry"}
            disabled={busy}
            onClick={() => {
              setForm((current) => (current === "entry" ? null : "entry"));
            }}
          />
          <Popover
            open={form === "entry"}
            onClose={() => {
              setForm(null);
            }}
            anchor={entryButton}
            label={t("initiative.newEntry")}
            align="start"
          >
            {form === "entry" && (
              <FreeEntryForm
                onAdd={(name, value) => {
                  onAddEntry(name, value);
                  setForm(null);
                  entryButton.current?.focus();
                }}
              />
            )}
          </Popover>
        </span>
        {running ? (
          <IconButton
            icon={<SkipForward />}
            label={t("initiative.next")}
            disabled={busy}
            onClick={() => {
              onCommand({ type: "initiative.next" });
            }}
          />
        ) : (
          <IconButton
            icon={<Play />}
            label={t("initiative.start")}
            disabled={busy || order.length === 0 || !canStart}
            onClick={onStart}
          />
        )}
        <IconButton
          icon={<Square />}
          label={t("initiative.end")}
          disabled={busy || initiative === null}
          onClick={() => {
            onCommand({ type: "initiative.end" });
          }}
        />
      </div>
      {order.length === 0 ? (
        <p className="dm-initiative-empty">{t("initiative.empty")}</p>
      ) : (
        <ol className="dm-initiative-list">
          {order.map((id, index) => {
            const combatant = byId.get(id);
            if (!combatant) return null;
            const active = initiative?.activeCombatantId === id;
            const delayed = combatant.delayed === true;
            const ready = combatant.ready === true;
            const { name } = combatant;
            return (
              <li
                key={id}
                className="dm-initiative-row"
                aria-current={active ? "true" : undefined}
                data-delayed={delayed || undefined}
                // Dragged onto another row, it takes that row's place (the buttons do the same
                // by keyboard).
                draggable={!busy}
                data-dragging={dragged === id || undefined}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  // Some WebKit builds start no drag without data; a type of our own, so the id
                  // never drops into a text field.
                  event.dataTransfer.setData("application/x-dm-combatant", id);
                  setDragged(id);
                }}
                onDragOver={(event) => {
                  if (dragged !== null) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged !== null && dragged !== id)
                    onCommand({
                      type: "initiative.move",
                      combatantId: dragged,
                      index,
                    });
                  setDragged(null);
                }}
                onDragEnd={() => {
                  setDragged(null);
                }}
              >
                <InitiativeValue
                  name={name}
                  value={combatant.initiative}
                  disabled={busy}
                  onCommit={(value) => {
                    onCommand({
                      type: "initiative.setValue",
                      combatantId: id,
                      initiative: value,
                    });
                  }}
                />
                <span className="dm-initiative-name">{name}</span>
                {delayed && (
                  <span className="dm-initiative-marker">
                    {t("initiative.delayed")}
                  </span>
                )}
                {ready && (
                  <span className="dm-initiative-marker">
                    {t("initiative.ready")}
                  </span>
                )}
                <span className="dm-initiative-actions">
                  {active && running && (
                    <IconButton
                      icon={<Hourglass />}
                      label={t("initiative.delay", { name })}
                      disabled={busy}
                      onClick={() => {
                        onCommand({
                          type: "initiative.delay",
                          combatantId: id,
                        });
                      }}
                    />
                  )}
                  {delayed && running && (
                    <IconButton
                      icon={<Zap />}
                      label={t("initiative.actNow", { name })}
                      disabled={busy}
                      onClick={() => {
                        onCommand({
                          type: "initiative.actNow",
                          combatantId: id,
                        });
                      }}
                    />
                  )}
                  <IconButton
                    icon={<Hand />}
                    label={t("initiative.holdReady", { name })}
                    pressed={ready}
                    disabled={busy}
                    onClick={() => {
                      onCommand({
                        type: "initiative.ready",
                        combatantId: id,
                        ready: !ready,
                      });
                    }}
                  />
                  <IconButton
                    icon={<ArrowUp />}
                    label={t("initiative.up", { name })}
                    disabled={busy || index === 0}
                    onClick={() => {
                      onCommand({
                        type: "initiative.move",
                        combatantId: id,
                        index: index - 1,
                      });
                    }}
                  />
                  <IconButton
                    icon={<ArrowDown />}
                    label={t("initiative.down", { name })}
                    disabled={busy || index === order.length - 1}
                    onClick={() => {
                      onCommand({
                        type: "initiative.move",
                        combatantId: id,
                        index: index + 1,
                      });
                    }}
                  />
                  <IconButton
                    icon={<X />}
                    label={t("initiative.remove", { name })}
                    disabled={busy}
                    onClick={() => {
                      onCommand({ type: "initiative.remove", combatantId: id });
                    }}
                  />
                </span>
                <CombatantStatus
                  combatant={combatant}
                  busy={busy}
                  onCommand={onCommand}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * A combatant's initiative, changed in place: taken on Enter or when the field is left (not on
 * every key – "15" would place it twice); Escape and an empty field keep the old value.
 */
function InitiativeValue({
  name,
  value,
  disabled,
  onCommit,
}: {
  readonly name: string;
  readonly value: number;
  readonly disabled: boolean;
  readonly onCommit: (value: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = Number(draft);
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(next) && next !== value)
      onCommit(next);
  };
  return (
    <input
      type="number"
      className="dm-initiative-value"
      aria-label={t("initiative.value", { name })}
      value={draft ?? String(value)}
      disabled={disabled}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(null);
      }}
    />
  );
}
