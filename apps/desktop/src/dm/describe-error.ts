import { MapDataUnavailableError } from "@dungeon-manager/storage";
import type { TFunction } from "i18next";
import { LibraryError } from "../platform/library.js";

/** A translated, actionable message for a library or storage failure. */
export function describeLibraryError(t: TFunction, error: unknown): string {
  if (error instanceof LibraryError && error.code !== "io")
    return t(`library.errors.${error.code}`);
  if (error instanceof MapDataUnavailableError)
    return t("campaign.mapData.notReadable");
  return t("dm.error", {
    message: error instanceof Error ? error.message : String(error),
  });
}
