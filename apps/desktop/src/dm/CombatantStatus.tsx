import type { Command } from "@dungeon-manager/core";
import { MAX_CONDITION_LEVEL, type Combatant } from "@dungeon-manager/schema";
import { IconButton, Popover } from "@dungeon-manager/ui";
import { Minus, Plus, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { useTranslation } from "react-i18next";

/** The 5e conditions offered when adding one (T-112b); their names come from i18n. */
export const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;

/** Conditions with a level (T-244): exhaustion, 1 to 6 in 5e. */
const LEVELLED: ReadonlySet<string> = new Set(["exhaustion"]);
const MAX_LEVEL = MAX_CONDITION_LEVEL;

/** A whole number typed into a field, or `null`. */
function wholeNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

/**
 * A combatant's HP and conditions in its Initiative row (T-112b): HP only here, never on the
 * map or the TV (DM decision 2026-11-21). Changes go out as commands; the scene decides.
 */
export function CombatantStatus({
  combatant,
  busy,
  onCommand,
}: {
  readonly combatant: Combatant;
  readonly busy: boolean;
  readonly onCommand: (command: Command) => void;
}) {
  const { t } = useTranslation();
  const { id, name, hp, conditions } = combatant;
  const [open, setOpen] = useState<"hp" | "condition" | null>(null);
  const hpButton = useRef<HTMLButtonElement>(null);
  const conditionButton = useRef<HTMLButtonElement>(null);
  const close = (back: HTMLButtonElement | null) => {
    setOpen(null);
    back?.focus();
  };
  const hpText = hp
    ? hp.temp > 0
      ? t("initiative.hp.withTemp", hp)
      : t("initiative.hp.value", hp)
    : t("initiative.hp.none");
  const conditionText = (condition: Combatant["conditions"][number]) => {
    const named =
      condition.level === undefined
        ? conditionName(condition.type)
        : t("initiative.conditionLevel", {
            name: conditionName(condition.type),
            level: condition.level,
          });
    return condition.remainingRounds === undefined
      ? named
      : t("initiative.conditionRounds", {
          name: named,
          rounds: condition.remainingRounds,
        });
  };
  const conditionName = (type: string) =>
    (CONDITIONS as readonly string[]).includes(type)
      ? t(`initiative.conditions.${type as (typeof CONDITIONS)[number]}`)
      : type;
  return (
    <div className="dm-initiative-status">
      <button
        ref={hpButton}
        type="button"
        className="dm-initiative-hp"
        // The name says what the button shows, so screen readers and voice control get the HP.
        aria-label={t("initiative.hp.labelWithValue", { name, value: hpText })}
        aria-expanded={open === "hp"}
        disabled={busy}
        onClick={() => {
          setOpen((current) => (current === "hp" ? null : "hp"));
        }}
      >
        {hpText}
      </button>
      <Popover
        open={open === "hp"}
        onClose={() => {
          setOpen(null);
        }}
        anchor={hpButton}
        label={t("initiative.hp.label", { name })}
        align="start"
      >
        {open === "hp" && (
          <HpForm
            hp={hp}
            onCommand={(command) => {
              onCommand(command);
              close(hpButton.current);
            }}
            combatantId={id}
          />
        )}
      </Popover>
      {conditions.length > 0 && (
        <ul className="dm-initiative-conditions">
          {conditions.map((condition, index) => (
            <li
              key={`${condition.type}-${String(index)}`}
              className="dm-initiative-condition"
            >
              {conditionText(condition)}
              {/* Exhaustion's level (T-244): one step up or down; below 1 it goes. */}
              {LEVELLED.has(condition.type) && (
                <>
                  <IconButton
                    icon={<Minus />}
                    label={t("initiative.levelDown", {
                      condition: conditionName(condition.type),
                      name,
                    })}
                    disabled={busy}
                    onClick={() => {
                      // An exhaustion from before levels counts as level 1.
                      const level = condition.level ?? 1;
                      onCommand(
                        level <= 1
                          ? {
                              type: "condition.remove",
                              combatantId: id,
                              conditionType: condition.type,
                            }
                          : {
                              type: "condition.add",
                              combatantId: id,
                              condition: { ...condition, level: level - 1 },
                            },
                      );
                    }}
                  />
                  <IconButton
                    icon={<Plus />}
                    label={t("initiative.levelUp", {
                      condition: conditionName(condition.type),
                      name,
                    })}
                    disabled={busy || (condition.level ?? 1) >= MAX_LEVEL}
                    onClick={() => {
                      onCommand({
                        type: "condition.add",
                        combatantId: id,
                        condition: {
                          ...condition,
                          level: (condition.level ?? 1) + 1,
                        },
                      });
                    }}
                  />
                </>
              )}
              <IconButton
                icon={<X />}
                label={t("initiative.removeCondition", {
                  condition: conditionName(condition.type),
                  name,
                })}
                disabled={busy}
                onClick={() => {
                  onCommand({
                    type: "condition.remove",
                    combatantId: id,
                    conditionType: condition.type,
                  });
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <IconButton
        ref={conditionButton}
        icon={<Plus />}
        label={t("initiative.addCondition", { name })}
        aria-expanded={open === "condition"}
        disabled={busy}
        onClick={() => {
          setOpen((current) => (current === "condition" ? null : "condition"));
        }}
      />
      <Popover
        open={open === "condition"}
        onClose={() => {
          setOpen(null);
        }}
        anchor={conditionButton}
        label={t("initiative.addCondition", { name })}
        align="start"
      >
        {open === "condition" && (
          <ConditionForm
            conditionName={conditionName}
            onAdd={(type, rounds, level) => {
              onCommand({
                type: "condition.add",
                combatantId: id,
                condition: {
                  type,
                  ...(rounds !== null && { remainingRounds: rounds }),
                  ...(level !== null && { level }),
                },
              });
              close(conditionButton.current);
            }}
          />
        )}
      </Popover>
    </div>
  );
}

/**
 * HP in place (T-112b): damage or healing by an amount, temporary HP, and the current and
 * maximum HP (which start tracking a combatant without them). The first field has the focus.
 */
function HpForm({
  hp,
  combatantId,
  onCommand,
}: {
  readonly hp: Combatant["hp"];
  readonly combatantId: string;
  readonly onCommand: (command: Command) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const first = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [temp, setTemp] = useState(hp ? String(hp.temp) : "0");
  const [current, setCurrent] = useState(hp ? String(hp.current) : "");
  const [max, setMax] = useState(hp ? String(hp.max) : "");
  useEffect(() => {
    first.current?.focus();
  }, []);
  const change = (sign: 1 | -1) => {
    const value = wholeNumber(amount);
    if (value === null || value <= 0) return;
    onCommand({ type: "hp.change", combatantId, amount: sign * value });
  };
  const setTempHp = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = wholeNumber(temp);
    if (value !== null && value >= 0)
      onCommand({ type: "hp.setTemp", combatantId, temp: value });
  };
  const setHp = (event: SyntheticEvent) => {
    event.preventDefault();
    const nextCurrent = wholeNumber(current);
    const nextMax = wholeNumber(max);
    // As core: whole numbers, at least 0 current and 1 maximum.
    if (
      nextCurrent === null ||
      nextMax === null ||
      nextCurrent < 0 ||
      nextMax < 1
    )
      return;
    onCommand({
      type: "hp.set",
      combatantId,
      current: nextCurrent,
      max: nextMax,
    });
  };
  const field = (
    key: string,
    label: string,
    value: string,
    onChange: (text: string) => void,
    min: number,
    focus = false,
  ): ReactNode => (
    <label htmlFor={`${id}-${key}`}>
      {label}
      <input
        ref={focus ? first : undefined}
        id={`${id}-${key}`}
        type="number"
        min={min}
        step={1}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
  return (
    <div className="dm-initiative-hp-form">
      {hp && (
        <>
          <div className="dm-initiative-form">
            {field(
              "amount",
              t("initiative.hp.amount"),
              amount,
              setAmount,
              1,
              true,
            )}
            <p className="dm-settings-hint">{t("initiative.hp.amountHint")}</p>
            <div className="dm-initiative-form-actions">
              <button
                type="button"
                onClick={() => {
                  change(-1);
                }}
              >
                {t("initiative.hp.damage")}
              </button>
              <button
                type="button"
                onClick={() => {
                  change(1);
                }}
              >
                {t("initiative.hp.heal")}
              </button>
            </div>
          </div>
          <form className="dm-initiative-form" onSubmit={setTempHp}>
            {field("temp", t("initiative.hp.temp"), temp, setTemp, 0)}
            <button type="submit">{t("initiative.hp.setTemp")}</button>
          </form>
        </>
      )}
      <form className="dm-initiative-form" onSubmit={setHp}>
        {field(
          "current",
          t("initiative.hp.current"),
          current,
          setCurrent,
          0,
          !hp,
        )}
        {field("max", t("initiative.hp.max"), max, setMax, 1)}
        <button type="submit">
          {hp ? t("initiative.hp.correct") : t("initiative.hp.track")}
        </button>
      </form>
    </div>
  );
}

/** A condition to add (T-112b): one of the 5e conditions, optionally for a number of rounds. */
function ConditionForm({
  conditionName,
  onAdd,
}: {
  readonly conditionName: (type: string) => string;
  readonly onAdd: (
    type: string,
    rounds: number | null,
    level: number | null,
  ) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [type, setType] = useState<string>(CONDITIONS[0]);
  const [rounds, setRounds] = useState("");
  const [level, setLevel] = useState(1);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    select.current?.focus();
  }, []);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = wholeNumber(rounds);
    if (rounds.trim() !== "" && (value === null || value <= 0)) return;
    onAdd(type, value, LEVELLED.has(type) ? level : null);
  };
  return (
    <form className="dm-initiative-form" onSubmit={submit}>
      <label htmlFor={`${id}-type`}>
        {t("initiative.condition")}
        <select
          ref={select}
          id={`${id}-type`}
          value={type}
          onChange={(event) => {
            setType(event.target.value);
          }}
        >
          {CONDITIONS.map((each) => (
            <option key={each} value={each}>
              {conditionName(each)}
            </option>
          ))}
        </select>
      </label>
      {LEVELLED.has(type) && (
        <label htmlFor={`${id}-level`}>
          {t("initiative.level")}
          <select
            id={`${id}-level`}
            value={level}
            onChange={(event) => {
              setLevel(Number(event.target.value));
            }}
          >
            {Array.from({ length: MAX_LEVEL }, (_, index) => index + 1).map(
              (each) => (
                <option key={each} value={each}>
                  {each}
                </option>
              ),
            )}
          </select>
        </label>
      )}
      <label htmlFor={`${id}-rounds`}>
        {t("initiative.rounds")}
        <input
          id={`${id}-rounds`}
          type="number"
          min={1}
          value={rounds}
          onChange={(event) => {
            setRounds(event.target.value);
          }}
        />
      </label>
      <p className="dm-settings-hint">{t("initiative.roundsHint")}</p>
      <button type="submit">{t("initiative.addConditionButton")}</button>
    </form>
  );
}
