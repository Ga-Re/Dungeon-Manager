import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

/** Puts the keyboard into a popover's first control when it appears. */
function useFocusOnMount<T extends HTMLElement>() {
  const element = useRef<T>(null);
  useEffect(() => {
    element.current?.focus();
  }, []);
  return element;
}

/**
 * Name and optional date of a session, for "Neue Session" and "Session bearbeiten" (T-160b).
 * Keeps the input and shows the reason when saving fails.
 */
export function SessionForm({
  initialName = "",
  initialDate = "",
  submitLabel,
  onSubmit,
}: {
  readonly initialName?: string;
  readonly initialDate?: string;
  readonly submitLabel: string;
  /** Resolves to `null` once saved (the popover then closes), else why not. */
  readonly onSubmit: (
    name: string,
    date: string | undefined,
  ) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const dateId = useId();
  const field = useFocusOnMount<HTMLInputElement>();
  const [name, setName] = useState(initialName);
  const [date, setDate] = useState(initialDate);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (name.trim() === "" || busy) return;
    setBusy(true);
    try {
      setProblem((await onSubmit(name, date === "" ? undefined : date)) ?? "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="dm-new-scene" onSubmit={(event) => void submit(event)}>
      <label htmlFor={nameId}>{t("campaign.sessionName")}</label>
      <input
        ref={field}
        id={nameId}
        value={name}
        maxLength={200}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <label htmlFor={dateId}>{t("campaign.sessionDate")}</label>
      <input
        id={dateId}
        type="date"
        value={date}
        onChange={(event) => {
          setDate(event.target.value);
        }}
      />
      <div className="dm-popover-actions">
        <button type="submit" disabled={busy || name.trim() === ""}>
          {submitLabel}
        </button>
      </div>
      {problem && <p role="alert">{problem}</p>}
    </form>
  );
}

/** Picks a session to add a scene to (T-160b). */
export function AddToSessionForm({
  sessions,
  onSubmit,
}: {
  /** Sessions the scene is not in yet, as `[id, name]`. */
  readonly sessions: readonly (readonly [string, string])[];
  readonly onSubmit: (sessionId: string) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const selectId = useId();
  const field = useFocusOnMount<HTMLSelectElement>();
  const [sessionId, setSessionId] = useState(sessions[0]?.[0] ?? "");
  const [problem, setProblem] = useState("");

  return (
    <form
      className="dm-new-scene"
      onSubmit={(event) => {
        event.preventDefault();
        if (sessionId === "") return;
        void onSubmit(sessionId).then((result) => {
          setProblem(result ?? "");
        });
      }}
    >
      <label htmlFor={selectId}>{t("campaign.chooseSession")}</label>
      <select
        ref={field}
        id={selectId}
        value={sessionId}
        onChange={(event) => {
          setSessionId(event.target.value);
        }}
      >
        {sessions.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <div className="dm-popover-actions">
        <button type="submit">{t("campaign.addToSessionConfirm")}</button>
      </div>
      {problem && <p role="alert">{problem}</p>}
    </form>
  );
}

/** "Session löschen?" with the scenes staying (T-160b). */
export function ConfirmForm({
  question,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  readonly question: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => Promise<void>;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useFocusOnMount<HTMLButtonElement>();
  // A double click must not run the command twice.
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p>{question}</p>
      <div className="dm-popover-actions">
        <button
          ref={confirm}
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm().finally(() => {
              setBusy(false);
            });
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          {t("campaign.cancel")}
        </button>
      </div>
    </div>
  );
}

/** A path to an existing `.md` in the campaign folder, to link as a note (T-161b). */
export function LinkNoteForm({
  onSubmit,
}: {
  /** Resolves to `null` once linked (the popover then closes), else why not. */
  readonly onSubmit: (path: string) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const field = useFocusOnMount<HTMLInputElement>();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (path.trim() === "" || busy) return;
    setBusy(true);
    try {
      setProblem((await onSubmit(path.trim())) ?? "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="dm-new-scene" onSubmit={(event) => void submit(event)}>
      <label htmlFor={inputId}>{t("campaign.notePath")}</label>
      <input
        ref={field}
        id={inputId}
        value={path}
        aria-describedby={hintId}
        placeholder="wiki/NSCs/Strahd.md"
        onChange={(event) => {
          setPath(event.target.value);
        }}
      />
      <p id={hintId}>{t("campaign.notePathHint")}</p>
      <div className="dm-popover-actions">
        <button type="submit" disabled={busy || path.trim() === ""}>
          {t("campaign.linkNoteConfirm")}
        </button>
      </div>
      {problem && <p role="alert">{problem}</p>}
    </form>
  );
}
