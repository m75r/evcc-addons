// Endpunkte unter /addons-api/ext/switches-tapo: Verwaltung (Admin) und Gateway für evcc (Token in der URL)
import type { ServerApi, ServerHandler, ServerHttpMethod } from "@evcc-addons/sdk/server";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SwitchController } from "./controller.js";
import { SwitchInputError, SwitchNotFoundError, SwitchTargetError } from "./errors.js";
import type { SwitchManager } from "./manager.js";
import type { TargetKind } from "./model.js";
import { errorMessage, isRecord } from "./util.js";

const JSON_BODY_LIMIT = 4096;

interface Ctx {
  server: ServerApi;
  manager: SwitchManager;
}

type Handler = (ctx: Ctx, req: IncomingMessage, res: ServerResponse, params: string[]) => unknown;

/** Titel je Art von evcc; null, wenn evcc nicht erreichbar war */
type Titles = Record<TargetKind, string[] | null>;

/** Ohne Admin-Login nur Name, Status und Bindung; das Passwort verlässt den Proxy nie */
export function toSwitchDto(controller: SwitchController, admin: boolean, titles: Titles) {
  const { id, name, type, target, host, user, token } = controller.config;
  const known = titles[target.kind];
  const base = {
    id,
    name,
    type,
    target: { ...target },
    /** Titel genau einmal in evcc vorhanden */
    targetFound: known ? known.filter((title) => title === target.title).length === 1 : null,
    status: { ...controller.status },
  };
  return admin ? { ...base, host, user, token } : base;
}

async function titlesOf(ctx: Ctx, kind: TargetKind): Promise<string[] | null> {
  try {
    const { evcc } = ctx.manager;
    return await (kind === "loadpoint" ? evcc.loadpointTitles() : evcc.consumerTitles());
  } catch (err) {
    ctx.server.logger.debug("evcc titles unavailable", { kind, error: errorMessage(err) });
    return null;
  }
}

/** Titel von Ladepunkten und Verbrauchern parallel; Fehler ergeben `targetFound: null` */
async function loadTitles(ctx: Ctx): Promise<Titles> {
  const [loadpoint, consumer] = await Promise.all([
    titlesOf(ctx, "loadpoint"),
    titlesOf(ctx, "consumer"),
  ]);
  return { loadpoint, consumer };
}

async function list(ctx: Ctx, req: IncomingMessage, res: ServerResponse) {
  const [admin, titles] = await Promise.all([ctx.server.auth.check(req), loadTitles(ctx)]);
  const switches = ctx.manager.list().map((entry) => toSwitchDto(entry, admin, titles));
  ctx.server.http.sendJson(res, 200, { switches });
}

async function create(ctx: Ctx, req: IncomingMessage, res: ServerResponse) {
  await ctx.server.auth.require(req);
  const controller = await ctx.manager.create(await ctx.server.http.readJson(req, JSON_BODY_LIMIT));
  ctx.server.http.sendJson(res, 201, toSwitchDto(controller, true, await loadTitles(ctx)));
}

async function update(ctx: Ctx, req: IncomingMessage, res: ServerResponse, [id]: string[]) {
  await ctx.server.auth.require(req);
  const body = await ctx.server.http.readJson(req, JSON_BODY_LIMIT);
  const controller = await ctx.manager.update(id, body);
  ctx.server.http.sendJson(res, 200, toSwitchDto(controller, true, await loadTitles(ctx)));
}

async function remove(ctx: Ctx, req: IncomingMessage, res: ServerResponse, [id]: string[]) {
  await ctx.server.auth.require(req);
  await ctx.manager.remove(id);
  res.writeHead(204).end();
}

async function renewToken(ctx: Ctx, req: IncomingMessage, res: ServerResponse, [id]: string[]) {
  await ctx.server.auth.require(req);
  const controller = await ctx.manager.renewToken(id);
  ctx.server.http.sendJson(res, 200, { token: controller.config.token });
}

/** ⏻ in consumers ohne Login, wie die Modus-Buttons von evcc; nur Verbraucher-Bindung */
async function power(ctx: Ctx, req: IncomingMessage, res: ServerResponse, [id]: string[]) {
  const body = await ctx.server.http.readJson(req, JSON_BODY_LIMIT);
  if (!isRecord(body) || typeof body.on !== "boolean") {
    throw ctx.server.httpError(400, "body-invalid", "Erwartet { on: boolean }");
  }
  const on = body.on;
  await deviceCall(ctx, () => ctx.manager.power(id, on));
  ctx.server.http.sendJson(res, 200, { on });
}

/** Unbekannte ID und falscher Token ergeben dieselbe Antwort */
function gatewayController({ server, manager }: Ctx, id: string, token: string) {
  const controller = manager.findByToken(id, token);
  if (!controller) throw server.httpError(404, "not-found", "Unbekannte Steckdose");
  return controller;
}

/** Fehler des Geräts → 502; eigene Fehler (unbekannt, falsche Bindung) bleiben erhalten */
async function deviceCall<T>({ server }: Ctx, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof SwitchNotFoundError || err instanceof SwitchTargetError) throw err;
    throw server.httpError(502, "device-error", errorMessage(err));
  }
}

async function gatewayState(
  ctx: Ctx,
  _req: IncomingMessage,
  res: ServerResponse,
  params: string[],
) {
  const controller = gatewayController(ctx, params[0], params[1]);
  const state = await deviceCall(ctx, () => controller.read());
  ctx.server.http.sendJson(res, 200, { on: state.on, power: state.power });
}

async function gatewaySet(ctx: Ctx, req: IncomingMessage, res: ServerResponse, params: string[]) {
  const controller = gatewayController(ctx, params[0], params[1]);
  const on = parseOn(ctx, req.url);
  const result = await deviceCall(ctx, () => controller.command(on));
  ctx.server.http.sendJson(res, 200, { on: result.on });
}

function parseOn({ server }: Ctx, url: string | undefined): boolean {
  const value = new URL(url ?? "/", "http://localhost").searchParams.get("on");
  if (value === "true") return true;
  if (value === "false") return false;
  throw server.httpError(
    400,
    "body-invalid",
    `Erwartet ?on=true oder ?on=false, erhalten: ${value}`,
  );
}

/** Eigene Fehler → HTTP-Fehler der Plattform; alle anderen gehen unverändert weiter */
function toHttpError(server: ServerApi, err: unknown): unknown {
  if (err instanceof SwitchInputError) return server.httpError(400, "switch-invalid", err.message);
  if (err instanceof SwitchNotFoundError) return server.httpError(404, "not-found", err.message);
  if (err instanceof SwitchTargetError) {
    return server.httpError(409, "target-not-consumer", err.message);
  }
  return err;
}

function bind(ctx: Ctx, handler: Handler): ServerHandler {
  return async (req, res, params) => {
    try {
      await handler(ctx, req, res, params);
    } catch (err) {
      throw toHttpError(ctx.server, err);
    }
  };
}

const ROUTES: [ServerHttpMethod, RegExp, Handler][] = [
  ["GET", /^\/$/, list],
  ["POST", /^\/$/, create],
  ["PATCH", /^\/([^/]+)$/, update],
  ["DELETE", /^\/([^/]+)$/, remove],
  ["POST", /^\/([^/]+)\/token$/, renewToken],
  ["POST", /^\/([^/]+)\/power$/, power],
  ["GET", /^\/([^/]+)\/([^/]+)\/state$/, gatewayState],
  ["POST", /^\/([^/]+)\/([^/]+)\/set$/, gatewaySet],
];

export function registerRoutes(server: ServerApi, manager: SwitchManager): void {
  const ctx: Ctx = { server, manager };
  for (const [method, pattern, handler] of ROUTES) {
    server.route(method, pattern, bind(ctx, handler));
  }
}
