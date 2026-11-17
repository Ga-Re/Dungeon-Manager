import { useTranslation } from "react-i18next";

/** Player window (table TV): fullscreen and without controls (SPEC 2.2). The map comes later. */
export function PlayerApp() {
  const { t } = useTranslation();
  return (
    <main
      id="player-view"
      className="player"
      aria-label={t("player.windowTitle")}
    />
  );
}
