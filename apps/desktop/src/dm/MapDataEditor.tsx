import {
  FOG_BIOMES,
  type FogEffect,
  type MapData,
} from "@dungeon-manager/schema";
import { MapDataChangedError, updateMapData } from "@dungeon-manager/storage";
import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryService } from "../platform/library.js";
import { describeLibraryError } from "./describe-error.js";
import { catalogAsset } from "./map-catalog.js";
import { numberOf } from "./grid-fields.js";

/** The map data the Map Forge edits so far (T-176a): grid and the default fog biome. */
interface Values {
  readonly cellSizePx: string;
  readonly offsetXPx: string;
  readonly offsetYPx: string;
  /** "" for none: scenes then show Bodennebel, as before T-168. */
  readonly biome: string;
  /** 0…100 %. */
  readonly strength: string;
}

const valuesOf = (data: MapData): Values => ({
  cellSizePx: String(data.grid.cellSizePx),
  offsetXPx: String(data.grid.offsetXPx),
  offsetYPx: String(data.grid.offsetYPx),
  biome: data.fogEffect?.biome ?? "",
  strength: String(Math.round((data.fogEffect?.strength ?? 1) * 100)),
});

/**
 * The map's grid and default fog biome in the Map Forge (T-176a), stored in its sidecar for
 * every scene of the map (ADR-0012). A scene live on the TV takes a change only after the DM
 * confirms it there (T-134b). Like the info editor, it follows a change on disk while
 * untouched and never overwrites one under unsaved edits.
 */
export function MapDataEditor({
  service,
  path,
  data,
  defaults,
  onSaved,
}: {
  readonly service: LibraryService;
  readonly path: string;
  /** The map's data on disk, `defaults` while it has none. */
  readonly data: MapData;
  readonly defaults: MapData;
  readonly onSaved: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [base, setBase] = useState<MapData>(data);
  const [values, setValues] = useState<Values>(() => valuesOf(data));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  // After a refused save the next one deliberately replaces what is on disk then.
  const [rebasing, setRebasing] = useState(false);
  const changed = JSON.stringify(values) !== JSON.stringify(valuesOf(base));

  const onDisk = JSON.stringify(data);
  const [seen, setSeen] = useState(onDisk);
  if (onDisk !== seen) {
    setSeen(onDisk);
    if (!changed) {
      setBase(data);
      setValues(valuesOf(data));
    } else if (
      rebasing ||
      // Only rooms or levels changed (e.g. a room drawn meanwhile): what the fields edit is
      // the same, so the next save need not ask.
      JSON.stringify(valuesOf(data)) === JSON.stringify(valuesOf(base))
    )
      setBase(data);
  }

  const cellSizePx = numberOf(values.cellSizePx);
  const offsetXPx = numberOf(values.offsetXPx);
  const offsetYPx = numberOf(values.offsetYPx);
  const strength = numberOf(values.strength);
  const valid =
    cellSizePx !== null &&
    cellSizePx > 0 &&
    offsetXPx !== null &&
    offsetYPx !== null &&
    (values.biome === "" ||
      (strength !== null && strength >= 0 && strength <= 100));

  const discard = () => {
    setValues(valuesOf(base));
    setProblem("");
  };

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy || !changed || !valid) return;
    setBusy(true);
    setProblem("");
    setStatus("");
    const fogEffect: FogEffect | null =
      values.biome === ""
        ? null
        : { biome: values.biome, strength: (strength ?? 100) / 100 };
    try {
      const written = await updateMapData(
        service.fs,
        await catalogAsset(service, path),
        defaults,
        (current) => {
          const next: MapData = {
            ...current,
            // Unknown grid fields (loose schema) stay.
            grid: { ...current.grid, cellSizePx, offsetXPx, offsetYPx },
          };
          // An untouched biome stays exactly as stored: unknown fields (loose schema) and a
          // strength finer than whole percent survive a save of the grid alone.
          const baseValues = valuesOf(base);
          const fogUnchanged =
            values.biome === baseValues.biome &&
            (values.biome === "" || values.strength === baseValues.strength);
          if (!fogUnchanged) {
            if (fogEffect)
              next.fogEffect = { ...current.fogEffect, ...fogEffect };
            else delete next.fogEffect;
          }
          return next;
        },
        // After a reported conflict the DM saves deliberately: no check against what was there.
        rebasing ? undefined : base,
      );
      if (written) setBase(written);
      setStatus(t("forge.saved"));
      onSaved();
      setRebasing(false);
    } catch (error) {
      if (error instanceof MapDataChangedError) {
        setBase(data);
        setRebasing(true);
        setProblem(t("forge.conflict"));
        onSaved();
      } else setProblem(describeLibraryError(t, error));
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: "cellSizePx" | "offsetXPx" | "offsetYPx",
    min?: number,
  ) => (
    <div className="dm-item-info-field">
      <label htmlFor={`${id}-${key}`}>{t(`forge.${key}`)}</label>
      <input
        id={`${id}-${key}`}
        type="number"
        inputMode="decimal"
        step="any"
        min={min}
        value={values[key]}
        onChange={(event) => {
          setValues({ ...values, [key]: event.target.value });
        }}
      />
    </div>
  );

  return (
    // The form checks its fields itself (and says why); the browser's own check would block
    // a save silently, e.g. on a cell size below the field's `min`.
    <form
      className="dm-item-info"
      noValidate
      onSubmit={(event) => void save(event)}
    >
      <p className="dm-details-kind">{t("forge.grid")}</p>
      {field("cellSizePx", 1)}
      {field("offsetXPx")}
      {field("offsetYPx")}
      <p className="dm-details-kind">{t("forge.fog")}</p>
      <div className="dm-item-info-field">
        <label htmlFor={`${id}-biome`}>{t("forge.biome")}</label>
        <select
          id={`${id}-biome`}
          value={values.biome}
          onChange={(event) => {
            setValues({ ...values, biome: event.target.value });
          }}
        >
          <option value="">{t("forge.biomeNone")}</option>
          {FOG_BIOMES.map((biome) => (
            <option key={biome} value={biome}>
              {t(`fog.biomes.${biome}`)}
            </option>
          ))}
          {/* A newer app's biome survives (T-168): shown by name, kept unless changed. */}
          {values.biome !== "" &&
            !(FOG_BIOMES as readonly string[]).includes(values.biome) && (
              <option value={values.biome}>{values.biome}</option>
            )}
        </select>
      </div>
      {values.biome !== "" && (
        <div className="dm-item-info-field">
          <label htmlFor={`${id}-strength`}>
            {t("forge.strength", { percent: values.strength })}
          </label>
          <input
            id={`${id}-strength`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={values.strength}
            onChange={(event) => {
              setValues({ ...values, strength: event.target.value });
            }}
          />
        </div>
      )}
      <div className="dm-item-info-actions">
        <button type="button" disabled={busy || !changed} onClick={discard}>
          {t("forge.discard")}
        </button>
        <button type="submit" disabled={busy || !changed || !valid}>
          {t("forge.save")}
        </button>
      </div>
      {!valid && <p className="dm-catalog-notice">{t("forge.invalid")}</p>}
      <p role="status" className="dm-catalog-notice">
        {status}
      </p>
      {problem && <p role="alert">{problem}</p>}
    </form>
  );
}
