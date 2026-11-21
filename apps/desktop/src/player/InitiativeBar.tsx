import type { ViewerScene } from "@dungeon-manager/schema";
import { useTranslation } from "react-i18next";

/**
 * The initiative on the TV (T-111c): the round and the order the players may see (the
 * projection leaves out hidden combatants and names), the active one marked. It lies along the
 * players' top edge and turns with the TV's view.
 */
export function InitiativeBar({
  initiative,
  rotation,
}: {
  readonly initiative: NonNullable<ViewerScene["initiative"]>;
  readonly rotation: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="player-initiative-frame" data-rotation={rotation}>
      <section
        className="player-initiative"
        aria-label={t("player.initiative.label")}
      >
        <span className="player-initiative-round">
          {t("player.initiative.round", { round: initiative.round })}
        </span>
        <ol className="player-initiative-list">
          {initiative.combatants.map((combatant) => (
            <li
              key={combatant.id}
              className="player-initiative-entry"
              aria-current={
                combatant.id === initiative.activeCombatantId
                  ? "true"
                  : undefined
              }
            >
              {combatant.name ?? t("player.initiative.unknown")}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
