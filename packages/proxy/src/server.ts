// HTTP-Server des Proxys: Routing der eigenen Präfixe, alles andere geht an evcc
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AddonError } from "./addons/errors.js";
import { migrateLegacySwitches } from "./addons/legacy-migration.js";
import { ServerAddonHost } from "./addons/server-host.js";
import { StatusRegistry } from "./addons/status.js";
import { AddonStore } from "./addons/store.js";
import type { ApiContext } from "./api/context.js";
import { extRoutes } from "./api/ext-routes.js";
import { readRoutes } from "./api/read-handlers.js";
import { writeRoutes } from "./api/write-handlers.js";
import { createApiRouter, type ApiRouter } from "./api/router.js";
import { catalogRoutes } from "./catalog/api.js";
import { CatalogSource } from "./catalog/source.js";
import type { ProxyConfig } from "./config.js";
import { sendError } from "./http/json.js";
import { redactPath } from "./http/redact.js";
import type { Logger } from "./logger.js";
import { forwardRequest } from "./proxy/forward.js";
import { injectLoader, isIndexRequest, loaderTag } from "./proxy/inject.js";
import { UpgradeTracker, forwardUpgrade } from "./proxy/websocket.js";
import { serveFile } from "./static/files.js";
import { errorMessage } from "./util.js";
import { VERSION } from "./version.js";

export interface ProxyDeps {
  logger: Logger;
  status?: StatusRegistry;
  store?: AddonStore;
  catalog?: CatalogSource;
}

export interface ProxyServer {
  server: http.Server;
  store: AddonStore;
  status: StatusRegistry;
  serverAddons: ServerAddonHost;
  listen(): Promise<AddressInfo>;
  stop(): Promise<void>;
}

const CORE_PREFIX = "/addons-static/_core/";
const STATIC_PREFIX = "/addons-static/";
const API_PREFIX = "/addons-api/";

export function createProxyServer(config: ProxyConfig, deps: ProxyDeps): ProxyServer {
  const target = new URL(config.evccUrl);
  const tracker = new UpgradeTracker();
  const api = createApiContext(config, deps);
  const ctx: RequestContext = {
    config,
    logger: deps.logger,
    target,
    api,
    router: createApiRouter([...readRoutes, ...writeRoutes, ...catalogRoutes, ...extRoutes], api),
  };
  const server = http.createServer((req, res) => {
    logRequest(req, res, deps.logger);
    handleRequest(req, res, ctx).catch((err: unknown) =>
      handleFailure(res, err, deps.logger, req.url),
    );
  });
  server.on("upgrade", (req: IncomingMessage, socket, head: Buffer) =>
    forwardUpgrade(req, socket, head, target, { logger: deps.logger, tracker }),
  );
  return {
    server,
    store: api.store,
    status: api.status,
    serverAddons: api.serverAddons,
    listen: () => listen(server, config, api),
    stop: () => stop(server, tracker, api),
  };
}

interface RequestContext {
  config: ProxyConfig;
  logger: Logger;
  target: URL;
  api: ApiContext;
  router: ApiRouter;
}

function createApiContext(config: ProxyConfig, deps: ProxyDeps): ApiContext {
  const status = deps.status ?? new StatusRegistry();
  const limits = { maxBytes: config.maxUploadBytes };
  const store =
    deps.store ?? new AddonStore({ dataDir: config.dataDir, logger: deps.logger, status, limits });
  const serverAddons = new ServerAddonHost({
    store,
    status,
    logger: deps.logger,
    dataDir: config.dataDir,
    evccUrl: config.evccUrl,
  });
  const catalog =
    deps.catalog ?? new CatalogSource({ url: config.catalogUrl, logger: deps.logger });
  return { config, store, status, logger: deps.logger, serverAddons, catalog };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, ctx: RequestContext) {
  const path = (req.url ?? "/").split("?")[0];
  if (path.startsWith(CORE_PREFIX)) {
    const rel = path.slice(CORE_PREFIX.length);
    return serveFile(req, res, ctx.config.publicDir, rel, ctx.logger);
  }
  if (path.startsWith(STATIC_PREFIX)) return serveAddonFile(req, res, ctx, path);
  if (path.startsWith(API_PREFIX) || path === "/addons-api") return ctx.router(req, res, path);
  const transformHtml = isIndexRequest(req) ? indexTransformer(ctx.logger, path) : undefined;
  forwardRequest(req, res, ctx.target, { logger: ctx.logger, transformHtml });
}

/** /addons-static/<id>/<pfad> nur für installierte Addons */
async function serveAddonFile(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RequestContext,
  path: string,
): Promise<void> {
  const [id, ...rest] = path.slice(STATIC_PREFIX.length).split("/");
  try {
    await ctx.api.store.get(id);
  } catch (err) {
    if (err instanceof AddonError && err.code === "not-found") {
      return sendError(res, 404, "not-found", `Addon ${id} ist nicht installiert`);
    }
    throw err;
  }
  return serveFile(req, res, ctx.api.store.dirOf(id), rest.join("/"), ctx.logger);
}

function indexTransformer(logger: Logger, path: string): (html: string) => string {
  const tag = loaderTag(VERSION);
  return (html) => {
    const result = injectLoader(html, tag);
    if (!result.injected)
      logger.warn("loader not injected", { reason: "no </head> or </body>", path });
    return result.html;
  };
}

function handleFailure(res: ServerResponse, err: unknown, logger: Logger, path?: string): void {
  logger.error("request failed", { path: redactPath(path), error: errorMessage(err) });
  if (res.headersSent) {
    res.destroy();
    return;
  }
  sendError(res, 500, "internal", "Interner Fehler im Addon-Proxy");
}

function logRequest(req: IncomingMessage, res: ServerResponse, logger: Logger): void {
  if (!logger.isDebug) return;
  const start = Date.now();
  res.on("finish", () =>
    logger.debug("request", {
      method: req.method,
      path: redactPath(req.url),
      status: res.statusCode,
      ms: Date.now() - start,
    }),
  );
}

/** Übernimmt einmalig Daten aus 1.x, startet die Server-Addons, dann den HTTP-Server */
async function listen(
  server: http.Server,
  config: ProxyConfig,
  api: ApiContext,
): Promise<AddressInfo> {
  await migrateLegacySwitches(config.dataDir, api.logger);
  await api.serverAddons.startAll();
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(config.listen.port, config.listen.host, () => {
      server.off("error", reject);
      resolvePromise(server.address() as AddressInfo);
    });
  });
}

async function stop(server: http.Server, tracker: UpgradeTracker, api: ApiContext): Promise<void> {
  await api.serverAddons.stopAll();
  tracker.destroyAll();
  if (!server.listening) return Promise.resolve();
  return new Promise((resolvePromise, reject) => {
    server.close((err) => (err ? reject(err) : resolvePromise()));
    server.closeAllConnections();
  });
}
