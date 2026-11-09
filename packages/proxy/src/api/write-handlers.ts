// Schreibende Endpunkte (nur für angemeldete evcc-Admins) und Sitzungsstatus
import type { IncomingMessage, ServerResponse } from "node:http";
import { AddonError } from "../addons/errors.js";
import { readBody, readJsonBody } from "../http/body.js";
import { sendJson } from "../http/json.js";
import { isRecord } from "../util.js";
import { checkAdmin, requireAdmin } from "./auth.js";
import type { ApiContext, Route } from "./context.js";
import { toAddonDto } from "./read-handlers.js";

const ZIP_TYPES = ["application/zip", "application/octet-stream", "application/x-zip-compressed"];
const JSON_BODY_LIMIT = 4096;

async function session(req: IncomingMessage, res: ServerResponse, ctx: ApiContext) {
  const result = await checkAdmin(req, ctx.config.evccUrl);
  sendJson(res, 200, { canManage: result.ok, reason: result.ok ? null : result.code });
}

async function install(req: IncomingMessage, res: ServerResponse, ctx: ApiContext) {
  await requireAdmin(req, ctx.config.evccUrl);
  const type = String(req.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ZIP_TYPES.includes(type)) {
    throw new AddonError("unsupported-media-type", "Erwartet eine ZIP-Datei (application/zip)");
  }
  try {
    const { addon, previousVersion } = await ctx.store.install(
      await readBody(req, ctx.config.maxUploadBytes),
    );
    const { id, version } = addon.manifest;
    ctx.logger.info("addon installed", { id, version, previous: previousVersion ?? undefined });
    await ctx.serverAddons.sync(id);
    sendJson(res, 201, { addon: toAddonDto(addon, ctx.status), previousVersion });
  } catch (err) {
    if (err instanceof AddonError) {
      ctx.logger.warn("addon install rejected", { code: err.code, ...err.details });
    }
    throw err;
  }
}

async function toggle(req: IncomingMessage, res: ServerResponse, ctx: ApiContext, [id]: string[]) {
  await requireAdmin(req, ctx.config.evccUrl);
  const body = await readJsonBody(req, JSON_BODY_LIMIT);
  if (!isRecord(body) || typeof body.enabled !== "boolean") {
    throw new AddonError("body-invalid", "Erwartet { enabled: boolean }");
  }
  const addon = await ctx.store.setEnabled(id, body.enabled);
  ctx.logger.info("addon toggled", { id, enabled: body.enabled });
  await ctx.serverAddons.sync(id);
  sendJson(res, 200, toAddonDto(addon, ctx.status));
}

async function saveSettings(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  [id]: string[],
) {
  await requireAdmin(req, ctx.config.evccUrl);
  const body = await readJsonBody(req, JSON_BODY_LIMIT);
  if (!isRecord(body) || !isRecord(body.values)) {
    throw new AddonError("body-invalid", "Erwartet { values: { … } }");
  }
  const addon = await ctx.store.setSettings(id, body.values);
  ctx.logger.info("addon settings saved", { id, keys: Object.keys(body.values).join(",") });
  ctx.serverAddons.settingsChanged(id, addon.settings);
  sendJson(res, 200, toAddonDto(addon, ctx.status));
}

async function uninstall(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  [id]: string[],
) {
  await requireAdmin(req, ctx.config.evccUrl);
  // Erst stoppen, damit der Server-Teil nicht mehr in seinen Datenordner schreibt
  await ctx.serverAddons.stop(id);
  await ctx.store.remove(id);
  ctx.logger.info("addon removed", { id });
  res.writeHead(204).end();
}

export const writeRoutes: Route[] = [
  { method: "GET", pattern: /^\/addons-api\/session$/, handler: session },
  { method: "PUT", pattern: /^\/addons-api\/addons$/, handler: install },
  { method: "PATCH", pattern: /^\/addons-api\/addons\/([^/]+)$/, handler: toggle },
  {
    method: "PATCH",
    pattern: /^\/addons-api\/addons\/([^/]+)\/settings$/,
    handler: saveSettings,
  },
  { method: "DELETE", pattern: /^\/addons-api\/addons\/([^/]+)$/, handler: uninstall },
];
