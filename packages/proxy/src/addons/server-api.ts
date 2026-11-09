// ServerApi für den Server-Teil eines Addons: Routen, Login-Prüfung, JSON-Helfer, Fehler, Einstellungen
import type { AddonManifest, SettingValues } from "@evcc-addons/sdk";
import type {
  ServerApi,
  ServerAuth,
  ServerHandler,
  ServerHttpMethod,
  ServerSettings,
} from "@evcc-addons/sdk/server";
import { checkAdmin, requireAdmin } from "../api/auth.js";
import { readJsonBody } from "../http/body.js";
import { sendJson } from "../http/json.js";
import type { Logger } from "../logger.js";
import { errorMessage } from "../util.js";
import { ServerAddonError } from "./server-error.js";

export interface ServerRoute {
  method: ServerHttpMethod;
  pattern: RegExp;
  handler: ServerHandler;
}

export interface ServerApiDeps {
  /** Datenordner des Addons (`addon-data/<id>`) */
  dataDir: string;
  evccUrl: string;
  /** Logger mit dem Feld `addon=<id>` */
  logger: Logger;
  /** Aufgelöste Einstellungen beim Start */
  settings: SettingValues;
}

export interface ServerApiInstance {
  api: ServerApi;
  routes: ServerRoute[];
  /** Gibt gespeicherte Einstellungen an `settings.onChange` weiter */
  emitSettings(values: SettingValues): void;
}

const METHODS: readonly string[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function createServerApi(manifest: AddonManifest, deps: ServerApiDeps): ServerApiInstance {
  const routes: ServerRoute[] = [];
  const settings = createSettings(deps.settings, deps.logger);
  const api: ServerApi = {
    id: manifest.id,
    version: manifest.version,
    dataDir: deps.dataDir,
    evccUrl: deps.evccUrl,
    logger: deps.logger,
    settings: settings.api,
    route: (method, pattern, handler) => void routes.push(checkRoute(method, pattern, handler)),
    auth: createAuth(deps.evccUrl),
    http: { readJson: readJsonBody, sendJson },
    httpError: (status, code, message) => new ServerAddonError(status, code, message),
  };
  return { api, routes, emitSettings: settings.emit };
}

/** Prüft die Route; ohne Flags `g`/`y`, damit `exec` keinen Zustand behält */
function checkRoute(method: unknown, pattern: unknown, handler: unknown): ServerRoute {
  if (typeof method !== "string" || !METHODS.includes(method)) {
    throw new Error(`route: ungültige Methode ${String(method)} (erlaubt: ${METHODS.join(", ")})`);
  }
  if (!(pattern instanceof RegExp)) throw new Error("route: pattern muss ein RegExp sein");
  if (typeof handler !== "function") throw new Error("route: handler muss eine Funktion sein");
  return {
    method: method as ServerHttpMethod,
    pattern: new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, "")),
    handler: handler as ServerHandler,
  };
}

function createAuth(evccUrl: string): ServerAuth {
  return {
    check: async (req) => (await checkAdmin(req, evccUrl)).ok,
    require: (req) => requireAdmin(req, evccUrl),
  };
}

function createSettings(initial: SettingValues, logger: Logger) {
  let values: SettingValues = { ...initial };
  const listeners = new Set<(values: SettingValues) => void>();
  const api: ServerSettings = {
    get: (key) => (Object.hasOwn(values, key) ? values[key] : undefined),
    all: () => ({ ...values }),
    onChange: (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
  const emit = (next: SettingValues) => {
    values = { ...next };
    for (const cb of [...listeners]) notify(cb, values, logger);
  };
  return { api, emit };
}

/** Ein fehlerhafter Listener (auch async) betrifft weder andere Listener noch den Proxy */
function notify(cb: (values: SettingValues) => void, values: SettingValues, logger: Logger): void {
  const fail = (err: unknown) =>
    logger.warn("server addon settings listener failed", { error: errorMessage(err) });
  try {
    const result: unknown = cb({ ...values });
    if (result instanceof Promise) result.catch(fail);
  } catch (err) {
    fail(err);
  }
}
