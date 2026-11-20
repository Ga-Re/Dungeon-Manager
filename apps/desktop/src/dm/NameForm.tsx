import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";

/**
 * A one-field form for naming something (campaign, scene, level); keeps the name if saving failed.
 */
export function NameForm({
  label,
  submitLabel,
  onSubmit,
  focusOnMount = false,
  initial = "",
  disabled = false,
}: {
  /** E.g. while a file for the new thing is still being chosen. */
  readonly disabled?: boolean;
  readonly label: string;
  /** The name to start from, e.g. the current one when renaming. */
  readonly initial?: string;
  readonly submitLabel: string;
  /** Resolves to whether creating succeeded (and the field may be cleared). */
  readonly onSubmit: (name: string) => Promise<boolean>;
  /** Put the keyboard into the field when the form appears (e.g. in a popover). */
  readonly focusOnMount?: boolean;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusOnMount) field.current?.focus();
  }, [focusOnMount]);

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === "" || busy || disabled) return;
    setBusy(true);
    try {
      if (await onSubmit(name)) setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={field}
        id={inputId}
        value={name}
        maxLength={200}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <button type="submit" disabled={disabled || busy || name.trim() === ""}>
        {submitLabel}
      </button>
    </form>
  );
}
