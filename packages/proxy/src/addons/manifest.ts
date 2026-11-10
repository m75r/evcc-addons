// Prüfung von addon.json
import type { AddonManifest, Localized } from "@evcc-addons/sdk";
import { SUPPORTED_API_VERSIONS } from "@evcc-addons/sdk";
import { isRecord } from "../util.js";
import { AddonError } from "./errors.js";
import { parseSettingDefs } from "./settings.js";

export const ADDON_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function isValidAddonId(id: string): boolean {
  return ADDON_ID_PATTERN.test(id);
}

export function parseManifest(raw: unknown): AddonManifest {
  if (!isRecord(raw)) throw invalid("addon.json", "muss ein JSON-Objekt sein");
  const manifest: AddonManifest = {
    id: parseId(raw.id),
    name: parseLocalized("name", raw.name),
    version: parseVersion(raw.version),
    entry: parseEntry(raw.entry),
    apiVersion: parseApiVersion(raw.apiVersion),
  };
  if (raw.description !== undefined) {
    manifest.description = parseLocalized("description", raw.description);
  }
  if (raw.server !== undefined) manifest.server = parseServer(raw.server, manifest.apiVersion);
  if (raw.settings !== undefined) manifest.settings = parseSettingDefs(raw.settings);
  return manifest;
}

export function invalid(field: string, problem: string): AddonError {
  return new AddonError("manifest-invalid", `Ungültiges Manifest: ${field} ${problem}`, { field });
}

function parseId(value: unknown): string {
  if (typeof value !== "string") throw invalid("id", "fehlt oder ist kein Text");
  if (!isValidAddonId(value)) {
    throw new AddonError(
      "id-invalid",
      `Ungültige id "${value}": erlaubt sind 2–40 Zeichen a-z, 0-9 und -, beginnend mit einem Buchstaben`,
    );
  }
  return value;
}

export function parseLocalized(field: string, value: unknown): Localized {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (isRecord(value)) {
    const entries = Object.entries(value);
    const valid =
      entries.length > 0 && entries.every(([, text]) => typeof text === "string" && text !== "");
    if (valid) return Object.fromEntries(entries) as Record<string, string>;
  }
  throw invalid(field, "muss ein Text oder ein Objekt { sprache: text } sein");
}

function parseVersion(value: unknown): string {
  if (typeof value !== "string") throw invalid("version", "fehlt oder ist kein Text");
  if (!VERSION_PATTERN.test(value)) {
    throw new AddonError("version-invalid", `Ungültige Version "${value}" (erwartet x.y.z[-pre])`);
  }
  return value;
}

function parseEntry(value: unknown): string {
  if (typeof value !== "string" || !/\.(m?js)$/.test(value)) {
    throw invalid("entry", "muss ein relativer Pfad auf eine .js- oder .mjs-Datei sein");
  }
  if (!isSafeRelativePath(value)) throw invalid("entry", "muss ein relativer Pfad sein");
  return value.replace(/^\.\//, "");
}

/** Server-Teil: nur ab apiVersion 2, relativer Pfad auf eine .mjs-Datei */
function parseServer(value: unknown, apiVersion: number): string {
  if (apiVersion < 2) throw invalid("server", "erfordert apiVersion 2");
  if (typeof value !== "string" || !value.endsWith(".mjs") || !isSafeRelativePath(value)) {
    throw invalid("server", "muss ein relativer Pfad auf eine .mjs-Datei sein");
  }
  return value.replace(/^\.\//, "");
}

function parseApiVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw invalid("apiVersion", "muss eine ganze Zahl sein");
  }
  if (!(SUPPORTED_API_VERSIONS as readonly number[]).includes(value)) {
    throw new AddonError(
      "api-version-unsupported",
      `apiVersion ${value} wird nicht unterstützt (unterstützt: ${SUPPORTED_API_VERSIONS.join(", ")})`,
    );
  }
  return value;
}

/** Relativer Pfad ohne `..`, Backslash, Laufwerksbuchstaben oder `__proto__` */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[a-zA-Z]:/.test(path)) {
    return false;
  }
  return path.split("/").every((segment) => segment !== ".." && segment !== "__proto__");
}
