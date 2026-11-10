// Endpunkte des Katalogs (nur für angemeldete evcc-Admins)
import type { IncomingMessage, ServerResponse } from "node:http";
import { AddonError } from "../addons/errors.js";
import { requireAdmin } from "../api/auth.js";
import type { ApiContext, Route } from "../api/context.js";
import { respondInstalled } from "../api/write-handlers.js";
import { sendJson } from "../http/json.js";
import { installFromCatalog } from "./install.js";
import { toCatalogDto } from "./status.js";

async function list(req: IncomingMessage, res: ServerResponse, ctx: ApiContext): Promise<void> {
  await requireAdmin(req, ctx.config.evccUrl);
  const [entries, installed] = await Promise.all([ctx.catalog.entries(), ctx.store.list()]);
  const versions = new Map(installed.map(({ manifest }) => [manifest.id, manifest.version]));
  sendJson(
    res,
    200,
    entries.map((entry) => toCatalogDto(entry, versions.get(entry.id))),
  );
}

async function install(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  [id]: string[],
): Promise<void> {
  await requireAdmin(req, ctx.config.evccUrl);
  try {
    const result = await installFromCatalog(ctx, id);
    await respondInstalled(res, ctx, result, { source: "catalog" });
  } catch (err) {
    if (err instanceof AddonError) {
      const fields = { code: err.code, ...err.details, id, source: "catalog" };
      ctx.logger.warn("addon install rejected", fields);
    }
    throw err;
  }
}

export const catalogRoutes: Route[] = [
  { method: "GET", pattern: /^\/addons-api\/catalog$/, handler: list },
  { method: "POST", pattern: /^\/addons-api\/catalog\/([^/]+)\/install$/, handler: install },
];
