import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
  /** Longer text below the facts, e.g. why a note cannot be shown (T-161b). */
  readonly body?: string;
  /** Rich content below the facts, e.g. a rendered note (T-163); wins over `body`. */
  readonly content?: ReactNode;
}

/**
 * The details panel (DM request, T-159): the facts of what is selected in the browser, in the
 * Eigenschaften panel (T-172a). Read-only for now; editing moves in as features need it.
 */
export function DetailsPanel({
  details,
  selected,
}: {
  readonly details: Details | null;
  /** Something is selected, even if it has no facts to show (a group, say). */
  readonly selected: boolean;
}) {
  const { t } = useTranslation();
  return (
    // The Eigenschaften panel names the region (its tab, T-172a).
    <div className="dm-details-body-wrap">
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
          {details.content ??
            (details.body !== undefined && (
              <pre className="dm-details-body">{details.body}</pre>
            ))}
        </>
      ) : (
        <p className="dm-details-empty">
          {selected ? t("shell.details.nothing") : t("shell.details.empty")}
        </p>
      )}
    </div>
  );
}
