import { IconButton } from "@dungeon-manager/ui";
import { ImagePlus } from "lucide-react";
import { useContext, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";
import { CatalogSelectionContext } from "./catalog-selection.js";
import { ItemInfoEditor } from "./ItemInfoEditor.js";
import { useMapCatalog } from "./map-catalog.js";
import { ShellPortal } from "./shell/slots.js";
import { MapCatalogGrid } from "./MapCatalogGrid.js";

const LATER_GROUPS = ["tokens", "assets"] as const;

/**
 * The data panel: the library's map and asset catalogue (DM decision, T-130c). The maps of all
 * campaigns with previews (T-124); tokens and assets follow in later tasks.
 */
export function CatalogPanel({
  service,
  ready,
}: {
  readonly service: LibraryService;
  /** A library folder is open, so files can be imported into it. */
  readonly ready: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const catalog = useMapCatalog(service, ready);
  const selection = useContext(CatalogSelectionContext);
  // Without a library around it (component tests), the panel keeps its own selection.
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const selected = selection ? selection.selected : ownSelected;
  const select = selection ? selection.select : setOwnSelected;
  const selectedMap =
    catalog.status === "ok"
      ? catalog.maps.find((map) => map.path === selected)
      : undefined;
  // A selected map that is gone (deleted or renamed on disk) is no longer selected, so the
  // Eigenschaften panel never stays empty.
  const gone =
    selected !== null && catalog.status !== "loading" && !selectedMap;
  useEffect(() => {
    if (gone) select(null);
  }, [gone, select]);

  const importMap = async () => {
    setImporting(true);
    try {
      const asset = await service.importMap(t("campaign.mapFilter"));
      if (asset) {
        setNotice(t("catalog.mapImported", { file: fileName(asset.path) }));
        catalog.reload();
      }
    } catch (error) {
      setNotice(describeLibraryError(t, error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="dm-catalog">
      <header className="dm-catalog-head">
        <h2 id={headingId}>{t("catalog.title")}</h2>
        <IconButton
          icon={<ImagePlus />}
          label={t("catalog.importMap")}
          disabled={!ready || importing}
          onClick={() => void importMap()}
        />
      </header>
      {!ready && <p className="dm-catalog-notice">{t("catalog.noLibrary")}</p>}
      <section className="dm-catalog-group">
        <h3>{t("catalog.groups.maps")}</h3>
        {ready && catalog.status === "loading" && <p>{t("catalog.loading")}</p>}
        {ready && catalog.status === "error" && (
          <p role="alert">{describeLibraryError(t, catalog.error)}</p>
        )}
        {ready && catalog.status === "ok" && (
          <MapCatalogGrid
            service={service}
            maps={catalog.maps}
            selected={selected}
            onPick={(map) => {
              // A second click on the selected map gives the panel back to the browser.
              select(map.path === selected ? null : map.path);
            }}
          />
        )}
      </section>
      {LATER_GROUPS.map((group) => (
        <section key={group} className="dm-catalog-group">
          <h3>{t(`catalog.groups.${group}`)}</h3>
          <p>{t(`catalog.empty.${group}`)}</p>
        </section>
      ))}
      <p role="status" className="dm-catalog-notice">
        {notice}
      </p>
      {selectedMap && (
        <ShellPortal slot="details">
          <ItemInfoEditor
            key={selectedMap.path}
            service={service}
            map={selectedMap}
            onSaved={catalog.reload}
          />
        </ShellPortal>
      )}
    </section>
  );
}
