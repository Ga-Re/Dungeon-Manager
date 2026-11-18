import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Props of {@link IconButton}. */
export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> {
  /** The icon (decorative; the button is named by `label`). */
  icon: ReactNode;
  /** Translated, user-visible name of the action. */
  label: string;
  /** Show the label under the icon (ribbon tools); otherwise it is the tooltip and accessible name. */
  showLabel?: boolean;
  /** For toggle tools: whether the tool is active. Leave out for plain actions. */
  pressed?: boolean;
}

/** Button with an icon, used in the ribbon, title bar and dock (ADR-0011). */
export function IconButton({
  icon,
  label,
  showLabel = false,
  pressed,
  className,
  ...rest
}: IconButtonProps) {
  const classes = [
    "dm-icon-button",
    showLabel ? "dm-icon-button-labelled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      {...rest}
      type="button"
      className={classes}
      aria-pressed={pressed}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : label}
    >
      <span className="dm-icon-button-icon" aria-hidden="true">
        {icon}
      </span>
      {showLabel && <span className="dm-icon-button-label">{label}</span>}
    </button>
  );
}
