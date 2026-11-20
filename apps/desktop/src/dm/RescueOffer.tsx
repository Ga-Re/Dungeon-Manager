import { useTranslation } from "react-i18next";
import type { RescueCopy } from "./rescue-copies.js";

/**
 * The scenes of the open campaign whose changes could not be saved last time (T-114b): the DM
 * restores them (they are written to the library) or discards them.
 */
export function RescueOffer({
  copies,
  onRestore,
  onDiscard,
}: {
  readonly copies: readonly RescueCopy[];
  readonly onRestore: (copy: RescueCopy) => void;
  readonly onDiscard: (copy: RescueCopy) => void;
}) {
  const { t, i18n } = useTranslation();
  if (copies.length === 0) return null;
  return (
    // A region with one status sentence; the controls are not inside a live region.
    <section
      className="dm-rescue-offer"
      aria-label={t("campaign.rescue.label")}
    >
      <p role="status">
        {t("campaign.rescue.summary", { count: copies.length })}
      </p>
      <ul>
        {copies.map((copy) => {
          const name = copy.scene.name;
          return (
            <li key={copy.scene.id}>
              <span>
                {t("campaign.rescue.found", {
                  name,
                  time: new Date(copy.savedAt).toLocaleString(i18n.language, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                })}
              </span>
              <button
                type="button"
                aria-label={t("campaign.rescue.restoreNamed", { name })}
                onClick={() => {
                  onRestore(copy);
                }}
              >
                {t("campaign.rescue.restore")}
              </button>
              <button
                type="button"
                aria-label={t("campaign.rescue.discardNamed", { name })}
                onClick={() => {
                  onDiscard(copy);
                }}
              >
                {t("campaign.rescue.discard")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
