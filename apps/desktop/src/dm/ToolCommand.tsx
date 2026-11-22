import { CommandPanel } from "@dungeon-manager/ui";
import { useContext, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CommandRegistryContext } from "./shell/command.js";
import { ShellPortal } from "./shell/slots.js";

/**
 * A ribbon tool's command panel over the map (ADR-0020): rendered while the command runs, one
 * at a time – opening another command cancels this one.
 */
export function ToolCommand({
  title,
  okDisabled,
  onOk,
  onCancel,
  children,
}: {
  readonly title: string;
  readonly okDisabled?: boolean | undefined;
  readonly onOk: () => void;
  readonly onCancel: () => void;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  const registry = useContext(CommandRegistryContext);
  const cancel = useRef(onCancel);
  const ok = useRef({ onOk, okDisabled });
  useEffect(() => {
    cancel.current = onCancel;
    ok.current = { onOk, okDisabled };
  });
  // Escape and Enter also reach the command while the DM works on the map (as in CAD
  // programs), unless the map used the key itself (e.g. to drop a box being dragged).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".map-view-canvas")
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        cancel.current();
      } else if (event.key === "Enter" && ok.current.okDisabled !== true) {
        event.preventDefault();
        ok.current.onOk();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  useEffect(
    () =>
      registry?.claim(() => {
        cancel.current();
      }),
    [registry],
  );
  return (
    <ShellPortal slot="command">
      <CommandPanel
        title={title}
        okLabel={t("command.ok")}
        cancelLabel={t("command.cancel")}
        moveLabel={t("command.move")}
        okDisabled={okDisabled}
        onOk={onOk}
        onCancel={onCancel}
      >
        {children}
      </CommandPanel>
    </ShellPortal>
  );
}
