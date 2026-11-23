import {
  FOG_BIOMES,
  type AssetRef,
  type MapData,
} from "@dungeon-manager/schema";
import { updateItemInfo } from "@dungeon-manager/storage";
import { Dialog } from "@dungeon-manager/ui";
import { useId, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { ToolCommand } from "./ToolCommand.js";

/**
 * "Neue Karte" (T-253, ADR-0020): the DM says where the map comes from – an image file to
 * import (drawing one is stage 6) – and names it right away. OK picks the file, puts it into
 * the catalog with that name (its sidecar's info, T-125) and hands its path on to be opened.
 */
export function NewMapCommand({
  service,
  onOpen,
  onCancel,
}: {
  readonly service: LibraryService;
  /** Opens the imported map in the Map Forge. */
  readonly onOpen: (path: string) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  // A file imported whose name could not be written yet: OK tries the name again, not the import.
  const [imported, setImported] = useState<AssetRef | null>(null);
  const trimmed = name.trim();

  const create = async () => {
    if (busy || trimmed === "") return;
    setBusy(true);
    setProblem("");
    try {
      const asset =
        imported ?? (await service.importMap(t("campaign.mapFilter")));
      // The file dialog cancelled: the panel stays, as typed.
      if (!asset) return;
      setImported(asset);
      await updateItemInfo(service.fs, asset, { name: trimmed });
      onOpen(asset.path);
    } catch (error) {
      setProblem(describeLibraryError(t, error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolCommand
      title={t("forge.newMap")}
      okDisabled={busy || trimmed === ""}
      onOk={() => void create()}
      onCancel={onCancel}
    >
      <fieldset className="dm-forge-source">
        <legend>{t("forge.newMapSource")}</legend>
        <label className="dm-forge-check">
          <input type="radio" name={`${id}-source`} defaultChecked />
          {t("forge.newMapImport")}
        </label>
        <label className="dm-forge-check">
          <input type="radio" name={`${id}-source`} disabled />
          {t("forge.newMapDraw")}
        </label>
      </fieldset>
      <div className="dm-item-info-field">
        <label htmlFor={`${id}-name`}>{t("forge.facts.name")}</label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={200}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <p className="dm-catalog-notice">{t("forge.newMapHint")}</p>
      {problem && <p role="alert">{problem}</p>}
    </ToolCommand>
  );
}

/**
 * "Karteneinstellungen" (T-253, ADR-0020): the map's settings for every scene – name, origin and
 * license, grid and default fog biome – opened from the browser. The editors inside save to
 * the sidecar themselves (tags and theme follow with T-126).
 */
export function MapSettingsDialog({
  open,
  onClose,
  returnFocus,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly returnFocus?: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("forge.settings")}
      closeLabel={t("forge.close", { name: t("forge.settings") })}
      returnFocus={returnFocus}
      className="dm-forge-settings"
    >
      {children}
    </Dialog>
  );
}

/** The open map's facts in the Eigenschaften panel (T-253): what it is, not how to edit it. */
export function MapFacts({
  name,
  path,
  data,
}: {
  readonly name: string;
  readonly path: string;
  readonly data: MapData;
}) {
  const { t } = useTranslation();
  const biome = data.fogEffect?.biome;
  const rows: readonly (readonly [string, string])[] = [
    [t("forge.facts.name"), name],
    [t("forge.facts.file"), path],
    [
      t("forge.facts.grid"),
      t("forge.facts.gridValue", { size: data.grid.cellSizePx }),
    ],
    [t("forge.facts.levels"), String(data.levels.length)],
    [t("forge.facts.areas"), String(data.areas.length)],
    [
      t("forge.facts.biome"),
      biome === undefined
        ? t("forge.biomeNone")
        : (FOG_BIOMES as readonly string[]).includes(biome)
          ? t(`fog.biomes.${biome}`)
          : biome,
    ],
  ];
  return (
    <dl className="dm-details-rows">
      {rows.map(([term, value]) => (
        <div key={term} className="dm-details-row">
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
