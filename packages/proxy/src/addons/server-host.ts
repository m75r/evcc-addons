// Lebenszyklus der Server-Teile (server.mjs) installierter Addons: laden, stoppen, abgleichen, routen
import type { SettingValues } from "@evcc-addons/sdk";
import type { ServerActivateFn, ServerAddonHandle } from "@evcc-addons/sdk/server";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { redactPath } from "../http/redact.js";
import type { Logger } from "../logger.js";
import { errorMessage, isRecord, safeDecode } from "../util.js";
import { ensureAddonDataDir } from "./addon-data.js";
import { AddonError } from "./errors.js";
import { createServerApi, type ServerApiInstance, type ServerRoute } from "./server-api.js";
import { ServerAddonError } from "./server-error.js";
import type { StatusRegistry } from "./status.js";
import type { AddonStore, InstalledAddon } from "./store.js";

export interface ServerAddonHostOptions {
  store: AddonStore;
  status: StatusRegistry;
  logger: Logger;
  /** dataDir des Proxys (nicht des Addons) */
  dataDir: string;
  evccUrl: string;
  /** Austauschbar für Tests */
  importModule?: (url: string) => Promise<unknown>;
}

/** Geladener oder beim Start gescheiterter Server-Teil (`instance` ist dann null) */
interface Loaded {
  version: string;
  installedAt: string | null;
  instance: ServerApiInstance | null;
  handle: ServerAddonHandle | null;
}

type StopReason = "removed" | "disabled" | "no-server" | "reload" | "shutdown";

const defaultImport = (url: string): Promise<unknown> => import(url);

export class ServerAddonHost {
  private readonly loaded = new Map<string, Loaded>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private loadCount = 0;

  constructor(private readonly opts: ServerAddonHostOptions) {}

  /** Startet alle aktiven Server-Teile; ein Fehler betrifft nur das jeweilige Addon */
  async startAll(): Promise<void> {
    try {
      await this.reconcile();
    } catch (err) {
      this.opts.logger.error("server addons not started", { error: errorMessage(err) });
    }
  }

  /** Gleicht mit dem Store ab: installiert, aktiv, Version und `installedAt` (alle oder nur `id`) */
  async reconcile(id?: string): Promise<void> {
    if (id !== undefined) return this.serialized(id, () => this.apply(id, false));
    const addons = await this.opts.store.list();
    const byId = new Map(addons.map((addon) => [addon.manifest.id, addon]));
    for (const each of new Set([...byId.keys(), ...this.loaded.keys()])) {
      await this.reconcileListed(each, byId.get(each) ?? null);
    }
  }

  /** Stoppt und lädt neu, wenn das Addon installiert und aktiv ist (nach Installation, Umschalten) */
  sync(id: string): Promise<void> {
    return this.serialized(id, () => this.apply(id, true));
  }

  /** Stoppt den Server-Teil, z. B. vor dem Deinstallieren */
  stop(id: string): Promise<void> {
    return this.serialized(id, () => this.unload(id, "removed"));
  }

  settingsChanged(id: string, values: SettingValues): void {
    this.loaded.get(id)?.instance?.emitSettings(values);
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.loaded.keys()]) {
      await this.serialized(id, () => this.unload(id, "shutdown"));
    }
  }

  /** Anfrage auf `/addons-api/ext/<id><subPath>`; nicht installiert oder deaktiviert → 404 */
  async handle(req: IncomingMessage, res: ServerResponse, id: string, subPath: string) {
    await this.reconcile(id);
    const instance = this.loaded.get(id)?.instance;
    if (!instance) {
      throw new AddonError("not-found", `Addon ${id} hat keinen laufenden Server-Teil`, { id });
    }
    const { route, params } = matchRoute(instance.routes, req.method ?? "GET", subPath);
    await this.invoke(id, route, params, req, res);
  }

  private async invoke(
    id: string,
    route: ServerRoute,
    params: string[],
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      await route.handler(req, res, params);
    } catch (err) {
      if (err instanceof ServerAddonError || err instanceof AddonError) throw err;
      const error = errorMessage(err);
      const path = redactPath(req.url);
      this.opts.logger.error("server addon request failed", { addon: id, path, error });
      throw new ServerAddonError(500, "internal", `Interner Fehler im Addon ${id}: ${error}`);
    }
  }

  private async reconcileListed(id: string, addon: InstalledAddon | null): Promise<void> {
    try {
      await this.serialized(id, () => this.apply(id, false, addon));
    } catch (err) {
      this.opts.logger.warn("server addon reconcile failed", {
        addon: id,
        error: errorMessage(err),
      });
    }
  }

  /** Stoppt, startet oder lädt neu; `known` spart das erneute Lesen aus dem Store */
  private async apply(id: string, force: boolean, known?: InstalledAddon | null): Promise<void> {
    const addon = known === undefined ? await this.find(id) : known;
    const reason = stopReason(addon);
    const current = this.loaded.get(id);
    if (reason || !addon) return current ? this.unload(id, reason ?? "removed") : undefined;
    if (current && !force && sameInstall(current, addon)) return;
    if (current) await this.unload(id, "reload");
    await this.load(addon);
  }

  private async find(id: string): Promise<InstalledAddon | null> {
    try {
      return await this.opts.store.get(id);
    } catch (err) {
      if (err instanceof AddonError && err.code === "not-found") return null;
      throw err;
    }
  }

  private async load(addon: InstalledAddon): Promise<void> {
    const { id, version } = addon.manifest;
    const entry: Loaded = { version, installedAt: addon.installedAt, instance: null, handle: null };
    this.loaded.set(id, entry);
    let phase = "import";
    try {
      const activate = await this.importActivate(addon);
      phase = "activate";
      const instance = createServerApi(addon.manifest, await this.apiDeps(addon));
      entry.handle = toHandle(await activate(instance.api));
      entry.instance = instance;
      this.started(id, version, instance.routes.length);
    } catch (err) {
      this.failed(id, phase, err);
    }
  }

  private started(id: string, version: string, routes: number): void {
    this.opts.status.reportServer(id, null);
    this.opts.logger.info("server addon started", { addon: id, version, routes });
  }

  /** Der Fehler erscheint als Startfehler auf der Karte; das Gateway antwortet bis dahin 404 */
  private failed(id: string, phase: string, err: unknown): void {
    this.opts.status.reportServer(id, `Server-Teil: ${errorMessage(err)}`);
    this.opts.logger.warn("server addon failed", { addon: id, phase, error: errorMessage(err) });
  }

  /** Import mit `?v=<version>&t=<Zeit>`, sonst lieferte der ESM-Cache nach einem Update alten Code */
  private async importActivate(addon: InstalledAddon): Promise<ServerActivateFn> {
    const { id, version, server = "" } = addon.manifest;
    const file = pathToFileURL(join(this.opts.store.dirOf(id), server)).href;
    const query = `v=${encodeURIComponent(version)}&t=${Date.now()}-${++this.loadCount}`;
    const mod = await (this.opts.importModule ?? defaultImport)(`${file}?${query}`);
    const activate = isRecord(mod) ? mod.activateServer : undefined;
    if (typeof activate !== "function") {
      throw new Error(`${server} exportiert keine Funktion activateServer`);
    }
    return activate as ServerActivateFn;
  }

  private async apiDeps(addon: InstalledAddon) {
    const { id } = addon.manifest;
    return {
      dataDir: await ensureAddonDataDir(this.opts.dataDir, id),
      evccUrl: this.opts.evccUrl,
      logger: this.opts.logger.child({ addon: id }),
      settings: addon.settings,
    };
  }

  /** Entfernt den Eintrag und löscht den Server-Fehler; `stop()` nur bei laufendem Server-Teil */
  private async unload(id: string, reason: StopReason): Promise<void> {
    const entry = this.loaded.get(id);
    this.loaded.delete(id);
    this.opts.status.reportServer(id, null);
    if (!entry?.instance) return;
    try {
      await entry.handle?.stop();
    } catch (err) {
      this.opts.logger.warn("server addon stop failed", { addon: id, error: errorMessage(err) });
    }
    this.opts.logger.info("server addon stopped", { addon: id, reason });
  }

  /** Aktionen je Addon laufen nacheinander, damit kein Server-Teil doppelt startet */
  private serialized<T>(id: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(id) ?? Promise.resolve()).then(task);
    const tail = run.catch(() => undefined);
    this.queues.set(id, tail);
    void tail.then(() => this.queues.get(id) === tail && this.queues.delete(id));
    return run;
  }
}

function stopReason(addon: InstalledAddon | null): StopReason | null {
  if (!addon) return "removed";
  if (!addon.enabled) return "disabled";
  return addon.manifest.server ? null : "no-server";
}

function sameInstall(current: Loaded, addon: InstalledAddon): boolean {
  return current.version === addon.manifest.version && current.installedAt === addon.installedAt;
}

function toHandle(value: unknown): ServerAddonHandle | null {
  return isHandle(value) ? value : null;
}

function isHandle(value: unknown): value is ServerAddonHandle {
  return isRecord(value) && typeof value.stop === "function";
}

/** Route zum Sub-Pfad; passt nur der Pfad, nicht die Methode → 405 */
function matchRoute(routes: ServerRoute[], method: string, subPath: string) {
  let pathMatched = false;
  for (const route of routes) {
    const result = route.pattern.exec(subPath);
    if (!result) continue;
    pathMatched = true;
    if (route.method !== method) continue;
    return { route, params: result.slice(1).map((param) => safeDecode(param ?? "")) };
  }
  if (pathMatched) throw new ServerAddonError(405, "method-not-allowed", `${method} nicht erlaubt`);
  throw new AddonError("not-found", `Unbekannter Pfad ${subPath}`);
}
