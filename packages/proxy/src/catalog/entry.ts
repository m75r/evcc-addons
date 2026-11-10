// Katalogeintrag addons/<id>.yaml: Parsen und Prüfen
import type { Localized } from "@evcc-addons/sdk";
import { parse as parseYaml } from "yaml";
import { AddonError } from "../addons/errors.js";
import { VERSION_PATTERN, isValidAddonId, parseLocalized } from "../addons/manifest.js";
import { errorMessage, isRecord } from "../util.js";

export interface CatalogEntry {
  id: string;
  name: Localized;
  description: Localized;
  homepage: string;
  version: string;
  apiVersion: number;
  /** Download-URL der ZIP, `{version}` ist bereits ersetzt */
  url: string;
  /** sha256 der ZIP, Kleinbuchstaben */
  sha256: string;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/** Parst eine Katalogdatei; jeder Fehler ergibt `catalog-invalid` mit dem Dateinamen */
export function parseCatalogFile(text: string, fileName: string): CatalogEntry {
  const raw = readYaml(text, fileName);
  const field = new FieldReader(raw, fileName);
  const version = field.version("version");
  return {
    id: field.id(fileName.replace(/\.yaml$/, "")),
    name: field.localized("name"),
    description: field.localized("description"),
    homepage: field.url("homepage", (url) => url),
    version,
    apiVersion: field.apiVersion("apiVersion"),
    url: field.url("url", (url) => url.replaceAll("{version}", version)),
    sha256: field.sha256("sha256"),
  };
}

function readYaml(text: string, fileName: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw invalidEntry(fileName, `YAML ungültig: ${errorMessage(err)}`);
  }
  if (!isRecord(raw)) throw invalidEntry(fileName, "muss ein YAML-Objekt sein");
  return raw;
}

function invalidEntry(fileName: string, problem: string): AddonError {
  return new AddonError("catalog-invalid", `Ungültiger Katalogeintrag ${fileName}: ${problem}`, {
    file: fileName,
  });
}

/** Liest und prüft einzelne Felder; die Meldungen nennen Datei und Feld */
class FieldReader {
  constructor(
    private readonly raw: Record<string, unknown>,
    private readonly fileName: string,
  ) {}

  id(expected: string): string {
    const value = this.text("id");
    if (!isValidAddonId(value)) this.fail("id", `"${value}" ist keine gültige Addon-id`);
    if (value !== expected) {
      this.fail("id", `"${value}" muss dem Dateinamen ${expected} entsprechen`);
    }
    return value;
  }

  localized(field: string): Localized {
    try {
      return parseLocalized(field, this.raw[field]);
    } catch {
      return this.fail(field, "muss ein Text oder ein Objekt { sprache: text } sein");
    }
  }

  url(field: string, transform: (url: string) => string): string {
    const value = transform(this.text(field));
    let protocol: string | undefined;
    try {
      protocol = new URL(value).protocol;
    } catch {
      protocol = undefined;
    }
    if (protocol !== "http:" && protocol !== "https:") {
      this.fail(field, "muss eine http(s)-URL sein");
    }
    return value;
  }

  version(field: string): string {
    const value = this.text(field);
    if (!VERSION_PATTERN.test(value)) this.fail(field, `"${value}" ist keine Version x.y.z[-pre]`);
    return value;
  }

  apiVersion(field: string): number {
    const value = this.raw[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      this.fail(field, "muss eine ganze Zahl ≥ 1 sein");
    }
    return value;
  }

  sha256(field: string): string {
    const value = this.text(field).toLowerCase();
    if (!SHA256_PATTERN.test(value)) this.fail(field, "muss 64 Hex-Zeichen haben");
    return value;
  }

  private text(field: string): string {
    const value = this.raw[field];
    if (typeof value !== "string" || value === "") this.fail(field, "fehlt oder ist kein Text");
    return value;
  }

  private fail(field: string, problem: string): never {
    throw invalidEntry(this.fileName, `${field} ${problem}`);
  }
}
