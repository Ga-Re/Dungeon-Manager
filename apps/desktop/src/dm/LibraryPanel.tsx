import {
  createCampaign,
  ensureLibraryLayout,
  listCampaigns,
  loadCampaign,
} from "@dungeon-manager/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { Menu, Popover } from "@dungeon-manager/ui";
import { BookOpen, FolderPlus } from "lucide-react";
import { CampaignPanel } from "./CampaignPanel.js";
import type { RememberedSceneTabs } from "./scene-tabs.js";
import { CatalogPanel } from "./CatalogPanel.js";
import { describeLibraryError } from "./describe-error.js";
import { NameForm } from "./NameForm.js";
import {
  forgetCampaign,
  readRecent,
  recentIn,
  recordCampaign,
  recordScene,
  saveRecent,
  type RecentCampaign,
  recordTabs,
} from "./recent-campaigns.js";
import { WelcomeDialog, type WelcomeLibrary } from "./WelcomeDialog.js";
import { useAppCommand, useAppModal } from "./shell/app-commands.js";
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
 * created from its header menu. With `welcome`, the welcome dialog opens first (T-153).
 */
export function LibraryPanel({
  service,
  newId,
  welcome = false,
  storage,
  now = () => new Date(),
  afterCrash = false,
}: {
  readonly service: LibraryService;
  /** Fresh opaque ids for new campaigns and scenes. */
  readonly newId: () => string;
  /** Show the welcome dialog when the window opens. */
  readonly welcome?: boolean;
  /** Device-local storage for the recently edited campaigns. */
  readonly storage?: Storage | undefined;
  readonly now?: () => Date;
  /**
   * The last session did not end cleanly (T-114a): the campaign's tabs come back, but the TV
   * stays dark until the DM sends a scene (DM decision, 2026-11-20).
   */
  readonly afterCrash?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const campaignMenu = useRef<HTMLButtonElement>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(welcome);
  const [recent, setRecent] = useState<readonly RecentCampaign[]>(() =>
    readRecent(storage),
  );
  // The scene tabs to open with a campaign chosen in the welcome dialog (T-114a).
  const [pendingScene, setPendingScene] = useState<{
    readonly slug: string;
    readonly tabs: RememberedSceneTabs;
  } | null>(null);
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
      // The popover with the focused field closes: focus back on the menu it came from.
      campaignMenu.current?.focus();
      setCreating(false);
      setNotice(t("library.campaignCreated", { name: name.trim() }));
      return true;
    } catch (error) {
      setNotice(describeLibraryError(t, error));
      return false;
    }
  };

  useEffect(() => {
    saveRecent(storage, recent);
  }, [storage, recent]);

  const selectedCampaign =
    state.status === "open"
      ? state.campaigns.find(
          (campaign) => campaign.slug === selected && campaign.name !== null,
        )
      : undefined;
  const campaigns = state.status === "open" ? state.campaigns : [];
  const root = state.status === "open" ? state.root : null;

  // Every campaign that opens becomes the most recent one on this device.
  const openSlug = selectedCampaign?.slug;
  const openName = selectedCampaign?.name;
  const clock = useRef(now);
  useEffect(() => {
    clock.current = now;
  });
  useEffect(() => {
    if (root === null || !openSlug || openName == null) return;
    setRecent((list) =>
      recordCampaign(
        list,
        { root, slug: openSlug, name: openName },
        clock.current(),
      ),
    );
  }, [root, openSlug, openName]);

  const welcomeLibrary = ((): WelcomeLibrary => {
    if (state.status === "loading") return { status: "loading" };
    if (state.status === "none") return { status: "none" };
    if (state.status === "error")
      return {
        status: "error",
        message: describeLibraryError(t, state.error),
      };
    const listed = recentIn(recent, state.root);
    return {
      status: "open",
      root: state.root,
      recent: listed.map((entry) => {
        const campaign = campaigns.find((each) => each.slug === entry.slug);
        return {
          slug: entry.slug,
          name: campaign?.name ?? entry.name,
          sceneName: entry.sceneName,
          openedAt: entry.openedAt,
          problem: !campaign ? "missing" : campaign.problem,
        };
      }),
      others: campaigns.flatMap((campaign) =>
        campaign.name !== null &&
        !listed.some((entry) => entry.slug === campaign.slug)
          ? [{ slug: campaign.slug, name: campaign.name }]
          : [],
      ),
    };
  })();

  // The app menu (T-130d): a new campaign is named in the browser's popover; without an open
  // library (e.g. no folder yet) the welcome dialog guides there first.
  useAppCommand("newCampaign", () => {
    if (state.status === "open") setCreating(true);
    else setWelcomeOpen(true);
  });
  useAppCommand("welcome", () => {
    setWelcomeOpen(true);
  });
  useAppModal(() => {
    setWelcomeOpen(false);
  });

  const openFromWelcome = (slug: string) => {
    const entry =
      root === null
        ? undefined
        : recentIn(recent, root).find((each) => each.slug === slug);
    const sceneId = entry?.sceneId ?? null;
    const open = entry?.openSceneIds ?? (sceneId ? [sceneId] : []);
    setPendingScene(
      open.length > 0
        ? {
            slug,
            tabs: {
              open,
              active: entry?.activeSceneId ?? sceneId,
              tv: afterCrash ? null : sceneId,
            },
          }
        : null,
    );
    setSelected(slug);
    setWelcomeOpen(false);
  };
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
          <legend>{t("library.folderSetting")}</legend>
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
        {/* The Browser panel names the region (its tab, T-172a). */}
        <div className="dm-campaign-browser">
          {/* The campaign switch heads the browser panel (T-172a: the panel's tab names it). */}
          <div className="dm-panel-toolbar">
            {state.status === "open" && (
              <span className="dm-panel-head-menu">
                <Menu
                  // The campaign itself heads the tree; the header only switches it.
                  label={
                    selectedCampaign
                      ? t("shell.tree.switchCampaign")
                      : t("library.chooseCampaign")
                  }
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
                    else {
                      setPendingScene(null);
                      setSelected(id);
                    }
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
            )}
          </div>
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
                            setPendingScene(null);
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
              initialTabs={
                pendingScene?.slug === selectedCampaign.slug
                  ? pendingScene.tabs
                  : null
              }
              onTabsChange={(tabs) => {
                if (root === null) return;
                const campaign = { root, slug: selectedCampaign.slug };
                setRecent((list) =>
                  recordTabs(list, campaign, tabs, clock.current()),
                );
              }}
              onSceneOpen={(scene) => {
                // Used once: a later remount of this campaign must not jump back to it.
                setPendingScene(null);
                if (root === null) return;
                const campaign = { root, slug: selectedCampaign.slug };
                setRecent((list) =>
                  recordScene(list, campaign, scene, clock.current()),
                );
              }}
            />
          )}
        </div>
      </ShellPortal>
      <WelcomeDialog
        open={welcomeOpen}
        onClose={() => {
          setWelcomeOpen(false);
        }}
        returnFocus={campaignMenu}
        library={welcomeLibrary}
        choosing={choosing}
        notice={notice}
        onChooseFolder={() => void choose()}
        onOpen={openFromWelcome}
        onForget={(slug) => {
          if (root === null) return;
          setRecent((list) => forgetCampaign(list, { root, slug }));
        }}
        onCreate={async (name) => {
          // The form shows only this attempt's message, not an older one.
          setNotice("");
          const created = await create(name);
          if (created) setWelcomeOpen(false);
          return created;
        }}
      />
      <ShellPortal slot="notices">
        <p role="status">{notice}</p>
      </ShellPortal>
    </>
  );
}
