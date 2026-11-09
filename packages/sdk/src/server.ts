// Typen für den Server-Teil eines Addons (apiVersion 2), geladen im Prozess des Proxys
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SettingValue, SettingValues } from "./index.js";

/** Zusätzliche Felder einer Logzeile (logfmt) */
export type ServerLogFields = Record<string, string | number | boolean | null | undefined>;

/** Logger des Proxys; jede Zeile trägt das Feld `addon=<id>` */
export interface ServerLogger {
  debug(msg: string, fields?: ServerLogFields): void;
  info(msg: string, fields?: ServerLogFields): void;
  warn(msg: string, fields?: ServerLogFields): void;
  error(msg: string, fields?: ServerLogFields): void;
}

/** Einstellungen des Addons; `onChange` meldet gespeicherte Änderungen ohne Neustart */
export interface ServerSettings {
  get(key: string): SettingValue | undefined;
  all(): SettingValues;
  /** Gibt die Abmeldefunktion zurück */
  onChange(cb: (values: SettingValues) => void): () => void;
}

/** Handler einer Route; `params` sind die (dekodierten) Gruppen des Patterns */
export type ServerHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: string[],
) => Promise<void> | void;

export type ServerHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Prüfung des evcc-Admin-Logins der Anfrage */
export interface ServerAuth {
  /** true, wenn ein evcc-Admin angemeldet ist */
  check(req: IncomingMessage): Promise<boolean>;
  /** Wirft einen HTTP-Fehler (401/403/502), wenn kein Admin angemeldet ist */
  require(req: IncomingMessage): Promise<void>;
}

/** Ohne `this`, darf also destrukturiert werden: `const { sendJson } = server.http` */
export interface ServerHttp {
  /** Liest einen JSON-Body bis `limit` Bytes, sonst 413 bzw. 400 */
  readJson: (req: IncomingMessage, limit: number) => Promise<unknown>;
  sendJson: (res: ServerResponse, status: number, body: unknown) => void;
}

/** API, die `activateServer` erhält */
export interface ServerApi {
  id: string;
  version: string;
  /** Eigener Datenordner `<dataDir>/addon-data/<id>/` (0700), bleibt beim Update erhalten */
  dataDir: string;
  /** Basis-URL von evcc ohne abschließenden Schrägstrich */
  evccUrl: string;
  logger: ServerLogger;
  settings: ServerSettings;
  /** Route unter `/addons-api/ext/<id>`; das Pattern prüft den Sub-Pfad, z. B. `/^\/([^/]+)$/` */
  route(method: ServerHttpMethod, pattern: RegExp, handler: ServerHandler): void;
  auth: ServerAuth;
  http: ServerHttp;
  /** Fehler, den die Plattform als `{ error: { code, message } }` mit `status` beantwortet */
  httpError(status: number, code: string, message: string): Error;
}

/** Optionale Rückgabe von `activateServer`: `stop` läuft beim Deaktivieren, Update und Beenden */
export interface ServerAddonHandle {
  stop(): void | Promise<void>;
}

/** Signatur des Exports `activateServer` von `server.mjs` */
export type ServerActivateFn = (
  server: ServerApi,
) => void | ServerAddonHandle | Promise<void | ServerAddonHandle>;
