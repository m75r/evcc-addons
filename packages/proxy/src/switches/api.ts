// Endpunkte der Steckdosen: Verwaltung (Admin) und Gateway für evcc (Token in der URL)
import type { IncomingMessage, ServerResponse } from "node:http";
import { AddonError } from "../addons/errors.js";
import { checkAdmin, requireAdmin } from "../api/auth.js";
import type { ApiContext, Route } from "../api/context.js";
import { readJsonBody } from "../http/body.js";
import { sendJson } from "../http/json.js";
import { errorMessage } from "../util.js";
import type { SwitchController } from "./controller.js";

const JSON_BODY_LIMIT = 4096;

/** Ohne Admin-Login nur Name, Status und Ladepunkt; das Passwort verlässt den Proxy nie */
export function toSwitchDto(controller: SwitchController, admin: boolean, titles: string[] | null) {
  const { id, name, type, loadpoint, host, user, token } = controller.config;
  const base = {
    id,
    name,
    type,
    loadpoint,
    loadpointFound: titles ? titles.includes(loadpoint) : null,
    status: { ...controller.status },
  };
  return admin ? { ...base, host, user, token } : base;
}

/** Titel der evcc-Ladepunkte; ist evcc nicht erreichbar, bleibt `loadpointFound` null */
async function loadpointTitles(ctx: ApiContext): Promise<string[] | null> {
  try {
    return await ctx.switches.evcc.loadpointTitles();
  } catch (err) {
    ctx.logger.debug("loadpoint titles unavailable", { error: errorMessage(err) });
    return null;
  }
}

async function list(req: IncomingMessage, res: ServerResponse, ctx: ApiContext) {
  const [auth, titles] = await Promise.all([
    checkAdmin(req, ctx.config.evccUrl),
    loadpointTitles(ctx),
  ]);
  const switches = ctx.switches.list().map((entry) => toSwitchDto(entry, auth.ok, titles));
  sendJson(res, 200, { switches });
}

async function create(req: IncomingMessage, res: ServerResponse, ctx: ApiContext) {
  await requireAdmin(req, ctx.config.evccUrl);
  const controller = await ctx.switches.create(await readJsonBody(req, JSON_BODY_LIMIT));
  sendJson(res, 201, toSwitchDto(controller, true, await loadpointTitles(ctx)));
}

async function update(req: IncomingMessage, res: ServerResponse, ctx: ApiContext, [id]: string[]) {
  await requireAdmin(req, ctx.config.evccUrl);
  const body = await readJsonBody(req, JSON_BODY_LIMIT);
  const controller = await ctx.switches.update(id, body);
  sendJson(res, 200, toSwitchDto(controller, true, await loadpointTitles(ctx)));
}

async function remove(req: IncomingMessage, res: ServerResponse, ctx: ApiContext, [id]: string[]) {
  await requireAdmin(req, ctx.config.evccUrl);
  await ctx.switches.remove(id);
  res.writeHead(204).end();
}

async function renewToken(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  [id]: string[],
) {
  await requireAdmin(req, ctx.config.evccUrl);
  const controller = await ctx.switches.renewToken(id);
  sendJson(res, 200, { token: controller.config.token });
}

/** Unbekannte ID und falscher Token ergeben dieselbe Antwort */
function gatewayController(ctx: ApiContext, id: string, token: string): SwitchController {
  const controller = ctx.switches.findByToken(id, token);
  if (!controller) throw new AddonError("not-found", "Unbekannte Steckdose");
  return controller;
}

async function deviceCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw new AddonError("device-error", errorMessage(err));
  }
}

async function gatewayState(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  [id, token]: string[],
) {
  const controller = gatewayController(ctx, id, token);
  const state = await deviceCall(() => controller.read());
  sendJson(res, 200, { on: state.on, power: state.power });
}

async function gatewaySet(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  [id, token]: string[],
) {
  const controller = gatewayController(ctx, id, token);
  const on = parseOn(req.url);
  const result = await deviceCall(() => controller.command(on));
  sendJson(res, 200, { on: result.on });
}

function parseOn(url: string | undefined): boolean {
  const value = new URL(url ?? "/", "http://localhost").searchParams.get("on");
  if (value === "true") return true;
  if (value === "false") return false;
  throw new AddonError("body-invalid", `Erwartet ?on=true oder ?on=false, erhalten: ${value}`);
}

export const switchRoutes: Route[] = [
  { method: "GET", pattern: /^\/addons-api\/switches$/, handler: list },
  { method: "POST", pattern: /^\/addons-api\/switches$/, handler: create },
  { method: "PATCH", pattern: /^\/addons-api\/switches\/([^/]+)$/, handler: update },
  { method: "DELETE", pattern: /^\/addons-api\/switches\/([^/]+)$/, handler: remove },
  { method: "POST", pattern: /^\/addons-api\/switches\/([^/]+)\/token$/, handler: renewToken },
  {
    method: "GET",
    pattern: /^\/addons-api\/switches\/([^/]+)\/([^/]+)\/state$/,
    handler: gatewayState,
  },
  {
    method: "POST",
    pattern: /^\/addons-api\/switches\/([^/]+)\/([^/]+)\/set$/,
    handler: gatewaySet,
  },
];
