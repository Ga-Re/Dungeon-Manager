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
  className?: string | undefined;
  children: ReactNode;
}

/** Framed parchment panel that floats over the map (scene browser, data panel; ADR-0011). */
export function FloatingPanel({
  title,
  count,
  headerActions,
  className,
  children,
}: FloatingPanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <section
      className={["dm-panel", className ?? ""].filter(Boolean).join(" ")}
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
