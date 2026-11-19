import {
  createCampaign,
  ensureLibraryLayout,
  listCampaigns,
  loadCampaign,
} from "@dungeon-manager/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { FloatingPanel, Menu, Popover } from "@dungeon-manager/ui";
import { BookOpen, FolderPlus } from "lucide-react";
import { CampaignPanel } from "./CampaignPanel.js";
import { CatalogPanel } from "./CatalogPanel.js";
import { describeLibraryError } from "./describe-error.js";
import { NameForm } from "./NameForm.js";
import { ShellPortal } from "./shell/slots.js";
import { useLibraryChanges } from "./useLibraryChanges.js";

/** Menu id of "Neue Kampagne …"; campaign slugs never contain a colon. */
const NEW_CAMPAIGN = ":new";

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

/**
 * The library folder and its campaigns (T-130c): the folder is chosen in the settings, the data
 * panel shows the catalogue, and the scene browser shows the chosen campaign – switched or
 * created from its header menu.
 */
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
  const [creating, setCreating] = useState(false);
  const campaignMenu = useRef<HTMLButtonElement>(null);
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
      setCreating(false);
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
  const campaigns = state.status === "open" ? state.campaigns : [];
  const campaignLabel = (campaign: CampaignEntry) =>
    campaign.name ??
    t(`library.campaign.${campaign.problem ?? "invalid"}`, {
      slug: campaign.slug,
    });

  const chooseButton = (
    <button
      type="button"
      className="dm-choose-library"
      disabled={choosing}
      onClick={() => void choose()}
    >
      {t("library.choose")}
    </button>
  );

  return (
    <>
      <ShellPortal slot="settings">
        <fieldset className="dm-settings-group">
          <legend>{t("library.heading")}</legend>
          {state.status === "open" && (
            <p className="dm-settings-path">
              {t("library.folder", { path: state.root })}
            </p>
          )}
          {chooseButton}
        </fieldset>
      </ShellPortal>
      <ShellPortal slot="dataPanel">
        <CatalogPanel service={service} ready={state.status === "open"} />
      </ShellPortal>
      <ShellPortal slot="browser">
        <FloatingPanel
          compact
          title={t("library.browserTitle")}
          className="dm-campaign-browser"
          headerActions={
            state.status === "open" && (
              <span className="dm-panel-head-menu">
                <Menu
                  label={selectedCampaign?.name ?? t("library.chooseCampaign")}
                  buttonRef={campaignMenu}
                  items={[
                    ...campaigns.map((campaign) => ({
                      id: campaign.slug,
                      label: campaignLabel(campaign),
                      icon: <BookOpen />,
                      disabled: campaign.name === null,
                    })),
                    {
                      id: NEW_CAMPAIGN,
                      label: t("library.newCampaign"),
                      icon: <FolderPlus />,
                    },
                  ]}
                  onSelect={(id) => {
                    if (id === NEW_CAMPAIGN) setCreating(true);
                    else setSelected(id);
                  }}
                />
                <Popover
                  open={creating}
                  anchor={campaignMenu}
                  label={t("library.newCampaign")}
                  onClose={() => {
                    setCreating(false);
                  }}
                >
                  <NameForm
                    label={t("library.newCampaignName")}
                    submitLabel={t("library.createCampaign")}
                    onSubmit={create}
                    focusOnMount
                  />
                </Popover>
              </span>
            )
          }
        >
          {state.status === "loading" && <p>{t("library.loading")}</p>}
          {state.status === "none" && (
            <>
              <p>{t("library.none")}</p>
              {chooseButton}
            </>
          )}
          {state.status === "error" && (
            <>
              <p role="alert">{describeLibraryError(t, state.error)}</p>
              {chooseButton}
            </>
          )}
          {state.status === "open" &&
            !selectedCampaign &&
            (campaigns.length === 0 ? (
              <p className="dm-browser-hint">{t("library.noCampaigns")}</p>
            ) : (
              <>
                <p className="dm-browser-hint">
                  {t("library.chooseCampaignHint")}
                </p>
                <ul
                  aria-label={t("library.campaigns")}
                  className="dm-campaign-list"
                >
                  {campaigns.map((campaign) => (
                    <li key={campaign.slug}>
                      {campaign.name === null ? (
                        campaignLabel(campaign)
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(campaign.slug);
                          }}
                        >
                          <BookOpen aria-hidden="true" />
                          {campaign.name}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ))}
          {selectedCampaign?.name != null && (
            <CampaignPanel
              key={selectedCampaign.slug}
              service={service}
              slug={selectedCampaign.slug}
              name={selectedCampaign.name}
              newId={newId}
            />
          )}
        </FloatingPanel>
      </ShellPortal>
      <ShellPortal slot="notices">
        <p role="status">{notice}</p>
      </ShellPortal>
    </>
  );
}
