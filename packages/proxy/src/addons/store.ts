// Ablage installierter Addons: <dataDir>/addons/<id>/… und <dataDir>/state.json
import type { AddonManifest, SettingValues } from "@evcc-addons/sdk";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "../logger.js";
import { errorMessage, isRecord } from "../util.js";
import { AddonError } from "./errors.js";
import { isValidAddonId, parseManifest } from "./manifest.js";
import { MANIFEST_FILE, readAddonZip, type PackageLimits } from "./package.js";
import { keepValidValues, resolveSettingValues, validateSettingValues } from "./settings.js";
import type { StatusRegistry } from "./status.js";

export interface InstalledAddon {
  manifest: AddonManifest;
  enabled: boolean;
  /** Einstellungen, mit Defaults aufgelöst */
  settings: SettingValues;
}

export interface InstallResult {
  addon: InstalledAddon;
  previousVersion: string | null;
}

/** Eintrag je Addon in state.json; `settings` enthält nur ausdrücklich gesetzte Werte */
interface StoredEntry {
  enabled: boolean;
  settings?: Record<string, unknown>;
}

interface StoreState {
  addons: Record<string, StoredEntry>;
}

export interface StoreOptions {
  dataDir: string;
  logger: Logger;
  status?: StatusRegistry;
  limits?: Partial<PackageLimits>;
  /** Austauschbar, um Schreibfehler im Test zu simulieren */
  writeFile?: typeof writeFile;
}

export class AddonStore {
  readonly addonsDir: string;
  private readonly statePath: string;
  private readonly limits: PackageLimits;
  private readonly write: typeof writeFile;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: StoreOptions) {
    this.addonsDir = join(opts.dataDir, "addons");
    this.statePath = join(opts.dataDir, "state.json");
    this.limits = { maxBytes: 10 * 1024 * 1024, maxFiles: 500, ...opts.limits };
    this.write = opts.writeFile ?? writeFile;
  }

  /** Liest bei jedem Aufruf von der Platte (konsistent mit dem CLI) */
  async list(): Promise<InstalledAddon[]> {
    const [ids, state] = await Promise.all([this.installedIds(), this.readState()]);
    const addons: InstalledAddon[] = [];
    for (const id of ids) {
      const manifest = await this.readManifest(id).catch((err: unknown) => {
        this.opts.logger.warn("addon manifest unreadable", { id, error: errorMessage(err) });
        return null;
      });
      if (manifest) addons.push(toInstalled(manifest, state.addons[id]));
    }
    return addons;
  }

  async get(id: string): Promise<InstalledAddon> {
    const manifest = await this.readManifest(id);
    const state = await this.readState();
    return toInstalled(manifest, state.addons[id]);
  }

  install(buffer: Uint8Array): Promise<InstallResult> {
    return this.serialized(() => this.doInstall(buffer));
  }

  setEnabled(id: string, enabled: boolean): Promise<InstalledAddon> {
    return this.serialized(async () => {
      const { manifest } = await this.get(id);
      const entry = await this.mergeEntry(id, (prev) => ({ ...prev, enabled }));
      return toInstalled(manifest, entry);
    });
  }

  /** Speichert eine Teilmenge der Einstellungen; ungültige Werte ergeben `settings-invalid` */
  setSettings(id: string, values: unknown): Promise<InstalledAddon> {
    return this.serialized(async () => {
      try {
        return await this.doSetSettings(id, values);
      } catch (err) {
        if (err instanceof AddonError) throw err;
        throw new Error(`Einstellungen von ${id} nicht gespeichert: ${errorMessage(err)}`, {
          cause: err,
        });
      }
    });
  }

  remove(id: string): Promise<void> {
    return this.serialized(async () => {
      await this.get(id);
      await rm(join(this.addonsDir, id), { recursive: true, force: true });
      await this.updateState((state) => delete state.addons[id]);
      this.opts.status?.clear(id);
    });
  }

  /** Entfernt alle installierten Addons (CLI `--reset`) */
  async removeAll(): Promise<void> {
    for (const id of await this.installedIds()) await this.remove(id);
    await this.serialized(() => this.updateState((state) => (state.addons = {})));
  }

  /** Verzeichnis eines installierten Addons; unbekannte ids ergeben `not-found` */
  dirOf(id: string): string {
    if (!isValidAddonId(id)) throw notFound(id);
    return join(this.addonsDir, id);
  }

  private async doInstall(buffer: Uint8Array): Promise<InstallResult> {
    const pkg = readAddonZip(buffer, this.limits);
    const { id } = pkg.manifest;
    const previous = await this.findPrevious(id);
    const tmpDir = join(this.addonsDir, `.tmp-${id}-${randomSuffix()}`);
    try {
      await this.writeFiles(tmpDir, pkg.files);
      await this.swapIn(tmpDir, join(this.addonsDir, id));
    } catch (err) {
      await rm(tmpDir, { recursive: true, force: true });
      throw new Error(`Installation von ${id} fehlgeschlagen: ${errorMessage(err)}`, {
        cause: err,
      });
    }
    const enabled = previous?.enabled ?? true;
    const entry = await this.mergeEntry(id, (prev) => ({ ...prev, enabled }));
    this.opts.status?.clear(id);
    return {
      addon: toInstalled(pkg.manifest, entry),
      previousVersion: previous?.manifest.version ?? null,
    };
  }

  /** Mischt mit den roh gespeicherten Werten, damit Defaults nie in state.json landen */
  private async doSetSettings(id: string, values: unknown): Promise<InstalledAddon> {
    const { manifest } = await this.get(id);
    const defs = manifest.settings ?? [];
    const input = validateSettingValues(defs, values);
    const entry = await this.mergeEntry(id, (prev) => ({
      ...prev,
      enabled: prev?.enabled ?? true,
      settings: { ...keepValidValues(defs, prev?.settings), ...input },
    }));
    return toInstalled(manifest, entry);
  }

  /** Ersetzt den Eintrag einer id durch `change(bisheriger Eintrag)` und liefert ihn zurück */
  private async mergeEntry(
    id: string,
    change: (prev: StoredEntry | undefined) => StoredEntry,
  ): Promise<StoredEntry> {
    let entry: StoredEntry = { enabled: true };
    await this.updateState((state) => {
      entry = change(state.addons[id]);
      state.addons[id] = entry;
    });
    return entry;
  }

  /** Bisher installierte Version; ein unlesbares altes Manifest wird überschrieben */
  private async findPrevious(id: string): Promise<InstalledAddon | null> {
    try {
      return await this.get(id);
    } catch (err) {
      if (err instanceof AddonError && err.code === "not-found") return null;
      this.opts.logger.warn("previous addon unreadable", { id, error: errorMessage(err) });
      return null;
    }
  }

  private async writeFiles(dir: string, files: Map<string, Uint8Array>): Promise<void> {
    for (const [name, data] of files) {
      const path = join(dir, name);
      await mkdir(dirname(path), { recursive: true });
      await this.write(path, data);
    }
  }

  /** Tauscht das neue Verzeichnis per Rename ein; das alte bleibt bis zum Erfolg erhalten */
  private async swapIn(newDir: string, targetDir: string): Promise<void> {
    const oldDir = `${dirname(targetDir)}/.old-${randomSuffix()}`;
    const hadOld = await rename(targetDir, oldDir).then(
      () => true,
      (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return false;
        throw err;
      },
    );
    try {
      await rename(newDir, targetDir);
    } catch (err) {
      if (hadOld) await rename(oldDir, targetDir);
      throw err;
    }
    if (hadOld) await rm(oldDir, { recursive: true, force: true });
  }

  private async installedIds(): Promise<string[]> {
    try {
      const entries = await readdir(this.addonsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && isValidAddonId(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error(`Addon-Verzeichnis ${this.addonsDir} nicht lesbar: ${errorMessage(err)}`, {
        cause: err,
      });
    }
  }

  private async readManifest(id: string): Promise<AddonManifest> {
    const path = join(this.dirOf(id), MANIFEST_FILE);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw notFound(id);
      throw err;
    }
    return parseManifest(JSON.parse(text));
  }

  private async readState(): Promise<StoreState> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.statePath, "utf8"));
      const addons = isRecord(parsed) && isRecord(parsed.addons) ? parsed.addons : {};
      return { addons: addons as StoreState["addons"] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { addons: {} };
      throw new Error(`state.json nicht lesbar: ${errorMessage(err)}`, { cause: err });
    }
  }

  /** Schreibt state.json atomar (tmp-Datei + rename) */
  private async updateState(change: (state: StoreState) => unknown): Promise<void> {
    const state = await this.readState();
    change(state);
    await mkdir(dirname(this.statePath), { recursive: true });
    const tmp = `${this.statePath}.tmp-${randomSuffix()}`;
    await this.write(tmp, JSON.stringify(state, null, 2) + "\n");
    await rename(tmp, this.statePath);
  }

  /** Schreibende Aktionen laufen nacheinander, damit state.json konsistent bleibt */
  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Manifest und gespeicherter Eintrag → InstalledAddon mit aufgelösten Einstellungen */
function toInstalled(manifest: AddonManifest, entry: StoredEntry | undefined): InstalledAddon {
  return {
    manifest,
    enabled: entry?.enabled ?? true,
    settings: resolveSettingValues(manifest.settings ?? [], entry?.settings),
  };
}

function notFound(id: string): AddonError {
  return new AddonError("not-found", `Addon ${id} ist nicht installiert`, { id });
}

function randomSuffix(): string {
  return randomBytes(4).toString("hex");
}
