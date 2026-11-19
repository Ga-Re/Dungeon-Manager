import type { Level } from "@dungeon-manager/schema";
import { IconButton, Menu, RibbonGroup } from "@dungeon-manager/ui";
import { Tv } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The level the DM works on and the one the TV shows (T-118c), kept apart (DM decision,
 * 2026-11-20): the DM can prepare a level's fog in secret and show it when the group gets there.
 * Only for maps with more than one level.
 */
export function LevelGroup({
  levels,
  working,
  onTv,
  disabled,
  onWork,
  onShow,
}: {
  readonly levels: readonly Level[];
  /** The level the DM works on (fog tools, map image). */
  readonly working: string;
  /** The level on the TV. */
  readonly onTv: string;
  readonly disabled: boolean;
  readonly onWork: (levelId: string) => void;
  /** Shows the working level on the TV (and releases it to the players). */
  readonly onShow: () => void;
}) {
  const { t } = useTranslation();
  const nameOf = (id: string) =>
    levels.find((level) => level.id === id)?.name ?? "";
  return (
    <RibbonGroup caption={t("level.group")}>
      <Menu
        label={nameOf(working)}
        menuLabel={t("level.pick")}
        items={levels.map((level) => ({
          id: level.id,
          label: level.name,
          checked: level.id === working,
          ...(level.id === onTv && { icon: <Tv /> }),
        }))}
        onSelect={onWork}
      />
      <IconButton
        showLabel
        icon={<Tv />}
        label={t("level.showOnTv")}
        disabled={disabled || working === onTv}
        onClick={onShow}
      />
      <p className="dm-ribbon-meta">
        {t("level.onTv", { name: nameOf(onTv) })}
      </p>
    </RibbonGroup>
  );
}
