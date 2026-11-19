import { HudPanel } from "@dungeon-manager/ui";
import { useTranslation } from "react-i18next";
import { useHudPlacement } from "./shell/hud-layout.js";

/** One fact of the inspected item; `mono` shows file names and values in the monospace face. */
export interface DetailRow {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}

/** What the details panel shows: a kind ("Szene"), the item's name and its facts. */
export interface Details {
  readonly kind: string;
  readonly name: string;
  readonly rows: readonly DetailRow[];
}

/**
 * Far right of the map area: the panel's display clamp puts it at the right edge until the DM
 * moves it (T-159).
 */
const DETAILS_DEFAULT = {
  x: Number.MAX_SAFE_INTEGER,
  y: 12,
  collapsed: false,
};

/**
 * The details panel (DM request, T-159): the facts of what is selected in the browser, as a
 * tool window on the right of the map area that folds and moves like the browser. Read-only for
 * now; editing moves in as features need it.
 */
export function DetailsPanel({
  details,
}: {
  readonly details: Details | null;
}) {
  const { t } = useTranslation();
  const [placement, setPlacement] = useHudPlacement("details", DETAILS_DEFAULT);
  return (
    <HudPanel
      title={t("shell.details.title")}
      labels={{ move: t("shell.details.move"), fold: t("shell.details.fold") }}
      placement={placement}
      onPlacementChange={setPlacement}
      className="dm-details-panel"
    >
      {details ? (
        <>
          <p className="dm-details-heading">
            <span className="dm-details-kind">{details.kind}</span>
            {details.name}
          </p>
          <dl className="dm-details-rows">
            {details.rows.map((row) => (
              <div key={row.label} className="dm-details-row">
                <dt>{row.label}</dt>
                <dd className={row.mono ? "dm-details-mono" : undefined}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="dm-details-empty">{t("shell.details.empty")}</p>
      )}
    </HudPanel>
  );
}
