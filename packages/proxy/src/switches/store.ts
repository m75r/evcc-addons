// Ablage der Steckdosen in <dataDir>/switches.json (0600, enthält Tapo-Passwörter)
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AddonError } from "../addons/errors.js";
import { errorMessage, isRecord } from "../util.js";
import { MAX_SWITCHES, SWITCH_TYPES, type SwitchConfig, type SwitchFields } from "./model.js";

const FILE_VERSION = 1;
const FILE_MODE = 0o600;
const STRING_FIELDS = ["id", "name", "host", "user", "password", "loadpoint", "token"] as const;

export class SwitchStore {
  readonly path: string;
  private switches: SwitchConfig[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
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
    this.switches = parseFile(text, this.path);
  }

  list(): SwitchConfig[] {
    return [...this.switches];
  }

  get(id: string): SwitchConfig {
    const found = this.switches.find((entry) => entry.id === id);
    if (!found) throw new AddonError("not-found", `Steckdose ${id} gibt es nicht`, { id });
    return found;
  }

  create(fields: SwitchFields): Promise<SwitchConfig> {
    return this.serialized(async () => {
      if (this.switches.length >= MAX_SWITCHES) {
        throw new AddonError("switch-invalid", `Höchstens ${MAX_SWITCHES} Steckdosen möglich`);
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
    const text = JSON.stringify({ version: FILE_VERSION, switches: next }, null, 2) + "\n";
    try {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(tmp, text, { mode: FILE_MODE });
      await chmod(tmp, FILE_MODE);
      await rename(tmp, this.path);
    } catch (err) {
      throw new Error(`${this.path} nicht gespeichert: ${errorMessage(err)}`, { cause: err });
    }
    this.switches = next;
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

function parseFile(text: string, path: string): SwitchConfig[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.switches)) {
      throw new Error("erwartet { version, switches: [...] }");
    }
    return parsed.switches.map((entry, index) => parseEntry(entry, index));
  } catch (err) {
    throw new Error(`${path} ungültig: ${errorMessage(err)}`, { cause: err });
  }
}

function parseEntry(entry: unknown, index: number): SwitchConfig {
  if (!isRecord(entry)) throw new Error(`Eintrag ${index} ist kein Objekt`);
  const type = entry.type as SwitchConfig["type"];
  if (!SWITCH_TYPES.includes(type)) {
    throw new Error(`Eintrag ${index}: unbekannter Typ ${JSON.stringify(entry.type)}`);
  }
  const fields = Object.fromEntries(
    STRING_FIELDS.map((field) => [field, stringOf(entry, field, index)]),
  ) as Record<(typeof STRING_FIELDS)[number], string>;
  return { ...fields, type };
}

function stringOf(entry: Record<string, unknown>, field: string, index: number): string {
  const value = entry[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Eintrag ${index}: Feld ${field} fehlt`);
  }
  return value;
}
