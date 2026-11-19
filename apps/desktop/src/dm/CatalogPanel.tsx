import { IconButton } from "@dungeon-manager/ui";
import { ImagePlus } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";

const GROUPS = ["maps", "tokens", "assets"] as const;

/**
 * The data panel: the library's map and asset catalogue (DM decision, T-130c). Only the frame
 * and the map import for now; T-124 lists the maps with previews, later tasks tokens and assets.
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

  const importMap = async () => {
    setImporting(true);
    try {
      const asset = await service.importMap(t("campaign.mapFilter"));
      if (asset)
        setNotice(t("catalog.mapImported", { file: fileName(asset.path) }));
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
      {GROUPS.map((group) => (
        <section key={group} className="dm-catalog-group">
          <h3>{t(`catalog.groups.${group}`)}</h3>
          <p>{t(`catalog.empty.${group}`)}</p>
        </section>
      ))}
      <p role="status" className="dm-catalog-notice">
        {notice}
      </p>
    </section>
  );
}
