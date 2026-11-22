import type { CatalogMap } from "@dungeon-manager/storage";
import { MapDataChangedError, updateItemInfo } from "@dungeon-manager/storage";
import {
  ITEM_NAME_MAX,
  ITEM_TEXT_MAX,
  type ItemInfo,
} from "@dungeon-manager/schema";
import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { fileName } from "./file-name.js";
import { catalogAsset } from "./map-catalog.js";

const FIELDS = ["name", "origin", "license"] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

const valuesOf = (info: ItemInfo | undefined): Values => ({
  name: info?.name ?? "",
  origin: info?.origin ?? "",
  license: info?.license ?? "",
});

/**
 * A catalog map's name and origin/license (T-125, SPEC 8.2), edited in the Eigenschaften panel
 * and stored in its sidecar for every campaign. A blank name shows the file name.
 */
export function ItemInfoEditor({
  service,
  map,
  onSaved,
  onOpenInForge,
}: {
  readonly service: LibraryService;
  readonly map: CatalogMap;
  readonly onSaved: () => void;
  /** Opens the map in the Map Forge (T-176a); left out where it already is open there. */
  readonly onOpenInForge?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  // `base` is what the DM began editing from; saving checks the sidecar still holds it.
  const [base, setBase] = useState<Values>(() => valuesOf(map.info));
  const [values, setValues] = useState<Values>(base);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  // After a refused save the next one deliberately replaces what is on disk then.
  const [rebasing, setRebasing] = useState(false);
  const changed = FIELDS.some(
    (field) => values[field].trim() !== base[field].trim(),
  );

  // A change on disk (another device, a hand edit) shows at once while nothing is typed; with
  // unsaved edits the save is refused instead of overwriting it.
  const onDisk = JSON.stringify(valuesOf(map.info));
  const [seen, setSeen] = useState(onDisk);
  if (onDisk !== seen) {
    setSeen(onDisk);
    if (!changed) {
      setBase(valuesOf(map.info));
      setValues(valuesOf(map.info));
    } else if (rebasing) setBase(valuesOf(map.info));
  }

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setProblem("");
    setStatus("");
    try {
      await updateItemInfo(
        service.fs,
        await catalogAsset(service, map.path),
        values,
        // After a reported conflict the DM saves deliberately: no check against what was there.
        rebasing ? undefined : base,
      );
      setBase(values);
      setStatus(t("catalog.info.saved"));
      onSaved();
      setRebasing(false);
    } catch (error) {
      if (error instanceof MapDataChangedError) {
        setBase(valuesOf(map.info));
        setRebasing(true);
        setProblem(t("catalog.info.conflict"));
        onSaved();
      } else setProblem(describeLibraryError(t, error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="dm-item-info" onSubmit={(event) => void save(event)}>
      <p className="dm-details-heading">
        <span className="dm-details-kind">{t("catalog.info.kind")}</span>
        {map.info?.name ?? fileName(map.path)}
      </p>
      <dl className="dm-details-rows">
        <div className="dm-details-row">
          <dt>{t("catalog.info.file")}</dt>
          <dd className="dm-details-mono">{map.path}</dd>
        </div>
      </dl>
      {FIELDS.map((field) => (
        <div key={field} className="dm-item-info-field">
          <label htmlFor={`${id}-${field}`}>{t(`catalog.info.${field}`)}</label>
          {field === "name" ? (
            <input
              id={`${id}-${field}`}
              value={values[field]}
              maxLength={ITEM_NAME_MAX}
              placeholder={fileName(map.path)}
              onChange={(event) => {
                setValues({ ...values, [field]: event.target.value });
              }}
            />
          ) : (
            <textarea
              id={`${id}-${field}`}
              value={values[field]}
              maxLength={ITEM_TEXT_MAX}
              rows={2}
              onChange={(event) => {
                setValues({ ...values, [field]: event.target.value });
              }}
            />
          )}
        </div>
      ))}
      <div className="dm-item-info-actions">
        {onOpenInForge && (
          <button type="button" onClick={onOpenInForge}>
            {t("catalog.openInForge")}
          </button>
        )}
        <button type="submit" disabled={busy || !changed}>
          {t("catalog.info.save")}
        </button>
      </div>
      <p role="status" className="dm-catalog-notice">
        {status}
      </p>
      {problem && <p role="alert">{problem}</p>}
    </form>
  );
}
