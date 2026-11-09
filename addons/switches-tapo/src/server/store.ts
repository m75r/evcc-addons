// Ablage der Steckdosen in <addon-data>/switches.json (0600, enthält Tapo-Passwörter).
// Version 1 (bis 1.2.x, Feld `loadpoint`) wird gelesen, geschrieben wird immer Version 2 (`target`).
import type { ServerLogger } from "@evcc-addons/sdk/server";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SwitchInputError, SwitchNotFoundError } from "./errors.js";
import { errorMessage, isRecord } from "./util.js";
import {
  MAX_SWITCHES,
  SWITCH_TYPES,
  TARGET_KINDS,
  type SwitchConfig,
  type SwitchFields,
  type SwitchTarget,
  type TargetKind,
} from "./model.js";

export const STORE_VERSION = 2;
const KNOWN_VERSIONS = [1, 2];
const FILE_MODE = 0o600;
const STRING_FIELDS = ["id", "name", "host", "user", "password", "token"] as const;

export class SwitchStore {
  readonly path: string;
  private switches: SwitchConfig[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  /** Version der gelesenen Datei, solange sie älter ist und noch nicht neu geschrieben wurde */
  private upgradeFrom: number | null = null;

  constructor(
    dataDir: string,
    private readonly logger?: ServerLogger,
  ) {
    this.path = join(dataDir, "switches.json");
  }

  /** Liest die Datei; fehlt sie, ist die Liste leer, ungültiger Inhalt ergibt einen Fehler */
  async load(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return void (this.switches = []);
      throw new Error(`${this.path} nicht lesbar: ${errorMessage(err)}`, { cause: err });
    }
    const file = parseFile(text, this.path);
    this.switches = file.switches;
    this.upgradeFrom = file.version < STORE_VERSION ? file.version : null;
  }

  list(): SwitchConfig[] {
    return [...this.switches];
  }

  get(id: string): SwitchConfig {
    const found = this.switches.find((entry) => entry.id === id);
    if (!found) throw new SwitchNotFoundError(id);
    return found;
  }

  create(fields: SwitchFields): Promise<SwitchConfig> {
    return this.serialized(async () => {
      if (this.switches.length >= MAX_SWITCHES) {
        throw new SwitchInputError(`Höchstens ${MAX_SWITCHES} Steckdosen möglich`, "body");
      }
      const entry: SwitchConfig = { ...fields, id: this.newId(), token: newToken() };
      await this.persist([...this.switches, entry]);
      return entry;
    });
  }

  update(id: string, fields: SwitchFields): Promise<SwitchConfig> {
    return this.replace(id, (prev) => ({ ...prev, ...fields }));
  }

  renewToken(id: string): Promise<SwitchConfig> {
    return this.replace(id, (prev) => ({ ...prev, token: newToken() }));
  }

  remove(id: string): Promise<void> {
    return this.serialized(async () => {
      this.get(id);
      await this.persist(this.switches.filter((entry) => entry.id !== id));
    });
  }

  private replace(id: string, change: (prev: SwitchConfig) => SwitchConfig) {
    return this.serialized(async () => {
      const next = change(this.get(id));
      await this.persist(this.switches.map((entry) => (entry.id === id ? next : entry)));
      return next;
    });
  }

  private newId(): string {
    let id: string;
    do id = randomBytes(4).toString("hex");
    while (this.switches.some((entry) => entry.id === id));
    return id;
  }

  /** Atomar: tmp-Datei mit 0600 schreiben, dann umbenennen; erst danach gilt der neue Stand */
  private async persist(next: SwitchConfig[]): Promise<void> {
    const tmp = `${this.path}.tmp`;
    const text = JSON.stringify({ version: STORE_VERSION, switches: next }, null, 2) + "\n";
    try {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(tmp, text, { mode: FILE_MODE });
      await chmod(tmp, FILE_MODE);
      await rename(tmp, this.path);
    } catch (err) {
      throw new Error(`${this.path} nicht gespeichert: ${errorMessage(err)}`, { cause: err });
    }
    this.switches = next;
    this.logUpgrade();
  }

  private logUpgrade(): void {
    if (this.upgradeFrom === null) return;
    this.logger?.info("switches store upgraded", { from: this.upgradeFrom, to: STORE_VERSION });
    this.upgradeFrom = null;
  }

  /** Schreibende Aktionen laufen nacheinander */
  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

interface StoreFile {
  version: number;
  switches: SwitchConfig[];
}

function parseFile(text: string, path: string): StoreFile {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.switches)) {
      throw new Error("erwartet { version, switches: [...] }");
    }
    const version = parsed.version ?? 1;
    if (typeof version !== "number" || !KNOWN_VERSIONS.includes(version)) {
      throw new Error(`Version ${JSON.stringify(version)} unbekannt`);
    }
    return { version, switches: parsed.switches.map((entry, i) => parseEntry(entry, i, version)) };
  } catch (err) {
    throw new Error(`${path} ungültig: ${errorMessage(err)}`, { cause: err });
  }
}

function parseEntry(entry: unknown, index: number, version: number): SwitchConfig {
  if (!isRecord(entry)) throw new Error(`Eintrag ${index} ist kein Objekt`);
  const type = entry.type as SwitchConfig["type"];
  if (!SWITCH_TYPES.includes(type)) {
    throw new Error(`Eintrag ${index}: unbekannter Typ ${JSON.stringify(entry.type)}`);
  }
  const fields = Object.fromEntries(
    STRING_FIELDS.map((field) => [field, stringOf(entry, field, index)]),
  ) as Record<(typeof STRING_FIELDS)[number], string>;
  return { ...fields, type, target: parseTarget(entry, index, version) };
}

/** Version 1 kannte nur Ladepunkte (`loadpoint: "<Titel>"`) */
function parseTarget(entry: Record<string, unknown>, index: number, version: number): SwitchTarget {
  if (version === 1) return { kind: "loadpoint", title: stringOf(entry, "loadpoint", index) };
  const target = entry.target;
  if (!isRecord(target) || !TARGET_KINDS.includes(target.kind as TargetKind)) {
    throw new Error(`Eintrag ${index}: Feld target fehlt oder ist ungültig`);
  }
  return { kind: target.kind as TargetKind, title: stringOf(target, "title", index) };
}

function stringOf(entry: Record<string, unknown>, field: string, index: number): string {
  const value = entry[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Eintrag ${index}: Feld ${field} fehlt`);
  }
  return value;
}
