// Schlanke ServerApi für Unit-Tests von Server-Addons: Routen über echtes HTTP, tmp-Datenordner
import type { SettingValues } from "../index.js";
import type { ServerApi, ServerHandler, ServerHttpMethod, ServerSettings } from "../server.js";
import { mkdtemp } from "node:fs/promises";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestLogger } from "./logfmt.js";

export { createTestLogger, formatLine, type TestLogger } from "./logfmt.js";

export interface TestServerApiOptions {
  id?: string;
  version?: string;
  /** Ergebnis von `auth.check`/`auth.require`, Standard true */
  admin?: boolean;
  settings?: SettingValues;
  /** Standard: neuer tmp-Ordner */
  dataDir?: string;
  /** Standard: eine Adresse, unter der nichts antwortet */
  evccUrl?: string;
}

export interface TestResponse {
  status: number;
  /** JSON, sonst Text; null ohne Inhalt */
  body: unknown;
  headers: Headers;
}

export interface TestServerApi {
  api: ServerApi;
  dataDir: string;
  /** logfmt-Zeilen, jede mit `addon=<id>` */
  logs: string[];
  setAdmin(admin: boolean): void;
  /** Setzt die Werte und ruft `settings.onChange` auf */
  setSettings(values: SettingValues): void;
  /** Anfrage auf einen Sub-Pfad, z. B. `request("POST", "/", { … })` */
  request(method: string, path: string, body?: unknown): Promise<TestResponse>;
  /** Beendet den HTTP-Server (nach jedem Test aufrufen) */
  close(): Promise<void>;
}

/** Fehler aus `httpError` und `auth.require`, beantwortet mit `{ error: { code, message } }` */
export class TestHttpError extends Error {
  override name = "TestHttpError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface TestRoute {
  method: string;
  pattern: RegExp;
  handler: ServerHandler;
}

interface HarnessState {
  admin: boolean;
  routes: TestRoute[];
  server: Server | null;
}

export async function createTestServerApi(opts: TestServerApiOptions = {}): Promise<TestServerApi> {
  const id = opts.id ?? "test-addon";
  const dataDir = opts.dataDir ?? (await mkdtemp(join(tmpdir(), `${id}-data-`)));
  const state: HarnessState = { admin: opts.admin ?? true, routes: [], server: null };
  const { logger, lines } = createTestLogger({ addon: id });
  const settings = createSettings(opts.settings ?? {});
  const api: ServerApi = {
    ...apiBase(id, dataDir, opts),
    logger,
    settings: settings.api,
    route: (method, pattern, handler) => void state.routes.push({ method, pattern, handler }),
    auth: createAuth(state),
  };
  return {
    api,
    dataDir,
    logs: lines,
    setAdmin: (admin) => void (state.admin = admin),
    setSettings: settings.set,
    request: (method, path, body) => request(state, method, path, body),
    close: () => close(state),
  };
}

function apiBase(id: string, dataDir: string, opts: TestServerApiOptions) {
  return {
    id,
    version: opts.version ?? "0.0.0",
    dataDir,
    evccUrl: opts.evccUrl ?? "http://127.0.0.1:9",
    http: { readJson, sendJson },
    httpError: (status: number, code: string, message: string) =>
      new TestHttpError(status, code, message),
  };
}

function createAuth(state: HarnessState): ServerApi["auth"] {
  return {
    check: (_req) => Promise.resolve(state.admin),
    require: (_req) =>
      state.admin
        ? Promise.resolve()
        : Promise.reject(
            new TestHttpError(401, "login-required", "Bitte in evcc als Admin anmelden"),
          ),
  };
}

function createSettings(initial: SettingValues) {
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
  const set = (next: SettingValues) => {
    values = { ...next };
    for (const cb of [...listeners]) cb({ ...values });
  };
  return { api, set };
}

async function request(
  state: HarnessState,
  method: string,
  path: string,
  body?: unknown,
): Promise<TestResponse> {
  const base = await ensureServer(state);
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: parseBody(text), headers: res.headers };
}

function parseBody(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function ensureServer(state: HarnessState): Promise<string> {
  if (!state.server) {
    const server = http.createServer((req, res) => void dispatch(state, req, res));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    state.server = server;
  }
  return `http://127.0.0.1:${(state.server.address() as AddressInfo).port}`;
}

function close(state: HarnessState): Promise<void> {
  const server = state.server;
  state.server = null;
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

/** Wie der Proxy: Route nach Methode und Sub-Pfad, Fehler als `{ error: { code, message } }` */
async function dispatch(state: HarnessState, req: IncomingMessage, res: ServerResponse) {
  try {
    const { route, params } = matchRoute(state.routes, req.method ?? "GET", req.url ?? "/");
    await route.handler(req, res, params);
  } catch (err) {
    if (res.headersSent) return void res.destroy();
    const known = err instanceof TestHttpError;
    const status = known ? err.status : 500;
    const code = known ? err.code : "internal";
    sendJson(res, status, { error: { code, message: (err as Error).message } });
  }
}

function matchRoute(routes: TestRoute[], method: string, url: string) {
  const subPath = url.split("?")[0] || "/";
  let pathMatched = false;
  for (const route of routes) {
    const result = route.pattern.exec(subPath);
    if (!result) continue;
    pathMatched = true;
    if (route.method !== (method as ServerHttpMethod)) continue;
    return { route, params: result.slice(1).map((param) => decode(param ?? "")) };
  }
  if (pathMatched) throw new TestHttpError(405, "method-not-allowed", `${method} nicht erlaubt`);
  throw new TestHttpError(404, "not-found", `Unbekannter Pfad ${subPath}`);
}

function decode(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit)
      throw new TestHttpError(413, "too-large", `Anfrage ist größer als ${limit} Bytes`);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (err) {
    throw new TestHttpError(400, "body-invalid", `Ungültiges JSON: ${(err as Error).message}`);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}
