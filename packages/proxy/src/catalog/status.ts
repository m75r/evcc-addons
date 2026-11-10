// Zustand eines Katalogeintrags gegenüber der installierten Version
import { SUPPORTED_API_VERSIONS } from "@evcc-addons/sdk";
import { compareVersions } from "../addons/version.js";
import type { CatalogEntry } from "./entry.js";

export type CatalogStatus =
  "available" | "installed" | "update" | "newer-installed" | "incompatible";

/** `installed`: installierte Version oder undefined */
export function catalogStatus(entry: CatalogEntry, installed?: string): CatalogStatus {
  if (!(SUPPORTED_API_VERSIONS as readonly number[]).includes(entry.apiVersion)) {
    return "incompatible";
  }
  if (installed === undefined) return "available";
  const diff = compareVersions(entry.version, installed);
  if (diff > 0) return "update";
  return diff === 0 ? "installed" : "newer-installed";
}

/** Antwort für den Browser, ohne `url`, `sha256` und `homepage` */
export function toCatalogDto(entry: CatalogEntry, installed?: string) {
  const { id, name, description, version, apiVersion } = entry;
  return {
    id,
    name,
    description,
    version,
    apiVersion,
    status: catalogStatus(entry, installed),
    installedVersion: installed ?? null,
  };
}

export type CatalogDto = ReturnType<typeof toCatalogDto>;
