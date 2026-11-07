// Lesende Endpunkte: Health, Addon-Liste, Statusmeldungen des Loaders
import type { IncomingMessage, ServerResponse } from "node:http";
import { AddonError } from "../addons/errors.js";
import type { InstalledAddon } from "../addons/store.js";
import type { StatusRegistry } from "../addons/status.js";
import { readJsonBody } from "../http/body.js";
import { sendJson } from "../http/json.js";
import { isRecord } from "../util.js";
import { VERSION } from "../version.js";
import type { ApiContext, Route } from "./context.js";

const STATUS_BODY_LIMIT = 4096;

export function toAddonDto(addon: InstalledAddon, status: StatusRegistry) {
  const { id, name, version, description, entry } = addon.manifest;
  return {
    id,
    name,
    version,
    description: description ?? null,
    entry,
    enabled: addon.enabled,
    error: status.get(id),
    settings: addon.manifest.settings ?? [],
    settingValues: addon.settings,
  };
}

export type AddonDto = ReturnType<typeof toAddonDto>;

function health(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { status: "ok", version: VERSION });
}

async function list(_req: IncomingMessage, res: ServerResponse, ctx: ApiContext): Promise<void> {
  const addons = await ctx.store.list();
  sendJson(
    res,
    200,
    addons.map((addon) => toAddonDto(addon, ctx.status)),
  );
}

async function reportStatus(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  [id]: string[],
): Promise<void> {
  const body = await readJsonBody(req, STATUS_BODY_LIMIT);
  if (!isRecord(body) || typeof body.ok !== "boolean") {
    throw new AddonError("body-invalid", "Erwartet { ok: boolean, message?: string }");
  }
  await ctx.store.get(id);
  const message = typeof body.message === "string" ? body.message : undefined;
  ctx.status.report(id, { ok: body.ok, message });
  if (!body.ok) ctx.logger.warn("addon failed to start", { id, error: ctx.status.get(id) });
  res.writeHead(204).end();
}

export const readRoutes: Route[] = [
  { method: "GET", pattern: /^\/addons-api\/health$/, handler: health },
  { method: "GET", pattern: /^\/addons-api\/addons$/, handler: list },
  { method: "POST", pattern: /^\/addons-api\/addons\/([^/]+)\/status$/, handler: reportStatus },
];
