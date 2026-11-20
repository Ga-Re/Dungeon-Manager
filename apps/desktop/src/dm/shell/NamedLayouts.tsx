import { Dialog } from "@dungeon-manager/ui";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { NameForm } from "../NameForm.js";
import {
  LAYOUT_NAME_MAX_LENGTH,
  layoutNameProblem,
  type NamedLayout,
} from "./named-layouts.js";

// Named layouts in the window (T-172c): managed in the settings' panel category, saved from the
// View menu too.

/** The form saving the current layout under a name; tells why a name cannot be used. */
function SaveForm({
  layouts,
  onSave,
  focusOnMount = false,
}: {
  readonly layouts: readonly NamedLayout[];
  /** `name` passed the checks: a new one, or one to replace. */
  readonly onSave: (name: string) => void;
  readonly focusOnMount?: boolean;
}) {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <NameForm
        focusOnMount={focusOnMount}
        label={t("shell.namedLayouts.name")}
        submitLabel={t("shell.namedLayouts.save")}
        onSubmit={(name) => {
          const found = layoutNameProblem(layouts, name);
          setProblem(
            found &&
              t(`shell.namedLayouts.problem.${found}`, {
                max: LAYOUT_NAME_MAX_LENGTH,
              }),
          );
          if (found === null) onSave(name);
          return Promise.resolve(found === null);
        }}
      />
      {problem !== null && <p role="alert">{problem}</p>}
    </>
  );
}

/** "Layout speichern …" of the View menu: the name, in a dialog. */
export function SaveLayoutDialog({
  open,
  onClose,
  returnFocus,
  layouts,
  onSave,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly returnFocus?: RefObject<HTMLElement | null> | undefined;
  readonly layouts: readonly NamedLayout[];
  readonly onSave: (name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("shell.namedLayouts.dialogTitle")}
      closeLabel={t("shell.namedLayouts.close")}
      returnFocus={returnFocus}
      className="dm-save-layout-dialog"
    >
      {open && (
        <SaveForm
          focusOnMount
          layouts={layouts}
          onSave={(name) => {
            onSave(name);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}

/** One saved layout: apply, rename (in place) or delete it. */
function LayoutRow({
  entry,
  layouts,
  onApply,
  onRename,
  onRemove,
}: {
  readonly entry: NamedLayout;
  readonly layouts: readonly NamedLayout[];
  readonly onApply: () => void;
  readonly onRename: (name: string) => void;
  readonly onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Once renamed (the form goes away), the keyboard stays on this row.
  const renameButton = useRef<HTMLButtonElement>(null);
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (!renaming && wasRenaming.current) renameButton.current?.focus();
    wasRenaming.current = renaming;
  }, [renaming]);
  if (renaming)
    return (
      <li className="dm-named-layout">
        <NameForm
          focusOnMount
          initial={entry.name}
          label={t("shell.namedLayouts.name")}
          submitLabel={t("shell.namedLayouts.renameConfirm")}
          onSubmit={(name) => {
            const found = layoutNameProblem(layouts, name, entry.id);
            setProblem(
              found &&
                t(`shell.namedLayouts.problem.${found}`, {
                  max: LAYOUT_NAME_MAX_LENGTH,
                }),
            );
            if (found === null) {
              onRename(name);
              setRenaming(false);
            }
            return Promise.resolve(found === null);
          }}
        />
        {/* Escape closes the whole settings dialog; this ends renaming only. */}
        <button
          type="button"
          onClick={() => {
            setProblem(null);
            setRenaming(false);
          }}
        >
          {t("shell.namedLayouts.cancel")}
        </button>
        {problem !== null && <p role="alert">{problem}</p>}
      </li>
    );
  const name = entry.name;
  return (
    <li className="dm-named-layout">
      <span className="dm-named-layout-name">{name}</span>
      <button
        type="button"
        aria-label={t("shell.namedLayouts.applyNamed", { name })}
        onClick={onApply}
      >
        {t("shell.namedLayouts.apply")}
      </button>
      <button
        ref={renameButton}
        type="button"
        aria-label={t("shell.namedLayouts.renameNamed", { name })}
        onClick={() => {
          setRenaming(true);
        }}
      >
        {t("shell.namedLayouts.rename")}
      </button>
      <button
        type="button"
        aria-label={t("shell.namedLayouts.removeNamed", { name })}
        onClick={onRemove}
      >
        {t("shell.namedLayouts.remove")}
      </button>
    </li>
  );
}

/** The saved layouts of the current workspace, for the settings' panel category. */
export function NamedLayoutSettings({
  workspaceName,
  layouts,
  onSave,
  onApply,
  onRename,
  onRemove,
}: {
  /** Translated name of the workspace the layouts belong to. */
  readonly workspaceName: string;
  readonly layouts: readonly NamedLayout[];
  readonly onSave: (name: string) => void;
  readonly onApply: (id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const group = useRef<HTMLFieldSetElement>(null);
  return (
    <fieldset ref={group} className="dm-settings-group">
      <legend>{t("shell.namedLayouts.label")}</legend>
      <p className="dm-settings-hint">
        {t("shell.namedLayouts.hint", { workspace: workspaceName })}
      </p>
      {layouts.length === 0 ? (
        <p>{t("shell.namedLayouts.none")}</p>
      ) : (
        <ul className="dm-named-layouts">
          {layouts.map((entry) => (
            <LayoutRow
              key={entry.id}
              entry={entry}
              layouts={layouts}
              onApply={() => {
                onApply(entry.id);
              }}
              onRename={(name) => {
                onRename(entry.id, name);
              }}
              onRemove={() => {
                onRemove(entry.id);
                // Its row is gone: the keyboard goes on to the name field for saving.
                requestAnimationFrame(() => {
                  // The save form is the group's last field.
                  [...(group.current?.querySelectorAll("input") ?? [])]
                    .at(-1)
                    ?.focus();
                });
              }}
            />
          ))}
        </ul>
      )}
      <p className="dm-settings-hint">{t("shell.namedLayouts.saveAs")}</p>
      <SaveForm layouts={layouts} onSave={onSave} />
    </fieldset>
  );
}
