// Einstellungen von Addons: Schema aus addon.json prüfen, gespeicherte und neue Werte prüfen
import type {
  SelectSettingDef,
  SettingDef,
  SettingOption,
  SettingValue,
  SettingValues,
} from "@evcc-addons/sdk";
import { isRecord } from "../util.js";
import { AddonError } from "./errors.js";
import { invalid, parseLocalized } from "./manifest.js";

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const MAX_SETTINGS = 20;
const MAX_OPTIONS = 20;
const MAX_OPTION_LENGTH = 40;

/** Prüft `settings` aus addon.json; Fehler nennen den Pfad, z. B. `settings[0].key` */
export function parseSettingDefs(raw: unknown): SettingDef[] {
  if (!Array.isArray(raw)) throw invalid("settings", "muss eine Liste sein");
  if (raw.length > MAX_SETTINGS) {
    throw invalid("settings", `darf höchstens ${MAX_SETTINGS} Einträge haben`);
  }
  const defs = raw.map((entry: unknown, index) => parseDef(entry, `settings[${index}]`));
  assertUnique(
    defs.map((def) => def.key),
    (index) => `settings[${index}].key`,
  );
  return defs;
}

function parseDef(raw: unknown, path: string): SettingDef {
  if (!isRecord(raw)) throw invalid(path, "muss ein Objekt sein");
  if (typeof raw.key !== "string" || !KEY_PATTERN.test(raw.key)) {
    throw invalid(
      `${path}.key`,
      "muss 1–40 Zeichen a-z, A-Z, 0-9, _ und - haben, mit Buchstabe vorn",
    );
  }
  const base = { key: raw.key, label: parseLocalized(`${path}.label`, raw.label) };
  if (raw.type === "boolean") {
    if (typeof raw.default !== "boolean")
      throw invalid(`${path}.default`, "muss true oder false sein");
    return { ...base, type: "boolean", default: raw.default };
  }
  if (raw.type === "select") return parseSelect(base, raw, path);
  throw invalid(`${path}.type`, 'muss "boolean" oder "select" sein');
}

function parseSelect(
  base: Pick<SelectSettingDef, "key" | "label">,
  raw: Record<string, unknown>,
  path: string,
): SelectSettingDef {
  const options = parseOptions(raw.options, `${path}.options`);
  if (!options.some((option) => option.value === raw.default)) {
    throw invalid(`${path}.default`, "muss eine der options sein");
  }
  return { ...base, type: "select", default: raw.default as string, options };
}

function parseOptions(raw: unknown, path: string): SettingOption[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPTIONS) {
    throw invalid(path, `muss eine Liste mit 1–${MAX_OPTIONS} Einträgen sein`);
  }
  const options = raw.map((entry: unknown, index): SettingOption => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) throw invalid(itemPath, "muss ein Objekt sein");
    const { value } = entry;
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_OPTION_LENGTH) {
      throw invalid(`${itemPath}.value`, `muss ein Text mit 1–${MAX_OPTION_LENGTH} Zeichen sein`);
    }
    return { value, label: parseLocalized(`${itemPath}.label`, entry.label) };
  });
  assertUnique(
    options.map((option) => option.value),
    (index) => `${path}[${index}].value`,
  );
  return options;
}

function assertUnique(values: string[], pathOf: (index: number) => string): void {
  const index = values.findIndex((value, i) => values.indexOf(value) !== i);
  if (index >= 0) throw invalid(pathOf(index), `"${values[index]}" ist doppelt`);
}

/** Nur bekannte Schlüssel mit gültigem Wert, ohne Defaults; `stored` darf beliebig sein */
export function keepValidValues(defs: SettingDef[], stored: unknown): SettingValues {
  if (!isRecord(stored)) return {};
  const values: SettingValues = {};
  for (const def of defs) {
    const value = Object.hasOwn(stored, def.key) ? stored[def.key] : undefined;
    if (problemOf(def, value) === null) values[def.key] = value as SettingValue;
  }
  return values;
}

/** Gespeicherte gültige Werte, fehlende mit `default` */
export function resolveSettingValues(defs: SettingDef[], stored: unknown): SettingValues {
  const defaults = Object.fromEntries(defs.map((def) => [def.key, def.default]));
  return { ...defaults, ...keepValidValues(defs, stored) };
}

/** Prüft neue Werte (Teilmenge erlaubt), sonst `settings-invalid` mit „<key>: …“ */
export function validateSettingValues(defs: SettingDef[], input: unknown): SettingValues {
  if (!isRecord(input)) throw new AddonError("settings-invalid", "values: muss ein Objekt sein");
  const values: SettingValues = {};
  for (const [key, value] of Object.entries(input)) {
    const def = defs.find((candidate) => candidate.key === key);
    const problem = def ? problemOf(def, value) : "unbekannte Einstellung";
    if (problem !== null) throw new AddonError("settings-invalid", `${key}: ${problem}`, { key });
    values[key] = value as SettingValue;
  }
  return values;
}

/** Beschreibung des Problems mit `value`, `null` wenn gültig */
function problemOf(def: SettingDef, value: unknown): string | null {
  if (def.type === "boolean")
    return typeof value === "boolean" ? null : "muss true oder false sein";
  if (typeof value !== "string") return "muss ein Text sein";
  if (!def.options.some((option) => option.value === value)) {
    return `unbekannte Option ${JSON.stringify(value)}`;
  }
  return null;
}
