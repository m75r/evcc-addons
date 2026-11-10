// Endpunkte der Plattform-Aktualisierung (nur für angemeldete evcc-Admins)
import type { IncomingMessage, ServerResponse } from "node:http";
import { AddonError } from "../addons/errors.js";
import { requireAdmin } from "../api/auth.js";
import type { ApiContext, Route } from "../api/context.js";
import { readJsonBody } from "../http/body.js";
import { sendJson } from "../http/json.js";
import { isRecord } from "../util.js";
import { isUpdateAvailable, type PlatformInfo } from "./service.js";
import type { UpdateStatus } from "./update-status.js";

const BODY_LIMIT = 4096;

/** Antwort für den Browser, ohne sha256 */
export function toPlatformDto(
  info: PlatformInfo,
  canInstall: boolean,
  update: UpdateStatus | null = null,
) {
  const { release } = info;
  const latest = release && {
    version: release.version,
    publishedAt: release.publishedAt,
    notesUrl: release.notesUrl,
    downloadUrl: release.deb?.url ?? null,
  };
  return {
    current: info.current,
    latest,
    updateAvailable: isUpdateAvailable(info),
    canInstall,
    checkError: info.checkError,
    update,
  };
}

export type PlatformDto = ReturnType<typeof toPlatformDto>;

/** `?refresh=1` umgeht den Cache */
function isRefresh(req: IncomingMessage): boolean {
  return new URL(req.url ?? "/", "http://localhost").searchParams.get("refresh") === "1";
}

async function info(req: IncomingMessage, res: ServerResponse, ctx: ApiContext): Promise<void> {
  await requireAdmin(req, ctx.config.evccUrl);
  const [platform, canInstall, update] = await Promise.all([
    ctx.platform.info(isRefresh(req)),
    ctx.platform.canInstall(),
    ctx.platform.readStatus(),
  ]);
  sendJson(res, 200, toPlatformDto(platform, canInstall, update));
}

/** Body `{ version }`; der Updater lädt und prüft selbst, der Browser schickt keine URL */
async function startUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<void> {
  await requireAdmin(req, ctx.config.evccUrl);
  const body = await readJsonBody(req, BODY_LIMIT);
  if (!isRecord(body) || typeof body.version !== "string") {
    throw new AddonError("body-invalid", "Erwartet { version: string }");
  }
  try {
    sendJson(res, 202, { id: await ctx.platform.requestUpdate(body.version) });
  } catch (err) {
    if (err instanceof AddonError) {
      ctx.logger.warn("platform update rejected", { code: err.code, version: body.version });
    }
    throw err;
  }
}

export const platformRoutes: Route[] = [
  { method: "GET", pattern: /^\/addons-api\/platform$/, handler: info },
  { method: "POST", pattern: /^\/addons-api\/platform\/update$/, handler: startUpdate },
];
