import { Dialog } from "@dungeon-manager/ui";
import { BookOpen, FolderOpen, FolderPlus, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { NameForm } from "./NameForm.js";

/** A recently edited campaign as the welcome dialog shows it. */
export interface WelcomeRecent {
  readonly slug: string;
  readonly name: string;
  readonly sceneName: string | null;
  readonly openedAt: string;
  /** Why it cannot be opened now, if it cannot. */
  readonly problem: "missing" | "notAvailable" | "invalid" | null;
}

/** What the library looks like, as far as the welcome dialog needs it. */
export type WelcomeLibrary =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "open";
      readonly root: string;
      readonly recent: readonly WelcomeRecent[];
      /** Readable campaigns that are not in `recent`. */
      readonly others: readonly {
        readonly slug: string;
        readonly name: string;
      }[];
    };

type View = "start" | "new" | "other";

/**
 * The welcome dialog on every start (T-153, like Inkscape or Illustrator): the recently edited
 * campaigns of this device, a new or another campaign and the library folder. On the very first
 * start it asks for the library folder, in an empty library for the first campaign. Closing it
 * leaves the window empty.
 */
export function WelcomeDialog({
  open,
  onClose,
  returnFocus,
  library,
  choosing,
  notice,
  onChooseFolder,
  onOpen,
  onForget,
  onCreate,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Gets focus back when the dialog closes (the browser's campaign menu). */
  readonly returnFocus: RefObject<HTMLElement | null>;
  readonly library: WelcomeLibrary;
  /** The folder dialog is open. */
  readonly choosing: boolean;
  /** The library's latest message, e.g. why creating a campaign failed. */
  readonly notice: string;
  readonly onChooseFolder: () => void;
  readonly onOpen: (slug: string) => void;
  /** Removes a campaign from the recent list. */
  readonly onForget: (slug: string) => void;
  /** Resolves to whether creating succeeded. */
  readonly onCreate: (name: string) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>("start");
  const firstAction = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mainArea = useRef<HTMLDivElement>(null);
  const shown = useRef({ view, status: library.status });

  // The library being read, or opening after the first start, puts the keyboard on the first
  // action; a new view on its heading, so screen readers announce it. Either way not when a
  // field in it already took focus.
  useEffect(() => {
    const previous = shown.current;
    shown.current = { view, status: library.status };
    if (previous.view === view && previous.status === library.status) return;
    if (mainArea.current?.contains(document.activeElement)) return;
    const target =
      previous.status !== library.status
        ? (firstAction.current ?? heading.current)
        : heading.current;
    target?.focus();
  }, [view, library.status]);
  const show = (next: View) => {
    setView(next);
  };

  const openDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const back = (
    <button
      type="button"
      className="dm-welcome-back"
      onClick={() => {
        show("start");
      }}
    >
      {t("welcome.back")}
    </button>
  );

  const campaignButton = (
    slug: string,
    name: string,
    meta: string | null,
    first: boolean,
  ) => (
    <button
      type="button"
      ref={first ? firstAction : undefined}
      className="dm-welcome-campaign"
      onClick={() => {
        onOpen(slug);
      }}
    >
      <BookOpen aria-hidden="true" />
      <span className="dm-welcome-campaign-text">
        <span className="dm-welcome-campaign-name">{name}</span>
        {meta && <span className="dm-welcome-meta">{meta}</span>}
      </span>
    </button>
  );

  const main = () => {
    if (library.status === "loading") return <p>{t("library.loading")}</p>;
    if (library.status === "none" || library.status === "error")
      return (
        <>
          <h3 ref={heading} tabIndex={-1} className="dm-welcome-heading">
            {t("welcome.heading")}
          </h3>
          <p>{t("welcome.intro")}</p>
          {library.status === "error" && <p role="alert">{library.message}</p>}
          <button
            type="button"
            ref={firstAction}
            className="dm-welcome-primary"
            disabled={choosing}
            onClick={onChooseFolder}
          >
            <FolderOpen aria-hidden="true" />
            {t("library.choose")}
          </button>
        </>
      );
    const empty = library.recent.length === 0 && library.others.length === 0;
    if (view === "new" || empty)
      return (
        <>
          <h3 ref={heading} tabIndex={-1} className="dm-welcome-heading">
            {empty ? t("welcome.firstCampaign") : t("welcome.newCampaign")}
          </h3>
          {empty && <p>{t("welcome.firstCampaignHint")}</p>}
          <NameForm
            label={t("library.newCampaignName")}
            submitLabel={t("library.createCampaign")}
            onSubmit={onCreate}
            focusOnMount
          />
          <p role="status" className="dm-welcome-notice">
            {notice}
          </p>
          {!empty && back}
        </>
      );
    // Without recent campaigns the start lists them all; "other" lists the rest.
    const listAll = view === "other" || library.recent.length === 0;
    if (listAll)
      return (
        <>
          <h3 ref={heading} tabIndex={-1} className="dm-welcome-heading">
            {view === "other"
              ? t("welcome.otherHeading")
              : t("welcome.campaigns")}
          </h3>
          <ul className="dm-welcome-list" aria-label={t("welcome.campaigns")}>
            {library.others.map((campaign, index) => (
              <li key={campaign.slug}>
                {campaignButton(
                  campaign.slug,
                  campaign.name,
                  null,
                  index === 0,
                )}
              </li>
            ))}
          </ul>
          {view === "other" && back}
        </>
      );
    return (
      <>
        <h3 ref={heading} tabIndex={-1} className="dm-welcome-heading">
          {t("welcome.recent")}
        </h3>
        <ul className="dm-welcome-list" aria-label={t("welcome.recent")}>
          {library.recent.map((campaign, index) => {
            const date = openDate(campaign.openedAt);
            return (
              <li key={campaign.slug}>
                {campaign.problem === null ? (
                  campaignButton(
                    campaign.slug,
                    campaign.name,
                    campaign.sceneName
                      ? t("welcome.lastScene", {
                          scene: campaign.sceneName,
                          date,
                        })
                      : date,
                    index === 0,
                  )
                ) : (
                  <div className="dm-welcome-campaign dm-welcome-unavailable">
                    <BookOpen aria-hidden="true" />
                    <span className="dm-welcome-campaign-text">
                      <span className="dm-welcome-campaign-name">
                        {campaign.name}
                      </span>
                      <span className="dm-welcome-meta">
                        {t(`welcome.problem.${campaign.problem}`)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="dm-welcome-forget"
                      aria-label={t("welcome.forget", { name: campaign.name })}
                      title={t("welcome.forget", { name: campaign.name })}
                      onClick={() => {
                        onForget(campaign.slug);
                        // The row and its button go: keep the keyboard on the list's heading.
                        heading.current?.focus();
                      }}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("welcome.title")}
      closeLabel={t("welcome.close")}
      initialFocus={firstAction}
      returnFocus={returnFocus}
      className="dm-welcome-dialog"
    >
      <div className="dm-welcome-layout">
        <div ref={mainArea} className="dm-welcome-main">
          {main()}
        </div>
        {library.status === "open" && (
          <div className="dm-welcome-actions">
            <button
              type="button"
              onClick={() => {
                show("new");
              }}
            >
              <FolderPlus aria-hidden="true" />
              {t("welcome.newCampaign")}
            </button>
            {library.recent.length > 0 && library.others.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  show("other");
                }}
              >
                <BookOpen aria-hidden="true" />
                {t("welcome.otherCampaign")}
              </button>
            )}
            <div className="dm-welcome-library">
              <span className="dm-welcome-label">
                {t("library.folderSetting")}
              </span>
              <span className="dm-settings-path" title={library.root}>
                {library.root}
              </span>
              <button
                type="button"
                disabled={choosing}
                onClick={onChooseFolder}
              >
                <FolderOpen aria-hidden="true" />
                {t("library.choose")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
