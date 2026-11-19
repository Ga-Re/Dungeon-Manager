import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";

/** A one-field form for naming something new (campaign, scene); keeps the name if creating failed. */
export function NameForm({
  label,
  submitLabel,
  onSubmit,
  focusOnMount = false,
}: {
  readonly label: string;
  readonly submitLabel: string;
  /** Resolves to whether creating succeeded (and the field may be cleared). */
  readonly onSubmit: (name: string) => Promise<boolean>;
  /** Put the keyboard into the field when the form appears (e.g. in a popover). */
  readonly focusOnMount?: boolean;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusOnMount) field.current?.focus();
  }, [focusOnMount]);

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === "" || busy) return;
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
      <button type="submit" disabled={busy || name.trim() === ""}>
        {submitLabel}
      </button>
    </form>
  );
}
