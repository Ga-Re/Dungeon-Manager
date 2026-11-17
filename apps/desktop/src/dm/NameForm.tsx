import { useId, useState, type SyntheticEvent } from "react";

/** A one-field form for naming something new (campaign, scene); clears itself on success. */
export function NameForm({
  label,
  submitLabel,
  onSubmit,
}: {
  readonly label: string;
  readonly submitLabel: string;
  readonly onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === "" || busy) return;
    setBusy(true);
    try {
      await onSubmit(name);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor={inputId}>{label}</label>
      <input
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
