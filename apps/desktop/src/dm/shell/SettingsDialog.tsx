import { Dialog } from "@dungeon-manager/ui";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";

/**
 * One category of the settings (T-155). Adding a category is one entry: an id, its
 * translated name and what it shows.
 */
export interface SettingsCategory {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

/**
 * The settings dialog (DM decision, T-155): categories on the left, their settings on the
 * right, for every global setting of this device. Categories are vertical tabs (arrow keys,
 * Home and End).
 */
export function SettingsDialog({
  open,
  onClose,
  returnFocus,
  categories,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly returnFocus: RefObject<HTMLElement | null>;
  readonly categories: readonly SettingsCategory[];
}) {
  const { t } = useTranslation();
  const idPrefix = useId();
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const current =
    categories.find((each) => each.id === active) ?? categories[0];

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = categories.findIndex((each) => each.id === current?.id);
    const target =
      event.key === "ArrowDown"
        ? categories[(index + 1) % categories.length]
        : event.key === "ArrowUp"
          ? categories[(index + categories.length - 1) % categories.length]
          : event.key === "Home"
            ? categories[0]
            : event.key === "End"
              ? categories.at(-1)
              : undefined;
    if (!target) return;
    event.preventDefault();
    setActive(target.id);
    tabs.current.get(target.id)?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("shell.settings")}
      closeLabel={t("shell.settingsClose")}
      returnFocus={returnFocus}
      className="dm-settings-dialog"
    >
      <div className="dm-settings-layout">
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t("shell.settingsCategories")}
          className="dm-settings-nav"
        >
          {categories.map((each) => (
            <button
              key={each.id}
              ref={(element) => {
                if (element) tabs.current.set(each.id, element);
                else tabs.current.delete(each.id);
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${each.id}`}
              aria-selected={each.id === current?.id}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={each.id === current?.id ? 0 : -1}
              className="dm-settings-tab"
              onClick={() => {
                setActive(each.id);
              }}
              onKeyDown={onKeyDown}
            >
              {each.label}
            </button>
          ))}
        </div>
        {current && (
          <section
            id={`${idPrefix}-panel`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${current.id}`}
            className="dm-settings-panel"
          >
            <h3 className="dm-settings-heading">{current.label}</h3>
            {current.content}
          </section>
        )}
      </div>
    </Dialog>
  );
}
