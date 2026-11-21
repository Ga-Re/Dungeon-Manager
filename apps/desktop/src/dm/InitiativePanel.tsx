import type { Command } from "@dungeon-manager/core";
import type { InitiativeState } from "@dungeon-manager/schema";
import { IconButton } from "@dungeon-manager/ui";
import {
  ArrowDown,
  ArrowUp,
  Hand,
  Hourglass,
  ListPlus,
  Play,
  SkipForward,
  Square,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The open scene's initiative in the "Initiative" panel (T-111b): round and order with the
 * active turn, and the tracker's actions. It only sends commands; the scene decides.
 */
export function InitiativePanel({
  initiative,
  canAddSelected,
  busy,
  onAddSelected,
  onStart,
  onCommand,
}: {
  readonly initiative: InitiativeState | null;
  /** Selected tokens that are not in the initiative yet. */
  readonly canAddSelected: boolean;
  readonly busy: boolean;
  readonly onAddSelected: () => void;
  /** Starts the initiative and combat (the scene knows the map's cells). */
  readonly onStart: () => void;
  readonly onCommand: (command: Command) => void;
}) {
  const { t } = useTranslation();
  const order = initiative?.order ?? [];
  const byId = new Map(
    (initiative?.combatants ?? []).map((each) => [each.id, each]),
  );
  const round = initiative?.round ?? 0;
  const running = round > 0;
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
            disabled={busy || order.length === 0}
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
