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
  useEffect(() => {
    cancel.current = onCancel;
  });
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
