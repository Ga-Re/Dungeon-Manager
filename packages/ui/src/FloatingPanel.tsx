import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Props of {@link FloatingPanel}. */
export interface FloatingPanelProps {
  /** Translated panel title; also names the region. */
  title: string;
  /** Number of items, shown as a translated badge ("9 Objekte"). */
  count?: number | undefined;
  /** Controls at the right end of the header. */
  headerActions?: ReactNode;
  /** Small, tool-window header (scene browser) instead of the heading-style one. */
  compact?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/** Framed panel that floats over the map (scene browser; ADR-0011, ADR-0015). */
export function FloatingPanel({
  title,
  count,
  headerActions,
  compact = false,
  className,
  children,
}: FloatingPanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <section
      className={[
        "dm-panel",
        compact ? "dm-panel-compact" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
    >
      <header className="dm-panel-head">
        <h2 id={headingId} className="dm-panel-title">
          {title}
        </h2>
        {count !== undefined && (
          <span className="dm-panel-count">
            {t("ui.panel.itemCount", { count })}
          </span>
        )}
        {headerActions}
      </header>
      <div className="dm-panel-body">{children}</div>
    </section>
  );
}
