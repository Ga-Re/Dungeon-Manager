import {
  createCampaign,
  ensureLibraryLayout,
  listCampaigns,
  loadCampaign,
} from "@dungeon-manager/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { CampaignPanel } from "./CampaignPanel.js";
import { describeLibraryError } from "./describe-error.js";
import { NameForm } from "./NameForm.js";
import { useLibraryChanges } from "./useLibraryChanges.js";

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

/** A campaign folder or its campaign.json – not the many files inside a campaign. */
const isCampaignChange = (path: string) =>
  /^campaigns\/[^/]+(\/campaign\.json)?$/.test(path);

/** The library folder: choose it, create its layout, list, create and select campaigns live. */
export function LibraryPanel({
  service,
  newId,
}: {
  readonly service: LibraryService;
  /** Fresh opaque ids for new campaigns and scenes. */
  readonly newId: () => string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
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
    return () => {
      active.current = false;
    };
  }, [service, show]);

  useLibraryChanges(
    service,
    isCampaignChange,
    () => void show(() => service.currentRoot()),
  );

  const choose = async () => {
    setChoosing(true);
    try {
      const root = await service.chooseRoot();
      if (root !== null) {
        setSelected(null);
        await show(() => Promise.resolve(root));
      }
    } catch (error) {
      latest.current++;
      if (active.current) setState({ status: "error", error });
    } finally {
      if (active.current) setChoosing(false);
    }
  };

  const create = async (name: string) => {
    try {
      const slug = await createCampaign(service.fs, { id: newId(), name });
      await show(() => service.currentRoot());
      setSelected(slug);
      setNotice(t("library.campaignCreated", { name: name.trim() }));
      return true;
    } catch (error) {
      setNotice(describeLibraryError(t, error));
      return false;
    }
  };

  const selectedCampaign =
    state.status === "open"
      ? state.campaigns.find(
          (campaign) => campaign.slug === selected && campaign.name !== null,
        )
      : undefined;

  return (
    <section aria-labelledby="library-heading">
      <h2 id="library-heading">{t("library.heading")}</h2>
      {state.status === "loading" && <p>{t("library.loading")}</p>}
      {state.status === "none" && <p>{t("library.none")}</p>}
      {state.status === "error" && (
        <p role="alert">{describeLibraryError(t, state.error)}</p>
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
                  {campaign.name === null ? (
                    t(`library.campaign.${campaign.problem ?? "invalid"}`, {
                      slug: campaign.slug,
                    })
                  ) : (
                    <button
                      type="button"
                      aria-pressed={campaign.slug === selected}
                      onClick={() => {
                        setSelected(campaign.slug);
                      }}
                    >
                      {campaign.name}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <NameForm
            label={t("library.newCampaignName")}
            submitLabel={t("library.createCampaign")}
            onSubmit={create}
          />
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
      <p role="status">{notice}</p>
      {selectedCampaign?.name != null && (
        <CampaignPanel
          key={selectedCampaign.slug}
          service={service}
          slug={selectedCampaign.slug}
          name={selectedCampaign.name}
          newId={newId}
        />
      )}
    </section>
  );
}
