import type { AssetRef } from "@dungeon-manager/schema";
import { Dialog } from "@dungeon-manager/ui";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { catalogAsset, useMapCatalog } from "./map-catalog.js";
import { MapCatalogGrid } from "./MapCatalogGrid.js";

/**
 * Choosing a map (T-124, DM decision): a dialog with the library's maps as a grid of previews,
 * a search, and the import of a new file into the library. Used for a new scene and when
 * changing a scene's map.
 */
export function MapPicker({
  service,
  open,
  onClose,
  onChoose,
  returnFocus,
}: {
  readonly service: LibraryService;
  readonly open: boolean;
  readonly onClose: () => void;
  /** The chosen map; the caller closes the picker. */
  readonly onChoose: (asset: AssetRef) => void;
  readonly returnFocus?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const catalog = useMapCatalog(service, open);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const choose = async (find: () => Promise<AssetRef | null>) => {
    setBusy(true);
    setProblem("");
    try {
      const asset = await find();
      if (asset) onChoose(asset);
    } catch (error) {
      setProblem(describeLibraryError(t, error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("catalog.pickTitle")}
      closeLabel={t("catalog.close")}
      returnFocus={returnFocus}
      className="dm-map-picker"
    >
      <div className="dm-map-picker-body">
        <div className="dm-map-picker-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void choose(() => service.importMap(t("campaign.mapFilter")))
            }
          >
            {t("catalog.importMap")}
          </button>
        </div>
        {catalog.status === "loading" && (
          <p className="dm-catalog-notice">{t("catalog.loading")}</p>
        )}
        {catalog.status === "error" && (
          <p role="alert">{describeLibraryError(t, catalog.error)}</p>
        )}
        {catalog.status === "ok" && (
          <MapCatalogGrid
            service={service}
            maps={catalog.maps}
            disabled={busy}
            onPick={(map) => void choose(() => catalogAsset(service, map.path))}
          />
        )}
        {problem && <p role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}
