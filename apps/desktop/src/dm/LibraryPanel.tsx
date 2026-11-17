import {
  ensureLibraryLayout,
  listCampaigns,
  loadCampaign,
} from "@dungeon-manager/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LibraryError, type LibraryService } from "../platform/library.js";

interface CampaignEntry {
  readonly slug: string;
  /** The campaign's name, or why it could not be read. */
  readonly name: string | null;
  readonly problem: "notAvailable" | "invalid" | null;
}

type LibraryState =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | {
      readonly status: "open";
      readonly root: string;
      readonly campaigns: readonly CampaignEntry[];
    }
  | { readonly status: "error"; readonly error: unknown };

/** Sync clients write in bursts; wait for a quiet moment before re-reading. */
const RELOAD_DELAY_MS = 300;

async function readCampaigns(
  service: LibraryService,
): Promise<CampaignEntry[]> {
  const slugs = await listCampaigns(service.fs);
  return Promise.all(
    slugs.map(async (slug): Promise<CampaignEntry> => {
      const result = await loadCampaign(service.fs, slug);
      if (result.status === "ok")
        return { slug, name: result.value.name, problem: null };
      return {
        slug,
        name: null,
        problem: result.status === "notAvailable" ? "notAvailable" : "invalid",
      };
    }),
  );
}

/** The library folder: choose it, create its layout and list its campaigns live. */
export function LibraryPanel({
  service,
}: {
  readonly service: LibraryService;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [choosing, setChoosing] = useState(false);
  const active = useRef(true);
  // Only the most recent load may update the state: a slow earlier one (e.g. the initial load
  // finishing after the DM chose another folder) must not overwrite newer data.
  const latest = useRef(0);

  const show = useCallback(
    async (getRoot: () => Promise<string | null>) => {
      const request = ++latest.current;
      const apply = (next: LibraryState) => {
        if (active.current && request === latest.current) setState(next);
      };
      try {
        const root = await getRoot();
        if (root === null) {
          apply({ status: "none" });
          return;
        }
        await ensureLibraryLayout(service.fs);
        apply({
          status: "open",
          root,
          campaigns: await readCampaigns(service),
        });
      } catch (error) {
        apply({ status: "error", error });
      }
    },
    [service],
  );

  useEffect(() => {
    active.current = true;
    void show(() => service.currentRoot());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = service.onChange((paths) => {
      // Our own atomic writes show up as *.tmp first; only campaign changes matter here.
      if (
        !paths.some(
          (path) => path.startsWith("campaigns/") && !path.endsWith(".tmp"),
        )
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void show(() => service.currentRoot());
      }, RELOAD_DELAY_MS);
    });
    return () => {
      active.current = false;
      clearTimeout(timer);
      void unsubscribe.then((stop) => {
        stop();
      });
    };
  }, [service, show]);

  const choose = async () => {
    setChoosing(true);
    try {
      const root = await service.chooseRoot();
      if (root !== null) await show(() => Promise.resolve(root));
    } catch (error) {
      latest.current++;
      if (active.current) setState({ status: "error", error });
    } finally {
      if (active.current) setChoosing(false);
    }
  };

  const describeError = (error: unknown) =>
    error instanceof LibraryError && error.code !== "io"
      ? t(`library.errors.${error.code}`)
      : t("dm.error", {
          message: error instanceof Error ? error.message : String(error),
        });

  return (
    <section aria-labelledby="library-heading">
      <h2 id="library-heading">{t("library.heading")}</h2>
      {state.status === "loading" && <p>{t("library.loading")}</p>}
      {state.status === "none" && <p>{t("library.none")}</p>}
      {state.status === "error" && (
        <p role="alert">{describeError(state.error)}</p>
      )}
      {state.status === "open" && (
        <>
          <p>{t("library.folder", { path: state.root })}</p>
          {state.campaigns.length === 0 ? (
            <p>{t("library.noCampaigns")}</p>
          ) : (
            <ul aria-label={t("library.campaigns")}>
              {state.campaigns.map((campaign) => (
                <li key={campaign.slug}>
                  {campaign.name ??
                    t(`library.campaign.${campaign.problem ?? "invalid"}`, {
                      slug: campaign.slug,
                    })}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button
        type="button"
        id="choose-library"
        disabled={choosing}
        onClick={() => void choose()}
      >
        {t("library.choose")}
      </button>
    </section>
  );
}
