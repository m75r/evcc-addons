// Lesen und Prüfen eines Addon-Pakets (ZIP mit addon.json)
import type { AddonManifest } from "@evcc-addons/sdk";
import { strFromU8, unzipSync, type UnzipFileInfo } from "fflate";
import { AddonError } from "./errors.js";
import { isSafeRelativePath, parseManifest } from "./manifest.js";

export const MANIFEST_FILE = "addon.json";

export interface PackageLimits {
  maxBytes: number;
  maxFiles: number;
}

export interface AddonPackage {
  manifest: AddonManifest;
  files: Map<string, Uint8Array>;
}

export function readAddonZip(buffer: Uint8Array, limits: PackageLimits): AddonPackage {
  const files = stripCommonRoot(unzip(buffer, limits));
  const manifestBytes = files.get(MANIFEST_FILE);
  if (!manifestBytes) throw new AddonError("manifest-missing", "addon.json fehlt im Paket");
  const manifest = parseManifest(parseJson(manifestBytes));
  if (!files.has(manifest.entry)) {
    throw new AddonError("entry-missing", `Einstiegsdatei ${manifest.entry} fehlt im Paket`, {
      entry: manifest.entry,
    });
  }
  if (manifest.server !== undefined && !files.has(manifest.server)) {
    throw new AddonError("entry-missing", `${manifest.server} fehlt im Paket`, {
      entry: manifest.server,
    });
  }
  return { manifest, files };
}

function unzip(buffer: Uint8Array, limits: PackageLimits): Map<string, Uint8Array> {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(buffer, { filter: createEntryFilter(limits) });
  } catch (err) {
    if (err instanceof AddonError) throw err;
    throw new AddonError("zip-invalid", `ZIP-Datei ist beschädigt: ${(err as Error).message}`);
  }
  const files = new Map(Object.entries(raw));
  // Nach dem Entpacken die tatsächliche Größe erneut prüfen
  let total = 0;
  for (const data of files.values()) total += data.length;
  if (total > limits.maxBytes) throw tooLarge(limits.maxBytes);
  return files;
}

/**
 * Der Filter läuft vor der Allokation jedes Eintrags. Er wirft, statt nur `false` zu liefern,
 * damit ein manipuliertes `originalSize` nie zu einer großen Allokation führt.
 */
function createEntryFilter(limits: PackageLimits): (file: UnzipFileInfo) => boolean {
  const seen = new Set<string>();
  let totalBytes = 0;
  return (file) => {
    checkEntryName(file.name, seen);
    if (file.name.endsWith("/")) return false;
    totalBytes += Math.max(file.originalSize, file.size);
    if (seen.size > limits.maxFiles) {
      throw new AddonError("too-many-files", `Paket enthält mehr als ${limits.maxFiles} Dateien`);
    }
    if (totalBytes > limits.maxBytes) throw tooLarge(limits.maxBytes);
    return true;
  };
}

function checkEntryName(name: string, seen: Set<string>): void {
  const path = name.endsWith("/") ? name.slice(0, -1) : name;
  if (!isSafeRelativePath(path)) {
    throw new AddonError("zip-slip", `Unzulässiger Pfad im Paket: ${name}`, { entry: name });
  }
  if (name.endsWith("/")) return;
  if (seen.has(name)) {
    throw new AddonError("zip-invalid", `Doppelter Eintrag im Paket: ${name}`, { entry: name });
  }
  seen.add(name);
}

function tooLarge(maxBytes: number): AddonError {
  const mb = (maxBytes / 1024 / 1024).toFixed(0);
  return new AddonError("too-large", `Paket ist entpackt größer als ${mb} MB`);
}

/** Entfernt einen gemeinsamen Wurzelordner, falls alle Dateien darin liegen */
function stripCommonRoot(files: Map<string, Uint8Array>): Map<string, Uint8Array> {
  const names = [...files.keys()];
  const first = names[0]?.split("/")[0];
  if (!first || names.some((name) => !name.startsWith(first + "/"))) return files;
  const prefix = first.length + 1;
  return new Map(names.map((name) => [name.slice(prefix), files.get(name) as Uint8Array]));
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch (err) {
    throw new AddonError(
      "manifest-invalid",
      `addon.json ist kein gültiges JSON: ${(err as Error).message}`,
    );
  }
}
